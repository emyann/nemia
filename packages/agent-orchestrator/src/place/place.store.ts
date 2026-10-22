/**
 * The place a program is given (`place.ts` holds the contract): `PlaceService`, the service every caller asks, with no default, so a
 * program that asks the place and is given none does not compile; what a caller reads through it (`readRunPlace`, `askRunPlace`,
 * `openPlace`, `trialMerges`); and what an implementation that runs processes shares: the stop of a process group at a deadline
 * (`stopGroup`), and the words of an ask that was not heard (`stoppedWords`, `threwWords`).
 */
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { Context, Effect, Layer, Schedule, Schema } from 'effect';
import type { Inventory, Opened, PlaceDeclared, PlaceOutcome, PlaceRequests, PlaceVerb, Standing, Trials, Unread } from './place.ts';
import { Invalid } from '../refusal/refusal.ts';
import type { RepositoryRun } from '../record/record.ts';

const Count = Schema.NullOr(Schema.Int);

/** What `standing` answers (`Standing`), as `standing.json` keeps each answer (`standing.store.ts`). */
export const StandingSchema = Schema.Struct({
  heads: Schema.Record(Schema.String, Schema.String),
  branches: Schema.Array(
    Schema.Struct({
      branch: Schema.String,
      tip: Schema.NullOr(Schema.String),
      onBase: Schema.Literals(['yes', 'no', 'unknown']),
      pastBase: Schema.NullOr(Schema.Boolean),
      ahead: Count,
    }),
  ),
}) satisfies Schema.Schema<Standing>;

/** How long a process group, stopped at its deadline, is given to end on SIGTERM before it is killed. */
export const STOP_GRACE_MS = 2000;

/** How often a stopped group is asked whether it has ended. */
export const STOP_POLL_MS = 20;

/** Signal the process group `pgid` leads; false when it has no process left, or cannot be signalled. */
export function signalGroup(pgid: number, signal: NodeJS.Signals | 0): boolean {
  try {
    process.kill(-pgid, signal);
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether the process group `pgid` leads has no process left within `graceMs`, asked every `STOP_POLL_MS`. The grace is measured on
 * this process's monotonic clock (`performance.now()`), so a wall clock stepped forward never ends it early.
 */
function emptied(pgid: number, graceMs: number): boolean {
  const pause = new Int32Array(new SharedArrayBuffer(4));
  const until = performance.now() + graceMs;
  while (performance.now() < until) {
    if (!signalGroup(pgid, 0)) return true;
    Atomics.wait(pause, 0, 0, STOP_POLL_MS);
  }
  return !signalGroup(pgid, 0);
}

/**
 * Stop what is left of the process group `pgid` leads: SIGTERM, on which git takes its locks away; then, when a process of it is still
 * there after `graceMs` (`STOP_GRACE_MS` shipped), SIGKILL, and wait as long again for it to be gone. Returns whether it had to kill.
 * Never throws.
 */
export function stopGroup(pgid: number, graceMs: number = STOP_GRACE_MS): boolean {
  if (!signalGroup(pgid, 'SIGTERM') || emptied(pgid, graceMs)) return false;
  signalGroup(pgid, 'SIGKILL');
  emptied(pgid, graceMs);
  return true;
}

/** The most of a process's words kept in `said`. */
const SAID_LINES = 4;

/** The last lines a process wrote on stderr, joined for one line, or the empty string. */
function lastLines(stderr: string): string {
  return stderr
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-SAID_LINES)
    .join(' / ');
}

/**
 * Why a verb stopped at its deadline of `deadlineMs` gave no answer: that it was stopped, whether a process it started outlived SIGTERM
 * for `graceMs` and was `killed`, and the last lines the process running then wrote on `stderr`.
 */
export function stoppedWords(deadlineMs: number, killed: boolean, stderr: string, graceMs: number = STOP_GRACE_MS): string {
  const words = lastLines(stderr);
  const kill = killed
    ? `, and a process it started outlived SIGTERM for ${graceMs / 1000} s and was killed, so a lock it held may be left`
    : '';
  return `it gave no answer within ${deadlineMs / 1000} s, its deadline, and was stopped${kill}${words ? `: ${words}` : ''}`;
}

/** Why `verb` gave no answer when the place threw answering it: the verb, and the last lines of what was thrown, on one line. */
export const threwWords = (verb: PlaceVerb, threw: unknown): string =>
  `${verb} threw before it answered: ${lastLines(threw instanceof Error ? threw.message : String(threw))}`;

/** `verb` unread, with why and now. */
export const unreadNow = (verb: PlaceVerb, said: string): { readonly unread: Unread } => ({
  unread: { verb, said, at: new Date().toISOString() },
});

/**
 * What an ask may say beside its request, in milliseconds: another deadline than the verb's own (`PLACE_DEADLINE_MS`), and another grace
 * than `STOP_GRACE_MS` for what a command stopped at it started to end on SIGTERM before it is killed (`graceMs`), which a test shortens
 * rather than wait the shipped one out.
 */
export type AskOptions = { readonly deadlineMs?: number; readonly graceMs?: number };

/**
 * What a place answers: what it declares of itself, and its verbs, asked two ways. `ask` leaves the event loop free while the place
 * works, for a verb that may take long, as `make` may; `askNow` holds the process until it is answered. Either answers the verb's
 * outcome and never fails or throws for what the place did: its answer, its refusal in its own words, or unread. A place keeps nothing
 * between two questions.
 */
export type Place = {
  readonly declared: PlaceDeclared;
  readonly ask: <V extends PlaceVerb>(verb: V, request: PlaceRequests[V], options?: AskOptions) => Effect.Effect<PlaceOutcome<V>>;
  readonly askNow: <V extends PlaceVerb>(verb: V, request: PlaceRequests[V], options?: AskOptions) => PlaceOutcome<V>;
};

/**
 * The place a program asks: given by whoever runs the program, where it is composed — the daemon, a command, the api, a test — and by
 * nothing else. It has no default: a program that asks it and is given none does not compile.
 */
export class PlaceService extends Context.Service<PlaceService, Place>()('orchestrator/PlaceService') {
  /** `place` as the layer that gives it to a program. */
  static readonly layer = (place: Place): Layer.Layer<PlaceService> => Layer.succeed(PlaceService)(PlaceService.of(place));
}

/** A started repository run's place as `nemia rm` and `nemia prune` read it: the place, its `say`, and what its inventory read. */
export type RunPlaceRead = { readonly place: Place; readonly say: PlaceDeclared['say']; readonly inventory: Inventory };

/**
 * What `place` reads the repository run left (`inventory`): its worktrees inside `under` and its branches under `wf/<id>/`, merged or
 * not into its base branch, with the place's `say` — or the outcome that is no answer: refused, or not heard. Never an empty inventory
 * in its place.
 */
export function readRunPlace(
  run: Pick<RepositoryRun, 'id' | 'repo' | 'branch'>,
  place: Place,
  under: string,
): RunPlaceRead | Exclude<PlaceOutcome<'inventory'>, { answer: unknown }> {
  const read = place.askNow('inventory', { repo: run.repo, under, prefix: `wf/${run.id}/`, base: run.branch });
  return 'answer' in read ? { place, say: place.declared.say, inventory: read.answer } : read;
}

/**
 * `readRunPlace`'s answer, asked off the loop (`ask`): for a caller the daemon's pass must not wait on, as its sweep of finished runs
 * and `nemia prune` are.
 */
export const askRunPlace = (
  run: Pick<RepositoryRun, 'id' | 'repo' | 'branch'>,
  place: Place,
  under: string,
): Effect.Effect<RunPlaceRead | Exclude<PlaceOutcome<'inventory'>, { answer: unknown }>> =>
  place
    .ask('inventory', { repo: run.repo, under, prefix: `wf/${run.id}/`, base: run.branch })
    .pipe(Effect.map((read) => ('answer' in read ? { place, say: place.declared.say, inventory: read.answer } : read)));

/**
 * A repository run's place, opened at `nemia start` on `root`: `place` asked its `open` verb, told whether the run cuts worktrees
 * (`isolate`). Refuses (`Invalid`) an `open` that refuses, in its own words. An `open` that is not heard is no refusal: it throws a plain
 * `Error`, with why, so a queued card is tried again.
 */
export function openPlace(place: Place, root: string, isolate: boolean): Opened {
  const outcome = place.askNow('open', { root, isolate });
  if ('refused' in outcome) throw new Invalid({ message: outcome.refused });
  if ('unread' in outcome) throw new Error(`the place's open was not heard: ${outcome.unread.said}. Nothing was started: start it again`);
  return outcome.answer;
}

/**
 * Whether each `{ onto, branch }` of `trials` merges in `repo`, as `place` answers its `trial` verb: each base's commit
 * now, and each trial in the order asked. Asks nothing for no trial. A refusal, an unread outcome, or an answer with another count of
 * trials than asked is never a verdict: every trial is then `{ unknown }` in words that say why, and every base's commit null.
 */
export function trialMerges(repo: string, trials: readonly { readonly onto: string; readonly branch: string }[], place: Place): Trials {
  if (!trials.length) return { at: {}, trials: [] };
  const outcome = place.askNow('trial', { repo, trials });
  if ('answer' in outcome && outcome.answer.trials.length === trials.length) return outcome.answer;
  const unknown =
    'refused' in outcome
      ? outcome.refused
      : 'unread' in outcome
        ? `the trial merge was not heard: ${outcome.unread.said}`
        : `the place answered ${outcome.answer.trials.length} trial${outcome.answer.trials.length === 1 ? '' : 's'} for the ${trials.length} asked`;
  return {
    at: Object.fromEntries(trials.map((t) => [t.onto, null])),
    trials: trials.map(() => ({ unknown })),
  };
}

/** Whether the group `pgid` leads has no process left within `graceMs`, asked every `STOP_POLL_MS`. */
const emptiedLater = (pgid: number, graceMs: number): Effect.Effect<boolean> =>
  Effect.sync(() => !signalGroup(pgid, 0)).pipe(
    Effect.repeat({ until: (gone) => gone, schedule: Schedule.spaced(STOP_POLL_MS) }),
    Effect.timeoutOrElse({ duration: graceMs, orElse: () => Effect.sync(() => !signalGroup(pgid, 0)) }),
  );

/**
 * A child that has not ended stopped, with what it started: the group it leads sent SIGTERM, then SIGKILL when a process of it outlives
 * `graceMs` (`STOP_GRACE_MS` shipped), and its pipes closed. Answers whether it had to kill.
 */
export const stopChild = (child: ChildProcessWithoutNullStreams, graceMs: number = STOP_GRACE_MS): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const pgid = child.pid;
    if (pgid === undefined) return false;
    let killed = false;
    if (signalGroup(pgid, 'SIGTERM') && !(yield* emptiedLater(pgid, graceMs))) {
      signalGroup(pgid, 'SIGKILL');
      yield* emptiedLater(pgid, graceMs);
      killed = true;
    }
    child.stdout.destroy();
    child.stderr.destroy();
    return killed;
  });

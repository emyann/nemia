/**
 * The control loop. Reads both states, calls `decide`, applies ONE step, writes down what happened.
 *
 * Every judgement lives in `decide` (pure), and this file is the I/O that carries it out: an `if` that judges belongs in
 * `decide`, which is the line that keeps this engine small.
 */
import { Context, Effect, Schema } from 'effect';
import {
  admissionOf,
  decide,
  fold,
  nameFor,
  idleOf,
  needsHuman,
  respawning,
  settledQuiet,
  sightingFacts,
  spawnRefused,
  turnOf,
  waitsForInput,
  type Action,
  type Bridge,
  type Event,
  type Now,
  type SessionAsk,
  type Sighting,
  type State,
  type Usage,
} from '../domain.ts';
import type { Monotonic } from '../clock.ts';
import { atWorkState, LIVE_PHASE, type SessionState, type TaskPhase } from '../session.ts';
import { Journal } from './journal.ts';
import { bridgeOfTask, configForTurn } from '../../harness/args.ts';
import { Runner, type ExpectedSession, type Observation, type RunnerOps, type SpawnRequest } from '../../harness/seam.ts';
import { TASK_LABEL } from '../labels.ts';
import { transition, type Move, type Refusal } from '../lifecycle.ts';
import { divergence, keptIn, keptLooked, releasableOf, TickMemo, TickMemoDiverged, type Releasable, type TickMemoState } from './memo.ts';
import { CEILING_INSTEAD } from './filing.ts';
import { ownPool, toAdmit, type AdmissionRule } from '../admission.ts';
import { countedFacts } from './counted.ts';
import { deniedFacts } from './denied.ts';
import { instantNow } from './now.ts';

/**
 * The lifecycle `reconcile` moves a task by: the shipped one (`lifecycle.ts`) unless a test provides another, which is how a
 * refused edge is planted to prove the pass reports it. Exported by neither entry, as the machine is not.
 */
export const Lifecycle = Context.Reference<Move>('engine/Lifecycle', { defaultValue: () => transition });

/**
 * What the pass admits under (`AdmissionRule`): the engine's ceiling and pools, which `Engine.layer` provides from its options. By
 * default none, so a task filed `queued` waits for `admit`.
 */
export const Admission = Context.Reference<AdmissionRule>('engine/Admission', { defaultValue: () => ({ poolOf: ownPool }) });

/** How long a spawned session may go unregistered by the harness before we call it gone. */
export const GRACE_MS = 30_000;

/** The clock `decide` is handed for one task: now, on the wall clock and the monotonic one, with the grace and the unread names. */
const nowFor = (unread: ReadonlySet<string>): Now => {
  const now = instantNow();
  return { at: new Date(now.at), ...(now.mono ? { mono: now.mono } : {}), graceMs: GRACE_MS, unread };
};

/** When an entry is journalled: its `at`, and the same moment on the monotonic clock where there is one (a start, spawn, end or gap). */
const stamped = (): { at: string; mono?: Monotonic } => {
  const now = instantNow();
  return { at: new Date(now.at).toISOString(), ...(now.mono ? { mono: now.mono } : {}) };
};

/** The `spawned` entry of `attempt`, stamped now, with the error its spawn call returned when it returned one. */
const spawnedEntry = (attempt: number, error: string | undefined): Event => ({
  kind: 'spawned',
  ...stamped(),
  attempt,
  ...(error !== undefined ? { error } : {}),
});

/**
 * A live session is one the engine is still waiting on: at work or waiting on a person. `completed`, `failed`, `rejected` and `canceled`
 * are not.
 */
export const LIVE: ReadonlySet<SessionState> = new Set(['submitted', 'working', 'input-required', 'auth-required']);

/** A move the lifecycle refused in a pass: which task, and the state and event it had no edge for (`Refusal`). */
export type RefusedMove = { taskId: string } & Refusal;

/** A refused move as a person reads it, in a log or `ae tick`'s output: what did not move, and why nothing will until something changes. */
export const refusedText = (m: RefusedMove): string =>
  `${m.taskId}  stalled: its lifecycle has no edge from ${m.state} on ${m.event}, so nothing is done; it is asked again each pass`;

export type TaskView = {
  id: string;
  state: State;
  /** Where the task stands, by `viewOfState`'s rules in order: one of a closed set (`TaskPhase`), never a sentence. */
  phase: TaskPhase;
  /**
   * The harness's own state of the attempt in flight, in A2A's names, as the look saw it: beside the phase, never folded into it.
   * Absent for a task with no attempt in flight, one whose session the look did not see, and one settled.
   */
  session?: SessionState;
  /** The session as its harness lists it — or, once the harness has let it go, its own id as recorded. */
  sessionId: string | null;
  /**
   * What the attempt in flight has consumed so far, when its runner can see inside it. Settled attempts carry theirs on `state.attempts`.
   */
  usage?: Usage;
  /**
   * What the harness says the session is waiting for, in its own words, for a task whose phase is `needs-human`
   * (`Sighting.waitingFor`) — `permission prompt`, as `claude agents --json` prints it. Absent for every other
   * phase, and for a harness that says nothing: the detached harnesses (codex, claude-detached) never do.
   *
   * Off the same observation the phase was read from, so it costs no extra call, and read afresh every pass: a
   * session that stops waiting loses it on the next.
   */
  waitingFor?: string;
  /** The tool call the attempt in flight is in, and since when, as its harness sees it (`Sighting.calling`). Absent between calls. */
  calling?: { tool: string; since: string };
  /**
   * The questions the attempt in flight is waiting on a person for, as its harness holds them (`Sighting.asks`). Absent from a
   * harness that cannot say, and from a task whose session may ask nobody. Carried, never judged.
   */
  asks?: SessionAsk[];
  /** The asks of the attempt in flight whose held call took the person's answer (`Sighting.asksTaken`). Carried, never judged. */
  asksTaken?: string[];
  /**
   * Where a task filed `queued` stands with the layer above: `queued` while its current turn waits for the word to start,
   * `admitted` once given and until the next pass starts it. Beside the phase, never in it: the phase of either is `pending`
   * — or `between-attempts`, for a later turn of a task held open — as for a task that waits for no word.
   * Absent for a task not filed queued, and once its turn has started. Off the record alone.
   */
  admission?: 'queued' | 'admitted';
  /**
   * The link that opens the session in a browser or on a phone, for a task that asked its harness to bridge it there — Claude
   * Code's `claude.remoteControl` — or no link and why: not up yet, refused, or ended (`bridgeOfTask`). Absent for a task that did
   * not ask, and only then. Off the same observation as the phase, read afresh every pass: the status a Pod's spec asked for.
   */
  bridge?: Bridge;
  /**
   * Why the last attempt's session could not be read on this look, in its harness's words (`Observation.unreadWhy`), for a task not
   * settled whose session the look left unread. Absent for a settled task, a session seen, and a look that said nothing of it — the
   * full listing `view` and `everyView` read says nothing. Off the same look as the phase, rebuilt on every look and kept by none:
   * the first look that reads the session drops it. Carried, never judged.
   */
  unreadWhy?: string;
};

/**
 * The workload's closing statement, taken as the end of the attempt — when it belongs to this one.
 *
 * Everything else the engine knows about completion is inferred from outside: `state`, unreliable for long work, and
 * quiescence, which is slow to call. A harness that takes a structured final answer — Claude Code's StructuredOutput tool,
 * `codex exec --output-schema` — gives the workload a way to SAY it is finished, and the runner reports that statement here
 * as a fact with a timestamp. It lives in the session, never in the workspace, where a file would travel down a git branch
 * and the next step would start out satisfied.
 *
 * The open attempt's sighting is made `completed` only when each of these holds, asked in this order:
 *
 * 1. The statement was made after this attempt began. A RESUMED Claude Code session's transcript holds its parent's whole
 *    conversation under the child's own id, so the parent's statement arrives looking like the child's: the session id
 *    cannot tell them apart. The `--bg` runner tells them by the call's id, against the parent's last call it recorded at
 *    spawn, reports the parent's none and the session's own with no time. Where a runner could not tell — no record, a
 *    call with no id — the moment it was made can, and only the journal knows when this attempt began, which is why the
 *    check is here and not in a runner. One made before is carried over, not said: it is dropped from the sighting, so it
 *    is never recorded as this attempt's either. One with no time is the session's own: a `--bg` session's told by its
 *    call's id, a remote agent's Task, made by this attempt's message, or a detached run, whose spawn cleared the last
 *    one's statement before it launched the run.
 * 2. The harness has not answered already (`LIVE`): an ended session's statement rides along to the record and nothing
 *    more. A session listed `blocked` is live, and to `decide` it is live for ever: a step can call StructuredOutput, end its
 *    turn and be seen `blocked`, idle, next, so a statement ends a blocked attempt exactly as it ends a working one, or that
 *    attempt waits on a person until a deadline.
 * 3. The session is not still computing (`busy`): a statement it may yet revise, as a step that declares itself done, keeps
 *    going and finds it cannot commit rewrites its verdict.
 * 4. Its session is known (`nativeId`): an end recorded now would carry none, and nothing records one on an ended attempt,
 *    so an answer, or a later turn that continues the session, would have no conversation to go on. Codex writes `-o` and
 *    prints its thread on a pipe the worker reads when it is next scheduled — under load, after. The session is known a pass
 *    later, or the harness's own end brings what it printed.
 *
 * The payload is carried, never read. The engine records it on the attempt and does nothing else.
 *
 * So the engine can say a task waits before its harness has let the session go: a test asserts both sides, or waits for the Task.
 */
const endedOnStatement = (state: State, observed: ReadonlyMap<string, Sighting>): ReadonlyMap<string, Sighting> => {
  const last = state.attempts.at(-1);
  if (!last || last.ended !== null) return observed;
  const name = nameFor(state.taskId, last.n);
  const seen = observed.get(name);
  if (!seen?.closeout) return observed;
  if (seen.closeout.at !== undefined && !(seen.closeout.at > Date.parse(last.startedAt))) {
    const said: Sighting = { ...seen };
    delete said.closeout;
    return new Map(observed).set(name, said);
  }
  if (!LIVE.has(seen.state)) return observed;
  if (seen.busy) return observed;
  if (!seen.nativeId) return observed;
  return new Map(observed).set(name, { ...seen, state: 'completed' });
};

/** A `reconcile` or `settleTask` handed what it no longer takes, and why. Nothing was read or written. */
export class ReconcileRefused extends Schema.TaggedError<ReconcileRefused>()('ReconcileRefused', {
  message: Schema.String,
}) {}

/**
 * Why `reconcile` refuses what it was handed past the task and the observation, or `undefined` when it was handed nothing more:
 * a caller built against a `reconcile` that took the ceiling's `slots` third would otherwise have them dropped without a word.
 */
export const reconcileRefusalOf = (extra: readonly unknown[]): string | undefined =>
  extra.length === 0
    ? undefined
    : `reconcile takes a task and an observation, and was handed ${extra.length} more: its third argument was the ceiling's slots, and a ceiling is the engine's own now. ${CEILING_INSTEAD}`;

/**
 * Why `settleTask` refuses its `maxSteps`, or `undefined`: a count of steps is a whole number above nought, and nothing
 * follows it. A caller built against a `settleTask` that took the ceiling's `slots` third hands a `{ used, max }` in
 * `maxSteps`'s place, which compares false and would settle nothing.
 */
export const settleRefusalOf = (maxSteps: unknown, extra: readonly unknown[]): string | undefined =>
  Number.isInteger(maxSteps) && (maxSteps as number) > 0 && extra.length === 0
    ? undefined
    : // oxlint-disable-next-line typescript/no-base-to-string -- `String` is reached only once an object and a function are ruled out
      `settleTask takes a task, an observation and a number of steps above nought, and was handed ${extra.length ? `${extra.length} more` : `a maxSteps of ${typeof maxSteps === 'object' || typeof maxSteps === 'function' ? JSON.stringify(maxSteps) : String(maxSteps)}`}: its third argument was the ceiling's slots, and a ceiling is the engine's own now. ${CEILING_INSTEAD}`;

/** What one look saw of the sessions, by name: what `reconcile` and `settleTask` are handed. */
type Observed = ReadonlyMap<string, Sighting>;

/** Nothing left unread: what `reconcile` and `settleTask` decide on, handed an observation and no more. */
const ALL_READ: ReadonlySet<string> = new Set();

/**
 * One task, one step. Returns the action taken, so a caller can loop until nothing moves.
 *
 * `observed` is passed in rather than read here: one `claude agents` call serves a whole pass, which is the difference
 * between a store that scales and one that shells out per task. Typed to take two arguments, and counts them all the same:
 * a third, as an untyped caller may still pass the ceiling's slots, fails with `ReconcileRefused` (`reconcileRefusalOf`), nothing read.
 */
export const reconcile = Effect.fn('reconcile')(function* (taskId: string, observed: ReadonlyMap<string, Sighting>) {
  const refused = reconcileRefusalOf([...arguments].slice(2));
  if (refused) return yield* Effect.fail(new ReconcileRefused({ message: refused }));
  return yield* reconcileOn(taskId, observed, ALL_READ);
});

/** What the sighting `seen` an attempt ended on says of it, as its `ended` event carries it, each key written, undefined or not. */
const endFacts = (seen: Sighting | undefined) => ({
  usage: seen?.usage,
  exitCode: seen?.exitCode,
  denials: seen?.denials,
  skills: seen?.skills,
  files: seen?.files,
  ranOn: seen?.ranOn,
  limit: seen?.limit,
});

/**
 * What a harness is asked to start for attempt `n` of task `taskId`, named `name`: its brief (or the words that nudge it), folder,
 * harness and configuration for its turn, the session it continues, and the labels its telemetry says, the task's id among them.
 */
const spawnRequestOf = (taskId: string, state: State, name: string, n: number): SpawnRequest => {
  const attempt = state.attempts.find((a) => a.n === n);
  return {
    name,
    brief: attempt?.nudge ?? state.brief,
    cwd: state.cwd,
    harness: state.harness,
    config: configForTurn(state.config, turnOf(state, attempt?.turn ?? 0).config),
    closeoutSchema: state.closeoutSchema,
    ...(state.restartPolicy ? { restartPolicy: state.restartPolicy } : {}),
    resumeFrom: attempt?.resumeFrom,
    resource: { ...state.labels, [TASK_LABEL]: taskId },
    traceparent: state.traceparent,
  };
};

/**
 * `reconcile`, told which names the pass's observation could not read (`Now.unread`): the pass's own, which `reconcile`'s door does not
 * take. Folds the task's journal, asks `decide` for one action, and carries it out. The actions, in the order an attempt
 * meets them:
 *
 * 1. `start` journals `starting` — the attempt, the session it continues (`resumeFrom`) and what it is told in place of the
 *    brief (`nudge`, a later turn's answer) — and spawns nothing. The intent is journalled BEFORE the spawn, and the
 *    session's name is derived from it (`nameFor`): that ordering is the whole crash-safety story, since a session asked for
 *    always has a record, and the record implies the name, so a restart finds it instead of starting a second one. What an
 *    attempt continues and what it is told are facts on the record, never re-derived later.
 * 2. `spawn` asks the runner for the session, with what it continues and what it is told read off the journal rather than
 *    recomputed: the decision was made when the attempt was started, possibly by an engine that has since died. The harness's
 *    arguments are handed on unopened, the runner's to read (`harness/args.ts`): an answer may give its turn its own, laid
 *    over the filing's without being read (`configForTurn`), and a task never answered has the filing's. A spawn that fails
 *    is answered by what the harness can vouch for:
 *    - `refused`, nothing started: the attempt ends `failed`, `unstartable`, in the harness's words, through the lifecycle's
 *      edge for it (`spawnRefused`), and `decide` settles it like any failure. Let out as an error, it would reject the
 *      whole pass, and every task behind this one would stall on every pass. A lifecycle that has no such edge answers its
 *      refusal, and nothing is journalled.
 *    - anything else is no proof that nothing started: a launcher can create the session and lose its acknowledgement, and
 *      ending that attempt would leave a working session nothing adopts, stops or bounds. So the call is journalled as having
 *      returned — `spawned`, with its error — and the grace window `decide` keeps for a session the harness has not
 *      registered tells which it was: adopted if it shows up, `lost` if it never does.
 * 3. `stop` asks the runner to stop the session, and journals nothing: the next pass sees it stopped.
 * 4. `record-end` journals `ended`, with what the attempt consumed, how its process exited, what its harness denied it, the
 *    skills it loaded, the files it touched and the limit it says it stopped at, read off the same sighting the ending came from
 *    (`endFacts`): facts for the record, of which `decide` sees none.
 * 5. `settle` journals `settled`, with, for an attempt left open, its session's id read off the sighting as an ending's facts
 *    are: an open attempt has no `ended` to carry it, and it is what `logs` reads once the harness has let the session go —
 *    a fact `decide` never reads. `decide` ends a stopped or timed-out attempt before it settles, so only a journal an older
 *    runtime wrote settles over an open one, and the id is written for the task that journal is replayed into.
 */
const reconcileOn = Effect.fn('reconcileOn')(function* (taskId: string, observed: Observed, unread: ReadonlySet<string>) {
  const journal = yield* Journal;
  const runner = yield* Runner;

  const move = yield* Lifecycle;

  const state = yield* notedFold(taskId, observed);
  const action = decide(state, endedOnStatement(state, observed), nowFor(unread), move);
  const at = () => new Date().toISOString();

  switch (action.do) {
    case 'nothing':
      break;

    case 'start':
      yield* journal.append(taskId, {
        kind: 'starting',
        ...stamped(),
        attempt: action.attempt,
        resumeFrom: action.resumeFrom,
        nudge: action.nudge,
      });
      break;

    case 'spawn': {
      const failed = yield* runner.spawn(spawnRequestOf(taskId, state, action.name, action.attempt)).pipe(
        Effect.as(undefined),
        Effect.catchTag('RunnerError', (e) => Effect.succeed(e)),
      );
      if (failed?.refused) {
        const end = spawnRefused(state, action.attempt, failed.message, move);
        if (end.do !== 'record-end') return end;
        yield* journal.append(taskId, {
          kind: 'ended',
          ...stamped(),
          attempt: end.attempt,
          sessionId: end.sessionId,
          observed: end.observed,
          reason: end.reason,
          error: end.error,
        });
      } else {
        yield* journal.append(taskId, spawnedEntry(action.attempt, failed?.message));
      }
      break;
    }

    case 'record-end': {
      yield* journal.append(taskId, {
        kind: 'ended',
        ...stamped(),
        attempt: action.attempt,
        sessionId: action.sessionId,
        observed: action.observed,
        reason: action.reason,
        nativeId: action.nativeId,
        closeout: action.closeout,
        ...(action.closedOut !== undefined ? { closedOut: action.closedOut } : {}),
        ...endFacts(observed.get(nameFor(taskId, action.attempt))),
      });
      break;
    }

    case 'stop':
      yield* runner.stop(action.sessionId);
      break;

    case 'settle': {
      const last = state.attempts.at(-1);
      const open = last && last.ended === null ? observed.get(nameFor(taskId, last.n))?.nativeId : undefined;
      yield* journal.append(taskId, {
        kind: 'settled',
        at: at(),
        outcome: action.outcome,
        note: action.note,
        ...(open ? { nativeId: open } : {}),
      });
      break;
    }
  }

  return action;
});

/** The sighting of a task's last attempt in one observation, as the harness gave it. */
const lastSighting = (state: State, observed: ReadonlyMap<string, Sighting>): Sighting | undefined => {
  const last = state.attempts.at(-1);
  return last ? observed.get(nameFor(state.taskId, last.n)) : undefined;
};

/**
 * What a task's sighting says of an attempt in flight, for the record: a long-lived one's process (`sightingFacts`) and what it
 * has consumed so far (`countedFacts`), and what the harness has denied any (`deniedFacts`).
 */
const notedOf = (state: State, observed: ReadonlyMap<string, Sighting>, at: string, mono?: Monotonic): Event[] => {
  const sighting = lastSighting(state, observed);
  return [...sightingFacts(state, sighting, at, mono), ...countedFacts(state, sighting, at), ...deniedFacts(state, sighting, at)];
};

/**
 * A task's fold, with what its sighting says of an attempt in flight journalled first (`notedOf`): the fold `decide` reads, so
 * the time a gap opened is on the record before the pass judges it.
 */
const notedFold = Effect.fn('notedFold')(function* (taskId: string, observed: ReadonlyMap<string, Sighting>) {
  const journal = yield* Journal;
  const state = fold(taskId, yield* journal.read(taskId));
  const now = stamped();
  const facts = notedOf(state, observed, now.at, now.mono);
  for (const fact of facts) yield* journal.append(taskId, fact);
  return facts.length > 0 ? fold(taskId, yield* journal.read(taskId)) : state;
});

/** The actions that change the task's own journal: `settleOn` steps again after one, and stops at any other. */
const PROGRESSES = new Set(['start', 'spawn', 'record-end', 'settle']);

/** Whether a pass wrote to a task's journal: the facts its sighting noted first, or an action that progresses. */
const wroteAny = (noted: readonly Event[], actions: readonly Action[]): boolean =>
  noted.length > 0 || actions.some((a) => PROGRESSES.has(a.do));

/**
 * One task, stepped until nothing moves — against ONE observation — at most `maxSteps` times. Returns the actions taken.
 *
 * It stops at the first action that does not change our own journal (`PROGRESSES`), because `observed` is a snapshot:
 * `stop` asks the harness for something whose result we can only learn by looking again, so looping on it would re-send
 * the request against a state we have not re-read. The next pass sees `stopped` and settles. Assume nothing; record what
 * was observed. Refused with `ReconcileRefused`, nothing read, for a `maxSteps` that is not a whole number above nought or any
 * argument after it (`settleRefusalOf`).
 */
export const settleTask = Effect.fn('settleTask')(function* (taskId: string, observed: ReadonlyMap<string, Sighting>, maxSteps = 8) {
  const refused = settleRefusalOf(maxSteps, [...arguments].slice(3));
  if (refused) return yield* Effect.fail(new ReconcileRefused({ message: refused }));
  return yield* settleOn(taskId, observed, ALL_READ, maxSteps);
});

/** `settleTask`, told which names the pass could not read, as `reconcileOn` is. */
const settleOn = Effect.fn('settleOn')(function* (
  taskId: string,
  observed: ReadonlyMap<string, Sighting>,
  unread: ReadonlySet<string>,
  maxSteps: number,
) {
  const taken: Action[] = [];
  for (let i = 0; i < maxSteps; i++) {
    const action = yield* reconcileOn(taskId, observed, unread);
    taken.push(action);
    if (!PROGRESSES.has(action.do)) break;
  }
  return taken;
});

/** What a release the harness refused answers, in `releaseFinished`: told apart from every answer a release gives. */
const REFUSED = Symbol('refused');

/** A runner that can let a finished session go (`RunnerOps.release`). */
type Releasing = RunnerOps & Required<Pick<RunnerOps, 'release'>>;

/** Whether `runner` can let a finished session go: one without `release` keeps every session it lists. */
const releases = (runner: RunnerOps): runner is Releasing => runner.release !== undefined;

/**
 * Let the harness go of the sessions a task has finished with: every attempt whose end is on the
 * record and whose session the harness still lists. I/O applied to what the journal already says,
 * not a judgement — `decide` is not asked, and learns nothing.
 *
 * An attempt with a written end — or, in a task settled while it was open (stopped by a person, or
 * past its deadline), one whose session's id the `settled` entry recorded. A task whose `settled` entry carries no such id,
 * as an older runtime wrote it, keeps its session listed: released, `logs` would have nothing to read. The runner is
 * handed the task's harness arguments unopened: it reads there whether it cut a worktree it must keep.
 *
 * Level-triggered like the rest: asked on every pass that observes such a session while it can still move, so a crash
 * between writing an end and releasing is repaired by the next pass. A release the harness refuses is
 * not the pass's failure; it is asked again on the next pass.
 *
 * What the attempt consumed is written down here as well, when it says more than the record does (`measured`):
 * Claude Code writes a session's cost only as its process exits, which is after its end was written, so the read a
 * release takes once it has stopped the session is the first to have it — or, for a session left listed, the
 * sighting's. Written once: a session still looked for is seen again on the next pass, and that read says nothing new. It says
 * more when one of its keys has a value the record lacks — by value, never by key: `{ costUsd: undefined }` measured
 * nothing, and a journal that writes JSON drops the key, so a key asked alone would be new on every pass.
 *
 * It reads a task's settling, its config and each attempt's end, session and usage, and no more (`Releasable`): a settled
 * task a pass skips is released off what the pass's memo kept of it. Says whether it wrote a `measured`, and whether a
 * finished session of the task can still move — the memo keeps looking for one that can (`TickMemoState.listed`): one whose
 * release the harness refused, so it is asked again; one its harness lists at work, whose process runs on and may yet say
 * what it consumed; and one whose harness could not be read this pass (`unread`), released nothing: it may still be there,
 * and dropped from the memo's look on one failed read, a release the harness refused would never be asked again. A session
 * let go of and listed ended says nothing more on any pass, and is looked for no more.
 *
 * Traced only where it asks the harness (`letGo`, a span named `releaseFinished`): a task with no finished session in the
 * observation makes no span, so a pass over many settled tasks traces as much as one over few.
 */
const releaseFinished = Effect.fnUntraced(function* (
  state: Releasable,
  observed: ReadonlyMap<string, Sighting>,
  unread: ReadonlySet<string>,
) {
  const runner = yield* Runner;
  let listed = false;
  if (!releases(runner)) return { wrote: false, listed };
  const finished: Array<{ attempt: Releasable['attempts'][number]; session: Sighting }> = [];
  for (const attempt of state.attempts) {
    if (attempt.ended === null && (state.settled === null || attempt.nativeId === null)) continue;
    const name = nameFor(state.taskId, attempt.n);
    const session = observed.get(name);
    if (session) finished.push({ attempt, session });
    else if (unread.has(name)) listed = true;
  }
  if (!finished.length) return { wrote: false, listed };
  const released = yield* letGo(state, finished, runner);
  return { wrote: released.wrote, listed: listed || released.listed };
});

/**
 * Each of a task's finished sessions the harness still lists, `finished` in attempt order, let go by `runner`, and what each
 * consumed written down where it says more than the record (`releaseFinished`): traced, annotated with the task, since it asks
 * the harness. Says whether it wrote a `measured`, and whether a session can still move: its release refused, or listed at work.
 */
const letGo = Effect.fn('releaseFinished')(function* (
  state: Releasable,
  finished: ReadonlyArray<{ attempt: Releasable['attempts'][number]; session: Sighting }>,
  runner: Releasing,
) {
  yield* Effect.annotateCurrentSpan({ task: state.taskId });
  const journal = yield* Journal;
  let wrote = false;
  let listed = false;
  for (const { attempt, session } of finished) {
    const released = yield* runner.release(session, state.config ?? {}).pipe(Effect.catchTag('RunnerError', () => Effect.succeed(REFUSED)));
    if (released === REFUSED || atWorkState(session.state)) listed = true;
    const measured = typeof released === 'object' ? released : session.usage;
    if (
      measured &&
      (Object.keys(measured) as Array<keyof Usage>).some((key) => measured[key] !== undefined && attempt.usage?.[key] === undefined)
    ) {
      yield* journal.append(state.taskId, { kind: 'measured', at: new Date().toISOString(), attempt: attempt.n, usage: measured });
      wrote = true;
    }
  }
  return { wrote, listed };
});

/** A tick that was handed an argument, and why. Nothing was read or written. */
export class TickRefused extends Schema.TaggedError<TickRefused>()('TickRefused', {
  message: Schema.String,
}) {}

/**
 * Why a pass refuses what it was handed, or `undefined` when it was handed nothing: it takes nothing, and an untyped caller
 * passing a ceiling, `tick(3)`, would otherwise have it dropped without a word.
 */
export const tickRefusalOf = (args: readonly unknown[]): string | undefined =>
  args.length === 0
    ? undefined
    : `the pass takes no arguments, and was handed ${args.length}: a ceiling and its pools are the engine's own, never a pass's. ${CEILING_INSTEAD}`;

/**
 * Whether an unsettled task's session is at work as the pass left it: its last attempt open, and its harness listing it
 * `submitted` or `working` — or not yet listing it, as one started this pass is not. One waiting on a person is not.
 */
const atWork = (state: State, observed: ReadonlyMap<string, Sighting>): boolean => {
  const last = state.attempts.at(-1);
  if (!last || last.ended !== null) return false;
  const seen = observed.get(nameFor(state.taskId, last.n));
  return seen === undefined || atWorkState(seen.state);
};

/**
 * The sessions a pass expects its harnesses to list: every attempt of every task it folds, on the harness the task was filed on,
 * and of every settled task the memo keeps a finished session of which could still move on the last pass that looked.
 * A pass folds every task not settled, so every session that can still move is on it; a settled task it folds is — on an
 * engine's first pass, every one — so a session whose release a crash cut short is let go after a restart. A kept task stays on
 * it while its release is refused or its session listed at work, so a refused release is asked again on every pass, as
 * `releaseFinished` promises, and drops off on the first pass that lets it go ended or sees it gone: an absence read as every
 * absence is, off the pass's one observation — and only an absence: a pass that could not read its harness keeps it (`unread`).
 * Off the journal and the last observation, never off what a pass did: a session started before a restart is expected on the
 * first pass after it. A long-lived task's attempt is expected with when the journal says it began (`since`), which its runner
 * counts its spend from across every process of it.
 */
const expectedOf = (
  states: Iterable<Pick<State, 'taskId' | 'harness' | 'restartPolicy'> & { attempts: ReadonlyArray<{ n: number; startedAt: string }> }>,
): ExpectedSession[] => {
  const expected: ExpectedSession[] = [];
  for (const state of states) {
    for (const a of state.attempts) {
      const since = state.restartPolicy === 'Always' ? { since: Date.parse(a.startedAt) } : {};
      expected.push({ name: nameFor(state.taskId, a.n), harness: state.harness, ...since });
    }
  }
  return expected;
};

/**
 * Read the feed on from the memo's cursor, and forget every task it names: each is folded again on this pass. An entry no runtime
 * wrote is past the cursor all the same, and the task it names, when it names one, is forgotten too; returns why each was skipped.
 * A memo with no cursor yet keeps nothing to forget: its cursor is set to where the feed ends, and none of the feed is read or said.
 */
const forgetNamed = Effect.fn('forgetNamed')(function* (memo: TickMemoState) {
  const journal = yield* Journal;
  if (memo.cursor === undefined) {
    const { cursor } = yield* journal.feed(Number.MAX_SAFE_INTEGER);
    memo.cursor = cursor >= Number.MAX_SAFE_INTEGER ? 0 : cursor;
    return [];
  }
  const { entries, cursor, refused = [] } = yield* journal.feed(memo.cursor);
  for (const taskId of [...entries.map((e) => e.taskId), ...refused.flatMap((r) => r.taskId ?? [])]) {
    memo.settled.delete(taskId);
    memo.listed.delete(taskId);
  }
  memo.cursor = cursor;
  return refused.map((r) => r.why);
});

/**
 * The memo's proof, in `verify` alone: a skipped task folded all the same, and decided, as the pass would have without the
 * memo. A difference fails the pass, naming the task, rather than being mended quietly. Untraced: it runs for every kept task.
 */
const verifyKept = Effect.fnUntraced(function* (kept: Releasable, observed: ReadonlyMap<string, Sighting>, unread: ReadonlySet<string>) {
  const fresh = fold(kept.taskId, yield* (yield* Journal).read(kept.taskId));
  const decided = decide(fresh, endedOnStatement(fresh, observed), nowFor(unread), yield* Lifecycle);
  const why = divergence(kept, fresh, decided);
  if (why) return yield* Effect.fail(new TickMemoDiverged({ taskId: kept.taskId, message: `the pass skipped \`${kept.taskId}\`: ${why}` }));
});

/**
 * Admits the queued tasks the engine's ceiling has room for (`toAdmit`), off the views the pass built, and journals `admitted` for
 * each: the next pass starts them. Returns the views with those marked admitted, as `view` reads them after the pass.
 */
const admitWaiting = Effect.fn('admitWaiting')(function* (views: readonly TaskView[]) {
  const ids = new Set(toAdmit(views, yield* Admission));
  const journal = yield* Journal;
  for (const id of ids) yield* journal.append(id, { kind: 'admitted', at: new Date().toISOString() });
  return views.map((v): TaskView => (ids.has(v.id) ? { ...v, admission: 'admitted' } : v));
});

/**
 * The pass's one look at the harnesses: told what to look for (`observeFor`), or listing everything when the runner cannot be told,
 * which reads every name; and what each failed part of the look said (`Observation.why`), as the pass reports it.
 */
const lookAt = (runner: RunnerOps, expected: readonly ExpectedSession[]) =>
  (runner.observeFor
    ? runner.observeFor(expected)
    : runner.observe.pipe(Effect.map((seen): Observation => ({ seen, unread: ALL_READ })))
  ).pipe(Effect.map((o) => ({ ...o, unobserved: [...(o.why ?? [])] })));

/**
 * One pass over every task in the store. This is the whole daemon.
 *
 * Each task is stepped in the order `journal.list` gives, against one observation of every harness. A task filed unqueued
 * starts on it, and one filed `queued` starts on the pass after it is admitted: by `admit`, or by the pass itself under the
 * engine's ceiling (`Admission`), off the store as the pass left it — its one observation and the fold it already made, with
 * no second look at any harness. Per pool, the waiting task of the highest `priority` goes first, then the earliest filed.
 *
 * `running` is a count, per harness, of the sessions at work as the pass left them (`atWork`), off the same observation
 * and the fold the pass already made: what `ae tick` prints, and no rule reads.
 *
 * `unreadable` says why each task whose journal did not read was left out of this pass — it is said on every pass it lasts, as a
 * refused move is — and each feed entry the pass skipped, said once, on the pass whose read met it.
 *
 * `unobserved` says why each part of the pass's one look at the harnesses failed (`Observation.why`), naming the harness: on every
 * pass while it lasts, off that pass's look alone. Nothing decides on it.
 *
 * `refused` is every move the lifecycle had no edge for this pass: the task, the state it was read in and the
 * event it was handed. Such a task does nothing and is asked again on the next pass, where the same refusal comes back
 * for as long as its journal and its session say the same — so it is reported on every pass it persists, off the steps
 * this pass took, and never stalls quietly. A settled task is never asked (`settledQuiet`) and is never on it.
 *
 * With a memo (`TickMemo`, which `Engine.layer` gives each engine), a settled task already folded is not read again until
 * the feed names it: the pass reads the feed on from where the last one stopped, and folds only the tasks not settled, the
 * tasks it names, and those the memo has never folded — which, on an engine's first pass, is every task. Its finished
 * sessions are still let go off what the memo kept (`releaseFinished`). Without one, every task is folded on every pass.
 *
 * The pass, in this order:
 *
 * 1. It refuses any argument with `TickRefused`, nothing read (`tickRefusalOf`): typed to take nothing, it counts them all
 *    the same, since an untyped caller may still pass a ceiling.
 * 2. It reads the feed on from the memo's cursor (`forgetNamed`), before anything else of the store is read: whatever is
 *    appended while the pass reads is past the cursor, and named on the next. A task the feed names is folded again, and
 *    each is forgotten before any is folded, so a pass that fails part way leaves nothing kept that the feed has since named.
 * 3. It folds every task the memo does not keep, before the harnesses are looked at, so the look can be told what to look
 *    for (`expectedOf`).
 * 4. It looks at the harnesses once. What a harness could not read is said (`unread`), and neither decided on nor let go of
 *    as gone. A runner that cannot be told what to look for lists everything, and fails the pass when it cannot.
 * 5. It takes each task in turn: a kept one is verified (`verify`) and let go off what the memo kept; any other is settled
 *    (`settleOn`), then released against its journal as this pass left it — read again only when the pass wrote to it, so an
 *    end written now is let go now — and read again when the release wrote down what an attempt consumed, so the view the
 *    pass reports is what `view` reads after it.
 * 6. It drops from the memo every task the store no longer lists.
 * 7. It admits the queued tasks the ceiling has room for (`admitWaiting`), which the next pass starts.
 *
 * Its span says how many tasks the store listed (`tasks`) and how many the memo kept (`kept`): a kept task makes no span of its own.
 */
export const tick = Effect.fn('tick')(function* () {
  const refused = tickRefusalOf([...arguments]);
  if (refused) return yield* Effect.fail(new TickRefused({ message: refused }));
  const journal = yield* Journal;
  const runner = yield* Runner;
  const memo = yield* TickMemo;

  const unreadable = memo ? yield* forgetNamed(memo) : [];
  const ids = yield* journal.list;
  const folded = new Map<string, State>();
  for (const id of ids) {
    if (memo?.settled.has(id)) continue;
    const read = yield* journal.read(id).pipe(
      Effect.map((events) => ({ events })),
      Effect.catchTag('JournalError', (e) => Effect.succeed({ why: e.message })),
    );
    if ('why' in read) unreadable.push(read.why);
    else folded.set(id, fold(id, read.events));
  }
  const lookedFor = [...folded.values(), ...keptLooked(memo)];
  const { seen: observed, unread, unobserved, unreadWhy } = yield* lookAt(runner, expectedOf(lookedFor));

  const taken: Action[] = [];
  const views: TaskView[] = [];
  const running: Record<string, number> = {};
  const stalled: RefusedMove[] = [];
  let keptCount = 0;
  for (const id of ids) {
    const held = keptIn(memo, id);
    if (held) {
      keptCount++;
      if (held.memo.verify) yield* verifyKept(held.kept, observed, unread);
      const { listed } = yield* releaseFinished(held.kept, observed, unread);
      if (listed) held.memo.listed.add(id);
      else held.memo.listed.delete(id);
      continue;
    }
    const before = folded.get(id);
    if (!before) continue;
    const noted = notedOf(before, observed, '');
    const actions = yield* settleOn(id, observed, unread, 8);
    taken.push(...actions);
    for (const a of actions) if (a.do === 'nothing' && a.refused) stalled.push({ taskId: id, ...a.refused });
    const stepped = wroteAny(noted, actions) ? fold(id, yield* journal.read(id)) : before;
    const released = yield* releaseFinished(stepped, observed, unread);
    const after = released.wrote ? fold(id, yield* journal.read(id)) : stepped;
    if (memo && settledQuiet(after)) {
      memo.settled.set(id, releasableOf(after));
      if (released.listed) memo.listed.add(id);
      else memo.listed.delete(id);
    }
    if (after.settled) continue;
    views.push(viewOfState(after, observed, unreadWhy));
    if (atWork(after, observed)) running[after.harness ?? 'default'] = (running[after.harness ?? 'default'] ?? 0) + 1;
  }

  if (memo) {
    const listed = new Set(ids);
    for (const id of memo.settled.keys()) if (!listed.has(id)) memo.settled.delete(id);
    for (const id of memo.listed) if (!memo.settled.has(id)) memo.listed.delete(id);
  }

  yield* Effect.annotateCurrentSpan({ tasks: ids.length, kept: keptCount });
  return {
    tasks: ids.length,
    actions: taken.filter((a) => a.do !== 'nothing').length,
    running,
    views: yield* admitWaiting(views),
    refused: stalled,
    unreadable,
    unobserved,
  };
});

/** What a person wants to see. Derived, never stored. Over a full listing (`observe`), which says no session's `unreadWhy`. */
export const view = Effect.fn('view')(function* (taskId: string, observed: ReadonlyMap<string, Sighting>) {
  const journal = yield* Journal;
  return viewOfState(fold(taskId, yield* journal.read(taskId)), observed);
});

/** A task a read left out because its journal does not read, and why, in the words the pass says it with (`TickReport.unreadable`). */
export type UnreadableTask = { taskId: string; why: string };

/** Some tasks' views, and each task among them whose journal did not read, named once and left out of `views`. */
export type TaskList = { views: TaskView[]; unreadable: UnreadableTask[] };

/**
 * The events of each of `taskIds`, in that order, a task whose journal fails to read (`JournalError`) left out and named, as the pass
 * leaves it out; any other failure fails the read.
 */
const readEach = Effect.fn('readEach')(function* (taskIds: Iterable<string>) {
  const journal = yield* Journal;
  const read: Array<{ taskId: string; events: Event[] }> = [];
  const unreadable: UnreadableTask[] = [];
  for (const taskId of taskIds) {
    const one = yield* journal.read(taskId).pipe(
      Effect.map((events) => ({ events })),
      Effect.catchTag('JournalError', (e) => Effect.succeed({ why: e.message })),
    );
    if ('why' in one) unreadable.push({ taskId, why: one.why });
    else read.push({ taskId, events: one.events });
  }
  return { read, unreadable };
});

/**
 * The views of `taskIds`, over one look at the harnesses: each journal read once, and the harnesses told the last attempt of each task not
 * settled (`observeFor`), which is all a view reads of a sighting — so a look for Claude Code jobs alone lists their run files and asks no
 * `claude agents`, and a look for none is not made. Where a runner cannot be told, it observes everything once, as `list` does. What a
 * caller that shows some of the store reads in place of a `view` each (an observation each for tasks in flight) or of `list` (every
 * journal in the store). A registry that cannot be read this time is nothing observed, as `view` reads it. Why a session alone was
 * unread (`TaskView.unreadWhy`) is carried off the look that said it.
 *
 * A task whose journal does not read is left out of `views` and named in `unreadable`, once, as the pass leaves it out: one entry no
 * runtime wrote in one journal costs the caller that task, never the others.
 */
export const viewsOf = Effect.fn('viewsOf')(function* (taskIds: readonly string[]) {
  const runner = yield* Runner;
  const { read, unreadable } = yield* readEach(new Set(taskIds));
  const states = read.map(({ taskId, events }) => fold(taskId, events));
  const open = states.filter((state) => !state.settled && state.attempts.length);
  const { seen, unreadWhy } = open.length
    ? yield* (
        runner.observeFor
          ? runner.observeFor(expectedOf(open.map((state) => ({ ...state, attempts: state.attempts.slice(-1) }))))
          : runner.observe.pipe(Effect.map((seen): Observation => ({ seen, unread: ALL_READ })))
      ).pipe(Effect.catchCause(() => Effect.succeed<Observation>({ seen: new Map(), unread: ALL_READ })))
    : { seen: new Map<string, Sighting>(), unreadWhy: undefined };
  return { views: states.map((state) => viewOfState(state, seen, unreadWhy)), unreadable } satisfies TaskList;
});

/**
 * Every task in the store, each journal read, over one observation of every harness — what `list()` answers. A task whose journal does
 * not read is left out of `views` and named in `unreadable`, once, as `viewsOf` leaves it out; a store that cannot be listed, or a
 * harness that cannot be observed, fails the read. A full listing says no session's `unreadWhy`.
 */
export const everyView = Effect.fn('everyView')(function* () {
  const observed = yield* (yield* Runner).observe;
  const { read, unreadable } = yield* readEach(yield* (yield* Journal).list);
  return { views: read.map(({ taskId, events }) => viewOfState(fold(taskId, events), observed)), unreadable } satisfies TaskList;
});

/** The phase `viewOfState` gives a task, by its rules in order, off its record and the sighting of its last attempt. */
function phaseOfView(state: State, observed: ReadonlyMap<string, Sighting>, sighting: Sighting | undefined): TaskPhase {
  const last = state.attempts.at(-1);
  if (state.settled) return state.settled;
  if (waitsForInput(state)) return 'input-required';
  const live = last?.ended === null ? sighting : undefined;
  if (live && respawning(state, sighting)) return 'restarting';
  if (live && idleOf(state, sighting)) return 'idle';
  if (needsHuman(state, observed)) return 'needs-human';
  if (live) return LIVE_PHASE[live.state] === 'working' && live.busy === false ? 'quiescent' : LIVE_PHASE[live.state];
  if (last?.ended === null) return 'starting';
  return last ? 'between-attempts' : 'pending';
}

/** Why the look left a task's last session unread, by its name in `unreadWhy`; none for a task never spawned. */
const unreadOfTask = (state: State, unreadWhy: ReadonlyMap<string, string> | undefined): string | undefined => {
  const last = state.attempts.at(-1);
  return last ? unreadWhy?.get(nameFor(state.taskId, last.n)) : undefined;
};

/**
 * What the sighting of the attempt in flight carries into a view untouched: the word a `needs-human` phase waits for — there is no
 * question to answer about a session nobody is waiting on, so it is carried under no other phase — the call the attempt is in, the
 * questions it waits on a person for, and the asks whose held call took an answer. None of it is judged.
 */
const carriedOf = (sighting: Sighting | undefined, phase: TaskView['phase']) => {
  const waitingFor = phase === 'needs-human' ? sighting?.waitingFor : undefined;
  return {
    ...(waitingFor ? { waitingFor } : {}),
    ...(sighting?.calling ? { calling: sighting.calling } : {}),
    ...(sighting?.asks ? { asks: sighting.asks } : {}),
    ...(sighting?.asksTaken ? { asksTaken: sighting.asksTaken } : {}),
  };
};

/**
 * A task's view from its folded record and one observation. Pure: `view` reads the record for it, and `tick` hands in the
 * fold it made.
 *
 * Its phase is the first of these that holds:
 *
 * 1. its outcome, once settled;
 * 2. `input-required`: held open, ended and waiting for a person's answer or close — A2A's TASK_STATE_INPUT_REQUIRED —
 *    with nothing running;
 * 3. `restarting`: a long-lived task's session its harness is respawning (`respawning`);
 * 4. `idle`: a long-lived task's session open between turns (`idleOf`), which only a stop ends;
 * 5. `needs-human` (`needsHuman`);
 * 6. `quiescent`: at work (`submitted` or `working`) and not busy, so it believes it has work and is computing nothing. Said
 *    out loud, because it is indistinguishable from progress in every other view, and it is what a stalled step looks like
 *    from outside;
 * 7. for any other live session, by its state (`LIVE_PHASE`): `working` at work, `ending` once its harness says it ended and
 *    before the pass records that end;
 * 8. `starting`: spawned but not yet in the harness's registry — the grace window, not a gap between attempts;
 * 9. `between-attempts` — a long-lived task backing off before its restart among them — or `pending` before the first.
 *
 * Its `session` is the sighting's state, in A2A's names, for an attempt in flight the look saw, and absent otherwise: a settled
 * task carries none.
 *
 * Its `sessionId` is the sighting's, or else the id its last end was recorded with: a released session is in no
 * observation, and that id is what `logs` reads then. What the sighting carries through untouched is `carriedOf`'s, never
 * judged — `decide` never saw it. So is its `bridge`, which only a task that asked for one carries (`bridgeOfTask`), and why the
 * look left its session unread (`unreadWhy`, the look's words by the last attempt's name), only for a session not seen.
 */
export function viewOfState(state: State, observed: ReadonlyMap<string, Sighting>, unreadWhy?: ReadonlyMap<string, string>): TaskView {
  const taskId = state.taskId;
  const last = state.attempts.at(-1);
  const sighting = last ? observed.get(nameFor(taskId, last.n)) : undefined;
  const phase = phaseOfView(state, observed, sighting);
  const admission = admissionOf(state);
  const bridge = bridgeOfTask(state.config, state.settled !== null, sighting?.bridge);
  const unread = sighting ? undefined : unreadOfTask(state, unreadWhy);
  return {
    id: taskId,
    state,
    phase,
    ...(!state.settled && last?.ended === null && sighting ? { session: sighting.state } : {}),
    sessionId: sighting?.sessionId ?? last?.nativeId ?? null,
    usage: state.restartPolicy === 'Always' ? (last?.usage ?? undefined) : sighting?.usage,
    ...carriedOf(sighting, phase),
    ...(admission ? { admission } : {}),
    ...(bridge ? { bridge } : {}),
    ...(unread ? { unreadWhy: unread } : {}),
  };
}

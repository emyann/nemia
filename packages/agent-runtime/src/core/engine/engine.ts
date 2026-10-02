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
  type Event,
  type Sighting,
  type State,
  type Usage,
} from '../domain.ts';
import { atWorkState, phaseWordOf, type SessionState } from '../session.ts';
import { Journal } from './journal.ts';
import { configForTurn } from '../../harness/args.ts';
import { Runner, type ExpectedSession } from '../../harness/seam.ts';
import { transition, type Move, type Refusal } from '../lifecycle.ts';
import { divergence, releasableOf, TickMemo, TickMemoDiverged, type Releasable, type TickMemoState } from './memo.ts';
import { ADMIT_INSTEAD } from './filing.ts';

/**
 * The lifecycle `step` moves a task by: the shipped one (`lifecycle.ts`) unless a test provides another, which is how a
 * refused edge is planted to prove the pass reports it. Exported by neither entry, as the machine is not.
 */
export const Lifecycle = Context.Reference<Move>('engine/Lifecycle', { defaultValue: () => transition });

/** How long a spawned session may go unregistered by the harness before we call it gone. */
export const GRACE_MS = 30_000;

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
  phase: string;
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
  /**
   * Where a task filed `queued` stands with the layer above: `queued` while its current turn waits for the word to start,
   * `admitted` once given and until the next pass starts it. Beside the phase, never in it: the phase of either is `pending`
   * — or `between attempts`, for a later turn of a task held open — as for a task that waits for no word.
   * Absent for a task not filed queued, and once its turn has started. Off the record alone.
   */
  admission?: 'queued' | 'admitted';
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
 */
const closedOut = (state: State, observed: ReadonlyMap<string, Sighting>): ReadonlyMap<string, Sighting> => {
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

/** A `step` or `settleTask` handed what it no longer takes, and why. Nothing was read or written. */
export class StepRefused extends Schema.TaggedError<StepRefused>()('StepRefused', {
  message: Schema.String,
}) {}

/**
 * Why `step` refuses what it was handed past the task and the observation, or `undefined` when it was handed nothing more:
 * a caller built against a `step` that took the ceiling's `slots` third would otherwise have them dropped without a word.
 */
export const stepRefusalOf = (extra: readonly unknown[]): string | undefined =>
  extra.length === 0
    ? undefined
    : `step takes a task and an observation, and was handed ${extra.length} more: its third argument was the ceiling's slots, and the runtime has no ceiling since stage 4c part 2. ${ADMIT_INSTEAD}`;

/**
 * Why `settleTask` refuses its `maxSteps`, or `undefined`: a count of steps is a whole number above nought, and nothing
 * follows it. A caller built against a `settleTask` that took the ceiling's `slots` third hands a `{ used, max }` in
 * `maxSteps`'s place, which compares false and would settle nothing.
 */
export const settleRefusalOf = (maxSteps: unknown, extra: readonly unknown[]): string | undefined =>
  Number.isInteger(maxSteps) && (maxSteps as number) > 0 && extra.length === 0
    ? undefined
    : // oxlint-disable-next-line typescript/no-base-to-string -- `String` is reached only once an object and a function are ruled out
      `settleTask takes a task, an observation and a number of steps above nought, and was handed ${extra.length ? `${extra.length} more` : `a maxSteps of ${typeof maxSteps === 'object' || typeof maxSteps === 'function' ? JSON.stringify(maxSteps) : String(maxSteps)}`}: its third argument was the ceiling's slots, and the runtime has no ceiling since stage 4c part 2. ${ADMIT_INSTEAD}`;

/** Nothing left unread: what `step` and `settleTask` decide on, handed an observation and no more. */
const ALL_READ: ReadonlySet<string> = new Set();

/**
 * One task, one step. Returns the action taken, so a caller can loop until nothing moves.
 *
 * `observed` is passed in rather than read here: one `claude agents` call serves a whole pass, which is the difference
 * between a board that scales and one that shells out per task. Typed to take two arguments, and counts them all the same:
 * a third, as an untyped caller may still pass the ceiling's slots, fails with `StepRefused` (`stepRefusalOf`), nothing read.
 */
export const step = Effect.fn('step')(function* (taskId: string, observed: ReadonlyMap<string, Sighting>) {
  const refused = stepRefusalOf([...arguments].slice(2));
  if (refused) return yield* Effect.fail(new StepRefused({ message: refused }));
  return yield* stepOn(taskId, observed, ALL_READ);
});

/** What the sighting `seen` an attempt ended on says of it, as its `ended` event carries it, each key written, undefined or not. */
const endFacts = (seen: Sighting | undefined) => ({
  usage: seen?.usage,
  exitCode: seen?.exitCode,
  denials: seen?.denials,
  skills: seen?.skills,
  limit: seen?.limit,
});

/**
 * A step, told which names the pass's observation could not read (`Now.unread`): the pass's own, which `step`'s door does not
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
 *    skills it loaded and the limit it says it stopped at, read off the same sighting the ending came from (`endFacts`):
 *    facts for the record, of which `decide` sees none.
 * 5. `settle` journals `settled`, with, for an attempt left open, its session's id read off the sighting as an ending's facts
 *    are: an open attempt has no `ended` to carry it, and it is what `logs` reads once the harness has let the session go —
 *    a fact `decide` never reads. `decide` ends a stopped or timed-out attempt before it settles, so only a journal an older
 *    runtime wrote settles over an open one, and the id is written for the task that journal is replayed into.
 */
const stepOn = Effect.fn('stepOn')(function* (taskId: string, observed: ReadonlyMap<string, Sighting>, unread: ReadonlySet<string>) {
  const journal = yield* Journal;
  const runner = yield* Runner;

  const move = yield* Lifecycle;

  const state = yield* notedFold(taskId, observed);
  const action = decide(state, closedOut(state, observed), { at: new Date(), graceMs: GRACE_MS, unread }, move);
  const at = () => new Date().toISOString();

  switch (action.do) {
    case 'nothing':
      break;

    case 'start':
      yield* journal.append(taskId, {
        kind: 'starting',
        at: at(),
        attempt: action.attempt,
        resumeFrom: action.resumeFrom,
        nudge: action.nudge,
      });
      break;

    case 'spawn': {
      const attempt = state.attempts.find((a) => a.n === action.attempt);
      const failed = yield* runner
        .spawn({
          name: action.name,
          brief: attempt?.nudge ?? state.brief,
          cwd: state.cwd,
          harness: state.harness,
          config: configForTurn(state.config, turnOf(state, attempt?.turn ?? 0).config),
          closeoutSchema: state.closeoutSchema,
          resumeFrom: attempt?.resumeFrom,
        })
        .pipe(
          Effect.as(undefined),
          Effect.catchTag('RunnerError', (e) => Effect.succeed(e)),
        );
      if (failed?.refused) {
        const end = spawnRefused(state, action.attempt, failed.message, move);
        if (end.do !== 'record-end') return end;
        yield* journal.append(taskId, {
          kind: 'ended',
          at: at(),
          attempt: end.attempt,
          sessionId: end.sessionId,
          observed: end.observed,
          reason: end.reason,
          error: end.error,
        });
      } else {
        yield* journal.append(taskId, { kind: 'spawned', at: at(), attempt: action.attempt, ...(failed ? { error: failed.message } : {}) });
      }
      break;
    }

    case 'record-end': {
      yield* journal.append(taskId, {
        kind: 'ended',
        at: at(),
        attempt: action.attempt,
        sessionId: action.sessionId,
        observed: action.observed,
        reason: action.reason,
        nativeId: action.nativeId,
        closeout: action.closeout,
        ...(action.stated !== undefined ? { stated: action.stated } : {}),
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
 * A task's fold, with what its sighting says of a long-lived attempt's process journalled first (`sightingFacts`): the fold
 * `decide` reads, so the time a gap opened is on the record before the pass judges it.
 */
const notedFold = Effect.fn('notedFold')(function* (taskId: string, observed: ReadonlyMap<string, Sighting>) {
  const journal = yield* Journal;
  const state = fold(taskId, yield* journal.read(taskId));
  const facts = sightingFacts(state, lastSighting(state, observed), new Date().toISOString());
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
 * was observed. Refused with `StepRefused`, nothing read, for a `maxSteps` that is not a whole number above nought or any
 * argument after it (`settleRefusalOf`).
 */
export const settleTask = Effect.fn('settleTask')(function* (taskId: string, observed: ReadonlyMap<string, Sighting>, maxSteps = 8) {
  const refused = settleRefusalOf(maxSteps, [...arguments].slice(3));
  if (refused) return yield* Effect.fail(new StepRefused({ message: refused }));
  return yield* settleOn(taskId, observed, ALL_READ, maxSteps);
});

/** `settleTask`, told which names the pass could not read, as `stepOn` is. */
const settleOn = Effect.fn('settleOn')(function* (
  taskId: string,
  observed: ReadonlyMap<string, Sighting>,
  unread: ReadonlySet<string>,
  maxSteps: number,
) {
  const taken: Action[] = [];
  for (let i = 0; i < maxSteps; i++) {
    const action = yield* stepOn(taskId, observed, unread);
    taken.push(action);
    if (!PROGRESSES.has(action.do)) break;
  }
  return taken;
});

/** What a release the harness refused answers, in `releaseFinished`: told apart from every answer a release gives. */
const REFUSED = Symbol('refused');

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
 */
const releaseFinished = Effect.fn('releaseFinished')(function* (
  state: Releasable,
  observed: ReadonlyMap<string, Sighting>,
  unread: ReadonlySet<string>,
) {
  const runner = yield* Runner;
  const journal = yield* Journal;
  let wrote = false;
  let listed = false;
  if (!runner.release) return { wrote, listed };
  for (const attempt of state.attempts) {
    const finished = attempt.ended !== null || (state.settled !== null && attempt.nativeId !== null);
    const name = nameFor(state.taskId, attempt.n);
    const session = finished ? observed.get(name) : undefined;
    if (!session) {
      if (finished && unread.has(name)) listed = true;
      continue;
    }
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
    : `the pass takes no arguments, and was handed ${args.length}: it has no ceiling and no pools since stage 4c part 2. ${ADMIT_INSTEAD}`;

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
 * first pass after it.
 */
const expectedOf = (
  states: Iterable<Pick<State, 'taskId' | 'harness'> & { attempts: ReadonlyArray<{ n: number }> }>,
): ExpectedSession[] => {
  const expected: ExpectedSession[] = [];
  for (const state of states) for (const a of state.attempts) expected.push({ name: nameFor(state.taskId, a.n), harness: state.harness });
  return expected;
};

/**
 * Read the feed on from the memo's cursor, and forget every task it names: each is folded again on this pass. An entry no runtime
 * wrote is past the cursor all the same, and the task it names, when it names one, is forgotten too; returns why each was skipped.
 */
const forgetNamed = Effect.fn('forgetNamed')(function* (memo: TickMemoState) {
  const { entries, cursor, refused = [] } = yield* (yield* Journal).feed(memo.cursor ?? 0);
  for (const taskId of [...entries.map((e) => e.taskId), ...refused.flatMap((r) => r.taskId ?? [])]) {
    memo.settled.delete(taskId);
    memo.listed.delete(taskId);
  }
  memo.cursor = cursor;
  return refused.map((r) => r.why);
});

/**
 * The memo's proof, in `verify` alone: a skipped task folded all the same, and decided, as the pass would have without the
 * memo. A difference fails the pass, naming the task, rather than being mended quietly.
 */
const verifyKept = Effect.fn('verifyKept')(function* (
  kept: Releasable,
  observed: ReadonlyMap<string, Sighting>,
  unread: ReadonlySet<string>,
) {
  const fresh = fold(kept.taskId, yield* (yield* Journal).read(kept.taskId));
  const decided = decide(fresh, closedOut(fresh, observed), { at: new Date(), graceMs: GRACE_MS, unread }, yield* Lifecycle);
  const why = divergence(kept, fresh, decided);
  if (why) return yield* Effect.fail(new TickMemoDiverged({ taskId: kept.taskId, message: `the pass skipped \`${kept.taskId}\`: ${why}` }));
});

/**
 * One pass over every task on the board. This is the whole daemon.
 *
 * Each task is stepped in the order `journal.list` gives, against one observation of every harness. The pass chooses
 * nothing: a task filed unqueued starts on it, and one filed `queued` starts on the pass after the layer above `admit`s it.
 * How many run at once, in which pool, and which first is that layer's — the orchestrator's `toAdmit`, off the `views` this
 * pass returns: the board as the pass left it, off its one observation and the fold it already made, with no second look
 * at any harness.
 *
 * `running` is a count, per harness, of the sessions at work as the pass left them (`atWork`), off the same observation
 * and the fold the pass already made: what `ae tick` prints, and no rule reads.
 *
 * `unreadable` says why each task whose journal did not read was left out of this pass — it is said on every pass it lasts, as a
 * refused move is — and each feed entry the pass skipped, said once, on the pass whose read met it.
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
 * 2. It reads the feed on from the memo's cursor (`forgetNamed`), before anything else of the board is read: whatever is
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
  const lookedFor = [...folded.values(), ...[...(memo?.listed ?? [])].flatMap((id) => memo!.settled.get(id) ?? [])];
  const { seen: observed, unread } = yield* runner.observeFor
    ? runner.observeFor(expectedOf(lookedFor))
    : runner.observe.pipe(Effect.map((seen) => ({ seen, unread: ALL_READ })));

  const taken: Action[] = [];
  const views: TaskView[] = [];
  const running: Record<string, number> = {};
  const stalled: RefusedMove[] = [];
  for (const id of ids) {
    const kept = memo?.settled.get(id);
    if (kept) {
      if (memo!.verify) yield* verifyKept(kept, observed, unread);
      const { listed } = yield* releaseFinished(kept, observed, unread);
      if (listed) memo!.listed.add(id);
      else memo!.listed.delete(id);
      continue;
    }
    const before = folded.get(id);
    if (!before) continue;
    const noted = sightingFacts(before, lastSighting(before, observed), '');
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
    views.push(viewOfState(after, observed));
    if (atWork(after, observed)) running[after.harness ?? 'default'] = (running[after.harness ?? 'default'] ?? 0) + 1;
  }

  if (memo) {
    const listed = new Set(ids);
    for (const id of memo.settled.keys()) if (!listed.has(id)) memo.settled.delete(id);
    for (const id of memo.listed) if (!memo.settled.has(id)) memo.listed.delete(id);
  }

  return {
    tasks: ids.length,
    actions: taken.filter((a) => a.do !== 'nothing').length,
    running,
    views,
    refused: stalled,
    unreadable,
  };
});

/** What a person wants to see. Derived, never stored. */
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
 * caller that shows some of the board reads in place of a `view` each (an observation each for tasks in flight) or of `list` (every
 * journal in the store). A registry that cannot be read this time is nothing observed, as `view` reads it.
 *
 * A task whose journal does not read is left out of `views` and named in `unreadable`, once, as the pass leaves it out: one entry no
 * runtime wrote in one journal costs the caller that task, never the others.
 */
export const viewsOf = Effect.fn('viewsOf')(function* (taskIds: readonly string[]) {
  const runner = yield* Runner;
  const { read, unreadable } = yield* readEach(new Set(taskIds));
  const states = read.map(({ taskId, events }) => fold(taskId, events));
  const open = states.filter((state) => !state.settled && state.attempts.length);
  const observed = open.length
    ? yield* (
        runner.observeFor
          ? runner
              .observeFor(expectedOf(open.map((state) => ({ ...state, attempts: state.attempts.slice(-1) }))))
              .pipe(Effect.map((o) => o.seen))
          : runner.observe
      ).pipe(Effect.catchCause(() => Effect.succeed(new Map<string, Sighting>())))
    : new Map<string, Sighting>();
  return { views: states.map((state) => viewOfState(state, observed)), unreadable } satisfies TaskList;
});

/**
 * Every task on the board, each journal read, over one observation of every harness — what `list()` answers. A task whose journal does
 * not read is left out of `views` and named in `unreadable`, once, as `viewsOf` leaves it out; a store that cannot be listed, or a
 * harness that cannot be observed, fails the read.
 */
export const everyView = Effect.fn('everyView')(function* () {
  const observed = yield* (yield* Runner).observe;
  const { read, unreadable } = yield* readEach(yield* (yield* Journal).list);
  return { views: read.map(({ taskId, events }) => viewOfState(fold(taskId, events), observed)), unreadable } satisfies TaskList;
});

/** The phase `viewOfState` gives a task, by its rules in order, off its record and the sighting of its last attempt. */
function phaseOfView(state: State, observed: ReadonlyMap<string, Sighting>, sighting: Sighting | undefined): string {
  const last = state.attempts.at(-1);
  if (state.settled) return state.settled;
  if (waitsForInput(state)) return 'input-required';
  const live = last?.ended === null && sighting ? phaseWordOf(sighting.state) : undefined;
  if (live && respawning(state, sighting)) return 'restarting';
  if (live && idleOf(state, sighting)) return 'idle';
  if (needsHuman(state, observed)) return 'needs-human';
  if (live) return live === 'working' && sighting?.busy === false ? 'working (quiescent)' : `running (${live})`;
  if (last?.ended === null) return 'starting';
  return last ? 'between attempts' : 'pending';
}

/**
 * A task's view from its folded record and one observation. Pure: `view` reads the record for it, and `tick` hands in the
 * fold it made.
 *
 * Its phase is the first of these that holds:
 *
 * 1. its outcome, once settled;
 * 2. `input-required`: held open, signed and waiting for a person's answer or close — A2A's TASK_STATE_INPUT_REQUIRED —
 *    with nothing running;
 * 3. `restarting`: a long-lived task's session its harness is respawning (`respawning`);
 * 4. `idle`: a long-lived task's session open between turns (`idleOf`), which only a stop ends;
 * 5. `needs-human` (`needsHuman`);
 * 6. `working (quiescent)`: listed `working` and not busy, so it believes it has work and is computing nothing. Said out
 *    loud, because it is indistinguishable from progress in every other view, and it is what a stalled step looks like from
 *    outside;
 * 7. `running (…)` for any other live session, in the words every view prints (`phaseWordOf`): A2A's names stop at the
 *    runtime;
 * 8. `starting`: spawned but not yet in the harness's registry — the grace window, not a gap between attempts;
 * 9. `between attempts` — a long-lived task backing off before its restart among them — or `pending` before the first.
 *
 * Its `sessionId` is the sighting's, or else the id its last end was recorded with: a released session is in no
 * observation, and that id is what `logs` reads then. `waitingFor` is carried only where the phase is `needs-human`: the
 * word answers "waiting for what?", and there is no question to answer about a session nobody is waiting on. Carried, not
 * judged — `decide` never saw it.
 */
export function viewOfState(state: State, observed: ReadonlyMap<string, Sighting>): TaskView {
  const taskId = state.taskId;
  const last = state.attempts.at(-1);
  const sighting = last ? observed.get(nameFor(taskId, last.n)) : undefined;
  const phase = phaseOfView(state, observed, sighting);
  const waitingFor = phase === 'needs-human' ? sighting?.waitingFor : undefined;
  const admission = admissionOf(state);
  return {
    id: taskId,
    state,
    phase,
    sessionId: sighting?.sessionId ?? last?.nativeId ?? null,
    usage: sighting?.usage,
    ...(waitingFor ? { waitingFor } : {}),
    ...(admission ? { admission } : {}),
  };
}

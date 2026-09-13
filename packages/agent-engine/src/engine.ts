/**
 * The control loop. Reads both states, calls `decide`, applies ONE step, writes down what happened.
 *
 * There is no cleverness left in here on purpose: every judgement lives in `decide` (pure), and
 * this file is the I/O that carries it out. If you find yourself adding an `if` here, it probably
 * belongs in `decide` — that is the line that keeps this engine small.
 */
import { Effect } from 'effect';
import { randomUUID } from 'node:crypto';
import { decide, fold, nameFor, needsHuman, type Action, type Event, type ResumePolicy, type Sighting, type State, type Usage } from './domain.ts';
import { Journal } from './journal.ts';
import { Runner } from './runner.ts';

/** How long a spawned session may go unregistered by the harness before we call it gone. */
export const GRACE_MS = 30_000;

/** Sessions of one harness that may run at once. Your subscription's rate limit, mostly. */
export const DEFAULT_MAX_CONCURRENT = 3;

/** A live session is one the engine is still waiting on. `done`/`failed`/`stopped` are not. */
const LIVE = new Set(['working', 'busy', 'blocked']);

export type TaskView = {
  id: string; state: State; phase: string; sessionId: string | null;
  /** What the attempt in flight has consumed so far, when its runner can see inside it. Settled attempts carry theirs on `state.attempts`. */
  usage?: Usage;
};

/** File a task. The only write a person makes; everything after is the loop's. */
export const file = Effect.fn('file')(function* (spec: {
  brief: string; cwd: string; maxAttempts?: number; model?: string; permissionMode?: string;
  harness?: string; deadlineSeconds?: number; resume?: ResumePolicy; resumeFrom?: string;
  worktree?: string | boolean; closeoutSchema?: object; tools?: string[]; effort?: string; id?: string;
}) {
  const journal = yield* Journal;
  // Long enough that two tasks filed in the same millisecond cannot share a journal file.
  const id = spec.id ?? `t-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  yield* journal.append(id, {
    kind: 'filed', at: new Date().toISOString(), brief: spec.brief, cwd: spec.cwd,
    maxAttempts: spec.maxAttempts ?? 1, model: spec.model, permissionMode: spec.permissionMode,
    harness: spec.harness, deadlineSeconds: spec.deadlineSeconds, resume: spec.resume,
    resumeFrom: spec.resumeFrom, worktree: spec.worktree, closeoutSchema: spec.closeoutSchema,
    tools: spec.tools, effort: spec.effort,
  });
  return id;
});

export const requestStop = Effect.fn('requestStop')(function* (taskId: string) {
  const journal = yield* Journal;
  yield* journal.append(taskId, { kind: 'stop-requested', at: new Date().toISOString() });
});

/**
 * One task, one step. Returns the action taken, so a caller can loop until nothing moves.
 *
 * `observed` is passed in rather than read here: one `claude agents` call serves a whole pass,
 * which is the difference between a board that scales and one that shells out per task.
 */
/**
 * The workload's closing statement, taken as the end of the attempt — when it belongs to this one.
 *
 * Everything else the engine knows about completion is inferred from outside: `state`, unreliable
 * for long work, and quiescence, which costs ninety seconds and rests on a stall twenty sessions
 * failed to characterise. A harness that takes a structured final answer — Claude Code's
 * StructuredOutput tool, `codex exec --output-schema` — gives the workload a way to SAY it is
 * finished, and the runner reports that statement here as a fact with a timestamp.
 *
 * It replaces a file the workload wrote into its own directory, and that file's two bugs are the
 * two rules below. The file lived in the workspace, so it travelled down a git branch and the next
 * step started out satisfied. A statement lives in the session instead — but a RESUMED Claude
 * session's transcript holds its parent's whole conversation under the child's own id (measured:
 * 460 entries), so the parent's statement arrives looking exactly like the child's. The session id
 * cannot tell them apart; the moment it was made can, and only the journal knows when this attempt
 * began, which is why the check is here and not in a runner.
 *
 * The payload is carried, never read. The engine records it on the attempt and does nothing else.
 */
const closedOut = (state: State, observed: ReadonlyMap<string, Sighting>): ReadonlyMap<string, Sighting> => {
  const last = state.attempts.at(-1);
  if (!last || last.ended !== null) return observed;
  const name = nameFor(state.taskId, last.n);
  const seen = observed.get(name);
  if (!seen?.closeout) return observed;

  // Made before this attempt began: carried over, not said. Dropped, so it is never recorded as
  // this attempt's either.
  if (!(seen.closeout.at > Date.parse(last.startedAt))) {
    const said: Sighting = { ...seen };
    delete said.closeout;
    return new Map(observed).set(name, said);
  }
  // The harness has already answered; the statement rides along to the record and nothing more.
  if (seen.state !== 'working') return observed;
  // Still computing: a statement it may yet revise. Measured once, with the file — a step declared
  // itself done, kept going, found it could not commit, and rewrote the verdict to blocked.
  if (seen.busy) return observed;
  return new Map(observed).set(name, { ...seen, state: 'done' });
};

export const step = Effect.fn('step')(function* (
  taskId: string,
  observed: ReadonlyMap<string, Sighting>,
  slots: { used: number; max: number } = { used: 0, max: Infinity },
) {
  const journal = yield* Journal;
  const runner = yield* Runner;

  const state = fold(taskId, yield* journal.read(taskId));
  const action = decide(state, closedOut(state, observed), { at: new Date(), graceMs: GRACE_MS, ...slots });
  const at = () => new Date().toISOString();

  switch (action.do) {
    case 'nothing':
      break;

    case 'start':
      // The intent is journalled BEFORE the spawn, and the session's name is derivable from it.
      // That ordering is the whole crash-safety story: a session we asked for always has a record,
      // and the record implies the name, so a restart finds it instead of starting a second one.
      // `resumeFrom` is journalled with it, so what an attempt was told to continue is a fact on
      // the record rather than something re-derived by a later reader.
      yield* journal.append(taskId, { kind: 'starting', at: at(), attempt: action.attempt, resumeFrom: action.resumeFrom });
      break;

    case 'spawn': {
      // A harness that refuses to start the session has answered, and the answer is recorded like
      // any other ending — `failed`, `unstartable`, in the harness's own words — so `decide` settles
      // or retries it as it would any failure. Let out as an error instead, it rejected the whole
      // tick: every task behind this one stalled, on every pass, for as long as this one existed.
      const refused = yield* runner.spawn({
        name: action.name, brief: state.brief, cwd: state.cwd,
        model: state.model, permissionMode: state.permissionMode, harness: state.harness,
        worktree: state.worktree, closeoutSchema: state.closeoutSchema,
        tools: state.tools, effort: state.effort,
        // Taken from the journal rather than recomputed: the decision was made when the attempt
        // was started, possibly by an engine that has since died.
        resumeFrom: state.attempts.find((a) => a.n === action.attempt)?.resumeFrom,
      }).pipe(
        Effect.as(undefined),
        Effect.catchTag('RunnerError', (e) => Effect.succeed(e.message)),
      );
      yield* journal.append(taskId, refused === undefined
        ? { kind: 'spawned', at: at(), attempt: action.attempt }
        : { kind: 'ended', at: at(), attempt: action.attempt, sessionId: '(never started)', observed: 'failed', reason: 'unstartable', error: refused });
      break;
    }

    case 'record-end': {
      // What the attempt consumed and how its process exited are read off the same sighting the
      // ending came from, and written beside it. Facts for the record; `decide` sees neither.
      const seen = observed.get(nameFor(taskId, action.attempt));
      yield* journal.append(taskId, {
        kind: 'ended', at: at(), attempt: action.attempt, sessionId: action.sessionId,
        observed: action.observed, reason: action.reason, nativeId: action.nativeId,
        closeout: action.closeout, usage: seen?.usage, exitCode: seen?.exitCode,
      });
      break;
    }

    case 'stop':
      yield* runner.stop(action.sessionId);
      break;

    case 'settle':
      yield* journal.append(taskId, { kind: 'settled', at: at(), outcome: action.outcome, note: action.note });
      break;
  }

  return action;
});

/**
 * One task, stepped until nothing moves — against ONE observation.
 *
 * It stops at the first action that does not change our own journal, because `observed` is a
 * snapshot: `stop` asks the harness for something whose result we can only learn by looking
 * again, so looping on it would re-send the request against a state we have not re-read. The
 * next pass sees `stopped` and settles. Assume nothing; record what was observed.
 */
const PROGRESSES = new Set(['start', 'spawn', 'record-end', 'settle']);

export const settleTask = Effect.fn('settleTask')(function* (
  taskId: string,
  observed: ReadonlyMap<string, Sighting>,
  slots: { used: number; max: number } = { used: 0, max: Infinity },
  maxSteps = 8,
) {
  const taken: Action[] = [];
  for (let i = 0; i < maxSteps; i++) {
    const action = yield* step(taskId, observed, slots);
    taken.push(action);
    if (!PROGRESSES.has(action.do)) break;
  }
  return taken;
});

/**
 * One pass over every task on the board. This is the whole daemon.
 *
 * **Admission is serial, and that is deliberate.** Two tasks decided concurrently would each read
 * the same `used` count and each start, so a ceiling of 3 would admit 5. Nothing here is slow —
 * a spawn returns as soon as the harness has the work — so the pass costs a few seconds at worst
 * and buys a ceiling that is actually true.
 *
 * The count starts from what is OBSERVED and grows as this pass starts things, because a session
 * started a moment ago is not in the harness's registry yet (see the grace window). Our own new
 * runs are not contention to be discovered later; they are slots we have just spent.
 */
export const tick = Effect.fn('tick')(function* (maxConcurrent = DEFAULT_MAX_CONCURRENT) {
  const journal = yield* Journal;
  const runner = yield* Runner;

  const observed = yield* runner.observe;
  const ids = yield* journal.list;

  // Which harness each live session belongs to — the sighting does not say, so it comes from the
  // task that owns the name. Two small file reads per task per pass; the board is local and tiny.
  const used = new Map<string, number>();
  const harnessOf = new Map<string, string>();
  for (const id of ids) {
    const state = fold(id, yield* journal.read(id));
    const harness = state.harness ?? 'default';
    harnessOf.set(id, harness);
    const last = state.attempts.at(-1);
    if (last && last.ended === null) {
      const seen = observed.get(nameFor(id, last.n));
      if (seen && LIVE.has(seen.state)) used.set(harness, (used.get(harness) ?? 0) + 1);
    }
  }

  const taken: Action[] = [];
  for (const id of ids) {
    const harness = harnessOf.get(id) ?? 'default';
    const before = used.get(harness) ?? 0;
    const actions = yield* settleTask(id, observed, { used: before, max: maxConcurrent });
    taken.push(...actions);
    // A slot is spent the moment we journal the intent, not when the harness confirms it.
    if (actions.some((a) => a.do === 'start')) used.set(harness, before + 1);
  }

  return {
    tasks: ids.length,
    actions: taken.filter((a) => a.do !== 'nothing').length,
    running: Object.fromEntries(used),
  };
});

/** What a person wants to see. Derived, never stored. */
export const view = Effect.fn('view')(function* (taskId: string, observed: ReadonlyMap<string, Sighting>) {
  const journal = yield* Journal;
  const state = fold(taskId, yield* journal.read(taskId));
  const last = state.attempts.at(-1);
  const sighting = last ? observed.get(nameFor(taskId, last.n)) : undefined;
  const live = last && last.ended === null ? sighting?.state : undefined;
  const phase = state.settled
    ? state.settled
    : needsHuman(state, observed) ? 'needs-human'
    // `working` and not busy: it believes it has work and is computing nothing. Said out loud,
    // because it is indistinguishable from progress in every other view and it is what a stalled
    // step looks like from outside.
    : live === 'working' && sighting?.busy === false ? 'working (quiescent)'
    : live ? `running (${live})`
    // Spawned but not yet in the harness's registry: the grace window, not a gap between attempts.
    : last?.ended === null ? 'starting'
    : last ? 'between attempts'
    : 'pending';
  return { id: taskId, state, phase, sessionId: sighting?.sessionId ?? null, usage: sighting?.usage };
});

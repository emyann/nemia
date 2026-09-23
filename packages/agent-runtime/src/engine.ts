/**
 * The control loop. Reads both states, calls `decide`, applies ONE step, writes down what happened.
 *
 * There is no cleverness left in here on purpose: every judgement lives in `decide` (pure), and
 * this file is the I/O that carries it out. If you find yourself adding an `if` here, it probably
 * belongs in `decide` — that is the line that keeps this engine small.
 */
import { Effect, Schema } from 'effect';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { decide, fold, nameFor, needsHuman, type Action, type Event, type ResumePolicy, type Sighting, type State, type Usage } from './domain.ts';
import { Journal } from './journal.ts';
import type { HarnessArgs } from './harness-args.ts';
import { Runner } from './runner.ts';

/** How long a spawned session may go unregistered by the harness before we call it gone. */
export const GRACE_MS = 30_000;

/** Sessions of one pool that may be at work at once. Your subscription's rate limit, mostly. */
export const DEFAULT_MAX_CONCURRENT = 3;

/** A live session is one the engine is still waiting on. `done`/`failed`/`stopped` are not. */
export const LIVE: ReadonlySet<Sighting['state']> = new Set(['working', 'blocked']);

/**
 * A session that holds a slot under the ceiling: one at work. Narrower than `LIVE` on purpose. A `blocked` session is
 * live — the engine waits on it — but one on a permission prompt makes no API calls, so it costs nothing against the
 * rate limit the ceiling exists for. Reasoning, not a measurement. Counted afresh every pass, so one that moves again
 * counts again on the next.
 */
const AT_WORK: ReadonlySet<Sighting['state']> = new Set(['working']);

export type TaskView = {
  id: string; state: State; phase: string;
  /** The session as its harness lists it — or, once the harness has let it go, its own id as recorded. */
  sessionId: string | null;
  /** What the attempt in flight has consumed so far, when its runner can see inside it. Settled attempts carry theirs on `state.attempts`. */
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
};

/** What `file` journals: a task as a person files it. */
export type Filing = {
  brief: string; cwd: string; maxAttempts?: number;
  harness?: string; config?: HarnessArgs; deadlineSeconds?: number; resume?: ResumePolicy; resumeFrom?: string;
  closeoutSchema?: object; budgetUsd?: number; priority?: number; id?: string;
};

/** A task `file` would not journal, and why, in the sentence `refusalOf` gives. Nothing was written. */
export class FileRefused extends Schema.TaggedError<FileRefused>()('FileRefused', {
  message: Schema.String,
}) {}

/** Exhaustive by type: a policy added to `ResumePolicy` and not here does not compile. */
const RESUME_POLICIES: Record<ResumePolicy, true> = { interrupted: true, always: true, never: true };

/**
 * Why a task cannot be filed, as a sentence that says what to write instead — or `undefined`: the half of it that is the
 * runtime's own, and no harness's.
 *
 * Checked by `file` itself, so neither door journals what the loop cannot use. A journalled task is a promise the loop
 * keeps trying to honour, so a value it cannot use is cheapest refused before it is written: `deadlineSeconds: NaN` was
 * journalled as `null` and stopped its task on the first pass. The harness's arguments under `config` are the runner's to
 * refuse (`argsRefusalOf` in `harness-args.ts`, asked through `Runner.refuses`), and `file` asks it next.
 * `createEngine().file()` asks both, then each harness for its own words (`harnessRefusalOf` in `facade.ts`), which this
 * door never learns (open issue 6).
 */
export const refusalOf = (spec: Filing): string | undefined => {
  if (typeof spec.brief !== 'string' || !spec.brief.trim()) return '`brief` is empty. Say what the session should do.';
  if (typeof spec.cwd !== 'string' || !spec.cwd) return '`cwd` is empty. Give the directory the session should work in.';
  // Resolved against whichever process ticks the task, which need not be the one filing it — and a
  // detached worker resolved it twice, from inside itself (`spawn sh ENOENT`, open issue 10).
  if (!path.isAbsolute(spec.cwd)) {
    return `\`cwd: ${spec.cwd}\` is not an absolute path, and the process that runs the task need not be the one filing it. Give the directory resolved — from here that is ${path.resolve(spec.cwd)}.`;
  }
  if (spec.maxAttempts !== undefined && !(Number.isInteger(spec.maxAttempts) && spec.maxAttempts >= 1)) {
    return `\`maxAttempts: ${spec.maxAttempts}\` is not a number of attempts. Give a whole number from 1.`;
  }
  if (spec.deadlineSeconds !== undefined && !(Number.isFinite(spec.deadlineSeconds) && spec.deadlineSeconds > 0)) {
    return `\`deadlineSeconds: ${spec.deadlineSeconds}\` is not a number of seconds. Give seconds above 0, or leave it out for no deadline.`;
  }
  if (spec.resume !== undefined && !Object.hasOwn(RESUME_POLICIES, spec.resume)) {
    return `\`resume: ${spec.resume}\` is not a retry policy. It is one of: ${Object.keys(RESUME_POLICIES).join(', ')}.`;
  }
  if (spec.resumeFrom === '') return '`resumeFrom` is empty. Leave it out to start cold.';
  if (spec.budgetUsd !== undefined && !(typeof spec.budgetUsd === 'number' && Number.isFinite(spec.budgetUsd) && spec.budgetUsd > 0)) {
    return `\`budgetUsd: ${typeof spec.budgetUsd === 'number' ? spec.budgetUsd : JSON.stringify(spec.budgetUsd)}\` is not an amount of dollars. Give dollars above 0, like 5 or 0.25, or leave it out for no cap.`;
  }
  if (spec.priority !== undefined && !(typeof spec.priority === 'number' && Number.isFinite(spec.priority))) {
    return `\`priority: ${typeof spec.priority === 'number' ? spec.priority : JSON.stringify(spec.priority)}\` is not a number. Give a finite number — a higher one is admitted first, and 0 is what no priority means — or leave it out.`;
  }
  return undefined;
};

/** File a task. The only write a person makes; everything after is the loop's. */
export const file = Effect.fn('file')(function* (spec: Filing) {
  const runner = yield* Runner;
  const refused = refusalOf(spec) ?? runner.refuses?.(spec);
  if (refused) return yield* Effect.fail(new FileRefused({ message: refused }));
  const journal = yield* Journal;
  // Long enough that two tasks filed in the same millisecond cannot share a journal file.
  const id = spec.id ?? `t-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  yield* journal.append(id, {
    kind: 'filed', at: new Date().toISOString(), brief: spec.brief, cwd: spec.cwd,
    maxAttempts: spec.maxAttempts ?? 1, harness: spec.harness, config: spec.config,
    deadlineSeconds: spec.deadlineSeconds, resume: spec.resume, resumeFrom: spec.resumeFrom,
    closeoutSchema: spec.closeoutSchema, budgetUsd: spec.budgetUsd, priority: spec.priority,
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
  // `blocked` is no answer: to `decide` it is live for ever. Measured — a step called
  // StructuredOutput, ended its turn, and was next seen `blocked`, idle — so a statement ends a
  // blocked attempt exactly as it ends a working one, or that attempt waits on a person until a deadline.
  if (!LIVE.has(seen.state)) return observed;
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
      // `resumeFrom` is journalled with it, and the nudge a continued session is told, so what an attempt
      // was told to continue, and what it was told, are facts on the record rather than re-derived later.
      yield* journal.append(taskId, { kind: 'starting', at: at(), attempt: action.attempt, resumeFrom: action.resumeFrom, nudge: action.nudge });
      break;

    case 'spawn': {
      // A spawn that fails is answered by what the harness can vouch for.
      //
      // `refused` — nothing started: the attempt ends `failed`, `unstartable`, in the harness's
      // words, and `decide` settles or retries it like any failure. Let out as an error instead, it
      // rejected the whole tick, and every task behind this one stalled on every pass.
      //
      // Anything else is no proof that nothing started: a launcher can create the session and lose
      // its acknowledgement. Ending that attempt left a working session nothing would adopt, stop or
      // bound, and a retry beside it. So the call is written down as having returned — `spawned`,
      // with its error — and the grace window `decide` already keeps for a session the harness has
      // not registered tells which it was: adopted if it shows up, `lost` if it never does.
      // What it continues and what it is told are taken from the journal rather than recomputed: the decision was
      // made when the attempt was started, possibly by an engine that has since died.
      const attempt = state.attempts.find((a) => a.n === action.attempt);
      const failed = yield* runner.spawn({
        name: action.name, brief: attempt?.nudge ?? state.brief, cwd: state.cwd, harness: state.harness,
        // The harness's arguments, handed on unopened: the runner's to read (`harness-args.ts`), never this loop's.
        config: state.config, closeoutSchema: state.closeoutSchema, budgetUsd: state.budgetUsd, resumeFrom: attempt?.resumeFrom,
      }).pipe(
        Effect.as(undefined),
        Effect.catchTag('RunnerError', (e) => Effect.succeed(e)),
      );
      yield* journal.append(taskId, failed?.refused
        ? { kind: 'ended', at: at(), attempt: action.attempt, sessionId: '(never started)', observed: 'failed', reason: 'unstartable', error: failed.message }
        : { kind: 'spawned', at: at(), attempt: action.attempt, ...(failed ? { error: failed.message } : {}) });
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

    case 'settle': {
      // An attempt left open has no `ended` to carry its session's id, so it is written here, read off the sighting as an
      // ending's facts are: what `logs` reads once the harness has let the session go. A fact for the record; `decide`
      // never reads it. Since P0.5 `decide` ends a stopped or timed-out attempt before it settles, so only a journal
      // from before settles over an open one; kept for the task that journal is replayed into.
      const last = state.attempts.at(-1);
      const open = last && last.ended === null ? observed.get(nameFor(taskId, last.n))?.nativeId : undefined;
      yield* journal.append(taskId, { kind: 'settled', at: at(), outcome: action.outcome, note: action.note, ...(open ? { nativeId: open } : {}) });
      break;
    }
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
 * Let the harness go of the sessions a task has finished with: every attempt whose end is on the
 * record and whose session the harness still lists. I/O applied to what the journal already says,
 * not a judgement — `decide` is not asked, and learns nothing.
 *
 * An attempt with a written end — or, in a task settled while it was open (stopped by a person, or
 * past its deadline), one whose session's id the `settled` entry recorded. A task settled before that id
 * was recorded keeps its session listed: released, `logs` would have nothing to read.
 *
 * Level-triggered like the rest: asked on every pass that still observes such a session, so a crash
 * between writing an end and releasing is repaired by the next pass. A release the harness refuses is
 * not the pass's failure; it is asked again.
 *
 * What the attempt consumed is written down here as well, when it says more than the record does (`measured`):
 * Claude Code writes a session's cost only as its process exits, which is after its end was written, so the read a
 * release takes once it has stopped the session is the first to have it — or, for a session left listed, the
 * sighting's. Written once: a session left listed is seen on every pass, and the second read says nothing new.
 */
const releaseFinished = Effect.fn('releaseFinished')(function* (state: State, observed: ReadonlyMap<string, Sighting>) {
  const runner = yield* Runner;
  const journal = yield* Journal;
  if (!runner.release) return;
  for (const attempt of state.attempts) {
    const finished = attempt.ended !== null || (state.settled !== null && attempt.nativeId !== null);
    const session = finished ? observed.get(nameFor(state.taskId, attempt.n)) : undefined;
    if (!session) continue;
    // The task's harness arguments, unopened: the runner reads there whether it cut a worktree it must keep.
    const released = yield* runner.release(session, state.config ?? {}).pipe(
      Effect.catchTag('RunnerError', () => Effect.succeed(undefined)),
    );
    const measured = typeof released === 'object' ? released : session.usage;
    // By value, not by key: `{ costUsd: undefined }` measured nothing, and a journal that writes JSON drops the key, so
    // asked by key it was new on every pass (found in review).
    if (measured && (Object.keys(measured) as Array<keyof Usage>).some((key) => measured[key] !== undefined && attempt.usage?.[key] === undefined)) {
      yield* journal.append(state.taskId, { kind: 'measured', at: new Date().toISOString(), attempt: attempt.n, usage: measured });
    }
  }
});

/** When a task was filed, in milliseconds — as a time, not a string, so `10:00:01Z` is after `10:00:00.500Z`. None that parses is after every other. */
const filedMs = (state: State) => {
  const ms = Date.parse(state.filedAt ?? '');
  return Number.isNaN(ms) ? Infinity : ms;
};

/**
 * A task's priority, 0 when it has none. One that is not a finite number — which `file` refuses, so only a journal written
 * before it did, or by hand, holds one, and a file journal writes back as `null` — is read as none, never as above or
 * below every other.
 */
const priorityOf = (state: State) => (Number.isFinite(state.priority) ? state.priority! : 0);

/**
 * The order a pass walks the board in, and so which waiting task a free slot goes to: the highest `priority` first; within
 * one, the oldest filing; and between two filed at the same instant, the ids' order, as `journal.list` sorts them. A retry
 * is ordered by its task's filing, not by when its last attempt ended: older work goes first.
 */
const admissionOrder = (a: State, b: State) =>
  priorityOf(b) - priorityOf(a) || filedMs(a) - filedMs(b) || (a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0);

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
 *
 * Observed at work, and only that: a `blocked` session is not counted, so blocked sessions that
 * move again can put a board past its ceiling. Nothing is stopped for it; nothing more is admitted
 * until the count is back under.
 *
 * Counted by POOL, because a ceiling is a rate limit and a rate limit is a subscription's, however
 * many harnesses run on it. `pools` names the pool each harness is counted in; a harness it does not
 * name is a pool of its own, under its own name. `createEngine` passes the pools its harnesses
 * declare; a caller of this door passes its own.
 *
 * **Which waiting task a free slot goes to is the order of this walk** (`admissionOrder`): the highest `priority`
 * first, then the oldest filing, and the ids' order only between two filed at the same instant. It was the ids' order
 * alone — `journal.list` sorts them — so which of two waiting tasks started was the alphabet of their names. `decide`
 * sees one task and two numbers, and never learns there is an order. Nothing running is stopped for a higher priority:
 * it is read when a slot is free, and only then.
 */
export const tick = Effect.fn('tick')(function* (
  maxConcurrent = DEFAULT_MAX_CONCURRENT,
  pools: Readonly<Record<string, string>> = {},
) {
  const journal = yield* Journal;
  const runner = yield* Runner;

  const observed = yield* runner.observe;
  const ids = yield* journal.list;

  // Which pool each session at work is counted in — the sighting does not say, so it comes from the
  // task that owns the name. Two small file reads per task per pass; the board is local and tiny.
  // At work, not live: a `blocked` session holds no slot (`AT_WORK`).
  const poolOf = (state: State) => {
    const harness = state.harness ?? 'default';
    return Object.hasOwn(pools, harness) ? pools[harness]! : harness;
  };
  const used = new Map<string, number>();
  const states = new Map<string, State>();
  for (const id of ids) {
    const state = fold(id, yield* journal.read(id));
    const pool = poolOf(state);
    states.set(id, state);
    const last = state.attempts.at(-1);
    if (last && last.ended === null) {
      const seen = observed.get(nameFor(id, last.n));
      if (seen && AT_WORK.has(seen.state)) used.set(pool, (used.get(pool) ?? 0) + 1);
    }
  }

  const taken: Action[] = [];
  for (const id of [...ids].sort((a, b) => admissionOrder(states.get(a)!, states.get(b)!))) {
    const pool = poolOf(states.get(id)!);
    const before = used.get(pool) ?? 0;
    const actions = yield* settleTask(id, observed, { used: before, max: maxConcurrent });
    taken.push(...actions);
    // A slot is spent the moment we journal the intent, not when the harness confirms it.
    if (actions.some((a) => a.do === 'start')) used.set(pool, before + 1);
    // Against the journal as this pass left it — so an end written just now is let go now — read again
    // only when the pass wrote to it.
    yield* releaseFinished(actions.some((a) => PROGRESSES.has(a.do)) ? fold(id, yield* journal.read(id)) : states.get(id)!, observed);
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
  // A released session is in no observation; the id its end was recorded with is what `logs` reads then.
  // Only where the phase this pass computed is `needs-human`: the word answers "waiting for what?", and there is no
  // question to answer about a session nobody is waiting on. Carried, not judged — `decide` never saw it.
  const waitingFor = phase === 'needs-human' ? sighting?.waitingFor : undefined;
  return { id: taskId, state, phase, sessionId: sighting?.sessionId ?? last?.nativeId ?? null, usage: sighting?.usage, ...(waitingFor ? { waitingFor } : {}) };
});

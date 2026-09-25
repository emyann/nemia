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
import { admissionOf, awaitsAdmission, decide, fold, nameFor, needsHuman, turnOf, waitsForInput, type Action, type Event, type Input, type Sighting, type State, type Usage } from './domain.ts';
import { Journal } from './journal.ts';
import { argsRefusalOf, configForTurn, turnArgsRefusalOf, type HarnessArgs } from './harness-args.ts';
import { Runner } from './runner.ts';

/** How long a spawned session may go unregistered by the harness before we call it gone. */
export const GRACE_MS = 30_000;

/** A live session is one the engine is still waiting on. `done`/`failed`/`stopped` are not. */
export const LIVE: ReadonlySet<Sighting['state']> = new Set(['working', 'blocked']);

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
  /**
   * Where a task filed `queued` stands with the layer above (stage 4c): `queued` while its current turn waits for the word
   * to start, `admitted` once given and until the next pass starts it. Beside the phase, never in it: the phase of either is
   * `pending` — or `between attempts`, for a later turn of a task held open — as it was before there was a word to wait for.
   * Absent for a task not filed queued, and once its turn has started. Off the record alone.
   */
  admission?: 'queued' | 'admitted';
};

/** What `file` journals: a task as a person files it. */
export type Filing = {
  brief: string; cwd: string;
  harness?: string; config?: HarnessArgs; deadlineSeconds?: number; resumeFrom?: string;
  closeoutSchema?: object; id?: string;
  /** Wait for a person when an attempt signs, rather than settle (R1): `answer` starts the next turn, `close` settles. */
  holdOpen?: true;
  /** Wait for `admit` before each turn starts, rather than start on the next pass (stage 4c). See the `filed` event. */
  queued?: boolean;
};

/** A task `file` would not journal, and why, in the sentence `refusalOf` gives. Nothing was written. */
export class FileRefused extends Schema.TaggedError<FileRefused>()('FileRefused', {
  message: Schema.String,
}) {}

/**
 * The keys a task was once filed with and is no longer: the runtime makes one attempt per start (stage 4a part 2). Each
 * is refused present, whatever its value — its old default included — since a key taken and then dropped is a promise
 * nobody keeps. The words say where trying again went. Shared with `ae`'s brief (`retiredBriefKey` in `cli.ts`).
 */
export const RETIRED_KEYS: Record<'maxAttempts' | 'resume', string> = {
  maxAttempts: 'the runtime makes one attempt per start, and trying again is the caller\'s',
  resume: 'the runtime makes one attempt per start, so there is no later attempt for a policy to continue or not',
};

/** What to do instead of a retired key: file the task again, or, in a workflow, let the orchestrator try again. */
export const RETIRED_INSTEAD = 'To run the task again, file it again — with `resumeFrom: <session id>` to continue its session. In a workflow, give the step `retries:`, or ask for a try with `wf retry <run> <step>` (`--nudge` continues the last try\'s session, `--fresh` starts clean).';

/** Why a key a task no longer takes is refused, and what to do instead. */
export const retiredKeyRefusal = (key: keyof typeof RETIRED_KEYS) => `\`${key}\` is retired: ${RETIRED_KEYS[key]}. ${RETIRED_INSTEAD}`;

/**
 * What to do instead of the runtime's retired ceiling, pools and priority (stage 4c part 2, 2026-09-25): the layer above
 * chooses what starts, and when. Shared by every refusal of them — `priority` here, the pass's arguments, `createEngine`'s
 * `maxConcurrent` and a harness's `pool` (`facade.ts`), and `AE_MAX_CONCURRENT` (`cli.ts`).
 */
export const ADMIT_INSTEAD = 'File tasks `queued: true` and `admit` each when it may start (`ae admit <id>`); in a workflow the orchestrator admits by pool under `WF_MAX_CONCURRENT`.';

/** Why a task filed with `priority`, at any value, is refused: the runtime chooses no order since it keeps no slots. */
export const PRIORITY_RETIRED = `\`priority\` is retired: the runtime starts a task on its next pass once it is admitted, so it chooses no order. ${ADMIT_INSTEAD}`;

/**
 * Why a task cannot be filed, as a sentence that says what to write instead — or `undefined`: the half of it that is the
 * runtime's own, and no harness's.
 *
 * Checked by `file` itself, so neither door journals what the loop cannot use. A journalled task is a promise the loop
 * keeps trying to honour, so a value it cannot use is cheapest refused before it is written: `deadlineSeconds: NaN` was
 * journalled as `null` and stopped its task on the first pass. The harness's arguments under `config` are the adapter's to
 * check (`argsRefusalOf` in `harness-args.ts`), and `file` asks those checks next, then the runner (`Runner.refuses`).
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
  // Asked of the spec as handed in, untyped: a caller built against the old `TaskSpec`, or from JSON, still sends them.
  for (const key of Object.keys(RETIRED_KEYS) as (keyof typeof RETIRED_KEYS)[]) if (Object.hasOwn(spec, key)) return retiredKeyRefusal(key);
  // Present, whatever its value, as the retired keys above: taken and dropped, it would promise an order nothing keeps.
  if (Object.hasOwn(spec, 'priority')) return PRIORITY_RETIRED;
  if (spec.deadlineSeconds !== undefined && !(Number.isFinite(spec.deadlineSeconds) && spec.deadlineSeconds > 0)) {
    return `\`deadlineSeconds: ${spec.deadlineSeconds}\` is not a number of seconds. Give seconds above 0, or leave it out for no deadline.`;
  }
  if (spec.resumeFrom === '') return '`resumeFrom` is empty. Leave it out to start cold.';
  if (spec.holdOpen !== undefined && spec.holdOpen !== true) {
    return `\`holdOpen: ${JSON.stringify(spec.holdOpen)}\` is not a yes. Give true to have the task wait for an answer when an attempt signs, or leave it out to settle it then.`;
  }
  if (spec.queued !== undefined && typeof spec.queued !== 'boolean') {
    return `\`queued: ${JSON.stringify(spec.queued)}\` is not a yes or a no. Give true to have the task wait for \`admit\` before it starts, or leave it out to start it on the next pass.`;
  }
  return undefined;
};

/** File a task. The only write a person makes; everything after is the loop's. */
export const file = Effect.fn('file')(function* (spec: Filing) {
  const runner = yield* Runner;
  // The shared checks are asked here as well as by `Runner.layer`: `Runner.of` is exported, and a runner built without the
  // layer — `sdkRunner` was — would otherwise journal a `config` no harness could use. The spec is handed on whole, unopened.
  const refused = refusalOf(spec) ?? argsRefusalOf(spec) ?? runner.refuses?.(spec);
  if (refused) return yield* Effect.fail(new FileRefused({ message: refused }));
  const journal = yield* Journal;
  // Long enough that two tasks filed in the same millisecond cannot share a journal file.
  const id = spec.id ?? `t-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  yield* journal.append(id, {
    kind: 'filed', at: new Date().toISOString(), brief: spec.brief, cwd: spec.cwd,
    harness: spec.harness, config: spec.config,
    deadlineSeconds: spec.deadlineSeconds, resumeFrom: spec.resumeFrom,
    closeoutSchema: spec.closeoutSchema, holdOpen: spec.holdOpen,
    // Always written, `false` too: a filing with no key is from before stage 4c, and reads as queued.
    queued: spec.queued === true,
  });
  return id;
});

/** An `admit` the runtime would not journal, and why, in words that say what to do instead. Nothing was written. */
export class AdmitRefused extends Schema.TaggedError<AdmitRefused>()('AdmitRefused', {
  message: Schema.String,
}) {}

/** Why `admit` would not take this task, or `undefined`: one it has no record of, or one that has settled. Off the record alone. */
export const admitRefusalOf = (taskId: string, state: State | undefined): string | undefined => {
  if (!state) return `\`${taskId}\` is not a task on this board. \`ae ls\`, or \`list()\`, gives the ones it has.`;
  if (state.settled) return `\`${taskId}\` has settled (${state.settled}): there is nothing left to start. File a task that continues its session (\`resumeFrom\`) to go on.`;
  return undefined;
};

/**
 * The layer above's word that queued tasks may start (stage 4c): journals `admitted` for each whose current turn waits for
 * it (`awaitsAdmission`), and returns those ids. The next pass starts them, under its own ceiling. Reads each task's
 * record and nothing else — no harness is asked — so it is a message, and can cross a seam. Idempotent: a task already
 * admitted, not filed queued, or whose turn has started is left as it is. Refused, and nothing written for any of them,
 * when one is not on the board or has settled.
 */
export const admit = Effect.fn('admit')(function* (taskIds: readonly string[]) {
  const journal = yield* Journal;
  const states: State[] = [];
  for (const id of new Set(taskIds)) {
    const events = yield* journal.read(id);
    const state = events.length ? fold(id, events) : undefined;
    const refused = admitRefusalOf(id, state);
    if (refused) return yield* Effect.fail(new AdmitRefused({ message: refused }));
    states.push(state!);
  }
  const admitted: string[] = [];
  for (const state of states) {
    if (!awaitsAdmission(state)) continue;
    yield* journal.append(state.taskId, { kind: 'admitted', at: new Date().toISOString() });
    admitted.push(state.taskId);
  }
  return admitted;
});

export const requestStop = Effect.fn('requestStop')(function* (taskId: string) {
  const journal = yield* Journal;
  yield* journal.append(taskId, { kind: 'stop-requested', at: new Date().toISOString() });
});

/** An answer or a close a task held open would not journal, and why, in words that say what to do instead. Nothing was written. */
export class InputRefused extends Schema.TaggedError<InputRefused>()('InputRefused', {
  message: Schema.String,
}) {}

/**
 * Why a task cannot take an answer or a close now — or `undefined`. Only a task held open that waits for one does
 * (`waitsForInput`): its current turn signed, nothing is running, and nothing has been said since — and an answer only one
 * whose signing session its harness recorded, since the answer is told to that session. Read off the record
 * alone, so it costs no registry call, and the same at both doors.
 */
const waitRefusalOf = (verb: 'answer' | 'close', taskId: string, state: State | undefined): string | undefined => {
  if (!state) return `\`${taskId}\` is not a task on this board. \`ae ls\`, or \`list()\`, gives the ones it has.`;
  if (!state.holdOpen) return `\`${taskId}\` was not filed to be held open, so it settles when an attempt signs and waits for nothing. File it with \`holdOpen: true\` to ${verb} it.`;
  if (state.settled) return `\`${taskId}\` has settled (${state.settled}): it waits for nothing. File a task that continues its session (\`resumeFrom\`) to go on.`;
  if (state.closed) return `\`${taskId}\` has been closed: the next pass settles it. File a task that continues its session (\`resumeFrom\`) to go on.`;
  if (state.stopRequested) return `\`${taskId}\` has been asked to stop: the next pass settles it.`;
  const last = state.attempts.at(-1);
  if (waitsForInput(state)) {
    return verb === 'answer' && !last!.nativeId
      ? `\`${taskId}\`'s attempt ${last!.n} signed, but its harness recorded no session for it, so there is no conversation for an answer to continue. \`close\` it, and file a task whose brief says the words.`
      : undefined;
  }
  if (!last) return `\`${taskId}\` has not started an attempt yet. Ask again once \`ae ls\` says \`input-required\`.`;
  if (last.ended === null) {
    return `\`${taskId}\`'s attempt ${last.n} is running.${verb === 'answer' ? ' `say` tells a running session something;' : ' `stop` ends it now;'} ask again once \`ae ls\` says \`input-required\`.`;
  }
  if ((last.turn ?? 0) < state.inputs.length) return `\`${taskId}\` has been answered already, and its next turn starts on the next pass. Ask again once \`ae ls\` says \`input-required\`.`;
  return `\`${taskId}\`'s attempt ${last.n} ended \`${last.ended}\`, and the task is between attempts, not waiting for an answer. Ask again once \`ae ls\` says \`input-required\`, or \`stop\` it.`;
};

/** Why `answer` would not journal these words — the words, what the turn gives its configuration, the task's state — or `undefined`. */
export const answerRefusalOf = (taskId: string, state: State | undefined, text: unknown, config?: unknown): string | undefined => {
  if (typeof text !== 'string' || !text.trim()) return '`text` is empty. Give the words the next turn should begin with.';
  return turnArgsRefusalOf(config) ?? waitRefusalOf('answer', taskId, state);
};

/** Why `close` would not journal a close, or `undefined`. */
export const closeRefusalOf = (taskId: string, state: State | undefined): string | undefined => waitRefusalOf('close', taskId, state);

/**
 * A person's answer to a task held open (R1) that waits for one. Journalled as an `input`, and returned; the next pass
 * starts the task's next turn — an attempt that continues the session that signed, told `text` — with `config` laid
 * over the task's own when given (`TURN_ARGS`: its spend cap). The configuration is the harness's to keep, so the one
 * the turn would start with is asked of it as a filing's is.
 */
export const answer = Effect.fn('answer')(function* (taskId: string, text: string, config?: HarnessArgs) {
  const journal = yield* Journal;
  const events = yield* journal.read(taskId);
  const state = events.length ? fold(taskId, events) : undefined;
  const runner = yield* Runner;
  const refused = answerRefusalOf(taskId, state, text, config)
    ?? (config && state ? runner.refuses?.(filingOf(state, config)) : undefined);
  if (refused) return yield* Effect.fail(new InputRefused({ message: refused }));
  const input: Input = { at: new Date().toISOString(), text, ...(config ? { config } : {}) };
  yield* journal.append(taskId, { kind: 'input', ...input });
  return input;
});

/** Settle a task held open that waits for an answer: `succeeded`, on the next pass. Journalled as `closed`. */
export const close = Effect.fn('close')(function* (taskId: string) {
  const journal = yield* Journal;
  const events = yield* journal.read(taskId);
  const refused = closeRefusalOf(taskId, events.length ? fold(taskId, events) : undefined);
  if (refused) return yield* Effect.fail(new InputRefused({ message: refused }));
  yield* journal.append(taskId, { kind: 'closed', at: new Date().toISOString() });
});

/** The task as it was filed, with a turn's own configuration laid over its own: what a harness is asked of an answer's. */
export const filingOf = (state: State, turn?: HarnessArgs): Filing => ({
  brief: state.brief, cwd: state.cwd, harness: state.harness, config: configForTurn(state.config, turn),
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
  // Its session not yet known: the end recorded now would carry none, and nothing records one on an ended attempt, so an answer,
  // or a later turn that continues the session, would have no conversation to go on. Codex writes `-o` and prints its thread on
  // a pipe the worker reads when it is next scheduled — under load, after. The session is known a pass later, or the harness's
  // own end brings what it printed.
  if (!seen.nativeId) return observed;
  return new Map(observed).set(name, { ...seen, state: 'done' });
};

/** A `step` or `settleTask` handed what it no longer takes, and why. Nothing was read or written. */
export class StepRefused extends Schema.TaggedError<StepRefused>()('StepRefused', {
  message: Schema.String,
}) {}

/**
 * Why `step` refuses what it was handed past the task and the observation. Until stage 4c part 2 (2026-09-25) its third
 * argument was the ceiling's `slots`, and a caller built against that door would have had it dropped without a word.
 */
export const stepRefusalOf = (extra: readonly unknown[]): string | undefined =>
  extra.length === 0 ? undefined
    : `step takes a task and an observation, and was handed ${extra.length} more: its third argument was the ceiling's slots, and the runtime has no ceiling since stage 4c part 2. ${ADMIT_INSTEAD}`;

/**
 * Why `settleTask` refuses its `maxSteps`: a count of steps is a whole number above nought. Its third argument was the
 * ceiling's `slots` until stage 4c part 2, and a `{ used, max }` in `maxSteps`'s place compares false and settles nothing.
 */
export const settleRefusalOf = (maxSteps: unknown, extra: readonly unknown[]): string | undefined =>
  Number.isInteger(maxSteps) && (maxSteps as number) > 0 && extra.length === 0 ? undefined
    : `settleTask takes a task, an observation and a number of steps above nought, and was handed ${extra.length ? `${extra.length} more` : `a maxSteps of ${typeof maxSteps === 'object' ? JSON.stringify(maxSteps) : String(maxSteps)}`}: its third argument was the ceiling's slots, and the runtime has no ceiling since stage 4c part 2. ${ADMIT_INSTEAD}`;

export const step = Effect.fn('step')(function* (
  taskId: string,
  observed: ReadonlyMap<string, Sighting>,
) {
  // Typed to take two, and asked all the same: a caller built against the old door still passes the ceiling's slots.
  const refused = stepRefusalOf([...arguments].slice(2));
  if (refused) return yield* Effect.fail(new StepRefused({ message: refused }));
  const journal = yield* Journal;
  const runner = yield* Runner;

  const state = fold(taskId, yield* journal.read(taskId));
  const action = decide(state, closedOut(state, observed), { at: new Date(), graceMs: GRACE_MS });
  const at = () => new Date().toISOString();

  switch (action.do) {
    case 'nothing':
      break;

    case 'start':
      // The intent is journalled BEFORE the spawn, and the session's name is derivable from it.
      // That ordering is the whole crash-safety story: a session we asked for always has a record,
      // and the record implies the name, so a restart finds it instead of starting a second one.
      // `resumeFrom` is journalled with it, and what a continued session is told in place of the brief (a later turn's
      // answer), so what an attempt was told to continue, and what it was told, are facts on the record rather than
      // re-derived later.
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
        // The harness's arguments, handed on unopened: the runner's to read (`harness-args.ts`), never this loop's. An
        // answer may give its turn its own (`answer`), laid over the filing's without being read; a task never answered has the filing's.
        config: configForTurn(state.config, turnOf(state, attempt?.turn ?? 0).config),
        closeoutSchema: state.closeoutSchema, resumeFrom: attempt?.resumeFrom,
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
      // What the attempt consumed, how its process exited, what its harness denied it and the limit it says it stopped at are
      // read off the same sighting the ending came from, and written beside it. Facts for the record; `decide` sees none of them.
      const seen = observed.get(nameFor(taskId, action.attempt));
      yield* journal.append(taskId, {
        kind: 'ended', at: at(), attempt: action.attempt, sessionId: action.sessionId,
        observed: action.observed, reason: action.reason, nativeId: action.nativeId,
        closeout: action.closeout, ...(action.stated !== undefined ? { stated: action.stated } : {}), usage: seen?.usage, exitCode: seen?.exitCode, denials: seen?.denials, limit: seen?.limit,
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
  maxSteps = 8,
) {
  const refused = settleRefusalOf(maxSteps, [...arguments].slice(3));
  if (refused) return yield* Effect.fail(new StepRefused({ message: refused }));
  const taken: Action[] = [];
  for (let i = 0; i < maxSteps; i++) {
    const action = yield* step(taskId, observed);
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

/** A tick that was handed an argument, and why. Nothing was read or written. */
export class TickRefused extends Schema.TaggedError<TickRefused>()('TickRefused', {
  message: Schema.String,
}) {}

/**
 * Why a pass refuses what it was handed: it takes nothing. Until stage 4c part 2 (2026-09-25) it took a ceiling and the
 * pools it counted in, and an untyped caller still passing `tick(3)` would have had its ceiling dropped without a word.
 */
export const tickRefusalOf = (args: readonly unknown[]): string | undefined =>
  args.length === 0 ? undefined
    : `the pass takes no arguments, and was handed ${args.length}: it has no ceiling and no pools since stage 4c part 2. ${ADMIT_INSTEAD}`;

/**
 * Whether an unsettled task's session is at work as the pass left it: its last attempt open, and its harness listing it
 * `working` — or not yet listing it, as one started this pass is not. A `blocked` session is waiting on a person, and is not.
 */
const atWork = (state: State, observed: ReadonlyMap<string, Sighting>): boolean => {
  const last = state.attempts.at(-1);
  if (!last || last.ended !== null) return false;
  const seen = observed.get(nameFor(state.taskId, last.n));
  return seen === undefined || seen.state === 'working';
};

/**
 * One pass over every task on the board. This is the whole daemon.
 *
 * Each task is stepped in the order `journal.list` gives, against one observation of every harness. The pass chooses
 * nothing: a task filed unqueued starts on it, and one filed `queued` starts on the pass after the layer above `admit`s it.
 * How many run at once, in which pool, and which first is that layer's (stage 4c) — the orchestrator's `toAdmit`, off the
 * `views` this pass returns.
 *
 * `running` is a count, per harness, of the sessions at work as the pass left them (`atWork`), off the same observation
 * and the fold the pass already made: what `ae tick` prints, and no rule reads.
 */
export const tick = Effect.fn('tick')(function* () {
  // Typed to take nothing, and asked all the same: an untyped caller, or one built against the old door, still passes a ceiling.
  const refused = tickRefusalOf([...arguments]);
  if (refused) return yield* Effect.fail(new TickRefused({ message: refused }));
  const journal = yield* Journal;
  const runner = yield* Runner;

  const observed = yield* runner.observe;
  const ids = yield* journal.list;

  const taken: Action[] = [];
  const views: TaskView[] = [];
  const running: Record<string, number> = {};
  for (const id of ids) {
    const before = fold(id, yield* journal.read(id));
    const actions = yield* settleTask(id, observed);
    taken.push(...actions);
    // Against the journal as this pass left it — so an end written just now is let go now — read again
    // only when the pass wrote to it.
    const after = actions.some((a) => PROGRESSES.has(a.do)) ? fold(id, yield* journal.read(id)) : before;
    yield* releaseFinished(after, observed);
    // The board as this pass left it, off its one observation and the fold it already made: what the layer above
    // admits by (stage 4c), with no second look at any harness.
    if (after.settled) continue;
    views.push(viewOfState(after, observed));
    if (atWork(after, observed)) running[after.harness ?? 'default'] = (running[after.harness ?? 'default'] ?? 0) + 1;
  }

  return {
    tasks: ids.length,
    actions: taken.filter((a) => a.do !== 'nothing').length,
    running,
    views,
  };
});

/** What a person wants to see. Derived, never stored. */
export const view = Effect.fn('view')(function* (taskId: string, observed: ReadonlyMap<string, Sighting>) {
  const journal = yield* Journal;
  return viewOfState(fold(taskId, yield* journal.read(taskId)), observed);
});

/** A task's view from its folded record and one observation. Pure: `view` reads the record for it, and `tick` hands in the fold it made. */
export function viewOfState(state: State, observed: ReadonlyMap<string, Sighting>): TaskView {
  const taskId = state.taskId;
  const last = state.attempts.at(-1);
  const sighting = last ? observed.get(nameFor(taskId, last.n)) : undefined;
  const live = last && last.ended === null ? sighting?.state : undefined;
  const phase = state.settled
    ? state.settled
    // Held open (R1), signed and waiting for a person's answer or close: A2A's TASK_STATE_INPUT_REQUIRED, and nothing running.
    : waitsForInput(state) ? 'input-required'
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
  const admission = admissionOf(state);
  return { id: taskId, state, phase, sessionId: sighting?.sessionId ?? last?.nativeId ?? null, usage: sighting?.usage, ...(waitingFor ? { waitingFor } : {}), ...(admission ? { admission } : {}) };
}

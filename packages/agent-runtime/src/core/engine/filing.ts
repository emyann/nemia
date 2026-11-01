/**
 * Filing a task and what comes after it from a person: admitting it, stopping it, answering it and closing it, each with
 * what it refuses. Each journals a fact and returns; the pass (`engine.ts`) acts on it.
 */
import { Effect, Schema } from 'effect';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { awaitsAdmission, fold, verbTakes, type Input, type State } from '../domain.ts';
import { Journal } from './journal.ts';
import { argsRefusalOf, configForTurn, turnArgsRefusalOf, type HarnessArgs } from '../../harness/args.ts';
import { Runner } from '../../harness/seam.ts';
import { labelsRefusalOf } from '../labels.ts';
import type { Implementation } from '@emyann/tsverify';
import type { StopSpec } from '../../../contracts/stop.contract.ts';

/** What `file` journals: a task as a person files it. */
export type Filing = {
  brief: string;
  /** The brief cut into parts that join into it, for a store that keeps each long part once. See `TaskSpec.briefParts`. */
  briefParts?: string[];
  cwd: string;
  harness?: string;
  config?: HarnessArgs;
  deadlineSeconds?: number;
  resumeFrom?: string;
  closeoutSchema?: object;
  id?: string;
  /** Wait for a person when an attempt ends, rather than settle: `answer` starts the next turn, `close` settles. */
  holdOpen?: true;
  /** Wait for `admit` before each turn starts, rather than start on the next pass. See the `filed` event. */
  queued?: boolean;
  /** Long-lived: the session stays open while idle, and only a stop ends it. See the `filed` event. */
  restartPolicy?: 'Always';
  /** Which waiting task a free slot goes to first, higher first: a whole number in int32. See the `filed` event. */
  priority?: number;
  /** The layer above's labels, said beside the task's id by its sessions' telemetry (`labelsRefusalOf`). See the `filed` event. */
  labels?: Record<string, string>;
  /** The trace context of the span that filed the task: set by the engine that exports, never by its caller. See the `filed` event. */
  traceparent?: string;
};

/** A task `file` would not journal, and why, in the sentence `refusalOf` gives. Nothing was written. */
export class FileRefused extends Schema.TaggedError<FileRefused>()('FileRefused', {
  message: Schema.String,
}) {}

/**
 * The keys a task refuses, since the runtime makes one attempt per start: each is refused present, whatever its value,
 * since a key taken and then dropped is a promise nobody keeps. The words say where trying again goes. `ae`'s brief
 * refuses the same keys in the same words (`RETIRED_BRIEF_KEYS` and `retiredKeyRefusal`, in `cli/main.ts`).
 */
export const RETIRED_KEYS: Record<'maxAttempts' | 'resume', string> = {
  maxAttempts: "the runtime makes one attempt per start, and trying again is the caller's",
  resume: 'the runtime makes one attempt per start, so there is no later attempt for a policy to continue or not',
};

/** What to do instead of a retired key: file the task again, or, in a workflow, let the orchestrator try again. */
export const RETIRED_INSTEAD =
  "To run the task again, file it again — with `resumeFrom: <session id>` to continue its session. In a workflow, give the step `retries:`, or ask for an attempt with `wf retry <run> <step>` (`--continue` continues the last attempt's session, `--fresh` starts clean).";

/** Why a key a task no longer takes is refused, and what to do instead. */
export const retiredKeyRefusal = (key: keyof typeof RETIRED_KEYS) => `\`${key}\` is retired: ${RETIRED_KEYS[key]}. ${RETIRED_INSTEAD}`;

/**
 * Where a ceiling and its pools go: the engine's own options, given to `Engine.layer` by the program that hosts it. Shared by every
 * refusal of a ceiling given anywhere else — the pass's arguments, and `AE_MAX_CONCURRENT` (`cli/main.ts`).
 */
export const CEILING_INSTEAD =
  "A ceiling is the engine's: give `Engine.layer` a `maxConcurrent`, and a harness a `pool` to share one with another; with none, file tasks `queued: true` and `admit` each when it may start (`ae admit <id>`).";

/** The largest priority a task takes: a Pod's priority is an int32. */
const PRIORITY_MOST = 2 ** 31 - 1;

/** Why a task's `priority` cannot be carried, or `undefined`: anything but a whole number in int32. */
const priorityRefusalOf = (priority: unknown): string | undefined =>
  priority === undefined ||
  (typeof priority === 'number' && Number.isInteger(priority) && priority >= -PRIORITY_MOST - 1 && priority <= PRIORITY_MOST)
    ? undefined
    : `\`priority: ${typeof priority === 'number' ? priority : JSON.stringify(priority)}\` is not a priority. Give a whole number from ${-PRIORITY_MOST - 1} to ${PRIORITY_MOST}, higher first, or leave it out for 0.`;

/**
 * Why a task cannot be filed, as a sentence that says what to write instead — or `undefined`: the half of it that is the
 * runtime's own, and no harness's. Asked in this order, the first that holds answering:
 *
 * 1. an empty `brief`, or an empty `cwd`;
 * 2. a `cwd` that is not absolute: it would resolve against whichever process ticks the task, which need not be the one
 *    filing it;
 * 3. a retired key (`RETIRED_KEYS`), present at any value: asked of the spec as handed in, untyped, since a caller built
 *    from JSON or against an older `TaskSpec` still sends them;
 * 4. a `deadlineSeconds` that is not seconds above 0, an empty `resumeFrom`, a `holdOpen` that is not `true`, a `queued`
 *    that is not a boolean, a `priority` that is not a whole number in int32, and `labels` it cannot carry (`labelsRefusalOf`);
 * 5. what a long-lived task cannot honour (`restartRefusalOf`).
 *
 * Checked by `file` itself, so no caller journals what the loop cannot use. A journalled task is a promise the loop
 * keeps trying to honour, so a value it cannot use is cheapest refused before it is written: `deadlineSeconds: NaN`
 * journals as `null` and would stop its task on the first pass. The harness's arguments under `config` are the adapter's to
 * check (`argsRefusalOf` in `harness/args.ts`), and `file` asks those checks next, then the runner (`Runner.refuses`).
 * The `file` of an engine `Engine.layer` builds asks both, then each harness for its own words (`harnessRefusalOf` in
 * `service/harness-refusal.ts`), which the core never learns.
 */
export const refusalOf = (spec: Filing): string | undefined => {
  if (typeof spec.brief !== 'string' || !spec.brief.trim()) return '`brief` is empty. Say what the session should do.';
  if (typeof spec.cwd !== 'string' || !spec.cwd) return '`cwd` is empty. Give the directory the session should work in.';
  if (!path.isAbsolute(spec.cwd)) {
    return `\`cwd: ${spec.cwd}\` is not an absolute path, and the process that runs the task need not be the one filing it. Give the directory resolved — from here that is ${path.resolve(spec.cwd)}.`;
  }
  for (const key of Object.keys(RETIRED_KEYS) as (keyof typeof RETIRED_KEYS)[]) if (Object.hasOwn(spec, key)) return retiredKeyRefusal(key);
  if (spec.deadlineSeconds !== undefined && !(Number.isFinite(spec.deadlineSeconds) && spec.deadlineSeconds > 0)) {
    return `\`deadlineSeconds: ${spec.deadlineSeconds}\` is not a number of seconds. Give seconds above 0, or leave it out for no deadline.`;
  }
  if (spec.resumeFrom === '') return '`resumeFrom` is empty. Leave it out to start cold.';
  if (spec.holdOpen !== undefined && spec.holdOpen !== true) {
    return `\`holdOpen: ${JSON.stringify(spec.holdOpen)}\` is not a yes. Give true to have the task wait for an answer when an attempt ends, or leave it out to settle it then.`;
  }
  if (spec.queued !== undefined && typeof spec.queued !== 'boolean') {
    return `\`queued: ${JSON.stringify(spec.queued)}\` is not a yes or a no. Give true to have the task wait for \`admit\` before it starts, or leave it out to start it on the next pass.`;
  }
  return priorityRefusalOf(spec.priority) ?? labelsRefusalOf(spec.labels) ?? partsRefusalOf(spec) ?? restartRefusalOf(spec);
};

/** Why a task's `briefParts` cannot be its brief's, or `undefined`: anything but a list of texts, or texts that do not join into it. */
const partsRefusalOf = ({ brief, briefParts }: Filing): string | undefined => {
  if (briefParts === undefined) return undefined;
  if (!Array.isArray(briefParts) || !briefParts.every((part) => typeof part === 'string')) {
    return `\`briefParts: ${JSON.stringify(briefParts)}\` is not a list of texts. Give the brief cut into parts, each a string, or leave it out.`;
  }
  if (briefParts.join('') !== brief) {
    return '`briefParts` do not join into `brief`: give parts that, put end to end, are the brief, or leave them out to keep the brief whole.';
  }
  return undefined;
};

/**
 * Why a task's `restartPolicy` cannot be honoured, or `undefined`: a value other than `'Always'`, and `'Always'` beside what
 * ends a session it keeps open until a stop — `holdOpen`, which settles a turn's end to wait for an answer; `deadlineSeconds`,
 * which stops it at a time; and `closeoutSchema`, whose statement ends an attempt.
 */
const restartRefusalOf = (spec: Filing): string | undefined => {
  if (spec.restartPolicy === undefined) return undefined;
  if (spec.restartPolicy !== 'Always') {
    return `\`restartPolicy: ${JSON.stringify(spec.restartPolicy)}\` is not a restart policy the runtime takes. Give \`'Always'\` to keep the session open until it is stopped, or leave it out to run the task to its end.`;
  }
  if (spec.holdOpen !== undefined)
    return "`restartPolicy: 'Always'` keeps the session open between turns, and `holdOpen` settles a turn's end to wait for an answer. Leave `holdOpen` off, and `say` the session its next words.";
  if (spec.deadlineSeconds !== undefined)
    return "`restartPolicy: 'Always'` keeps the session open until it is stopped, and `deadlineSeconds` would stop it at a time. Leave `deadlineSeconds` off, and `stop` the task when it should end.";
  if (spec.closeoutSchema !== undefined)
    return "`restartPolicy: 'Always'` keeps the session open until it is stopped, and a closing statement (`closeoutSchema`) would end its attempt. Leave `closeoutSchema` off.";
  return undefined;
};

/**
 * File a task. The only write a person makes; everything after is the loop's.
 *
 * Refused with `FileRefused`, and nothing journalled, by `refusalOf`, then the shared harness checks (`argsRefusalOf`), then
 * the runner (`Runner.refuses`), each handed the spec whole and unopened. The shared checks are asked here as well as by
 * `Runner.layer`: `Runner.of` is exported, and a runner built without the layer would otherwise journal a `config` no
 * harness could use.
 *
 * A task filed with no `id` gets `t-`, the time in base 36 and eight random hex digits, so two tasks filed in the same
 * millisecond never share a journal file. `queued` is always written, `false` too: a `filed` entry with no key, as an older
 * runtime wrote it, reads as queued.
 */
export const file = Effect.fn('file')(function* (spec: Filing) {
  const runner = yield* Runner;
  const refused = refusalOf(spec) ?? argsRefusalOf(spec) ?? runner.refuses?.(spec);
  if (refused) return yield* Effect.fail(new FileRefused({ message: refused }));
  const journal = yield* Journal;
  const id = spec.id ?? `t-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  yield* journal.append(
    id,
    {
      kind: 'filed',
      at: new Date().toISOString(),
      brief: spec.brief,
      cwd: spec.cwd,
      harness: spec.harness,
      config: spec.config,
      deadlineSeconds: spec.deadlineSeconds,
      resumeFrom: spec.resumeFrom,
      closeoutSchema: spec.closeoutSchema,
      holdOpen: spec.holdOpen,
      queued: spec.queued === true,
      ...(spec.priority !== undefined && spec.priority !== 0 ? { priority: spec.priority } : {}),
      ...(spec.restartPolicy === 'Always' ? { restartPolicy: 'Always' as const } : {}),
      ...(spec.labels !== undefined && Object.keys(spec.labels).length ? { labels: spec.labels } : {}),
      ...(spec.traceparent !== undefined ? { traceparent: spec.traceparent } : {}),
    },
    spec.briefParts,
  );
  return id;
});

/** An `admit` the runtime would not journal, and why, in words that say what to do instead. Nothing was written. */
export class AdmitRefused extends Schema.TaggedError<AdmitRefused>()('AdmitRefused', {
  message: Schema.String,
}) {}

/** Why `admit` would not take this task, or `undefined`: one it has no record of, or one that has settled. Off the record alone. */
export const admitRefusalOf = (taskId: string, state: State | undefined): string | undefined => {
  if (!state) return `\`${taskId}\` is not a task in this store. \`ae ls\`, or \`list()\`, gives the ones it has.`;
  if (state.settled)
    return `\`${taskId}\` has settled (${state.settled}): there is nothing left to start. File a task that continues its session (\`resumeFrom\`) to go on.`;
  return undefined;
};

/**
 * The layer above's word that queued tasks may start: journals `admitted` for each whose current turn waits for
 * it (`awaitsAdmission`), and returns those ids. The next pass starts them, whatever the engine's ceiling. Reads each task's
 * record and nothing else — no harness is asked — so it is a message, and can cross a seam. Idempotent: a task already
 * admitted, not filed queued, or whose turn has started is left as it is. Refused, and nothing written for any of them,
 * when one is not in the store or has settled.
 */
export const admit = Effect.fn('admit')(function* (taskIds: readonly string[]) {
  const journal = yield* Journal;
  const states: State[] = [];
  for (const id of new Set(taskIds)) {
    const events = yield* journal.read(id);
    const state = events.length ? fold(id, events) : undefined;
    const refused = admitRefusalOf(id, state);
    if (refused) return yield* Effect.fail(new AdmitRefused({ message: refused }));
    if (state) states.push(state);
  }
  const admitted: string[] = [];
  for (const state of states) {
    if (!awaitsAdmission(state)) continue;
    yield* journal.append(state.taskId, { kind: 'admitted', at: new Date().toISOString() });
    admitted.push(state.taskId);
  }
  return admitted;
});

/** A stop the runtime would not journal, and why, in words that say what to do instead. Nothing was written. */
export class StopRefused extends Schema.TaggedError<StopRefused>()('StopRefused', {
  message: Schema.String,
}) {}

/**
 * Why `requestStop` would not journal a stop, or `undefined`: a task it has no record of, and one its guard (`stoppable`, by
 * `verbTakes`) refuses — one that has settled, and one asked to stop already, whose next pass stops what runs and settles it.
 * Off the record alone, so it costs no registry call.
 */
export const stopRefusalOf = (taskId: string, state: State | undefined): string | undefined => {
  if (!state) return `\`${taskId}\` is not a task in this store. \`ae ls\`, or \`list()\`, gives the ones it has.`;
  if (verbTakes('requestStop', state)) return undefined;
  if (state.settled)
    return `\`${taskId}\` has settled (${state.settled}): there is nothing left to stop. File a task that continues its session (\`resumeFrom\`) to go on.`;
  return `\`${taskId}\` has been asked to stop already: the next pass stops what runs and settles it. \`ae ls\` says when it has.`;
};

/**
 * A person's word that a task stop: journalled as `stop-requested`, whatever it is doing; the next pass stops its session
 * and settles it `stopped`. Refused with `StopRefused`, and nothing journalled, for what `stopRefusalOf` refuses.
 */
export const requestStop: Implementation<StopSpec> = Effect.fn('requestStop')(function* (taskId) {
  const journal = yield* Journal;
  const events = yield* journal.read(taskId);
  const refused = stopRefusalOf(taskId, events.length ? fold(taskId, events) : undefined);
  if (refused) return yield* Effect.fail(new StopRefused({ message: refused }));
  yield* journal.append(taskId, { kind: 'stop-requested', at: new Date().toISOString() });
});

/** An answer or a close a task held open would not journal, and why, in words that say what to do instead. Nothing was written. */
export class InputRefused extends Schema.TaggedError<InputRefused>()('InputRefused', {
  message: Schema.String,
}) {}

/**
 * Why a task cannot take an answer or a close now — or `undefined`. Only a task its guard (`awaitsWord`, by `verbTakes`) takes
 * does: held open, its current turn ended, nothing running, nothing said since and no stop asked — and an answer only one
 * whose ending session its harness recorded, since the answer is told to that session. Otherwise the words say why not. Read
 * off the record alone, so it costs no registry call.
 */
const waitRefusalOf = (verb: 'answer' | 'close', taskId: string, state: State | undefined): string | undefined => {
  if (!state) return `\`${taskId}\` is not a task in this store. \`ae ls\`, or \`list()\`, gives the ones it has.`;
  const last = state.attempts.at(-1);
  if (verbTakes(verb, state)) {
    return verb === 'answer' && last !== undefined && !last.nativeId
      ? `\`${taskId}\`'s attempt ${last.n} ended, but its harness recorded no session for it, so there is no conversation for an answer to continue. \`close\` it, and file a task whose brief says the words.`
      : undefined;
  }
  if (!state.holdOpen)
    return `\`${taskId}\` was not filed to be held open, so it settles when an attempt ends and waits for nothing. File it with \`holdOpen: true\` to ${verb} it.`;
  if (state.settled)
    return `\`${taskId}\` has settled (${state.settled}): it waits for nothing. File a task that continues its session (\`resumeFrom\`) to go on.`;
  if (state.closed)
    return `\`${taskId}\` has been closed: the next pass settles it. File a task that continues its session (\`resumeFrom\`) to go on.`;
  if (state.stopRequested) return `\`${taskId}\` has been asked to stop: the next pass settles it.`;
  if (!last) return `\`${taskId}\` has not started an attempt yet. Ask again once \`ae ls\` says \`input-required\`.`;
  if (last.ended === null) {
    return `\`${taskId}\`'s attempt ${last.n} is running.${verb === 'answer' ? ' `say` tells a running session something;' : ' `stop` ends it now;'} ask again once \`ae ls\` says \`input-required\`.`;
  }
  if ((last.turn ?? 0) < state.inputs.length)
    return `\`${taskId}\` has been answered already, and its next turn starts on the next pass. Ask again once \`ae ls\` says \`input-required\`.`;
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
 * A person's answer to a task held open that waits for one. Journalled as an `input`, and returned; the next pass
 * starts the task's next turn — an attempt that continues the session that ended, told `text` — with `config` laid
 * over the task's own when given (`TURN_ARGS`: its spend cap). The configuration is the harness's to keep, so the one
 * the turn would start with is asked of it as a filing's is.
 */
export const answer = Effect.fn('answer')(function* (taskId: string, text: string, config?: HarnessArgs) {
  const journal = yield* Journal;
  const events = yield* journal.read(taskId);
  const state = events.length ? fold(taskId, events) : undefined;
  const runner = yield* Runner;
  const refused = answerRefusalOf(taskId, state, text, config) ?? (config && state ? runner.refuses?.(filingOf(state, config)) : undefined);
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
  brief: state.brief,
  cwd: state.cwd,
  harness: state.harness,
  config: configForTurn(state.config, turn),
});

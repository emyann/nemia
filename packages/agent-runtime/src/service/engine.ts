/**
 * The engine as an Effect service: `Engine`, built by `Engine.layer(options)` over the harnesses, the store and the memo, whose verbs
 * are Effects with typed errors. `promiseEngine` (`facade/engine.ts`) runs each verb of this service as a Promise.
 */
import { Cause, Context, Effect, Exit, Layer, Schema } from 'effect';
import path from 'node:path';
import os from 'node:os';
import {
  fold,
  idleOf,
  nameFor,
  isLive,
  pathOf,
  phaseWordOf,
  waitsOnPerson,
  type Attempt,
  type Input,
  type LifecycleStep,
  type Said,
  type Sighting,
  type State,
} from '../core/index.ts';
import {
  argsRefusalOf,
  Runner,
  RunnerError,
  isTranscriptCursor,
  noTranscript,
  composite,
  type ExpectedSession,
  type HarnessArgs,
  type RunnerOps,
  type Transcript,
  type TranscriptCursor,
} from '../harness/index.ts';
import {
  Journal,
  JournalError,
  FileRefused,
  TickRefused,
  AdmitRefused,
  InputRefused,
  StopRefused,
  ioCounts,
  tickMemoLayer,
  admit,
  answer,
  answerRefusalOf,
  close,
  file,
  filingOf,
  refusalOf,
  requestStop,
  everyView,
  tick,
  tickRefusalOf,
  viewOfState,
  viewsOf,
  type Cursor,
  type FeedEntry,
  type FeedRefusal,
  type TaskList,
  type TaskView,
} from '../core/engine/index.ts';
import { claudeSayRefuses, isClaudeJob, claudeDetached } from '../harness/claude/index.ts';
import { codex } from '../harness/codex/codex.ts';
import { a2aOps, type SeamOps } from '../a2a/index.ts';
import {
  journalOf,
  handleOf,
  isSpec,
  isRemote,
  isClaude,
  runnersOf,
  optionsRefusalOf,
  harnessRefusalOf,
  type EngineIo,
  type EngineOptions,
  type ObserveCount,
  type TaskSpec,
  type TickReport,
} from '../facade/consumer.ts';

/** Options an engine cannot be built from (`optionsRefusalOf`), and why. Nothing was built. */
export class EngineRefused extends Schema.TaggedError<EngineRefused>()('EngineRefused', {
  message: Schema.String,
}) {}

/** A `list` handed something other than task ids, or more than one argument, and why. Nothing was read. */
export class ListRefused extends Schema.TaggedError<ListRefused>()('ListRefused', {
  message: Schema.String,
}) {}

/** A transcript this engine will not read, and why: a task it has no record of, a harness that keeps none, a cursor no read gave. */
export class TranscriptRefused extends Schema.TaggedError<TranscriptRefused>()('TranscriptRefused', {
  message: Schema.String,
}) {}

/** Words `say` will not hand to a session, and why, in words that say what to do instead. Nothing was sent or journalled. */
export class SayRefused extends Schema.TaggedError<SayRefused>()('SayRefused', {
  message: Schema.String,
}) {}

/**
 * Words `say` could not hand over, or could not journal, for a reason that may pass: a registry that could not be read, a harness that
 * did not take them, a store that did not write. `cause` is what failed, when something did. Ask again.
 */
export class SayUnsent extends Schema.TaggedError<SayUnsent>()('SayUnsent', {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}

/** Why `list` refuses what it was handed, or `undefined` for nothing or one list of task ids. */
export const listRefusalOf = (args: readonly unknown[]): string | undefined => {
  const [taskIds] = args;
  return args.length > 1 || (taskIds !== undefined && (!Array.isArray(taskIds) || !taskIds.every((id) => typeof id === 'string')))
    ? `takes the task ids to view, a list of strings, or nothing for every task; it was handed ${args.map((a) => JSON.stringify(a)).join(', ')}.`
    : undefined;
};

/**
 * The engine's verbs, each an Effect with what refuses it on its error channel. Each does what the verb of the same name on
 * `agent-runtime`'s `Engine` does, where each is described, and fails with a tagged error where that one rejects with an `Error`
 * whose `exitCode` is 2: `FileRefused`, `TickRefused`, `AdmitRefused`, `ListRefused`, `TranscriptRefused`, `SayRefused`, `StopRefused`
 * for `stop`, and `InputRefused` for `answer` and `close`. `SayUnsent` is `say`'s failure that is not a refusal; a `JournalError` or a
 * `RunnerError` is the store's or the harness's. `watch`, `io` and `start` succeed at once: `watch` and `start` with a handle that stops
 * them.
 */
export type EngineShape = {
  readonly file: (spec: TaskSpec) => Effect.Effect<string, FileRefused | JournalError>;
  readonly tick: () => Effect.Effect<TickReport, TickRefused | JournalError | RunnerError>;
  readonly admit: (taskIds: readonly string[]) => Effect.Effect<string[], AdmitRefused | JournalError>;
  readonly view: (taskId: string) => Effect.Effect<TaskView, JournalError>;
  readonly path: (taskId: string) => Effect.Effect<LifecycleStep[], JournalError>;
  readonly list: (taskIds?: readonly string[]) => Effect.Effect<TaskList, ListRefused | JournalError | RunnerError>;
  readonly stop: (taskId: string) => Effect.Effect<void, StopRefused | JournalError>;
  readonly logs: (taskId: string) => Effect.Effect<string, JournalError | RunnerError>;
  readonly transcript: (
    taskId: string,
    after?: TranscriptCursor,
  ) => Effect.Effect<Transcript, TranscriptRefused | JournalError | RunnerError>;
  readonly say: (taskId: string, text: string) => Effect.Effect<Said, SayRefused | SayUnsent | JournalError>;
  readonly answer: (taskId: string, text: string, options?: { config?: HarnessArgs }) => Effect.Effect<Input, InputRefused | JournalError>;
  readonly close: (taskId: string) => Effect.Effect<void, InputRefused | JournalError>;
  readonly feed: (after?: Cursor) => Effect.Effect<{ entries: FeedEntry[]; cursor: Cursor; refused?: FeedRefusal[] }, JournalError>;
  readonly watch: (options: {
    onEntry: (entry: FeedEntry) => void | Promise<void>;
    from?: Cursor;
    intervalMs?: number;
    onError?: (e: unknown) => void;
  }) => Effect.Effect<{ stop: () => void }>;
  readonly io: () => Effect.Effect<EngineIo>;
  readonly start: (options?: {
    intervalMs?: number;
    onTick?: (r: TickReport) => void;
    onError?: (e: unknown) => void;
  }) => Effect.Effect<{ stop: () => void }>;
};

/**
 * The attempt `say` hands words to, read off the journal: the last, still running. Refused, in words that say what to do,
 * for a task settled, asked to stop, not started, or whose last attempt has ended. `resume` says how to go on instead.
 */
const openAttemptOf = (taskId: string, state: State, resume: string): { last: Attempt } | { refused: string } => {
  const last = state.attempts.at(-1);
  if (state.settled)
    return { refused: `\`${taskId}\` has settled (${state.settled}): no session of it is running to hear anything. ${resume}` };
  if (state.stopRequested) return { refused: `\`${taskId}\` has been asked to stop: its session is being stopped, not steered. ${resume}` };
  if (!last)
    return {
      refused: `\`${taskId}\` has not started an attempt yet, so there is no session to hear anything. Ask again once \`ae ls\` shows it running.`,
    };
  if (last.ended !== null) return { refused: `\`${taskId}\` has no attempt running: attempt ${last.n} ended \`${last.ended}\`. ${resume}` };
  return { last };
};

/** An observe count with nothing counted: a harness this engine has not observed yet. */
const NONE: ObserveCount = { calls: 0, ms: 0, listed: 0, spawned: 0, unread: 0 };

/** What failed, in words, off a cause: its error's message, or the value itself. */
const wordsOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * `start` over `tick`, a pass: one pass every `intervalMs` (3 s by default), none while the last still runs, each report handed to
 * `onTick` and each failure to `onError`, until the handle's `stop`.
 */
const startOf =
  (tick: EngineShape['tick']): EngineShape['start'] =>
  (o = {}) =>
    Effect.sync(() => {
      const every = o.intervalMs ?? 3_000;
      let running = false;
      let stopped = false;
      const timer = setInterval(async () => {
        if (running || stopped) return;
        running = true;
        try {
          o.onTick?.(await Effect.runPromise(tick()));
        } catch (e) {
          o.onError?.(e);
        } finally {
          running = false;
        }
      }, every);
      return {
        stop: () => {
          stopped = true;
          clearInterval(timer);
        },
      };
    });

/**
 * The engine over `options` that `Engine.layer` builds: the file-backed store under `root` (`~/.agent-engine` by default) or the
 * `journal` given, and the `harnesses` given — by default `claude`, `codex` and `claude-detached`. Built once, and shared by every verb:
 *
 * - the store, and for the file store its `subscribe`, which pushes to `watch`;
 * - each harness behind its A2A agent, reached through the SDK's client in this process (`a2a/client.ts`): the agent holds
 *   nothing, and answers a task it never started off the harness and this journal, so a restart loses no session. A remote
 *   agent is A2A already, spoken to by the SDK's client over HTTP, and wrapped in no seam of ours;
 * - every observe of a harness — a pass's, a view's, and an `observeFor`, an observe told what to look for — made through its
 *   runner and counted on the way (`ObserveCount`, `io`), where `spawned` says whether it asked a registry;
 * - one memo of the settled tasks its passes may skip (`core/engine/memo.ts`), which lives as long as this engine, so a new engine
 *   folds every task on its first pass.
 *
 * Fails with `EngineRefused` for what `optionsRefusalOf` refuses.
 */
const make = (options: EngineOptions) =>
  Effect.gen(function* () {
    const refused = optionsRefusalOf(options);
    if (refused) return yield* Effect.fail(new EngineRefused({ message: refused }));
    const root = options.root ?? path.join(os.homedir(), '.agent-engine');
    const harnesses = options.harnesses ?? {
      claude: 'claude',
      codex,
      'claude-detached': claudeDetached,
    };
    const fallback = options.defaultHarness ?? Object.keys(harnesses)[0] ?? 'claude';

    const journalOps = options.journal ? undefined : Journal.filesOps(root);
    const journal = options.journal ? journalOf(options.journal) : Journal.layer(journalOps!);
    const events = (taskId: string) => Effect.runPromise(Effect.flatMap(Journal, (j) => j.read(taskId)).pipe(Effect.provide(journal)));
    const observed: Record<string, ObserveCount> = {};
    const counted = <R extends RunnerOps>(name: string, ops: R): R => {
      const count = <A>(look: Effect.Effect<A, RunnerError>, read: (a: A) => { listed: number; unread: boolean }) =>
        Effect.suspend(() => {
          const t0 = performance.now();
          const spawned = ioCounts().spawned;
          return Effect.onExit(look, (exit) =>
            Effect.sync(() => {
              const o = (observed[name] ??= { ...NONE });
              o.calls++;
              o.ms += performance.now() - t0;
              o.spawned += ioCounts().spawned - spawned;
              const r = Exit.isSuccess(exit) ? read(exit.value) : { listed: 0, unread: true };
              o.listed += r.listed;
              if (r.unread) o.unread++;
            }),
          );
        });
      const observeFor = ops.observeFor;
      return {
        ...ops,
        observe: count(ops.observe, (m) => ({ listed: m.size, unread: false })),
        ...(observeFor
          ? {
              observeFor: (expected: readonly ExpectedSession[]) =>
                count(observeFor(expected), (o) => ({ listed: o.seen.size, unread: o.unread.size > 0 })),
            }
          : {}),
      };
    };
    const observedNow = (): Record<string, ObserveCount> =>
      Object.fromEntries(Object.entries(observed).map(([name, o]) => [name, { ...o }]));
    const runners = Object.fromEntries(
      Object.entries(runnersOf(harnesses, root, options.credentials, options.missingCredential)).map(([name, ops]): [string, SeamOps] => [
        name,
        counted(name, isRemote(harnesses[name]) ? ops : a2aOps(name, ops, events)),
      ]),
    );
    const layer = Layer.mergeAll(journal, Runner.layer(composite(runners, fallback)), tickMemoLayer());
    const go = <A, E>(e: Effect.Effect<A, E, Journal | Runner>): Effect.Effect<A, E> => e.pipe(Effect.provide(layer));
    const read = (taskId: string) => go(Effect.flatMap(Journal, (j) => j.read(taskId)));

    const harnessOf = (state: State) => {
      const asked = state.harness ?? fallback;
      return Object.hasOwn(runners, asked) ? asked : fallback;
    };

    const viewOf = (taskId: string) =>
      Effect.gen(function* () {
        const events = yield* Effect.flatMap(Journal, (j) => j.read(taskId));
        const state = fold(taskId, events);
        const last = state.attempts.at(-1);
        const { find, observe, observeFor } = runners[harnessOf(state)];
        const look = observeFor
          ? observeFor(state.attempts.map((a) => ({ name: nameFor(taskId, a.n), harness: state.harness }))).pipe(Effect.map((o) => o.seen))
          : observe;
        const observed = look.pipe(
          Effect.catchCause(() => Effect.succeed(new Map<string, Sighting>())),
          Effect.map((o) => viewOfState(state, o)),
        );
        const recorded = Effect.sync(() => viewOfState(state, new Map()));
        if (!Object.hasOwn(runners, state.harness ?? fallback)) return yield* recorded;
        if (!state.settled && (!find || last?.ended === null)) return yield* observed;
        if (!last || (find && last.nativeId)) return yield* recorded;
        const found = find ? yield* find(nameFor(taskId, last.n)).pipe(Effect.catchCause(() => Effect.succeed(undefined))) : undefined;
        if (found) return { ...(yield* recorded), sessionId: found.sessionId };
        if (!state.settled) return yield* observed;
        const v = yield* recorded;
        return { ...v, sessionId: handleOf(events, last.n) ?? v.sessionId };
      });

    const fileVerb = Effect.fn('Engine.file')(function* (spec: TaskSpec) {
      const task = { ...spec, harness: spec.harness ?? fallback };
      const refused = refusalOf(task) ?? argsRefusalOf(task) ?? harnessRefusalOf(task, harnesses);
      if (refused) return yield* Effect.fail(new FileRefused({ message: refused }));
      return yield* go(file(task));
    });

    const tickVerb = Effect.fn('Engine.tick')(function* () {
      const refused = tickRefusalOf([...arguments]);
      if (refused) return yield* Effect.fail(new TickRefused({ message: refused }));
      const t0 = performance.now();
      const before = observedNow();
      const report = yield* go(tick()).pipe(Effect.catchTag('TickMemoDiverged', (e) => Effect.die(e)));
      const during = Object.fromEntries(
        Object.entries(observedNow()).flatMap(([name, o]): Array<[string, ObserveCount]> => {
          const b = before[name] ?? NONE;
          return o.calls > b.calls
            ? [
                [
                  name,
                  {
                    calls: o.calls - b.calls,
                    ms: o.ms - b.ms,
                    listed: o.listed - b.listed,
                    spawned: o.spawned - b.spawned,
                    unread: o.unread - b.unread,
                  },
                ],
              ]
            : [];
        }),
      );
      return { ...report, ms: performance.now() - t0, observed: during };
    });

    const listVerb = Effect.fn('Engine.list')(function* (taskIds?: readonly string[]) {
      const refused = listRefusalOf([...arguments]);
      if (refused) return yield* Effect.fail(new ListRefused({ message: refused }));
      return yield* go(taskIds === undefined ? everyView() : viewsOf(taskIds));
    });

    const transcriptVerb = Effect.fn('Engine.transcript')(function* (taskId: string, after?: TranscriptCursor) {
      const refuse = (message: string) => Effect.fail(new TranscriptRefused({ message }));
      const events = yield* read(taskId);
      if (!events.length)
        return yield* refuse(`\`${taskId}\` is not a task on this board. \`ae ls\`, or \`list()\`, gives the ones it has.`);
      const state = fold(taskId, events);
      const harness = harnessOf(state);
      const transcriptOf = runners[harness].transcriptOf;
      if (!transcriptOf)
        return yield* refuse(
          `the \`${harness}\` harness keeps no conversation this engine can read. \`logs\` gives what its session printed.`,
        );
      const h = harnesses[harness];
      if (after !== undefined && (isClaude(h) || isSpec(h)) && !isTranscriptCursor(after)) {
        return yield* refuse(
          `\`${after}\` is not a cursor a transcript read gave. Pass the \`cursor\` the last read returned, or none to read from the start.`,
        );
      }
      const start = noTranscript().cursor;
      const nothing: Transcript = { events: [], cursor: after ?? start };
      const last = state.attempts.at(-1);
      if (!last) return nothing;
      return (yield* go(transcriptOf(nameFor(taskId, last.n), after === start ? undefined : after))) ?? nothing;
    });

    const sayVerb = Effect.fn('Engine.say')(function* (taskId: string, text: string) {
      const refuse = (message: string) => Effect.fail(new SayRefused({ message }));
      const resume = 'Continue its session with a new task that carries the words (`resumeFrom`), as `wf retry --message` does.';
      if (typeof text !== 'string' || !text.trim()) return yield* refuse('`text` is empty. Give the words the session should hear.');
      const events = yield* read(taskId);
      if (!events.length)
        return yield* refuse(`\`${taskId}\` is not a task on this board. \`ae ls\`, or \`list()\`, gives the ones it has.`);
      const state = fold(taskId, events);
      const harness = harnessOf(state);
      const runner = runners[harness];
      const h = harnesses[harness];
      const deliver = runner.say;
      if (!deliver) {
        return yield* refuse(
          (isSpec(h) ? h.noChannel : undefined) ?? `the \`${harness}\` harness has no channel into a running session. ${resume}`,
        );
      }
      const bgRefuses = () => claudeSayRefuses(state.config ?? {}, text);
      const cannot = h === 'claude-bg' || (h === 'claude' && state.config?.background) ? bgRefuses() : undefined;
      if (cannot) return yield* refuse(cannot);
      const open = openAttemptOf(taskId, state, resume);
      if ('refused' in open) return yield* refuse(open.refused);
      const { last } = open;
      const name = nameFor(taskId, last.n);
      const unsent = (message: (e: unknown) => string) =>
        Effect.catchCause((cause: Cause.Cause<unknown>) => {
          const e = Cause.squash(cause);
          return Effect.fail(new SayUnsent({ message: message(e), cause: e }));
        });
      const observed = yield* go(runner.observe).pipe(
        unsent(
          (e) =>
            `the \`${harness}\` registry could not be read (${wordsOf(e)}), so ${name} could not be found. Nothing was said; ask again.`,
        ),
      );
      const sighting = observed.get(name);
      if (!sighting && isClaude(h) && runner.find) {
        const registered = yield* go(runner.find(name)).pipe(Effect.catchCause(() => Effect.succeed(undefined)));
        if (registered)
          return yield* Effect.fail(
            new SayUnsent({
              message: `the \`${harness}\` registry could not be read, or did not list ${name}, which Claude Code has registered. Nothing was said; ask again.`,
            }),
          );
      }
      if (!sighting)
        return yield* refuse(
          `\`${taskId}\`'s attempt ${last.n} is not running yet: its harness lists no \`${name}\`. Ask again once \`ae ls\` shows it running.`,
        );
      const cannotBg = h === 'claude' && !isClaudeJob(sighting.sessionId) ? bgRefuses() : undefined;
      if (cannotBg) return yield* refuse(cannotBg);
      if (!isLive(sighting.state) && !idleOf(state, sighting)) {
        return yield* refuse(
          `\`${taskId}\`'s session is \`${phaseWordOf(sighting.state)}\` on its harness, not running: the next pass writes its end. ${resume}`,
        );
      }
      if (isRemote(h) && !waitsOnPerson(sighting.state)) {
        return yield* refuse(
          `\`${taskId}\` runs on the \`${harness}\` remote A2A agent, whose Task takes words only once it asks for input, and it is at work. Say them when \`ae ls\` shows it waiting, or ${resume.charAt(0).toLowerCase()}${resume.slice(1)}`,
        );
      }
      yield* go(deliver({ name, sessionId: sighting.sessionId }, text)).pipe(
        unsent((e) => `${name} was not given the words (${wordsOf(e)}). Nothing was journalled.`),
      );
      const said: Said = { at: new Date().toISOString(), attempt: last.n, text };
      yield* go(Effect.flatMap(Journal, (j) => j.append(taskId, { kind: 'said', ...said }))).pipe(
        unsent((e) => `${name} was given the words, but they could not be journalled (${wordsOf(e)}): the record does not show them.`),
      );
      return said;
    });

    const answerVerb = Effect.fn('Engine.answer')(function* (taskId: string, text: string, options: { config?: HarnessArgs } = {}) {
      const refuse = (message: string) => Effect.fail(new InputRefused({ message }));
      if (Object.hasOwn(options, 'budgetUsd')) {
        return yield* refuse(
          "`budgetUsd` is the harness's configuration: give it under `config`, as `answer(id, text, { config: { budgetUsd: … } })`.",
        );
      }
      const { config } = options;
      const events = yield* read(taskId);
      const state = events.length ? fold(taskId, events) : undefined;
      const refused =
        answerRefusalOf(taskId, state, text, config) ??
        (state && config ? harnessRefusalOf({ ...filingOf(state, config), harness: harnessOf(state) }, harnesses) : undefined);
      if (refused) return yield* refuse(refused);
      return yield* go(answer(taskId, text, config));
    });

    const feedVerb = (after: Cursor = 0) => go(Effect.flatMap(Journal, (j) => j.feed(after)));

    const watch: EngineShape['watch'] = ({ onEntry, from = 0, intervalMs = 1_000, onError }) =>
      Effect.sync(() => {
        let cursor = from;
        let stopped = false;
        let draining = false;

        const drain = async () => {
          if (stopped || draining) return;
          draining = true;
          try {
            for (;;) {
              const got = await Effect.runPromise(feedVerb(cursor));
              if (!got.entries.length && !got.refused?.length) break;
              cursor = got.cursor;
              for (const r of got.refused ?? []) onError?.(new Error(r.why));
              for (const entry of got.entries) {
                if (stopped) return;
                await onEntry(entry);
              }
            }
          } catch (e) {
            onError?.(e);
          } finally {
            draining = false;
          }
        };

        const unsubscribe = journalOps?.subscribe?.(() => void drain());
        const timer = setInterval(() => void drain(), intervalMs);
        void drain();

        return {
          stop: () => {
            stopped = true;
            clearInterval(timer);
            unsubscribe?.();
          },
        };
      });

    return Engine.of({
      file: fileVerb,
      tick: tickVerb,
      admit: (taskIds) => go(admit(taskIds)),
      view: (taskId) => go(viewOf(taskId)),
      path: (taskId) => read(taskId).pipe(Effect.map((events) => pathOf(taskId, events))),
      list: listVerb,
      stop: (taskId) => go(requestStop(taskId)),
      logs: (taskId) =>
        go(
          Effect.gen(function* () {
            const v = yield* viewOf(taskId);
            if (!v.sessionId) return '(no session yet)';
            return yield* runners[harnessOf(v.state)].logs(v.sessionId);
          }),
        ),
      transcript: transcriptVerb,
      say: sayVerb,
      answer: answerVerb,
      close: (taskId) => go(close(taskId)),
      feed: feedVerb,
      watch,
      io: () => Effect.sync(() => ({ ...ioCounts(), observed: observedNow() })),
      start: startOf(tickVerb),
    });
  });

/**
 * The engine, as a service. `Engine.layer(options)` builds one from `EngineOptions`, failing with `EngineRefused` for what
 * `optionsRefusalOf` refuses; a test provides its own with `Layer.succeed(Engine)(Engine.of({ ... }))`. The default harness,
 * `defaultHarness` or else the first, takes a task that names none, and answers `logs`, `transcript` and `say` for a task whose
 * harness this engine does not have, whose `view` asks no harness.
 */
export class Engine extends Context.Service<Engine, EngineShape>()('agent-runtime/Engine') {
  static readonly layer = (options: EngineOptions = {}): Layer.Layer<Engine, EngineRefused> => Layer.effect(Engine, make(options));
}

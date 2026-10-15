/**
 * A test's hand fake of the engine, written with the Promise methods the tests were written against, as the runtime's engine the
 * controllers take (`Engine`): each method an Effect verb (`promised`), and the runtime's own engine over a layer of a test's, as the
 * runtime files it (`plainEngine`). A test's hand harness (`AsyncRunner`) and store (`AsyncJournal`), in async methods, as the runtime's
 * `RunnerOps` and `StoreOps` (`asyncOps`, `asyncStore`). Test-only, read by the package's typecheck.
 */
import { Context, Effect, Layer, Scope } from 'effect';
import {
  Engine as RuntimeEngine,
  JournalError,
  RunnerError,
  type Cursor,
  type Event,
  type FeedEntry,
  type RunnerOps,
  type Sighting,
  type SpawnRequest,
  type StoreOps,
} from 'agent-runtime';
import type { Engine } from '../src/runtime-client.ts';

type Verb = (...args: unknown[]) => unknown;

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof value === 'object' && value !== null && typeof (value as { then?: unknown }).then === 'function';

/**
 * `fake` as an `Engine`: each function it has becomes a verb that calls it when run, succeeding with what it returns or resolves, failing
 * with what it throws or rejects with, as it was thrown. What the fake does not have stays missing, so a call to it dies as a call to
 * nothing; a value that is no function is kept as it is. Its `hold` holds nothing, unless `fake` gives one.
 * A daemon takes it as it starts.
 *
 * @param fake The methods a test gives the engine, each sync or async, each answering what the Promise engine answered.
 * @returns The engine whose every verb is an Effect over `fake`'s method of that name.
 */
export const promised = (fake: object): Engine =>
  Object.fromEntries(
    Object.entries({ hold: () => undefined, ...fake }).map(([name, value]) => [
      name,
      typeof value === 'function'
        ? (...args: unknown[]) =>
            Effect.suspend(() =>
              Effect.try({ try: () => (value as Verb).apply(fake, args), catch: (err) => err }).pipe(
                Effect.flatMap((answer) =>
                  isThenable(answer) ? Effect.tryPromise({ try: () => answer, catch: (err) => err }) : Effect.succeed(answer),
                ),
              ),
            )
        : value,
    ]),
  ) as unknown as Engine;

/**
 * The runtime's engine over `layer`, as the runtime builds it: a task filed starts on the next pass, where the client's `engineOf` files
 * every task `queued`, to wait for an admission under a ceiling. Built at the call, with no scope to close.
 *
 * @param layer A layer that provides the runtime's `Engine` service, over an in-memory journal and the harnesses a test signs by hand.
 * @returns The engine, every verb an Effect.
 */
export const plainEngine = <E>(layer: Layer.Layer<RuntimeEngine, E>): Engine =>
  Effect.runSync(
    Layer.build(layer).pipe(
      Effect.map((context) => Context.get(context, RuntimeEngine)),
      Effect.provideService(Scope.Scope, Scope.makeUnsafe()),
    ),
  );

/** A hand harness, in async methods, every session's state in A2A's names: what `asyncOps` makes a `RunnerOps` of. */
export type AsyncRunner = {
  spawn(r: SpawnRequest): Promise<void>;
  observe(): Promise<Map<string, Sighting>>;
  stop(sessionId: string): Promise<void>;
  logs(sessionId: string): Promise<string>;
  output?(name: string, stream: 'stdout' | 'stderr', lastBytes?: number): Promise<string | undefined>;
  say?(session: { name: string; sessionId: string }, text: string): Promise<void>;
};

/** A hand store, in async methods: what `asyncStore` makes a `StoreOps` of. */
export type AsyncJournal = {
  append(taskId: string, event: Event): Promise<void>;
  read(taskId: string): Promise<Event[]>;
  list(): Promise<string[]>;
  feed(after?: Cursor): Promise<{ entries: FeedEntry[]; cursor: Cursor }>;
};

/** A Promise a fake answers, as an Effect that fails with `onError` of its rejection's message. */
const wrap = <A, E>(f: () => Promise<A>, onError: (message: string) => E) =>
  Effect.tryPromise({ try: f, catch: (cause) => onError(cause instanceof Error ? cause.message : String(cause)) });

/**
 * `h` as the runtime's harness: each rejection a `RunnerError` of the verb it was asked, a spawn's `refused` when its error says
 * `refused: true`, so the attempt ends `unstartable` at once.
 *
 * @param h The hand harness.
 * @returns Its `RunnerOps`, with an `output` and a `say` only where `h` has them.
 */
export const asyncOps = (h: AsyncRunner): RunnerOps => ({
  spawn: (r) =>
    Effect.tryPromise({
      try: () => h.spawn(r),
      catch: (cause) =>
        new RunnerError({
          verb: 'spawn',
          message: cause instanceof Error ? cause.message : String(cause),
          ...((cause as { refused?: unknown } | null)?.refused === true ? { refused: true } : {}),
        }),
    }),
  observe: wrap(
    () => h.observe(),
    (message) => new RunnerError({ verb: 'observe', message }),
  ),
  stop: (id) =>
    wrap(
      () => h.stop(id),
      (message) => new RunnerError({ verb: 'stop', message }),
    ),
  logs: (id) =>
    wrap(
      () => h.logs(id),
      (message) => new RunnerError({ verb: 'logs', message }),
    ),
  ...(h.output
    ? {
        output: (name: string, stream: 'stdout' | 'stderr', lastBytes?: number) =>
          wrap(
            () => h.output!(name, stream, lastBytes),
            (message) => new RunnerError({ verb: 'output', message }),
          ),
      }
    : {}),
  ...(h.say
    ? {
        say: (session: { name: string; sessionId: string }, text: string) =>
          wrap(
            () => h.say!(session, text),
            (message) => new RunnerError({ verb: 'say', message }),
          ),
      }
    : {}),
});

/**
 * `j` as the runtime's store: each rejection a `JournalError`, on the task it was asked of, or `*`.
 *
 * @param j The hand store.
 * @returns Its `StoreOps`.
 */
export const asyncStore = (j: AsyncJournal): StoreOps => ({
  append: (taskId, event) =>
    wrap(
      () => j.append(taskId, event),
      (message) => new JournalError({ taskId, message }),
    ),
  read: (taskId) =>
    wrap(
      () => j.read(taskId),
      (message) => new JournalError({ taskId, message }),
    ),
  list: wrap(
    () => j.list(),
    (message) => new JournalError({ taskId: '*', message }),
  ),
  feed: (after) =>
    wrap(
      () => j.feed(after),
      (message) => new JournalError({ taskId: '*', message }),
    ),
});

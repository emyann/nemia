/**
 * A test's hand fake of the engine, written with the Promise methods the tests were written against, as the runtime's engine the
 * controllers take (`Engine`): each method an Effect verb (`promised`), and the runtime's own engine over a layer of a test's, as the
 * runtime files it (`plainEngine`). Test-only, read by the package's typecheck.
 */
import { Context, Effect, Layer, Scope } from 'effect';
import { Engine as RuntimeEngine } from 'agent-runtime/effect';
import type { Engine } from '../src/runtime-client.ts';

type Verb = (...args: unknown[]) => unknown;

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof value === 'object' && value !== null && typeof (value as { then?: unknown }).then === 'function';

/**
 * `fake` as an `Engine`: each function it has becomes a verb that calls it when run, succeeding with what it returns or resolves, failing
 * with what it throws or rejects with, as it was thrown. What the fake does not have stays missing, so a call to it dies as a call to
 * nothing; a value that is no function is kept as it is.
 *
 * @param fake The methods a test gives the engine, each sync or async, each answering what the Promise engine answered.
 * @returns The engine whose every verb is an Effect over `fake`'s method of that name.
 */
export const promised = (fake: object): Engine =>
  Object.fromEntries(
    Object.entries(fake).map(([name, value]) => [
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

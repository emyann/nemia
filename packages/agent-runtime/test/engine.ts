/**
 * The engine a test drives: the `Engine` service a layer builds, built at the call with no scope to close. Test-only, read by the
 * package's typecheck.
 */
import { Cause, Context, Effect, Exit, Layer, Scope } from 'effect';
import { Engine, type EngineShape } from '../src/index.ts';

/**
 * The `Engine` of `layer`, built once and at once, every verb an Effect a test runs (`Effect.runPromise`, `Effect.runSync`).
 *
 * @param layer A layer that provides the `Engine` service, `Engine.layer(options)` as a rule.
 * @returns The engine's verbs.
 * @throws What the layer failed with, as it failed: an `EngineRefused` for options the engine refuses.
 */
export const builtEngine = <E>(layer: Layer.Layer<Engine, E>): EngineShape => {
  const built = Effect.runSyncExit(
    Layer.build(layer).pipe(
      Effect.map((context) => Context.get(context, Engine)),
      Effect.provideService(Scope.Scope, Scope.makeUnsafe()),
    ),
  );
  if (Exit.isFailure(built)) throw Cause.squash(built.cause);
  return built.value;
};

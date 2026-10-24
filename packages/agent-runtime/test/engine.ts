/**
 * The engine a test drives: the `Engine` service a layer builds, built at the call with no scope to close. Test-only, read by the
 * package's typecheck.
 *
 * It imports `src` statically: a test that sets an environment variable read at load (`CLAUDE_CONFIG_DIR`) before a dynamic import of
 * `src` imports this file dynamically too, or `src` is loaded before the variable is set.
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

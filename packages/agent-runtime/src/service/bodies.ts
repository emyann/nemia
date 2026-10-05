/**
 * The engine's verbs over the store's bodies, `sweep` and `removeBody`, as `Engine` gives them.
 */
import { Effect } from 'effect';
import { BodyRefused, Journal } from '../core/engine/index.ts';
import type { EngineShape } from './engine.ts';

/**
 * `sweep` and `removeBody` over `go`, the engine's store: each the store's own (`JournalShape`), behind a refusal of an argument it
 * does not take. `sweep` takes nothing or `{ yes }`, a boolean; `removeBody` one body's reference.
 */
export const bodyVerbsOf = (
  go: <A, E>(e: Effect.Effect<A, E, Journal>) => Effect.Effect<A, E>,
): Pick<EngineShape, 'sweep' | 'removeBody'> => ({
  sweep: Effect.fn('Engine.sweep')(function* (options?: { yes?: boolean }) {
    const args = [...arguments];
    const taken =
      args.length === 0 ||
      (args.length === 1 &&
        (options === undefined ||
          (typeof options === 'object' &&
            options !== null &&
            Object.keys(options).every((key) => key === 'yes') &&
            (options.yes === undefined || typeof options.yes === 'boolean'))));
    if (!taken) {
      return yield* Effect.fail(
        new BodyRefused({
          message: `takes nothing to count the bodies no journal names, or \`{ yes: true }\` to remove them; it was handed ${args.map((a) => JSON.stringify(a)).join(', ')}.`,
        }),
      );
    }
    return yield* go(Effect.flatMap(Journal, (j) => j.sweep(options)));
  }),
  removeBody: Effect.fn('Engine.removeBody')(function* (ref: string) {
    return yield* go(Effect.flatMap(Journal, (j) => j.removeBody(ref)));
  }),
});

/**
 * The engine's `watch`, built on its `feed`.
 */
import { Effect } from 'effect';
import type { EngineShape } from './engine.ts';

/**
 * `watch` over `feed`: each entry since `from` handed to `onEntry` in order, at least once, the next only once the last's promise
 * settles; drained on each push of `subscribe`, the store's when it can signal, and every `intervalMs` (1 s by default) for one that
 * cannot or an event that is dropped, one drain at a time. A feed entry skipped as no runtime's, and any failure, goes to `onError`.
 * Succeeds at once with a handle whose `stop` ends it.
 */
export const watchOf =
  (feed: EngineShape['feed'], subscribe?: (onChange: () => void) => () => void): EngineShape['watch'] =>
  ({ onEntry, from = 0, intervalMs = 1_000, onError }) =>
    Effect.sync(() => {
      let cursor = from;
      let stopped = false;
      let draining = false;

      const drain = async () => {
        if (stopped || draining) return;
        draining = true;
        try {
          for (;;) {
            const got = await Effect.runPromise(feed(cursor));
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

      const unsubscribe = subscribe?.(() => void drain());
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

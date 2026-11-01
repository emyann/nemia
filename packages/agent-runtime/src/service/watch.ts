/**
 * The engine's `watch`, built on its `feed`.
 */
import { Effect } from 'effect';
import type { EngineShape } from './engine.ts';

/**
 * `watch` over `feed`: each entry since `from` handed to `onEntry` in order, at least once, the next only once the last's promise
 * settles; drained on each push of `subscribe`, the store's when it can signal, and every `intervalMs` (1 s by default) for one that
 * cannot or an event that is dropped, one drain at a time: a push heard while a drain runs has that drain read the feed again before it
 * ends, so a write that raced it is not left for the interval. A feed entry skipped as no runtime's, and any failure, goes to `onError`.
 * Succeeds at once with a handle whose `stop` ends it.
 */
export const watchOf =
  (feed: EngineShape['feed'], subscribe?: (onChange: () => void) => () => void): EngineShape['watch'] =>
  ({ onEntry, from = 0, intervalMs = 1_000, onError }) =>
    Effect.sync(() => {
      let cursor = from;
      let stopped = false;
      let draining = false;
      let again = false;

      const readToEnd = async () => {
        for (;;) {
          const got = await Effect.runPromise(feed(cursor));
          if (!got.entries.length && !got.refused?.length) return;
          cursor = got.cursor;
          for (const r of got.refused ?? []) onError?.(new Error(r.why));
          for (const entry of got.entries) {
            if (stopped) return;
            await onEntry(entry);
          }
        }
      };

      const drain = async () => {
        if (stopped) return;
        if (draining) {
          again = true;
          return;
        }
        draining = true;
        try {
          do {
            again = false;
            await readToEnd();
          } while (again);
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

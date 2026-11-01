/**
 * The moment an entry is journalled, as the pass writes it (`engine.ts`).
 */
import type { Monotonic } from '../clock.ts';
import type { Event } from '../domain.ts';
import { instantNow } from './now.ts';

/** When an entry is journalled: its `at`, and the same moment on the monotonic clock where there is one (a start, spawn, end or gap). */
export const stamped = (): { at: string; mono?: Monotonic } => {
  const now = instantNow();
  return { at: new Date(now.at).toISOString(), ...(now.mono ? { mono: now.mono } : {}) };
};

/** The `spawned` entry of `attempt`, stamped now, with the error its spawn call returned when it returned one. */
export const spawnedEntry = (attempt: number, error: string | undefined): Event => ({
  kind: 'spawned',
  ...stamped(),
  attempt,
  ...(error !== undefined ? { error } : {}),
});

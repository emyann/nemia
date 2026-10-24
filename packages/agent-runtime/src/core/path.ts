/**
 * A task's path through its lifecycle, replayed off its journal: where it stood after each entry, from its filing to now. Pure over the
 * journal, as `lifecycleOf` is over a fold of it; nothing is written and no harness is asked.
 */
import { fold, lifecycleOf, type Event } from './domain.ts';
import type { LifecycleState } from './lifecycle.ts';

/**
 * One transition of a task's path: the lifecycle state its journal says once `event` is on it, the kind of that entry, and the entry's
 * `at`.
 * The event is the journal's word, never the machine's: a sighting moves the machine, and no sighting is journalled.
 */
export type LifecycleTransition = { state: LifecycleState; event: Event['kind']; at: string };

/**
 * The path of task `taskId` over its journal `events`, in order: one step per entry, the state read off the fold of the journal up to
 * and with it. An empty journal is an empty path. Folds every prefix, so it costs the square of the journal's length: a reader's verb,
 * never a pass's.
 */
export function pathOf(taskId: string, events: readonly Event[]): LifecycleTransition[] {
  return events.map((event, i) => ({ state: lifecycleOf(fold(taskId, events.slice(0, i + 1))), event: event.kind, at: event.at }));
}

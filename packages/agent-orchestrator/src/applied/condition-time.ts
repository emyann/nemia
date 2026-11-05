/**
 * When a templated factory's condition last moved (`transitionedAt`, proved by contracts/condition-time.contract.ts): the
 * `lastTransitionTime` the controller writes on each condition of its `status.json`, kept while the status holds and stamped with the
 * pass's time where it moves, is new, or was kept with none, as Kubernetes' SetStatusCondition keeps it. Pure.
 */
import type { TransitionedAt } from '../../contracts/condition-time.contract.ts';

/**
 * The time the condition of status `status` last moved, observed at `now`, against `before`, the condition of its type the file held:
 * its time where its status is the same and it has one, `now` otherwise.
 */
export const transitionedAt: TransitionedAt = (before, status, now) =>
  before !== null && before.status === status && before.lastTransitionTime !== null ? before.lastTransitionTime : now;

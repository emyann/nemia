/**
 * What `reconcile` and `settleTask` refuse past the task and the observation (`ReconcileRefused`): a caller built against the doors
 * that took the ceiling's slots third, which are the engine's own now. Nothing is read or written for a refused call.
 */
import { Schema } from 'effect';
import { CEILING_INSTEAD } from './filing.ts';

/** A `reconcile` or `settleTask` handed what it no longer takes, and why. Nothing was read or written. */
export class ReconcileRefused extends Schema.TaggedError<ReconcileRefused>()('ReconcileRefused', {
  message: Schema.String,
}) {}

/**
 * Why `reconcile` refuses what it was handed past the task and the observation, or `undefined` when it was handed nothing more:
 * a caller built against a `reconcile` that took the ceiling's `slots` third would otherwise have them dropped without a word.
 */
export const reconcileRefusalOf = (extra: readonly unknown[]): string | undefined =>
  extra.length === 0
    ? undefined
    : `reconcile takes a task and an observation, and was handed ${extra.length} more: its third argument was the ceiling's slots, and a ceiling is the engine's own now. ${CEILING_INSTEAD}`;

/**
 * Why `settleTask` refuses its `maxSteps`, or `undefined`: a count of steps is a whole number above nought, and nothing
 * follows it. A caller built against a `settleTask` that took the ceiling's `slots` third hands a `{ used, max }` in
 * `maxSteps`'s place, which compares false and would settle nothing.
 */
export const settleRefusalOf = (maxSteps: unknown, extra: readonly unknown[]): string | undefined =>
  Number.isInteger(maxSteps) && (maxSteps as number) > 0 && extra.length === 0
    ? undefined
    : // oxlint-disable-next-line typescript/no-base-to-string -- `String` is reached only once an object and a function are ruled out
      `settleTask takes a task, an observation and a number of steps above nought, and was handed ${extra.length ? `${extra.length} more` : `a maxSteps of ${typeof maxSteps === 'object' || typeof maxSteps === 'function' ? JSON.stringify(maxSteps) : String(maxSteps)}`}: its third argument was the ceiling's slots, and a ceiling is the engine's own now. ${CEILING_INSTEAD}`;

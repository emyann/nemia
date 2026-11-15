/**
 * The Subscription: a runtime task told of the feed's lines that match its selectors, served as an object no namespace holds
 * (cluster-scoped), by its name. Its `spec` is what was asked — the task, the selectors, how often its routine lines are told as one
 * digest, and the least level of a factory whose lines it is told — and its `status` where the deliverer is with it: the byte its news
 * starts from, the byte every line before which is told or folded, how many lines its digest holds, and since when.
 *
 * Plain Schemas of JSON, as every object of this package is.
 */
import { Schema } from 'effect';
import { API_VERSION, ObjectMeta, describedNumber, listOf } from './meta.ts';
import { LEVELS } from './words.ts';

/** Whose lines it is told by level: those of a factory that runs at `atLeast` or above. */
export const SubscriptionScope = Schema.Struct({
  atLeast: Schema.Literals(LEVELS).annotate({ description: 'The least level of a factory whose lines the task is told.' }),
});
export type SubscriptionScope = typeof SubscriptionScope.Type;

/** What was asked: the task told, the feed's selectors it matches (OR'd), the digest's wait in minutes, and its scope where given. */
export const SubscriptionSpec = Schema.Struct({
  task: Schema.String.annotate({ description: 'The runtime task that is told.' }),
  selectors: Schema.Array(Schema.String).annotate({ description: "The feed's selectors it matches; a line matching any of them is told." }),
  digestEvery: describedNumber('The minutes between digests of routine lines.'),
  scope: Schema.optionalKey(SubscriptionScope.annotate({ description: 'Whose lines it is told by level; absent where not given.' })),
}).annotate({
  description:
    'What was asked: the task told, the label queries it matches (any of them), the minutes between digests of routine lines, and the least level of a factory whose lines it is told.',
});
export type SubscriptionSpec = typeof SubscriptionSpec.Type;

/**
 * Where the deliverer is: the byte its news starts from (`from`), the byte every line before which is told or folded (`cursor`), the
 * routine lines folded and not yet told (`pending`), when the first of them was folded (`since`, absent with none pending), and why the
 * deliverer's file did not read, where it did not (`error`).
 */
export const SubscriptionStatus = Schema.Struct({
  from: describedNumber('The byte its news starts from.'),
  cursor: describedNumber('The byte every line before which is told or folded.'),
  pending: describedNumber('How many routine lines are folded into its digest and not yet told.'),
  since: Schema.optionalKey(Schema.String.annotate({ description: 'When the first pending line was folded; absent with none pending.' })),
  error: Schema.optionalKey(Schema.String.annotate({ description: "Why the deliverer's file did not read; absent where it did." })),
}).annotate({
  description:
    'Where the deliverer is: the byte its news starts from, the byte before which every line is told or folded, the routine lines folded and not yet told and since when, and why its file did not read.',
});
export type SubscriptionStatus = typeof SubscriptionStatus.Type;

/** A subscription, as an object. */
export const Subscription = Schema.Struct({
  apiVersion: Schema.Literal(API_VERSION).annotate({ description: 'The version the object is served under, nemia/v1.' }),
  kind: Schema.Literal('Subscription').annotate({
    description: "What the object is: a Subscription, a runtime task told of the feed's lines that match its label queries.",
  }),
  metadata: ObjectMeta,
  spec: SubscriptionSpec,
  status: SubscriptionStatus,
});
export type Subscription = typeof Subscription.Type;

/** A page of the subscriptions. */
export const SubscriptionList = listOf('Subscription', Subscription);
export type SubscriptionList = typeof SubscriptionList.Type;

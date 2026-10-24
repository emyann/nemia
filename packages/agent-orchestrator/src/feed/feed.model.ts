/**
 * The feed model: a line of the feed, its cursor, and a subscription to it, as Schemas at the context's door. A line is a run's, a
 * daemon's or the store's; a run's names its run, step and try by id, and a subscription the runtime's task it tells, by id alone. A
 * declaration in S1: no read path decodes through it.
 */
import { Schema } from 'effect';
import { brandedCount, brandedId, type Count, type Id } from '../model/brand.model.ts';
import type { ErModel } from '../model/er.model.ts';
import { RunId, StepName, TaskId, TryNumber } from '../record/record.model.ts';
import { FactoryName } from '../factory/factory.model.ts';
import { DAEMON_STARTED } from './reason.ts';
import { LEVELS } from '../level/level.ts';
import { subscriptionNameRefusal } from '../subscription/index.ts';

/** A byte offset of complete lines of the feed, 0 or one a read handed out: where a read, or a subscription's news, starts. */
export const FeedCursor = brandedCount('FeedCursor', 0);
export type FeedCursor = Count<'FeedCursor'>;

/** A subscription's name: what its files are named after (`subscriptionNameRefusal`). */
export const SubscriptionName = brandedId('SubscriptionName', subscriptionNameRefusal);
export type SubscriptionName = Id<'SubscriptionName'>;

/**
 * A subscription as `listSubscriptions` answers one: its name, its file's, and the file's fields (`Subscription`). Its invariants are its
 * writer's: it has a selector at least, the default where none is given (subscription.verb.ts:59), and a digest waits more than zero
 * minutes (subscription.ts:164).
 */
export const Subscription = Schema.Struct({
  name: SubscriptionName.OnRead,
  task: TaskId.OnRead,
  selectors: Schema.Array(Schema.String).check(Schema.isNonEmpty()),
  digestEvery: Schema.Finite.check(Schema.isGreaterThan(0)),
  from: FeedCursor.OnRead,
  scope: Schema.optional(Schema.Struct({ atLeast: Schema.Literals(LEVELS) })),
}).annotate({ identifier: 'Subscription' });
export type Subscription = typeof Subscription.Type;

/** What a v1 line signs itself with (`Line`, feed.ts), as loose as the store reads it (`LINE_KEYS`): a newer `nemia` may name more. */
const signed = {
  apiVersion: Schema.optional(Schema.String),
  involved: Schema.optional(Schema.Struct({ kind: Schema.String, name: Schema.String })),
  labels: Schema.optional(
    Schema.Struct({
      run: Schema.optional(Schema.String),
      factory: Schema.optional(FactoryName.OnRead),
      workflow: Schema.optional(Schema.String),
      step: Schema.optional(Schema.String),
      agent: Schema.optional(Schema.String),
    }),
  ),
  reason: Schema.optional(Schema.String),
  type: Schema.optional(Schema.String),
  waits: Schema.optional(Schema.String),
  source: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String),
  call: Schema.optional(Schema.String),
};

/** A run's line (`RunLine`): which run, which step of it (none for the run's own), the word the tick judged and its note. */
export const RunLine = Schema.Struct({
  at: Schema.String,
  run: RunId.OnRead,
  step: Schema.optional(StepName.OnRead),
  word: Schema.String,
  note: Schema.optional(Schema.String),
  ...signed,
  try: Schema.optional(TryNumber.OnRead),
}).annotate({ identifier: 'RunLine' });
export type RunLine = typeof RunLine.Type;

/** A daemon's line (`DaemonLine`): its pid, that it started, and how the daemon before it ended. */
export const DaemonLine = Schema.Struct({
  at: Schema.String,
  daemon: Schema.Finite,
  word: Schema.Literal(DAEMON_STARTED),
  note: Schema.optional(Schema.String),
  ...signed,
}).annotate({ identifier: 'DaemonLine' });
export type DaemonLine = typeof DaemonLine.Type;

/** The store's line (`StoreLine`): its pause put or lifted. */
export const StoreLine = Schema.Struct({
  at: Schema.String,
  store: Schema.String,
  word: Schema.String,
  note: Schema.optional(Schema.String),
  ...signed,
}).annotate({ identifier: 'StoreLine' });
export type StoreLine = typeof StoreLine.Type;

/** One line of the feed (`FeedLine`): a run's, a daemon's or the store's. No identifier of its own, so the printer draws its members. */
export const FeedLine = Schema.Union([RunLine, DaemonLine, StoreLine]);
export type FeedLine = typeof FeedLine.Type;

/** The feed context's part of the orchestrator's diagram. */
export const feedModel = {
  entities: [Subscription, RunLine, DaemonLine, StoreLine],
  ids: { SubscriptionName: 'Subscription' },
} satisfies ErModel;

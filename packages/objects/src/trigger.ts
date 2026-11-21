/**
 * The Trigger: what starts a factory's work on its own, served as an object in the factory's namespace. Its `spec` says when it fires and
 * what it sends there: at each fire of a cron (`when.kind: 'time'`, a Schedule, which is still served as one and named by its workflow), or
 * on each card of its factory whose labels its `labelSelector` matches (`when.kind: 'cards'`), queued in the order filed on the workflow
 * the card names, else on the trigger's target. Its `status` is what Nemia read of it now: whether it can spend quota — whether anything
 * its target can reach runs an agent — and, apart from that, what it is doing: the cards it queues and those it clashes on, or its next
 * fire.
 *
 * Beside it, the body a write is sent (`TriggerWrite`). Plain Schemas of JSON, as every object of this package is.
 */
import { Schema } from 'effect';
import { API_VERSION, ObjectMeta, listOf } from './meta.ts';
import { FactoryWritten } from './written.ts';
import { ScheduleFired } from './schedule.ts';

/** When a trigger fires: at each fire of a cron, or on each card its `labelSelector` matches. */
export const TRIGGER_WHEN_KINDS = ['time', 'cards'] as const;
/** One of `TRIGGER_WHEN_KINDS`. */
export type TriggerWhenKind = (typeof TRIGGER_WHEN_KINDS)[number];

/** The kinds of thing a trigger may send what it matches to: a workflow its factory offers, open for a later kind. */
export const TRIGGER_TARGET_KINDS = ['Workflow'] as const;
/** One of `TRIGGER_TARGET_KINDS`. */
export type TriggerTargetKind = (typeof TRIGGER_TARGET_KINDS)[number];

/**
 * Whether a trigger can spend quota: `spends` where something its target can reach runs an agent (a session or a judge), `free` where all
 * it reaches reads and runs none (scripts, table or script conditions, card nodes), however many cards it queues, and `unknown` where a
 * workflow it reaches cannot be read and nothing else settles it.
 */
export const TRIGGER_QUOTAS = ['spends', 'free', 'unknown'] as const;
/** One of `TRIGGER_QUOTAS`. */
export type TriggerQuota = (typeof TRIGGER_QUOTAS)[number];

/** Where a trigger is defined: the factory's own file, or its template's rendered wiring. */
export const TRIGGER_ORIGINS = ['factory', 'template'] as const;
/** One of `TRIGGER_ORIGINS`. */
export type TriggerOrigin = (typeof TRIGGER_ORIGINS)[number];

/** A trigger of the time kind: a cron, the brief each run is asked, the zone. */
export const TriggerAtTime = Schema.Struct({
  kind: Schema.Literal('time').annotate({ description: 'The time kind: the trigger fires at each fire of its cron, a Schedule.' }),
  cron: Schema.String.annotate({ description: 'The cron, five or six fields, its runs start at.' }),
  brief: Schema.String.annotate({ description: 'The brief each run is asked.' }),
  tz: Schema.optionalKey(Schema.String.annotate({ description: 'The time zone the cron is read in.' })),
}).annotate({ description: 'A trigger that fires at each fire of a cron: a Schedule.' });
export type TriggerAtTime = typeof TriggerAtTime.Type;

/** A trigger of the cards kind: a `labelSelector` in Kubernetes' spelling, over a card's labels. */
export const TriggerOnCards = Schema.Struct({
  kind: Schema.Literal('cards').annotate({
    description: 'The cards kind: the trigger queues each card of its factory whose labels its labelSelector matches.',
  }),
  labelSelector: Schema.String.annotate({
    description: "A labelSelector in Kubernetes' spelling (`ready=yes`, `area in (cli,api)`), over a card's labels.",
  }),
}).annotate({ description: 'A trigger that queues each card of its factory whose labels its labelSelector matches, in the order filed.' });
export type TriggerOnCards = typeof TriggerOnCards.Type;

/** What a trigger sends what it matches to: a kind and a name of that kind. */
export const TriggerTarget = Schema.Struct({
  kind: Schema.Literals(TRIGGER_TARGET_KINDS).annotate({ description: 'The kind of thing the trigger sends to: a Workflow.' }),
  name: Schema.String.annotate({ description: 'Its name: a workflow the factory offers.' }),
}).annotate({ description: 'What the trigger sends what it matches to: a workflow its factory offers.' });
export type TriggerTarget = typeof TriggerTarget.Type;

/** What a person set: when it fires, and what it sends there. */
export const TriggerSpec = Schema.Struct({
  when: Schema.Union([TriggerAtTime, TriggerOnCards]).annotate({
    description: 'When the trigger fires: at each fire of a cron (time), or on each card its labelSelector matches (cards).',
  }),
  target: TriggerTarget,
}).annotate({ description: 'What the person set: when the trigger fires, and the workflow it sends what it matches to.' });
export type TriggerSpec = typeof TriggerSpec.Type;

/** A card two or more of a factory's triggers would send to two workflows: it waits until a labelSelector or its labels change. */
export const TriggerClash = Schema.Struct({
  card: Schema.String.annotate({ description: 'The name of the card left waiting.' }),
  with: Schema.Array(Schema.String).annotate({ description: 'Every trigger of the factory that selects it, this one among them.' }),
}).annotate({ description: 'A card the triggers of its factory would send to two workflows, left waiting.' });
export type TriggerClash = typeof TriggerClash.Type;

/**
 * What Nemia read of the trigger now: since when it holds, where it is defined, whether it can spend quota and which workflow settles it;
 * and apart from that what it is doing — a cards trigger's queued cards and clashes, a time trigger's next fire, last run and refusal.
 */
export const TriggerStatus = Schema.Struct({
  since: Schema.String.annotate({ description: 'When the trigger was set, as an ISO 8601 time; empty for one its template defines.' }),
  from: Schema.Literals(TRIGGER_ORIGINS).annotate({
    description: "Where the trigger is defined: the factory's own file, or its template's rendered wiring.",
  }),
  quota: Schema.Literals(TRIGGER_QUOTAS).annotate({
    description:
      'Whether the trigger can spend quota: spends where something its target can reach runs an agent (a session or a judge); free where nothing it reaches does, however many cards it queues; unknown where a workflow it reaches cannot be read. Not whether it fires or matches now.',
  }),
  quotaBy: Schema.optionalKey(
    Schema.String.annotate({
      description: 'The workflow that settles `quota`: the first reached that runs an agent, or the first that cannot be read.',
    }),
  ),
  queued: Schema.optionalKey(
    Schema.Array(Schema.String).annotate({ description: 'A cards trigger: the cards it queues now, by name, in the order queued.' }),
  ),
  clashes: Schema.optionalKey(
    Schema.Array(TriggerClash).annotate({ description: 'A cards trigger: the cards it selects that wait on a clash with another.' }),
  ),
  next: Schema.optionalKey(Schema.String.annotate({ description: 'A time trigger: its next fire; absent where it never fires.' })),
  last: Schema.optionalKey(ScheduleFired.annotate({ description: 'A time trigger: its last run; absent where none has run.' })),
  refused: Schema.optionalKey(
    Schema.String.annotate({ description: 'A time trigger: why its latest fire was refused; absent where it was not.' }),
  ),
}).annotate({
  description:
    'What Nemia read of the trigger: since when, where it is defined, whether it can spend quota, and what it does now: the cards it queues and clashes on, or its next fire.',
});
export type TriggerStatus = typeof TriggerStatus.Type;

/** A trigger, as an object; a write's answer says what it wrote (`written`). */
export const Trigger = Schema.Struct({
  apiVersion: Schema.Literal(API_VERSION).annotate({ description: 'The version the object is served under, nemia/v1.' }),
  kind: Schema.Literal('Trigger').annotate({
    description: "What the object is: a Trigger, what starts a factory's work on its own, at a time or on the cards it selects.",
  }),
  metadata: ObjectMeta,
  spec: TriggerSpec,
  status: TriggerStatus,
  written: Schema.optionalKey(FactoryWritten),
});
export type Trigger = typeof Trigger.Type;

/** A page of a factory's triggers. */
export const TriggerList = listOf('Trigger', Trigger);
export type TriggerList = typeof TriggerList.Type;

/** A trigger written (`PUT …/triggers/<name>`): when it fires and its target; one of the time kind is named by its target. */
export const TriggerWrite = TriggerSpec;
export type TriggerWrite = typeof TriggerWrite.Type;

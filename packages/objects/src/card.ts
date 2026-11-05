/**
 * The Card: an inbox card served as an object. Its `spec` is what a person wrote on the card — the workflow that runs it, the repository
 * it is about, its gate, the runs it is handed as context, when it was queued, and its body — and its `status` what Nemia read of it:
 * where it is in its life (`state`), the runs it was started as, the tick's last missed start of it, its title, and why an entry of the
 * inbox does not read as a card. Its labels are its `metadata.labels`, its factory its `metadata.namespace`.
 *
 * Beside it, the bodies of its verbs: a card filed (`CardFile`), a card started (`CardStart`) and its labels edited (`LabelEdit`), each
 * as the api is sent it. Plain Schemas of JSON, as every object of this package is.
 */
import { Schema } from 'effect';
import { API_VERSION, ObjectMeta, listOf } from './meta.ts';

/**
 * Where a card is in its life, closed: its own word until it starts — `filed`, `queued`, `refused` (queued, and the tick's start of it
 * refused) — and its run's phase from then on, the run phases in their order (the orchestrator's `RUN_PHASES`).
 */
export const CARD_STATES = [
  'filed',
  'queued',
  'refused',
  'pending',
  'running',
  'waiting',
  'succeeded',
  'failed',
  'stopped',
  'cancelled',
] as const;
export type CardState = (typeof CARD_STATES)[number];

/** What a person wrote on the card: each key absent where the card does not set it; `body` absent on an entry that does not read. */
export const CardSpec = Schema.Struct({
  workflow: Schema.optionalKey(Schema.String),
  repo: Schema.optionalKey(Schema.String),
  gate: Schema.optionalKey(Schema.String),
  from: Schema.optionalKey(Schema.Array(Schema.String)),
  queued: Schema.optionalKey(Schema.String),
  body: Schema.optionalKey(Schema.String),
});
export type CardSpec = typeof CardSpec.Type;

/** The tick's last start of a queued card that did not happen: when, on which repository, why, and whether it was a refusal. */
export const CardLastStart = Schema.Struct({
  at: Schema.String,
  repo: Schema.String,
  why: Schema.String,
  refused: Schema.Boolean,
});
export type CardLastStart = typeof CardLastStart.Type;

/**
 * What Nemia read of the card: its `state`, the runs it was started as (`runs`), the tick's last missed start (`lastStart`), the first
 * line of its body (`title`, absent where it has none), and why the entry does not read as a card (`error`, absent on a card).
 */
export const CardStatus = Schema.Struct({
  state: Schema.Literals(CARD_STATES),
  runs: Schema.Array(Schema.String),
  lastStart: Schema.optionalKey(CardLastStart),
  title: Schema.optionalKey(Schema.String),
  error: Schema.optionalKey(Schema.String),
  /** Whether the card is still in play: not started, or its run not ended. `nemia inbox` and the board list these by default. */
  inPlay: Schema.Boolean,
  /** A queued card's place in the order the tick starts cards in, from 1, among every card queued and not started, every factory's. */
  place: Schema.optionalKey(Schema.Number),
});
export type CardStatus = typeof CardStatus.Type;

/** An inbox card, as an object. */
export const Card = Schema.Struct({
  apiVersion: Schema.Literal(API_VERSION),
  kind: Schema.Literal('Card'),
  metadata: ObjectMeta,
  spec: CardSpec,
  status: CardStatus,
});
export type Card = typeof Card.Type;

/** A page of the inbox's cards. */
export const CardList = listOf('Card', Card);
export type CardList = typeof CardList.Type;

/**
 * A card filed (create): its body, the workflow that runs it with where that is read from (`from`, `repo` or `yours`, where both have
 * one of that name), the repository it is about, the factory it is filed in, and its labels as `key=value`.
 */
export const CardFile = Schema.Struct({
  body: Schema.String,
  workflow: Schema.optionalKey(Schema.String),
  from: Schema.optionalKey(Schema.Literals(['repo', 'yours'])),
  repo: Schema.optionalKey(Schema.String),
  factory: Schema.optionalKey(Schema.String),
  label: Schema.optionalKey(Schema.Array(Schema.String)),
});
export type CardFile = typeof CardFile.Type;

/**
 * A card started: the workflow its run is started on and where it is read from, the runs it waits on (`after`) and reads as context
 * (`context`), the brief given in place of the card's body, and the labels it is started with (`key=value`, `key-`).
 */
export const CardStart = Schema.Struct({
  workflow: Schema.String,
  from: Schema.optionalKey(Schema.Literals(['repo', 'yours'])),
  after: Schema.optionalKey(Schema.Array(Schema.String)),
  context: Schema.optionalKey(Schema.Array(Schema.String)),
  brief: Schema.optionalKey(Schema.String),
  label: Schema.optionalKey(Schema.Array(Schema.String)),
});
export type CardStart = typeof CardStart.Type;

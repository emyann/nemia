/**
 * The planning model: a card, its name, and the inbox that holds the cards and the tick's tries of the queued ones, as Schemas at the
 * context's door. A declaration in S1: no read path decodes through it.
 */
import { Schema } from 'effect';
import { brandedId, type Id } from '../model/brand.model.ts';
import type { ErModel } from '../model/er.model.ts';
import { RunId, StepName } from '../record/record.model.ts';
import { FactoryName } from '../factory/factory.model.ts';
import { inboxNameRefusal } from './inbox.ts';

/** A card's name: its file's in the inbox, minus `.md`, as `nemia inbox add` mints it (`runId`) and `inboxNameRefusal` takes it. */
export const CardName = brandedId('CardName', inboxNameRefusal);
export type CardName = Id<'CardName'>;

/**
 * A card as `parseInboxCard` reads it (`InboxCard`). Its invariants are its reader's: its name is its file's minus `.md` (inbox.ts:106),
 * a queued card names its workflow (inbox.ts:122), and `from:` names each run once (inbox.ts:152).
 */
export const Card = Schema.Struct({
  name: CardName.OnRead,
  file: Schema.String,
  workflow: Schema.optional(Schema.String),
  repo: Schema.optional(Schema.String),
  queued: Schema.optional(Schema.String),
  gate: Schema.optional(StepName.OnRead),
  factory: Schema.optional(FactoryName.OnRead),
  from: Schema.optional(Schema.Array(RunId.OnRead)),
  body: Schema.String,
})
  .check(
    Schema.makeFilter(
      (card) => card.file === `${card.name}.md` || `the file ${card.file} is not the card ${card.name}'s: name it ${card.name}.md`,
    ),
    Schema.makeFilter(
      (card) => card.queued === undefined || card.workflow !== undefined || 'a queued card names no workflow: write `workflow:`',
    ),
    Schema.makeFilter(
      (card) => new Set(card.from ?? []).size === (card.from ?? []).length || '`from:` names a run twice: name each run once',
    ),
  )
  .annotate({ identifier: 'Card' });
export type Card = typeof Card.Type;

/** A queued card's start the tick tried and did not make, as it writes it down (`QueueTry`). */
const QueueTry = Schema.Struct({
  at: Schema.String,
  text: Schema.String,
  repo: Schema.String,
  why: Schema.String,
  refused: Schema.Boolean,
});

/** The inbox as the store holds it: its cards (`inbox/<name>.md`), and the tick's tries of the queued ones (`queue/<name>.json`). */
export const Inbox = Schema.Struct({
  cards: Schema.Array(Card),
  tries: Schema.Record(CardName.OnRead, QueueTry),
}).annotate({ identifier: 'Inbox' });
export type Inbox = typeof Inbox.Type;

/** The planning context's part of the orchestrator's diagram. */
export const inboxModel = { entities: [Inbox, Card], ids: { CardName: 'Card' } } satisfies ErModel;

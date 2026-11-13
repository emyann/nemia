/**
 * The inbox's cards as objects (`Card`, `CardList`, from `objects`): the listing the inbox reads (`InboxListing`, its state judged by
 * `inboxJudged`) and each card's text, read through the Card door. A card's namespace is its factory, `default` for a card that names none;
 * its `creationTimestamp` when it was filed; its `resourceVersion` a digest of its text, which changes on every write of it; its labels a
 * person's, and a selector reads them with its `workflow:` and `factory:` (`cardLabels`). A list is selected first, sorted by name, then
 * cut into a page, the one list page (`pageListed`), so `remainingItemCount` counts what the selector keeps. An entry of the inbox that is
 * no markdown file (`idea.txt`, a folder `sub/`) is no card, and is listed all the same, never hidden: under its file, which is its name,
 * its `status.error` saying why, dated by when it was last written (`entryAt`); one that does not read is listed too, its error saying why.
 * Either is read by its name, for its page (`cardObjectOf`), a card first, and pressed by none.
 */
import { Effect } from 'effect';
import { API_VERSION, type Card, type CardList, DEFAULT_NAMESPACE, type Table } from 'objects';
import { CardDoor } from '../cards/cards.store.ts';
import { CardName } from '../inbox/inbox.model.ts';
import {
  CARD_IN_PLAY,
  cardInPlay,
  cardLabels,
  cardPlaySelector,
  INBOX_COLUMNS,
  inboxCells,
  type InboxListing,
  parseInboxCard,
} from '../inbox/index.ts';
import { inboxJudged } from '../inbox/inbox.verb.ts';
import { cardVersion } from '../card-write/card-write.verb.ts';

/**
 * The Card's whole write and its edit from its text, served beside its reads (`update`, `edit`): the api reads them off the package's
 * entry with them.
 */
export { cardEditRefusal, cardWriteRefusal } from '../card-write/index.ts';
export { editCard } from '../card-write/card-edit.verb.ts';
export { replaceCard, type CardReplaced } from '../card-write/card-write.verb.ts';
import type { SummaryHow } from '../summary/summary.verb.ts';
import type { Engine } from '../runtime-client.ts';
import { Invalid, Missing } from '../refusal/refusal.ts';
import { listOf, pageListed } from './listed.verb.ts';
import { setting } from '../config/config.store.ts';

/**
 * What a list of cards is asked: its namespace (none for every card), `?limit=`, `?continue=`, its label selectors, OR'd, and its
 * `?fieldSelector=`, the cards still in play or those whose run ended (`cardPlaySelector`), every card where it is empty or none.
 */
export type CardQuery = {
  readonly namespace?: string | undefined;
  readonly limit?: number | null | undefined;
  readonly continue?: string | undefined;
  readonly labelSelector?: readonly string[] | undefined;
  readonly fieldSelector?: string | undefined;
};

/** The namespace of a listed card: its factory, or `default`. */
const namespaceOf = (l: InboxListing): string => l.factory ?? DEFAULT_NAMESPACE;

/**
 * What a list orders an entry by and a token carries: its name, then its file, so a stray `notes` and the card `notes.md`, both named
 * `notes`, are two places of the list, sorted by its UTF-16 code units, as `<` compares. A line break sorts below every letter a name
 * holds, so the order is the names' first.
 */
const keyOf = (l: InboxListing): string => `${l.name}\n${l.file}`;

/**
 * The body a card's text holds, or why it holds none: the listing's own `error` for an entry it found no card, and for a card the listing
 * read and whose text no longer parses (edited between the two reads), the parse's own reason, so a card is never listed with no body and
 * no word of why.
 */
const bodyOf = (l: InboxListing, text: string): { readonly body?: string; readonly error?: string } => {
  if (l.error !== null) return { error: l.error };
  try {
    return { body: parseInboxCard(l.file, text).body };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
};

/** The object of the listed card `l`, of its text and filing time; its text as `status.source` where `source` (a read of one card). */
const cardOf = (l: InboxListing, text: string, filedAt: string, source = false): Card => {
  const { body, error } = bodyOf(l, text);
  return {
    apiVersion: API_VERSION,
    kind: 'Card',
    metadata: {
      name: l.name,
      namespace: namespaceOf(l),
      ...(Object.keys(l.labels).length ? { labels: { ...l.labels } } : {}),
      creationTimestamp: filedAt,
      resourceVersion: cardVersion(text),
    },
    spec: {
      ...(l.workflow !== null ? { workflow: l.workflow } : {}),
      ...(l.repo !== null ? { repo: l.repo } : {}),
      ...(l.gate !== undefined ? { gate: l.gate } : {}),
      ...(l.model !== undefined ? { model: { ...l.model } } : {}),
      ...(l.from.length ? { from: [...l.from] } : {}),
      ...(l.queued !== undefined ? { queued: l.queued.at } : {}),
      ...(body !== undefined ? { body } : {}),
    },
    status: {
      state: l.state,
      runs: [...l.startedAs],
      ...(l.tried !== undefined ? { lastStart: { ...l.tried } } : {}),
      ...(l.title !== null ? { title: l.title } : {}),
      ...(error !== undefined ? { error } : {}),
      inPlay: CARD_IN_PLAY[l.state],
      ...(l.queued !== undefined && l.queued.place !== null ? { place: l.queued.place } : {}),
      file: l.file,
      ...(source ? { source: text } : {}),
    },
  };
};

/**
 * The object of the listed entry `l`, read through the Card door: a card, or a stray entry with no text, dated when it was last written;
 * the card's file as written in its `status.source` where `source`. Null for one gone since the listing.
 * Untraced: the cards list runs it once per card, and a span each would bury the list's trace under hundreds.
 */
const objectOf = Effect.fnUntraced(function* (l: InboxListing, source = false) {
  const door = yield* CardDoor;
  if (!l.file.endsWith('.md')) {
    const at = yield* door.cards.entryAt(l);
    if (at === null) return null;
    const stray = cardOf(l, '', at);
    const text = source ? yield* door.cards.entryText(l) : null;
    return text === null ? stray : { ...stray, status: { ...stray.status, source: text } };
  }
  const name = CardName.read(l.name);
  const text = yield* door.cards.read(name);
  const filedAt = yield* door.cards.filedAt(name);
  return text === null || filedAt === null ? null : cardOf(l, text, filedAt, source);
});

/**
 * The entries of `listing` that `fieldSelector` keeps: every one where it is empty or none, else those whose `cardInPlay` is what it
 * asks (`cardPlaySelector`); `Invalid` naming the forms it takes where it spells none.
 */
const inPlayKept = (listing: readonly InboxListing[], fieldSelector: string | undefined): readonly InboxListing[] | Invalid => {
  if (fieldSelector === undefined || fieldSelector === '') return listing;
  const selector = cardPlaySelector(fieldSelector);
  if (selector === null)
    return new Invalid({
      message: `fieldSelector ${fieldSelector} is none a card list takes: give status.inPlay=true (or ==true, !=false) for the cards in play, status.inPlay=false (or ==false, !=true) for those whose run ended, or an empty one for every card`,
    });
  return listing.filter((l) => cardInPlay(l) === selector.inPlay);
};

/**
 * A page of the cards `listing` holds (`CardList`): those of `query.namespace` (every card where none is given) that its field selector
 * (`inPlayKept`) and its label selectors keep, sorted by name, cut by its `limit` after its `continue`. `Invalid` for a selector, a limit
 * or a token that is not one.
 */
export const cardListOf = Effect.fn('cardListOf')(function* (listing: readonly InboxListing[], query: CardQuery) {
  const { namespace } = query;
  const inNamespace = namespace === undefined ? listing : listing.filter((l) => namespaceOf(l) === namespace);
  const kept = inPlayKept(inNamespace, query.fieldSelector);
  if (kept instanceof Invalid) return yield* Effect.fail(kept);
  const page = yield* pageListed(kept, query, 'card', { key: keyOf, labels: cardLabels });
  const items = (yield* Effect.forEach(page.items, (l) => objectOf(l))).filter((c): c is Card => c !== null);
  const answered: CardList = listOf('Card', page, items);
  return answered;
});

/**
 * The same page of `listing` as `cardListOf` answers, as a table (`Table`): the columns `nemia inbox` prints (`INBOX_COLUMNS`), a row per
 * card of the page with its cells (`inboxCells`) and the card itself, and where the page stands (`continue`). A card that names no factory
 * is said to start on a repository where `unfactoredStarts` lets it, as `nemia inbox` says it.
 */
export const cardTableOf = Effect.fn('cardTableOf')(function* (
  listing: readonly InboxListing[],
  query: CardQuery,
  unfactoredStarts: boolean,
) {
  const list = yield* cardListOf(listing, query);
  const byKey = new Map(listing.map((l) => [keyOf(l), l]));
  const table: Table = {
    kind: 'Table',
    apiVersion: 'meta.k8s.io/v1',
    metadata: list.metadata.continue !== undefined ? { continue: list.metadata.continue } : {},
    columnDefinitions: INBOX_COLUMNS,
    rows: list.items.flatMap((card) => {
      const l = byKey.get(`${card.metadata.name}\n${card.status.file ?? ''}`);
      return l === undefined ? [] : [{ cells: inboxCells(l, unfactoredStarts), object: card }];
    }),
  };
  return table;
});

/**
 * The card `name` of `listing` as an object, in `namespace` where one is given, its file as written in its `status.source` (a read of one
 * card): a card before a stray entry of the same name (`notes.md` and `notes` both list as `notes`), a stray entry, its `status.error`
 * saying why it is no card, carrying its own file's text where it is a file. `Missing` where no entry has that name, or the one that does
 * is in another namespace.
 */
export const cardObjectOf = Effect.fn('cardObjectOf')(function* (listing: readonly InboxListing[], name: string, namespace?: string) {
  const named = listing.filter((entry) => entry.name === name && (namespace === undefined || namespaceOf(entry) === namespace));
  const l = named.find((entry) => entry.file.endsWith('.md')) ?? named[0];
  const card = l === undefined ? null : yield* objectOf(l, true);
  if (card === null)
    return yield* Effect.fail(
      new Missing({
        message: `no card ${name}${namespace === undefined ? '' : ` in the namespace ${namespace}`}: list the cards with nemia inbox, a card's namespace being its factory, default for one that names none`,
      }),
    );
  return card;
});

/**
 * A page of the inbox's cards (`cardListOf`), off the inbox as `nemia inbox` reads it now (`inboxJudged`): a started card's state its
 * run's phase, read through the informer `how.memo`.
 */
export const cardList = Effect.fn('cardList')(function* (e: Engine, how: SummaryHow, query: CardQuery) {
  return yield* cardListOf(yield* inboxJudged(e, how), query);
});

/**
 * A page of the inbox's cards as a table (`cardTableOf`), off the inbox as `nemia inbox` reads it now (`inboxJudged`): where a card that
 * names no factory starts is the store's setting (`StoreConfig`'s `defaultFactoryStarts`).
 */
export const cardTable = Effect.fn('cardTable')(function* (e: Engine, how: SummaryHow, query: CardQuery) {
  return yield* cardTableOf(yield* inboxJudged(e, how), query, yield* setting('defaultFactoryStarts'));
});

/** The inbox card `name` as an object (`cardObjectOf`), in `namespace` where one is given, off the inbox as it reads now. */
export const cardObject = Effect.fn('cardObject')(function* (e: Engine, how: SummaryHow, name: string, namespace?: string) {
  return yield* cardObjectOf(yield* inboxJudged(e, how), name, namespace);
});

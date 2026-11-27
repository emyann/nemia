/**
 * The inbox's cards as objects (`Card`, `CardList`, from `objects`): the listing the inbox reads (`InboxListing`, its state judged by
 * `inboxJudged`) and each card's text, read through the Card door. A card's namespace is its factory, `default` for a card that names none;
 * its `creationTimestamp` when it was filed; its `resourceVersion` the revision of the card's records (`CardDoor`'s `revision`), which
 * moves on every write of it and on a
 * try or a claim of its start; its labels a
 * person's, and a selector reads them with its `workflow:` and `factory:` (`cardLabels`). A list is selected first, sorted by name, then
 * cut into a page, the one list page (`pageListed`), so `remainingItemCount` counts what the selector keeps. An entry of the inbox that is
 * no markdown file (`idea.txt`, a folder `sub/`) is no card, and is listed all the same, never hidden: under its file, which is its name,
 * its `status.error` saying why, dated by when it was last written (`entryAt`); one that does not read is listed too, its error saying why.
 * Either is read by its name, for its page (`cardObjectOf`), a card first, and pressed by none.
 */
import { Effect } from 'effect';
import { API_VERSION, CARD_PHASES, type Card, type CardList, type CardPhase, DEFAULT_NAMESPACE, type Table } from 'objects';
import { CardDoor } from '../cards/cards.store.ts';
import { CardName } from '../inbox/inbox.model.ts';
import {
  CARD_IN_PLAY,
  cardInPlay,
  cardFieldTerm,
  cardLabels,
  cardMatches,
  cardOrderBy,
  fieldSelects,
  type FieldTerm,
  searched,
  searchWords,
  INBOX_COLUMNS,
  inboxCells,
  type InboxListing,
  parseInboxCard,
} from '../inbox/index.ts';
import { inboxJudged } from '../inbox/inbox.verb.ts';
import { FileDoor } from '../start/files.store.ts';
import { namedInText } from '../start/index.ts';

/** The Card's whole write, served beside its reads (`update`): the api reads it off the package's entry with them. */
export { cardWriteRefusal } from '../card-write/index.ts';
export { replaceCard, type CardReplaced } from '../card-write/card-write.verb.ts';
import type { SummaryHow } from '../summary/summary.verb.ts';
import type { Engine } from '../runtime-client.ts';
import { Invalid, Missing } from '../refusal/refusal.ts';
import { listOf, pageListed, selectorsRefused } from './listed.verb.ts';
import { parseSelectors, selectsLabels } from '../watch/selector.ts';
import { setting } from '../config/config.store.ts';

/**
 * What a list of cards is asked: its namespace (none for every card), `?limit=`, `?continue=`, its label selectors, OR'd, and its
 * `?fieldSelector=`, comma-joined terms of `status.inPlay`, `status.chained` and `status.phase` (`cardFieldTerm`), every card where it is
 * empty or none, its `?orderBy=` (`cardOrderBy`: by name where it is empty or none) and its `?search=` words (`cardMatches`).
 */
export type CardQuery = {
  readonly namespace?: string | undefined;
  readonly limit?: number | null | undefined;
  readonly continue?: string | undefined;
  readonly labelSelector?: readonly string[] | undefined;
  readonly fieldSelector?: string | undefined;
  readonly orderBy?: string | undefined;
  readonly search?: string | undefined;
};

/** The namespace of a listed card: its factory, or `default`. */
const namespaceOf = (l: InboxListing) => l.factory ?? DEFAULT_NAMESPACE;

/**
 * What a list orders an entry by and a token carries: its name, then its file, so a stray `notes` and the card `notes.md`, both named
 * `notes`, are two places of the list, sorted by its UTF-16 code units, as `<` compares. A line break sorts below every letter a name
 * holds, so the order is the names' first.
 */
const keyOf = (l: InboxListing) => `${l.name}\n${l.file}`;

/**
 * The body a card's text holds, or why it holds none: the listing's own `error` for an entry it found no card, and for a card the listing
 * read and whose text no longer parses (edited between the two reads), the parse's own reason, so a card is never listed with no body and
 * no word of why.
 */
const bodyOf = (l: InboxListing, text: string) => {
  if (l.error !== null) return { error: l.error };
  try {
    return { body: parseInboxCard(l.file, text).body };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
};

/**
 * What the listed card `l`'s status says of the queue: its place, the triggers that queue it, those that clash on it, and the cards of its
 * `after:` not released that keep it out of the queue (`waitingOn`).
 */
const queueStatusOf = (l: InboxListing) => ({
  ...(l.queued !== undefined && l.queued.place !== null ? { place: l.queued.place } : {}),
  ...(l.queued?.by !== undefined ? { queuedBy: [...l.queued.by] } : {}),
  ...(l.clash !== undefined ? { clash: [...l.clash] } : {}),
  ...(l.waits?.length ? { waitingOn: l.waits.map((w) => ({ ...w, ...(w.cycle === undefined ? {} : { cycle: [...w.cycle] }) })) } : {}),
});

/** The keys of the listed card `l` its spec says, each where the card sets it. */
const specKeysOf = (l: InboxListing) => ({
  ...(l.workflow !== null ? { workflow: l.workflow } : {}),
  ...(l.repo !== null ? { repo: l.repo } : {}),
  ...(l.gate !== undefined ? { gate: l.gate } : {}),
  ...(l.model !== undefined ? { model: { ...l.model } } : {}),
  ...(l.from.length ? { from: [...l.from] } : {}),
  ...(l.after.length ? { after: [...l.after] } : {}),
  ...(l.queued !== undefined && l.queued.by === undefined ? { queued: l.queued.at } : {}),
  ...(l.files !== undefined && l.files.length ? { files: l.files.map((f) => ({ ...f })) } : {}),
});

/** The object of the listed card `l`, of its text and filing time; its text as `status.source` where `source` (a read of one card). */
const cardOf = (l: InboxListing, text: string, filedAt: string, source = false, files?: Card['status']['files'], revision = 0) => {
  const { body, error } = bodyOf(l, text);
  return {
    apiVersion: API_VERSION,
    kind: 'Card',
    metadata: {
      name: l.name,
      namespace: namespaceOf(l),
      ...(Object.keys(l.labels).length ? { labels: { ...l.labels } } : {}),
      creationTimestamp: filedAt,
      resourceVersion: String(revision),
    },
    spec: { ...specKeysOf(l), ...(body !== undefined ? { body } : {}) },
    status: {
      state: l.state,
      runs: [...l.startedAs],
      ...(l.tried !== undefined ? { lastStart: { ...l.tried } } : {}),
      ...(l.title !== null ? { title: l.title } : {}),
      ...(error !== undefined ? { error } : {}),
      ...(files !== undefined && files.length ? { files } : {}),
      inPlay: CARD_IN_PLAY[l.state],
      phase: l.phase,
      followedBy: [...l.followedBy],
      chained: l.chained,
      ...queueStatusOf(l),
      file: l.file,
      ...(source ? { source: text } : {}),
    },
  } satisfies Card as Card;
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
  if (text === null || filedAt === null) return null;
  return cardOf(l, text, filedAt, source, yield* filesOf(l, bodyOf(l, text).body ?? ''), (yield* door.cards.revision(name)) ?? 0);
});

/**
 * The files the listed card `l` carries, as its status says them: each with what its File is where its namespace keeps it (read through
 * the File door; a program given no store's root, nor the door's memory, reads every File as not kept), whether its text names it, and
 * whether it is kept.
 * @param l The listed card.
 * @param body The card's body, read for the names it uses.
 */
const filesOf = Effect.fnUntraced(function* (l: InboxListing, body: string) {
  const files = l.files ?? [];
  const named = namedInText(
    body,
    files.map((f) => f.name),
  );
  const door = yield* FileDoor;
  return yield* Effect.forEach(files, (f) =>
    Effect.map(
      Effect.orElseSucceed(door.files.read(namespaceOf(l), f.file), () => undefined),
      (at) => ({
        name: f.name,
        file: f.file,
        ...(at !== undefined ? { mediaType: at.file.mediaType, size: at.file.size } : {}),
        inText: named.includes(f.name),
        kept: at !== undefined,
      }),
    ),
  );
});

/** The refusal of a field selector term that is none, naming the forms a card list takes. */
const badTerm = (term: string) =>
  new Invalid({
    message: `fieldSelector term ${JSON.stringify(term)} is none a card list takes: give terms joined by commas, each status.inPlay=true|false, status.chained=true|false or status.phase=<${CARD_PHASES.join('|')}>, with = (or ==) or !=, or leave fieldSelector out for every card`,
  });

/** The refusal of an orderBy that is none, naming the forms a card list takes. */
const badOrder = (orderBy: string) =>
  new Invalid({
    message: `orderBy ${JSON.stringify(orderBy)} is none a card list takes: give metadata.creationTimestamp or metadata.name, ascending, or followed by one space and desc, or leave orderBy out to order by name`,
  });

/**
 * The key a list orders a card by and a token carries: what it is ordered by first, then its name, then its file, so ties break by name
 * and a stray entry and a card of one name are two places of the list.
 */
const orderKeyOf = (field: 'metadata.creationTimestamp' | 'metadata.name') => (l: InboxListing) =>
  field === 'metadata.name' ? keyOf(l) : `${l.filedAt}\n${keyOf(l)}`;

/** How many cards of `kept` are in each phase. */
const countsOf = (kept: readonly InboxListing[]) => {
  const counts = Object.fromEntries(CARD_PHASES.map((phase) => [phase, 0])) as Record<CardPhase, number>;
  for (const l of kept) counts[l.phase] += 1;
  return counts;
};

/** Each label `kept` hold, by key then value, with how many cards hold it. */
const labelsInUseOf = (kept: readonly InboxListing[]) => {
  const held = new Map<string, { key: string; value: string; cards: number }>();
  for (const l of kept)
    for (const [key, value] of Object.entries(cardLabels(l))) {
      const id = `${key}\n${value}`;
      const was = held.get(id);
      if (was === undefined) held.set(id, { key, value, cards: 1 });
      else was.cards += 1;
    }
  return [...held.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.value < b.value ? -1 : a.value > b.value ? 1 : 0));
};

/**
 * A page of the cards `listing` holds (`CardList`): those of `query.namespace` (every card where none is given) that its label selectors
 * and its search words keep, counted by phase and by label in use (`metadata.counts`, `labelsInUse`), then those its field selector keeps,
 * sorted by its order (by name unless `orderBy` says), cut by its `limit` after its `continue`. Objects are built for the page alone.
 * `Invalid` for a selector, an order, a limit or a token that is not one.
 */
export const cardListOf = Effect.fn('cardListOf')(function* (listing: readonly InboxListing[], query: CardQuery) {
  const { namespace } = query;
  const inNamespace = namespace === undefined ? listing : listing.filter((l) => namespaceOf(l) === namespace);
  const selectors = query.labelSelector ?? [];
  const refused = selectorsRefused(selectors, 'card');
  if (refused !== undefined) return yield* Effect.fail(refused);
  const parsed = parseSelectors(selectors);
  const terms: FieldTerm[] = [];
  for (const text of (query.fieldSelector ?? '').split(',').filter((t) => t.trim() !== '')) {
    const term = cardFieldTerm(text.trim());
    if (term === null) return yield* Effect.fail(badTerm(text));
    terms.push(term);
  }
  const order =
    query.orderBy === undefined || query.orderBy.trim() === ''
      ? { field: 'metadata.name' as const, descending: false }
      : cardOrderBy(query.orderBy);
  if (order === null) return yield* Effect.fail(badOrder(query.orderBy ?? ''));
  const words = searchWords(query.search ?? '');
  const kept = inNamespace.filter(
    (l) => selectsLabels(parsed, cardLabels(l)) && cardMatches(words, searched({ name: l.name, title: l.title })),
  );
  const selected = kept.filter((l) => fieldSelects(terms, { inPlay: cardInPlay(l), chained: l.chained, phase: l.phase }));
  const page = yield* pageListed(selected, { limit: query.limit, continue: query.continue }, 'card', {
    key: orderKeyOf(order.field),
    labels: cardLabels,
    descending: order.descending,
  });
  const items = (yield* Effect.forEach(page.items, (l) => objectOf(l))).filter((c): c is Card => c !== null);
  const answered: CardList = {
    ...listOf('Card', page, items),
    metadata: { ...listOf('Card', page, items).metadata, counts: countsOf(kept), labelsInUse: labelsInUseOf(kept) },
  };
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

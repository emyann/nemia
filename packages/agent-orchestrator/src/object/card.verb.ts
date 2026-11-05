/**
 * The inbox's cards as objects (`Card`, `CardList`, from `objects`): the listing the inbox reads (`InboxListing`, its state judged by
 * `inboxJudged`) and each card's text, read through the Card door. A card's namespace is its factory, `default` for a card that names
 * none; its `creationTimestamp` when it was filed; its `resourceVersion` a digest of its text, which changes on every write of it; its
 * labels a person's, and a selector reads them with its `workflow:` and `factory:` (`cardLabels`). A list is selected first, sorted by
 * name, then cut into a page (`pageOf`), so `remainingItemCount` counts what the selector keeps. An entry of the inbox that is no
 * markdown file (`idea.txt`, a folder `sub/`) is no card, and is listed all the same, never hidden: under its file, which is its name,
 * its `status.error` saying why, dated by when it was last written (`entryAt`); one that does not read is listed too, its error saying
 * why. Neither is read or pressed by its name: `cardObjectOf` finds a card alone.
 */
import { createHash } from 'node:crypto';
import { Effect } from 'effect';
import { API_VERSION, type Card, type CardList, DEFAULT_NAMESPACE } from 'objects';
import { CardDoor } from '../cards/cards.store.ts';
import { CardName } from '../inbox/inbox.model.ts';
import { CARD_IN_PLAY, cardLabels, type InboxListing, parseInboxCard } from '../inbox/index.ts';
import { inboxJudged } from '../inbox/inbox.verb.ts';
import type { SummaryHow } from '../summary/summary.verb.ts';
import type { Engine } from '../runtime-client.ts';
import { Invalid, Missing } from '../refusal/refusal.ts';
import { parseSelectors, selectorsRefusal, selectsLabels } from '../watch/selector.ts';
import { pageOf } from './page.ts';

/** What a list of cards is asked: its namespace (none for every card), `?limit=`, `?continue=`, and its label selectors, OR'd. */
export type CardQuery = {
  readonly namespace?: string | undefined;
  readonly limit?: number | null | undefined;
  readonly continue?: string | undefined;
  readonly labelSelector?: readonly string[] | undefined;
};

/** The namespace of a listed card: its factory, or `default`. */
const namespaceOf = (l: InboxListing): string => l.factory ?? DEFAULT_NAMESPACE;

/**
 * What a list orders an entry by and a token carries: its name, then its file, so a stray `notes` and the card `notes.md`, both named
 * `notes`, are two places of the list. A line break sorts below every letter a name holds, so the order is the names' first.
 */
const keyOf = (l: InboxListing): string => `${l.name}\n${l.file}`;

/** Entries in the order a list answers them and a token reads them: by their key's UTF-16 code units, as `<` compares. */
const byName = (a: InboxListing, b: InboxListing): number => (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0);

/** The digest of a card's text: its `resourceVersion`. */
const digestOf = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 16);

/** The body a card's text holds, or none where it does not read. */
const bodyOf = (l: InboxListing, text: string): string | undefined => {
  if (l.error !== null) return undefined;
  try {
    return parseInboxCard(l.file, text, () => true).body;
  } catch {
    return undefined;
  }
};

/** The object of the listed card `l`, of its text and filing time. */
const cardOf = (l: InboxListing, text: string, filedAt: string): Card => {
  const body = bodyOf(l, text);
  return {
    apiVersion: API_VERSION,
    kind: 'Card',
    metadata: {
      name: l.name,
      namespace: namespaceOf(l),
      ...(Object.keys(l.labels).length ? { labels: { ...l.labels } } : {}),
      creationTimestamp: filedAt,
      resourceVersion: digestOf(text),
    },
    spec: {
      ...(l.workflow !== null ? { workflow: l.workflow } : {}),
      ...(l.repo !== null ? { repo: l.repo } : {}),
      ...(l.gate !== undefined ? { gate: l.gate } : {}),
      ...(l.from.length ? { from: [...l.from] } : {}),
      ...(l.queued !== undefined ? { queued: l.queued.at } : {}),
      ...(body !== undefined ? { body } : {}),
    },
    status: {
      state: l.state,
      runs: [...l.startedAs],
      ...(l.tried !== undefined ? { lastStart: { ...l.tried } } : {}),
      ...(l.title !== null ? { title: l.title } : {}),
      ...(l.error !== null ? { error: l.error } : {}),
      inPlay: CARD_IN_PLAY[l.state],
      ...(l.queued !== undefined && l.queued.place !== null ? { place: l.queued.place } : {}),
      file: l.file,
    },
  };
};

/**
 * The object of the listed entry `l`, read through the Card door: a card, or a stray entry with no text, dated when it was last written.
 * Null for one gone since the listing.
 */
const objectOf = Effect.fn('objectOf')(function* (l: InboxListing) {
  const door = yield* CardDoor;
  if (!l.file.endsWith('.md')) {
    const at = yield* door.cards.entryAt(l);
    return at === null ? null : cardOf(l, '', at);
  }
  const name = CardName.read(l.name);
  const text = yield* door.cards.read(name);
  const filedAt = yield* door.cards.filedAt(name);
  return text === null || filedAt === null ? null : cardOf(l, text, filedAt);
});

/** The listed cards `selectors` keep, sorted by name, or `Invalid` naming the clause that is not a selector's. */
const selected = (listing: readonly InboxListing[], selectors: readonly string[]): Effect.Effect<InboxListing[], Invalid> => {
  const refusal = selectorsRefusal(selectors);
  if (refusal !== undefined)
    return Effect.fail(new Invalid({ message: `labelSelector: ${refusal}. Correct it, or leave labelSelector out to list every card` }));
  const parsed = parseSelectors(selectors);
  return Effect.succeed(listing.filter((l) => selectsLabels(parsed, cardLabels(l))).sort(byName));
};

/**
 * A page of the cards `listing` holds (`CardList`): those of `query.namespace` (every card where none is given) that its label selectors
 * keep, sorted by name, cut by its `limit` after its `continue`. `Invalid` for a selector, a limit or a token that is not one.
 */
export const cardListOf = Effect.fn('cardListOf')(function* (listing: readonly InboxListing[], query: CardQuery) {
  const { namespace } = query;
  const inNamespace = namespace === undefined ? listing : listing.filter((l) => namespaceOf(l) === namespace);
  const kept = yield* selected(inNamespace, query.labelSelector ?? []);
  const page = pageOf(kept, keyOf, { limit: query.limit ?? null, continue: query.continue });
  if (page instanceof Invalid) return yield* Effect.fail(page);
  const items = (yield* Effect.forEach(page.items, objectOf)).filter((c): c is Card => c !== null);
  const answered: CardList = {
    apiVersion: API_VERSION,
    kind: 'CardList',
    metadata: {
      remainingItemCount: page.remainingItemCount,
      ...(page.continue !== undefined ? { continue: page.continue } : {}),
    },
    items,
  };
  return answered;
});

/**
 * The card `name` of `listing` as an object, in `namespace` where one is given: `Missing` where no card has that name, or the one that
 * does is in another namespace.
 */
export const cardObjectOf = Effect.fn('cardObjectOf')(function* (listing: readonly InboxListing[], name: string, namespace?: string) {
  const l = listing.find(
    (entry) => entry.file.endsWith('.md') && entry.name === name && (namespace === undefined || namespaceOf(entry) === namespace),
  );
  const card = l === undefined ? null : yield* objectOf(l);
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

/** The inbox card `name` as an object (`cardObjectOf`), in `namespace` where one is given, off the inbox as it reads now. */
export const cardObject = Effect.fn('cardObject')(function* (e: Engine, how: SummaryHow, name: string, namespace?: string) {
  return yield* cardObjectOf(yield* inboxJudged(e, how), name, namespace);
});

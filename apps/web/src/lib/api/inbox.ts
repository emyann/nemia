/**
 * The inbox: its cards, read through the objects' client as `Card`s (`GET /api/cards`) and made the board's entries in one place
 * (`entriesOf`), and a card filed, dropped, started, queued and taken off the queue through the Card's verbs (`objects.ts`). A card's page
 * reads the Card by its name (`GET /api/cards/:name`), its file as written and its keys made of it here (`cardKeysOf`); its `from:` is
 * the Card written whole (`PUT /api/namespaces/:namespace/cards/:name`).
 */
import { queryOptions } from '@tanstack/react-query';
import {
  type Card,
  CARD_KEY_MEANINGS,
  CARD_KEYS,
  type CardKey,
  type CardList,
  type CardSpec,
  type CardState,
  DEFAULT_NAMESPACE,
} from 'objects';
import { selectorKey } from './selector.ts';
import { cards } from './objects.ts';
import { factoryIn, namespaceOf } from './namespace.ts';
import { sourceOf, type KeyRow } from './library.ts';
import type { Place, Started, WorkflowListing } from './workflows.ts';

/**
 * A card's life, as the orchestrator computes it once and the api sends it (`CARD_STATES` of `objects`): its own until it starts —
 * `refused` queued and refused as it stands, `queued` queued otherwise, `filed` every other, an entry that does not read as a card among
 * them — and its run's phase from then on, read as the inbox is read and never kept on the card. The board reads it and never rebuilds it
 * from `queued`, `tried`, `startedAs` or the run.
 */
export { CARD_STATES, type CardState } from 'objects';

/**
 * A card as the board's pages draw it — or an entry of the inbox that does not read as one, `error` saying why — with its body, the brief
 * a start is prefilled with, and when its file was written, which the page orders the cards by. Made of a `Card` (`entryOf`), on the list
 * and on a card's page (`cardQuery`) alike.
 */
export type InboxEntry = {
  name: string;
  file: string;
  /** The first line of its body; null for an entry that does not read. */
  title: string | null;
  /** As the card writes it: a workflow's name, or the absolute folder of one. */
  workflow: string | null;
  repo: string | null;
  /** The factory the card names (`factory:`); null for a card that names none, and for an entry that does not read as a card. */
  factory: string | null;
  /** The runs its run is handed as context (`from:`), read and never waited on: none for a card without the line. */
  from: string[];
  /** The step its run is gated at, as written; absent on a card with no gate. */
  gate?: string;
  /** The runs a record says it was started as, each linked from the card: a started card keeps its file, and stays in the inbox. */
  startedAs: string[];
  /** Its life, closed (`CardState`): what the page offers on it and how it draws it. */
  state: CardState;
  error: string | null;
  body: string | null;
  filedAt: string | null;
  /**
   * On a queued card only (the CLI's `inbox queue`): when it was queued, and its place in the order the tick starts cards in, from 1 — null
   * for a card a record says was started, which the tick never starts again.
   */
  queued?: { at: string; place: number | null };
  /**
   * On a queued card only, whose start the tick tried and did not make, as the card stands: when, on which repository, why, and whether the
   * package refused it — which lasts until the card is edited or queued again — or something else failed, which the tick tries again.
   */
  tried?: { at: string; repo: string; why: string; refused: boolean };
  /**
   * The repository the card's factory picks for it: its factory's one repository, for a card that names none — null for a card that names
   * its own, one whose factory has several or does not read, and an entry that does not read as a card.
   */
  factoryRepo: string | null;
  /** The card's own labels (its frontmatter's `labels:`), `{}` for none. */
  labels: Record<string, string>;
};

/**
 * `card` as the board's entry (`InboxEntry`), its queued place the one the api answers (`status.place`): its file its name's markdown,
 * as every card listed is; its factory its namespace, none for `default`; `null` where the card says nothing. `factoryRepo` is null:
 * the Card does not say which repository its factory picks for it, so the page reads that off the factories (`factoryRepoOf`,
 * lib/inbox.ts).
 */
export const entryOf = (card: Card): InboxEntry => {
  const { metadata, spec, status } = card;
  return {
    name: metadata.name,
    file: status.file ?? `${metadata.name}.md`,
    title: status.title ?? null,
    workflow: spec.workflow ?? null,
    repo: spec.repo ?? null,
    factory: factoryIn(metadata.namespace),
    from: [...(spec.from ?? [])],
    ...(spec.gate !== undefined ? { gate: spec.gate } : {}),
    startedAs: [...status.runs],
    state: status.state,
    error: status.error ?? null,
    body: spec.body ?? null,
    filedAt: metadata.creationTimestamp,
    ...(spec.queued !== undefined ? { queued: { at: spec.queued, place: status.place ?? null } } : {}),
    ...(status.lastStart !== undefined ? { tried: { ...status.lastStart } } : {}),
    factoryRepo: null,
    labels: { ...metadata.labels },
  };
};

/** The entries of a page of cards (`entryOf`). */
export const entriesOf = (list: CardList): InboxEntry[] => list.items.map(entryOf);

/** Every card that `selector` takes by its labels (`?labelSelector=`), or every card for none. */
const cardsListed = async (selector: string | undefined): Promise<CardList> => {
  const picked = selector === undefined || selector.trim() === '' ? undefined : selector.trim();
  return cards.listAll(picked);
};

/** Every card that `selector` takes, as entries. */
const cardsSelected = async (selector: string | undefined): Promise<InboxEntry[]> => entriesOf(await cardsListed(selector));

/** The cards of `selector` still in play, as the api says of each (`status.inPlay`). */
const inPlaySelected = async (selector: string | undefined): Promise<InboxEntry[]> =>
  (await cardsListed(selector)).items.filter((card) => card.status.inPlay).map(entryOf);

/**
 * The inbox's cards still in play: each not yet started, and each whose run is pending, running or waiting — a card whose run ended is
 * left out (`inboxAllQuery` lists it). Not polled: it changes when a person files, drops or starts a card, here or at the command line.
 * Read again on each visit, and on a run's event on the workflow feed, which a queued card started is, and a run ending too; the feed says
 * nothing of cards.
 */
export const inboxQuery = queryOptions({
  queryKey: ['inbox'],
  queryFn: () => inPlaySelected(undefined),
});

/** The inbox's cards in play that `selector` takes by their labels, or every one for none; under `['inbox']`, read again with it. */
export const inboxSelectedQuery = (selector: string | undefined) =>
  queryOptions({
    queryKey: ['inbox', ...selectorKey(selector)],
    queryFn: () => inPlaySelected(selector),
  });

/**
 * Every card of the inbox, its run ended or not, that `selector` takes by its labels, or every card for none: the Inbox page's read, which
 * splits them into in play and ended itself (`CARD_KIND`). Under `['inbox']`, read again with it; keyed by an object, which no card's name
 * can be, so a card named `all` keeps its page's key (`cardQuery`, `['inbox', name]`).
 */
export const inboxAllQuery = (selector: string | undefined) =>
  queryOptions({
    queryKey: ['inbox', { all: true }, ...selectorKey(selector)],
    queryFn: () => cardsSelected(selector),
  });

/**
 * Reads the inbox with `selector`: resolves where the api reads it, rejects with the api's words where it refuses it (a 422 naming the
 * clause). The label filter's check before it writes the address.
 */
export const checkSelector = (selector: string): Promise<unknown> => cards.listAll(selector.trim());

/**
 * A card's page: the card as the inbox lists it (`entryOf`), its file as written, frontmatter included (`status.source`, sent on a read of
 * one card), and each key a card may set, a row each (`cardKeysOf`) — none for an entry that does not read as a card.
 */
export type InboxCardPage = InboxEntry & { source: string; keys: KeyRow[] | null };

/** Labels as a printer shows them, `a=b,c=d` in key order, as the orchestrator's `labelsText` does; null for none. */
const labelsText = (labels: Readonly<Record<string, string>>): string | null => {
  const keys = Object.keys(labels).sort();
  return keys.length === 0 ? null : keys.map((key) => `${key}=${labels[key] ?? ''}`).join(',');
};

/**
 * The value a card's page shows for `key` of `card`: when it was queued, the runs its `from:` names, comma-joined, its labels as
 * `a=b,c=d`, its factory (its namespace, none for `default`), or what the card writes; null for a key it does not set.
 */
const keyValue = (card: Card, key: CardKey): string | null => {
  const entry = entryOf(card);
  if (key === 'queued') return entry.queued?.at ?? null;
  if (key === 'from') return entry.from.join(', ') || null;
  if (key === 'labels') return labelsText(entry.labels);
  return entry[key] ?? null;
};

/**
 * Each key a card may set, a row each in `CARD_KEYS`' order, with its value (`keyValue`) and what it means (`CARD_KEY_MEANINGS`): the
 * rows a card's page draws. Null for an entry that does not read as a card: its `error` says why.
 */
export const cardKeysOf = (card: Card): KeyRow[] | null =>
  card.status.error === undefined ? CARD_KEYS.map((key) => ({ key, value: keyValue(card, key), meaning: CARD_KEY_MEANINGS[key] })) : null;

/**
 * A card, for its page: the Card read by its name, whichever factory holds it (`cards.getAll`). Read again on each visit, as the inbox
 * is.
 */
export const cardQuery = (name: string) =>
  queryOptions({
    queryKey: ['inbox', name],
    queryFn: async (): Promise<InboxCardPage> => {
      const card = await cards.getAll(name);
      return { ...entryOf(card), source: card.status.source ?? '', keys: cardKeysOf(card) };
    },
  });

/** A card as a verb names it: its name, and its factory, which is its namespace (`namespaceOf`). */
type CardRef = Pick<InboxEntry, 'name' | 'factory'>;

/**
 * File an idea as a card, as the CLI's `inbox add "<idea>" --workflow <name> --repo <path> --factory <name>` does: in `factory`'s
 * namespace when it names one, in `default` when it is left out (the Card's `create`). Resolves with the card's name; rejects with the
 * api's refusal in full — the package's words for an idea with nothing in it, a repository that is not an absolute path to a directory or
 * a factory the store does not have, or the api's own about the request or a workflow it has none of.
 */
export const fileCard = async ({
  factory,
  from,
  ...card
}: {
  body: string;
  workflow?: string;
  from?: WorkflowListing['from'];
  repo?: string;
  factory?: string;
}): Promise<{ name: string }> => {
  const filed = await cards.create(namespaceOf(factory), { ...card, ...(from ? { from: sourceOf(from) } : {}) });
  return { name: filed.metadata.name };
};

/**
 * Drop a card without starting it, as the CLI's `inbox rm <name>` does (the Card's `delete`). Rejects with the api's refusal in full: the
 * package's words for a card that is not there, or for a name that is not a card's.
 */
export async function dropCard(card: CardRef): Promise<void> {
  await cards.delete(namespaceOf(card.factory), card.name);
}

/**
 * Queue a card to start on its own, as the CLI's `inbox queue <name>` does — or, `off`, take it off the queue, as `--off` does (the Card's
 * `queue` and `unqueue`). The tick starts the next card in the queue when a run slot frees, on the workflow the card names. Resolves with
 * the card as it now reads; rejects with the api's refusal in full — the package's words for a card that is not there, names no workflow,
 * is queued already or was started — or the api's own about the request.
 */
export const queueCard = (card: CardRef, { off = false }: { off?: boolean } = {}): Promise<Card> =>
  off ? cards.unqueue(namespaceOf(card.factory), card.name) : cards.queue(namespaceOf(card.factory), card.name);

/**
 * Start a card, as the CLI's `start <inbox>/<card>.md --brief <brief>` does (the Card's `start`): its run on `workflow`, waiting on
 * `after` and reading `context` when given, the card kept in the inbox and listed as started. `place` starts it in a factory on one of
 * its repositories, as a factory's start does (`placeQuery`): none for the default factory. Resolves with the new run; rejects with the
 * api's refusal in full — a card not there, one started already, a workflow its factory does not offer.
 */
export const startCard = (
  card: CardRef,
  start: { workflow: string; from: WorkflowListing['from']; brief: string; after?: readonly string[]; context?: readonly string[] },
  place?: Place | null,
): Promise<Started> =>
  cards
    .start(
      namespaceOf(card.factory),
      card.name,
      { ...start, from: sourceOf(start.from) },
      place && place.factory !== DEFAULT_NAMESPACE ? place : undefined,
    )
    .then(({ id, card: started }) => ({ id, card: started }));

/**
 * Set the runs a card's run is handed as context, as the CLI's `inbox from <name> <run>...` does — or, with none, take its `from:` off, as
 * `--off` does: the card read as it now stands, then written whole (`cards.replace`) with its spec but `from`, `queued` as read, its labels
 * and the `resourceVersion` it was read at, so a card changed in between is refused, not overwritten. Resolves with the card as it now
 * reads; rejects with the api's refusal in full: a card that is not there or was started, a run the store does not have, a card changed
 * since it was read — or the api's own about the request.
 */
export async function setCardFrom(card: CardRef, runs: readonly string[]): Promise<Card> {
  const namespace = namespaceOf(card.factory);
  const read = await cards.get(namespace, card.name);
  const { from: _, ...kept } = read.spec;
  const spec: CardSpec = runs.length ? { ...kept, from: [...runs] } : kept;
  return cards.replace(namespace, card.name, {
    metadata: { resourceVersion: read.metadata.resourceVersion, labels: { ...read.metadata.labels } },
    spec,
  });
}

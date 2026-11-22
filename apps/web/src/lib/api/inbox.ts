/**
 * The inbox: its cards, read through the objects' client as `Card`s (`GET /api/cards`, a factory's by its namespace) and made the board's
 * entries in one place (`entriesOf`), and a card filed, dropped, started, queued and taken off the queue through the Card's verbs
 * (`objects.ts`). A card's page reads the Card by its name (`GET /api/cards/:name`), its file as written and its keys made of it here
 * (`cardKeysOf`); its `from:` is the Card written whole (`PUT /api/namespaces/:namespace/cards/:name`).
 */
import { queryOptions } from '@tanstack/react-query';
import {
  type Card,
  CARD_KEY_MEANINGS,
  CARD_KEYS,
  type CardKey,
  type CardFileStatus,
  type CardList,
  type CardSpec,
  type CardState,
  type CardWait,
  DEFAULT_NAMESPACE,
  filedNamespace,
} from 'objects';
import { selectorKey } from './selector.ts';
import { cards, files, type StartFiles } from './objects.ts';
import { factoryIn, namespaceOf } from './namespace.ts';
import { type KeyRow } from './library.ts';

/**
 * A card's life, as the orchestrator computes it once and the api sends it (`CARD_STATES` of `objects`): its own until it starts —
 * `refused` queued and refused as it stands, `queued` queued otherwise, `filed` every other, an entry that does not read as a card among
 * them — and its run's phase from then on, read as the inbox is read and never kept on the card. The board reads it and never rebuilds it
 * from `queued`, `tried`, `startedAs` or the run.
 */
export { CARD_STATES, type CardState } from 'objects';

/**
 * A card as the board's pages draw it — or an entry of the inbox that does not read as one, `error` saying why — and when its file was
 * written, which the page orders the cards by. Made of a `Card` (`entryOf`), on the list and on a card's page (`cardQuery`) alike; its
 * body, the brief a start is prefilled with, is file content no list carries, and comes with the read of the one card (`cardQuery`).
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
  filedAt: string | null;
  /**
   * On a queued card only (the CLI's `inbox queue`, or a card trigger of its factory, `by`): when it was queued — a triggered card when it
   * was filed — and its place in the order the tick starts cards in, from 1, null for a card a record says was started, which the tick
   * never starts again; and the triggers that queue it, where it is not queued by hand.
   */
  queued?: { at: string; place: number | null; by?: string[] };
  /** On a card two triggers of its factory would send to two workflows: their names. It waits until a selector or its labels change. */
  clash?: string[];
  /**
   * On a card not started whose `after:` names cards that have not landed (`status.waitingOn`): each, where its work stands and whether
   * only a person can release it. No trigger queues it and the tick starts none of it while any is listed.
   */
  waits?: CardWait[];
  /**
   * On a queued card only, whose start the tick tried and did not make, as the card stands: when, on which repository, why, and whether the
   * package refused it — which lasts until the card is edited or queued again — or something else failed, which the tick tries again.
   */
  tried?: { at: string; repo: string; why: string; refused: boolean };
  /**
   * The repository the card's factory places its run on, by its wiring for the card's workflow (`cardRepo`): null where it gives none,
   * for a card of no factory, one whose factory does not read, and an entry that does not read as a card.
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
 * @param card The Card as the api serves it, on a list or alone.
 */
export const entryOf = (card: CardList['items'][number]) => {
  const { metadata, spec, status } = card;
  const entry: InboxEntry = {
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
    filedAt: metadata.creationTimestamp,
    ...(spec.queued !== undefined
      ? { queued: { at: spec.queued, place: status.place ?? null } }
      : status.queuedBy !== undefined
        ? { queued: { at: metadata.creationTimestamp, place: status.place ?? null, by: [...status.queuedBy] } }
        : {}),
    ...(status.clash !== undefined ? { clash: [...status.clash] } : {}),
    ...(status.waitingOn?.length ? { waits: status.waitingOn.map((w) => ({ ...w, ...(w.cycle ? { cycle: [...w.cycle] } : {}) })) } : {}),
    ...(status.lastStart !== undefined ? { tried: { ...status.lastStart } } : {}),
    factoryRepo: null,
    labels: { ...metadata.labels },
  };
  return entry;
};

/**
 * The entries of a page of cards (`entryOf`).
 * @param list A page of Cards as the api serves it.
 */
export const entriesOf = (list: CardList) => list.items.map(entryOf);

/** The field selector that keeps the cards still in play, as the api says of each (`status.inPlay`). */
const IN_PLAY = 'status.inPlay=true';

/** `selector` as the api is sent it: trimmed, and none for a blank one. */
const pickedOf = (selector: string | undefined) => (selector === undefined || selector.trim() === '' ? undefined : selector.trim());

/**
 * Every card that `selector` takes by its labels (`?labelSelector=`), or every card for none: of every factory, or of `factory`'s
 * namespace alone where one is given.
 */
const cardsListed = async (selector: string | undefined, factory: string | undefined) => {
  const picked = pickedOf(selector);
  const query = picked === undefined ? {} : { labelSelector: picked };
  return factory === undefined ? cards.listAll(query) : cards.list(namespaceOf(factory), query);
};

/** Every card that `selector` takes, of every factory or of `factory`'s alone, as entries. */
const cardsSelected = async (selector: string | undefined, factory: string | undefined) => entriesOf(await cardsListed(selector, factory));

/** The cards of `selector` still in play, as the api keeps them (`?fieldSelector=status.inPlay=true`). */
const inPlaySelected = async (selector: string | undefined) => {
  const picked = pickedOf(selector);
  return entriesOf(await cards.listAll({ fieldSelector: IN_PLAY, ...(picked === undefined ? {} : { labelSelector: picked }) }));
};

/**
 * How long a read of a factory's cards in play stands fresh (`factoryInboxQuery`): what a page's loader read is not asked again as the page
 * mounts.
 */
const INBOX_FRESH_MS = 10_000;

/**
 * A factory's cards still in play, as the api keeps them (`GET /api/namespaces/:namespace/cards?fieldSelector=status.inPlay=true`): each
 * not yet started, and each whose run is pending, running or waiting — a card whose run ended is left out (`inboxAllQuery` lists it) —
 * each with its place in the queue of the whole inbox. Never every card of every factory: the floor draws only its own. It changes when a
 * person files, drops or starts a card, here or at the command line. Read again on each visit once `INBOX_FRESH_MS` has passed since the
 * last read, and on a run's event on the workflow feed, which a queued card started is, and a run ending too. One key for every reader
 * of a factory's page (the factory pane's line, the floor's queue), so the page asks it once: the route's loader starts it, never
 * waiting on it, and the readers that mount find it. Keyed by an object under `['inbox']`, which no card's name can be (`cardQuery`).
 * @param factory The factory whose cards are read, by its name; the default factory's are its namespace's (`namespaceOf`).
 */
export const factoryInboxQuery = (factory: string) =>
  queryOptions({
    queryKey: ['inbox', { factory }],
    queryFn: async () => entriesOf(await cards.list(namespaceOf(factory), { fieldSelector: IN_PLAY })),
    staleTime: INBOX_FRESH_MS,
  });

/**
 * The inbox's cards in play that `selector` takes by their labels, or every one for none; under `['inbox']`, read again with it.
 * @param selector A label selector, `?labelSelector=`; undefined or blank for every card.
 */
export const inboxSelectedQuery = (selector: string | undefined) =>
  queryOptions({
    queryKey: ['inbox', ...selectorKey(selector)],
    queryFn: () => inPlaySelected(selector),
  });

/**
 * Every card of the inbox, its run ended or not, that `selector` takes by its labels, or every card for none: the Inbox page's read, which
 * splits them into in play and ended itself (`CARD_KIND`). The store's Inbox reads every factory's (`GET /api/cards`); a factory's Inbox
 * its own namespace's alone (`GET /api/namespaces/:namespace/cards`), each queued card's place still the one of the whole inbox. Under
 * `['inbox']`, read again with it; keyed by an object, which no card's name can be, so a card named `all` keeps its page's key
 * (`cardQuery`, `['inbox', name]`), and a factory's key is its own, apart from the floor's (`factoryInboxQuery`).
 * @param selector A label selector, `?labelSelector=`; undefined or blank for every card.
 * @param factory The factory whose cards alone are read, by its name (`namespaceOf`); undefined for every factory's.
 */
export const inboxAllQuery = (selector: string | undefined, factory?: string) =>
  queryOptions({
    queryKey: ['inbox', factory === undefined ? { all: true } : { all: true, factory }, ...selectorKey(selector)],
    queryFn: () => cardsSelected(selector, factory),
  });

/**
 * Reads the inbox with `selector`: resolves where the api reads it, rejects with the api's words where it refuses it (a 422 naming the
 * clause). The label filter's check before it writes the address.
 * @param selector The label selector to check, as a person typed it.
 */
export const checkSelector = (selector: string) => cards.listAll({ labelSelector: selector.trim() });

/**
 * A card's page: the card as the inbox lists it (`entryOf`), its file as written, frontmatter included (`status.source`, sent on a read of
 * one card), and each key a card may set, a row each (`cardKeysOf`) — none for an entry that does not read as a card.
 */
export type InboxCardPage = InboxEntry & { source: string; keys: KeyRow[] | null; files: CardFileStatus[] };

/** Labels as a printer shows them, `a=b,c=d` in key order, as the orchestrator's `labelsText` does; null for none. */
const labelsText = (labels: Readonly<Record<string, string>>) => {
  const keys = Object.keys(labels).sort();
  return keys.length === 0 ? null : keys.map((key) => `${key}=${labels[key] ?? ''}`).join(',');
};

/** A card's models as it writes them, `implement=fable, review=opus`, as the orchestrator's `modelsText` does; null for none. */
const modelsText = (models: Readonly<Record<string, string>>) =>
  Object.entries(models)
    .map(([step, model]) => `${step}=${model}`)
    .join(', ') || null;

/**
 * The value a card's page shows for `key` of `card`: when it was queued, the runs its `from:` names and the cards its `after:` names,
 * each comma-joined, its models as
 * `<step>=<model>`, comma-joined, its labels as
 * `a=b,c=d`, its factory (its namespace, none for `default`), or what the card writes; null for a key it does not set.
 */
const keyValue = (card: Card, key: CardKey) => {
  const entry = entryOf(card);
  if (key === 'queued') return entry.queued?.at ?? null;
  if (key === 'from') return entry.from.join(', ') || null;
  if (key === 'after') return (card.spec.after ?? []).join(', ') || null;
  if (key === 'labels') return labelsText(entry.labels);
  if (key === 'model') return modelsText(card.spec.model ?? {});
  if (key === 'files') return (card.spec.files ?? []).map((f) => f.name).join(', ') || null;
  return entry[key] ?? null;
};

/**
 * Each key a card may set, a row each in `CARD_KEYS`' order, with its value (`keyValue`) and what it means (`CARD_KEY_MEANINGS`): the
 * rows a card's page draws. Null for an entry that does not read as a card: its `error` says why.
 * @param card The Card as the api serves it, its own error said in its status where it does not read.
 */
export const cardKeysOf = (card: Card) =>
  card.status.error === undefined ? CARD_KEYS.map((key) => ({ key, value: keyValue(card, key), meaning: CARD_KEY_MEANINGS[key] })) : null;

/**
 * A card, for its page: the Card read by its name, whichever factory holds it (`cards.getAll`), with its body and its file as written,
 * which no list carries. Read again on each visit, as the inbox is.
 * @param name The card's name.
 */
export const cardQuery = (name: string) =>
  queryOptions({
    queryKey: ['inbox', name],
    queryFn: async () => {
      const card = await cards.getAll(name);
      return {
        ...entryOf(card),
        body: card.spec.body ?? null,
        source: card.status.source ?? '',
        keys: cardKeysOf(card),
        files: [...(card.status.files ?? [])],
      };
    },
  });

/**
 * The body of a card, the brief its start is prefilled with, read by its name (`cards.getAll`) each time a start opens, since no list
 * carries it. Keyed apart from the inbox's reads, which a start reads again: those must not read again a card the start took away.
 * @param name The card's name.
 */
export const cardBodyQuery = (name: string) =>
  queryOptions({
    queryKey: ['card-body', name],
    queryFn: async () => (await cards.getAll(name)).spec.body ?? '',
    refetchOnWindowFocus: false,
    retry: false,
  });

/** A card as a verb names it: its name, and its factory, which is its namespace (`namespaceOf`). */
type CardRef = Pick<InboxEntry, 'name' | 'factory'>;

/**
 * Files attached to a card, as the CLI's `inbox attach <name> <path>...` does: each uploaded first to the card's namespace, then named to
 * the card by its id under its own name (the Card's `attach`). Rejects with the api's refusal in full: a started card, a name it carries
 * already, more files or bytes than a card carries.
 * @param card The card: its name and its factory.
 * @param given The files a person dropped, pasted or chose.
 */
export async function attachToCard(card: CardRef, given: readonly File[]) {
  const namespace = namespaceOf(card.factory);
  const named = await files.uploaded(namespace, { listed: given, sent: new Map() });
  return cards.attach(
    namespace,
    card.name,
    named.flatMap((input) => (input.name !== undefined && input.file !== undefined ? [{ name: input.name, file: input.file }] : [])),
  );
}

/**
 * A file taken off a card, as the CLI's `inbox detach <name> <file>` does (the Card's `detach`).
 * @param card The card: its name and its factory.
 * @param file The file's name in the card.
 */
export const detachFromCard = (card: CardRef, file: string) => cards.detach(namespaceOf(card.factory), card.name, file);

/**
 * Where a card's file is read: the bytes of the File it names in the card's namespace (`GET
 * /api/namespaces/:namespace/files/:id/content`), a picture served as itself, which the card's markdown shows in place of its name.
 * @param card The card: its factory.
 * @param file The File's id.
 */
export const cardFileUrl = (card: Pick<InboxEntry, 'factory'>, file: string) =>
  `/api/namespaces/${encodeURIComponent(namespaceOf(card.factory))}/files/${encodeURIComponent(file)}/content`;

/**
 * File an idea as a card, as the CLI's `inbox add "<idea>" --workflow <name> --factory <name>` does: in `factory`'s namespace when it
 * names one, else in that of the factory the idea's own `factory:` line names, else in `default` (`filedNamespace`, the Card's `create`).
 * Never a repository nor an origin: the factory places the card's run and finds its workflow by name. Resolves with the card's name;
 * rejects with the api's refusal in full — the package's words for an idea with nothing in it or a factory the store does not have, or the
 * api's own about the request or a workflow it has none of. `label`, where given, are the labels the card is filed with, each `key=value`,
 * which its run is started with too; `given`, the files it carries, each uploaded first to its namespace and named by its id.
 */
export const fileCard = async ({
  factory,
  body,
  workflow,
  label,
  given,
}: {
  body: string;
  workflow?: string;
  factory?: string;
  label?: readonly string[];
  given?: readonly File[];
}) => {
  const namespace = filedNamespace(body, factory);
  const named = given === undefined || given.length === 0 ? [] : await files.uploaded(namespace, { listed: given, sent: new Map() });
  const carried = named.flatMap((input) => (input.file !== undefined ? [{ file: input.file, name: input.name }] : []));
  const filed = await cards.create(namespace, {
    body,
    ...(workflow === undefined ? {} : { workflow }),
    ...(label === undefined ? {} : { label }),
    ...(carried.length === 0 ? {} : { files: carried }),
  });
  return { name: filed.metadata.name };
};

/**
 * Drop a card without starting it, as the CLI's `inbox rm <name>` does (the Card's `delete`). Rejects with the api's refusal in full: the
 * package's words for a card that is not there, or for a name that is not a card's.
 * @param card The card to drop: its name and its factory.
 */
export async function dropCard(card: CardRef) {
  await cards.delete(namespaceOf(card.factory), card.name);
}

/**
 * Queue a card to start on its own, as the CLI's `inbox queue <name>` does — or, `off`, take it off the queue, as `--off` does (the Card's
 * `queue` and `unqueue`). The tick starts the next card in the queue when a run slot frees, on the workflow the card names. Resolves with
 * the card as it now reads; rejects with the api's refusal in full — the package's words for a card that is not there, names no workflow,
 * is queued already or was started — or the api's own about the request.
 * @param card The card to queue or take off the queue: its name and its factory.
 */
export const queueCard = (card: CardRef, { off = false }: { off?: boolean } = {}) =>
  off ? cards.unqueue(namespaceOf(card.factory), card.name) : cards.queue(namespaceOf(card.factory), card.name);

/**
 * Send a started card on, as the CLI's `inbox resend` does (the Card's `resend`): filed again as `<run>-resent`, handed its run, queued on
 * `workflow` or, for none, left for its factory's card triggers; the run it came from called off when it waits on a person. Resolves with
 * what the api answers; rejects with its refusal in full — a card never started, sent on already, or whose run is still at work.
 * @param card The started card: its name and its factory.
 * @param workflow The workflow to send it on to, by its name; none for its factory's card triggers.
 */
export const resendCard = (card: CardRef, workflow?: string) =>
  cards.resend(namespaceOf(card.factory), card.name, workflow === undefined ? {} : { workflow });

/**
 * Start a card, as the CLI's `start <inbox>/<card>.md --brief <brief>` does (the Card's `start`): its run on `workflow`, by its name,
 * waiting on `after` and reading `context` when given, the card kept in the inbox and listed as started. `factory` starts it in that
 * factory, for a card that names none: none for the default factory. Never a repository nor an origin: the factory places the run by its
 * wiring for the workflow and finds the workflow by its name. Resolves with the new run; rejects with the api's refusal in full — a card
 * not there, one started already, a workflow its factory does not offer, one its factory wires to no repository.
 * @param card The card to start: its name and its factory.
 * @param start Its run's workflow by name and its brief, the runs it waits on (`after`), the runs it reads as context, the files it is
 *   handed (`files`, each uploaded first into the card's namespace and named among its inputs by its id) and the steps gated in it
 *   (`gates`), each when given.
 * @param factory The factory to start it in, for a card that names none; null, undefined or the default namespace for the default factory.
 */
export const startCard = (
  card: CardRef,
  start: {
    workflow: string;
    brief: string;
    after?: readonly string[];
    context?: readonly string[];
    files?: StartFiles;
    gates?: readonly string[];
  },
  factory?: string | null,
) => {
  const namespace = namespaceOf(card.factory);
  const given = start.files;
  return (given === undefined || given.listed.length === 0 ? Promise.resolve([]) : files.uploaded(namespace, given))
    .then((inputs) =>
      cards.start(
        namespace,
        card.name,
        {
          workflow: start.workflow,
          brief: start.brief,
          ...(start.after === undefined ? {} : { after: start.after }),
          ...(start.context === undefined ? {} : { context: start.context }),
          ...(inputs.length === 0 ? {} : { inputs }),
          ...(start.gates === undefined ? {} : { gates: start.gates }),
        },
        factory && factory !== DEFAULT_NAMESPACE ? factory : undefined,
      ),
    )
    .then(({ id, card: started }) => ({ id, card: started }));
};

/**
 * Set the runs a card's run is handed as context, as the CLI's `inbox from <name> <run>...` does — or, with none, take its `from:` off, as
 * `--off` does: the card read as it now stands, then written whole (`cards.replace`) with its spec but `from`, `queued` as read, its labels
 * and the `resourceVersion` it was read at, so a card changed in between is refused, not overwritten. Resolves with the card as it now
 * reads; rejects with the api's refusal in full: a card that is not there or was started, a run the store does not have, a card changed
 * since it was read — or the api's own about the request.
 * @param card The card whose `from:` is set: its name and its factory.
 * @param runs The ids of the runs its run is handed; none takes the line off.
 */
export async function setCardFrom(card: CardRef, runs: readonly string[]) {
  const namespace = namespaceOf(card.factory);
  const read = await cards.get(namespace, card.name);
  const { from: _, ...kept } = read.spec;
  const spec: CardSpec = runs.length ? { ...kept, from: [...runs] } : kept;
  return cards.replace(namespace, card.name, {
    metadata: { resourceVersion: read.metadata.resourceVersion, labels: { ...read.metadata.labels } },
    spec,
  });
}

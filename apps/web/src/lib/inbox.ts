import type { CardState, InboxEntry } from './api/inbox.ts';
import type { Ceilings } from './api/ceilings.ts';
import type { Factory } from './api/factories.ts';
import type { WorkflowListing } from './api/workflows.ts';
import { type CardWait, DEFAULT_NAMESPACE } from 'objects';
import { shownIn, startRepo, type StartRepo } from './factories.ts';

/**
 * The inbox as the page lists it: the newest card first, by when its file was written (`filedAt`) — a card carries no time of its own —
 * then by name, so two filed in the same millisecond keep one order. An entry whose time is not known goes last.
 * @param entries The inbox's entries, as the api lists them.
 */
export const newestCardsFirst = (entries: readonly InboxEntry[]) =>
  [...entries].sort((a, b) => (b.filedAt ?? '').localeCompare(a.filedAt ?? '') || a.name.localeCompare(b.name));

/**
 * Where a card stands, by its state, one total table: `unstarted` its own three (filed, queued, refused), `in flight` a run pending,
 * running or waiting on a person, `ended` a run that ended. Whether a card started is read here, never from its `startedAs`; the first two
 * are the cards in play, which the api lists by default (the orchestrator's `CARD_IN_PLAY`).
 */
export const CARD_KIND: Readonly<Record<CardState, 'unstarted' | 'in flight' | 'ended'>> = {
  filed: 'unstarted',
  queued: 'unstarted',
  refused: 'unstarted',
  pending: 'in flight',
  running: 'in flight',
  waiting: 'in flight',
  succeeded: 'ended',
  failed: 'ended',
  stopped: 'ended',
  cancelled: 'ended',
};

/**
 * Whether a card was started: its state is a run's phase (`CARD_KIND`), whether that run is in flight or ended.
 * @param entry The inbox's entry: its state.
 */
export const startedCard = (entry: Pick<InboxEntry, 'state'>) => CARD_KIND[entry.state] !== 'unstarted';

/**
 * Whether a card is still in play: not started, or its run is in flight — what `GET /api/inbox` lists by default.
 * @param entry The inbox's entry: its state.
 */
export const inPlay = (entry: Pick<InboxEntry, 'state'>) => CARD_KIND[entry.state] !== 'ended';

/**
 * The cards still in play (`inPlay`), in their order: the Inbox page's In play, an entry that does not read as a card among them.
 * @param entries The inbox's entries, each with its state.
 */
export const cardsInPlay = <T extends Pick<InboxEntry, 'state'>>(entries: readonly T[]) => entries.filter(inPlay);

/**
 * The cards whose run ended (`CARD_KIND` `ended`), in their order: the Inbox page's Ended.
 * @param entries The inbox's entries, each with its state.
 */
export const cardsEnded = <T extends Pick<InboxEntry, 'state'>>(entries: readonly T[]) => entries.filter((entry) => !inPlay(entry));

/**
 * The Inbox page's `?cards=`: `ended` lists the cards whose run ended; absent, or any other value, the cards in play.
 * @param search The page's search, as the router parsed it.
 */
export const cardsSearch = (search: Record<string, unknown>) =>
  (search.cards === 'ended' ? { cards: 'ended' } : {}) satisfies { cards?: 'ended' };

/** Whether an entry of the inbox is a card's file, `<name>.md`, and not a stray file the listing shows with why it is not a card. */
const isCard = (entry: Pick<InboxEntry, 'file'>) => entry.file.endsWith('.md');

/**
 * Whether an entry of the inbox has a page, `/inbox/<name>`, among the entries listed with it: whether its name is one the api takes (the
 * package's `inboxNameRefusal`). Every card's is, and a stray file's where nothing else answers to its name, but a folder's, which the
 * listing names `sub/`, and a file's with a backslash in it: the api would refuse the name the page asks for, and a link would open a
 * refusal of what the Inbox page has just listed.
 *
 * And not a stray file's where a card of that name is listed beside it: `/inbox/notes` is `notes.md`, which the api's card page reads
 * before a stray `notes`, so the stray's link would open the card's page — another file's — under its own name.
 * @param entry The entry asked about: its name and its file.
 * @param entries Every entry listed with it, the entry among them.
 */
export const hasPage = (entry: Pick<InboxEntry, 'name' | 'file'>, entries: readonly Pick<InboxEntry, 'name' | 'file'>[]) =>
  entry.name.trim() !== '' &&
  !/[\\/\0]/.test(entry.name) &&
  !entry.name.startsWith('.') &&
  (isCard(entry) || !entries.some((other) => other.name === entry.name && isCard(other)));

/**
 * A start, a drop, a queue or its taking back, or a `from:` set, the api refused: the card as the page listed it, what was asked, and the
 * api's words.
 */
export type CardRefusal = { entry: InboxEntry; action: 'start' | 'remove' | 'queue' | 'unqueue' | 'from' | 'resend'; message: string };

/**
 * The inbox page's lines, newest first (`newestCardsFirst`): each card listed, with its refusal; and each card refused that the inbox, read
 * again after the refusal, no longer lists — dropped or started behind the page's back — in the place it was listed, so the refusal's
 * sentence stays where the person asked. A refusal of a card still listed is on that card, and on no line of its own.
 *
 * By the file, not the name: two entries may answer to one name — a card and a stray file beside it, `notes.md` and `notes` (`hasPage`) —
 * and a refusal is of the one the page asked about. Matched by name, a refused Remove of the card would draw its sentence under the stray
 * file too, which has no Remove to be refused.
 * @param entries The cards the inbox lists now.
 * @param refusals The refusals the page was given, each with the card as it was listed.
 */
export function cardLines(entries: readonly InboxEntry[], refusals: readonly CardRefusal[]) {
  const listed = new Set(entries.map((entry) => entry.file));
  const gone = refusals.filter((r) => !listed.has(r.entry.file));
  return newestCardsFirst([...entries, ...gone.map((r) => r.entry)]).map((entry) => {
    const refusal = refusals.find((r) => r.entry.file === entry.file) ?? null;
    return { entry, refusal, gone: !listed.has(entry.file) };
  });
}

/**
 * A workflow as a pick is keyed: its source and its name, since the repository and yours may each have one of a name.
 * @param workflow The workflow: its source and its name.
 */
export const workflowKey = (workflow: Pick<WorkflowListing, 'from' | 'name'>) => `${workflow.from}:${workflow.name}`;

/**
 * A card's `workflow:` that is a bare name — no slash, not `.` or `..` — the name of a workflow its factory offers. An older card's path is
 * no name: its start names the workflow.
 */
const isName = (workflow: string) => !/[\\/]/.test(workflow) && workflow !== '.' && workflow !== '..';

/**
 * Whether a card names no factory: it has no `factory:` line, or writes `default`, which is no factory to start in.
 * @param entry The card: its `factory:` line, null where it has none.
 */
export const unassigned = (entry: Pick<InboxEntry, 'factory'>) => entry.factory === null || entry.factory === DEFAULT_NAMESPACE;

/**
 * The factories a card can be filed or started in, in the api's order: each named one whose file reads, never the default factory.
 * @param factories The factories the api lists.
 */
export const factoriesOffered = <T extends Pick<Factory, 'default' | 'error'>>(factories: readonly T[]) =>
  factories.filter((f) => !f.default && f.error === null);

/**
 * The factory the box that files a card starts on: `shown`, the one the address names, when it is among `offered`; else `''`, no
 * factory.
 * @param shown The factory the address names, or undefined where it names none.
 * @param offered The factories a card can be filed in.
 */
export const factoryPreset = (shown: string | undefined, offered: readonly Pick<Factory, 'name'>[]) =>
  shown !== undefined && offered.some((f) => f.name === shown) ? shown : '';

/**
 * What the box that files a card holds when File is pressed: the idea; the factory now picked, null for none; and the name of the
 * workflow picked among those it offers, null for none.
 */
type FilingChoice = { idea: string; factory: Pick<Factory, 'name'> | null; workflow: string | null };

/**
 * What the box sends for `choice`, by what is offered now and never by what a list held before. With no factory, the idea alone: its
 * workflow comes with the factory its start picks. In a factory, its name, and the workflow picked, by its name. Never a repository nor
 * an origin: a card names a factory and a workflow, and the factory alone places its run (`startRepo`) and finds the workflow.
 */
export function cardFiling({ idea, factory, workflow }: FilingChoice) {
  if (factory === null) return { body: idea };
  return { body: idea, factory: factory.name, ...(workflow ? { workflow } : {}) };
}

/**
 * Where a card in a factory starts: the factory; the workflow it names, where the factory offers it by that name, else null for a person
 * to pick; and the repository the factory wires for that workflow (`startRepo`), or why it gives none — null while no workflow is
 * named. Null for a card that names no factory (`unassigned`), which starts once a person picks one (`startPlace`). For a factory the
 * store does not list, or whose file does not read, why the card cannot start in it.
 */
export type CardPlace = { factory: Factory; workflow: string | null; on: StartRepo | null } | { why: string };

/** The card's `workflow:` where `factory` offers it by that name, else null. */
const offeredName = (workflow: string | null, factory: Pick<Factory, 'workflows'>) =>
  workflow !== null && isName(workflow) && (factory.workflows ?? []).includes(workflow) ? workflow : null;

/**
 * `entry`'s place among `factories`, as the api lists them (`CardPlace`); `fileFactory` is the line that files a factory (`YourStore`).
 * @param entry The card: its `factory:` and its `workflow:`.
 * @param factories The factories the api lists.
 * @param fileFactory The command that files a factory, said in the refusal of a factory the store does not have.
 */
export function cardPlace(entry: Pick<InboxEntry, 'factory' | 'workflow'>, factories: readonly Factory[], fileFactory: string) {
  if (unassigned(entry)) return null;
  const factory = factories.find((f) => f.name === entry.factory);
  if (!factory) {
    return {
      why: `The card names the factory ${entry.factory}, which the store does not have: file it by that name with ${fileFactory}, or change the card's factory: line.`,
    };
  }
  if (factory.error !== null) return { why: `The card names the factory ${factory.name}, whose file does not read: ${factory.error}` };
  const workflow = offeredName(entry.workflow, factory);
  return { factory, workflow, on: workflow === null ? null : startRepo(factory, workflow) };
}

/**
 * Where a card that names no factory starts once a person picks `picked` among `factories`: null until one is picked (`''`); then the
 * picked factory's place, as a card naming it has (`cardPlace`). A card's `repo:` is retired, and plays no part.
 * @param entry The card: its `workflow:`.
 * @param picked The factory's name a person picked, `''` while none is.
 * @param factories The factories the api lists.
 * @param fileFactory The command that files a factory (`cardPlace`).
 */
export function startPlace(entry: Pick<InboxEntry, 'workflow'>, picked: string, factories: readonly Factory[], fileFactory: string) {
  if (picked === '') return null;
  return cardPlace({ factory: picked, workflow: entry.workflow }, factories, fileFactory);
}

/**
 * A place in a queue as a person says it: `1st`, `2nd`, `3rd`, `4th`, `11th`, `21st`.
 * @param n The place, counted from 1.
 */
export function ordinal(n: number) {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th');
  return `${n}${suffix}`;
}

/**
 * What a queued card says of its place and, where triggers queue it, of them: `queued · 2nd`, `queued by ready · 1st` — or `queued` alone
 * for one a record says was started, which has no place.
 * @param queued The card's queue record, with its place where it has one.
 */
export const queuedWord = (queued: NonNullable<InboxEntry['queued']>) => {
  const word = queued.by?.length ? `queued by ${queued.by.join(', ')}` : 'queued';
  return queued.place ? `${word} · ${ordinal(queued.place)}` : word;
};

/**
 * The line of a card's waits on the cards of its `after:` not landed: each card, the card its work stands at where it is another, and that
 * card's state, or that the store has no such card, or the cycle; and, where only a person can release one, `Needs you:` with the fix.
 * @param name The waiting card, by name, which the fix names.
 * @param waits The cards it waits on that have not landed.
 */
export const waitWords = (name: string, waits: readonly CardWait[]) => {
  const one = (w: CardWait) => {
    const at = w.at === undefined ? '' : `, at ${w.at}`;
    if (w.kind === 'missing') return `${w.card}${at} (no such card)`;
    if (w.kind === 'cycle') return `${w.card} (a cycle: ${(w.cycle ?? []).join(' → ')})`;
    return `${w.card}${at} (${w.state ?? 'not read'})`;
  };
  const stalled = waits.filter((w) => w.stalled);
  const said = `Waiting on ${waits.map(one).join('; ')}.`;
  return stalled.length ? `Needs you: ${said} Send the work on, change ${name}'s after:, or start it by hand.` : said;
};

/**
 * The line of a card the triggers of its factory would send to two workflows: which clash, and what to change.
 * @param clash The names of the triggers that select it.
 */
export const clashWords = (clash: readonly string[]) =>
  `Waiting: triggers ${clash.join(', ')} clash. Change a selector, or the card's labels.`;

/**
 * The queue, as the tick starts it: every card with a place, in its order (the package's `queueOrder`, whose places the listing carries) —
 * a card whose start was refused among them, where it keeps its place; a card a record says was started, which has none, not.
 * @param entries The inbox's entries.
 */
export const queueOf = (entries: readonly InboxEntry[]) =>
  entries.filter((e) => e.queued?.place).sort((a, b) => a.queued!.place! - b.queued!.place!);

/**
 * Whether a card could be queued were its factory not asked: it is `filed` — neither queued nor started — names a workflow, and reads.
 */
const queueableButFactory = (entry: InboxEntry) => entry.state === 'filed' && entry.workflow !== null && entry.error === null;

/**
 * Whether the page offers Queue on a card: it names a factory (`unassigned`) and a workflow — a queued card starts on its own, in the
 * factory and on the workflow it names — it reads, it is not queued, and no record says it was started. What the api would refuse
 * otherwise, in the package's words.
 * @param entry The inbox's entry.
 */
export const queueable = (entry: InboxEntry) => !unassigned(entry) && queueableButFactory(entry);

/**
 * Whether a card has no Queue for its factory alone: it names none (`unassigned`), and would be `queueable` with one.
 * @param entry The inbox's entry.
 */
export const queueNeedsFactory = (entry: InboxEntry) => unassigned(entry) && queueableButFactory(entry);

/**
 * Whether a card shows the tick's last try of its start (`triedLine`): it is `queued` or `refused` and carries the try — never a started
 * card, whatever try it still carries.
 * @param entry The inbox's entry.
 */
export const triedShown = (entry: InboxEntry): entry is InboxEntry & { tried: NonNullable<InboxEntry['tried']> } =>
  (entry.state === 'queued' || entry.state === 'refused') && entry.tried !== undefined;

/**
 * The workflows a list of options leaves out: those that do not read, each with why (`error`).
 * @param workflows The workflows listed, each with its error, null where it reads.
 */
export const unreadWorkflows = <T extends Pick<WorkflowListing, 'error'>>(workflows: readonly T[]) =>
  workflows.filter((w): w is T & { error: string } => w.error !== null);

/**
 * The repository the run of `entry` starts on in its factory, among `factories` that read and are not the default (`startRepo`, on the
 * card's workflow by its name), or why the factory gives it none: the factory's only one for a card that names no workflow by name;
 * null for a card of no factory or the default (which the daemon places), one whose factory is not listed or does not read, a card that
 * names no workflow in a factory of several, and while the factories are unread. Never the card's `repo:`, which is retired.
 * @param entry The card: its `factory:` and its `workflow:`.
 * @param factories The factories the api lists, or undefined while they are unread.
 */
export function cardRepo(entry: Pick<InboxEntry, 'factory' | 'workflow'>, factories: readonly Factory[] | undefined) {
  if (unassigned(entry)) return null satisfies StartRepo | null as StartRepo | null;
  const factory = factories?.find((f) => f.name === entry.factory && !f.default && f.error === null);
  if (!factory) return null satisfies StartRepo | null as StartRepo | null;
  if (entry.workflow !== null && isName(entry.workflow))
    return startRepo(factory, entry.workflow) satisfies StartRepo | null as StartRepo | null;
  const [only, ...more] = factory.worksOn;
  return (only !== undefined && !more.length ? { repo: only } : null) satisfies StartRepo | null as StartRepo | null;
}

/**
 * The repository a card's factory places its run on (`cardRepo`), as the tick's last try says it: null where it gives none. The Card does
 * not carry it, so the page reads it off the factories it lists (`entryOf`).
 * @param entry The card: its `factory:` and its `workflow:`.
 * @param factories The factories the api lists, or undefined while they are unread.
 */
export function factoryRepoOf(entry: Pick<InboxEntry, 'factory' | 'workflow'>, factories: readonly Factory[] | undefined) {
  const on = cardRepo(entry, factories);
  return (on !== null && 'repo' in on ? on.repo : null) satisfies string | null;
}

/**
 * What the tick's last try of a queued card's start says, as the CLI's `inbox` says it beside the card: refused, it waits for a person, not
 * for a slot; failed otherwise, the tick tries it again. The repository it was tried on is said for a card that names its factory —
 * never for a card that names no factory, refused wherever a daemon runs — and said as the one its factory places it on where it is
 * (`factoryRepo`). `why` is left out where the card's own refusal already says it. `at` is the try's time as the page shows one.
 * @param entry The card, with the tick's last try of its start, its factory, its error and its factory's repository.
 * @param at The try's time, in the words the page shows a time in.
 */
export function triedLine(
  entry: Pick<InboxEntry, 'factory' | 'error' | 'factoryRepo'> & { tried: NonNullable<InboxEntry['tried']> },
  at: string,
) {
  const { tried } = entry;
  const said = entry.factory !== null && entry.error === null;
  const on = said ? ` on ${tried.repo}${tried.repo === entry.factoryRepo ? ", its factory's repository for its workflow" : ''}` : '';
  const why = tried.why !== entry.error ? `: ${tried.why.trim()}${/[.!?]$/.test(tried.why.trim()) ? '' : '.'}` : '.';
  return tried.refused
    ? `Not started at ${at}${on}${why} It stays queued, and the tick does not try it again while it reads the same: edit the card, or take it off the queue and queue it again.`
    : `Failed at ${at}${on}${why} Not a refusal: the tick tries it again on every pass, where it keeps its place.`;
}

/**
 * A factory's floor's line on the cap: `2 of 4 run slots taken on this machine · 3 queued`, or `no cap on this machine · 3 queued` — the
 * queue, the factory's own, left out when it is empty. The cap and its count are the machine's (`Ceilings.inFlight`), not the factory's,
 * and it says so; the count is the cap's, not the floor's, and said in the package's word for what the cap holds, a run slot (`slotWord`):
 * beside the floor's `4 in flight`, which counts a run waiting on runs too, `3 of 4 runs in flight` would read as a full floor with a slot
 * free.
 * @param ceilings The machine's cap on runs in flight and the runs it holds; a cap of 0 is no cap.
 * @param queued How many of the factory's cards are queued.
 */
export function capLine(ceilings: Pick<Ceilings, 'cap' | 'inFlight'>, queued: number) {
  const cap =
    ceilings.cap > 0 && ceilings.inFlight
      ? `${ceilings.inFlight.length} of ${ceilings.cap} run slots taken on this machine`
      : 'no cap on this machine';
  return queued > 0 ? `${cap} · ${queued} queued` : cap;
}

/**
 * The cards of the factory `picked` names that are not yet started, as the rail's Inbox badge counts them: each card that reads and whose
 * kind is `unstarted` (`CARD_KIND`: filed, queued or refused), never one whose run is in flight or ended; every factory's while `picked`
 * names none (`shownIn`), as the Inbox page lists them then.
 * @param entries The inbox's entries.
 * @param picked The factory picked, or undefined for every factory.
 */
export const notStarted = (entries: readonly InboxEntry[], picked: string | undefined) =>
  shownIn(
    entries.filter((entry) => entry.error === null && CARD_KIND[entry.state] === 'unstarted'),
    picked,
  );

/**
 * What the Inbox badge's `count` is, said whole for its hover and a screen reader: in the factory `picked`, or in every factory.
 * @param count How many cards are not yet started.
 * @param picked The factory picked, or undefined for every factory.
 */
export const inboxBadgeTitle = (count: number, picked: string | undefined) =>
  `${count} ${count === 1 ? 'card' : 'cards'} not yet started, ${picked === undefined ? 'in every factory' : `in ${picked}`}`;

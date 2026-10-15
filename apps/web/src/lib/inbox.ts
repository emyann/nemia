import type { Ceilings, Factory, InboxEntry, WorkflowListing } from './api';
import { DEFAULT_NAME, shownIn, startRepo } from './factories.ts';

/**
 * The inbox as the page lists it: the newest card first, by when its file was written (`filedAt`) — a card carries no time of its own —
 * then by name, so two filed in the same millisecond keep one order. An entry whose time is not known goes last.
 */
export const newestCardsFirst = (entries: readonly InboxEntry[]): InboxEntry[] =>
  [...entries].sort((a, b) => (b.filedAt ?? '').localeCompare(a.filedAt ?? '') || a.name.localeCompare(b.name));

/** Whether an entry of the inbox is a card's file, `<name>.md`, and not a stray file the listing shows with why it is not a card. */
const isCard = (entry: Pick<InboxEntry, 'file'>): boolean => entry.file.endsWith('.md');

/**
 * Whether an entry of the inbox has a page, `/inbox/<name>`, among the entries listed with it: whether its name is one the api takes (the
 * package's `inboxNameRefusal`). Every card's is, and a stray file's where nothing else answers to its name, but a folder's, which the
 * listing names `sub/`, and a file's with a backslash in it: the api would refuse the name the page asks for, and a link would open a
 * refusal of what the Inbox page has just listed.
 *
 * And not a stray file's where a card of that name is listed beside it: `/inbox/notes` is `notes.md`, which the api's card page reads
 * before a stray `notes`, so the stray's link would open the card's page — another file's — under its own name.
 */
export const hasPage = (entry: Pick<InboxEntry, 'name' | 'file'>, entries: readonly Pick<InboxEntry, 'name' | 'file'>[]): boolean =>
  entry.name.trim() !== '' &&
  !/[\\/\0]/.test(entry.name) &&
  !entry.name.startsWith('.') &&
  (isCard(entry) || !entries.some((other) => other.name === entry.name && isCard(other)));

/**
 * A start, a drop, a queue or its taking back, or a `from:` set, the api refused: the card as the page listed it, what was asked, and the
 * api's words.
 */
export type CardRefusal = { entry: InboxEntry; action: 'start' | 'remove' | 'queue' | 'unqueue' | 'from'; message: string };

/**
 * A line of the inbox page: a card, with the refusal it was last given, or one the inbox no longer lists (`gone`), kept for its refusal.
 */
export type CardLine = { entry: InboxEntry; refusal: CardRefusal | null; gone: boolean };

/**
 * The inbox page's lines, newest first (`newestCardsFirst`): each card listed, with its refusal; and each card refused that the inbox, read
 * again after the refusal, no longer lists — dropped or started behind the page's back — in the place it was listed, so the refusal's
 * sentence stays where the person asked. A refusal of a card still listed is on that card, and on no line of its own.
 *
 * By the file, not the name: two entries may answer to one name — a card and a stray file beside it, `notes.md` and `notes` (`hasPage`) —
 * and a refusal is of the one the page asked about. Matched by name, a refused Remove of the card would draw its sentence under the stray
 * file too, which has no Remove to be refused.
 */
export function cardLines(entries: readonly InboxEntry[], refusals: readonly CardRefusal[]): CardLine[] {
  const listed = new Set(entries.map((entry) => entry.file));
  const gone = refusals.filter((r) => !listed.has(r.entry.file));
  return newestCardsFirst([...entries, ...gone.map((r) => r.entry)]).map((entry) => {
    const refusal = refusals.find((r) => r.entry.file === entry.file) ?? null;
    return { entry, refusal, gone: !listed.has(entry.file) };
  });
}

/** A workflow as a pick is keyed: its source and its name, since the repository and yours may each have one of a name. */
export const workflowKey = (workflow: Pick<WorkflowListing, 'from' | 'name'>): string => `${workflow.from}:${workflow.name}`;

const trimmed = (dir: string): string => dir.replace(/[\\/]+$/, '');

/**
 * A card's `workflow:` that is a bare name — no slash, not `.` or `..` — which a start looks for under the card's repository's
 * `workflows/`.
 */
const isName = (workflow: string): boolean => !/[\\/]/.test(workflow) && workflow !== '.' && workflow !== '..';

/**
 * Whether a card's workflow is a name in a repository other than `here`, the api's: the card's `repo:` names another, and a start looks for
 * the name there (`workflowFolder`). The board lists the workflows of `here` alone, so one of the same name among them is another workflow.
 */
export const namedElsewhere = (workflow: string | null, repo: string | null, here: string): boolean =>
  Boolean(workflow && repo && isName(workflow) && trimmed(repo) !== trimmed(here));

/**
 * The workflow a card's start form is preset to, from what the card writes (`workflow:`), among the workflows here that read — or null, for
 * a card that names none, or one that is not among them.
 *
 * As a start from the command line finds it (`workflowFolder`): an absolute path is that folder, whichever source has it; a name is the
 * repository's workflow of that name, never yours, since a name on a card is looked for under the repository's `workflows/`. `repo` is the
 * card's `repo:` and `here` the api's repository, whose workflows are listed: a name on a card about another repository is that
 * repository's workflow (`namedElsewhere`), which is not listed, so it presets nothing — a workflow of the same name here would run another
 * workflow than the card names. A relative path is read from the inbox, a folder the board does not list, and is no workflow's name, so it
 * presets nothing.
 */
export function presetOf(
  workflow: string | null,
  repo: string | null,
  here: string,
  workflows: readonly WorkflowListing[],
): WorkflowListing | null {
  if (!workflow || namedElsewhere(workflow, repo, here)) return null;
  const readable = workflows.filter((w) => w.error === null);
  if (/^(?:[\\/]|[A-Za-z]:[\\/])/.test(workflow)) return readable.find((w) => trimmed(w.dir) === trimmed(workflow)) ?? null;
  return readable.find((w) => w.from === 'repo' && w.name === workflow) ?? null;
}

/** Whether a card names no factory: it has no `factory:` line, or writes `default`, which is no factory to start in. */
export const unassigned = (entry: Pick<InboxEntry, 'factory'>): boolean => entry.factory === null || entry.factory === DEFAULT_NAME;

/** The factories a card can be filed or started in, in the api's order: each named one whose file reads, never the default factory. */
export const factoriesOffered = <T extends Pick<Factory, 'default' | 'error'>>(factories: readonly T[]): T[] =>
  factories.filter((f) => !f.default && f.error === null);

/**
 * The factory the box that files a card starts on: `shown`, the one the address names, when it is among `offered`; else `''`, no
 * factory.
 */
export const factoryPreset = (shown: string | undefined, offered: readonly Pick<Factory, 'name'>[]): string =>
  shown !== undefined && offered.some((f) => f.name === shown) ? shown : '';

/**
 * What the box that files a card holds when File is pressed: the idea; the factory now picked, null for none; `repo`, what its list of
 * repositories was last set to, `''` for none; and the workflow picked among those listed now, null for none.
 */
export type FilingChoice = {
  idea: string;
  factory: Pick<Factory, 'name' | 'repos'> | null;
  repo: string;
  workflow: Pick<WorkflowListing, 'name' | 'from' | 'folderTeam'> | null;
};

/** A card as `fileCard` sends it. */
export type CardFiling = { body: string; factory?: string; workflow?: string; from?: WorkflowListing['from']; repo?: string };

/**
 * What the box sends for `choice`, by what is offered now and never by what a list held before. With no factory, the idea alone: its
 * workflow and repository come with the factory its start picks. In a factory, its name, and the workflow picked; and a repository only
 * where a person chose one: the factory has several, the one picked is among them, and the workflow is no folder team, which looks at
 * none. A factory's only repository is the factory's to give, and is never sent.
 */
export function cardFiling({ idea, factory, repo, workflow }: FilingChoice): CardFiling {
  if (factory === null) return { body: idea };
  const chosen = factory.repos.length > 1 && factory.repos.includes(repo) && !workflow?.folderTeam;
  return {
    body: idea,
    factory: factory.name,
    ...(workflow ? { workflow: workflow.name, from: workflow.from } : {}),
    ...(chosen ? { repo } : {}),
  };
}

/**
 * Where a card in a factory starts: the factory, its repositories, and the one it starts on (`startRepo`) — null while a person has it to
 * pick. Null for a card that names no factory (`unassigned`), which starts once a person picks one (`startPlace`). For a factory the store
 * does not list, or whose file does not read, why the card cannot start in it.
 */
export type CardPlace = { factory: string; repos: string[]; repo: string | null } | { why: string };

/** `entry`'s place among `factories`, as the api lists them (`CardPlace`); `fileFactory` is the line that files a factory (`YourStore`). */
export function cardPlace(
  entry: Pick<InboxEntry, 'factory' | 'repo'>,
  factories: readonly Factory[],
  fileFactory: string,
): CardPlace | null {
  if (unassigned(entry)) return null;
  const factory = factories.find((f) => f.name === entry.factory);
  if (!factory) {
    return {
      why: `The card names the factory ${entry.factory}, which the store does not have: file it by that name with ${fileFactory}, or change the card's factory: line.`,
    };
  }
  if (factory.error !== null) return { why: `The card names the factory ${factory.name}, whose file does not read: ${factory.error}` };
  return { factory: factory.name, repos: factory.repos, repo: startRepo(factory, entry.repo) };
}

/**
 * Where a card that names no factory starts once a person picks `picked` among `factories`: null until one is picked (`''`); then the
 * picked factory's place, as a card naming it has (`cardPlace`) — or, for a card whose `repo:` is none of that factory's repositories,
 * why it cannot start there, naming both and the two ways out.
 */
export function startPlace(
  entry: Pick<InboxEntry, 'repo'>,
  picked: string,
  factories: readonly Factory[],
  fileFactory: string,
): CardPlace | null {
  if (picked === '') return null;
  const place = cardPlace({ factory: picked, repo: entry.repo }, factories, fileFactory);
  if (place === null || 'why' in place || entry.repo === null) return place;
  if (place.repos.some((repo) => trimmed(repo) === trimmed(entry.repo!))) return place;
  return {
    why: `The card is about ${entry.repo}, and the factory ${picked} works on ${place.repos.join(', ') || 'no repository'}: pick a factory that works on it, or change the card's repo: line.`,
  };
}

/**
 * What a card's `repo:` is worth on a team whose every step works in a folder: nothing. The package starts the card all the same —
 * refusing it would strand a card filed before the team worked in folders — and says the repository was not looked at: the CLI's `start`
 * prints it, a tick's line carries it, and the api answers it on the start (`ignoredRepo`).
 *
 * The board says it before the start instead, on the form where a person picks the workflow: a start the api takes opens the run's
 * page, so a sentence in its answer is shown to nobody. `repo` is the card's, and a card that names none has nothing to say.
 */
export const ignoredRepoNote = (workflow: Pick<WorkflowListing, 'folderTeam'>, repo: string | undefined | null): string | null =>
  workflow.folderTeam && repo
    ? `The card's repo: ${repo} is not looked at — this workflow's steps work in folders, with no git repository.`
    : null;

/**
 * The runs a start waits on, as it is sent: none on a team whose every step works in a folder. The CLI's `start` refuses `--after` for such
 * a team — a folder run has no branch, so there is nothing for another run to wait for — and the form hides the picker for one.
 *
 * Hiding a control does not forget what was chosen in it: the picker is on the card's form under the workflow it picks, and a person who
 * picked runs under a git workflow and then picked a folder team would have sent them still, to be shown a refusal about a control no
 * longer on the page. What is not offered is not sent.
 */
export const afterFor = (workflow: Pick<WorkflowListing, 'folderTeam'>, after: readonly string[]): string[] =>
  workflow.folderTeam ? [] : [...after];

/** A place in a queue as a person says it: `1st`, `2nd`, `3rd`, `4th`, `11th`, `21st`. */
export function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th');
  return `${n}${suffix}`;
}

/** What a queued card says of its place: `queued · 2nd` — or `queued` alone for one a record says was started, which has no place. */
export const queuedWord = (queued: NonNullable<InboxEntry['queued']>): string =>
  queued.place ? `queued · ${ordinal(queued.place)}` : 'queued';

/**
 * The queue, as the tick starts it: every card with a place, in its order (the package's `queueOrder`, whose places the listing carries) —
 * a card whose start was refused among them, where it keeps its place; a card a record says was started, which has none, not.
 */
export const queueOf = (entries: readonly InboxEntry[]): InboxEntry[] =>
  entries.filter((e) => e.queued?.place).sort((a, b) => a.queued!.place! - b.queued!.place!);

/**
 * Whether a card could be queued were its factory not asked: it names a workflow, it reads, it is not queued, and no record says it was
 * started.
 */
const queueableButFactory = (entry: InboxEntry): boolean =>
  entry.workflow !== null && entry.error === null && !entry.queued && entry.startedAs.length === 0;

/**
 * Whether the page offers Queue on a card: it names a factory (`unassigned`) and a workflow — a queued card starts on its own, in the
 * factory and on the workflow it names — it reads, it is not queued, and no record says it was started. What the api would refuse
 * otherwise, in the package's words.
 */
export const queueable = (entry: InboxEntry): boolean => !unassigned(entry) && queueableButFactory(entry);

/** Whether a card has no Queue for its factory alone: it names none (`unassigned`), and would be `queueable` with one. */
export const queueNeedsFactory = (entry: InboxEntry): boolean => unassigned(entry) && queueableButFactory(entry);

/** The workflows a list of options leaves out: those that do not read, each with why (`error`). */
export const unreadWorkflows = <T extends Pick<WorkflowListing, 'error'>>(workflows: readonly T[]): Array<T & { error: string }> =>
  workflows.filter((w): w is T & { error: string } => w.error !== null);

/**
 * What the tick's last try of a queued card's start says, as the CLI's `inbox` says it beside the card: refused, it waits for a person, not
 * for a slot; failed otherwise, the tick tries it again. The repository it was tried on is said for a card that names none but names its
 * factory — never for a card that names no factory, refused wherever a daemon runs: the one its factory picks said as such
 * (`factoryRepo`), and running the daemon elsewhere offered only when its factory picks none, where the try was on the daemon's own. `why`
 * is left out where the card's own refusal already says it. `at` is the try's time as the page shows one.
 */
export function triedLine(
  entry: Pick<InboxEntry, 'repo' | 'factory' | 'error' | 'factoryRepo'> & { tried: NonNullable<InboxEntry['tried']> },
  at: string,
): string {
  const { tried } = entry;
  const said = entry.repo === null && entry.factory !== null && entry.error === null;
  const on = said ? ` on ${tried.repo}${tried.repo === entry.factoryRepo ? ", its factory's one repository" : ''}` : '';
  const elsewhere = said && entry.factoryRepo === null ? ', or run the daemon in the repository it is about' : '';
  const why = tried.why !== entry.error ? `: ${tried.why.trim()}${/[.!?]$/.test(tried.why.trim()) ? '' : '.'}` : '.';
  return tried.refused
    ? `Not started at ${at}${on}${why} It stays queued, and the tick does not try it again while it reads the same: edit the card, or take it off the queue and queue it again${elsewhere}.`
    : `Failed at ${at}${on}${why} Not a refusal: the tick tries it again on every pass, where it keeps its place.`;
}

/**
 * A factory's floor's line on the cap: `2 of 4 run slots taken on this machine · 3 queued`, or `no cap on this machine · 3 queued` — the
 * queue, the factory's own, left out when it is empty. The cap and its count are the machine's (`Ceilings.inFlight`), not the factory's,
 * and it says so; the count is the cap's, not the floor's, and said in the package's word for what the cap holds, a run slot (`slotWord`):
 * beside the floor's `4 in flight`, which counts a run waiting on runs too, `3 of 4 runs in flight` would read as a full floor with a slot
 * free.
 */
export function capLine(ceilings: Pick<Ceilings, 'cap' | 'inFlight'>, queued: number): string {
  const cap =
    ceilings.cap > 0 && ceilings.inFlight
      ? `${ceilings.inFlight.length} of ${ceilings.cap} run slots taken on this machine`
      : 'no cap on this machine';
  return queued > 0 ? `${cap} · ${queued} queued` : cap;
}

/**
 * The cards of the factory `picked` names that are not yet started, as the rail's Inbox badge counts them: each card that reads and no
 * record says was started, queued or not; every factory's while `picked` names none (`shownIn`), as the Inbox page lists them then.
 */
export const notStarted = (entries: readonly InboxEntry[], picked: string | undefined): InboxEntry[] =>
  shownIn(
    entries.filter((entry) => entry.error === null && entry.startedAs.length === 0),
    picked,
  );

/** What the Inbox badge's `count` is, said whole for its hover and a screen reader: in the factory `picked`, or in every factory. */
export const inboxBadgeTitle = (count: number, picked: string | undefined): string =>
  `${count} ${count === 1 ? 'card' : 'cards'} not yet started, ${picked === undefined ? 'in every factory' : `in ${picked}`}`;

import type { Ceilings, InboxEntry, WorkflowListing } from './api';

/**
 * The inbox as the page lists it: the newest card first, by when its file was written (`filedAt`) — a card carries no time of its own — then by
 * name, so two filed in the same millisecond keep one order. An entry whose time is not known goes last.
 */
export const newestCardsFirst = (entries: readonly InboxEntry[]): InboxEntry[] =>
  [...entries].sort((a, b) => (b.filedAt ?? '').localeCompare(a.filedAt ?? '') || a.name.localeCompare(b.name));

/** Whether an entry of the inbox is a card's file, `<name>.md`, and not a stray file the listing shows with why it is not a card. */
const isCard = (entry: Pick<InboxEntry, 'file'>): boolean => entry.file.endsWith('.md');

/**
 * Whether an entry of the inbox has a page, `/inbox/<name>`, among the entries listed with it: whether its name is one the api takes (the
 * package's `inboxNameRefusal`). Every card's is, and a stray file's where nothing else answers to its name, but a folder's, which the listing
 * names `sub/`, and a file's with a backslash in it: the api would refuse the name the page asks for, and a link would open a refusal of what
 * the Inbox page has just listed.
 *
 * And not a stray file's where a card of that name is listed beside it: `/inbox/notes` is `notes.md`, which the api's card page reads before a
 * stray `notes`, so the stray's link would open the card's page — another file's — under its own name.
 */
export const hasPage = (entry: Pick<InboxEntry, 'name' | 'file'>, entries: readonly Pick<InboxEntry, 'name' | 'file'>[]): boolean =>
  entry.name.trim() !== '' &&
  !/[\\/\0]/.test(entry.name) &&
  !entry.name.startsWith('.') &&
  (isCard(entry) || !entries.some((other) => other.name === entry.name && isCard(other)));

/** A start, a drop, a queue or its taking back the api refused: the card as the page listed it, what was asked, and the api's words. */
export type CardRefusal = { entry: InboxEntry; action: 'start' | 'remove' | 'queue' | 'unqueue'; message: string };

/** A line of the inbox page: a card, with the refusal it was last given, or one the inbox no longer lists (`gone`), kept for its refusal. */
export type CardLine = { entry: InboxEntry; refusal: CardRefusal | null; gone: boolean };

/**
 * The inbox page's lines, newest first (`newestCardsFirst`): each card listed, with its refusal; and each card refused that the inbox, read again
 * after the refusal, no longer lists — dropped or started behind the page's back — in the place it was listed, so the refusal's sentence stays
 * where the person asked. A refusal of a card still listed is on that card, and on no line of its own.
 *
 * By the file, not the name: two entries may answer to one name — a card and a stray file beside it, `notes.md` and `notes` (`hasPage`) — and
 * a refusal is of the one the page asked about. Matched by name, a refused Remove of the card would draw its sentence under the stray file
 * too, which has no Remove to be refused.
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

/** A card's `workflow:` that is a bare name — no slash, not `.` or `..` — which a start looks for under the card's repository's `workflows/`. */
const isName = (workflow: string): boolean => !/[\\/]/.test(workflow) && workflow !== '.' && workflow !== '..';

/**
 * Whether a card's workflow is a name in a repository other than `here`, the api's: the card's `repo:` names another, and a start looks for the
 * name there (`workflowFolder`). The board lists the workflows of `here` alone, so one of the same name among them is another workflow.
 */
export const namedElsewhere = (workflow: string | null, repo: string | null, here: string): boolean =>
  Boolean(workflow && repo && isName(workflow) && trimmed(repo) !== trimmed(here));

/**
 * The workflow a card's start form is preset to, from what the card writes (`workflow:`), among the workflows here that read — or null, for a
 * card that names none, or one that is not among them.
 *
 * As a start from the command line finds it (`workflowFolder`): an absolute path is that folder, whichever source has it; a name is the
 * repository's workflow of that name, never yours, since a name on a card is looked for under the repository's `workflows/`. `repo` is the
 * card's `repo:` and `here` the api's repository, whose workflows are listed: a name on a card about another repository is that repository's
 * workflow (`namedElsewhere`), which is not listed, so it presets nothing — a workflow of the same name here would run another workflow than the
 * card names. A relative path is read from the inbox, a folder the board does not list, and is no workflow's name, so it presets nothing.
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

/**
 * What a card's `repo:` is worth on a team whose every step works in a folder: nothing. The package starts the card all the same —
 * refusing it would strand a card filed before the team worked in folders — and says the repository was not looked at: `wf start`
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
 * The runs a start waits on, as it is sent: none on a team whose every step works in a folder. `wf start` refuses `--after` for such a
 * team — a folder run has no branch, so there is nothing for another run to wait for — and the form hides the picker for one.
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
 * The queue, as the tick starts it: every card with a place, in its order (the package's `queueOrder`, whose places the listing carries) — a card
 * whose start was refused among them, where it keeps its place; a card a record says was started, which has none, not.
 */
export const queueOf = (entries: readonly InboxEntry[]): InboxEntry[] =>
  entries.filter((e) => e.queued?.place).sort((a, b) => a.queued!.place! - b.queued!.place!);

/**
 * Whether the page offers Queue on a card: it names a workflow — a queued card starts on its own, on the workflow it names — it reads, it is not
 * queued, and no record says it was started. What the api would refuse otherwise, in the package's words.
 */
export const queueable = (entry: InboxEntry): boolean =>
  entry.workflow !== null && entry.error === null && !entry.queued && entry.startedAs.length === 0;

/**
 * What the tick's last try of a queued card's start says, as `wf inbox` says it beside the card: refused, it waits for a person, not for a slot;
 * failed otherwise, the tick tries it again. The repository it was tried on is said for a card that names none, whose start turns on where the
 * daemon runs; and `why` is left out where the card's own refusal already says it. `at` is the try's time as the page shows one.
 */
export function triedLine(entry: Pick<InboxEntry, 'repo' | 'error'> & { tried: NonNullable<InboxEntry['tried']> }, at: string): string {
  const { tried } = entry;
  const on = entry.repo === null && entry.error === null ? ` on ${tried.repo}` : '';
  const why = tried.why !== entry.error ? `: ${tried.why.trim()}${/[.!?]$/.test(tried.why.trim()) ? '' : '.'}` : '.';
  return tried.refused
    ? `Not started at ${at}${on}${why} It stays queued, and the tick does not try it again while it reads the same: edit the card, or take it off the queue and queue it again${on ? ', or run wf up in the repository it is about' : ''}.`
    : `Failed at ${at}${on}${why} Not a refusal: the tick tries it again on every pass, where it keeps its place.`;
}

/**
 * The Factory's line on the cap: `2 of 4 run slots taken · 3 queued`, or `no cap · 3 queued` — the queue left out when it is empty. The count is the
 * cap's (`Ceilings.inFlight`), not the floor's, and said in the package's word for what the cap holds, a run slot (`slotWord`): beside the floor's
 * `4 in flight`, which counts a run waiting on runs too, `3 of 4 runs in flight` would read as a full floor with a slot free.
 */
export function capLine(ceilings: Pick<Ceilings, 'cap' | 'inFlight'>, queued: number): string {
  const cap = ceilings.cap > 0 && ceilings.inFlight ? `${ceilings.inFlight.length} of ${ceilings.cap} run slots taken` : 'no cap';
  return queued > 0 ? `${cap} · ${queued} queued` : cap;
}

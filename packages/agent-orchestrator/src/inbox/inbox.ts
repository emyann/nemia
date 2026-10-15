/**
 * An inbox is cards before they are started: `$WF_ROOT/inbox/`, beside `runs/`, one card per file — an idea parked where the work is
 * looked at, until a person starts it.
 *
 *     ---
 *     workflow: dev
 *     repo: /home/me/code/app
 *     queued: 2026-09-16T10:00:00.000Z
 *     ---
 *     Cache the engine's views between passes.
 *
 * A card in a plan's format (plan.ts), with two differences. `workflow:` is optional: an idea often does not know what will run it, and
 * that is chosen at start. `repo:` is a key of its own, optional too: the absolute path of the repository the idea is about. And an inbox
 * card has no `after:`: what it waits on is said at start, when the runs it could wait on are known.
 *
 * `queued:` marks a card to start on its own (`nemia inbox queue`): the time it was queued, which orders the queue. The tick starts the
 * oldest such card when a run slot is free (`queueOrder`, `startQueued` in inbox.verb.ts).
 *
 * `gate:` names a step of the card's workflow whose closeout waits for a person — `nemia approve` — before anything after it is filed, for
 * the run the card starts and no other: a plan read before anyone implements it. Whether the workflow has that step is the start's to say.
 *
 * `factory:` names the factory that processes the card: its run is started in it, on its repository when it has one. A card is started
 * only in a factory named for it, here or at start, never one inferred from its folder or its `repo:` (`unfactoredCardRefusal`). Whether
 * the factory is there, offers the workflow and works on the repository is the start's to say.
 *
 * **The keys are a closed list**, as a plan card's are: a key nothing reads is a constraint nobody enforces.
 *
 * Nothing about a run changes. A card started is a run like any other, whose record carries `from: { inbox: <name> }`, and the card is
 * removed; a card still there whose name a record carries is one whose removal failed, and `nemia inbox` says it was started, composed on
 * read.
 *
 * Pure: handed a card's text, the folder's entries and the run records, and whether a path is a directory, never reading one
 * (inbox.store.ts and inbox.verb.ts read them).
 */
import path from 'node:path';
import { bodyOf, frontmatterKeys, type PlanFile } from '../plan/plan.ts';
import { factoryNameRefusal, type Factory } from '../factory/factory.ts';
import type { Run } from '../record/record.ts';
import { isReadme, splitFrontmatter, WorkflowError } from '../step/step.ts';

export type InboxCard = {
  /** Its file's name in the inbox, minus `.md`: what `nemia inbox rm` and a start name it by. */
  name: string;
  /** Its file's name, as a refusal names it. */
  file: string;
  /**
   * The workflow to start it on, as written — a name under the repository's `workflows/`, or a path to a workflow folder — when it says.
   */
  workflow?: string;
  /** The absolute path of the repository the idea is about, when it says. */
  repo?: string;
  /** When it was queued to start on its own (`nemia inbox queue`), as an ISO time: what orders the queue. Absent on a card not queued. */
  queued?: string;
  /** The step its run is gated at, as written: frozen on the run's `gates` at start, beside any `--gate`. Absent on a card with no gate. */
  gate?: string;
  /** The factory its run is started in, as written: absent on a card of the default factory. */
  factory?: string;
  /** The runs its run is handed as context (`from:`), by id, in the order written: absent on a card that names none. */
  from?: string[];
  /** Everything below the frontmatter: the idea, and its run's brief unless a brief given at start replaces it. */
  body: string;
};

/** Every key an inbox card may set, each optional. Anything else is refused by name — `after:` with where it is said instead. */
export const INBOX_KEYS = ['workflow', 'repo', 'queued', 'gate', 'factory', 'from'] as const;

/** A key an inbox card may set. */
type InboxKey = (typeof INBOX_KEYS)[number];

/**
 * An ISO time as `new Date().toISOString()` writes it, to the second or the millisecond, in UTC: what `queued:` takes, so the order is
 * stable.
 */
const isInstant = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) && !Number.isNaN(Date.parse(value));

/** What each of an inbox card's keys means, in one line, in `INBOX_KEYS`' order: what the board shows beside a card's value. */
export const INBOX_KEY_MEANINGS: Readonly<Record<InboxKey, string>> = {
  workflow:
    "what runs the card when it is started: a workflow's name under the repository's `workflows/`, or a path to a workflow folder; else the start names one",
  repo: 'the absolute path of the repository the idea is about: the repository the start is made in when unset',
  queued:
    'the time `nemia inbox queue` marked the card to start on its own: the tick starts it when a run slot frees, oldest first; unset, a person starts it',
  gate: 'a step of its workflow whose closeout waits for a person — `nemia approve` — before anything after it is filed, in the run it starts: none when unset',
  factory:
    'the factory that processes the card: its run is started in it, on its repository when it has only one; required to start, unless the start names one',
  from: 'runs whose conclusions its run is handed as context, by id, comma-separated: it does not wait on them; none when unset',
};

function refuse(why: string): never {
  throw new WorkflowError(why);
}

/**
 * One inbox card, from its file's text — or refused, naming the file and the fix: a key an inbox card does not have (`after:` among them),
 * a key set twice or to nothing, a `repo:` that is not an absolute path or names no directory (`isDirectory`), a `queued:` that is not an
 * ISO time or is on a card with no `workflow:` — nothing would say what starts it — a `gate:` that names more than one step or is a step's
 * `true`, a `factory:` that is not a factory's name (`factoryNameRefusal`), an empty body, and a frontmatter that never closes.
 */
export function parseInboxCard(file: string, text: string, isDirectory: (at: string) => boolean): InboxCard {
  const { block, body } = splitFrontmatter(file, text);
  const keys = block === null ? {} : inboxKeys(file, block);
  const { repo, workflow, queued, gate, factory, from } = keys;
  const name = file.slice(0, -'.md'.length);
  if (repo !== undefined && !path.isAbsolute(repo)) {
    refuse(
      `${file}: \`repo: ${repo}\` is not an absolute path. \`repo:\` is the repository the idea is about, from the root — \`repo: /home/me/code/app\` — since a relative one would name a different repository from wherever the card is started.`,
    );
  }
  if (repo !== undefined && !isDirectory(repo)) {
    refuse(
      `${file}: \`repo: ${repo}\` names no directory. Correct it to the repository the idea is about, or delete the line, and the card is started on the repository its start names.`,
    );
  }
  if (queued !== undefined && !isInstant(queued)) {
    refuse(
      `${file}: \`queued: ${queued}\` is not a time. \`queued:\` is when the card was queued to start on its own, as nemia inbox queue writes it — \`queued: 2026-09-16T10:00:00.000Z\` — which orders the queue. Delete the line, and queue the card with nemia inbox queue ${name}.`,
    );
  }
  if (queued !== undefined && workflow === undefined) {
    refuse(
      `${file}: \`queued:\` with no \`workflow:\` — a card that starts on its own has nothing to say what runs it. Write \`workflow:\`, or delete the \`queued:\` line and queue the card with its workflow: nemia inbox queue ${name} --workflow <w> writes both.`,
    );
  }
  if (gate !== undefined && gate.includes(',')) {
    refuse(
      `${file}: \`gate: ${gate}\` names more than one step. A card gates one step of its workflow — \`gate: plan\` — and its start gates any other: nemia start <inbox>/${file} --gate <step>.`,
    );
  }
  if (gate === 'true') {
    refuse(
      `${file}: \`gate: true\` is how a step's own file gates it, and a card names the step its run waits at — \`gate: plan\` — since a card is not a step. Name the step, or delete the line.`,
    );
  }
  if (factory !== undefined) refuseFactoryKey(file, factory);
  const { from: _, ...rest } = keys;
  return { name, file, ...rest, ...(from !== undefined ? { from: fromRuns(file, from) } : {}), body: bodyOf(file, body) };
}

/**
 * A card's `from:` as the runs it names, comma-separated, in the order written: refused, naming the file, where one is blank or named
 * twice. Whether each is a run is the start's to say (`contextRefusal`).
 */
function fromRuns(file: string, from: string): string[] {
  const runs = from.split(',').map((r) => r.trim());
  if (runs.some((r) => !r || /\s/.test(r)))
    refuse(
      `${file}: \`from: ${from}\` — \`from:\` names runs by id, comma-separated: \`from: add-a-cache-k2q9, b-3z4w\`. Correct the line.`,
    );
  const twice = runs.find((r, i) => runs.indexOf(r) !== i);
  if (twice !== undefined) refuse(`${file}: \`from: ${from}\` names ${twice} twice, and a run is handed another once. Name each run once.`);
  return runs;
}

/** A card's `from:` line's value, written as `parseInboxCard` reads it back. */
export const fromLine = (runs: readonly string[] | undefined): string | undefined => (runs?.length ? runs.join(', ') : undefined);

/** Refuses a card's `factory:` that is not a factory's name (`factoryNameRefusal`), naming the file and the fix. */
function refuseFactoryKey(file: string, factory: string): void {
  const refused = factoryNameRefusal(factory);
  if (refused) refuse(`${file}: \`factory: ${factory}\` — ${refused} Correct it to a factory nemia factory ls lists.`);
}

/**
 * Why the card in `file` cannot start: neither it nor its start names a factory, and a card is started only in the factory named for it —
 * never one inferred from a folder, which can be two factories'. Names the line to write, with the store's factories (`names`), the
 * start's own words for naming one (`fix`, `--factory <name>` say) when it has any, and how a new card names one as it is filed.
 */
export function unfactoredCardRefusal(file: string, names: readonly string[], fix?: string): string {
  const which = names.length ? `one of ${[...names].sort().join(', ')}` : 'once one is filed: nemia factory add <name> --repo <root>';
  const atStart = fix === undefined ? '' : `, or name it at start: ${fix}`;
  return `${file}: this card names no factory, and a card is started only in the factory named for it, never one taken from its folder or its repo:, which can be two factories'. Write \`factory: <name>\` in its frontmatter — ${which}${atStart}; a new card names it as it is filed: nemia inbox add "<idea>" --factory <name>. Nothing was started.`;
}

/**
 * An inbox card's frontmatter as key → value: `workflow:` and `repo:`, each at most once, to something; any other key refused by name.
 * `filing` is true for a file `nemia inbox add` is given, which is not a card yet: `after:`'s refusal then says to file it before the start
 * that gives the wait, since `file` is where the idea is now, and no card's path.
 */
function inboxKeys(file: string, block: string, filing = false): Partial<Record<InboxKey, string>> {
  return frontmatterKeys(file, block, INBOX_KEYS, (key) =>
    key === 'after'
      ? filing
        ? `${file}: \`after\` is not a key an inbox card has: what a card waits on is said when it is started, once the runs it could wait on are known. Delete the line and file the idea, then give the wait when you start the card nemia inbox add names: nemia start <inbox>/<name>.md --after <runId>.`
        : `${file}: \`after\` is not a key an inbox card has: what a card waits on is said when it is started, once the runs it could wait on are known — nemia start <inbox>/${file} --after <runId>. Delete the line.`
      : `${file}: \`${key}\` is not a key an inbox card has. An inbox card's keys are: ${INBOX_KEYS.join(', ')}, each optional — what runs it, the repository it is about, when it was queued to start on its own, the step its run waits at for a person, the factory that processes it, and the runs it is handed as context; how its steps run is its workflow's to say. Correct the spelling or delete the line — a key nothing reads is a constraint nobody enforces.`,
  );
}

/**
 * A card's workflow as the card writes it: a path — one with a slash, or `.` or `..` — absolute against `dir`, where it was written from,
 * so it names the same folder from the inbox; a bare name as it is, a workflow the repository has, found at start. `dir` is absolute.
 */
export function workflowAt(given: string, dir: string): string {
  return /[\\/]/.test(given) || given === '.' || given === '..' ? path.resolve(dir, given) : given;
}

/**
 * Why `name` cannot name a card, or undefined when it can: empty; a slash, `.` or `..`, which would reach outside the inbox; or a leading
 * dot, a hidden file `nemia inbox` never lists. Whether a card of that name is there is the folder's to say (`noCardLine`).
 */
export function inboxNameRefusal(name: string): string | undefined {
  if (!name.trim())
    return 'A card is named by its file in the inbox, minus .md, as nemia inbox lists it, and this name is empty. Give the name: nemia inbox lists them.';
  if (/[\\/\0]/.test(name) || name === '.' || name === '..') {
    return `\`${name}\` is not a card's name: a name stays in the inbox, with no slash and not . or .., since it names a file there. Give the name nemia inbox lists — cache-the-views-k2q9, say.`;
  }
  if (name.startsWith('.'))
    return `\`${name}\` is not a card's name: a name that starts with a dot is a hidden file, and nemia inbox lists none. Give the name nemia inbox lists — cache-the-views-k2q9, say.`;
  return undefined;
}

/**
 * That the inbox has no card `name`, and which it has — the cards `nemia inbox` lists, by name — with the name without its `.md` when that
 * is one of them.
 */
export function noCardLine(name: string, cards: readonly string[]): string {
  const bare =
    name.endsWith('.md') && cards.includes(name.slice(0, -'.md'.length))
      ? ` A card is named without its .md: \`${name.slice(0, -'.md'.length)}\`.`
      : '';
  return `no card ${name} in the inbox.${bare} ${cards.length ? `Its cards are: ${[...cards].sort().join(', ')}.` : 'The inbox is empty.'}`;
}

/**
 * A card as `nemia inbox` lists it, or an entry of the folder that does not read as one — `error` says why — in which case `name` is its
 * file's.
 */
export type InboxListing = {
  name: string;
  file: string;
  /** The first line of its body. */
  title: string | null;
  workflow: string | null;
  repo: string | null;
  /** The factory the card names (`factory:`), or null for a card of the default factory and an entry that does not read as a card. */
  factory: string | null;
  /** On a card that names one only: the step its run is gated at (`gate:`). */
  gate?: string;
  /** The runs its run is handed as context (`from:`): none on a card that names none, and on an entry that does not read as a card. */
  from: string[];
  /** The runs whose record's `from` names this card: a card still here was started, and its removal failed. */
  startedAs: string[];
  /** Why the entry does not read as a card: its card's refusal, or not a `.md` file. Null for a card. */
  error: string | null;
  /**
   * On a queued card only: when it was queued, and its place in the order the tick starts cards in (`queueOrder`), from 1 — null for a card
   * a record says was started, which the tick never starts again.
   */
  queued?: { at: string; place: number | null };
  /**
   * On a queued card only, whose start the tick tried and did not make, as the card stands (`QueueTry`): when, on which repository, why,
   * and whether the package refused it or something else failed.
   */
  tried?: { at: string; repo: string; why: string; refused: boolean };
  /**
   * The repository the card's factory picks for it (`factoryRepoOf`): its factory's one repository, for a card that names none — null for
   * a card that names its own, one whose factory has several or does not read, and an entry that does not read as a card.
   */
  factoryRepo: string | null;
};

/**
 * A queued card's start the tick tried and did not make, as it writes it down: when, the card's text as it was, the repository it was tried
 * on — the card's `repo:`, or the daemon's for a card that names none — why, and whether it was a refusal.
 *
 * `refused` is the package's own refusal, by name, exit 2 — the workflow gone, the repository gone, a card that does not read: it lasts.
 * The tick does not try that card again while its text is the same and it would be tried on the same repository (`nextQueued`) — an edit, a
 * queue taken back and given again, or a daemon in another repository for a card that names none, is a new try. Anything else — git failing
 * while the start reads the repository, a file that cannot be read — is a failure, not a verdict on the card: it is tried again on the next
 * pass.
 */
export type QueueTry = { at: string; text: string; repo: string; why: string; refused: boolean };

/**
 * The inbox as `nemia inbox` lists it, by file name: every entry of the folder — a folder inside it by its name and a trailing `/` — each
 * card with the runs its name is on (`startedAs`), and each entry that is not a card listed with why, never hidden. A hidden file and a
 * README are not listed: the one is an editor's, the other says what the folder is for. A queued card says when, and its place in the
 * order; and, when the tick's last try of its start is of the card as it stands (`tries`, by name), that try. A queued card that reads but
 * for a `repo:` naming no directory keeps its place, with its workflow and repository as written, the repository keying its try: the start
 * refuses it by name, as it refuses a workflow gone, and it never leaves the queue with nothing said. An entry that does not read for
 * another reason is not queued. Each card says the repository its factory picks for it (`factoryRepo`), from the store's `factories` that
 * read, by name: with none handed, none picks one.
 */
export function inboxListing(
  files: readonly PlanFile[],
  runs: readonly Pick<Run, 'id' | 'from'>[],
  isDirectory: (at: string) => boolean,
  tries: ReadonlyMap<string, QueueTry> = new Map(),
  factories: ReadonlyMap<string, Pick<Factory, 'repos'>> = new Map(),
): InboxListing[] {
  const triedOf = (name: string, text: string): Pick<InboxListing, 'tried'> => {
    const t = tries.get(name);
    return t && t.text === text ? { tried: { at: t.at, repo: t.repo, why: t.why, refused: t.refused } } : {};
  };
  const listed = files
    .filter((f) => !f.file.startsWith('.') && !isReadme(f.file))
    .sort((a, b) => a.file.localeCompare(b.file))
    .map(({ file, text }): InboxListing => {
      if (!file.endsWith('.md')) {
        return {
          name: file,
          file,
          title: null,
          workflow: null,
          repo: null,
          factory: null,
          from: [],
          startedAs: [],
          factoryRepo: null,
          error: `${file}: not a card. The inbox holds one markdown file per card, <name>.md — move it out, or, for a card, name it <name>.md.`,
        };
      }
      const name = file.slice(0, -'.md'.length);
      const startedAs = runs.filter((r) => r.from?.inbox === name).map((r) => r.id);
      try {
        const card = parseInboxCard(file, text, isDirectory);
        return {
          name,
          file,
          title: card.body.split('\n')[0],
          workflow: card.workflow ?? null,
          repo: card.repo ?? null,
          factory: card.factory ?? null,
          ...(card.gate !== undefined ? { gate: card.gate } : {}),
          from: card.from ?? [],
          startedAs,
          factoryRepo: factoryRepoOf({ repo: card.repo ?? null, factory: card.factory ?? null }, factories),
          error: null,
          ...(card.queued !== undefined ? { queued: { at: card.queued, place: null }, ...triedOf(name, text) } : {}),
        };
      } catch (err) {
        let lenient: InboxCard | undefined;
        try {
          lenient = parseInboxCard(file, text, () => true);
        } catch {}
        const queued = lenient?.queued;
        const repo = queued !== undefined ? (lenient!.repo ?? null) : null;
        const factory = queued !== undefined ? (lenient!.factory ?? null) : null;
        return {
          name,
          file,
          title: null,
          workflow: queued !== undefined ? (lenient!.workflow ?? null) : null,
          repo,
          factory,
          from: [],
          startedAs,
          factoryRepo: factoryRepoOf({ repo, factory }, factories),
          error: (err as Error).message,
          ...(queued !== undefined ? { queued: { at: queued, place: null }, ...triedOf(name, text) } : {}),
        };
      }
    });
  queueOrder(listed).forEach((l, i) => {
    l.queued!.place = i + 1;
  });
  return listed;
}

/**
 * The queued cards in the order the tick starts them: by when each was queued, then by name — a card a record says was started left out,
 * since it is never started again. Pure. A card whose start was refused keeps its place, and the tick passes over it (`nextQueued`).
 */
export const queueOrder = (listing: readonly InboxListing[]): InboxListing[] =>
  listing
    .filter((l) => l.queued && !l.startedAs.length)
    .sort((a, b) => a.queued!.at.localeCompare(b.queued!.at) || a.name.localeCompare(b.name));

/**
 * The repository a card's factory picks for it: its factory's one repository, for a card with no `repo:` whose factory is among
 * `factories`, the store's that read, by name, and has exactly one. Null for a card that names its own, one of the default factory, and one
 * whose factory has several repositories or does not read: there the card's `repo:`, or the daemon's, is the one (`queueRepo`). Pure.
 */
export function factoryRepoOf(
  l: Pick<InboxListing, 'repo' | 'factory'>,
  factories: ReadonlyMap<string, Pick<Factory, 'repos'>>,
): string | null {
  if (l.repo !== null || l.factory === null) return null;
  const repos = factories.get(l.factory)?.repos;
  return repos?.length === 1 ? repos[0] : null;
}

/**
 * The repository the tick tries a queued card on, from a daemon in `daemonRepo`: its `repo:`, else the one its factory picks
 * (`factoryRepoOf`), else the daemon's. A card whose factory is not among `factories` — the default, or one whose file does not read — is
 * tried on its `repo:` or the daemon's, and its start refuses it by name. `fromDaemon` is true when the repository is the daemon's because
 * neither the card nor its factory names one: the only start that turns on where the daemon runs.
 */
export function queueRepo(
  l: Pick<InboxListing, 'repo' | 'factory'>,
  daemonRepo: string,
  factories: ReadonlyMap<string, Pick<Factory, 'repos'>>,
): { repo: string; fromDaemon: boolean } {
  const chosen = l.repo ?? factoryRepoOf(l, factories);
  return { repo: chosen ?? daemonRepo, fromDaemon: chosen === null };
}

/**
 * The card the tick starts next, when a run slot is free, on a daemon in `repo`: the first in the queue's order whose start was not refused
 * as it stands — its text the same, and tried on the repository it would be tried on now (`queueRepo`, with the store's `factories` by
 * name). A card whose start failed for any other reason keeps its place, and is tried again. Pure.
 */
export const nextQueued = (
  listing: readonly InboxListing[],
  repo: string,
  factories: ReadonlyMap<string, Pick<Factory, 'repos'>> = new Map(),
): InboxListing | undefined => queueOrder(listing).find((l) => !(l.tried?.refused && l.tried.repo === queueRepo(l, repo, factories).repo));

/**
 * What the tick did with the queue on a pass (`startQueued` in inbox.verb.ts): started the next card as a run — and whether the card left
 * the inbox, and why not — or tried to, and was refused, in the package's words, or failed for another reason: `again` when it failed as it
 * did on the pass before, on the same repository. `on` is the repository it was tried on, for a card that names none.
 */
export type QueueStarted =
  | { card: string; run: string; removed: true; ignoredRepo?: string }
  | { card: string; run: string; removed: false; why: string; ignoredRepo?: string }
  | { card: string; refused: string; on?: string }
  | { card: string; failed: string; again: boolean; on?: string };

/**
 * The card's own `repo:` when the run started from it looks at no repository — a folder team's does not, and a card written by hand, or by
 * a writer that does not ask `cardRepoRefusal`, may carry one. Said and not refused, since a card on disk cannot be edited from the board.
 *
 * One writer, so a person reads the same sentence wherever the card was started: `nemia start` prints it under the run, and a tick's
 * queue line carries it (`queueLine`). `InboxStarted.ignoredRepo` in inbox.verb.ts is what both are given.
 */
export const ignoredRepoLine = (repo: string): string =>
  `the card's repo: ${repo} was not looked at — this workflow's steps work in folders, with no git repository`;

/**
 * A pass's start of a queued card, as `nemia up` and `nemia tick` log it: `started <card> as <runId>`, or why it was not started, and what
 * then. A card whose `repo:` the run looked at none of says so in the same line (`ignoredRepoLine`). A failure is said once by the daemon
 * that says it — `nemia up` keeps the last one it printed, rather than reading `again`, which is a fact about the store and not about this
 * terminal.
 */
export function queueLine(q: QueueStarted): string {
  if ('refused' in q) {
    const elsewhere = q.on ? `, or run nemia up in the repository it is about` : '';
    return `${q.card} not started${q.on ? ` on ${q.on}` : ''}: ${q.refused} — left queued as it is, and not tried again while it reads the same: edit the card, or take it back and queue it again (nemia inbox queue ${q.card} --off, then nemia inbox queue ${q.card})${elsewhere}`;
  }
  if ('failed' in q) {
    return `${q.card} not started${q.on ? ` on ${q.on}` : ''}: ${q.failed} — not a refusal: tried again on the next pass, where it keeps its place, and said again only if it fails otherwise`;
  }
  const started = q.removed
    ? `started ${q.card} as ${q.run}`
    : `started ${q.card} as ${q.run} — still in the inbox: ${q.why}. nemia inbox lists it as started as ${q.run}, and it is not started again: drop it with nemia inbox rm ${q.card}`;
  return q.ignoredRepo ? `${started} (${ignoredRepoLine(q.ignoredRepo)})` : started;
}

/**
 * What `nemia inbox` says of a queued card's last try (`inboxLines`): when, on which repository for a card that names none — the one its
 * factory picks said as such — and why; refused, how to have it tried again, and running `nemia up` elsewhere only when the daemon's
 * repository was the one; failed otherwise, that the tick tries it again. Empty for a card not tried.
 */
function triedClause(l: InboxListing, unfactoredStarts: boolean): string {
  const t = l.tried;
  if (!t) return '';
  const said = l.error === null && !l.repo && (l.factory !== null || unfactoredStarts);
  const its = t.repo === l.factoryRepo ? ", its factory's one repository" : '';
  const on = said ? ` on ${t.repo}${its}` : '';
  const why = t.why !== l.error ? `: ${t.why}` : '';
  if (!t.refused) return ` — failed at ${t.at}${on}${why} — not a refusal: the tick tries it again on every pass, where it keeps its place`;
  const elsewhere = said && l.factoryRepo === null ? ', or run nemia up in the repository it is about' : '';
  return ` — not started at ${t.at}${on}${why} Edit the card, or take it back and queue it again${elsewhere}, and the tick tries it again`;
}

/**
 * What `nemia inbox` prints, a line per entry: the card's name, the first line of its body, its workflow and repository when it names them,
 * and the runs it was started as — or, for an entry that does not read as a card, why. A queued card says its place in the queue and, when
 * the tick's last try did not start it as it stands, why: refused, it waits for a person, not for a slot; failed otherwise, the tick tries
 * it again. A reason the entry's own error already says is not said twice. A card that names no factory is refused wherever a daemon runs,
 * and its try names no repository to run one in, unless `unfactoredStarts` (`WF_DEFAULT_FACTORY_STARTS=1`, the tests' switch) starts it.
 * A try on the repository the card's factory picks (`factoryRepo`) says so, and names no daemon's repository to run one in: only a try on
 * the daemon's own (`queueRepo`) does (`triedClause`).
 */
export function inboxLines(listing: readonly InboxListing[], unfactoredStarts = false): string[] {
  const width = Math.max(0, ...listing.map((l) => l.name.length));
  const inLine = listing.filter((l) => l.queued?.place).length;
  return listing.map((l) => {
    const started = l.startedAs.length ? `  started as ${l.startedAs.join(', ')}` : '';
    const queued = l.queued?.place ? `  queued ${l.queued.place} of ${inLine}` : '';
    const tried = triedClause(l, unfactoredStarts);
    if (l.error !== null) return `${l.name.padEnd(width)}  ${l.error}${queued}${tried}${started}`;
    return `${l.name.padEnd(width)}  ${l.title!.slice(0, 56).trimEnd()}${l.workflow ? `  workflow: ${l.workflow}` : ''}${l.repo ? `  repo: ${l.repo}` : ''}${l.gate ? `  gate: ${l.gate}` : ''}${l.factory ? `  factory: ${l.factory}` : ''}${queued}${tried}${started}`;
  });
}

/** `given` without the keys it leaves undefined, so a key given as undefined leaves the text's own. */
const definedOf = (given: Partial<Record<InboxKey, string | undefined>>): Partial<Record<InboxKey, string>> =>
  Object.fromEntries(Object.entries(given).filter(([, value]) => value !== undefined));

/**
 * The file `nemia inbox add` writes for an idea, and its body — refused, naming `from`, as the card it writes would be refused
 * (`parseInboxCard`).
 *
 * `text` is the idea as given: a note, or a file's text. A file whose frontmatter is an inbox card's — every line a key of `INBOX_KEYS`, or
 * an `after:`, which is refused by name — gives its keys and its body; any other text, a frontmatter that never closes included, is the
 * body whole, as `nemia start` takes a brief that is not a card. `workflow`, `repo` and `factory`, when given, are written over the text's
 * own, the keys in `INBOX_KEYS`' order. Refused too: text with nothing in it, a `workflow`, `repo` or `factory` given on more than one
 * line, and a `queued:` in the text: a card is queued once it is in the inbox, under its own name, and a time carried in from elsewhere
 * would jump the queue. A body that opens with a `---` rule of its own is given a frontmatter of one comment line, so the rule is not read
 * as the card's frontmatter.
 *
 * `dir` is the folder a `workflow:` of the text's own that is a path was written from — the file's, as a plan card's is its plan folder —
 * and such a path is written absolute against it (`workflowAt`). Left relative, the start would read it from the inbox, and
 * `../workflows/dev` would name a workflow of the store's rather than the one beside the file. Without `dir`, it is written as it is.
 */
export function ideaCard(
  from: string,
  text: string,
  given: { workflow?: string; repo?: string; factory?: string },
  isDirectory: (at: string) => boolean,
  dir?: string,
): { text: string; body: string } {
  if (!text.trim()) {
    refuse(
      `nemia inbox add takes the idea, and ${from} has nothing in it. Give it as text — nemia inbox add "<idea>" — or as a file: nemia inbox add ./idea.md. Nothing was filed.`,
    );
  }
  for (const [flag, value] of Object.entries(given)) {
    if (value !== undefined && /[\r\n]/.test(value))
      refuse(
        `${from}: the ${flag} given, ${JSON.stringify(value)}, is more than one line, and a card's ${flag}: is one. Give the one line it names.`,
      );
  }
  let keys: Partial<Record<InboxKey, string>> = {};
  let body = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .trim();
  let split: { block: string | null; body: string } | undefined;
  try {
    split = splitFrontmatter(from, text);
  } catch {}
  const lines = (split?.block ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  const isCardLine = (line: string) =>
    line.indexOf(':') > 0 && ([...INBOX_KEYS, 'after'] as string[]).includes(line.slice(0, line.indexOf(':')).trim());
  if (split && lines.length && lines.every(isCardLine)) {
    const read = inboxKeys(from, split.block!, true);
    if (read.queued !== undefined) {
      refuse(
        `${from}: \`queued\` is not a key a filed idea keeps: a card is queued once it is in the inbox, at the time it is queued. Delete the line and file the idea, then queue the card nemia inbox add names: nemia inbox queue <name>.`,
      );
    }
    keys = read;
    body = split.body;
    if (keys.workflow !== undefined && dir !== undefined) keys.workflow = workflowAt(keys.workflow, dir);
  }
  const written = { ...keys, ...definedOf(given) };
  const frontmatter = INBOX_KEYS.flatMap((key) => (written[key] !== undefined ? [`${key}: ${written[key]}`] : []));
  if (!frontmatter.length && body.startsWith('---')) frontmatter.push('# the idea below opens with a rule of its own');
  const card = `${frontmatter.length ? `---\n${frontmatter.join('\n')}\n---\n` : ''}${body}\n`;
  parseInboxCard(from, card, isDirectory);
  return { text: card, body };
}

/**
 * A card's text with `queued:` set to `at` — or taken off, for `null` — and `workflow:` written over its own when given, its `repo:`,
 * `gate:` and `factory:` kept: what `nemia inbox queue` writes. The frontmatter is written again in the keys' order, its comments dropped,
 * as `nemia inbox add` writes a card, and a body that opens with a `---` rule of its own is kept from being read as the frontmatter, as
 * `ideaCard` keeps it. Pure; the text it gives reads back as a card (`parseInboxCard`), or is refused as one would be.
 */
export function queuedText(card: InboxCard, at: string | null, isDirectory: (at: string) => boolean, workflow?: string): string {
  return cardText(card, { workflow: workflow ?? card.workflow, queued: at ?? undefined }, isDirectory);
}

/**
 * A card's text with `from:` set to `runs` — or taken off, for none — every other key kept: what `nemia inbox from` writes. Written again
 * as `queuedText` writes it; pure, and the text reads back as a card (`parseInboxCard`).
 */
export const fromText = (card: InboxCard, runs: readonly string[], isDirectory: (at: string) => boolean): string =>
  cardText(card, { from: fromLine(runs) }, isDirectory);

/**
 * A card's text, its keys written over by `over` and the frontmatter written again in the keys' order, its comments dropped; a body that
 * opens with a `---` rule of its own is kept from being read as the frontmatter, as `ideaCard` keeps it. Read back before it is given.
 */
function cardText(card: InboxCard, over: Partial<Record<InboxKey, string | undefined>>, isDirectory: (at: string) => boolean): string {
  const keys: Partial<Record<InboxKey, string | undefined>> = {
    workflow: card.workflow,
    repo: card.repo,
    queued: card.queued,
    gate: card.gate,
    factory: card.factory,
    from: fromLine(card.from),
    ...over,
  };
  const frontmatter = INBOX_KEYS.flatMap((key) => (keys[key] !== undefined ? [`${key}: ${keys[key]}`] : []));
  if (!frontmatter.length && card.body.startsWith('---')) frontmatter.push('# the idea below opens with a rule of its own');
  const text = `${frontmatter.length ? `---\n${frontmatter.join('\n')}\n---\n` : ''}${card.body}\n`;
  parseInboxCard(card.file, text, isDirectory);
  return text;
}

/**
 * Why `nemia inbox queue` will not queue this card, in words that name the fix — or undefined, when it may. Pure. Refused: a card a run's
 * record names (`startedAs`), which is not started again (`startedRefusal`); a card already queued, with its place, and how to take it
 * back; and a card with no `workflow:` and none given — nothing would say what starts it, and `--workflow <w>` writes both.
 */
export function queueRefusal(
  card: InboxCard,
  where: string,
  startedAs: readonly string[],
  place: number | null,
  workflow?: string,
): string | undefined {
  if (startedAs.length) return startedRefusal(card, where, startedAs);
  if (card.queued !== undefined) {
    return `${card.file}: already queued, at ${card.queued}${place ? `, ${place} in the queue's order` : ''}: the tick starts it when its turn comes and a run slot is free. To queue it again, take it back first: nemia inbox queue ${card.name} --off.`;
  }
  if (card.workflow === undefined && workflow === undefined) {
    return `${card.file}: no workflow — a queued card starts on its own, and nothing says what runs it. Queue it with its workflow: nemia inbox queue ${card.name} --workflow <w> writes both.`;
  }
  return undefined;
}

/**
 * The name of the inbox card `at` names — a path under the inbox `dir`, as its path from there, less a trailing `.md`, so `<dir>/<name>` is
 * the card `nemia inbox` lists as `<name>` — or null for a path outside it, and for the inbox itself: what makes `nemia start <path>` start
 * a card out of the inbox. Both paths are taken as given; the store resolves links first (`runStore.inbox.nameAt`).
 *
 * Every path under the inbox goes to the start, never to a brief: whether the card is there, and whether the name is a card's — a folder
 * inside the inbox gives one with a slash — is `startFromInbox`'s to say, by name. Taken as a brief, a card's name typed without its `.md`
 * would start a run asked to do its own path, and leave the card where it was.
 */
export function inboxNameOf(at: string, dir: string): string | null {
  const rel = path.relative(dir, at);
  if (!rel || path.isAbsolute(rel) || rel === '..' || rel.startsWith(`..${path.sep}`)) return null;
  return rel.endsWith('.md') ? rel.slice(0, -'.md'.length) : rel;
}

/**
 * Why a card cannot be started on no workflow: it names none, and none was given — with the workflows the repository has to name one of,
 * and how. `where` is what `nemia start` is given for the card.
 */
export function noWorkflowRefusal(card: Pick<InboxCard, 'file'>, where: string, repo: string, workflows: readonly string[]): string {
  const dir = path.join(repo, 'workflows');
  return (
    `${card.file}: no workflow — the card names none, and none was given, so nothing says what runs it. ` +
    (workflows.length
      ? `The repository's workflows are: ${workflows.join(', ')}, in ${dir}. Name one: nemia start ${where} --workflows ${workflows[0]}, or write \`workflow: ${workflows[0]}\` in the card.`
      : `${dir} has no workflows. Give a workflow folder: nemia start ${where} --workflows <dir>, or write \`workflow:\` in the card.`)
  );
}

/**
 * Why a card is not started again: a run's record names it (`from`), so it was started, and is still in the inbox because its removal
 * failed. Started again, the idea would run twice.
 */
export function startedRefusal(card: Pick<InboxCard, 'name' | 'file'>, where: string, runs: readonly string[]): string {
  return `${card.file}: this card was started as ${runs.join(', ')} — ${runs.length === 1 ? "that run's record says" : 'their records say'} so — and is still in the inbox because its removal failed. Drop it with nemia inbox rm ${card.name}; to run the idea again, park it again under a name of its own first: nemia inbox add ${where}.`;
}

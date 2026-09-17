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
 * A card in a plan's format (plan.ts), with two differences. `workflow:` is optional: an idea often does not know what will run it, and that
 * is chosen at start. `repo:` is a key of its own, optional too: the absolute path of the repository the idea is about, for a board that will
 * serve more than one. And an inbox card has no `after:`: what it waits on is said at start, when the runs it could wait on are known.
 *
 * `queued:` marks a card to start on its own (`wf inbox queue`): the time it was queued, which orders the queue. The tick starts the oldest
 * such card when a run slot is free (`queueOrder`, `startQueued` in runner.ts).
 *
 * **The keys are a closed list**, as a plan card's are: a key nothing reads is a constraint nobody enforces.
 *
 * Nothing about a run changes. A card started is a run like any other, whose record carries `from: { inbox: <name> }`, and the card is
 * removed; a card still there whose name a record carries is one whose removal failed, and `wf inbox` says it was started, composed on read.
 *
 * Pure: handed a card's text, the folder's entries and the run records, and whether a path is a directory, never reading one (runner.ts
 * reads them).
 */
import path from 'node:path';
import { bodyOf, frontmatterKeys, type PlanFile } from './plan.ts';
import type { Run } from './run.ts';
import { isReadme, splitFrontmatter, WorkflowError } from './workflow.ts';

export type InboxCard = {
  /** Its file's name in the inbox, minus `.md`: what `wf inbox rm` and a start name it by. */
  name: string;
  /** Its file's name, as a refusal names it. */
  file: string;
  /** The workflow to start it on, as written — a name under the repository's `workflows/`, or a path to a workflow folder — when it says. */
  workflow?: string;
  /** The absolute path of the repository the idea is about, when it says. */
  repo?: string;
  /** When it was queued to start on its own (`wf inbox queue`), as an ISO time: what orders the queue. Absent on a card not queued. */
  queued?: string;
  /** Everything below the frontmatter: the idea, and its run's brief unless a brief given at start replaces it. */
  body: string;
};

/** Every key an inbox card may set, each optional. Anything else is refused by name — `after:` with where it is said instead. */
export const INBOX_KEYS = ['workflow', 'repo', 'queued'] as const;

/** An ISO time as `new Date().toISOString()` writes it, to the second or the millisecond, in UTC: what `queued:` takes, so the order is stable. */
const isInstant = (value: string): boolean => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) && !Number.isNaN(Date.parse(value));

function refuse(why: string): never {
  throw new WorkflowError(why);
}

/**
 * One inbox card, from its file's text — or refused, naming the file and the fix: a key an inbox card does not have (`after:` among them),
 * a key set twice or to nothing, a `repo:` that is not an absolute path or names no directory (`isDirectory`), a `queued:` that is not an
 * ISO time or is on a card with no `workflow:` — nothing would say what starts it — an empty body, and a frontmatter that never closes.
 */
export function parseInboxCard(file: string, text: string, isDirectory: (at: string) => boolean): InboxCard {
  const { block, body } = splitFrontmatter(file, text);
  const { repo, workflow, queued } = block === null ? {} : inboxKeys(file, block);
  const name = file.slice(0, -'.md'.length);
  if (repo !== undefined && !path.isAbsolute(repo)) {
    refuse(`${file}: \`repo: ${repo}\` is not an absolute path. \`repo:\` is the repository the idea is about, from the root — \`repo: /home/me/code/app\` — since a relative one would name a different repository from wherever the card is started.`);
  }
  if (repo !== undefined && !isDirectory(repo)) {
    refuse(`${file}: \`repo: ${repo}\` names no directory. Correct it to the repository the idea is about, or delete the line, and the card is started on the repository its start names.`);
  }
  if (queued !== undefined && !isInstant(queued)) {
    refuse(`${file}: \`queued: ${queued}\` is not a time. \`queued:\` is when the card was queued to start on its own, as wf inbox queue writes it — \`queued: 2026-09-16T10:00:00.000Z\` — which orders the queue. Delete the line, and queue the card with wf inbox queue ${name}.`);
  }
  if (queued !== undefined && workflow === undefined) {
    refuse(`${file}: \`queued:\` with no \`workflow:\` — a card that starts on its own has nothing to say what runs it. Write \`workflow:\`, or delete the \`queued:\` line and queue the card with its workflow: wf inbox queue ${name} --workflow <w> writes both.`);
  }
  return {
    name,
    file,
    ...(workflow !== undefined ? { workflow } : {}),
    ...(repo !== undefined ? { repo } : {}),
    ...(queued !== undefined ? { queued } : {}),
    body: bodyOf(file, body),
  };
}

/**
 * An inbox card's frontmatter as key → value: `workflow:` and `repo:`, each at most once, to something; any other key refused by name.
 * `filing` is true for a file `wf inbox add` is given, which is not a card yet: `after:`'s refusal then says to file it before the start that
 * gives the wait, since `file` is where the idea is now, and no card's path.
 */
function inboxKeys(file: string, block: string, filing = false): Partial<Record<(typeof INBOX_KEYS)[number], string>> {
  return frontmatterKeys(file, block, INBOX_KEYS, (key) => (key === 'after'
    ? filing
      ? `${file}: \`after\` is not a key an inbox card has: what a card waits on is said when it is started, once the runs it could wait on are known. Delete the line and file the idea, then give the wait when you start the card wf inbox add names: wf start <inbox>/<name>.md --after <runId>.`
      : `${file}: \`after\` is not a key an inbox card has: what a card waits on is said when it is started, once the runs it could wait on are known — wf start <inbox>/${file} --after <runId>. Delete the line.`
    : `${file}: \`${key}\` is not a key an inbox card has. An inbox card's keys are: ${INBOX_KEYS.join(', ')}, each optional — what runs it, the repository it is about, and when it was queued to start on its own; how its steps run is its workflow's to say. Correct the spelling or delete the line — a key nothing reads is a constraint nobody enforces.`));
}

/**
 * A card's workflow as the card writes it: a path — one with a slash, or `.` or `..` — absolute against `dir`, where it was written from, so
 * it names the same folder from the inbox; a bare name as it is, a workflow the repository has, found at start. `dir` is absolute.
 */
export function workflowAt(given: string, dir: string): string {
  return /[\\/]/.test(given) || given === '.' || given === '..' ? path.resolve(dir, given) : given;
}

/**
 * Why `name` cannot name a card, or undefined when it can: empty; a slash, `.` or `..`, which would reach outside the inbox; or a leading
 * dot, a hidden file `wf inbox` never lists. Whether a card of that name is there is the folder's to say (`noCardLine`).
 */
export function inboxNameRefusal(name: string): string | undefined {
  if (!name.trim()) return 'A card is named by its file in the inbox, minus .md, as wf inbox lists it, and this name is empty. Give the name: wf inbox lists them.';
  if (/[\\/\0]/.test(name) || name === '.' || name === '..') {
    return `\`${name}\` is not a card's name: a name stays in the inbox, with no slash and not . or .., since it names a file there. Give the name wf inbox lists — cache-the-views-k2q9, say.`;
  }
  if (name.startsWith('.')) return `\`${name}\` is not a card's name: a name that starts with a dot is a hidden file, and wf inbox lists none. Give the name wf inbox lists — cache-the-views-k2q9, say.`;
  return undefined;
}

/**
 * That the inbox has no card `name`, and which it has — the cards `wf inbox` lists, by name — with the name without its `.md` when that is
 * one of them.
 */
export function noCardLine(name: string, cards: readonly string[]): string {
  const bare = name.endsWith('.md') && cards.includes(name.slice(0, -'.md'.length)) ? ` A card is named without its .md: \`${name.slice(0, -'.md'.length)}\`.` : '';
  return `no card ${name} in the inbox.${bare} ${cards.length ? `Its cards are: ${[...cards].sort().join(', ')}.` : 'The inbox is empty.'}`;
}

/** A card as `wf inbox` lists it, or an entry of the folder that does not read as one — `error` says why — in which case `name` is its file's. */
export type InboxListing = {
  name: string;
  file: string;
  /** The first line of its body. */
  title: string | null;
  workflow: string | null;
  repo: string | null;
  /** The runs whose record's `from` names this card: a card still here was started, and its removal failed. */
  startedAs: string[];
  /** Why the entry does not read as a card: its card's refusal, or not a `.md` file. Null for a card. */
  error: string | null;
  /**
   * On a queued card only: when it was queued, and its place in the order the tick starts cards in (`queueOrder`), from 1 — null for a card a
   * record says was started, which the tick never starts again.
   */
  queued?: { at: string; place: number | null };
  /** On a queued card only, whose start the tick tried and the package refused, as the card stands (`QueueRefusal`): when, and why. */
  refused?: { at: string; why: string };
};

/**
 * A queued card's start the package refused, as the tick writes it down: when, the card's text as it was, and why. The tick does not try that
 * card again while its text is the same — an edit, or a queue taken back and given again, is a new card to try.
 */
export type QueueRefusal = { at: string; text: string; why: string };

/**
 * The inbox as `wf inbox` lists it, by file name: every entry of the folder — a folder inside it by its name and a trailing `/` — each card
 * with the runs its name is on (`startedAs`), and each entry that is not a card listed with why, never hidden. A hidden file and a README are
 * not listed: the one is an editor's, the other says what the folder is for. A queued card says when, and its place in the order; and, when the
 * tick's refusal of its start is of the card as it stands (`refusals`, by name), that refusal.
 */
export function inboxListing(files: readonly PlanFile[], runs: readonly Pick<Run, 'id' | 'from'>[], isDirectory: (at: string) => boolean, refusals: ReadonlyMap<string, QueueRefusal> = new Map()): InboxListing[] {
  const listed = files
    .filter((f) => !f.file.startsWith('.') && !isReadme(f.file))
    .sort((a, b) => a.file.localeCompare(b.file))
    .map(({ file, text }): InboxListing => {
      if (!file.endsWith('.md')) {
        return {
          name: file, file, title: null, workflow: null, repo: null, startedAs: [],
          error: `${file}: not a card. The inbox holds one markdown file per card, <name>.md — move it out, or, for a card, name it <name>.md.`,
        };
      }
      const name = file.slice(0, -'.md'.length);
      const startedAs = runs.filter((r) => r.from?.inbox === name).map((r) => r.id);
      try {
        const card = parseInboxCard(file, text, isDirectory);
        const refusal = card.queued !== undefined ? refusals.get(name) : undefined;
        return {
          name, file, title: card.body.split('\n')[0]!, workflow: card.workflow ?? null, repo: card.repo ?? null, startedAs, error: null,
          ...(card.queued !== undefined ? { queued: { at: card.queued, place: null } } : {}),
          ...(refusal && refusal.text === text ? { refused: { at: refusal.at, why: refusal.why } } : {}),
        };
      } catch (err) {
        return { name, file, title: null, workflow: null, repo: null, startedAs, error: (err as Error).message };
      }
    });
  queueOrder(listed).forEach((l, i) => { l.queued!.place = i + 1; });
  return listed;
}

/**
 * The queued cards in the order the tick starts them: by when each was queued, then by name — a card a record says was started left out, since
 * it is never started again. Pure. A card whose start was refused keeps its place, and the tick passes over it (`nextQueued`).
 */
export const queueOrder = (listing: readonly InboxListing[]): InboxListing[] =>
  listing.filter((l) => l.queued && !l.startedAs.length).sort((a, b) => a.queued!.at.localeCompare(b.queued!.at) || a.name.localeCompare(b.name));

/** The card the tick starts next, when a run slot is free: the first in the queue's order whose start was not refused as it stands. Pure. */
export const nextQueued = (listing: readonly InboxListing[]): InboxListing | undefined => queueOrder(listing).find((l) => !l.refused);

/**
 * What the tick did with the queue on a pass (`startQueued` in runner.ts): started the next card as a run — and whether the card left the inbox,
 * and why not — or tried to, and was refused, in the package's words.
 */
export type QueueStarted = { card: string; run: string; removed: true } | { card: string; run: string; removed: false; why: string } | { card: string; refused: string };

/** A pass's start of a queued card, as `wf up` and `wf tick` log it: `started <card> as <runId>`, or why it was not started, and what then. */
export function queueLine(q: QueueStarted): string {
  if ('refused' in q) {
    return `${q.card} not started: ${q.refused} — left queued as it is, and not tried again while it reads the same: edit the card, or take it back and queue it again (wf inbox queue ${q.card} --off, then wf inbox queue ${q.card})`;
  }
  return q.removed
    ? `started ${q.card} as ${q.run}`
    : `started ${q.card} as ${q.run} — still in the inbox: ${q.why}. wf inbox lists it as started as ${q.run}, and it is not started again: drop it with wf inbox rm ${q.card}`;
}

/**
 * What `wf inbox` prints, a line per entry: the card's name, the first line of its body, its workflow and repository when it names them, and
 * the runs it was started as — or, for an entry that does not read as a card, why.
 */
export function inboxLines(listing: readonly InboxListing[]): string[] {
  const width = Math.max(0, ...listing.map((l) => l.name.length));
  const inLine = listing.filter((l) => l.queued?.place).length;
  return listing.map((l) => {
    const started = l.startedAs.length ? `  started as ${l.startedAs.join(', ')}` : '';
    if (l.error !== null) return `${l.name.padEnd(width)}  ${l.error}${started}`;
    // Its place in the queue, and, when the tick's start of it was refused as it stands, why: it waits for a person, not for a slot.
    const queued = l.queued?.place ? `  queued ${l.queued.place} of ${inLine}` : '';
    const refused = l.refused ? ` — not started at ${l.refused.at}: ${l.refused.why} Edit the card, or take it back and queue it again, and the tick tries it again` : '';
    return `${l.name.padEnd(width)}  ${l.title!.slice(0, 56).trimEnd()}${l.workflow ? `  workflow: ${l.workflow}` : ''}${l.repo ? `  repo: ${l.repo}` : ''}${queued}${refused}${started}`;
  });
}

/**
 * The file `wf inbox add` writes for an idea, and its body — refused, naming `from`, as the card it writes would be refused (`parseInboxCard`).
 *
 * `text` is the idea as given: a note, or a file's text. A file whose frontmatter is an inbox card's — every line `workflow:` or `repo:`, or an
 * `after:`, which is refused by name — gives its keys and its body; any other text is the body whole, as `wf start` takes a brief that is not
 * a card. `workflow` and `repo`, when given, are written over the text's own. Refused too: text with nothing in it.
 *
 * `dir` is the folder a `workflow:` of the text's own that is a path was written from — the file's, as a plan card's is its plan folder —
 * and such a path is written absolute against it (`workflowAt`). Left relative, the start would read it from the inbox, and
 * `../workflows/dev` would name a workflow of the store's rather than the one beside the file. Without `dir`, it is written as it is.
 */
export function ideaCard(from: string, text: string, given: { workflow?: string; repo?: string }, isDirectory: (at: string) => boolean, dir?: string): { text: string; body: string } {
  if (!text.trim()) {
    refuse(`wf inbox add takes the idea, and ${from} has nothing in it. Give it as text — wf inbox add "<idea>" — or as a file: wf inbox add ./idea.md. Nothing was filed.`);
  }
  for (const [flag, value] of Object.entries(given)) {
    if (value !== undefined && /[\r\n]/.test(value)) refuse(`${from}: the ${flag} given, ${JSON.stringify(value)}, is more than one line, and a card's ${flag}: is one. Give the one line it names.`);
  }
  let keys: { workflow?: string; repo?: string; queued?: string } = {};
  let body = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim();
  let split: { block: string | null; body: string } | undefined;
  try { split = splitFrontmatter(from, text); } catch { /* a rule that never closes: the text is the body */ }
  const lines = (split?.block ?? '').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const isCardLine = (line: string) => line.indexOf(':') > 0 && ([...INBOX_KEYS, 'after'] as string[]).includes(line.slice(0, line.indexOf(':')).trim());
  if (split && lines.length && lines.every(isCardLine)) {
    // Its keys, to be written over; whether what they say holds is asked of the card written, below.
    const read = inboxKeys(from, split.block!, true);
    // A card is queued once it is in the inbox, under its own name: a time carried in from elsewhere would jump the queue.
    if (read.queued !== undefined) {
      refuse(`${from}: \`queued\` is not a key a filed idea keeps: a card is queued once it is in the inbox, at the time it is queued. Delete the line and file the idea, then queue the card wf inbox add names: wf inbox queue <name>.`);
    }
    keys = read;
    body = split.body;
    if (keys.workflow !== undefined && dir !== undefined) keys.workflow = workflowAt(keys.workflow, dir);
  }
  const workflow = given.workflow ?? keys.workflow;
  const repo = given.repo ?? keys.repo;
  const frontmatter = [...(workflow !== undefined ? [`workflow: ${workflow}`] : []), ...(repo !== undefined ? [`repo: ${repo}`] : [])];
  // A body that opens with a rule of its own is kept from being read as the card's frontmatter by a frontmatter before it.
  if (!frontmatter.length && body.startsWith('---')) frontmatter.push('# the idea below opens with a rule of its own');
  const card = `${frontmatter.length ? `---\n${frontmatter.join('\n')}\n---\n` : ''}${body}\n`;
  parseInboxCard(from, card, isDirectory);
  return { text: card, body };
}

/**
 * A card's text with `queued:` set to `at` — or taken off, for `null` — and `workflow:` written over its own when given: what `wf inbox queue`
 * writes. The frontmatter is written again in the keys' order, its comments dropped, as `wf inbox add` writes a card. Pure; the text it gives
 * reads back as a card (`parseInboxCard`), or is refused as one would be.
 */
export function queuedText(card: InboxCard, at: string | null, isDirectory: (at: string) => boolean, workflow?: string): string {
  const keys = { workflow: workflow ?? card.workflow, repo: card.repo, queued: at ?? undefined };
  const frontmatter = INBOX_KEYS.flatMap((key) => (keys[key] !== undefined ? [`${key}: ${keys[key]}`] : []));
  // A body that opens with a rule of its own is kept from being read as the card's frontmatter, as `ideaCard` keeps it.
  if (!frontmatter.length && card.body.startsWith('---')) frontmatter.push('# the idea below opens with a rule of its own');
  const text = `${frontmatter.length ? `---\n${frontmatter.join('\n')}\n---\n` : ''}${card.body}\n`;
  parseInboxCard(card.file, text, isDirectory);
  return text;
}

/**
 * Why `wf inbox queue` will not queue this card, in words that name the fix — or undefined, when it may. Pure. Refused: a card a run's record
 * names (`startedAs`), which is not started again (`startedRefusal`); a card already queued, with its place, and how to take it back; and a card
 * with no `workflow:` and none given — nothing would say what starts it, and `--workflow <w>` writes both.
 */
export function queueRefusal(card: InboxCard, where: string, startedAs: readonly string[], place: number | null, workflow?: string): string | undefined {
  if (startedAs.length) return startedRefusal(card, where, startedAs);
  if (card.queued !== undefined) {
    return `${card.file}: already queued, at ${card.queued}${place ? `, ${place} in the queue's order` : ''}: the tick starts it when its turn comes and a run slot is free. To queue it again, take it back first: wf inbox queue ${card.name} --off.`;
  }
  if (card.workflow === undefined && workflow === undefined) {
    return `${card.file}: no workflow — a queued card starts on its own, and nothing says what runs it. Queue it with its workflow: wf inbox queue ${card.name} --workflow <w> writes both.`;
  }
  return undefined;
}

/**
 * The name of the inbox card `at` names — a path under the inbox `dir`, as its path from there, less a trailing `.md`, so `<dir>/<name>` is
 * the card `wf inbox` lists as `<name>` — or null for a path outside it, and for the inbox itself: what makes `wf start <path>` start a card
 * out of the inbox. Both paths are taken as given; runner.ts resolves links first.
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
 * Why a card cannot be started on no workflow: it names none, and none was given — with the workflows the repository has to name one of, and
 * how. `where` is what `wf start` is given for the card.
 */
export function noWorkflowRefusal(card: Pick<InboxCard, 'file'>, where: string, repo: string, workflows: readonly string[]): string {
  const dir = path.join(repo, 'workflows');
  return `${card.file}: no workflow — the card names none, and none was given, so nothing says what runs it. `
    + (workflows.length
      ? `The repository's workflows are: ${workflows.join(', ')}, in ${dir}. Name one: wf start ${where} --workflows ${workflows[0]}, or write \`workflow: ${workflows[0]}\` in the card.`
      : `${dir} has no workflows. Give a workflow folder: wf start ${where} --workflows <dir>, or write \`workflow:\` in the card.`);
}

/**
 * Why a card is not started again: a run's record names it (`from`), so it was started, and is still in the inbox because its removal failed.
 * Started again, the idea would run twice.
 */
export function startedRefusal(card: Pick<InboxCard, 'name' | 'file'>, where: string, runs: readonly string[]): string {
  return `${card.file}: this card was started as ${runs.join(', ')} — ${runs.length === 1 ? 'that run\'s record says' : 'their records say'} so — and is still in the inbox because its removal failed. Drop it with wf inbox rm ${card.name}; to run the idea again, park it again under a name of its own first: wf inbox add ${where}.`;
}

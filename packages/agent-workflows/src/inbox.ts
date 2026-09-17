/**
 * An inbox is cards before they are started: `$WF_ROOT/inbox/`, beside `runs/`, one card per file — an idea parked where the work is
 * looked at, until a person starts it.
 *
 *     ---
 *     workflow: dev
 *     repo: /home/me/code/app
 *     ---
 *     Cache the engine's views between passes.
 *
 * A card in a plan's format (plan.ts), with two differences. `workflow:` is optional: an idea often does not know what will run it, and that
 * is chosen at start. `repo:` is a key of its own, optional too: the absolute path of the repository the idea is about, for a board that will
 * serve more than one. And an inbox card has no `after:`: what it waits on is said at start, when the runs it could wait on are known.
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
  /** Everything below the frontmatter: the idea, and its run's brief unless a brief given at start replaces it. */
  body: string;
};

/** Every key an inbox card may set, each optional. Anything else is refused by name — `after:` with where it is said instead. */
export const INBOX_KEYS = ['workflow', 'repo'] as const;

/** What each of an inbox card's keys means, in one line, in `INBOX_KEYS`' order: what the board shows beside a card's value. */
export const INBOX_KEY_MEANINGS: Readonly<Record<(typeof INBOX_KEYS)[number], string>> = {
  workflow: "what runs the card when it is started: a workflow's name under the repository's `workflows/`, or a path to a workflow folder; else the start names one",
  repo: 'the absolute path of the repository the idea is about: the repository the start is made in when unset',
};

function refuse(why: string): never {
  throw new WorkflowError(why);
}

/**
 * One inbox card, from its file's text — or refused, naming the file and the fix: a key an inbox card does not have (`after:` among them),
 * a key set twice or to nothing, a `repo:` that is not an absolute path or names no directory (`isDirectory`), an empty body, and a
 * frontmatter that never closes.
 */
export function parseInboxCard(file: string, text: string, isDirectory: (at: string) => boolean): InboxCard {
  const { block, body } = splitFrontmatter(file, text);
  const { repo, workflow } = block === null ? {} : inboxKeys(file, block);
  if (repo !== undefined && !path.isAbsolute(repo)) {
    refuse(`${file}: \`repo: ${repo}\` is not an absolute path. \`repo:\` is the repository the idea is about, from the root — \`repo: /home/me/code/app\` — since a relative one would name a different repository from wherever the card is started.`);
  }
  if (repo !== undefined && !isDirectory(repo)) {
    refuse(`${file}: \`repo: ${repo}\` names no directory. Correct it to the repository the idea is about, or delete the line, and the card is started on the repository its start names.`);
  }
  return {
    name: file.slice(0, -'.md'.length),
    file,
    ...(workflow !== undefined ? { workflow } : {}),
    ...(repo !== undefined ? { repo } : {}),
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
    : `${file}: \`${key}\` is not a key an inbox card has. An inbox card's keys are: ${INBOX_KEYS.join(', ')}, each optional — what runs it, and the repository it is about; how its steps run is its workflow's to say. Correct the spelling or delete the line — a key nothing reads is a constraint nobody enforces.`));
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
};

/**
 * The inbox as `wf inbox` lists it, by file name: every entry of the folder — a folder inside it by its name and a trailing `/` — each card
 * with the runs its name is on (`startedAs`), and each entry that is not a card listed with why, never hidden. A hidden file and a README are
 * not listed: the one is an editor's, the other says what the folder is for.
 */
export function inboxListing(files: readonly PlanFile[], runs: readonly Pick<Run, 'id' | 'from'>[], isDirectory: (at: string) => boolean): InboxListing[] {
  return files
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
        return { name, file, title: card.body.split('\n')[0]!, workflow: card.workflow ?? null, repo: card.repo ?? null, startedAs, error: null };
      } catch (err) {
        return { name, file, title: null, workflow: null, repo: null, startedAs, error: (err as Error).message };
      }
    });
}

/**
 * What `wf inbox` prints, a line per entry: the card's name, the first line of its body, its workflow and repository when it names them, and
 * the runs it was started as — or, for an entry that does not read as a card, why.
 */
export function inboxLines(listing: readonly InboxListing[]): string[] {
  const width = Math.max(0, ...listing.map((l) => l.name.length));
  return listing.map((l) => {
    const started = l.startedAs.length ? `  started as ${l.startedAs.join(', ')}` : '';
    if (l.error !== null) return `${l.name.padEnd(width)}  ${l.error}${started}`;
    return `${l.name.padEnd(width)}  ${l.title!.slice(0, 56).trimEnd()}${l.workflow ? `  workflow: ${l.workflow}` : ''}${l.repo ? `  repo: ${l.repo}` : ''}${started}`;
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
  let keys: { workflow?: string; repo?: string } = {};
  let body = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim();
  let split: { block: string | null; body: string } | undefined;
  try { split = splitFrontmatter(from, text); } catch { /* a rule that never closes: the text is the body */ }
  const lines = (split?.block ?? '').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const isCardLine = (line: string) => line.indexOf(':') > 0 && ([...INBOX_KEYS, 'after'] as string[]).includes(line.slice(0, line.indexOf(':')).trim());
  if (split && lines.length && lines.every(isCardLine)) {
    // Its keys, to be written over; whether what they say holds is asked of the card written, below.
    keys = inboxKeys(from, split.block!, true);
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

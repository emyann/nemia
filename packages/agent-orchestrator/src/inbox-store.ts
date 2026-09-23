/**
 * The inbox on disk: its cards read (`readInbox`), filed (`addToInbox`), queued and taken back (`queueInInbox`), dropped
 * (`dropFromInbox`), a path named as a card (`inboxNameAt`), and the queue's files — the tries the tick wrote down of a queued card's start
 * (`queueDir`, `queueTries`). The judgement is `inbox.ts`'s; this reads and writes.
 *
 * Beneath `runner.ts`, beside `store.ts`: it imports neither the engine nor `runner.ts`, which re-exports what it exported of this before.
 * A card's start — `startFromInbox`, and `startQueued`, the tick's — starts a run, and stays there, beside `start`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ideaCard, inboxListing, inboxNameOf, inboxNameRefusal, noCardLine, parseInboxCard, queueOrder, queuedText, queueRefusal, type InboxCard, type InboxListing, type QueueTry } from './inbox.ts';
import { workRoot } from './places.ts';
import { isFolderTeam, WorkflowError, type Workflow } from './workflow.ts';
import { loadWorkflows, workflowFolder } from './workflow-store.ts';
import { HOME, inboxDir, isDirectory, listRuns, runId, runsDir } from './store.ts';

/** The inbox's entries as the pure half takes a folder's: a folder by its name and a trailing `/`, a markdown file with its text. None when there is no inbox yet. */
export function inboxFiles(): Array<{ file: string; text: string }> {
  let names: string[];
  try { names = fs.readdirSync(inboxDir()); } catch { return []; }
  return names.map((name) => {
    const at = path.join(inboxDir(), name);
    if (isDirectory(at)) return { file: `${name}/`, text: '' };
    try { return { file: name, text: name.endsWith('.md') ? fs.readFileSync(at, 'utf8') : '' }; } catch { return { file: name, text: '' }; }
  });
}

/** The names of the inbox's cards, as `wf inbox` lists them. */
export const inboxCards = (): string[] => inboxListing(inboxFiles(), [], () => true).filter((l) => l.file.endsWith('.md')).map((l) => l.name);

/**
 * Where the tick writes down a queued card's start it tried and did not make (`QueueTry`): `$WF_ROOT/queue/<name>.json`, outside the inbox, which
 * is a person's. The tick is its one writer: it writes one when a start does not happen, and removes it once the card is no longer queued as it
 * was — started, taken back, dropped or edited.
 */
export const queueDir = (): string => path.join(HOME, 'queue');

/** The tries the tick has written down, by card name. A file that does not read as one is none: the card is tried, and written again. */
export function queueTries(): Map<string, QueueTry> {
  const tries = new Map<string, QueueTry>();
  let names: string[];
  try { names = fs.readdirSync(queueDir()).filter((n) => n.endsWith('.json')); } catch { return tries; }
  for (const file of names) {
    try {
      const r = JSON.parse(fs.readFileSync(path.join(queueDir(), file), 'utf8')) as Partial<QueueTry>;
      if (typeof r.at === 'string' && typeof r.text === 'string' && typeof r.repo === 'string' && typeof r.why === 'string' && typeof r.refused === 'boolean') {
        tries.set(file.slice(0, -'.json'.length), { at: r.at, text: r.text, repo: r.repo, why: r.why, refused: r.refused });
      }
    } catch { /* torn, or removed since the listing */ }
  }
  return tries;
}

/**
 * `wf inbox`: every card in the inbox, by name, with the runs a record says it was started as (`inboxListing`) — and every entry that does not
 * read as a card, with why. The run records are read for their `from`, so a card whose removal failed after its start is listed as started; and
 * the tick's tries, so a queued card whose start was refused, or failed, says why.
 */
export const readInbox = (): InboxListing[] => inboxListing(inboxFiles(), listRuns(), isDirectory, queueTries());

/**
 * Why a card may not name a repository, or null: `repo:` is the repository a run started from the card works on, and a team whose every step
 * says `workspace: folder` works on none — the card would keep on disk a path no run of it will ever look at.
 *
 * Refused wherever a card's `workflow:` is written — `addToInbox` (`wf inbox add`, and the board's Inbox) and `queueInInbox`
 * (`wf inbox queue --workflow`, which writes that key over the card's own) — in the words `wf start --repo` is refused in: the same
 * sentence about the same lie, wherever it is told. A card already on disk is another matter — there is no way to edit one from the
 * board, and refusing its start, or its plain re-queue, would strand it — so its `repo:` is ignored and said
 * (`InboxStarted.ignoredRepo`).
 *
 * Silent when there is no repository to judge, when the card names no workflow, and when the workflow cannot be read from here: what a card
 * names is the start's to refuse, in the start's words, and a folder that does not load says so there.
 */
function cardRepoRefusal(opts: { workflow?: string; repo?: string; dir?: string }): string | null {
  if (opts.repo === undefined || opts.workflow === undefined) return null;
  let steps: readonly Workflow[];
  try {
    steps = loadWorkflows(workflowFolder(opts.workflow, opts.dir ?? process.cwd(), opts.repo));
  } catch {
    return null;
  }
  if (!isFolderTeam(steps)) return null;
  return `--repo ${opts.repo}: this card's workflow has steps that say \`workspace: folder\`, so a run started from it works in folders it makes under ${workRoot(runsDir(), '<run>')}, with no git repository, and would never look at ${opts.repo}.\n`
    + `File the card without a repository, or name a workflow whose steps work on one.`;
}

/**
 * `wf inbox add`: an idea filed as a card (`ideaCard`), under the slug `runId` makes of its body's first line, suffix and all, so two ideas
 * alike are two cards. `text` is a note, or a file's text; `from` is what a refusal calls it; `dir` is the folder a path in the text's own
 * `workflow:` is read from — the file's — and it is written absolute (`ideaCard`). `workflow` and `repo` are written as the card's keys, over
 * the text's own: `repo` an absolute path to a directory, `workflow` a name or an absolute path (`workflowAt`), as a start would be given it.
 */
export function addToInbox(opts: { text: string; from?: string; dir?: string; workflow?: string; repo?: string }): { card: InboxCard; file: string } {
  const refusedRepo = cardRepoRefusal(opts);
  if (refusedRepo) throw new WorkflowError(refusedRepo);
  const { text, body } = ideaCard(opts.from ?? 'the idea', opts.text, { workflow: opts.workflow, repo: opts.repo }, isDirectory, opts.dir);
  fs.mkdirSync(inboxDir(), { recursive: true });
  for (;;) {
    const name = runId(body.split('\n')[0]!);
    const file = path.join(inboxDir(), `${name}.md`);
    try {
      // `wx`: a name already taken is drawn again, never written over.
      fs.writeFileSync(file, text, { flag: 'wx' });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') continue;
      throw err;
    }
    return { card: parseInboxCard(`${name}.md`, text, isDirectory), file };
  }
}

/** What `wf inbox queue` did: the card as it now reads, its file, and — once queued — its place in the queue's order and how many are in it. */
export type InboxQueued = { card: InboxCard; file: string; place?: number; of?: number; was: 'queued' | 'taken back' | 'not queued' };

/**
 * `wf inbox queue <name>`: the card marked to start on its own, `queued:` the time now, and `workflow:` written over its own when given; `off`
 * takes the mark back. The card's file is written whole, through a hidden file renamed over it, so a pass never reads half a card — and the
 * file keeps the time it was last written, since the rename would give it the time of the queue, and a card has no filing time of its own but
 * its mtime: a board orders its cards by it, and a card queued or taken back would jump to the top of the list. A queue is no edit of the idea.
 *
 * Refused by name, exit 2, before anything is written: a name that is not a card's (`inboxNameRefusal`), a name with no card — naming the cards
 * there are — a card that does not read, and what `queueRefusal` refuses: a card a run's record names, one already queued, and one with no
 * workflow and none given. `off` on a card not queued writes nothing, and says so.
 */
export function queueInInbox(name: string, how: { off?: boolean; workflow?: string } = {}): InboxQueued {
  const refused = inboxNameRefusal(name);
  if (refused) throw new WorkflowError(refused);
  const file = path.join(inboxDir(), `${name}.md`);
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    throw new WorkflowError(`${noCardLine(name, inboxCards())} Queue one of those — wf inbox queue <name> — or park the idea first: wf inbox add "<idea>".`);
  }
  // Taken back whatever its `repo:` names: a card whose repository is gone leaves the queue as any card does, and is listed with why.
  const exists = how.off ? () => true : isDirectory;
  const card = parseInboxCard(`${name}.md`, text, exists);
  if (how.off && card.queued === undefined) return { card, file, was: 'not queued' };
  if (!how.off) {
    const listing = readInbox();
    const why = queueRefusal(card, file, listing.find((l) => l.name === name)?.startedAs ?? [], listing.find((l) => l.name === name)?.queued?.place ?? null, how.workflow);
    if (why) throw new WorkflowError(why);
  }
  // `--workflow` writes that key over the card's own — queued or taken off the queue, `queuedText` below writes it either way — which
  // makes this a writer of the pair a card's `repo:` is judged against: a card filed with a repository is not put onto a folder team,
  // to start on a repository no step of it looks at. With no `--workflow` nothing is refused — the card is as it was, and a card on disk
  // cannot be edited from the board.
  if (how.workflow !== undefined) {
    const refusedRepo = cardRepoRefusal({ workflow: how.workflow, repo: card.repo });
    if (refusedRepo) throw new WorkflowError(refusedRepo);
  }
  const written = queuedText(card, how.off ? null : new Date().toISOString(), exists, how.workflow);
  // When the card was last written, to set back over the rename below: the card's filing time, as a board reads it.
  const filed = fs.statSync(file, { throwIfNoEntry: false })?.mtime;
  const hidden = path.join(inboxDir(), `.${name}.md.${process.pid}`);
  fs.writeFileSync(hidden, written);
  fs.renameSync(hidden, file);
  if (filed) {
    try {
      fs.utimesSync(file, filed, filed);
    } catch {
      // The queue is written all the same: the card lists at the time of the queue, until it is written again.
    }
  }
  const now = parseInboxCard(`${name}.md`, written, exists);
  if (how.off) return { card: now, file, was: 'taken back' };
  const order = queueOrder(readInbox());
  const place = order.findIndex((l) => l.name === name) + 1;
  return { card: now, file, ...(place ? { place } : {}), of: order.length, was: 'queued' };
}

/** What `wf inbox rm` did: the card's file removed, or no card of that name, and the cards the inbox has. */
export type InboxDropped = { removed: true; file: string } | { removed: false; cards: string[] };

/**
 * `wf inbox rm`: a card dropped without being started. Refused, exit 2, for a name that is not a card's (`inboxNameRefusal`). A name with no
 * card is normal — dropped already, or never filed — and says which cards there are.
 */
export function dropFromInbox(name: string): InboxDropped {
  const refused = inboxNameRefusal(name);
  if (refused) throw new WorkflowError(refused);
  const file = path.join(inboxDir(), `${name}.md`);
  try {
    fs.rmSync(file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { removed: false, cards: inboxCards() };
    throw Object.assign(new Error(`wf inbox rm: ${file} could not be removed — ${(err as Error).message}. Nothing was dropped: remove the file by hand, or fix what stops it and drop it again.`), { exitCode: 1 });
  }
  return { removed: true, file };
}

/**
 * The name of the inbox card `given` is a path to — any path under the inbox, `<inbox>/<name>.md` or `<inbox>/<name>`, links resolved on the
 * way to both (`inboxNameOf`) — or null for a path outside it, and for text: what makes `wf start <path>` go through `startFromInbox`. A card
 * not there is still a card's path, refused by name at start.
 */
export function inboxNameAt(given: string): string | null {
  const real = (at: string): string => { try { return fs.realpathSync(at); } catch { return at; } };
  const at = path.resolve(given);
  return inboxNameOf(path.join(real(path.dirname(at)), path.basename(at)), real(inboxDir()));
}

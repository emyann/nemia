/**
 * The inbox's verbs: its cards read (`readInbox`), filed (`addToInbox`), queued and taken back (`queueInInbox`), dropped
 * (`dropFromInbox`), and a path named as a card (`inboxNameAt`), each card and each try the tick wrote down of a queued card's start read
 * and written through `runStore.inbox` (`files.store.ts`). The judgement is `inbox.ts`'s.
 *
 * Beneath the controllers, beside `files.store.ts`: it imports neither the engine nor a controller, and `runner.ts` re-exports what the
 * package exports of it. A card's start — `startFromInbox`, and `startQueued`, the tick's — starts a run, and
 * is `inbox.verb.ts`'s, through `startRun`.
 */
import {
  ideaCard,
  inboxListing,
  inboxNameRefusal,
  noCardLine,
  parseInboxCard,
  queueOrder,
  queuedText,
  queueRefusal,
  type InboxCard,
  type InboxListing,
} from './inbox.ts';
import { queueFactoryRefusal } from './queue-factory.ts';
import { Conflict, Missing } from '../refusal/refusal.ts';
import { workRoot } from '../record/places.store.ts';
import { WorkflowError, type Workflow } from '../step/step.ts';
import { isFolderTeam } from '../workflow/index.ts';
import { loadWorkflows, workflowFolder } from '../folder/folder.store.ts';
import { defaultStartsAllowed, factoryNames, treeOf } from '../factory/factory.store.ts';
import { HOME, isDirectory, runId, runsDir } from '../record/record.store.ts';
import { runStore } from '../record/files.store.ts';

/** The names of the inbox's cards, as `nemia inbox` lists them. */
export const inboxCards = (): string[] =>
  inboxListing(runStore.inbox.entries(), [], () => true)
    .filter((l) => l.file.endsWith('.md'))
    .map((l) => l.name);

/**
 * `nemia inbox`: every card in the inbox, by name, with the runs a record says it was started as (`inboxListing`) — and every entry that
 * does not read as a card, with why. The run records are read for their `from`, so a card whose removal failed after its start is listed as
 * started; and the tick's tries, so a queued card whose start was refused, or failed, says why.
 */
export const readInbox = (): InboxListing[] =>
  inboxListing(runStore.inbox.entries(), runStore.runs.list(), isDirectory, runStore.inbox.tries());

/**
 * Why a card may not name a repository, or null: `repo:` is the repository a run started from the card works on, and a team whose every
 * step says `place: folder` works on none — the card would keep on disk a path no run of it will ever look at.
 *
 * Refused wherever a card's `workflow:` is written — `addToInbox` (`nemia inbox add`, and the board's Inbox) and `queueInInbox`
 * (`nemia inbox queue --workflow`, which writes that key over the card's own) — in the words `nemia start --repo` is refused in: the same
 * sentence about the same lie, wherever it is told. A card already on disk is another matter — there is no way to edit one from the
 * board, and refusing its start, or its plain re-queue, would strand it — so its `repo:` is ignored and said
 * (`InboxStarted.ignoredRepo`).
 *
 * The workflow is looked for as its start would look: in the tree of the card's factory first, where it is made from a template. Silent
 * when there is no repository to judge, when the card names no workflow, and when the workflow cannot be read from here: what a card
 * names is the start's to refuse, in the start's words, and a folder that does not load says so there.
 */
function cardRepoRefusal(opts: { workflow?: string; repo?: string; dir?: string; factory?: string }): string | null {
  if (opts.repo === undefined || opts.workflow === undefined) return null;
  let steps: readonly Workflow[];
  try {
    steps = loadWorkflows(workflowFolder(opts.workflow, opts.dir ?? process.cwd(), opts.repo, treeOf(opts.factory)), {
      repo: opts.repo,
      home: HOME,
    });
  } catch {
    return null;
  }
  if (!isFolderTeam(steps)) return null;
  return (
    `--repo ${opts.repo}: this card's workflow has steps that say \`place: folder\`, so a run started from it works in folders it makes under ${workRoot(runsDir(), '<run>')}, with no git repository, and would never look at ${opts.repo}.\n` +
    `File the card without a repository, or name a workflow whose steps work on one.`
  );
}

/**
 * `nemia inbox add`: an idea filed as a card (`ideaCard`), under the slug `runId` makes of its body's first line, suffix and all, so two
 * ideas alike are two cards, and a name already taken is drawn again, never written over. `text` is a note, or a file's text; `from` is
 * what a refusal calls it; `dir` is the folder a path in the text's own `workflow:` is read from — the file's — and it is written absolute
 * (`ideaCard`). `workflow`, `repo` and `factory` are written as the card's keys, over the text's own: `repo` an absolute path to a
 * directory, `workflow` a name or an absolute path (`workflowAt`), as a start would be given it, and `factory` a factory's name, whose
 * factory the start judges.
 */
export function addToInbox(opts: { text: string; from?: string; dir?: string; workflow?: string; repo?: string; factory?: string }): {
  card: InboxCard;
  file: string;
} {
  const refusedRepo = cardRepoRefusal(opts);
  if (refusedRepo) throw new WorkflowError(refusedRepo);
  const given = { workflow: opts.workflow, repo: opts.repo, factory: opts.factory };
  const { text, body } = ideaCard(opts.from ?? 'the idea', opts.text, given, isDirectory, opts.dir);
  for (;;) {
    const name = runId(body.split('\n')[0]);
    if (!runStore.inbox.add(`${name}.md`, text)) continue;
    return { card: parseInboxCard(`${name}.md`, text, isDirectory), file: runStore.inbox.where(`${name}.md`) };
  }
}

/**
 * What `nemia inbox queue` did: the card as it now reads, its file, and — once queued — its place in the queue's order and how many are in
 * it.
 */
export type InboxQueued = { card: InboxCard; file: string; place?: number; of?: number; was: 'queued' | 'taken back' | 'not queued' };

/** A queue `queueRefusal` refused, by its kind: a card a run's record names, or one already queued, is a `Conflict`; the rest `Invalid`. */
const queueRefused = (why: string, card: InboxCard, startedAs: readonly string[]): Conflict | WorkflowError =>
  startedAs.length || card.queued !== undefined ? new Conflict({ message: why }) : new WorkflowError(why);

/**
 * Throws what refuses the queue of `card`, in `file`, on `workflow` when one is given: `queueRefusal`'s reasons by their kind
 * (`queueRefused`), then its factory's (`queueFactoryRefusal`), an `Invalid`, by the factories on file and `defaultStartsAllowed`.
 */
function refuseQueue(card: InboxCard, file: string, workflow: string | undefined): void {
  const listed = readInbox().find((l) => l.name === card.name);
  const startedAs = listed?.startedAs ?? [];
  const why = queueRefusal(card, file, startedAs, listed?.queued?.place ?? null, workflow);
  if (why) throw queueRefused(why, card, startedAs);
  const whyFactory = queueFactoryRefusal(card, file, factoryNames(), defaultStartsAllowed());
  if (whyFactory) throw new WorkflowError(whyFactory);
}

/**
 * `nemia inbox queue <name>`: the card marked to start on its own, `queued:` the time now, and `workflow:` written over its own when given;
 * `off` takes the mark back, whatever the card's `repo:` names: a card whose repository is gone leaves the queue as any card does. The
 * card's file is written whole, through a hidden file renamed over it, so a pass never reads half a card — and the file keeps the time it
 * was last written, as the rename would give it the time of the queue, and a card has no filing time of its own but its mtime: a board
 * orders its cards by it, and a card queued or taken back would jump to the top of the list. A queue is no edit of the idea. When that time
 * cannot be set back, the queue is written all the same.
 *
 * Refused by name, exit 2, before anything is written: a name that is not a card's (`inboxNameRefusal`), a name with no card (`Missing`) —
 * naming the cards there are — a card that does not read, and what `queueRefusal` refuses: a card a run's record names and one already
 * queued (`Conflict`), and one with no workflow and none given; then a card that names no factory, unless `defaultStartsAllowed`, or names
 * the default one (`refuseQueue`), which `off` never asks. A `workflow` given, queued or taken back, is written over the card's own,
 * and refused onto a folder team for a card that names a repository (`cardRepoRefusal`); with none given, the card's `repo:` is not judged.
 * `off` on a card not queued writes nothing, and says so.
 */
export function queueInInbox(name: string, how: { off?: boolean; workflow?: string } = {}): InboxQueued {
  const refused = inboxNameRefusal(name);
  if (refused) throw new WorkflowError(refused);
  const file = runStore.inbox.where(`${name}.md`);
  const text = runStore.inbox.read(`${name}.md`);
  if (text === null) {
    throw new Missing({
      message: `${noCardLine(name, inboxCards())} Queue one of those — nemia inbox queue <name> — or park the idea first: nemia inbox add "<idea>".`,
    });
  }
  const exists = how.off ? () => true : isDirectory;
  const card = parseInboxCard(`${name}.md`, text, exists);
  if (how.off && card.queued === undefined) return { card, file, was: 'not queued' };
  if (!how.off) refuseQueue(card, file, how.workflow);
  if (how.workflow !== undefined) {
    const refusedRepo = cardRepoRefusal({ workflow: how.workflow, repo: card.repo, factory: card.factory });
    if (refusedRepo) throw new WorkflowError(refusedRepo);
  }
  const written = queuedText(card, how.off ? null : new Date().toISOString(), exists, how.workflow);
  runStore.inbox.rewrite(`${name}.md`, written);
  const now = parseInboxCard(`${name}.md`, written, exists);
  if (how.off) return { card: now, file, was: 'taken back' };
  const order = queueOrder(readInbox());
  const place = order.findIndex((l) => l.name === name) + 1;
  return { card: now, file, ...(place ? { place } : {}), of: order.length, was: 'queued' };
}

/** What `nemia inbox rm` did: the card's file removed, or no card of that name, and the cards the inbox has. */
export type InboxDropped = { removed: true; file: string } | { removed: false; cards: string[] };

/**
 * `nemia inbox rm`: a card dropped without being started. Refused, exit 2, for a name that is not a card's (`inboxNameRefusal`). A name
 * with no card is normal — dropped already, or never filed — and says which cards there are.
 */
export function dropFromInbox(name: string): InboxDropped {
  const refused = inboxNameRefusal(name);
  if (refused) throw new WorkflowError(refused);
  const file = runStore.inbox.where(`${name}.md`);
  try {
    if (!runStore.inbox.drop(`${name}.md`)) return { removed: false, cards: inboxCards() };
  } catch (err) {
    throw Object.assign(
      new Error(
        `nemia inbox rm: ${file} could not be removed — ${(err as Error).message}. Nothing was dropped: remove the file by hand, or fix what stops it and drop it again.`,
      ),
      { exitCode: 1 },
    );
  }
  return { removed: true, file };
}

/**
 * The name of the inbox card `given` is a path to, as the store reads it (`runStore.inbox.nameAt`) — any path under the inbox, links
 * resolved — or null for a path outside it, and for text: what makes `nemia start <path>` go through `startFromInbox`. A card not there
 * is still a card's path, refused by name at start.
 */
export const inboxNameAt = (given: string): string | null => runStore.inbox.nameAt(given);

/**
 * Starting an inbox card (`startFromInbox`) and the queue's next card (`startQueued`, which the tick calls), each through `start`, then
 * taking the card out of the inbox. A controller: it reaches the runtime through `start/start.verb.ts`.
 */
import path from 'node:path';
import { WorkflowError } from '../step/step.ts';
import { loadWorkflows, workflowFolder, workflowsIn } from '../folder/folder.store.ts';
import {
  inboxListing,
  inboxNameRefusal,
  nextQueued,
  noCardLine,
  noWorkflowRefusal,
  parseInboxCard,
  startedRefusal,
  type InboxCard,
  type QueueStarted,
  type QueueTry,
} from './inbox.ts';
import { gateRefusal } from '../ending/ending.ts';
import { isGitRun, type Run } from '../record/record.ts';
import { isDirectory } from '../record/record.store.ts';
import { inboxDir, runStore } from '../record/files.store.ts';
import { inboxCards } from './inbox.store.ts';
import { placesOf, start } from '../start/start.verb.ts';
import { Conflict, Missing } from '../refusal/refusal.ts';

/** How to start an inbox card (`startFromInbox`): the card, and what its start says over it or beside it. */
export type InboxStart = {
  /** The card's name, as `wf inbox` lists it. */
  name: string;
  /** What the run is asked to do, in place of the card's body: the note rewritten into work. The card's body when left out. */
  brief?: string;
  /** The workflow, over the card's `workflow:`: a folder — from `from` when relative — or a name under the repository's `workflows/`. */
  workflow?: string;
  /** Where a relative `workflow` is read from: where `wf start` was typed. The current directory when left out. */
  from?: string;
  /**
   * The repository, over the card's `repo:`: named by a person at start (`wf start <card> --repo`), and refused as `start()` refuses it for
   * a team that says `workspace: folder`. The card's own `repo:` is not: the board writes one on every card it files, so a folder team
   * takes it as it takes the directory `wf start` is typed in, and never looks at it.
   */
  repo?: string;
  /** The repository when neither `repo` nor the card names one: `wf start`'s `.`, or the board's own. */
  callerRepo: string;
  /** The runs it waits on (`wf start --after`): an inbox card has no `after:`, so it is said here, at start. */
  after?: readonly string[];
  isolate?: boolean;
  inputs?: readonly string[];
  /** The steps its run is gated at (`wf start --gate`), beside the card's own `gate:`. */
  gates?: readonly string[];
};

/**
 * What `startFromInbox` did: the run, the card it started, and whether the card left the inbox — and, when not, why.
 *
 * `ignoredRepo` is the card's own `repo:` when the run looks at no repository: a folder team's does not, and a card written by hand, or
 * by a writer that does not ask `cardRepoRefusal`, may carry one. The run is started all the same, and the line says the path was not
 * looked at: said, not refused, since a card on disk cannot be edited from the board. A `repo` a person gives for such a team is refused by
 * `start()`.
 */
export type InboxStarted = ({ run: Run; card: InboxCard; removed: true } | { run: Run; card: InboxCard; removed: false; why: string }) & {
  ignoredRepo?: string;
};

/**
 * `wf start <inbox>/<name>.md`, and the board's start of a card: a card out of the inbox started with `start()`, `from: { inbox: <name> }`
 * on its record, then removed from the inbox.
 *
 * The brief is `brief`, or else the card's body. The workflow is `workflow`, else the card's `workflow:` — found from the inbox folder as
 * `wf plan` finds a card's from its plan folder: a name under the repository's `workflows/`, or a path — else refused, naming the
 * repository's workflows. The repository is `repo`, else the card's `repo:`, else `callerRepo`. The run is gated at the card's `gate:` and
 * at `gates`, the card's first; a step both name is gated once.
 *
 * The record is written first, so a removal that fails leaves a card `wf inbox` lists as started — never a run with no trace of its card.
 * It says so in `why`, and the card is not started again (`startedRefusal`) until a person drops it. Refused by name before anything is
 * written, exit 2: a name that is not a card's (`inboxNameRefusal`), a card not there (`Missing`) — naming the cards there are — a card
 * that does not read, a card already started (`Conflict`), no workflow, a workflow that does not load behind the card, a `gate:` naming no
 * step of it, in the card's words, and a `brief` with nothing in it; and whatever `start()` refuses — an `--after`, an `--input`, a
 * `--gate` — as it refuses it.
 */
export function startFromInbox(opts: InboxStart): InboxStarted {
  const refused = inboxNameRefusal(opts.name);
  if (refused) throw new WorkflowError(refused);
  const file = runStore.inbox.where(`${opts.name}.md`);
  const text = runStore.inbox.read(`${opts.name}.md`);
  if (text === null) {
    throw new Missing({
      message: `${noCardLine(opts.name, inboxCards())} Start one of those — wf start ${runStore.inbox.where('<name>.md')} — or park the idea first: wf inbox add "<idea>".`,
    });
  }
  const card = parseInboxCard(`${opts.name}.md`, text, isDirectory);
  const started = runStore.runs
    .list()
    .filter((r) => r.from?.inbox === card.name)
    .map((r) => r.id);
  if (started.length) throw new Conflict({ message: startedRefusal(card, file, started) });

  const repo = opts.repo ?? card.repo ?? opts.callerRepo;
  let workflowDir: string;
  if (opts.workflow !== undefined) workflowDir = workflowFolder(opts.workflow, opts.from ?? process.cwd(), repo);
  else if (card.workflow !== undefined) {
    try {
      workflowDir = workflowFolder(card.workflow, inboxDir(), repo);
    } catch (err) {
      throw new WorkflowError(`${card.file}: \`workflow: ${card.workflow}\` — ${(err as Error).message}`);
    }
  } else throw new WorkflowError(noWorkflowRefusal(card, file, repo, workflowsIn(path.join(repo, 'workflows'))));
  if (opts.brief !== undefined && !opts.brief.trim()) {
    throw new WorkflowError(
      `${card.file}: the brief given in place of the card's body is empty. Give what the run is asked to do, or leave it out, and the run is asked what the card says.`,
    );
  }
  const flags = opts.gates ?? [];
  if (card.gate !== undefined) {
    const refusedGate = gateRefusal([card.gate], loadWorkflows(workflowDir, placesOf(repo)), (step) => `${card.file}: \`gate: ${step}\``);
    if (refusedGate) throw new WorkflowError(`${refusedGate} Correct the line, or delete it.`);
  }
  const gates = [...(card.gate !== undefined && !flags.includes(card.gate) ? [card.gate] : []), ...flags];

  const run = start({
    brief: opts.brief?.trim() ?? card.body,
    repo,
    repoNamed: opts.repo !== undefined,
    workflowDir,
    isolate: opts.isolate,
    after: opts.after,
    inputs: opts.inputs,
    from: { inbox: card.name },
    ...(gates.length ? { gates } : {}),
  });
  const ignoredRepo = card.repo !== undefined && !isGitRun(run) ? { ignoredRepo: card.repo } : {};
  try {
    runStore.inbox.drop(`${opts.name}.md`);
  } catch (err) {
    return { run, card, removed: false, why: `${file} could not be removed — ${(err as Error).message}`, ...ignoredRepo };
  }
  return { run, card, removed: true, ...ignoredRepo };
}

/**
 * The queue's next card started (`nextQueued`), one try: through `startFromInbox`, with the card's `workflow:` and its `repo:` or else
 * `repo`, the daemon's — so its base is its base branch as it is now, and its brief is frozen now. Undefined with no card to start. A card
 * whose `repo:` the run looks at none of — a folder team's — carries it on `ignoredRepo`, as `wf start` says it: a tick's line
 * (`queueLine`) is the only place a daemon's start is read. The result names the repository (`on`) only for a card that names none, whose
 * start turns on where the daemon runs.
 *
 * A start that does not happen is written down (`QueueTry`), and the card left as it is. A refusal — exit 2, the package's own, by name:
 * the workflow gone, the repository gone — lasts: no pass after it tries the card while it reads the same and would be tried on the same
 * repository, and the next card has its turn. Any other failure — git failing on the repository, say — is no verdict on the card: the next
 * pass tries it again, where it keeps its place, and a failure the same as the last pass's is said as `again`, and not written again. A
 * failure is said on one line, its lines joined by ` / `; a try that cannot be written is said all the same, and the next pass tries the
 * card again. The inbox and the tries are read once. A try written for a card that is no longer queued as it was is removed on the way, or
 * on a later pass when it cannot be.
 */
export function startQueued(repo: string, runs: readonly Run[] = runStore.runs.list()): QueueStarted | undefined {
  const files = runStore.inbox.entries();
  const tries = runStore.inbox.tries();
  const listing = inboxListing(files, runs, isDirectory, tries);
  for (const name of tries.keys()) {
    if (listing.some((l) => l.name === name && l.tried)) continue;
    try {
      runStore.inbox.dropTry(name);
    } catch {}
  }
  const next = nextQueued(listing, repo);
  if (!next) return undefined;
  const on = next.repo ?? repo;
  const where = next.repo ? {} : { on };
  try {
    const started = startFromInbox({ name: next.name, callerRepo: repo });
    const ignored = started.ignoredRepo !== undefined ? { ignoredRepo: started.ignoredRepo } : {};
    return started.removed
      ? { card: next.name, run: started.run.id, removed: true, ...ignored }
      : { card: next.name, run: started.run.id, removed: false, why: started.why, ...ignored };
  } catch (err) {
    const refused = (err as { exitCode?: number }).exitCode === 2;
    const why = (err instanceof Error ? err.message : String(err))
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join(' / ');
    const last = next.tried;
    if (!refused && last && !last.refused && last.why === why && last.repo === on)
      return { card: next.name, failed: why, again: true, ...where };
    const tried: QueueTry = { at: new Date().toISOString(), text: files.find((f) => f.file === next.file)!.text, repo: on, why, refused };
    try {
      runStore.inbox.putTry(next.name, tried);
    } catch {}
    return refused ? { card: next.name, refused: why, ...where } : { card: next.name, failed: why, again: false, ...where };
  }
}

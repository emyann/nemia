/**
 * Starting an inbox card (`startFromInbox`) and the queue's next card (`startQueued`, which the tick calls), each through `startRun`, then
 * taking the card out of the inbox. A controller: Effect programs, which reach the runtime through `start/start.verb.ts`.
 */
import path from 'node:path';
import { Cause, Effect, Exit } from 'effect';
import { WorkflowError } from '../step/step.ts';
import { loadWorkflows, workflowFolder, workflowsIn } from '../folder/folder.store.ts';
import {
  fromText,
  inboxListing,
  inboxNameRefusal,
  nextQueued,
  queueOrder,
  queueRepo,
  queuedText,
  noCardLine,
  noWorkflowRefusal,
  parseInboxCard,
  startedRefusal,
  unfactoredCardRefusal,
  type InboxCard,
  type InboxListing,
  type QueueStarted,
  type MissedStart,
} from './inbox.ts';
import { gateRefusal } from '../ending/ending.ts';
import { isRepositoryRun, type Run } from '../record/record.ts';
import { isDirectory } from '../record/record.store.ts';
import { inboxDir, runStore } from '../record/files.store.ts';
import { inboxCards, readableFactories } from './inbox.store.ts';
import { repoFor, startRun } from '../start/start.verb.ts';
import { contextRefusal } from '../start/index.ts';
import { placesOf } from '../folder/lookup.store.ts';
import { defaultStartsAllowed, factoryNames, treeOf } from '../factory/factory.store.ts';
import { DEFAULT_FACTORY, defaultStartRefusal } from '../factory/factory.ts';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';

/** How to start an inbox card (`startFromInbox`): the card, and what its start says over it or beside it. */
export type InboxStart = {
  /** The card's name, as `nemia inbox` lists it. */
  name: string;
  /** What the run is asked to do, in place of the card's body: the note rewritten into work. The card's body when left out. */
  brief?: string;
  /** The workflow, over the card's `workflow:`: a folder — from `from` when relative — or a name under the repository's `workflows/`. */
  workflow?: string;
  /** Where a relative `workflow` is read from: where `nemia start` was typed. The current directory when left out. */
  from?: string;
  /**
   * The repository, over the card's `repo:`: named by a person at start (`nemia start <card> --repo`), and refused as `start()` refuses it
   * for a team that says `place: folder`. The card's own `repo:` is not: the board writes one on every card it files, so a folder team
   * takes it as it takes the directory `nemia start` is typed in, and never looks at it.
   */
  repo?: string;
  /** The repository when neither `repo`, the card nor its factory names one: `nemia start`'s `.`, or the board's own. */
  callerRepo: string;
  /** The factory it is started in, over the card's `factory:` (`nemia start <card> --factory`). */
  factory?: string;
  /**
   * How the start names a factory, in its own words with `<name>` in them — `--factory <name>`, `?factory=<name>` — said in the refusal
   * of a card that names none. None for the queue's start, which has no such words.
   */
  fix?: string;
  /** The runs it waits on (`nemia start --after`): an inbox card has no `after:`, so it is said here, at start. */
  after?: readonly string[];
  /** The runs it is handed as context (`nemia start --from`), after the card's own `from:`; a run both name is handed once. */
  context?: readonly string[];
  isolate?: boolean;
  inputs?: readonly string[];
  /** The steps its run is gated at (`nemia start --gate`), beside the card's own `gate:`. */
  gates?: readonly string[];
};

/**
 * What `startFromInbox` did: the run and the card it started, which stays in the inbox and lists as `started` while the run's record
 * stands. `queueLeft` says why a queued card still carries its `queued:` line, when taking it off failed: the record keeps it from the
 * queue all the same (`queueOrder`).
 *
 * `ignoredRepo` is the card's own `repo:` when the run looks at no repository: a folder team's does not, and a card written by hand, or
 * by a writer that does not ask `cardRepoRefusal`, may carry one. The run is started all the same, and the line says the path was not
 * looked at: said, not refused, since a card on disk cannot be edited from the board. A `repo` a person gives for such a team is refused by
 * `start()`.
 */
export type InboxStarted = { run: Run; card: InboxCard; ignoredRepo?: string; queueLeft?: string };

/**
 * The workflow folder a card is started on, found in the factory's `tree` where it has one, then in `repo`: `opts.workflow`, from
 * `opts.from`, else the card's `workflow:`, from the inbox. Refused by name: a card's workflow that does not load, in the card's words,
 * and none from either, naming the repository's.
 */
function cardWorkflow(opts: Pick<InboxStart, 'workflow' | 'from'>, card: InboxCard, file: string, repo: string, tree?: string): string {
  if (opts.workflow !== undefined) return workflowFolder(opts.workflow, opts.from ?? process.cwd(), repo, tree);
  if (card.workflow === undefined) throw new WorkflowError(noWorkflowRefusal(card, file, repo, workflowsIn(path.join(repo, 'workflows'))));
  try {
    return workflowFolder(card.workflow, inboxDir(), repo, tree);
  } catch (err) {
    throw new WorkflowError(`${card.file}: \`workflow: ${card.workflow}\` — ${(err as Error).message}`);
  }
}

/**
 * The factory a card in `file` is started in: `opts.factory`, else the card's own `factory:` (`named`). Refused, `Invalid`: neither, unless
 * `defaultStartsAllowed` (`unfactoredCardRefusal`), and the default factory (`defaultStartRefusal`), which no run is started in.
 */
function cardFactory(opts: Pick<InboxStart, 'factory' | 'fix'>, named: string | undefined, file: string): string | undefined {
  const factory = opts.factory ?? named;
  if (factory === undefined && !defaultStartsAllowed())
    throw new Invalid({ message: unfactoredCardRefusal(file, factoryNames(), opts.fix) });
  if (factory === DEFAULT_FACTORY) {
    const fix = opts.factory === undefined ? `\`factory: <name>\` in ${file}` : (opts.fix ?? '<name>');
    throw new Invalid({ message: defaultStartRefusal(fix, factoryNames()) });
  }
  return factory;
}

/**
 * `nemia start <inbox>/<name>.md`, and the board's start of a card: a card out of the inbox started with `start()`, `from: { inbox: <name>
 * }` on its record. The card is kept, and lists as `started` while that record stands; a queued one has its `queued:` line taken off, so
 * that the tick never starts it again, even once the run is forgotten.
 *
 * The brief is `brief`, or else the card's body. The workflow is `workflow`, else the card's `workflow:` — found from the inbox folder as
 * `nemia start <folder>` finds a card's from its plan folder: a name under the repository's `workflows/`, or a path — else refused, naming
 * the repository's workflows. The factory is `factory`, else the card's `factory:`. The repository is `repo`, else the card's `repo:`, else
 * the factory's one repository, else `callerRepo` (`repoFor`), chosen before the workflow is found in it; `start()` judges the factory. The
 * run is gated at the card's `gate:` and at `gates`, the card's first; a step both name is gated once.
 *
 * The record is written first, so taking `queued:` off, should it fail, leaves a card the record keeps out of the queue; it says so in
 * `queueLeft`. A started card is not started again (`startedRefusal`). Refused by name before anything
 * is written, exit 2: a name that is not a card's (`inboxNameRefusal`), a card not there (`Missing`) — naming the cards there are — a card
 * that does not read, a card already started (`Conflict`), no factory from either — `Invalid`, naming the line to write and `fix`
 * (`unfactoredCardRefusal`), unless `defaultStartsAllowed` — or the default factory named (`defaultStartRefusal`), no workflow, a
 * workflow that does not load behind the card, a `gate:` naming no step of it, in the card's words, a `from:` naming a run the store does
 * not have or one also waited on (`contextRefusal`), and a `brief` with nothing in it. The run is handed as context the card's `from:` and
 * `context`, in that order. And
 * refused as `start()` refuses it: an `--after`, an `--input` or a `--gate` it refuses, a factory not there, or one that does not offer
 * the workflow or does not work on the repository.
 */
export const startFromInbox = Effect.fn('startFromInbox')(function* (opts: InboxStart) {
  const refused = inboxNameRefusal(opts.name);
  if (refused) throw new WorkflowError(refused);
  const file = runStore.inbox.where(`${opts.name}.md`);
  const text = runStore.inbox.read(`${opts.name}.md`);
  if (text === null) {
    throw new Missing({
      message: `${noCardLine(opts.name, inboxCards())} Start one of those — nemia start ${runStore.inbox.where('<name>.md')} — or park the idea first: nemia inbox add "<idea>".`,
    });
  }
  const card = parseInboxCard(`${opts.name}.md`, text, isDirectory);
  const started = runStore.runs
    .list()
    .filter((r) => r.from?.inbox === card.name)
    .map((r) => r.id);
  if (started.length) throw new Conflict({ message: startedRefusal(card, file, started) });

  const factory = cardFactory(opts, card.factory, file);
  const repo = repoFor(factory, opts.repo ?? card.repo, opts.callerRepo);
  const workflowDir = cardWorkflow(opts, card, file, repo, treeOf(factory));
  if (opts.brief !== undefined && !opts.brief.trim()) {
    throw new WorkflowError(
      `${card.file}: the brief given in place of the card's body is empty. Give what the run is asked to do, or leave it out, and the run is asked what the card says.`,
    );
  }
  const gates = cardGates(card, opts.gates ?? [], workflowDir, repo);
  const context = cardContext(card, opts);

  const run = yield* startRun({
    brief: opts.brief?.trim() ?? card.body,
    repo,
    repoNamed: opts.repo !== undefined,
    workflowDir,
    isolate: opts.isolate,
    after: opts.after,
    ...(context.length ? { context } : {}),
    inputs: opts.inputs,
    from: { inbox: card.name },
    ...(gates.length ? { gates } : {}),
    ...(factory !== undefined ? { factory } : {}),
  });
  const ignoredRepo = card.repo !== undefined && !isRepositoryRun(run) ? { ignoredRepo: card.repo } : {};
  const queueLeft = card.queued === undefined ? undefined : takeQueueOff(card.name, file);
  const out: InboxStarted = { run, card, ...ignoredRepo, ...(queueLeft !== undefined ? { queueLeft } : {}) };
  return out;
});

/**
 * A started card's `queued:` line taken off, so the tick never starts it again — read again first, so a card gone since is not written
 * back and an edit made since is kept, its paths not judged, as `nemia inbox queue --off` takes it off. Why it is still there, when that
 * failed.
 */
function takeQueueOff(name: string, file: string): string | undefined {
  try {
    const now = runStore.inbox.read(`${name}.md`);
    if (now === null) return undefined;
    const card = parseInboxCard(`${name}.md`, now, () => true);
    if (card.queued !== undefined)
      runStore.inbox.rewrite(
        `${name}.md`,
        queuedText(card, null, () => true),
      );
    return undefined;
  } catch (err) {
    return `${file} keeps its queued: line — ${(err as Error).message}`;
  }
}

/** The steps a card's run is gated at: its `gate:` first, then `flags`, a step both name once — refused as the card's line when no step. */
function cardGates(card: InboxCard, flags: readonly string[], workflowDir: string, repo: string): string[] {
  if (card.gate !== undefined) {
    const refusedGate = gateRefusal([card.gate], loadWorkflows(workflowDir, placesOf(repo)), (step) => `${card.file}: \`gate: ${step}\``);
    if (refusedGate) throw new WorkflowError(`${refusedGate} Correct the line, or delete it.`);
  }
  return [...(card.gate !== undefined && !flags.includes(card.gate) ? [card.gate] : []), ...flags];
}

/**
 * The runs a card's run is handed as context: its `from:`, then `opts.context`, a run both name once — refused as `contextRefusal` says.
 */
function cardContext(card: InboxCard, opts: InboxStart): string[] {
  const refusedFrom = contextRefusal(card.from ?? [], opts.after ?? [], runStore.runs.exists, undefined, `${card.file}: from:`);
  if (refusedFrom) throw refusedFrom;
  return [...new Set([...(card.from ?? []), ...(opts.context ?? [])])];
}

/** What `nemia inbox from` did: the card as it reads now, its file, and the runs its `from:` named before. */
export type InboxFrom = { card: InboxCard; file: string; was: string[] };

/**
 * `nemia inbox from <card> <run>…`: the card's `from:` set to `runs`, the runs its run is handed as context — or taken off, for none
 * (`--off`). The card is written whole through `runStore.inbox.rewrite`, every other key kept (`fromText`).
 *
 * Refused by name, exit 2, before anything is written: a name that is not a card's (`inboxNameRefusal`), a name with no card (`Missing`),
 * a card that does not read, a card a run's record says was started (`Conflict`, `startedRefusal`), and what `contextRefusal` refuses of
 * `runs`: one the store does not have (`Missing`) or one named twice.
 */
export function setFrom(name: string, runs: readonly string[]): InboxFrom {
  const refused = inboxNameRefusal(name);
  if (refused) throw new WorkflowError(refused);
  const file = runStore.inbox.where(`${name}.md`);
  const text = runStore.inbox.read(`${name}.md`);
  if (text === null) {
    throw new Missing({
      message: `${noCardLine(name, inboxCards())} Name one of those — nemia inbox from <name> <run> — or park the idea first: nemia inbox add "<idea>".`,
    });
  }
  const card = parseInboxCard(`${name}.md`, text, () => true);
  const started = runStore.runs
    .list()
    .filter((r) => r.from?.inbox === card.name)
    .map((r) => r.id);
  if (started.length) throw new Conflict({ message: startedRefusal(card, file, started) });
  const refusedRuns = contextRefusal(runs, [], runStore.runs.exists, undefined, 'nemia inbox from');
  if (refusedRuns) throw refusedRuns;
  const written = fromText(card, runs, () => true);
  runStore.inbox.rewrite(`${name}.md`, written);
  return { card: parseInboxCard(`${name}.md`, written, () => true), file, was: card.from ?? [] };
}

/**
 * The tries in `names` of cards `listing` does not list as tried — no longer queued as they were — removed; one that cannot be is left for
 * a later pass.
 */
function dropStaleTries(names: Iterable<string>, listing: readonly InboxListing[]): void {
  for (const name of names) {
    if (listing.some((l) => l.name === name && l.tried)) continue;
    try {
      runStore.inbox.dropTry(name);
    } catch {}
  }
}

/**
 * The repository a queued card's line names (`on`), when it was tried on the daemon's (`fromDaemon`): none for a card that names no
 * factory, refused wherever a daemon runs, unless `WF_DEFAULT_FACTORY_STARTS=1` starts it there.
 */
const daemonsRepo = (card: Pick<InboxListing, 'factory'>, on: string, fromDaemon: boolean): { on?: string } =>
  fromDaemon && (card.factory !== null || defaultStartsAllowed()) ? { on } : {};

/**
 * The queue's next card started (`nextQueued`), one try: through `startFromInbox`, with the card's `workflow:` and `factory:`, on the
 * repository `queueRepo` names — its `repo:`, else its factory's one repository, else `repo`, the daemon's — the same one its refusal is
 * remembered on, so its base is its base branch as it is now, and its brief is frozen now. Undefined with no card to start. A card
 * whose `repo:` the run looks at none of — a folder team's — carries it on `ignoredRepo`, as `nemia start` says it: a tick's line
 * (`queueLine`) is the only place a daemon's start is read. The result names the repository (`on`) only when neither the card nor its
 * factory names one, and the start turns on where the daemon runs — never for a card that names no factory, which is refused wherever the
 * daemon runs (`unfactoredCardRefusal`, with no start's words), and lasts until the card names one.
 *
 * A start that does not happen is written down (`MissedStart`), and the card left as it is. A refusal — exit 2, the package's own, by name:
 * the workflow gone, the repository gone — lasts: no pass after it tries the card while it reads the same and would be tried on the same
 * repository, and the next card has its turn. Any other failure — git failing on the repository, say — is no verdict on the card: the next
 * pass tries it again, where it keeps its place, and a failure the same as the last pass's is said as `again`, and not written again. A
 * failure is said on one line, its lines joined by ` / `; a try that cannot be written is said all the same, and the next pass tries the
 * card again. The inbox, the tries and, with a card queued, the factories are read once. A try written for a card that is no longer
 * queued as it was is removed on the way, or on a later pass when it cannot be.
 */
export const startQueued = Effect.fn('startQueued')(function* (repo: string, runs: readonly Run[] = runStore.runs.list()) {
  const files = runStore.inbox.entries();
  const tries = runStore.inbox.tries();
  const listing = inboxListing(files, runs, isDirectory, tries);
  dropStaleTries(tries.keys(), listing);
  if (!queueOrder(listing).length) return undefined;
  const factories = readableFactories();
  const next = nextQueued(listing, repo, factories);
  if (!next) return undefined;
  const { repo: on, fromDaemon } = queueRepo(next, repo, factories);
  const where = daemonsRepo(next, on, fromDaemon);
  const tried = yield* Effect.exit(startFromInbox({ name: next.name, callerRepo: repo }));
  if (Exit.isSuccess(tried)) {
    const started = tried.value;
    const ignored = started.ignoredRepo !== undefined ? { ignoredRepo: started.ignoredRepo } : {};
    const left = started.queueLeft !== undefined ? { queueLeft: started.queueLeft } : {};
    return { card: next.name, run: started.run.id, ...ignored, ...left } satisfies QueueStarted;
  }
  const err = Cause.squash(tried.cause);
  const refused = (err as { exitCode?: number }).exitCode === 2;
  const why = (err instanceof Error ? err.message : String(err))
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' / ');
  const last = next.tried;
  if (!refused && last && !last.refused && last.why === why && last.repo === on)
    return { card: next.name, failed: why, again: true, ...where } satisfies QueueStarted;
  const record: MissedStart = { at: new Date().toISOString(), text: files.find((f) => f.file === next.file)!.text, repo: on, why, refused };
  try {
    runStore.inbox.putTry(next.name, record);
  } catch {}
  return refused
    ? ({ card: next.name, refused: why, ...where } satisfies QueueStarted)
    : ({ card: next.name, failed: why, again: false, ...where } satisfies QueueStarted);
});

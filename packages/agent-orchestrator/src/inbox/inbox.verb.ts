/**
 * Starting an inbox card (`startFromInbox`) and the queue's next card (`startQueued`, which the tick calls), each through `startRun`, then
 * taking the card out of the inbox; and the inbox listed with each card's state (`inboxJudged`), which reads each started card's run's
 * phase. A controller: Effect programs, which reach the runtime through `start/start.verb.ts` and the judged list.
 */
import { modelsText, type RunModels } from '../start/index.ts';
import { setting } from '../config/config.store.ts';
import { DEFAULT_NAMESPACE } from 'objects';
import path from 'node:path';
import { Cause, Effect, Exit } from 'effect';
import { WorkflowError } from '../step/step.ts';
import { workflowFolder, workflowsIn } from '../folder/folder.store.ts';
import type { WorkflowDir } from '../folder/folder.model.ts';
import { WorkflowDoor } from '../workflows/workflows.store.ts';
import {
  cardWorkflowName,
  cardWorkflowRefusal,
  fromText,
  cardsListed,
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
  type CardListing,
  type InboxListing,
  type QueueStarted,
  type MissedStart,
} from './inbox.ts';
import { gateRefusal } from '../ending/ending.ts';
import type { Run } from '../record/record.ts';
import { inboxDir } from '../record/files.store.ts';
import { CardDoor } from '../cards/cards.store.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { CardName } from './inbox.model.ts';
import { filedNames, inboxCards, readableFactories } from './inbox.store.ts';
import { startRun, type StartedRun } from '../start/start.verb.ts';
import { cardRuns, type SummaryHow } from '../summary/summary.verb.ts';
import type { Engine } from '../runtime-client.ts';
import { contextRefusal } from '../start/index.ts';
import { placesOf } from '../folder/lookup.store.ts';
import { factoryOrNone } from '../factory/door/factories.store.ts';
import { defaultStartRefusal, unattachedRefusal, wiredRepo, type Factory } from '../factory/factory.ts';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { StoreRoot } from '../config/root.store.ts';

/** How to start an inbox card (`startFromInbox`): the card, and what its start says over it or beside it. */
export type InboxStart = {
  /** The card's name, as `nemia inbox` lists it. */
  name: string;
  /** What the run is asked to do, in place of the card's body: the note rewritten into work. The card's body when left out. */
  brief?: string;
  /**
   * The workflow, over the card's `workflow:`: its name, the folder its factory offers — in the factory's tree, then in the repository the
   * factory works on for it — a path refused (`cardWorkflowRefusal`).
   */
  workflow?: string;
  /**
   * The repository a card of the default factory is started on: `nemia start`'s `.`, the board's own, or the daemon's for the queue. Read
   * for no card that names a factory, whose run works on the repository its wiring names for the workflow (`wiredRepo`).
   */
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
  /** The inbox cards to hand the run (`nemia start --card`), by name, beside this one. */
  cards?: readonly string[];
  /** The steps its run is gated at (`nemia start --gate`), beside the card's own `gate:`. */
  gates?: readonly string[];
  /** The model each step it names runs on in its run alone (`nemia start --model`), over the card's own `model:` for the same step. */
  models?: RunModels;
  /** The start's label edits (`nemia start --label`), over the card's own `labels:` and what its runs agree on. */
  labels?: readonly string[];
};

/**
 * What `startFromInbox` did: the run and the card it started, which stays in the inbox and lists as `started` while the run's record
 * stands. `queueLeft` says why a queued card still carries its `queued:` line, when taking it off failed: the record keeps it from the
 * queue all the same (`queueOrder`).
 *
 * `ignoredRepo` is an old card's own `repo:`, whenever it carries one: `repo:` is retired, and no start reads it (`ignoredRepoLine`). The
 * run is started all the same, on the repository its factory places it on, and the line says the path was not read: said, not refused,
 * since an old card on disk would be stranded by a refusal.
 */
export type InboxStarted = { run: StartedRun; card: InboxCard; ignoredRepo?: string; queueLeft?: string };

/**
 * Where a card is started: its workflow's name — `opts.workflow`, else the card's `workflow:` where it is a name — the repository, and the
 * workflow's folder, found in the factory's tree where it has one, then in the repository. In a factory (`filed`) the repository is the one
 * its wiring names for the workflow (`wiredRepo`), never the card's `repo:` nor `opts.callerRepo`; in the default factory, `callerRepo`.
 *
 * Refused by name, `Invalid`: a `workflow` given that is no workflow's name (`cardWorkflowRefusal`); none named — none at all, or an old
 * card's path — naming the workflows offered and the card by its name, which a start takes on this machine and on another's alike
 * (`noWorkflowRefusal`); a workflow the factory does not offer (`unattachedRefusal`) or names no repository for (`workflowRepoRefusal`'s
 * words, naming `nemia factory attach <factory> <workflow> --repo <name>`); and a card's workflow whose folder does not load, in the card's
 * words.
 */
const cardPlace = Effect.fn('cardPlace')(function* (
  opts: Pick<InboxStart, 'workflow' | 'callerRepo'>,
  card: InboxCard,
  filed: Factory | undefined,
) {
  const home = yield* StoreRoot;
  const refusedWorkflow =
    opts.workflow === undefined ? undefined : cardWorkflowRefusal('--workflows', opts.workflow, 'Nothing was started.');
  if (refusedWorkflow !== undefined) return yield* Effect.fail(new Invalid({ message: refusedWorkflow }));
  const name = opts.workflow ?? cardWorkflowName(card.workflow);
  if (name === undefined) {
    const dir = path.join(opts.callerRepo, 'workflows');
    const offered =
      filed === undefined ? { by: dir, workflows: workflowsIn(dir) } : { by: `the factory ${filed.name}`, workflows: filed.workflows };
    return yield* Effect.fail(new WorkflowError(noWorkflowRefusal(card, card.name, offered, card.workflow)));
  }
  const unattached = filed === undefined ? undefined : unattachedRefusal(filed, name);
  if (unattached !== undefined) return yield* Effect.fail(new Invalid({ message: unattached }));
  const wired = filed === undefined ? { repo: opts.callerRepo } : wiredRepo(filed, name);
  if (!('repo' in wired)) return yield* Effect.fail(new Invalid({ message: wired.message }));
  const { repo } = wired;
  const workflowDir = yield* Effect.try({
    try: () => cardWorkflow(home, name, opts.workflow === undefined ? card : undefined, repo, filed?.tree),
    catch: (err) => err as WorkflowError,
  });
  return { repo, workflowDir };
});

/**
 * The folder of the workflow `name` for a card started on `repo`: in the factory's `tree`, then in the repository (`workflowFolder`).
 * Refused as a `WorkflowError`: where it is the card's own `workflow:` (`card`), in the card's file and line, then `workflowFolder`'s
 * words.
 */
function cardWorkflow(home: string, name: string, card: InboxCard | undefined, repo: string, tree?: string): WorkflowDir {
  try {
    return workflowFolder(name, inboxDir(home), repo, tree);
  } catch (err) {
    throw new WorkflowError(
      card === undefined ? (err as Error).message : `${card.file}: \`workflow: ${name}\` — ${(err as Error).message}`,
    );
  }
}

/**
 * The factory a card in `file` is started in: `opts.factory`, else the card's own `factory:` (`named`). Refused, `Invalid`: neither, unless
 * `StoreConfig`'s `defaultFactoryStarts` (`unfactoredCardRefusal`), and the default factory (`defaultStartRefusal`), which no run is
 * started in.
 */
const cardFactory = Effect.fn('cardFactory')(function* (
  opts: Pick<InboxStart, 'factory' | 'fix'>,
  named: string | undefined,
  file: string,
) {
  const factory = opts.factory ?? named;
  if (factory === undefined && !(yield* setting('defaultFactoryStarts')))
    return yield* Effect.fail(new Invalid({ message: unfactoredCardRefusal(file, yield* filedNames(), opts.fix) }));
  if (factory === DEFAULT_NAMESPACE) {
    const fix = opts.factory === undefined ? `\`factory: <name>\` in ${file}` : (opts.fix ?? '<name>');
    return yield* Effect.fail(new Invalid({ message: defaultStartRefusal(fix, yield* filedNames()) }));
  }
  return factory;
});

/**
 * `nemia start <inbox>/<name>.md`, and the board's start of a card: a card out of the inbox started with `start()`, `from: { inbox: <name>
 * }` on its record. The card is kept, and lists as `started` while that record stands; a queued one has its `queued:` line taken off, so
 * that the tick never starts it again, even once the run is forgotten.
 *
 * The brief is `brief`, or else the card's body. The factory is `factory`, else the card's `factory:`. The workflow is `workflow`, else the
 * card's `workflow:`, by its name; the repository is the one the factory's wiring names for it, else its only one, and for a card of the
 * default factory `callerRepo` (`cardPlace`) — never the card's `repo:`, retired, which is said on `ignoredRepo` whenever the card carries
 * one. `start()` judges the factory.
 * The run is gated at the card's `gate:` and at `gates`, the card's first; a step both name is gated once. Its steps run on the card's
 * `model:` and on `models`, a step both name on `models`' (`withModels`), each refused as `start()` refuses a `--model`, in the words of
 * the card's line where it said the step's (`modelSaid`).
 *
 * The record is written first, so taking `queued:` off, should it fail, leaves a card the record keeps out of the queue; it says so in
 * `queueLeft`. A started card is not started again (`startedRefusal`). Refused by name before anything is written, exit 2: a name that is
 * not a card's (`inboxNameRefusal`), a card not there (`Missing`) — naming the cards there are — a card that does not read, a card already
 * started (`Conflict`), no factory from either — `Invalid`, naming the line to write and `fix` (`unfactoredCardRefusal`), unless
 * `StoreConfig`'s `defaultFactoryStarts` — or the default factory named (`defaultStartRefusal`), what `cardPlace` refuses — no workflow by
 * its name, one the factory does not offer or wires no repository for, one that does not load — a `gate:` naming no step of it, in the
 * card's words, a `from:` naming a run the store does not have or one also waited
 * on (`contextRefusal`), and a `brief` with nothing in it. The run is handed as context the card's `from:` and `context`, in that order.
 * And refused as `start()` refuses it: an `--after`, an `--input` or a `--gate` it refuses, or a factory not there.
 */
export const startFromInbox = Effect.fn('startFromInbox')(function* (opts: InboxStart) {
  const refused = inboxNameRefusal(opts.name);
  if (refused) return yield* Effect.fail(new WorkflowError(refused));
  const door = yield* CardDoor;
  const runs = yield* RunDoor;
  const name = CardName.read(opts.name);
  const file = yield* door.cards.where(name);
  const text = yield* door.cards.read(name);
  if (text === null) {
    return yield* Effect.fail(
      new Missing({
        message: `${noCardLine(opts.name, yield* inboxCards())} Start one of those — nemia start <name> — or park the idea first: nemia inbox add "<idea>".`,
      }),
    );
  }
  const card = parseInboxCard(`${opts.name}.md`, text);
  const started = (yield* runs.runs.list()).filter((r) => r.from?.inbox === card.name).map((r) => r.id);
  if (started.length) return yield* Effect.fail(new Conflict({ message: startedRefusal(card, file, started) }));

  const factory = yield* cardFactory(opts, card.factory, file);
  const filed = yield* factoryOrNone(factory);
  const { repo, workflowDir } = yield* cardPlace(opts, card, filed);
  if (opts.brief !== undefined && !opts.brief.trim()) {
    throw new WorkflowError(
      `${card.file}: the brief given in place of the card's body is empty. Give what the run is asked to do, or leave it out, and the run is asked what the card says.`,
    );
  }
  const gates = yield* cardGates(card, opts.gates ?? [], workflowDir, repo);
  const ids = new Set(yield* runs.runs.ids());
  const context = cardContext(card, opts, (id) => ids.has(id));

  const run = yield* startRun({
    brief: opts.brief?.trim() ?? card.body,
    repo,
    repoNamed: false,
    workflowDir,
    isolate: opts.isolate,
    after: opts.after,
    ...(context.length ? { context } : {}),
    inputs: opts.inputs,
    cards: opts.cards,
    from: { inbox: card.name },
    ...(gates.length ? { gates } : {}),
    ...cardModels(card, opts.models),
    ...(factory !== undefined ? { factory } : {}),
    labels: { ...(card.labels !== undefined ? { card: card.labels } : {}), edits: opts.labels ?? [] },
  });
  const ignoredRepo = card.repo !== undefined ? { ignoredRepo: card.repo } : {};
  const queueLeft = card.queued === undefined ? undefined : yield* takeQueueOff(name, file);
  const out: InboxStarted = { run, card, ...ignoredRepo, ...(queueLeft !== undefined ? { queueLeft } : {}) };
  return out;
});

/**
 * A started card's `queued:` line taken off, so the tick never starts it again — read again first, so a card gone since is not written
 * back and an edit made since is kept, its paths not judged, as `nemia inbox queue --off` takes it off. Why it is still there, when that
 * failed.
 */
const takeQueueOff = (name: CardName, file: string): Effect.Effect<string | undefined> =>
  Effect.gen(function* () {
    const door = yield* CardDoor;
    const now = yield* door.cards.read(name);
    if (now === null) return undefined;
    const card = parseInboxCard(`${name}.md`, now);
    if (card.queued !== undefined) yield* door.cards.rewrite(name, queuedText(card, null));
    return undefined;
  }).pipe(Effect.catchCause((cause) => Effect.succeed(`${file} keeps its queued: line — ${(Cause.squash(cause) as Error).message}`)));

/**
 * The steps a card's run is gated at: its `gate:` first, then `flags`, a step both name once — refused as the card's line when no step,
 * its workflow's steps read through the Workflow door the program is given.
 */
const cardGates = Effect.fn('cardGates')(function* (card: InboxCard, flags: readonly string[], workflowDir: WorkflowDir, repo: string) {
  const home = yield* StoreRoot;
  if (card.gate !== undefined) {
    const steps = yield* (yield* WorkflowDoor).workflows.read(workflowDir, placesOf(home, repo));
    const refusedGate = gateRefusal([card.gate], steps, (step) => `${card.file}: \`gate: ${step}\``);
    if (refusedGate) return yield* Effect.fail(new WorkflowError(`${refusedGate} Correct the line, or delete it.`));
  }
  return [...(card.gate !== undefined && !flags.includes(card.gate) ? [card.gate] : []), ...flags];
});

/**
 * The models a card's run is started with: its `model:`, and `flags` (`--model`) over it for the same step, each said where it was
 * (`modelSaid`); none where neither names one.
 */
const cardModels = (card: InboxCard, flags: RunModels | undefined): { models?: RunModels; modelSaid?: (step: string) => string } => {
  const models = { ...card.model, ...flags };
  return Object.keys(models).length ? { models, modelSaid: (step) => modelSaid(card, flags, step) } : {};
};

/** Where a card's run was told a step's model: the card's `model:` line, unless the start's `--model` names that step too. */
const modelSaid = (card: InboxCard, flags: RunModels | undefined, step: string): string =>
  flags?.[step] !== undefined || card.model === undefined
    ? `--model ${step}=${flags?.[step] ?? ''}`
    : `${card.file}: \`model: ${modelsText(card.model)}\``;

/**
 * The runs a card's run is handed as context: its `from:`, then `opts.context`, a run both name once — refused as `contextRefusal` says.
 */
function cardContext(card: InboxCard, opts: InboxStart, exists: (id: string) => boolean): string[] {
  const refusedFrom = contextRefusal(card.from ?? [], opts.after ?? [], exists, undefined, `${card.file}: from:`);
  if (refusedFrom) throw refusedFrom;
  return [...new Set([...(card.from ?? []), ...(opts.context ?? [])])];
}

/** What `nemia inbox from` did: the card as it reads now, its file, and the runs its `from:` named before. */
export type InboxFrom = { card: InboxCard; file: string; was: string[] };

/**
 * `nemia inbox from <card> <run>…`: the card's `from:` set to `runs`, the runs its run is handed as context — or taken off, for none
 * (`--off`). The card is written whole through the Card door (`cards.rewrite`), every other key kept (`fromText`).
 *
 * Refused by name, exit 2, before anything is written: a name that is not a card's (`inboxNameRefusal`), a name with no card (`Missing`),
 * a card that does not read, a card a run's record says was started (`Conflict`, `startedRefusal`), and what `contextRefusal` refuses of
 * `runs`: one the store does not have (`Missing`) or one named twice.
 */
export const setFrom = Effect.fn('setFrom')(function* (name: string, runs: readonly string[]) {
  const refused = inboxNameRefusal(name);
  if (refused) return yield* Effect.fail(new WorkflowError(refused));
  const door = yield* CardDoor;
  const runDoor = yield* RunDoor;
  const card$ = CardName.read(name);
  const file = yield* door.cards.where(card$);
  const text = yield* door.cards.read(card$);
  if (text === null) {
    return yield* Effect.fail(
      new Missing({
        message: `${noCardLine(name, yield* inboxCards())} Name one of those — nemia inbox from <name> <run> — or park the idea first: nemia inbox add "<idea>".`,
      }),
    );
  }
  const card = parseInboxCard(`${name}.md`, text);
  const started = (yield* runDoor.runs.list()).filter((r) => r.from?.inbox === card.name).map((r) => r.id);
  if (started.length) return yield* Effect.fail(new Conflict({ message: startedRefusal(card, file, started) }));
  const ids = new Set(yield* runDoor.runs.ids());
  const refusedRuns = contextRefusal(runs, [], (id) => ids.has(id), undefined, 'nemia inbox from');
  if (refusedRuns) return yield* Effect.fail(refusedRuns);
  const written = fromText(card, runs);
  yield* door.cards.rewrite(card$, written);
  const out: InboxFrom = { card: parseInboxCard(`${name}.md`, written), file, was: card.from ?? [] };
  return out;
});

/**
 * The tries in `names` of cards `listing` does not list as tried — no longer queued as they were — removed; one that cannot be is left for
 * a later pass.
 */
const dropStaleTries = (names: Iterable<string>, listing: readonly CardListing[]) =>
  Effect.gen(function* () {
    const door = yield* CardDoor;
    for (const name of names) {
      if (listing.some((l) => l.name === name && l.tried)) continue;
      yield* Effect.ignoreCause(door.tries.drop(CardName.read(name)), {
        log: 'Unhandled',
        message: `the stale try of the card ${name} could not be removed: a later pass removes it`,
      });
    }
  });

/**
 * The repository a queued card's line names (`on`), when it was tried on the daemon's (`fromDaemon`), which only a card of the default
 * factory is: none where that card is refused wherever a daemon runs, unless `WF_DEFAULT_FACTORY_STARTS=1` starts it there.
 */
const daemonsRepo = (card: Pick<InboxListing, 'factory'>, on: string, fromDaemon: boolean, defaultStarts: boolean): { on?: string } =>
  fromDaemon && (card.factory !== null || defaultStarts) ? { on } : {};

/**
 * The queue's next card started (`nextQueued`), one try: through `startFromInbox`, with the card's `workflow:` and `factory:`, on the
 * repository its factory's wiring names for its workflow, or for a card of the default factory `repo`, the daemon's — the one `queueRepo`
 * names, its refusal remembered on it (`''` where the factory names none, so a wiring that names one later is a new try), so its base is
 * its base branch as it is now, and its brief is frozen now. Undefined with no card to start. An old card's retired `repo:` is carried on
 * `ignoredRepo`, as `nemia start` says it: a tick's line (`queueLine`) is the only place a daemon's start is read. The result names the
 * repository (`on`) only for a card of the default factory, whose start turns on where the daemon runs — never for one refused wherever
 * the daemon runs (`unfactoredCardRefusal`, with no start's words), which lasts until the card names a factory.
 *
 * A start that does not happen is written down (`MissedStart`), and the card left as it is. A refusal — exit 2, the package's own, by name:
 * the workflow gone, the repository gone — lasts: no pass after it tries the card while it reads the same and would be tried on the same
 * repository, and the next card has its turn. Any other failure — git failing on the repository, say — is no verdict on the card: the next
 * pass tries it again, where it keeps its place, and a failure the same as the last pass's is said as `again`, and not written again. A
 * failure is said on one line, its lines joined by ` / `; a try that cannot be written is said all the same, and the next pass tries the
 * card again. The inbox, the tries and, with a card queued, the factories are read once. A try written for a card that is no longer
 * queued as it was is removed on the way, or on a later pass when it cannot be.
 */
export const startQueued = Effect.fn('startQueued')(function* (repo: string, given?: readonly Run[]) {
  const door = yield* CardDoor;
  const runs = given ?? (yield* (yield* RunDoor).runs.list());
  const files = yield* door.cards.entries();
  const tries = yield* door.tries.list();
  const listing = cardsListed(files, runs, tries);
  yield* dropStaleTries(tries.keys(), listing);
  if (!queueOrder(listing).length) return undefined;
  const factories = yield* readableFactories();
  const next = nextQueued(listing, repo, factories);
  if (!next) return undefined;
  const { repo: on, fromDaemon } = queueRepo(next, repo, factories);
  const where = daemonsRepo(next, on, fromDaemon, yield* setting('defaultFactoryStarts'));
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
  const card = files.find((f) => f.file === next.file);
  if (card) {
    const record: MissedStart = { at: new Date().toISOString(), text: card.text, repo: on, why, refused };
    yield* Effect.ignoreCause(door.tries.put(CardName.read(next.name), record), {
      log: 'Unhandled',
      message: `the try of the card ${next.name} could not be written: the next pass tries the card again`,
    });
  }
  return refused
    ? ({ card: next.name, refused: why, ...where } satisfies QueueStarted)
    : ({ card: next.name, failed: why, again: false, ...where } satisfies QueueStarted);
});

/**
 * `nemia inbox`'s listing, each entry with its state (`inboxListing`): its cards and the tick's tries read through the Card door, the
 * factories that read, and each run a card was started from with its phase as the list judges it, through the informer `how.memo`
 * (`cardRuns`) — so a started card reads its run's phase, read now and never stored on the card. Reading a phase takes the engine, which
 * `inbox.store.ts` does not import.
 */
export const inboxJudged = Effect.fn('inboxJudged')(function* (e: Engine, how: SummaryHow) {
  const door = yield* CardDoor;
  const entries = yield* door.cards.entries();
  const tries = yield* door.tries.list();
  const runs = yield* cardRuns(e, how);
  return inboxListing(entries, runs, tries, yield* readableFactories());
});

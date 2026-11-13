/**
 * The package's one reading of a run (`listReading`), which `nemia ls` (`list`, `runsListed`) and the api's list answer from: the pure
 * listing over one read of each task, and what `assess` says of the run on the same inputs. And the runs nobody judged (`unjudgedOf`).
 * `nemia ls` reads the repository's own checkout as the pass that would file into it reads it (`checkoutHold`, in `ending.verb.ts`). A
 * controller, reaching the runtime through the client (`runtime-client.ts`).
 */
import { StoreRoot } from '../config/root.store.ts';
import { type Settings, StoreConfig } from '../config/config.store.ts';
import { realReleasesDir } from '../release/release.store.ts';
import { Cause, Effect, Exit } from 'effect';
import { EngineService, asked, over, unreadableJournal, type Engine, type TaskView } from '../runtime-client.ts';
import type { RunSlot } from '../cap/cap.ts';
import { runSlots } from '../cap/cap.verb.ts';
import { isRepositoryRun, runTasks, unjudgedWords, unloadedWords, type Run, type TaskPhase } from '../record/record.ts';
import type { StepSpec } from '../step/step.ts';
import { holdsOf, waitsOf, type ParentRun } from '../wait/wait.ts';
import { listing, type Listing, type RunsListed, type Unjudged } from './list.ts';
import { assess, type Assessment } from '../tick/assess.ts';
import { runSpend, type BranchStanding, type Spend, type SpendOf } from '../status/status.ts';
import type { RetryAsk } from '../retry/index.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { RunId } from '../record/record.model.ts';
import { selectedRuns } from '../labels/labels.ts';
import type { Selectors } from '../watch/selector.ts';
import { unloadedFolder } from '../steps/steps.ts';
import { stepsAmong, stepsOf } from '../steps/steps.verb.ts';
import { askedStandings, landedOf, resultBranches, type BranchReader } from '../branches/branches.store.ts';
import { decision, type Decision, type Landed } from '../decide/decide.ts';
import { headsOver, standingReader, standingSnapshot, type PassStanding } from '../standing/standing.verb.ts';
import { daemonStanding } from '../daemon/daemon.store.ts';
import { schedulesListed } from '../factory/schedule/listed.store.ts';
import {
  admissionWaitOf,
  closeoutOf,
  deniedOf,
  ranOnOf,
  parentsRead,
  passParents,
  saidCount,
  unjudgedWord,
  viewedOnce,
  waitingOf,
} from '../views/views.verb.ts';
import { engineWord, killedMemoryOf, parkedOf } from '../views/views-words.ts';
import { checkoutHold } from '../ending/ending.verb.ts';
import { readRun, type RunRead } from '../tick/told.verb.ts';
import { landsOnCheck } from '../status/status.ts';
import { mergeStaged, statusMemo } from '../place/landing.store.ts';
import { PlaceService } from '../place/place.store.ts';
import { readPause } from '../pause/pause.store.ts';
import { currentTasks, finishingAmong, parkedAmong, type Pause, type Paused, type PauseHeld, type PauseStaged } from '../pause/pause.ts';

/**
 * How a caller reads a run (`listReading`): what it already holds, and what it asks to be read. Each left out is read as `nemia ls` reads
 * it.
 *
 * @param views The engine's view of every task the run filed, an earlier try's included; left out, read one by one (`taskPhasesRead`).
 * @param steps The steps the run is judged by; left out, its frozen workflow (`stepsOf`).
 * @param shown The steps listed, a line each; left out, `steps`.
 * @param standings Where each result branch stands against the base branch, asked once the run's status is known; left out, the result
 *   branches the tick's pass reads (`askedStandings`, `branchesAsked`), as `git` reads them.
 * @param slot The cap on runs in flight holding this run (`runSlots`), said where `waiting` would be; left out, none.
 * @param checkout Where the branches stand, as `git` was read off it, to read the run whose `workspace: base` step holds the repository's
 *   own checkout over (`checkoutHold`), as the pass reads it; left out, the tick's last reading (`standingSnapshot`), read only where the
 *   run's ending asks for the checkout.
 * @param config The settings the cap on runs in flight (`WF_MAX_RUNS`) is read from where the checkout is (`checkoutHold`); left out,
 *   the program's (`StoreConfig`).
 * @param git The call's branch reader (`standingReader`): what was read of where the result branches stand, never git asked as it goes.
 * @param parent The runs it waits on and is held until, as `parentsRead` read them; left out, read here.
 * @param landed Whether a result branch is on its base, as the decision reads it; left out, as `git` reads it (`landedOf`).
 */
export type ListReadingHow = {
  views?: ReadonlyMap<string, TaskView>;
  steps?: readonly StepSpec[];
  shown?: readonly StepSpec[];
  standings?: (status: Assessment['status'], steps: readonly StepSpec[]) => readonly BranchStanding[];
  slot?: RunSlot;
  checkout?: PassStanding;
  config?: Settings;
  git: BranchReader;
  parent?: (id: string) => ParentRun;
  landed?: (branch: string) => Landed;
  /**
   * The store's real releases folder (`realReleasesDir`), which a step at work is said to run on under (`ranOnOf`); left out, none
   * is said.
   */
  releases?: string;
};

/**
 * A run as the package reads it once (`listReading`): what `nemia ls` lists (`Listing`) and what `assess` says of the run on the same
 * inputs (`assessed`) — with `assessOf` to ask it again of the record as it would stand (a hold lifted), each task's phase as the tick
 * reads it (`phaseOf`), the asks that carried a message (`answers`), what each task cost (`spendOf`), and the whole run's spend (`spend`);
 * the run's one read it assessed, with its checkout and standings (`read`), and what is left for a person to do about it on the same
 * read (`decision`), each branch on the base or not as `git` says it (`landedOf`): what `nemia decide` answers from.
 */
export type ListReading = Listing & {
  assessed: Assessment;
  read: RunRead;
  decision: Decision;
  assessOf: (on: Run) => Assessment;
  phaseOf: (taskId: string) => TaskPhase;
  answers: readonly RetryAsk[];
  spendOf: SpendOf;
  spend: Spend;
};

/**
 * The package's one reading of a run, over one read of each task: what `nemia ls` and the api's list both answer from.
 *
 * Each step's status is `listing`'s, the engine's bare word while a step runs (`needs-human`, compared exactly), with what the harness says
 * it waits for and what it was denied as fields beside it, and why the runtime holds a queued one in its note (`admissionWaitOf`). A
 * refused check's verdict is its exit off the engine's record of the check (`exitVerdicts`), never its output or logs: the check prints
 * the code it exits with, so the two agree, and a read of either per refused check would cost every poll of the list. The runs it waits
 * on and is held until are each read once (`parentsRead`), and where its result branches stand is asked once its status is known.
 * Untraced: a list runs it once per run, and a span each would bury the list's trace under hundreds.
 */
export const listReading = Effect.fnUntraced(function* (e: Engine, run: Run, how: ListReadingHow) {
  const home = yield* StoreRoot;
  const { git } = how;
  const given = { ...(how.steps ? { steps: [...how.steps] } : {}), ...(how.views ? { views: new Map(how.views) } : {}) };
  const { read: base } = yield* readRun(e, run, given);
  const { steps, views, phaseOf, answers, spendOf } = base;
  const memo = statusMemo(headsOver(git), yield* PlaceService);
  const standing = how.checkout ? Effect.succeed(how.checkout) : standingSnapshot();
  const checkout = yield* checkoutHold(home, e, run, steps, { standing }, how.config ?? (yield* StoreConfig), memo);
  const held = { ...base, checkout };
  const status = assess(held).status;
  const standings = how.standings ? how.standings(status, steps) : askedStandings(run, steps, status, git);
  const read = { ...held, standings };
  const assessed = assess(read);
  const decided = decision(read, how.landed ?? landedOf(run, git), assessed);
  const assessOf = (on: Run): Assessment => assess({ ...read, run: on });
  const parent = how.parent ?? (yield* parentsRead(run, git).pipe(over(e)));
  const scripted = base.signedOff;
  const listed = listing({
    steps: how.shown ?? steps,
    read,
    assessed,
    phaseOf: engineWord(views),
    closeoutOf: (name) =>
      steps.some((s) => s.name === name && s.route?.kind === 'script') ? scripted(name) : closeoutOf(views, run, name),
    answers,
    waits: waitsOf(run, parent),
    saidTo: saidCount(views, run),
    slot: how.slot,
    waitingOf: waitingOf(views),
    admissionWaitOf: admissionWaitOf(views),
    deniedOf: deniedOf(views),
    ...(how.releases === undefined ? {} : { ranOnOf: ranOnOf(views, how.releases) }),
    parkedOf: (taskId) => parkedOf(views.get(taskId)),
    memoryOf: (taskId) => killedMemoryOf(views.get(taskId)),
    holds: holdsOf(run, parent),
  });
  return {
    ...listed,
    assessed,
    read,
    decision: decided,
    assessOf,
    phaseOf,
    answers,
    spendOf,
    spend: runSpend(run, spendOf),
  } satisfies ListReading;
});

/**
 * What `nemia ls` shows for one run (`listReading`): where every result branch stands as the tick's last pass read it (`standing`; left
 * out, `standingSnapshot`), with no process, and the run holding the checkout read.
 *
 * The phase beside a step is the engine's own word (`working`, `needs-human`), not the narrowed `TaskPhase` the DAG decides on: a
 * person reading the list wants the detail. Where the run's result stands against the base branch is what says a finished run is one
 * nobody has decided; one no pass read is said unread.
 */
export const list = Effect.fn('list')(function* (e: Engine, run: Run, slot?: RunSlot, standing?: PassStanding, releases?: string) {
  const read = standing ?? (yield* standingSnapshot());
  return yield* listReading(e, run, { slot, git: standingReader(read), checkout: read, ...(releases === undefined ? {} : { releases }) });
});

/**
 * What `list` reads of `run`, or why it is left unjudged (`unjudgedOf`): a run a task journal of which does not read, or whose unfrozen
 * folder does not load; any other failure of the read is the program's.
 */
const readOrUnjudged = Effect.fnUntraced(function* (
  e: Engine,
  run: Run,
  slot: RunSlot | undefined,
  standing: PassStanding,
  releases: string | undefined,
) {
  const exit = yield* Effect.exit(list(e, run, slot, standing, releases));
  if (Exit.isSuccess(exit)) return exit.value;
  const unjudged = yield* unjudgedOf(e, run, Cause.squash(exit.cause), 'nemia ls');
  return unjudged ?? (yield* Effect.failCause(exit.cause));
});

/**
 * `nemia ls`'s answer: every run, or the one named, each as `list` reads it, which daemon ticks the store (`daemonStanding`), and when the
 * tick's last pass read where the branches stand (`standingSnapshot`), or that none has. The cap on runs in flight is judged over the
 * whole store even for one run; each task is viewed once (`viewedOnce`), and where the branches stand is read off `standing.json`, with
 * no process. A run a task journal of which does not read, or whose unfrozen folder does not load, is answered unjudged (`unjudgedOf`),
 * the second with no result branch (`stepsAmong`); any other failure rejects. With no run named, the factories' schedules
 * (`schedulesListed`). Refuses a run named that is not in the store, as the Run door's `runs.read` does. Of the runs `selectors` takes
 * (`selectedRuns`), off each composed record before any is judged; the cap, the pause and the schedules are still read of the whole store.
 * A step at work says what its session runs on under the real releases folder of the store at `home`, where it is given (`ranOnOf`).
 */
export const runsListed = Effect.fn('runsListed')(function* (runId?: string, selectors: Selectors = []) {
  const home = yield* StoreRoot;
  const releases = realReleasesDir(home);
  const e = yield* EngineService;
  const door = yield* RunDoor;
  const all = runId ? [yield* door.runs.read(RunId.read(runId))] : yield* door.runs.list();
  const store = runId ? yield* door.runs.list() : all;
  const runs = selectedRuns(all, selectors);
  const listed: RunsListed['runs'] = [];
  const reads: Read[] = [];
  const standing = yield* standingSnapshot();
  const git = standingReader(standing);
  const memo = statusMemo(headsOver(git), yield* PlaceService);
  const among = yield* stepsAmong(runs);
  if (runs.length) {
    const viewed = viewedOnce(e);
    const held = yield* runSlots(viewed, store, yield* StoreConfig, passParents(git));
    for (const run of runs) {
      const read = yield* readOrUnjudged(viewed, run, held.get(run.id), standing, releases);
      const steps = among.get(run.id) ?? [];
      listed.push({ run, listed: read, result: resultBranches(run, steps) });
      reads.push({ run, read, steps, staged: () => mergeStaged(run, steps, memo) });
    }
  }
  const pause = readPause(home);
  const paused = pause ? { paused: yield* pausedOf(e, pause, store, reads) } : {};
  const read = standing.at === undefined ? { none: true as const } : { at: standing.at };
  const schedules = runId ? [] : schedulesListed(home, all);
  return {
    runs: listed,
    daemon: daemonStanding(home),
    standing: read,
    ...paused,
    ...(schedules.length ? { schedules } : {}),
  } satisfies RunsListed;
});

/**
 * A run, the package's reading of it or why it is left unjudged, its steps (`stepsAmong`: none for a run whose unfrozen folder does not
 * load, which then names no result branch), and whether a merge is staged in its checkout (`mergeStaged`).
 */
type Read = { run: Run; read: ListReading | Unjudged; steps: readonly StepSpec[]; staged: () => boolean };

/**
 * The checks of `run` the pause keeps from being filed (`waitingOnPause.checks`, `assess`'s): each landing with its merge staged — an
 * ending that lands on its check (`landsOnCheck`) while a merge is staged in the repository's own checkout, or its place could not say,
 * as `holdingReads` read it (`mergeStaged`) — and each other (`held`).
 */
const heldOf = ({ run, read, steps, staged: merging }: Read): Pick<Paused, 'staged' | 'held'> => {
  const checks = 'assessed' in read ? (read.assessed.waitingOnPause?.checks ?? []) : [];
  const landings = steps.filter((s) => checks.includes(s.name) && landsOnCheck(s, run));
  const staged: PauseStaged[] =
    landings.length && isRepositoryRun(run) && merging() ? landings.map((s) => ({ run: run.id, step: s.name, repo: run.repo })) : [];
  const held: PauseHeld[] = checks.filter((step) => !staged.some((s) => s.step === step)).map((step) => ({ run: run.id, step }));
  return { staged, held };
};

/** The checks the pause holds among `reads` (`heldOf`): each landing with its merge staged, and each other. */
const heldAmong = (reads: readonly Read[]): Pick<Paused, 'staged' | 'held'> => {
  const each = reads.map(heldOf);
  return { staged: each.flatMap((h) => h.staged), held: each.flatMap((h) => h.held) };
};

/**
 * The pause; each task still finishing under it among `runs`, over one read of every current task and check (`e.list`), never stored,
 * with the asks waiting on its run; and each check it holds among the runs read (`heldAmong`), a landing with its merge staged among them.
 * A task whose journal does not read is not counted. Only a run with a task current can be finishing, so only its asks are read.
 */
const pausedOf = Effect.fnUntraced(function* (e: Engine, pause: Pause, runs: readonly Run[], reads: readonly Read[]) {
  const ids = [...new Set(runs.flatMap(currentTasks))];
  const read = new Map((ids.length ? (yield* asked('list', e.list(ids))).views : []).map((v) => [v.id, v]));
  const among = yield* stepsAmong(runs);
  const door = yield* RunDoor;
  const asks = new Map<string, readonly RetryAsk[]>();
  for (const run of runs.filter((r) => currentTasks(r).length)) asks.set(run.id, (yield* door.asks.read(RunId.read(run.id))).asks);
  return {
    pause,
    finishing: finishingAmong(
      runs,
      (taskId) => read.get(taskId),
      (run) => among.get(run.id) ?? [],
      (run) => asks.get(run.id) ?? [],
    ),
    parked: parkedAmong(runs, (taskId) => read.get(taskId)),
    ...heldAmong(reads),
  } satisfies Paused;
});

/**
 * The store's pause, as `GET /api/pause`, `nemia watch --once` and `nemia start` answer it: the pause or null; each task still finishing
 * under it, read on this call while a pause stands; and each check it holds, a landing with its merge staged among them — read of the
 * runs that can hold one (`holdingReads`).
 */
export const pausedRead = Effect.fn('pausedRead')(function* () {
  const home = yield* StoreRoot;
  const e = yield* EngineService;
  const pause = readPause(home);
  if (!pause) return { pause: null, finishing: [], parked: [], staged: [], held: [] } satisfies Paused;
  const runs = yield* (yield* RunDoor).runs.list();
  const viewed = viewedOnce(e);
  return yield* pausedOf(viewed, pause, runs, yield* holdingReads(viewed, runs, standingReader(yield* standingSnapshot())));
});

/** Whether `run` has a step with a `check:` whose session was filed and whose check was not: one the pause can hold. */
const checkDue = (run: Run, steps: readonly StepSpec[]): boolean =>
  steps.some((s) => s.check !== undefined && run.steps[s.name]?.taskId && !run.steps[s.name]?.check);

/**
 * The readings of those of `runs` the pause can hold a check of (`heldOf`): each whose ending lands on its check while a merge is staged
 * in its checkout (`mergeStaged`, asked once a run), read as `nemia ls` reads it, and each other with a check due (`checkDue`), read
 * without asking git where its branches stand. A run a task journal of which does not read (`unreadableJournal`), or whose unfrozen
 * folder does not load (`stepsAmong`), is left out, as the tick leaves it unjudged; any other failure throws. Where the branches stand
 * is read through `git`, and the checkouts asked of the place the program was given.
 */
const holdingReads = Effect.fnUntraced(function* (e: Engine, runs: readonly Run[], git: BranchReader) {
  const memo = statusMemo(headsOver(git), yield* PlaceService);
  const among = yield* stepsAmong(runs);
  const holding = runs.flatMap((run) => {
    const steps = among.get(run.id) ?? [];
    if (mergeStaged(run, steps, memo)) return [{ run, steps, how: { git } satisfies ListReadingHow, staged: () => true }];
    return checkDue(run, steps) ? [{ run, steps, how: { git, standings: () => [] } satisfies ListReadingHow, staged: () => false }] : [];
  });
  const reads = yield* Effect.all(
    holding.map(({ run, steps, how, staged }) =>
      Effect.exit(listReading(e, run, how)).pipe(
        Effect.flatMap((exit) => {
          if (Exit.isSuccess(exit)) return Effect.succeed<Read | undefined>({ run, read: exit.value, steps, staged });
          return unreadableJournal(Cause.squash(exit.cause)) === undefined ? Effect.failCause(exit.cause) : Effect.succeed(undefined);
        }),
      ),
    ),
    { concurrency: 'unbounded' },
  );
  return reads.filter((r) => r !== undefined);
});

/**
 * Each check among `runs` the pause holds (`heldOf`), a landing with its merge staged among them, as the tick's pass says it, where the
 * branches stand read through `git`.
 */
export const heldRead = (e: Engine, runs: readonly Run[], git: BranchReader) => Effect.map(holdingReads(e, runs, git), heldAmong);

/**
 * A run a read of which rejected with `err`, answered off its record when that is a task journal that does not read (`unreadableJournal`)
 * or an unfrozen folder that does not load (`unloadedFolder`), as the tick leaves such a run where it is: why it is not judged, by `by`
 * (`unjudgedWords`, `unloadedWords`), and each step's word (`unjudgedWord`) off one read of the run's own tasks (`list`), which names every
 * one of them that does not read — a check's and an earlier try's among them; the steps of a run whose folder does not load are its
 * record's. Undefined for any other failure, which the caller throws.
 */
export const unjudgedOf = Effect.fn('unjudgedOf')(function* (e: Engine, run: Run, err: unknown, by: string) {
  const why = unreadableJournal(err);
  const folder = unloadedFolder(err);
  if (why === undefined && folder === undefined) return undefined;
  const tasks = runTasks(run);
  const listed = yield* asked('list', e.list(tasks));
  const unreadable = new Map(listed.unreadable.map((u) => [u.taskId, u.why]));
  const word = unjudgedWord(new Map(listed.views.map((v) => [v.id, v])), unreadable);
  const names = folder === undefined ? (yield* stepsOf(run)).map((s) => s.name) : Object.keys(run.steps);
  const steps = names.map((name) => ({ name, message: word(run.steps[name]), branch: run.steps[name]?.branch }));
  if (folder !== undefined) return { said: unloadedWords(run.id, folder, by), steps } satisfies Unjudged;
  if (why === undefined) return undefined;
  const named = (err as { taskId: string }).taskId;
  const own = tasks.find((id) => unreadable.has(id)) ?? tasks.find((id) => id === named);
  return { said: unjudgedWords(run.id, own, (own && unreadable.get(own)) ?? why, by), steps } satisfies Unjudged;
});

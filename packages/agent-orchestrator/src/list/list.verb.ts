/**
 * The package's one reading of a run (`runReading`), which `wf ls` (`list`, `runsListed`) and the api's list answer from: the pure
 * listing over one read of each task, and what `assess` says of the run on the same inputs. And the runs nobody judged (`unjudgedOf`).
 * `wf ls` reads the repository's own checkout as the pass that would file into it reads it (`checkoutHold`, in `ending.verb.ts`). A
 * controller, reaching the runtime through the client (`runtime-client.ts`).
 */
import { unreadableJournal, type Engine, type TaskView } from '../runtime-client.ts';
import type { RunSlot } from '../cap/cap.ts';
import { runSlots } from '../cap/cap.verb.ts';
import { runTasks, unjudgedWords, type Run, type TaskPhase } from '../record/record.ts';
import type { Workflow } from '../step/step.ts';
import { holdsOf, waitsOf, type ParentRun } from '../wait/wait.ts';
import { listing, type Listing, type RunsListed, type Unjudged } from './list.ts';
import { assess, type Assessment } from '../tick/assess.ts';
import { runSpend, type BranchStanding, type Spend, type SpendOf } from '../status/status.ts';
import type { RetryAsk } from '../retry/index.ts';
import { runStore } from '../record/files.store.ts';
import { stepsOf } from '../record/record.store.ts';
import { branchReader, resultBranches, standingsOf, type BranchReader } from '../branches/branches.store.ts';
import { daemonStanding } from '../daemon/daemon.store.ts';
import {
  closeoutAsked,
  closeoutOf,
  closeoutReader,
  deniedOf,
  exitVerdicts,
  harnessBlocked,
  parentsOf,
  saidCount,
  spendReader,
  taskPhases,
  unjudgedWord,
  viewedOnce,
  waitingOf,
} from '../views/views.verb.ts';
import { engineWord, phaseOfView } from '../views/views-words.ts';
import { checkoutHold } from '../ending/ending.verb.ts';

/**
 * How a caller reads a run (`runReading`): what it already holds, and what it asks to be read. Each left out is read as `wf ls` reads it.
 *
 * @param views The engine's view of every task the run filed, an earlier try's included; left out, read one by one (`taskPhases`).
 * @param steps The steps the run is judged by; left out, its frozen workflow (`stepsOf`).
 * @param shown The steps listed, a line each; left out, `steps`.
 * @param standings Where each result branch stands against the base branch, asked once the run's status is known; left out, every result
 *   branch of the run, asked of git (`standingsOf`).
 * @param slot The cap on runs in flight holding this run (`runSlots`), said where `waiting` would be; left out, none.
 * @param checkout Whether to read the run whose `workspace: main` step holds the repository's own checkout (`checkoutHold`); off, none.
 * @param git The call's branch reader (`branchReader`): one listing of a repository's branches for every run of it.
 * @param parent The runs it waits on and is held until, as `parentsOf` read them; left out, read here.
 */
export type ReadingHow = {
  views?: ReadonlyMap<string, TaskView>;
  steps?: readonly Workflow[];
  shown?: readonly Workflow[];
  standings?: (status: Assessment['status'], steps: readonly Workflow[]) => readonly BranchStanding[];
  slot?: RunSlot;
  checkout?: boolean;
  git?: BranchReader;
  parent?: (id: string) => ParentRun;
};

/**
 * A run as the package reads it once (`runReading`): what `wf ls` lists (`Listing`) and what `assess` says of the run on the same inputs
 * (`assessed`) — with `assessOf` to ask it again of the record as it would stand (a hold lifted), each task's phase as the tick reads it
 * (`phaseOf`), the asks that carried a message (`answers`), what each task cost (`spendOf`), and the whole run's spend (`spend`).
 */
export type RunReading = Listing & {
  assessed: Assessment;
  assessOf: (on: Run) => Assessment;
  phaseOf: (taskId: string) => TaskPhase;
  answers: readonly RetryAsk[];
  spendOf: SpendOf;
  spend: Spend;
};

/**
 * The package's one reading of a run, over one read of each task: what `wf ls` and the api's list both answer from.
 *
 * Each step's status is `listing`'s, the engine's bare word while a step runs (`needs-human`, compared exactly), with what the harness says
 * it waits for and what it was denied as fields beside it. A refused check's verdict is its exit off the engine's record of the check
 * (`exitVerdicts`), never its output or logs: the check prints the code it exits with, so the two agree, and a read of either per refused
 * check would cost every poll of the list. The runs it waits on and is held until are each read once (`parentsOf`), and where its result
 * branches stand is asked once its status is known.
 */
export async function runReading(e: Engine, run: Run, how: ReadingHow = {}): Promise<RunReading> {
  const git = how.git ?? branchReader();
  const steps = how.steps ?? stepsOf(run);
  const views = how.views ?? (await taskPhases(e, run)).views;
  const phaseOf = (taskId: string): TaskPhase => phaseOfView(views.get(taskId));
  const asked = closeoutAsked(views);
  const verdictOf = exitVerdicts(views, run);
  const { asks, rounds } = runStore.asks.read(run.id);
  const answers = runStore.asks.answers(run.id);
  const spendOf = spendReader(views);
  const assessOf = (on: Run): Assessment =>
    assess(steps, on, phaseOf, closeoutReader(views, run), asked, verdictOf, asks, rounds, harnessBlocked(views), spendOf);
  const assessed = assessOf(run);
  const standings = how.standings ? how.standings(assessed.status, steps) : standingsOf(run, git);
  const checkout = how.checkout ? await checkoutHold(e, run, steps) : undefined;
  const parent = how.parent ?? (await parentsOf(e, run, git));
  const listed = listing({
    steps: how.shown ?? steps,
    run,
    phaseOf: engineWord(views),
    closeoutOf: (name) => closeoutOf(views, run, name),
    askedCloseout: asked,
    verdictOf,
    asks,
    roundAsks: rounds,
    answers,
    waits: waitsOf(run, parent),
    saidTo: saidCount(views, run),
    spendOf,
    slot: how.slot,
    standings,
    checkout,
    waitingOf: waitingOf(views),
    deniedOf: deniedOf(views),
    holds: holdsOf(run, parent),
  });
  return { ...listed, assessed, assessOf, phaseOf, answers, spendOf, spend: runSpend(run, spendOf) };
}

/**
 * What `wf ls` shows for one run (`runReading`): every result branch asked of git, and the run holding the checkout read.
 *
 * The phase beside a step is the engine's own word (`running (working)`, `needs-human`), not the narrowed `TaskPhase` the DAG decides on: a
 * person reading the list wants the detail. Where the run's result stands against the base branch is read off git on this call: it is what
 * says a finished run is one nobody has decided.
 */
export const list = (e: Engine, run: Run, slot?: RunSlot, git: BranchReader = branchReader()): Promise<RunReading> =>
  runReading(e, run, { slot, git, checkout: true });

/**
 * `wf ls`'s answer: every run, or the one named, each as `list` reads it, and which daemon ticks the store (`daemonStanding`). The cap
 * on runs in flight is judged over the whole store even for one run; each task is viewed once and each repository's branches listed once
 * (`viewedOnce`, `branchReader`). A run a task journal of which does not read is answered unjudged (`unjudgedOf`); any other failure
 * rejects. Refuses a run named that is not in the store, as `runStore.runs.read` does.
 */
export async function runsListed(e: Engine, runId?: string): Promise<RunsListed> {
  const runs = runId ? [runStore.runs.read(runId)] : runStore.runs.list();
  const listed: RunsListed['runs'] = [];
  if (runs.length) {
    const viewed = viewedOnce(e);
    const git = branchReader();
    git.prime(runs);
    const held = await runSlots(viewed, runId ? runStore.runs.list() : runs);
    for (const run of runs) {
      const read = await list(viewed, run, held.get(run.id), git).catch(async (err: unknown) => {
        const unjudged = await unjudgedOf(viewed, run, err, 'wf ls');
        if (!unjudged) throw err;
        return unjudged;
      });
      listed.push({ run, listed: read, result: resultBranches(run) });
    }
  }
  return { runs: listed, daemon: daemonStanding() };
}

/**
 * A run a read of which rejected with `err`, answered off its record when that is a task journal that does not read (`unreadableJournal`),
 * as the tick leaves such a run where it is: why it is not judged, by `by` (`unjudgedWords`), and each step's word (`unjudgedWord`) off one
 * read of the run's own tasks (`list`), which names every one of them that does not read — a check's and an earlier try's among them.
 * Undefined for any other failure, which the caller throws.
 */
export async function unjudgedOf(e: Engine, run: Run, err: unknown, by: string): Promise<Unjudged | undefined> {
  const why = unreadableJournal(err);
  if (why === undefined) return undefined;
  const tasks = runTasks(run);
  const listed = await e.list(tasks);
  const unreadable = new Map(listed.unreadable.map((u) => [u.taskId, u.why]));
  const named = (err as { taskId: string }).taskId;
  const own = tasks.find((id) => unreadable.has(id)) ?? tasks.find((id) => id === named);
  const word = unjudgedWord(new Map(listed.views.map((v) => [v.id, v])), unreadable);
  return {
    said: unjudgedWords(run.id, own, (own && unreadable.get(own)) ?? why, by),
    steps: stepsOf(run).map(({ name }) => ({ name, status: word(run.steps[name]), branch: run.steps[name]?.branch })),
  };
}

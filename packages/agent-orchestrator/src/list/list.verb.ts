/**
 * `wf ls` (`list`), the pure listing over one read of each task, and the runs nobody judged (`unjudgedOf`). It reads the repository's own
 * checkout as the pass that would file into it reads it (`checkoutHold`, in `ending.verb.ts`). A controller, reaching the runtime through
 * the client (`runtime-client.ts`).
 */
import { unreadableJournal, type Engine } from '../runtime-client.ts';
import type { RunSlot } from '../cap/cap.ts';
import { runTasks, unjudgedWords, type Run } from '../record/record.ts';
import { holdsOf, waitsOf } from '../wait/wait.ts';
import { listing, type Listing } from './list.ts';
import { readAnswers, readAsks, stepsOf } from '../record/record.store.ts';
import { branchReader, standingsOf, type BranchReader } from '../branches/branches.store.ts';
import {
  checkReports,
  closeoutAsked,
  closeoutOf,
  deniedOf,
  parentsOf,
  saidCount,
  spendReader,
  taskPhases,
  unjudgedWord,
  waitingOf,
} from '../views/views.verb.ts';
import { engineWord } from '../views/views-words.ts';
import { checkoutHold } from '../ending/ending.verb.ts';

/**
 * What `wf ls` shows for one run — the pure call, over one read of each task.
 *
 * The phase beside a step is the engine's own word (`running (working)`, `needs-human`), not the
 * narrowed `TaskPhase` the DAG decides on: a person reading the list wants the detail. Only a refused check's log is read, as its exit
 * code is the one number on its line. Where the run's result stands against the base branch is read off git on this call: it is what says
 * a finished run is one nobody has decided.
 */
export async function list(e: Engine, run: Run, slot?: RunSlot, git: BranchReader = branchReader()): Promise<Listing> {
  const steps = stepsOf(run);
  const { views, phaseOf } = await taskPhases(e, run);
  const refused = await checkReports(e, run, steps, phaseOf, (p) => p === 'failed' || p === 'stopped');
  const { asks, rounds } = readAsks(run.id);
  const standings = standingsOf(run, git);
  const checkout = await checkoutHold(e, run, steps);
  const parent = await parentsOf(e, run, git);
  return listing(
    steps,
    run,
    engineWord(views),
    (name) => closeoutOf(views, run, name),
    closeoutAsked(views),
    (name) => refused.get(name)?.verdict,
    asks,
    rounds,
    readAnswers(run.id),
    waitsOf(run, parent),
    saidCount(views, run),
    spendReader(views),
    slot,
    standings,
    checkout,
    waitingOf(views),
    deniedOf(views),
    holdsOf(run, parent),
  );
}

/** A run left unjudged (`unjudgedOf`): why, in one sentence, and each step's word with the branch it works on. */
export type Unjudged = { said: string; steps: Array<{ name: string; status: string; branch?: string }> };

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

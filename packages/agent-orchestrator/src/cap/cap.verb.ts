/**
 * The cap on runs in flight as it holds between passes (`slotsOf`, `runSlots`): every run read as a pass reads it, for `wf ls`, `wf
 * decide`, the repository's checkout and the board's ceilings. A controller, reaching the runtime through the client (`runtime-client.ts`).
 */
import { unreadableJournal, type Engine, type TaskView } from '../runtime-client.ts';
import type { Workflow } from '../workflow.ts';
import { admissionOrder, heldRuns, slotNeed, type RunSlot } from './cap.ts';
import { runTasks, type Run } from '../record/record.ts';
import { hasStarted } from '../wait/wait.ts';
import { assess } from '../tick/assess.ts';
import { runStore } from '../record/files.store.ts';
import { stepsOf } from '../record/record.store.ts';
import { lastCeilings } from '../daemon/daemon.store.ts';
import { maxRuns } from '../config/config.store.ts';
import { closeoutAsked, closeoutReader, exitVerdicts, harnessBlocked, parentsOf, spendReader } from '../views/views.verb.ts';
import { phaseOfView } from '../views/views-words.ts';

/** A run a task of which does not read (`unreadableJournal`), as a pass counts it: in flight, and asking the cap for nothing more. */
const UNJUDGED = { inFlight: true, wants: false } as const;

/**
 * The cap on runs in flight as it holds now (`slotsOf`): `cap`, 0 for none; `inFlight`, the runs that count against it in the order a
 * pass admits them (`admissionOrder`), null with no cap; and `held`, the runs it holds, each with the count it is held at (`heldRuns`).
 */
export type Slots = { cap: number; inFlight: string[] | null; held: Map<string, RunSlot> };

/** `e`, its `view` of a task answered from `listed`, the one look a read took, and of a task filed since by the engine itself. */
const seenIn = (e: Engine, listed: ReadonlyMap<string, TaskView>): Engine => ({
  ...e,
  view: async (taskId: string) => listed.get(taskId) ?? e.view(taskId),
});

/** What a run asks of the cap (`slotNeed`), judged off `listed` and `seen`, as a pass judges it; the run's parents read through `seen`. */
async function needOf(seen: Engine, listed: ReadonlyMap<string, TaskView>, run: Run, steps: Workflow[]) {
  const phaseOf = (taskId: string) => phaseOfView(listed.get(taskId));
  const { asks, rounds } = runStore.asks.read(run.id);
  const a = assess(
    steps,
    run,
    phaseOf,
    closeoutReader(listed, run),
    closeoutAsked(listed),
    exitVerdicts(listed, run),
    asks,
    rounds,
    harnessBlocked(listed),
    spendReader(listed),
  );
  const parent = await parentsOf(seen, run);
  return slotNeed(run, phaseOf, a, (id) => parent(id).shipped, steps);
}

/**
 * The cap on runs in flight, and the runs it counts and holds (`Slots`): every run of `runs` read as a pass reads it, between passes, over
 * one look at the harnesses (`e.list` of every run's tasks) — what `wf ls`, `wf decide`, the repository's checkout and the board's
 * ceilings say. Nothing read with no cap. A record whose workflow does not read is left out, as nothing of it could be filed; a run a task
 * of which does not read, its own or a run's it waits on, is counted in flight (`UNJUDGED`).
 *
 * The cap is the one the last pass ran with (`lastCeilings`), not the caller's environment, which is a shell's and not the daemon's; before
 * any pass has written it, `WF_MAX_RUNS` of `env` (`maxRuns`, refused by name when it is not a count).
 */
export async function slotsOf(
  e: Engine,
  runs: readonly Run[] = runStore.runs.list(),
  env: NodeJS.ProcessEnv = process.env,
): Promise<Slots> {
  const cap = lastCeilings()?.runs ?? maxRuns(env);
  if (cap <= 0) return { cap: 0, inFlight: null, held: new Map() };
  const read = await e.list(runs.flatMap(runTasks));
  const listed = new Map(read.views.map((view) => [view.id, view]));
  const unreadable = new Set(read.unreadable.map((u) => u.taskId));
  const seen = seenIn(e, listed);
  const needs: Array<Pick<Run, 'id' | 'createdAt'> & { inFlight: boolean; wants: boolean }> = [];
  for (const run of runs) {
    let steps: Workflow[];
    try {
      steps = stepsOf(run);
    } catch {
      continue;
    }
    let need: { inFlight: boolean; wants: boolean } = UNJUDGED;
    if (!runTasks(run).some((taskId) => unreadable.has(taskId)))
      need = await needOf(seen, listed, run, steps).catch((err: unknown) => {
        if (unreadableJournal(err) === undefined) throw err;
        return UNJUDGED;
      });
    needs.push({ id: run.id, createdAt: run.createdAt, ...need });
  }
  return { cap, inFlight: admissionOrder(needs.filter((n) => n.inFlight)).map((n) => n.id), held: heldRuns(needs, cap) };
}

/**
 * The runs the cap on runs in flight holds now, each with the count it is held at (`slotsOf`'s `held`). None, and nothing read, with no
 * cap or no run that has nothing filed.
 */
export async function runSlots(e: Engine, runs: readonly Run[] = runStore.runs.list()): Promise<Map<string, RunSlot>> {
  const cap = lastCeilings()?.runs ?? maxRuns();
  if (cap <= 0 || !runs.some((r) => !hasStarted(r) && !r.cancelledAt)) return new Map();
  return (await slotsOf(e, runs)).held;
}

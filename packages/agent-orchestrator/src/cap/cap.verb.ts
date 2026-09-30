/**
 * The cap on runs in flight as it holds between passes (`runSlots`): every run read as a pass reads it, for `wf ls`, `wf decide` and the
 * repository's checkout. A controller, reaching the runtime through the client (`runtime-client.ts`).
 */
import { unreadableJournal, type Engine } from '../runtime-client.ts';
import type { Workflow } from '../workflow.ts';
import { heldRuns, slotNeed, type RunSlot } from './cap.ts';
import type { Run } from '../record/record.ts';
import { hasStarted } from '../wait/wait.ts';
import { assess } from '../tick/assess.ts';
import { runStore } from '../record/files.store.ts';
import { stepsOf } from '../record/record.store.ts';
import { lastCeilings } from '../daemon/daemon.store.ts';
import { maxRuns } from '../config/config.store.ts';
import { closeoutAsked, closeoutReader, exitVerdicts, harnessBlocked, parentsOf, spendReader, taskPhases } from '../views/views.verb.ts';

/** A run a task of which does not read (`unreadableJournal`), as a pass counts it: in flight, and asking the cap for nothing more. */
const UNJUDGED = { inFlight: true, wants: false } as const;

/**
 * The runs the cap on runs in flight holds now, each with the count it is held at (`heldRuns`): every run read as a pass reads it, between
 * passes — what `wf ls` and `wf decide` say. None, and nothing read, with no cap or no run that has nothing filed. A record whose workflow
 * does not read is left out, as nothing of it could be filed; a run a task of which does not read is counted in flight (`UNJUDGED`).
 *
 * The cap is the one the last pass ran with (`lastCeilings`), not the caller's environment, which is a shell's and not the daemon's; before
 * any pass has written it, the caller's own (`WF_MAX_RUNS`, `maxRuns`, refused by name when it is not a count).
 */
export async function runSlots(e: Engine, runs: readonly Run[] = runStore.runs.list()): Promise<Map<string, RunSlot>> {
  const cap = lastCeilings()?.runs ?? maxRuns();
  if (cap <= 0 || !runs.some((r) => !hasStarted(r) && !r.cancelledAt)) return new Map();
  const needs: Array<Pick<Run, 'id' | 'createdAt'> & { inFlight: boolean; wants: boolean }> = [];
  for (const run of runs) {
    let steps: Workflow[];
    try {
      steps = stepsOf(run);
    } catch {
      continue;
    }
    let need: { inFlight: boolean; wants: boolean };
    try {
      const { views, phaseOf } = await taskPhases(e, run);
      const { asks, rounds } = runStore.asks.read(run.id);
      const a = assess(
        steps,
        run,
        phaseOf,
        closeoutReader(views, run),
        closeoutAsked(views),
        exitVerdicts(views, run),
        asks,
        rounds,
        harnessBlocked(views),
        spendReader(views),
      );
      const parent = await parentsOf(e, run);
      need = slotNeed(run, phaseOf, a, (id) => parent(id).shipped, steps);
    } catch (err) {
      if (unreadableJournal(err) === undefined) throw err;
      need = UNJUDGED;
    }
    needs.push({ id: run.id, createdAt: run.createdAt, ...need });
  }
  return heldRuns(needs, cap);
}

/**
 * The cap on runs in flight, and the runs it counts and holds, and what the last pass cost: what the Factory says over its floor
 * (`GET /api/ceilings`, app.ts).
 */
import {
  closeoutAsked,
  closeoutReader,
  exitVerdicts,
  harnessBlocked,
  lastCeilings,
  lastPassCost,
  listRuns,
  parentOf,
  type ParentRun,
  type PassCost,
  phaseOfView,
  readAsks,
  slotWord,
  spendReader,
  stepsOf,
} from 'agent-orchestrator';
import { admissionOrder, assess, gated, heldRuns, type Run, runCapOf, slotNeed } from 'agent-orchestrator/run';
import type { Workflow } from 'agent-orchestrator/workflow';
import { everyView, seenBy } from './store.ts';

/**
 * The cap on runs in flight, as the board says it over the Factory: `2 of 4 run slots taken`, or `no cap`.
 *
 * `last` is what the daemon's last pass ran with (`lastCeilings`, `$WF_ROOT/tick.json`): sessions at work per pool (`WF_MAX_CONCURRENT`) and
 * runs in flight (`WF_MAX_RUNS`, 0 for no cap) — null before any pass has written them. `cap` is the cap a run is judged by, as `wf ls` and
 * `wf decide` judge it (`runSlots`): the last pass's, and before any, the api's own `WF_MAX_RUNS`; 0 for none.
 *
 * `inFlight` names the runs that count against it, oldest first, as a pass counts them (`slotNeed`): a task of the run filed and not settled,
 * or a started run nobody called off with something due. Not the Factory's own count of runs in flight, which also has a run waiting on runs,
 * or held for a slot, whose roots the tick will file. Null with no cap, when nothing is read, as `runSlots` reads nothing. `held` are the runs
 * the cap holds, in the order a pass admits them, each with the count it is held at and `wf ls`'s words on its roots (`heldRuns`, `slotWord`).
 *
 * `pass` is what the last pass cost, phase by phase, as it wrote it (`lastPassCost`, `$WF_ROOT/tick-stats.json`) — what `wf up --stats`
 * prints; null before any pass has written it, or when the file does not read as one.
 */
export type Ceilings = {
  last: { sessions: number; runs: number } | null;
  cap: number;
  inFlight: string[] | null;
  held: Array<{ run: string; inFlight: number; cap: number; word: string }>;
  pass: PassCost | null;
};

/**
 * The cap on runs in flight, and the runs it counts and holds (`Ceilings`), judged as `runSlots` judges them — every run read as a pass reads it,
 * a record whose workflow no longer reads left out — off one observation of the harnesses (`everyView`), which the package's `runSlots` would
 * make once per task. `runSlots` answers the held runs alone, and the count in flight is what the board says; so its judgement is made here
 * with the package's own pure parts (`slotNeed`, `heldRuns`), and the api's test holds `held` to what `runSlots` answers on the same store.
 */
export async function ceilingsOf(): Promise<Ceilings> {
  const last = lastCeilings() ?? null;
  const pass = lastPassCost() ?? null;
  const cap = last?.runs ?? runCapOf(process.env.WF_MAX_RUNS);
  if (cap <= 0) return { last, cap: 0, inFlight: null, held: [], pass };
  const runs = listRuns();
  const views = await everyView();
  const reader = seenBy(views);
  const phase = (taskId: string) => phaseOfView(views.get(taskId));
  const needs: Array<Pick<Run, 'id' | 'createdAt'> & { inFlight: boolean; wants: boolean }> = [];
  for (const run of runs) {
    let steps: Workflow[];
    try {
      steps = stepsOf(run);
    } catch {
      continue;
    }
    const { asks, rounds } = readAsks(run.id);
    const a = assess(
      steps,
      run,
      phase,
      closeoutReader(views, run),
      closeoutAsked(views),
      exitVerdicts(views, run),
      asks,
      rounds,
      harnessBlocked(views),
      spendReader(views),
    );
    const parents = new Map<string, ParentRun>();
    if (gated(run)) for (const id of new Set(run.after)) parents.set(id, await parentOf(reader, id));
    needs.push({ id: run.id, createdAt: run.createdAt, ...slotNeed(run, phase, a, (id) => parents.get(id)?.shipped ?? false, steps) });
  }
  return {
    last,
    cap,
    inFlight: admissionOrder(needs.filter((n) => n.inFlight)).map((n) => n.id),
    held: [...heldRuns(needs, cap)].map(([run, slot]) => ({ run, ...slot, word: slotWord(slot) })),
    pass,
  };
}

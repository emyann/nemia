/**
 * The cap on runs in flight, and the runs it counts and holds, and what the last pass cost: what the Factory says over its floor
 * (`GET /api/ceilings`, app.ts).
 */
import { lastCeilings, lastPassCost, type PassCost, slotWord, slotsOf, runStore } from 'agent-orchestrator';
import type { Engine } from '../store.ts';

/**
 * The cap on runs in flight, as the board says it over the Factory: `2 of 4 run slots taken`, or `no cap`.
 *
 * `last` is what the daemon's last pass ran with (`lastCeilings`, `$WF_ROOT/tick.json`): sessions at work per pool (`WF_MAX_CONCURRENT`)
 * and runs in flight (`WF_MAX_RUNS`, 0 for no cap) — null before any pass has written them. `cap` is the cap a run is judged by, as `wf ls`
 * and `wf decide` judge it (`slotsOf`): the last pass's, and before any, the api's own `WF_MAX_RUNS`; 0 for none.
 *
 * `inFlight` names the runs that count against it, oldest first, as a pass counts them (`slotNeed`): a task of the run filed and not
 * settled, or a started run nobody called off with something due. Not the Factory's own count of runs in flight, which also has a run
 * waiting on runs, or held for a slot, whose roots the tick will file. Null with no cap, when nothing is read.
 * `held` are the runs the cap holds, in the order a pass admits them, each with the count it is held at and `wf ls`'s words on its roots
 * (`heldRuns`, `slotWord`).
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
 * The cap on runs in flight, and the runs it counts and holds (`Ceilings`), as the package judges them between passes (`slotsOf`) — every
 * run read as a pass reads it, off one look at the harnesses — with what the last pass ran with and cost. Read through `e`; the cap, before
 * any pass wrote one, is `WF_MAX_RUNS` of `env`, the app's environment.
 */
export async function ceilingsOf(e: Engine['Service'], env: NodeJS.ProcessEnv): Promise<Ceilings> {
  const { cap, inFlight, held } = await slotsOf(e, runStore.runs.list(), env);
  return {
    last: lastCeilings() ?? null,
    cap,
    inFlight,
    held: [...held].map(([run, slot]) => ({ run, ...slot, word: slotWord(slot) })),
    pass: lastPassCost() ?? null,
  };
}

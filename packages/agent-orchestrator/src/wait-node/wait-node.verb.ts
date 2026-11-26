/**
 * A wait node (`waitsFor:`) filed: its record laid with its checks and no task, the one thing filing it does. Its condition checks are
 * filed by the pass that files any step's checks, once its record says `checking` (`fileChecks`). A controller of the pass.
 */
import { Effect } from 'effect';
import type { Refusal } from '../refusal/refusal.ts';
import type { Run } from '../record/record.ts';
import type { StepSpec } from '../step/step.ts';
import { isWaitNode, waitRecord } from './wait-node.ts';

/** What a pass hands the filing of its wait nodes: a part of its `Filing` (file.verb.ts). */
export type WaitFiling = {
  run: Run;
  reads: { steps: StepSpec[] };
  mayFile: Effect.Effect<boolean, Refusal>;
};

/**
 * Lay the record of each ready wait node, until the pass may file no more: answers with the nodes laid; the caller files the rest.
 * @param f The pass's filing: the run and its steps.
 * @param ready The nodes ready on this pass, in order.
 */
export const fileWaits = Effect.fn('fileWaits')(function* (f: WaitFiling, ready: readonly string[]) {
  const laid: string[] = [];
  for (const name of ready) {
    const step = f.reads.steps.find((s) => s.name === name);
    if (!isWaitNode(step)) continue;
    if (!(yield* f.mayFile)) break;
    f.run.steps[name] = waitRecord(f.run, step);
    laid.push(name);
  }
  return laid;
});

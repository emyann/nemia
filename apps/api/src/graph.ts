import { DEFAULT_ROUNDS, type Workflow } from 'agent-orchestrator/workflow';

/**
 * One edge of a run's graph. `after`: `to` waits on `from`. `loop`: `from` is the looping step, and `to` the step a round
 * runs again — the one edge that points backwards — with `rounds`, how many rounds the loop may run, the first included.
 */
export type GraphEdge =
  | { from: string; to: string; kind: 'after' }
  | { from: string; to: string; kind: 'loop'; rounds: number };

/** A run's steps as a graph: where the run's card leads, and every edge between its steps. */
export type RunGraph = { roots: string[]; edges: GraphEdge[] };

/**
 * The graph of a run's steps, once, for every client to draw: so none derives it from `after` on its own, and a step the
 * api could not read a spec for is not taken for a root.
 *
 * `roots` are the steps with no `after`, in the workflow's order. An `after` edge per step a step waits on, a `loop` edge
 * from each looping step back to its target. Only between the steps given: an `after` or `loop:` naming anything else
 * draws nothing and makes no root of the step — which on a workflow `validate` accepts never happens, and on a record
 * edited by hand keeps every step reachable from the card. Pure.
 */
export function graphOf(steps: readonly Pick<Workflow, 'name' | 'after' | 'loop' | 'rounds'>[]): RunGraph {
  const names = new Set(steps.map((s) => s.name));
  const edges: GraphEdge[] = [];
  const roots: string[] = [];
  for (const step of steps) {
    const after = [...new Set(step.after)].filter((from) => names.has(from) && from !== step.name);
    if (!after.length) roots.push(step.name);
    for (const from of after) edges.push({ from, to: step.name, kind: 'after' });
    if (step.loop && names.has(step.loop) && step.loop !== step.name) {
      // `capOf` in agent-orchestrator's run.ts: a loop that does not say runs the default.
      edges.push({ from: step.name, to: step.loop, kind: 'loop', rounds: step.rounds ?? DEFAULT_ROUNDS });
    }
  }
  return { roots, edges };
}

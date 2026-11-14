/** A run's steps as a graph, its `input` edges included (`inputGraphOf`): read by `summary/graph.ts` and by `contracts/workflow-graph.contract.ts`, which proves the graph `graph.ts` builds on it. */
import { nodeKind, type NodeKind } from '../route/index.ts';
import { DEFAULT_ROUNDS, type StepSpec } from '../step/step.ts';
import type { EdgeKind } from 'objects';

/**
 * One edge of a run's graph, as the list and the run page draw it. `after`: `to` waits on `from`. `loop`: `from` is the looping step, and
 * `to` the step a round runs again — the one edge that points backwards — with `rounds`, how many rounds the loop may run, the first
 * included. `route`: `from` is a condition and `to` a node that runs on `route` (its `when:`), one edge per route it names, in place of
 * the `after` edge between them.
 */
export type GraphEdge =
  | { from: string; to: string; kind: Extract<EdgeKind, 'after'> }
  | { from: string; to: string; kind: Extract<EdgeKind, 'loop'>; rounds: number }
  | { from: string; to: string; kind: Extract<EdgeKind, 'route'>; route: string };

/** One node of a routed graph: its kind (`nodeKind`), the routes a condition ends the run on, the workflow a workflow node files for. */
export type GraphNode = { name: string; kind: NodeKind; ends?: string[]; workflow?: string };

/** `input`: `to` is handed `from`'s declared output (its `input:`). Drawn on the run object's graph alone until the board draws it. */
export type InputEdge = { from: string; to: string; kind: Extract<EdgeKind, 'input'> };

/**
 * A run's steps as a graph: where the run's card leads, and every edge between its steps. `nodes`, each step with its kind, only on a
 * workflow with a condition or a workflow node: a graph with none is the one it was before routing.
 */
export type RunGraph = { roots: string[]; edges: GraphEdge[]; nodes?: GraphNode[] };

/** The run object's graph (`RunGraph`), its `input` edges beside `after`, `loop` and `route`. */
export type ObjectGraph = { roots: string[]; edges: Array<GraphEdge | InputEdge>; nodes?: GraphNode[] };

/** A step as the graph reads it. */
export type GraphStep = Pick<StepSpec, 'name' | 'after' | 'input' | 'loop' | 'rounds' | 'routes' | 'when' | 'ends' | 'workflow'>;

export const nodeOf = (step: GraphStep): GraphNode => ({
  name: step.name,
  kind: nodeKind(step),
  ...(step.ends?.length ? { ends: [...step.ends] } : {}),
  ...(step.workflow !== undefined ? { workflow: step.workflow } : {}),
});

/** The nodes of a routed workflow, or undefined when every step is a step. */
const nodesOf = (steps: readonly GraphStep[]): GraphNode[] | undefined => {
  const nodes = steps.map(nodeOf);
  return nodes.some((n) => n.kind !== 'step') ? nodes : undefined;
};

/** The edges from `from` to `step`: a route edge per route of its `when:` when `from` is a condition, else one `after` edge. */
const edgesFrom = (from: string, step: GraphStep, conditions: ReadonlySet<string>): GraphEdge[] =>
  step.when !== undefined && conditions.has(from)
    ? [...new Set(step.when)].map((route) => ({ from, to: step.name, kind: 'route', route }))
    : [{ from, to: step.name, kind: 'after' }];

/**
 * The graph of a run's steps, once, for every client to draw: so none derives it from `after` on its own, and a step the
 * api could not read a spec for is not taken for a root.
 *
 * `roots` are the steps with no `after`, in the workflow's order. An `after` edge per step a step waits on (a `route` edge per route
 * of its `when:` from the condition it waits on), an `input` edge per step it is handed the output of, a `loop` edge from each looping
 * step back to its target, in that order per step; and `nodes`, on a routed workflow (`nodesOf`). Only
 * between the steps given: an `after`, `input:` or `loop:` naming anything else, or the step itself, draws nothing and makes no
 * root of the step — which on a workflow `validate` accepts never happens, and on a record edited by hand keeps every step
 * reachable from the card. A loop that does not say how many rounds runs the default (`DEFAULT_ROUNDS`), as `capOf` in
 * status/status.ts reads it. Pure.
 */
export function inputGraphOf(steps: readonly GraphStep[]): ObjectGraph {
  const names = new Set(steps.map((s) => s.name));
  const conditions = new Set(steps.filter((s) => s.routes !== undefined).map((s) => s.name));
  const edges: ObjectGraph['edges'] = [];
  const roots: string[] = [];
  for (const step of steps) {
    const after = [...new Set(step.after)].filter((from) => names.has(from) && from !== step.name);
    if (!after.length) roots.push(step.name);
    for (const from of after) edges.push(...edgesFrom(from, step, conditions));
    for (const from of new Set(step.input)) {
      if (names.has(from) && from !== step.name) edges.push({ from, to: step.name, kind: 'input' });
    }
    if (step.loop && names.has(step.loop) && step.loop !== step.name) {
      edges.push({ from: step.name, to: step.loop, kind: 'loop', rounds: step.rounds ?? DEFAULT_ROUNDS });
    }
  }
  const nodes = nodesOf(steps);
  return nodes ? { roots, edges, nodes } : { roots, edges };
}


import { nodeKind, type NodeKind } from '../route/index.ts';
import { DEFAULT_ROUNDS, type Workflow } from '../step/step.ts';

/**
 * One edge of a run's graph, as the list and the run page draw it. `after`: `to` waits on `from`. `loop`: `from` is the looping step, and
 * `to` the step a round runs again — the one edge that points backwards — with `rounds`, how many rounds the loop may run, the first
 * included. `route`: `from` is a condition and `to` a node that runs on `route` (its `when:`), one edge per route it names, in place of
 * the `after` edge between them.
 */
export type GraphEdge =
  | { from: string; to: string; kind: 'after' }
  | { from: string; to: string; kind: 'loop'; rounds: number }
  | { from: string; to: string; kind: 'route'; route: string };

/** One node of a routed graph: its kind (`nodeKind`), the routes a condition ends the run on, the workflow a workflow node files for. */
export type GraphNode = { name: string; kind: NodeKind; ends?: string[]; workflow?: string };

/** `input`: `to` is handed `from`'s declared output (its `input:`). Drawn on the run object's graph alone until the board draws it. */
export type InputEdge = { from: string; to: string; kind: 'input' };

/**
 * A run's steps as a graph: where the run's card leads, and every edge between its steps. `nodes`, each step with its kind, only on a
 * workflow with a condition or a workflow node: a graph with none is the one it was before routing.
 */
export type RunGraph = { roots: string[]; edges: GraphEdge[]; nodes?: GraphNode[] };

/** The run object's graph (`RunGraph`), its `input` edges beside `after`, `loop` and `route`. */
export type ObjectGraph = { roots: string[]; edges: Array<GraphEdge | InputEdge>; nodes?: GraphNode[] };

type GraphStep = Pick<Workflow, 'name' | 'after' | 'input' | 'loop' | 'rounds' | 'routes' | 'when' | 'ends' | 'workflow'>;

const nodeOf = (step: GraphStep): GraphNode => ({
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

/** `inputGraphOf` without its `input` edges: the graph the list and the run page draw. Pure. */
export function graphOf(steps: readonly GraphStep[]): RunGraph {
  const { edges, ...rest } = inputGraphOf(steps);
  return { ...rest, edges: edges.filter((e): e is GraphEdge => e.kind !== 'input') };
}

const withShown = (steps: readonly GraphStep[], names: readonly string[]): GraphStep[] => [
  ...steps,
  ...names.filter((name) => !steps.some((s) => s.name === name)).map((name) => ({ name, after: [] })),
];

/**
 * The graph of the steps a run is judged by (`judgedSteps`) and shown with (`stepNames`): `graphOf` over the judged workflow, then a
 * step with no `after` for each name the run shows beside it, which is a root. One function for the run's page and the list, so a card
 * draws what its page draws.
 */
export function runGraph(steps: readonly GraphStep[], names: readonly string[]): RunGraph {
  return graphOf(withShown(steps, names));
}

/** `runGraph` with the `input` edges: the run object's graph. Pure. */
export function runInputGraph(steps: readonly GraphStep[], names: readonly string[]): ObjectGraph {
  return inputGraphOf(withShown(steps, names));
}

/**
 * The tests' `triage` workflow (`test/fixtures/team/triage`) as its graph reads it, in the order `loadWorkflows` gives its steps:
 * `graph.test.ts` holds it equal to the folder, so the drawing below cannot drift from the folder.
 */
export const TRIAGE: readonly GraphStep[] = [
  { name: 'plan', after: [] },
  { name: 'triage', after: ['plan'], input: ['plan'], routes: ['web', 'backend', 'docs'], ends: ['docs'] },
  { name: 'build-backend', after: ['triage'], when: ['backend'] },
  { name: 'build-web', after: ['triage'], when: ['web'] },
  { name: 'handoff', after: ['triage'], when: ['web'], workflow: 'dev' },
  { name: 'notes', after: ['build-web', 'build-backend'] },
];

const stateId = (name: string): string => name.replace(/[^\w]/g, '_');

const stateLabel = (node: GraphNode): string =>
  node.kind === 'condition'
    ? `${node.name} (condition)`
    : node.kind === 'workflow'
      ? `${node.name} (workflow ${node.workflow ?? ''})`
      : node.name;

const edgeLine = (e: GraphEdge): string => {
  const head = `  ${stateId(e.from)} --> ${stateId(e.to)}`;
  return e.kind === 'route' ? `${head}: ${e.route}` : e.kind === 'loop' ? `${head}: again (rounds ${e.rounds})` : head;
};

/** How a node ends the run: a condition on each route in its `ends:`, a workflow node once its card is filed, a leaf once it ran. */
const endLines = (node: GraphNode, edges: readonly GraphEdge[]): string[] => {
  const id = stateId(node.name);
  const ends = (node.ends ?? []).map((route) => `  ${id} --> [*]: ${route} (ends)`);
  if (node.kind === 'workflow') return [...ends, `  ${id} --> [*]: sent`];
  const leaf = !edges.some((e) => e.from === node.name && e.kind !== 'loop');
  return leaf && node.kind === 'step' ? [...ends, `  ${id} --> [*]`] : ends;
};

/**
 * A workflow drawn as a Mermaid state diagram: the card leads to each root, an edge per `after`, a labelled edge per route and loop, and
 * each way the run ends. Given no graph, the tests' `triage` workflow (`TRIAGE`), for `docs/model.md`'s `diagram:workflow`. Pure.
 */
export const routedDiagram = (graph: RunGraph = graphOf(TRIAGE)): string => {
  const nodes =
    graph.nodes ??
    [...new Set(graph.edges.flatMap((e) => [e.from, e.to]).concat(graph.roots))].map((name) => ({ name, kind: 'step' as const }));
  return [
    'stateDiagram-v2',
    ...graph.roots.map((root) => `  [*] --> ${stateId(root)}`),
    ...nodes.map((n) => `  state "${stateLabel(n)}" as ${stateId(n.name)}`),
    ...graph.edges.map(edgeLine),
    ...nodes.flatMap((n) => endLines(n, graph.edges)),
  ].join('\n');
};

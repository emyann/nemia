import type { TypedGraphOf } from '../../contracts/workflow-graph.contract.ts';
import {
  inputGraphOf,
  nodeOf,
  type GraphEdge,
  type GraphNode,
  type GraphStep,
  type ObjectGraph,
  type RunGraph,
} from './input-graph/input-graph.ts';

export {
  inputGraphOf,
  type GraphEdge,
  type GraphNode,
  type GraphStep,
  type InputEdge,
  type ObjectGraph,
  type RunGraph,
} from './input-graph/input-graph.ts';

export type { TypedGraph } from '../../contracts/workflow-graph.contract.ts';

/**
 * A Workflow object's graph: the run's (`inputGraphOf`), with every node and its kind on every workflow, routed or not, so a client never
 * infers a node's kind from its step's keys. Its laws are `contracts/workflow-graph.contract.ts`'s.
 */
export const typedGraphOf: TypedGraphOf = (steps) => {
  const run = inputGraphOf(steps);
  return { roots: run.roots, edges: run.edges, nodes: steps.map(nodeOf) };
};

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

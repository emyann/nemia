/**
 * A Workflow object's typed graph (agent-orchestrator, src/summary/graph.ts, `typedGraphOf`): the graph a run of the workflow would draw,
 * its `input` edges included (`inputGraphOf`), with every node named and its kind on it — a step, a condition or a workflow node — on
 * every workflow, routed or not, so a client never infers a node's kind from the keys of its step (decision 12 of resource-objects).
 */
import { type Implementation, assume, spec } from '@emyann/tsverify';
import { type ObjectGraph, inputGraphOf } from '../src/summary/graph.ts';

/** A step as the graph reads it: the keys `inputGraphOf` takes. */
type GraphStep = Parameters<typeof inputGraphOf>[0][number];

/** A Workflow's graph: the run's graph with its nodes always there. */
export type TypedGraph = Omit<ObjectGraph, 'nodes'> & { nodes: NonNullable<ObjectGraph['nodes']> };

/** Whether no two of `steps` share a name, as the loader holds of every workflow it reads. */
const distinct = (steps: readonly GraphStep[]): boolean => steps.every((s, i) => !steps.slice(0, i).some((t) => t.name === s.name));

/** The run's graph of the same steps: the verifier takes it as a pure function, read the same by the laws and the code. */
export const runsGraph = assume(inputGraphOf, { pure: true });

/** An edge of the graph, as both the run's and the typed graph draw them. */
type Edge = TypedGraph['edges'][number];

/** Whether two numbers are the same number, NaN the same as NaN, as a copy of one is. */
const sameNumber = (a: number, b: number): boolean => a === b || (a !== a && b !== b);

/** Whether two edges are the same: their ends, their kind, and a loop's rounds or a route's route. */
const sameEdge = (a: Edge, b: Edge | undefined): boolean =>
  b !== undefined &&
  a.from === b.from &&
  a.to === b.to &&
  a.kind === b.kind &&
  (a.kind !== 'loop' || (b.kind === 'loop' && sameNumber(a.rounds, b.rounds))) &&
  (a.kind !== 'route' || (b.kind === 'route' && a.route === b.route));

const typedGraphOfSpec = spec<(steps: readonly GraphStep[]) => TypedGraph>({
  requires: ({ input: [steps] }) => distinct(steps),
  ensures: {
    everyStepANode: {
      description: "Every step of the workflow is one node of its graph, in the workflow's order",
      condition: ({ input: [steps], output }) =>
        output.nodes.length === steps.length && output.nodes.every((n, i) => n.name === steps[i]?.name),
    },
    conditionByItsRoutes: {
      description: 'A node is a condition exactly when its step names routes',
      condition: ({ input: [steps], output }) =>
        output.nodes.every((n, i) => (n.kind === 'condition') === (steps[i]?.routes !== undefined)),
    },
    workflowNodeByItsWorkflow: {
      description: 'A node that is no condition is a workflow node exactly when its step names a workflow, and names it',
      condition: ({ input: [steps], output }) =>
        output.nodes.every((n, i) => {
          const step = steps[i];
          if (step === undefined || step.routes !== undefined) return true;
          return (n.kind === 'workflow') === (step.workflow !== undefined) && (n.kind !== 'workflow' || n.workflow === step.workflow);
        }),
    },
    theRunsEdges: {
      description: "The graph's roots and edges are those a run of the same steps draws, its input edges among them",
      condition: ({ input: [steps], output }) => {
        const run = inputGraphOf(steps);
        return (
          run.roots.length === output.roots.length &&
          run.roots.every((r, i) => output.roots.at(i) === r) &&
          run.edges.length === output.edges.length &&
          run.edges.every((e, i) => sameEdge(e, output.edges.at(i)))
        );
      },
    },
  },
});

/** `typedGraphOf`'s type, which `src/summary/graph.ts` takes. */
export type TypedGraphOf = Implementation<typeof typedGraphOfSpec>;

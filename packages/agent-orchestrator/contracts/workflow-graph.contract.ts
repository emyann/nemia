/**
 * A Workflow object's typed graph (agent-orchestrator, src/summary/graph.ts, `typedGraphOf`): the graph a run of the workflow would draw,
 * its `input` edges included (`inputGraphOf`), with every node named and its kind on it — a step, a condition or a workflow node — on
 * every workflow, routed or not, so a client never infers a node's kind from the keys of its step (decision 12 of resource-objects).
 */
import { type Implementation, spec } from '@emyann/tsverify';
import { type ObjectGraph, inputGraphOf } from '../src/summary/graph.ts';

/** A step as the graph reads it: the keys `inputGraphOf` takes. */
type GraphStep = Parameters<typeof inputGraphOf>[0][number];

/** A Workflow's graph: the run's graph with its nodes always there. */
export type TypedGraph = Omit<ObjectGraph, 'nodes'> & { nodes: NonNullable<ObjectGraph['nodes']> };

/** Whether no two of `steps` share a name, as the loader holds of every workflow it reads. */
const distinct = (steps: readonly GraphStep[]): boolean => new Set(steps.map((s) => s.name)).size === steps.length;

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
        return JSON.stringify(run.roots) === JSON.stringify(output.roots) && JSON.stringify(run.edges) === JSON.stringify(output.edges);
      },
    },
  },
});

/** `typedGraphOf`'s type, which `src/summary/graph.ts` takes. */
export type TypedGraphOf = Implementation<typeof typedGraphOfSpec>;

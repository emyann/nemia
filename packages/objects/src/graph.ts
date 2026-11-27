/**
 * The graph of a workflow's steps, as a Run serves it (`status.graph`) and a Workflow serves it (`status.graph`, its nodes always there):
 * the one shape both kinds carry, so no client keeps two (decision 12 of resource-objects). Plain Schemas of JSON, the encoding of the
 * Run's graph unchanged by the move out of `run.ts`.
 */
import { Schema } from 'effect';
import { describedOne } from './meta.ts';
import { NODE_KINDS } from './words.ts';

const List = <S extends Schema.Top>(item: S) => Schema.mutable(Schema.Array(item));
const Strings = List(Schema.String);

/** One edge of the graph (`GraphEdge`, the orchestrator's graph.ts), its kind one of `EDGE_KINDS`. */
export const GraphEdge = Schema.Union([
  Schema.Struct({
    from: Schema.String.annotate({ description: 'The step the edge leaves; the one the other waits on.' }),
    to: Schema.String.annotate({ description: 'The step that waits on from.' }),
    kind: Schema.Literal('after').annotate({ description: 'after: to waits on from.' }),
  }),
  Schema.Struct({
    from: Schema.String.annotate({ description: 'The step whose declared output is handed on.' }),
    to: Schema.String.annotate({ description: 'The step handed that output in its brief.' }),
    kind: Schema.Literal('input').annotate({ description: 'input: to is handed the declared output of from.' }),
  }),
  Schema.Struct({
    from: Schema.String.annotate({ description: 'The looping step.' }),
    to: Schema.String.annotate({ description: 'The step a round runs again; the one edge that points backwards.' }),
    kind: Schema.Literal('loop').annotate({ description: 'loop: from loops back to run to again.' }),
    rounds: describedOne(Schema.Finite, 'How many rounds the loop may run, the first included.'),
  }),
  Schema.Struct({
    from: Schema.String.annotate({ description: 'The condition that routes.' }),
    to: Schema.String.annotate({ description: 'The node that runs on the route.' }),
    kind: Schema.Literal('route').annotate({
      description: 'route: to runs on the route of from that its when: names, in place of the after edge between them.',
    }),
    route: Schema.String.annotate({ description: 'The route of the condition on which to runs.' }),
  }),
]);
export type GraphEdge = typeof GraphEdge.Type;

/** One node of the graph (`GraphNode`, graph.ts): a step, a condition with the routes it ends on, or a route to a workflow. */
export const GraphNode = Schema.Struct({
  name: Schema.String.annotate({ description: "The node's name, its step's." }),
  kind: Schema.Literals(NODE_KINDS).annotate({
    description: 'What the node is: a step, a condition that routes, or a workflow node that starts a run of another workflow.',
  }),
  ends: Schema.optionalKey(Strings.annotate({ description: 'The routes of a condition on which the run ends.' })),
  workflow: Schema.optionalKey(Schema.String.annotate({ description: 'The workflow a workflow node starts a run of.' })),
});
export type GraphNode = typeof GraphNode.Type;

/** A Run's graph: where its card leads, every edge, and its nodes on a routed workflow alone. */
export const ObjectGraph = Schema.Struct({
  roots: Strings.annotate({ description: "Where the run's card leads: the steps with no after, in the workflow's order." }),
  edges: List(GraphEdge).annotate({ description: 'Every edge between the steps.' }),
  nodes: Schema.optionalKey(
    List(GraphNode).annotate({ description: 'Each step with its kind, on a workflow with a condition or a workflow node alone.' }),
  ),
});
export type ObjectGraph = typeof ObjectGraph.Type;

/** A Workflow's graph: the Run's, with every node and its kind on every workflow, routed or not. */
export const TypedGraph = Schema.Struct({
  roots: Strings.annotate({ description: "The steps with no after, in the workflow's order." }),
  edges: List(GraphEdge).annotate({ description: 'Every edge between the steps.' }),
  nodes: List(GraphNode).annotate({ description: 'Every node with its kind, on every workflow.' }),
});
export type TypedGraph = typeof TypedGraph.Type;

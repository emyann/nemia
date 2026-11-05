/**
 * The graph of a workflow's steps, as a Run serves it (`status.graph`) and a Workflow serves it (`status.graph`, its nodes always there):
 * the one shape both kinds carry, so no client keeps two (decision 12 of resource-objects). Plain Schemas of JSON, the encoding of the
 * Run's graph unchanged by the move out of `run.ts`.
 */
import { Schema } from 'effect';
import { NODE_KINDS } from './words.ts';

const List = <S extends Schema.Top>(item: S) => Schema.mutable(Schema.Array(item));
const Strings = List(Schema.String);

/** One edge of the graph (`GraphEdge`, the orchestrator's graph.ts), its kind one of `EDGE_KINDS`. */
export const GraphEdge = Schema.Union([
  Schema.Struct({ from: Schema.String, to: Schema.String, kind: Schema.Literal('after') }),
  Schema.Struct({ from: Schema.String, to: Schema.String, kind: Schema.Literal('input') }),
  Schema.Struct({ from: Schema.String, to: Schema.String, kind: Schema.Literal('loop'), rounds: Schema.Finite }),
  Schema.Struct({ from: Schema.String, to: Schema.String, kind: Schema.Literal('route'), route: Schema.String }),
]);
export type GraphEdge = typeof GraphEdge.Type;

/** One node of the graph (`GraphNode`, graph.ts): a step, a condition with the routes it ends on, or a route to a workflow. */
export const GraphNode = Schema.Struct({
  name: Schema.String,
  kind: Schema.Literals(NODE_KINDS),
  ends: Schema.optionalKey(Strings),
  workflow: Schema.optionalKey(Schema.String),
});
export type GraphNode = typeof GraphNode.Type;

/** A Run's graph: where its card leads, every edge, and its nodes on a routed workflow alone. */
export const ObjectGraph = Schema.Struct({ roots: Strings, edges: List(GraphEdge), nodes: Schema.optionalKey(List(GraphNode)) });
export type ObjectGraph = typeof ObjectGraph.Type;

/** A Workflow's graph: the Run's, with every node and its kind on every workflow, routed or not. */
export const TypedGraph = Schema.Struct({ roots: Strings, edges: List(GraphEdge), nodes: List(GraphNode) });
export type TypedGraph = typeof TypedGraph.Type;

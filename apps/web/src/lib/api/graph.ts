/**
 * A run's steps as a graph, as agent-orchestrator draws it off the workflow (`runGraph`), which the api answers on a run's detail, each
 * type with the schema `get` decodes it with.
 */
import { Schema } from 'effect';
import { decodes } from './decodes.ts';

/**
 * Mirrors `GraphEdge` in agent-orchestrator: `after`, `to` waits on `from`; `loop`, `from` runs `to` again; `route`, `to` runs on the
 * route `from`, a condition, answers.
 */
export type GraphEdge =
  | { from: string; to: string; kind: 'after' }
  | { from: string; to: string; kind: 'loop'; rounds: number }
  | { from: string; to: string; kind: 'route'; route: string };

/** Decodes a `GraphEdge`, either kind. */
export const GraphEdgeSchema = decodes<GraphEdge>()(
  Schema.Union([
    Schema.Struct({ from: Schema.String, to: Schema.String, kind: Schema.Literal('after') }),
    Schema.Struct({ from: Schema.String, to: Schema.String, kind: Schema.Literal('loop'), rounds: Schema.Number }),
    Schema.Struct({ from: Schema.String, to: Schema.String, kind: Schema.Literal('route'), route: Schema.String }),
  ]),
);

/** Mirrors `RunGraph` in agent-orchestrator: the steps the run's card leads to, and every edge between steps. */
export type RunGraph = { roots: string[]; edges: GraphEdge[]; nodes?: GraphNode[] };

/** Mirrors `GraphNode` in agent-orchestrator: a step, a condition with the routes it ends on, or a route to a workflow. */
export type GraphNode = { name: string; kind: 'step' | 'condition' | 'workflow'; ends?: string[]; workflow?: string };

/** Decodes a `GraphNode`. */
const GraphNodeSchema = decodes<GraphNode>()(
  Schema.Struct({
    name: Schema.String,
    kind: Schema.Literals(['step', 'condition', 'workflow']),
    ends: Schema.optionalKey(Schema.mutable(Schema.Array(Schema.String))),
    workflow: Schema.optionalKey(Schema.String),
  }),
);

/** Decodes a `RunGraph`. */
export const RunGraphSchema = decodes<RunGraph>()(
  Schema.Struct({
    roots: Schema.mutable(Schema.Array(Schema.String)),
    edges: Schema.mutable(Schema.Array(GraphEdgeSchema)),
    nodes: Schema.optionalKey(Schema.mutable(Schema.Array(GraphNodeSchema))),
  }),
);

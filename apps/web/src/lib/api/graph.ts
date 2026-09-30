/** A run's steps as a graph, as the api draws it off the workflow (apps/api/src/runs/graph.ts), each type with the schema `get` decodes it with. */
import { Schema } from 'effect';

/** Mirrors `GraphEdge` in apps/api/src/runs/graph.ts: `after`, `to` waits on `from`; `loop`, `from` runs `to` again. */
export type GraphEdge = { from: string; to: string; kind: 'after' } | { from: string; to: string; kind: 'loop'; rounds: number };

/** Decodes a `GraphEdge`, either kind. */
export const GraphEdgeSchema = Schema.Union([
  Schema.Struct({ from: Schema.String, to: Schema.String, kind: Schema.Literal('after') }),
  Schema.Struct({ from: Schema.String, to: Schema.String, kind: Schema.Literal('loop'), rounds: Schema.Number }),
]) satisfies Schema.Schema<GraphEdge>;

/** Mirrors `RunGraph` in apps/api/src/runs/graph.ts: the steps the run's card leads to, and every edge between steps. */
export type RunGraph = { roots: string[]; edges: GraphEdge[] };

/** Decodes a `RunGraph`. */
export const RunGraphSchema = Schema.Struct({
  roots: Schema.mutable(Schema.Array(Schema.String)),
  edges: Schema.mutable(Schema.Array(GraphEdgeSchema)),
}) satisfies Schema.Schema<RunGraph>;

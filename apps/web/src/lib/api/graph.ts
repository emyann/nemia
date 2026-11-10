/** A run's graph as the board draws it, read off `objects`' (`ObjectGraph`, `GraphEdge`, `GraphNode`). */
import type { GraphEdge as GraphEdgeAnswer, ObjectGraph } from 'objects';

export type { GraphNode } from 'objects';

/** An edge between steps the board draws: every kind but `input`, what a step is handed, which it draws none of. */
export type GraphEdge = Exclude<GraphEdgeAnswer, { kind: 'input' }>;

/** The steps the run's card leads to, and every edge between steps the board draws. */
export type RunGraph = Omit<ObjectGraph, 'edges'> & { edges: GraphEdge[] };

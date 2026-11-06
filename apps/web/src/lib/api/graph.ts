/**
 * A run's steps as a graph, as agent-orchestrator draws it off the workflow (`runGraph`), as the board's row of a run holds it
 * (`runRowOf`): the Run's own graph, without what a step is handed, its kinds `objects`' (`EdgeKind`, `NodeKind`).
 */
import type { EdgeKind, NodeKind } from 'objects';

/**
 * Mirrors `GraphEdge` in agent-orchestrator: `after`, `to` waits on `from`; `loop`, `from` runs `to` again; `route`, `to` runs on the
 * route `from`, a condition, answers.
 */
export type GraphEdge =
  | { from: string; to: string; kind: Extract<EdgeKind, 'after'> }
  | { from: string; to: string; kind: Extract<EdgeKind, 'loop'>; rounds: number }
  | { from: string; to: string; kind: Extract<EdgeKind, 'route'>; route: string };

/** Mirrors `RunGraph` in agent-orchestrator: the steps the run's card leads to, and every edge between steps. */
export type RunGraph = { roots: string[]; edges: GraphEdge[]; nodes?: GraphNode[] };

/** Mirrors `GraphNode` in agent-orchestrator: a step, a condition with the routes it ends on, or a route to a workflow. */
export type GraphNode = { name: string; kind: NodeKind; ends?: string[]; workflow?: string };

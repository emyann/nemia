/**
 * What the canvases draw of a routed workflow: which node is a condition or a workflow node (the graph's `nodes`), and on a run, the route
 * each condition took. The run object carries no route of its own, so it is read off the step's sentence, in the words the orchestrator's
 * listing writes them (`routedRows`): `routed: <route>` on a condition, `skipped (<condition>: <route>)` on a node off the route, and
 * `· proposes <route>` after a gated condition's word. What a workflow node sent is the step's own `sent`, never read from a sentence. Its state is never read from there: that is the codes' (`status.ts`). Pure.
 */
import type { RunGraph } from './api/graph.ts';
import type { Frozen } from './frozen.ts';

/** What a step's sentence says of its routing: the route its condition answered or proposes, the card a workflow node sent. */
export type Routed =
  | { kind: 'routed'; route: string }
  | { kind: 'proposes'; route: string }
  | { kind: 'skipped'; condition: string; route: string };

const ROUTED = /^routed: (\S+)/;
const PROPOSES = / · proposes (\S+)$/;
const SKIPPED = /^skipped \((\S+): (\S+)\)/;

/**
 * What `message`, a step's sentence, says of its routing; null for a sentence that says none.
 * @param message The step's sentence, as the listing writes it.
 */
export function routedOf(message: string) {
  const skipped = SKIPPED.exec(message);
  if (skipped?.[1] && skipped[2]) return { kind: 'skipped', condition: skipped[1], route: skipped[2] } satisfies Routed | null;
  const routed = ROUTED.exec(message);
  if (routed?.[1]) return { kind: 'routed', route: routed[1] } satisfies Routed | null;
  const proposes = PROPOSES.exec(message);
  if (proposes?.[1]) return { kind: 'proposes', route: proposes[1] } satisfies Routed | null;
  return null satisfies Routed | null;
}

/**
 * Each node of the graph that is no plain step, by name: none for a workflow with no condition and no workflow node.
 * @param graph The run's graph.
 */
export function nodeKinds(graph: Frozen<RunGraph>) {
  return new Map((graph.nodes ?? []).filter((n) => n.kind !== 'step').map((n) => [n.name, n]));
}

/**
 * The route each condition of a run took, by its name: its own sentence's (`routed: <route>`), else the one a node it passed by names
 * (`skipped (<condition>: <route>)`), which is how a condition its session answered is known. None for a condition not answered yet.
 * @param steps The run's steps, each with its name and its sentence.
 */
export function takenRoutes(steps: ReadonlyArray<{ name: string; message: string }>) {
  const taken = new Map<string, string>();
  for (const step of steps) {
    const routed = routedOf(step.message);
    if (routed?.kind === 'routed') taken.set(step.name, routed.route);
  }
  for (const step of steps) {
    const routed = routedOf(step.message);
    if (routed?.kind === 'skipped' && !taken.has(routed.condition)) taken.set(routed.condition, routed.route);
  }
  return taken;
}

/**
 * The routes a condition answers in its graph, in the graph's order: each its route edges name, then each it ends on.
 * @param graph The run's graph.
 * @param condition The condition's name.
 */
export function routesOf(graph: Frozen<RunGraph>, condition: string) {
  const routes = graph.edges.flatMap((e) => (e.kind === 'route' && e.from === condition ? [e.route] : []));
  const ends = nodeKinds(graph).get(condition)?.ends ?? [];
  return [...new Set([...routes, ...ends])];
}

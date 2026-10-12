/**
 * A state machine's graph as the board draws it: where each state's box goes, and the route and label of each edge between two states,
 * computed by dagre and never placed by hand.
 *
 * Two kinds of edge are gathered before the layout, so no two are drawn over each other: an edge back to its own state is written on
 * that state's box (`stays`), and the edges between the same two states are one drawn edge (`Route`). Either way the edges are listed
 * by the action they take — the events, each with its guard, then the action — so every edge of the graph is one event line, in
 * exactly one place. A verb a person writes from outside the machine joins the route of each state it is taken from to the state it
 * leads to, a line of its own under the edges (`verbOf`); a route no edge takes, only a person's verb, is dashed. Read top to bottom: the
 * first state at the top, the final ones at the bottom.
 *
 * Pure: sizes come from the number of lines and their length in the monospace the canvas writes them in, not from a measured page.
 */
import { Graph, layout } from '@dagrejs/dagre';
import type { MachineEdge, MachineGraph, MachineVerb } from './api/machines.ts';

export type Point = { x: number; y: number };

/** The edges one list gathers that take the same action: each edge's event with its guard (`eventOf`), and the action. */
export type ByAction = { action: string; events: string[] };

/** A state's box: its top-left corner and size, whether the machine starts or can end there, and the edges back to it. */
export type StateBox = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  initial: boolean;
  final: boolean;
  stays: ByAction[];
};

/** A stretch of a route drawn straight, at `x` from the `enter` y to the `leave` y, down or back up: where it crosses one rank. */
export type Leg = { x: number; enter: number; leave: number };

/**
 * The edges and verbs from one state to another, drawn as one: its SVG path, its edges by action, its verbs (`verbOf`), whether it is
 * dashed — no edge takes it, only a person's verb — and the box its label sits in, by its centre.
 */
export type Route = {
  id: string;
  from: string;
  to: string;
  edges: ByAction[];
  verbs: string[];
  dashed: boolean;
  path: string;
  label: Point & { width: number; height: number };
};

/** A machine laid out: its boxes, its routes, and the size of the whole. */
export type Drawing = { states: StateBox[]; routes: Route[]; width: number; height: number };

/** How wide one character of an event is drawn, in pixels: mono at the small body role, 12 px and its tracking. */
export const CHAR_WIDTH = 6.9;
/** How tall one line of an edge list is, in pixels (`leading-4`). */
export const LINE_HEIGHT = 16;
/** How tall a state's head is: what kind of state it is, and its name. */
export const HEAD_HEIGHT = 52;
/** How much a list adds to its lines across: its padding and its border. */
export const PAD_X = 22;
/** How much a list adds to its lines down: its padding and its border. */
export const PAD_Y = 10;
/** A state's box is never narrower than its name and its kind need. */
export const MIN_WIDTH = 128;

/** An edge's event, with its guard in brackets when it has one. */
export const eventOf = (edge: MachineEdge): string => `${edge.event}${edge.guard ? ` [${edge.guard}]` : ''}`;

/** A verb as its route lists it: the verb, with the guard its refusal asks first in brackets. */
export const verbOf = (verb: Pick<MachineVerb, 'verb' | 'guard'>): string => `${verb.verb} [${verb.guard}]`;

/** `edges` gathered by action, each action once in the order its first edge comes, its events in the table's order. */
export function byAction(edges: readonly MachineEdge[]): ByAction[] {
  const groups = new Map<string, ByAction>();
  for (const edge of edges) {
    const group = groups.get(edge.action) ?? { action: edge.action, events: [] };
    group.events.push(eventOf(edge));
    groups.set(edge.action, group);
  }
  return [...groups.values()];
}

/** How many lines a list takes: one per event, and one per action. */
export const linesOf = (list: readonly ByAction[]): number => list.reduce((n, g) => n + g.events.length + 1, 0);

/** How wide a list is drawn: its longest event, or its longest action behind its arrow. */
const widthOf = (list: readonly ByAction[]) =>
  Math.max(0, ...list.flatMap((g) => [...g.events.map((e) => e.length), g.action.length + 2])) * CHAR_WIDTH + PAD_X;

/** A state's box size: its head, and under it the edges back to it. */
export const stateSize = (stays: readonly ByAction[]): { width: number; height: number } => ({
  width: Math.ceil(Math.max(MIN_WIDTH, widthOf(stays))),
  height: HEAD_HEIGHT + (stays.length ? LINE_HEIGHT * linesOf(stays) + PAD_Y : 0),
});

/** A route's label size: its edges' lines, and a line per verb (`verbOf`). */
export const labelSize = (edges: readonly ByAction[], verbs: readonly string[] = []): { width: number; height: number } => ({
  width: Math.ceil(Math.max(widthOf(edges), Math.max(0, ...verbs.map((v) => v.length)) * CHAR_WIDTH + PAD_X)),
  height: LINE_HEIGHT * (linesOf(edges) + verbs.length) + PAD_Y,
});

/**
 * How much more a route an edge takes weighs than one only a person's verb takes, when dagre orders each rank: the machine's own routes
 * hold the layout, and the verbs' are laid round them.
 */
export const EDGE_WEIGHT = 2;

/** How far a route's end stays from either side of its state's box. */
export const END_INSET = 12;

/**
 * Half the height of each rank's band, by the rank's y: half its tallest box, a state's or a label's. Dagre lays every box of a rank
 * across one band and leaves the gap between two bands empty; a rank of a route's bends alone is a line, of half height 0.
 */
function bandsOf(boxes: readonly { y: number; height: number }[]): (y: number) => number {
  const half = new Map<number, number>();
  for (const { y, height } of boxes) half.set(Math.round(y), Math.max(half.get(Math.round(y)) ?? 0, height / 2));
  return (y) => half.get(Math.round(y)) ?? 0;
}

/** Where a route's end meets its state's box: across at `x`, kept `END_INSET` inside the box. */
const acrossIn = (x: number, box: StateBox) => Math.min(Math.max(x, box.x + END_INSET), box.x + box.width - END_INSET);

/**
 * A route's legs, one per rank it crosses, in the order it travels them: out of `from` to the edge of its band, through each band at the
 * bend dagre placed there (`points` between the first and the last), and from the edge of the band of `to` into it. A route goes down
 * out of the foot of `from` onto the head of `to`, or, back up, out of the head of `from` into the foot of `to`. Dagre keeps each bend
 * clear of the other boxes of its rank, so a leg runs past them, never through one.
 */
function legsOf(points: readonly Point[], from: StateBox, to: StateBox, half: (y: number) => number): Leg[] {
  const [out, into] = [from.y + from.height / 2, to.y + to.height / 2];
  const way = into >= out ? 1 : -1;
  return [
    { x: acrossIn(points[0]?.x ?? 0, from), enter: out + (way * from.height) / 2, leave: out + way * half(out) },
    ...points.slice(1, -1).map((p) => ({ x: p.x, enter: p.y - way * half(p.y), leave: p.y + way * half(p.y) })),
    { x: acrossIn(points[points.length - 1]?.x ?? 0, to), enter: into - way * half(into), leave: into - (way * to.height) / 2 },
  ];
}

/** What joins one state to another: the edges between them, and the verbs a person takes from the one to the other. */
type Pair = { from: string; to: string; edges: MachineEdge[]; verbs: string[] };

/**
 * The pairs of states an edge or a verb joins, by `from->to`, each once: an edge back to its own state is no pair, and a verb joins one
 * pair for each state it is taken from. Edges come first, in the table's order, then the pairs only verbs join.
 */
function pairsOf(edges: readonly MachineEdge[], verbs: readonly MachineVerb[]): Map<string, Pair> {
  const pairs = new Map<string, Pair>();
  const pairOf = (from: string, to: string) => {
    const id = `${from}->${to}`;
    const pair = pairs.get(id) ?? { from, to, edges: [], verbs: [] };
    pairs.set(id, pair);
    return pair;
  };
  for (const edge of edges) if (edge.from !== edge.to) pairOf(edge.from, edge.to).edges.push(edge);
  for (const verb of verbs) for (const from of verb.from) pairOf(from, verb.to).verbs.push(verbOf(verb));
  return pairs;
}

/** Every state of `graph`: those it lists, then any an edge or a verb names that it does not, each once. */
function namesOf(graph: Pick<MachineGraph, 'states' | 'edges' | 'verbs'>): string[] {
  const named = [...graph.edges.flatMap((e) => [e.from, e.to]), ...graph.verbs.flatMap((v) => [...v.from, v.to])];
  return [...new Set([...graph.states, ...named])];
}

/** The edges back to `state` itself, by action: what its box lists. */
const staysOf = (edges: readonly MachineEdge[], state: string): ByAction[] =>
  byAction(edges.filter((e) => e.from === state && e.to === state));

/** A route out of a state as the frame's bar lists it: the state it leads to, its edges by action, and its verbs (`verbOf`). */
export type RouteOut = { to: string; edges: ByAction[]; verbs: string[] };

/** What one state of a machine is: whether the machine starts or can end there, the edges back to it, and each route out of it. */
export type StateFacts = { initial: boolean; final: boolean; stays: ByAction[]; routes: RouteOut[] };

/**
 * What `state` of `graph` is, read as `drawMachine` reads it, so the frame's bar lists what the drawing draws: its kind, its stays and
 * each route out of it, in the drawing's order. None for a state neither the graph nor any of its edges or verbs names.
 */
export function stateFacts(
  graph: Pick<MachineGraph, 'initial' | 'states' | 'final' | 'edges' | 'verbs'>,
  state: string,
): StateFacts | undefined {
  if (!namesOf(graph).includes(state)) return undefined;
  const routes = [...pairsOf(graph.edges, graph.verbs).values()]
    .filter((pair) => pair.from === state)
    .map(({ to, edges, verbs }) => ({ to, edges: byAction(edges), verbs }));
  return { initial: state === graph.initial, final: graph.final.includes(state), stays: staysOf(graph.edges, state), routes };
}

/**
 * The machine laid out top to bottom by dagre: each state a box sized for its lines, each route with its label where dagre makes room
 * for it and its line drawn down through the ranks it crosses (`legsOf`, `pathOf`), the routes edges take weighing more (`EDGE_WEIGHT`).
 * A state an edge or a verb names that the graph does not list is drawn too, so no edge and no verb is lost.
 */
export function drawMachine(graph: Pick<MachineGraph, 'initial' | 'states' | 'final' | 'edges' | 'verbs'>): Drawing {
  const names = namesOf(graph);
  const stays = new Map(names.map((name) => [name, staysOf(graph.edges, name)]));
  const pairs = pairsOf(graph.edges, graph.verbs);
  const g = new Graph();
  g.setGraph({ rankdir: 'TB', ranker: 'longest-path', nodesep: 16, edgesep: 8, ranksep: 40, marginx: 8, marginy: 8 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const name of names) g.setNode(name, stateSize(stays.get(name)!));
  for (const { from, to, edges, verbs } of pairs.values()) {
    g.setEdge(from, to, { ...labelSize(byAction(edges), verbs), labelpos: 'c', weight: edges.length ? EDGE_WEIGHT : 1 });
  }
  layout(g);
  const states = names.map((id) => {
    const { x, y, width, height } = g.node(id);
    const box = { x: x - width / 2, y: y - height / 2, width, height };
    return { id, ...box, initial: id === graph.initial, final: graph.final.includes(id), stays: stays.get(id)! };
  });
  const laid = [...pairs].map(([id, { from, to, edges, verbs }]) => {
    const { points = [], x = 0, y = 0, width = 0, height = 0 } = g.edge(from, to);
    const label = { x, y, width, height };
    return { id, from, to, edges: byAction(edges), verbs, dashed: edges.length === 0, points: points as Point[], label };
  });
  const half = bandsOf([...states.map((s) => ({ y: s.y + s.height / 2, height: s.height })), ...laid.map((r) => r.label)]);
  const at = new Map(states.map((s) => [s.id, s]));
  const routes = laid.map(({ points, ...route }) => ({
    ...route,
    path: pathOf(legsOf(points, at.get(route.from)!, at.get(route.to)!, half)),
  }));
  const { width = 0, height = 0 } = g.graph();
  return { states, routes, width, height };
}

/**
 * An SVG path along a route's legs: straight along each, and from where one leaves its band to where the next enters its own a curve
 * that leaves and arrives upright, so it bends only in the empty gap between two bands. A leg of no length draws no line.
 */
export function pathOf(legs: readonly Leg[]): string {
  const [first, ...rest] = legs;
  if (!first) return '';
  const along = (leg: Leg) => (leg.leave === leg.enter ? [] : [`L ${leg.x} ${leg.leave}`]);
  const parts = [`M ${first.x} ${first.enter}`, ...along(first)];
  rest.forEach((leg, i) => {
    const before = i ? rest[i - 1] : first;
    const mid = (before.leave + leg.enter) / 2;
    parts.push(`C ${before.x} ${mid} ${leg.x} ${mid} ${leg.x} ${leg.enter}`, ...along(leg));
  });
  return parts.join(' ');
}

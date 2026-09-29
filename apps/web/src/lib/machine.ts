/**
 * A state machine's graph as the board draws it: where each state's box goes, and the route and label of each edge between two states,
 * computed by dagre and never placed by hand.
 *
 * Two kinds of edge are gathered before the layout, so no two are drawn over each other: an edge back to its own state is written on
 * that state's box (`stays`), and the edges between the same two states are one drawn edge (`Route`). Either way the edges are listed
 * by the action they take — the events, each with its guard, then the action — so every edge of the graph is one event line, in
 * exactly one place. Read top to bottom: the first state at the top, the final ones at the bottom.
 *
 * Pure: sizes come from the number of lines and their length in the monospace the canvas writes them in, not from a measured page.
 */
import { Graph, layout } from '@dagrejs/dagre';
import type { MachineEdge, MachineGraph } from './api/machines.ts';

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

/** The edges from one state to another, drawn as one: its route, its edges by action, and the box its label sits in, by its centre. */
export type Route = {
  id: string;
  from: string;
  to: string;
  edges: ByAction[];
  points: Point[];
  label: Point & { width: number; height: number };
};

/** A machine laid out: its boxes, its routes, and the size of the whole. */
export type Drawing = { states: StateBox[]; routes: Route[]; width: number; height: number };

/** How wide one character of an event is drawn, in pixels: 11 px monospace. */
export const CHAR_WIDTH = 6.8;
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

/** A route's label size: its edges' lines. */
export const labelSize = (edges: readonly ByAction[]): { width: number; height: number } => ({
  width: Math.ceil(widthOf(edges)),
  height: LINE_HEIGHT * linesOf(edges) + PAD_Y,
});

/**
 * The machine laid out top to bottom by dagre: each state a box sized for its lines, each route with the points dagre routes it through
 * and its label where dagre makes room for it. A state an edge names that the graph does not list is drawn too, so no edge is lost.
 */
export function drawMachine(graph: Pick<MachineGraph, 'initial' | 'states' | 'final' | 'edges'>): Drawing {
  const names = [...new Set([...graph.states, ...graph.edges.flatMap((e) => [e.from, e.to])])];
  const stays = new Map(names.map((name) => [name, byAction(graph.edges.filter((e) => e.from === name && e.to === name))]));
  const pairs = new Map<string, MachineEdge[]>();
  for (const edge of graph.edges) {
    if (edge.from === edge.to) continue;
    const id = `${edge.from}->${edge.to}`;
    pairs.set(id, [...(pairs.get(id) ?? []), edge]);
  }
  const g = new Graph();
  g.setGraph({ rankdir: 'TB', ranker: 'longest-path', nodesep: 16, edgesep: 8, ranksep: 40, marginx: 8, marginy: 8 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const name of names) g.setNode(name, stateSize(stays.get(name)!));
  for (const [, edges] of pairs) g.setEdge(edges[0].from, edges[0].to, { ...labelSize(byAction(edges)), labelpos: 'c' });
  layout(g);
  const states = names.map((id) => {
    const { x, y, width, height } = g.node(id);
    const box = { x: x - width / 2, y: y - height / 2, width, height };
    return { id, ...box, initial: id === graph.initial, final: graph.final.includes(id), stays: stays.get(id)! };
  });
  const routes = [...pairs].map(([id, edges]) => {
    const { from, to } = edges[0];
    const { points = [], x = 0, y = 0, width = 0, height = 0 } = g.edge(from, to);
    return { id, from, to, edges: byAction(edges), points: points.map((p: Point) => ({ x: p.x, y: p.y })), label: { x, y, width, height } };
  });
  const { width = 0, height = 0 } = g.graph();
  return { states, routes, width, height };
}

/** An SVG path through a route's points: straight from the first, bending at each point between, straight into the last. */
export function pathThrough(points: readonly Point[]): string {
  if (points.length < 2) return '';
  const [first, ...rest] = points;
  const bends = rest.slice(0, -1).map((p, i) => `Q ${p.x} ${p.y} ${(p.x + rest[i + 1].x) / 2} ${(p.y + rest[i + 1].y) / 2}`);
  const last = rest[rest.length - 1];
  return [`M ${first.x} ${first.y}`, ...bends, `L ${last.x} ${last.y}`].join(' ');
}

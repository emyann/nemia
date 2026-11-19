/**
 * A run's steps as its card on the Factory draws them, without React: a small flowchart, left to right. Pure.
 *
 * At rest a run's steps are its workflow's graph drawn small (`graphOf`, which `StepGraph` draws on the floor's card, the runs page's row
 * and the waiting card): a point per step, laid out by the run's own layering (`layers`), so a fan-out is two lanes and a fan-in meets to
 * the right of its parents, with a line between points for each `after` edge and a right-angled one under the row for a `loop` edge
 * back. A row is narrow, so the graph holds at most `GRAPH_SLOTS` columns: the ones around where the run is now, the columns before and
 * after them folded into a point that counts them. A column holds at most `RAIL_LANES` points, the last of them counting the steps it
 * leaves out.
 */
import type { GateAt } from 'objects';
import type { RunGraph } from './api/graph.ts';
import type { Frozen } from './frozen.ts';
import type { RunView } from './api/judged.ts';
import { edgesOf, movingInto, type EdgeState, type EdgeStep } from './canvas.ts';
import { layers, stepsOf } from './layout.ts';
import { waitsAtGate, settledState, stepState, type StepState } from './status.ts';
import { stepMark } from './stepMark.ts';

/**
 * One box of a flow. `step`, a step of the run; `fold`, the columns before or after the ones the rail shows, each step of them;
 * `more`, the steps of a column past the lanes it shows. `live`: a step of it is at work or waits on a person — where the run is.
 * `done`: every step of it is settled (`settledState`: done, or passed by its route). `state` is a step's own, and null for the other two.
 */
type Pill = {
  id: string;
  kind: 'step' | 'fold' | 'more';
  names: string[];
  label: string;
  state: StepState | null;
  live: boolean;
  done: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
};

/** The most columns the graph shows, fold points counted: six columns of 32 pixels or more across its 188, a gate's tick between two. */
export const GRAPH_SLOTS = 6;
/** The most points a column of the graph shows, the one counting the rest included. */
const RAIL_LANES = 3;

/**
 * A run's steps as its flow reads them, off the list's record of it: each one's name, its state, its note and whether its round is due.
 * @param run The run: its steps, when it was called off, and its hold where it has one.
 */
export const flowSteps = (run: {
  steps: ReadonlyArray<Pick<RunView['steps'][number], 'name' | 'phase' | 'reason' | 'on' | 'via' | 'note' | 'roundDue'>>;
  cancelledAt: string | null;
  holding?: RunView['holding'];
}): EdgeStep[] =>
  run.steps.map((step) => ({
    name: step.name,
    state: stepState(step, run.cancelledAt !== null, run.holding != null),
    note: step.note,
    roundDue: step.roundDue,
  }));

/**
 * The layering's columns, left first; on a cycle, the run's order a column each, and what is wrong. The same, with `UNGRAPHED`, for a run
 * an api older than the board listed with no graph: the list is read tolerantly (`onYouOf`), so each card says what to do rather than the
 * floor refusing every run.
 */
function columnsOf(names: readonly string[], graph: Frozen<RunGraph>): { columns: string[][]; error: string | null } {
  if (!Array.isArray((graph as Partial<Frozen<RunGraph>> | undefined)?.edges))
    return { columns: names.map((name) => [name]), error: UNGRAPHED };
  try {
    return { columns: layers(stepsOf(names, graph.edges)), error: null };
  } catch (err) {
    return { columns: names.map((name) => [name]), error: (err as Error).message };
  }
}

/** What a card says of a run the api listed without its graph: which way its steps go is not known here, and a restart tells it. */
export const UNGRAPHED = "Listed without its steps' graph by an api older than this board: restart the api, then reload the page.";

/** Where the run is now: at work, or waiting on a person. Nothing is, on a run somebody called off. */
const isLiveStep = (state: StepState, cancelled: boolean): boolean =>
  !cancelled && (movingInto(state) || state === 'asks-in-session' || waitsAtGate(state, false));

/** The column the rail is centred on: the first with a step live, else the first with a step not done, else the last. */
function liveColumn(columns: readonly string[][], stateOf: (name: string) => StepState, cancelled: boolean): number {
  const live = columns.findIndex((column) => column.some((name) => isLiveStep(stateOf(name), cancelled)));
  if (live >= 0) return live;
  const todo = columns.findIndex((column) => column.some((name) => !settledState(stateOf(name))));
  return todo >= 0 ? todo : columns.length - 1;
}

/**
 * The columns the rail shows, `start` to `end`, of `n` around `live`: the one before it and as many after as fit, then as many
 * more before; a fold pill takes a slot of the `slots` for the columns before `start`, and one for those after `end`. A fold
 * never holds a single column: a column takes the slot the fold would.
 * @param n How many columns the layering has.
 * @param live The index of the column the rail is centred on.
 * @param slots How many slots the rail has, fold points counted: `GRAPH_SLOTS` by default.
 */
export function windowOf(n: number, live: number, slots = GRAPH_SLOTS): { start: number; end: number } {
  if (n <= slots) return { start: 0, end: n - 1 };
  const used = (s: number, e: number) => (s > 0 ? 1 : 0) + (e - s + 1) + (e < n - 1 ? 1 : 0);
  let start = Math.max(0, Math.min(live, n - 1) - 1);
  let end = start;
  while (end + 1 < n && used(start, end + 1) <= slots) end++;
  while (start > 0 && used(start - 1, end) <= slots) start--;
  return { start, end };
}

type Box = Omit<Pill, 'x' | 'y' | 'width' | 'height'>;

/**
 * A point of a run's graph drawn small (`graphOf`): a box (`Pill`'s kind, names, label, state, live and done) at its centre, `x`, `y`;
 * `r` the half-width its mark is drawn at, a step at work or waiting on a person a size larger; `route` where its node is a condition.
 */
export type GraphPoint = Box & { x: number; y: number; r: number; route: boolean };

/**
 * A line of the graph between two points: `path` drawn straight between them, or under the row at right angles for a `loop`, with its
 * arrowhead `head`; `state` as an edge's (`EdgeState`); `untaken` a route its condition did not take; `taken` a loop the run has gone
 * round.
 */
export type GraphLine = {
  id: string;
  from: string;
  to: string;
  loop: boolean;
  state: EdgeState;
  untaken: boolean;
  taken: boolean;
  path: string;
  head: string | null;
};

/** A gate of the run as the graph draws it: its step, and whether its approval is after the step or before it. */
export type GraphGate = { step: string; at: GateAt };

/**
 * A run's graph laid out small: its points, its lines, a tick for each gated step on the side its approval is, the room they take, and
 * why it has no lines.
 */
export type StepGraphLayout = {
  points: GraphPoint[];
  lines: GraphLine[];
  gates: Array<{ step: string; at: GateAt; x: number; y: number }>;
  width: number;
  height: number;
  error: string | null;
};

/** The graph's geometry: its room at each end, the row's line, the lanes' spacing, the rows' height, and a loop's depth under a step. */
const GRAPH = { pad: 14, line: 8, top: 2, lane: 13, height: 24, under: 15, nest: 4, gate: 12 };

/** A point's half-width by its state: a step at work or waiting on a person a size larger, a failure between, a route passed by smaller. */
function radiusOf(state: StepState | null): number {
  const mark = state === null ? 'todo' : stepMark(state, false);
  return mark === 'alive' || mark === 'yours' ? 6.6 : mark === 'failure' ? 5.6 : mark === 'off' ? 4 : 5;
}

const r1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * A run's steps as its workflow's graph drawn small, `width` wide: the columns around where the run is (`windowOf`, `GRAPH_SLOTS`),
 * each of at most `RAIL_LANES` points, spread evenly across the width; a line between points for each edge (`joinedOf`), each loop under
 * the row at right angles, the deeper the more loops there are; and a tick for each step of `gates` drawn, at its row on the side its
 * approval is: after the step, between it and the column after, for a step whose closeout waits; before it for one approved first.
 * @param names The run's steps by name, in the run's order.
 * @param graph The run's graph of steps, whose edges lay them out; a run listed without one has each step a column.
 * @param steps Each step's state as the flow reads it (`flowSteps`).
 * @param gates The run's gates, each its step and where its approval is (`at`).
 * @param cancelled Whether somebody called the run off: no step is live then.
 * @param width How wide the graph is drawn, in pixels.
 * @param fold How many columns it shows before it folds the rest (`GRAPH_SLOTS`); a graph that names its steps folds none.
 */
export function graphOf(
  names: readonly string[],
  graph: Frozen<RunGraph>,
  steps: readonly EdgeStep[],
  gates: readonly GraphGate[],
  cancelled: boolean,
  width = 188,
  fold = GRAPH_SLOTS,
): StepGraphLayout {
  const { columns, error } = columnsOf(names, graph);
  const stateAt = stateReader(steps);
  const { start, end } = windowOf(columns.length, liveColumn(columns, stateAt, cancelled), Math.max(fold, 1));
  const boxOf = boxer(stateAt, cancelled);
  const slots: Box[][] = [];
  if (start > 0) slots.push([boxOf('fold', columns.slice(0, start).flat())]);
  for (const column of columns.slice(start, end + 1)) slots.push(capped(column, boxOf, stateAt, cancelled));
  if (end < columns.length - 1) slots.push([boxOf('fold', columns.slice(end + 1).flat())]);
  const conditions = new Set((graph?.nodes ?? []).filter((node) => node.kind === 'condition').map((node) => node.name));
  const lanes = Math.max(1, ...slots.map((slot) => slot.length));
  const middle = lanes === 1 ? GRAPH.line : GRAPH.top + ((lanes - 1) * GRAPH.lane) / 2;
  const gap = slots.length > 1 ? (width - 2 * GRAPH.pad) / (slots.length - 1) : 0;
  const points = slots.flatMap((slot, s) =>
    slot.map((box, lane): GraphPoint => ({
      ...box,
      x: r1(GRAPH.pad + s * gap),
      y: r1(middle + (lane - (slot.length - 1) / 2) * GRAPH.lane),
      r: radiusOf(box.state),
      route: box.kind === 'step' && conditions.has(box.names[0]),
    })),
  );
  const at = new Map(points.map((point) => [point.id, point]));
  const lowest = Math.max(GRAPH.line, ...points.map((point) => point.y));
  let loops = 0;
  const lines = [...joinedOf(slots, graph, steps, error)].map(([id, { from, to, loop, states, skip, untaken, label }]): GraphLine => {
    const [a, b] = [at.get(from.id)!, at.get(to.id)!];
    const state = stateOf(states);
    const line = { id, from: from.id, to: to.id, loop, state, untaken: !loop && untaken, taken: loop && label !== null };
    if (loop) {
      const bottom = lowest + GRAPH.under + GRAPH.nest * loops++;
      const tip = b.y + b.r + 2.2;
      return {
        ...line,
        path: `M${r1(a.x)},${r1(a.y + a.r + 2.2)} V${r1(bottom)} H${r1(b.x)} V${r1(tip + 0.4)}`,
        head: `M${r1(b.x - 3)},${r1(tip + 3.4)} L${r1(b.x)},${r1(tip)} L${r1(b.x + 3)},${r1(tip + 3.4)}`,
      };
    }
    if (skip) {
      const top = Math.min(a.y, b.y) - GRAPH.line - 1;
      return { ...line, path: `M${r1(a.x)},${r1(a.y - a.r - 2)} V${r1(top)} H${r1(b.x)} V${r1(b.y - b.r - 2)}`, head: null };
    }
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const [ux, uy] = [(b.x - a.x) / length, (b.y - a.y) / length];
    return {
      ...line,
      path: `M${r1(a.x + ux * (a.r + 3))},${r1(a.y + uy * (a.r + 3))} L${r1(b.x - ux * (b.r + 3))},${r1(b.y - uy * (b.r + 3))}`,
      head: null,
    };
  });
  const drawn = new Map(points.filter((point) => point.kind === 'step').map((point) => [point.names[0], point]));
  const ticks = gates.flatMap(({ step, at }) => {
    const point = drawn.get(step);
    return point ? [{ step, at, x: r1(at === 'after' ? point.x + GRAPH.gate : point.x - GRAPH.gate), y: point.y }] : [];
  });
  const rows = lanes <= 2 ? GRAPH.height : GRAPH.height + (lanes - 2) * GRAPH.lane;
  const under = loops > 0 ? lowest + GRAPH.under + GRAPH.nest * (loops - 1) + 1 : 0;
  return { points, lines, gates: ticks, width, height: Math.max(rows, under), error };
}

const stateReader = (steps: readonly EdgeStep[]) => {
  const of = new Map(steps.map((s) => [s.name, s.state]));
  return (name: string): StepState => of.get(name) ?? 'unknown';
};

const boxer =
  (stateOf: (name: string) => StepState, cancelled: boolean) =>
  (kind: Box['kind'], names: string[]): Box => {
    const done = names.every((name) => settledState(stateOf(name)));
    return {
      id: `${kind}:${names[0]}`,
      kind,
      names,
      label:
        kind === 'step'
          ? names[0]
          : kind === 'more'
            ? `+${names.length}`
            : `${names.length} ${done ? 'done' : names.length === 1 ? 'step' : 'steps'}`,
      state: kind === 'step' ? stateOf(names[0]) : null,
      live: names.some((name) => isLiveStep(stateOf(name), cancelled)),
      done,
    };
  };

/**
 * A column of the rail: its steps, or past `RAIL_LANES` the first of them and a pill counting the rest — the live ones first, so the
 * step the run is at is never the one counted, each in the layering's order.
 */
function capped(
  column: readonly string[],
  boxOf: ReturnType<typeof boxer>,
  stateOf: (name: string) => StepState,
  cancelled: boolean,
): Box[] {
  if (column.length <= RAIL_LANES) return column.map((name) => boxOf('step', [name]));
  const rank = (name: string) => (isLiveStep(stateOf(name), cancelled) ? 0 : 1);
  const shown = new Set([...column].sort((a, b) => rank(a) - rank(b) || column.indexOf(a) - column.indexOf(b)).slice(0, RAIL_LANES - 1));
  return [
    ...column.filter((name) => shown.has(name)).map((name) => boxOf('step', [name])),
    boxOf(
      'more',
      column.filter((name) => !shown.has(name)),
    ),
  ];
}

/** Edges of the run joined onto the boxes that stand for their ends (`joinedOf`): each edge once, none inside a box. */
type Joined = Map<
  string,
  { from: Box; to: Box; loop: boolean; states: EdgeState[]; skip: boolean; label: string | null; untaken: boolean }
>;

/**
 * The run's edges (`edgesOf`) between the boxes that stand for their ends, each drawn once, none inside a box: a `loop` edge only between
 * two steps' own boxes, since back into a fold it would say nothing a person could follow; `skip` where it passes over a column; `untaken`
 * where every route it stands for is off the route its condition took.
 */
function joinedOf(slots: readonly Box[][], graph: Frozen<RunGraph>, steps: readonly EdgeStep[], error: string | null): Joined {
  const boxOf = new Map(slots.flatMap((slot, s) => slot.flatMap((box) => box.names.map((name) => [name, { box, slot: s }] as const))));
  const joined: Joined = new Map();
  if (error !== null) return joined;
  for (const edge of edgesOf(graph, steps)) {
    const from = boxOf.get(edge.source);
    const to = boxOf.get(edge.target);
    const loop = edge.kind === 'loop';
    if (!from || !to || from.box === to.box || (loop && (from.box.kind !== 'step' || to.box.kind !== 'step'))) continue;
    const id = `${loop ? 'loop:' : ''}${from.box.id}->${to.box.id}`;
    const one = joined.get(id) ?? {
      from: from.box,
      to: to.box,
      loop,
      states: [],
      skip: !loop && to.slot - from.slot > 1,
      label: edge.label,
      untaken: true,
    };
    one.states.push(edge.state);
    one.untaken = one.untaken && edge.untaken;
    joined.set(id, one);
  }
  return joined;
}

/** Running if any edge an arrow stands for is, done if every one is, and to come otherwise. */
const stateOf = (states: readonly EdgeState[]): EdgeState =>
  states.includes('running') ? 'running' : states.every((s) => s === 'done') ? 'done' : 'to-come';

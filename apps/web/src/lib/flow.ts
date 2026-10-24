/**
 * A run's steps as its card on the Factory draws them, without React: a small flowchart, left to right. Pure.
 *
 * At rest the card holds a rail (`railOf`): a pill per step, laid out by the run's own layering (`layers`), so a fan-out is two
 * lanes and a fan-in meets to the right of its parents, with an arrow between pills for each `after` edge — an arc over the row
 * for one that skips a column, and under the row for a `loop` edge back. The card is narrow, so the rail holds at most
 * `RAIL_SLOTS` columns: the ones around where the run is now, the columns before and after them folded into a pill that counts
 * them. A column holds at most `RAIL_LANES` pills, the last of them counting the steps it leaves out.
 *
 * Opened, the card grows to the right and holds every step as a tile (`tilesOf`), on the same layering with nothing folded.
 */
import type { RunGraph, RunSummary } from './api';
import { edgesOf, loopPath, movingInto, type EdgeState, type EdgeStep } from './canvas.ts';
import { layers, stepsOf, type Point } from './layout.ts';
import { isGate, satisfiesAfter, stepState, type StepState } from './status.ts';

/**
 * One box of a flow. `step`, a step of the run; `fold`, the columns before or after the ones the rail shows, each step of them;
 * `more`, the steps of a column past the lanes it shows. `live`: a step of it is at work or waits on a person — where the run is.
 * `done`: every step of it is done (`satisfiesAfter`). `state` is a step's own, and null for the other two.
 */
export type Pill = {
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

/**
 * An arrow between two boxes, as `edgeStroke` and `edgeLine` draw it: `path` the line, `head` the arrowhead at its end, `loop`
 * a `loop` edge back. Between a fold, or a `more`, and anything, its state is running if any edge it stands for is, done if all
 * are, and to come otherwise. `round`: on a loop edge past its first round, the round it is on (`loopLabel`) and where its words
 * go, under the middle of the curve; null otherwise.
 */
export type Arrow = {
  id: string;
  from: string;
  to: string;
  loop: boolean;
  state: EdgeState;
  path: string;
  head: string;
  round: { text: string; x: number; y: number } | null;
};

/** A flow laid out: its boxes and arrows, the room they take, and why it has no arrows when the steps' `after` go round in a cycle. */
export type Flow = { pills: Pill[]; arrows: Arrow[]; width: number; height: number; error: string | null };

/** The most columns the rail shows, fold pills counted: four boxes and their arrows across a card. */
export const RAIL_SLOTS = 4;
/** The most pills a column of the rail shows, the one counting the rest included. */
export const RAIL_LANES = 3;
/** How wide the rail may be: the card's inside (`CARD_WIDTH`, `w-88`, less its padding). */
export const RAIL_WIDTH = 328;

/** The rail's pills: at most `box` wide, narrower when more columns share the card, with an arrow's room between. */
const RAIL = { box: 110, height: 20, gap: 16, lane: 6, over: 12, under: 14 };
/** The open card's tiles (`w-44`), the arrow's room between columns and between lanes, and the room over and under for arcs. */
export const TILE = { width: 176, height: 88, gap: 32, lane: 12, over: 18, under: 22 };

/** A run's steps as its flow reads them, off the list's record of it: each one's name, its state, its note and whether its round is due. */
export const flowSteps = (run: Pick<RunSummary, 'steps' | 'cancelledAt'> & { holding?: RunSummary['holding'] }): EdgeStep[] =>
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
export function columnsOf(names: readonly string[], graph: RunGraph): { columns: string[][]; error: string | null } {
  if (!Array.isArray((graph as Partial<RunGraph> | undefined)?.edges)) return { columns: names.map((name) => [name]), error: UNGRAPHED };
  try {
    return { columns: layers(stepsOf(names, graph.edges)), error: null };
  } catch (err) {
    return { columns: names.map((name) => [name]), error: (err as Error).message };
  }
}

/** What a card says of a run the api listed without its graph: which way its steps go is not known here, and a restart tells it. */
export const UNGRAPHED = "Listed without its steps' graph by an api older than this board: restart the api, then reload the page.";

/** Where the run is now: at work, or waiting on a person. Nothing is, on a run somebody called off. */
export const isLiveStep = (state: StepState, cancelled: boolean): boolean =>
  !cancelled && (movingInto(state) || state === 'needs-human' || isGate(state, false));

/** The column the rail is centred on: the first with a step live, else the first with a step not done, else the last. */
export function liveColumn(columns: readonly string[][], stateOf: (name: string) => StepState, cancelled: boolean): number {
  const live = columns.findIndex((column) => column.some((name) => isLiveStep(stateOf(name), cancelled)));
  if (live >= 0) return live;
  const todo = columns.findIndex((column) => column.some((name) => !satisfiesAfter(stateOf(name))));
  return todo >= 0 ? todo : columns.length - 1;
}

/**
 * The columns the rail shows, `start` to `end`, of `n` around `live`: the one before it and as many after as fit, then as many
 * more before; a fold pill takes a slot of the `slots` for the columns before `start`, and one for those after `end`. A fold
 * never holds a single column: a column takes the slot the fold would.
 */
export function windowOf(n: number, live: number, slots = RAIL_SLOTS): { start: number; end: number } {
  if (n <= slots) return { start: 0, end: n - 1 };
  const used = (s: number, e: number) => (s > 0 ? 1 : 0) + (e - s + 1) + (e < n - 1 ? 1 : 0);
  let start = Math.max(0, Math.min(live, n - 1) - 1);
  let end = start;
  while (end + 1 < n && used(start, end + 1) <= slots) end++;
  while (start > 0 && used(start - 1, end) <= slots) start--;
  return { start, end };
}

type Box = Omit<Pill, 'x' | 'y' | 'width' | 'height'>;
type Sizes = { width: number; height: number; gap: number; lane: number; over: number; under: number };

/** The rail a card holds at rest: the columns around where the run is, each of at most `RAIL_LANES` pills. */
export function railOf(names: readonly string[], graph: RunGraph, steps: readonly EdgeStep[], cancelled: boolean): Flow {
  const { columns, error } = columnsOf(names, graph);
  const stateOf = stateReader(steps);
  const { start, end } = windowOf(columns.length, liveColumn(columns, stateOf, cancelled));
  const boxOf = boxer(stateOf, cancelled);
  const slots: Box[][] = [];
  if (start > 0) slots.push([boxOf('fold', columns.slice(0, start).flat())]);
  for (const column of columns.slice(start, end + 1)) slots.push(capped(column, boxOf, stateOf, cancelled));
  if (end < columns.length - 1) slots.push([boxOf('fold', columns.slice(end + 1).flat())]);
  const width = Math.min(RAIL.box, (RAIL_WIDTH - (slots.length - 1) * RAIL.gap) / slots.length);
  return arrange(slots, { ...RAIL, width }, graph, steps, error);
}

/** The tiles an open card holds: every step, on the layering, nothing folded. */
export function tilesOf(names: readonly string[], graph: RunGraph, steps: readonly EdgeStep[], cancelled: boolean): Flow {
  const { columns, error } = columnsOf(names, graph);
  const boxOf = boxer(stateReader(steps), cancelled);
  return arrange(
    columns.map((column) => column.map((name) => boxOf('step', [name]))),
    TILE,
    graph,
    steps,
    error,
  );
}

const stateReader = (steps: readonly EdgeStep[]) => {
  const of = new Map(steps.map((s) => [s.name, s.state]));
  return (name: string): StepState => of.get(name) ?? 'unknown';
};

const boxer =
  (stateOf: (name: string) => StepState, cancelled: boolean) =>
  (kind: Box['kind'], names: string[]): Box => {
    const done = names.every((name) => satisfiesAfter(stateOf(name)));
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

/**
 * The boxes put down, column by column, each column centred on the tallest; and the arrows between them, off the run's edges
 * (`edgesOf`), each edge drawn once between the boxes that stand for its ends, and none inside a box. A `loop` edge only between
 * two steps' own boxes: back into a fold it would say nothing a person could follow. Room over the row only when an arrow arcs
 * over it, and under it only when a loop does.
 */
function arrange(slots: readonly Box[][], size: Sizes, graph: RunGraph, steps: readonly EdgeStep[], error: string | null): Flow {
  const boxOf = new Map(slots.flatMap((slot, s) => slot.flatMap((box) => box.names.map((name) => [name, { box, slot: s }] as const))));
  const joined = new Map<string, { from: Box; to: Box; loop: boolean; states: EdgeState[]; skip: boolean; label: string | null }>();
  if (error === null) {
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
      };
      one.states.push(edge.state);
      joined.set(id, one);
    }
  }
  const over = [...joined.values()].some((a) => a.skip) ? size.over : 0;
  const under = [...joined.values()].some((a) => a.loop) ? size.under : 0;
  const lanes = Math.max(1, ...slots.map((slot) => slot.length));
  const band = lanes * size.height + (lanes - 1) * size.lane;
  const pills = slots.flatMap((slot, s) => {
    const top = over + (band - (slot.length * size.height + (slot.length - 1) * size.lane)) / 2;
    return slot.map((box, lane): Pill => ({
      ...box,
      x: s * (size.width + size.gap),
      y: top + lane * (size.height + size.lane),
      width: size.width,
      height: size.height,
    }));
  });
  const at = new Map(pills.map((pill) => [pill.id, pill]));
  const arrows = [...joined].map(([id, { from, to, loop, states, skip, label }]): Arrow => {
    const [a, b] = [at.get(from.id)!, at.get(to.id)!];
    const bottom = over + band + under - 3;
    const curve = loop ? loopCurve(a, b, bottom) : skip ? overCurve(a, b, 2) : sideCurve(a, b);
    const round = loop && label ? { text: label, x: (a.x + a.width / 2 + b.x + b.width / 2) / 2, y: bottom } : null;
    return { id, from: from.id, to: to.id, loop, state: stateOf(states), path: curve.path, head: headAt(curve.end, curve.toward), round };
  });
  return {
    pills,
    arrows,
    width: slots.length ? slots.length * size.width + (slots.length - 1) * size.gap : 0,
    height: over + band + under,
    error,
  };
}

/** Running if any edge an arrow stands for is, done if every one is, and to come otherwise. */
const stateOf = (states: readonly EdgeState[]): EdgeState =>
  states.includes('running') ? 'running' : states.every((s) => s === 'done') ? 'done' : 'to-come';

type Curve = { path: string; end: Point; toward: Point };

/** From a box's right side to the next column's left, level where they are level. */
function sideCurve(a: Pill, b: Pill): Curve {
  const [x1, y1, x2, y2] = [a.x + a.width, a.y + a.height / 2, b.x, b.y + b.height / 2];
  const mid = (x1 + x2) / 2;
  return { path: `M ${x1},${y1} C ${mid},${y1} ${mid},${y2} ${x2},${y2}`, end: { x: x2, y: y2 }, toward: { x: mid, y: y2 } };
}

/**
 * Over the row, from the top of one box to the top of one a column or more on, its middle at `peak`: a cubic's point at t = ½ is ⅛ of
 * each end and ⅜ of each control point, as in `loopPath`.
 */
function overCurve(a: Pill, b: Pill, peak: number): Curve {
  const [x1, y1, x2, y2] = [a.x + a.width * 0.75, a.y, b.x + b.width * 0.25, b.y];
  const control = (peak - (y1 + y2) / 8) / 0.75;
  return { path: `M ${x1},${y1} C ${x1},${control} ${x2},${control} ${x2},${y2}`, end: { x: x2, y: y2 }, toward: { x: x2, y: control } };
}

/**
 * Under the row, from under the looping step to under the one it runs again (`loopPath`), its middle at `bottom`. The head comes from
 * the last control point, which `loopPath` puts straight under the target, so it points up into it.
 */
function loopCurve(a: Pill, b: Pill, bottom: number): Curve {
  const [source, target] = [
    { x: a.x + a.width / 2, y: a.y + a.height },
    { x: b.x + b.width / 2, y: b.y + b.height },
  ];
  const { path } = loopPath(source, target, bottom - Math.max(source.y, target.y));
  return { path, end: target, toward: { x: target.x, y: (bottom - (source.y + target.y) / 8) / 0.75 } };
}

/** An arrowhead with its tip at `end`, pointing away from `toward`: the direction the line comes in. */
function headAt(end: Point, toward: Point): string {
  const [dx, dy] = [end.x - toward.x, end.y - toward.y];
  const length = Math.hypot(dx, dy) || 1;
  const [ux, uy] = [dx / length, dy / length];
  const [bx, by] = [end.x - ux * 5, end.y - uy * 5];
  const r = (n: number) => Math.round(n * 10) / 10;
  return `M ${r(end.x)},${r(end.y)} L ${r(bx - uy * 3)},${r(by + ux * 3)} L ${r(bx + uy * 3)},${r(by - ux * 3)} Z`;
}

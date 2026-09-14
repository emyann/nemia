/**
 * What the Factory works out about the runs, without React Flow: which are in flight, what a card
 * says, where a card goes, and where an open run's graph goes beside it. Pure.
 */
import type { RunSummary } from './api';
import type { EdgeState } from './canvas.ts';
import { COLUMN_WIDTH, layers, NODE_WIDTH, type Point } from './layout.ts';

/**
 * Whether a run is in flight, and so on the Factory by default: `assess` has it `running`, or it still moves
 * — the engine holds a task of it, or a tick would still file one (the api's `moving`).
 *
 * Nothing here reads a step's words. The status alone is not enough: `assess` reads a fan-out as failed once
 * one step is final without letting its followers run, while a sibling's session still works. A run is
 * finished once it has stopped moving without running: succeeded; failed at a refused check or a step
 * signed off blocked, whose followers read `waiting` and will never be filed; or cancelled, its stop landed.
 * A person such a run waits on finds it under "Show finished", or on Runs.
 *
 * A run started `--after` runs that have not shipped is in flight while each may still ship: it moves, since the tick files its roots
 * when they do. Not once one never will without a person (`waiting.onYou`) — no such run, a cancelled one, a branch gone — though
 * `assess`, which knows nothing of the gate, still calls it running: nothing of it moves until a person acts, and it waits on them.
 */
export const inFlight = (run: Pick<RunSummary, 'status' | 'moving'> & { waiting?: RunSummary['waiting'] }): boolean =>
  run.moving || (run.status === 'running' && !run.waiting?.onYou);

/**
 * Whether the run waits on a person: a step does (`waitingOnYou`), or a run it waits on never ships without one — what `wf ls` prints
 * `→ waiting on you` for, either way.
 */
export const waitsOnYou = (run: Pick<RunSummary, 'waitingOnYou'> & { waiting?: RunSummary['waiting'] }): boolean =>
  run.waitingOnYou.length > 0 || Boolean(run.waiting?.onYou);

type FloorRun = Pick<RunSummary, 'id' | 'createdAt' | 'status' | 'moving' | 'waiting' | 'after'>;

/**
 * The runs on the Factory's floor, oldest first: every run when finished runs are asked for; otherwise every run in flight, and each
 * finished run that a run in flight waits on (`after`), so the edge into it leaves from a card.
 *
 * The finished card, and not a stub: it is dimmed as a finished card is, it says what the run was for and whether it shipped or was
 * called off, and it opens into the run's steps — a stub would say only an id, and send a person to Runs to learn the rest. One level: a
 * finished parent brings none of its own parents onto the floor, since it waits on nothing any more.
 */
export function floorRuns<T extends FloorRun>(runs: readonly T[], showFinished: boolean): T[] {
  const waitedOn = new Set(runs.filter(inFlight).flatMap((run) => run.after));
  return byAge(runs).filter((run) => showFinished || inFlight(run) || waitedOn.has(run.id));
}

/** An edge between two cards on the Factory: from a run to one that waits on it. Dashed, to come, until the child starts; solid once it has. */
export type RunEdge = { id: string; source: string; target: string; state: Extract<EdgeState, 'to-come' | 'done'> };

/**
 * The edges between the cards on the floor: one from each run in a card's `after` that is on the floor too, to that card. A run in `after`
 * that is not — finished with "Show finished" off and waited on by no run in flight, or one the store has lost — draws none; the card's
 * `waiting` line still names it.
 *
 * A child has started once any of its steps is filed: its parents shipped, and it no longer waits (`gated` in agent-workflows).
 */
export function runEdges(runs: ReadonlyArray<Pick<RunSummary, 'id' | 'after' | 'steps'>>): RunEdge[] {
  const floor = new Set(runs.map((run) => run.id));
  return runs.flatMap((child) => {
    const started = child.steps.some((step) => step.taskId !== null);
    return [...new Set(child.after)]
      .filter((parent) => floor.has(parent) && parent !== child.id)
      .map((parent): RunEdge => ({ id: `after:${parent}->${child.id}`, source: parent, target: child.id, state: started ? 'done' : 'to-come' }));
  });
}

/** A card's title: the brief's first line with words on it, without a heading's hashes; else the run id. */
export const titleOf = (run: Pick<RunSummary, 'id' | 'brief'>): string =>
  run.brief.split('\n').map((line) => line.replace(/^\s*#+\s*/, '').trim()).find(Boolean) ?? run.id;

/** The repo by its folder's name, which is what a person calls it; the full path is for machines. */
export const repoName = (repo: string): string => repo.split(/[\\/]+/).filter(Boolean).at(-1) ?? repo;

/** Oldest first, so a run that starts takes the next free cell and moves no card already down. */
export const byAge = <T extends Pick<RunSummary, 'id' | 'createdAt'>>(runs: readonly T[]): T[] =>
  [...runs].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

/** A cell on the Factory's grid: room for one card and the gap beside and below it. Cards are drawn to fit. */
export const CELL_WIDTH = 320;
export const CELL_HEIGHT = 220;
export const GRID_COLUMNS = 4;
/** How wide a card is drawn (`w-72`): the rest of its cell is the gap to the next card. */
export const CARD_WIDTH = 288;
/** How far below its card's top an open run's graph starts, so the edge from the card runs about level. */
export const GRAPH_TOP = 24;

/** The cells a run takes, from its card's cell: across, and down. A closed card takes its one. */
export type Span = { columns: number; rows: number };
export const ONE_CELL: Span = { columns: 1, rows: 1 };

/**
 * The cells an open run takes: its card's, as many more to the right as its graph is wide, and as many
 * rows as its graph is tall. From the layout's extent (`extentOf`), which reads names and `after` only,
 * so a refetch that moves a status moves no card.
 *
 * The graph starts a column's arrow right of the card (`graphAt`), so it ends the card's width plus the
 * layout's width from the card's corner; with a cell's gap after it, that is one cell plus the layout.
 */
export function spanOf({ width, height }: { width: number; height: number }): Span {
  return {
    columns: 1 + Math.ceil(width / CELL_WIDTH),
    rows: Math.max(1, Math.ceil((GRAPH_TOP + height) / CELL_HEIGHT)),
  };
}

/**
 * Where each step of an open run goes, relative to its card's corner: the layering's places, moved to
 * start a column's arrow right of the card and `GRAPH_TOP` below its top.
 */
export function graphAt(at: ReadonlyMap<string, Point>): Map<string, Point> {
  const left = Math.min(...[...at.values()].map((p) => p.x));
  const top = Math.min(...[...at.values()].map((p) => p.y));
  return new Map(
    [...at].map(([name, p]) => [name, { x: CARD_WIDTH + COLUMN_WIDTH - NODE_WIDTH + p.x - left, y: GRAPH_TOP + p.y - top }]),
  );
}

/** The Factory's open runs after a click on one: closed if it was open, else open, and opened last. */
export const toggleOpen = (open: readonly string[], id: string): string[] =>
  open.includes(id) ? open.filter((other) => other !== id) : [...open, id];

/**
 * The Factory's open runs after a person drops a card they dragged: an open run moved claims its cells
 * first, as one opened last does. The same list when nothing changes: a closed card, or the last already.
 */
export const movedOpen = (open: string[], id: string): string[] =>
  open.includes(id) && open.at(-1) !== id ? [...open.filter((other) => other !== id), id] : open;

/**
 * Where each run's card goes, for the runs on the floor, oldest first. `spans` holds the runs drawn open
 * and the cells each takes (`spanOf`), the run a person opened or moved last first; a run not in it
 * takes one cell.
 *
 * Claims are made open runs first, the one opened or moved last first, then closed cards oldest first —
 * so the run a person just opened or dropped is never the one moved aside. In order of claim:
 *
 * 1. A card on the floor now stays where it is: a person is looking at it. Unless an open run that
 *    claimed before it is in any of its cells — a graph unfolding, or dropped, over the cards beside
 *    it, or a closed card dropped on a graph — and then it takes a free place (3). Cards never move for
 *    a closed card, even stacked: a person put them there.
 * 2. A card coming onto the floor goes back where it was left (`saved`), unless a card placed before
 *    it is in any of those cells. The cells were free while this card was off the floor — finished and
 *    hidden, say — and a run that started meanwhile took one; putting both there would hide one under
 *    the other, so the card coming back takes a free place instead.
 * 3. Any other card takes the first free place, row by row: the first cell from which every cell it
 *    takes is free. An open run wider than the grid starts a row, and its graph runs past the grid's edge.
 *    Closed cards joined by `after` — each run's parents on the floor — are placed together, the first time
 *    one of them comes up: layered as a run's steps are (`layers`), each a column right of every card it
 *    waits on and level with the middle of them, so a diamond reads as one; and the whole at the first free
 *    place right of any card already down that one of them waits on.
 *
 * A card is in the cell nearest its corner — both rows, for one the layering puts halfway down a row — and
 * an open run in the cells its span covers from there, beyond the grid's edges as well as on the grid, so a
 * graph running past the edge moves a card a person parked there; only (3) keeps to the grid. A card off the
 * floor holds no cell: finished runs pile up, and holding their cells would leave holes that never close.
 */
export function placeRuns(
  ids: readonly string[],
  onFloor: ReadonlyMap<string, Point>,
  saved: ReadonlyMap<string, Point> | null,
  spans: ReadonlyMap<string, Span> = new Map(),
  after: ReadonlyMap<string, readonly string[]> = new Map(),
): Map<string, Point> {
  const floor = new Set(ids);
  const order = [...[...spans.keys()].filter((id) => floor.has(id)), ...ids.filter((id) => !spans.has(id))];
  const spanOfId = (id: string) => spans.get(id) ?? ONE_CELL;
  // The edges between cards on the floor, each way.
  const parents = new Map(ids.map((id) => [id, [...new Set(after.get(id) ?? [])].filter((p) => floor.has(p) && p !== id)]));
  const children = new Map(ids.map((id) => [id, ids.filter((child) => parents.get(child)!.includes(id))]));
  const at = new Map<string, Point>();
  // Every cell a placed card is in; and the cells of the open runs, which a card on the floor yields to.
  const taken = new Set<string>();
  const unfolded = new Set<string>();
  const put = (id: string, point: Point) => {
    at.set(id, point);
    for (const cell of cellsOf(point, spanOfId(id))) {
      taken.add(cell);
      if (spans.has(id)) unfolded.add(cell);
    }
  };
  const free = (point: Point, span: Span, of: ReadonlySet<string>) => cellsOf(point, span).every((cell) => !of.has(cell));

  for (const id of order) {
    const here = onFloor.get(id);
    if (here && free(here, spanOfId(id), unfolded)) put(id, here);
  }
  for (const id of order) {
    const left = saved?.get(id);
    if (!at.has(id) && left && free(left, spanOfId(id), taken)) put(id, left);
  }
  /** The closed cards still to place that `after` joins to `id`, oldest first; `id` alone when it is open. */
  const joined = (id: string): string[] => {
    if (spans.has(id)) return [id];
    const found = new Set([id]);
    for (const one of found) {
      for (const other of [...parents.get(one)!, ...children.get(one)!]) if (!at.has(other) && !spans.has(other)) found.add(other);
    }
    return ids.filter((other) => found.has(other));
  };
  /**
   * Where each of `members` goes, in cells from the corner of the room they take: their layering's columns, each centred on the
   * tallest — so a column a card short of it sits half a row down. The first alone, on a cycle, which a record edited by hand could
   * have: the rest are placed on their own turns.
   */
  const shapeOf = (members: readonly string[]): Map<string, Point> => {
    let columns: string[][];
    try {
      columns = layers(members.map((name) => ({ name, after: parents.get(name)!.filter((p) => members.includes(p)) })));
    } catch {
      return new Map([[members[0]!, { x: 0, y: 0 }]]);
    }
    const cells = columns.flatMap((column, c) => column.map((name, i) => [name, { x: c, y: i - (column.length - 1) / 2 }] as const));
    const top = Math.min(...cells.map(([, p]) => p.y));
    return new Map(cells.map(([name, p]) => [name, { x: p.x, y: p.y - top }]));
  };

  for (const id of order) {
    if (at.has(id)) continue;
    const shape = shapeOf(joined(id));
    const members = [...shape.keys()];
    const cell = (name: string) => shape.get(name)!;
    // Right of every card already down that one of them waits on.
    const first = Math.max(0, ...members.flatMap((m) => parents.get(m)!.filter((p) => at.has(p)).map((p) => Math.round(at.get(p)!.x / CELL_WIDTH) + 1 - cell(m).x)));
    const width = Math.max(...members.map((m) => cell(m).x + spanOfId(m).columns));
    // The last column an anchor can take and keep the whole in the row, or the first for one wider than the grid.
    const last = Math.max(first, GRID_COLUMNS - Math.min(width, GRID_COLUMNS));
    search: for (let row = 0; ; row++) {
      for (let column = first; column <= last; column++) {
        const points = members.map((m) => [m, { x: (column + cell(m).x) * CELL_WIDTH, y: (row + cell(m).y) * CELL_HEIGHT }] as const);
        if (points.every(([m, point]) => free(point, spanOfId(m), taken))) {
          for (const [m, point] of points) put(m, point);
          break search;
        }
      }
    }
  }
  return new Map(ids.map((id) => [id, at.get(id)!]));
}

/**
 * The cells a card at `point` is in, as `row:column`: from the cell nearest its corner, `span` across and down, on the grid or off it.
 * A card a quarter of a row or more from its nearest row is in the row it straddles too: the layering puts a card halfway down a row, level
 * with the middle of the two beside it, and a card placed beneath it must not land on its lower half.
 */
function cellsOf({ x, y }: Point, span: Span): string[] {
  const column = Math.round(x / CELL_WIDTH);
  const top = Math.round(y / CELL_HEIGHT - 0.25);
  const bottom = Math.round(y / CELL_HEIGHT + 0.25) + span.rows - 1;
  const cells: string[] = [];
  for (let r = top; r <= bottom; r++) {
    for (let c = column; c < column + span.columns; c++) cells.push(`${r}:${c}`);
  }
  return cells;
}

/**
 * What to save: every card where it was last left — the ones on the floor now over what was saved —
 * and nothing for a run the store no longer lists.
 */
export function keepLayout(
  saved: ReadonlyMap<string, Point> | null,
  now: ReadonlyMap<string, Point>,
  known: ReadonlySet<string>,
): Map<string, Point> {
  return new Map([...(saved ?? []), ...now].filter(([id]) => known.has(id)));
}

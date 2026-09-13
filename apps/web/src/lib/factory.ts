/**
 * What the Factory works out about the runs, without React Flow: which are in flight, what a card
 * says, where a card goes, and where an open run's graph goes beside it. Pure.
 */
import type { RunSummary } from './api';
import { COLUMN_WIDTH, NODE_WIDTH, type Point } from './layout.ts';

/**
 * Whether a run is in flight, and so on the Factory by default: `assess` has it `running`, or it still moves
 * — the engine holds a task of it, or a tick would still file one (the api's `moving`).
 *
 * Nothing here reads a step's words. The status alone is not enough: `assess` reads a fan-out as failed once
 * one step is final without letting its followers run, while a sibling's session still works. A run is
 * finished once it has stopped moving without running: succeeded; failed at a refused check or a step
 * signed off blocked, whose followers read `waiting` and will never be filed; or cancelled, its stop landed.
 * A person such a run waits on finds it under "Show finished", or on Runs.
 */
export const inFlight = (run: Pick<RunSummary, 'status' | 'moving'>): boolean => run.status === 'running' || run.moving;

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
 *
 * A card is in the cell nearest its corner, and an open run in the cells its span covers from there —
 * beyond the grid's edges as well as on the grid, so a graph running past the edge moves a card a person
 * parked there; only (3) keeps to the grid. A card off the floor holds no cell: finished runs pile up,
 * and holding their cells would leave holes that never close.
 */
export function placeRuns(
  ids: readonly string[],
  onFloor: ReadonlyMap<string, Point>,
  saved: ReadonlyMap<string, Point> | null,
  spans: ReadonlyMap<string, Span> = new Map(),
): Map<string, Point> {
  const floor = new Set(ids);
  const order = [...[...spans.keys()].filter((id) => floor.has(id)), ...ids.filter((id) => !spans.has(id))];
  const spanOfId = (id: string) => spans.get(id) ?? ONE_CELL;
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
  for (const id of order) {
    if (at.has(id)) continue;
    const span = spanOfId(id);
    // The last column an anchor can take and keep the graph in the row, or the first for one wider than the grid.
    const last = GRID_COLUMNS - Math.min(span.columns, GRID_COLUMNS);
    for (let cell = 0; ; cell++) {
      const point = { x: (cell % GRID_COLUMNS) * CELL_WIDTH, y: Math.floor(cell / GRID_COLUMNS) * CELL_HEIGHT };
      if (cell % GRID_COLUMNS <= last && free(point, span, taken)) {
        put(id, point);
        break;
      }
    }
  }
  return new Map(ids.map((id) => [id, at.get(id)!]));
}

/** The cells a card at `point` is in, as `row:column`: from the cell nearest its corner, `span` across and down, on the grid or off it. */
function cellsOf({ x, y }: Point, span: Span): string[] {
  const column = Math.round(x / CELL_WIDTH);
  const row = Math.round(y / CELL_HEIGHT);
  const cells: string[] = [];
  for (let r = row; r < row + span.rows; r++) {
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

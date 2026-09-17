/**
 * What the Factory works out about the runs, without React Flow: which are in flight, what a card
 * says, where a card goes, and where an open run's graph goes beside it. Pure.
 */
import type { RunSummary } from './api';
import type { EdgeState } from './canvas.ts';
import { COLUMN_WIDTH, layers, NODE_WIDTH, ROW_HEIGHT, type Point, type StepEdges } from './layout.ts';

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

/**
 * Who a run waits on, as `wf ls` names them after `→ waiting on you:` — `approve plan` for a step at its gate — off the api's `onYou`; and for
 * a list from an api started before it carried `onYou`, the steps by name, as the board said them then. The list is read tolerantly, not
 * refused as a run's detail is (`withGraph`): the Factory polls it, and a refusal would take the whole floor down for a word.
 */
export const onYouOf = (run: Pick<RunSummary, 'waitingOnYou'> & { onYou?: readonly string[] }): readonly string[] => run.onYou ?? run.waitingOnYou;

/**
 * Where a run stands, in a word, as the start form offers it to wait on: called off; waiting on you (`waitsOnYou`) — a run that waits on
 * a run that never ships is one, though it has filed nothing and is not in flight; in flight; or finished.
 */
export const standingOf = (run: Pick<RunSummary, 'cancelledAt' | 'status' | 'moving' | 'waitingOnYou' | 'waiting'>): 'cancelled' | 'waiting on you' | 'in flight' | 'finished' =>
  run.cancelledAt ? 'cancelled' : waitsOnYou(run) ? 'waiting on you' : inFlight(run) ? 'in flight' : 'finished';

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

/**
 * The Runs page's order: the runs in flight first (`inFlight`, as the Factory counts them), then every other run; each newest first,
 * so the run just started heads the list, and a run that stops moving drops below the ones still going. A run waiting on you that
 * nothing of moves is not in flight, and is found by its date among the finished, where its row says it waits on you.
 */
export const inFlightFirst = <T extends Pick<RunSummary, 'id' | 'createdAt' | 'status' | 'moving'> & { waiting?: RunSummary['waiting'] }>(
  runs: readonly T[],
): T[] =>
  [...runs].sort((a, b) => Number(inFlight(b)) - Number(inFlight(a)) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));

/** A cell on the Factory's grid: room for one card and the gap beside and below it. Cards are drawn to fit. */
export const CELL_WIDTH = 320;
/**
 * A cell is as tall as the tallest card the board draws and the gap under it, as it is as wide as a card and the gap beside it: a card with
 * four steps and a line of what one of them asks stands about 235 tall — the e2e's floor measures 233 and 234 — and at 220 the grid put the
 * card beneath under its bottom edge on every layout. The card is capped to nothing: what a person has to act on is what would be cut.
 */
export const CELL_HEIGHT = 260;
export const GRID_COLUMNS = 4;
/** How wide a card is drawn (`w-72`): the rest of its cell is the gap to the next card. */
export const CARD_WIDTH = 288;
/** How far below its card's top an open run's graph starts, so the edge from the card runs about level. */
export const GRAPH_TOP = 24;

/** The cells a run takes, from its card's cell: across, and down. A closed card takes its one. */
export type Span = { columns: number; rows: number };
export const ONE_CELL: Span = { columns: 1, rows: 1 };

/**
 * The cells an open run takes: its card's, as many more to the right as its steps reach, and as many rows down. From
 * where each step is beside the card (`arranged`: the layering's places, moved where a person dragged them), which reads
 * names, `after` and the person's moves only, so a refetch that moves a status moves no card.
 *
 * Across, to a gap's width past the rightmost step's right edge — the layering puts a step a column's arrow right of the
 * card, so a graph a column wide takes the card's cell and one more; down, to a row's height under the lowest step's top.
 * Never less than the card's own cell. A step dragged left of the card, or above it, is outside these cells: what the run
 * claims lies right of its card and below its top, and a card a person left under such a step is theirs to move.
 */
export function spanOf(at: ReadonlyMap<string, Point>): Span {
  const xs = [...at.values()].map((p) => p.x);
  const ys = [...at.values()].map((p) => p.y);
  return {
    columns: Math.max(1, Math.ceil((Math.max(...xs) + NODE_WIDTH + (CELL_WIDTH - CARD_WIDTH)) / CELL_WIDTH)),
    rows: Math.max(1, Math.ceil((Math.max(...ys) + ROW_HEIGHT) / CELL_HEIGHT)),
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

/** A step's node on the floor, named by its run too: two runs may each have an `implement`. */
export const stepId = (runId: string, step: string): string => `${runId}/${step}`;

/** The run a node on the floor is of: a card's own id, or the run a step's node is named by — a run id has no slash (`wf start` refuses one), so the last is the step's. */
export const runOfNode = (id: string): string => (id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : id);

/**
 * Where each step of an open run is beside its card: where the layering puts it (`graphAt`), moved by as far as a person
 * dragged it. `dragged` is how far each step on the floor was moved, by its node's id (`stepId`); a step not in it is where
 * the layering put it.
 */
export function arranged(runId: string, at: ReadonlyMap<string, Point>, dragged: ReadonlyMap<string, Point>): Map<string, Point> {
  return new Map(
    [...at].map(([name, p]) => {
      const by = dragged.get(stepId(runId, name));
      return [name, by ? { x: p.x + by.x, y: p.y + by.y } : p];
    }),
  );
}

/**
 * The steps that move with `name` when a person drags it on the Factory: every step that waits on it, directly or through
 * others — the graph to its right — in the run's order, and not `name` itself. The steps it waits on, to its left, stay where
 * they are. Ends on any input: a step is taken once, so a cycle, which only a record edited by hand could have, is walked once.
 */
export function followersOf(steps: readonly StepEdges[], name: string): string[] {
  const found = new Set([name]);
  for (const one of found) for (const step of steps) if (step.after.includes(one)) found.add(step.name);
  return [...new Set(steps.map((step) => step.name))].filter((step) => step !== name && found.has(step));
}

/**
 * The cards that move with `id` when a person drags its card on the Factory, as a step's followers move with it: every card on
 * the floor that waits on it, directly or through others on the floor — the cards to its right, down the `after` edges the floor
 * draws (`runEdges`) — oldest first, and not `id` itself. The cards it waits on stay where they are. A run in an `after` that is
 * off the floor draws no edge, and nothing follows through it. Each card's steps go with it, as its children.
 */
export const followingCards = (runs: ReadonlyArray<Pick<RunSummary, 'id' | 'after'>>, id: string): string[] =>
  followersOf(runs.map((run) => ({ name: run.id, after: run.after })), id);

/**
 * How far each step was dragged, after `moving` are dragged `by` further: each of them moved by as much from where it was —
 * from where the layering put it, for one not dragged before — and every other step as it was.
 */
export function draggedBy(dragged: ReadonlyMap<string, Point>, moving: readonly string[], by: Point): Map<string, Point> {
  const next = new Map(dragged);
  for (const id of moving) {
    const was = dragged.get(id) ?? { x: 0, y: 0 };
    next.set(id, { x: was.x + by.x, y: was.y + by.y });
  }
  return next;
}

/** Of the steps a person dragged, those of runs the store still lists — open or not, as `keepLayout` keeps a card off the floor — and nothing for a run it has lost. */
export const keepDragged = (dragged: ReadonlyMap<string, Point>, known: ReadonlySet<string>): Map<string, Point> =>
  new Map([...dragged].filter(([id]) => known.has(runOfNode(id))));

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
 *    place right of every card already down that one of them waits on, and left of every one that waits on it.
 *    When some of a group are down and others are not, the group is laid out again together if a graph moved
 *    one of them aside, and the others go in among the cards down if they are coming onto the floor — each
 *    only where every edge still points right, the other way if that one cannot, and the cards down kept
 *    where they are if neither can.
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
  const mark = (id: string, point: Point) => {
    for (const cell of cellsOf(point, spanOfId(id))) {
      taken.add(cell);
      if (spans.has(id)) unfolded.add(cell);
    }
  };
  const put = (id: string, point: Point) => {
    at.set(id, point);
    mark(id, point);
  };
  /** Cards given up, to be placed again: the cells are worked out afresh, since cards may share one. */
  const unput = (gone: readonly string[]) => {
    for (const id of gone) at.delete(id);
    taken.clear();
    unfolded.clear();
    for (const [id, point] of at) mark(id, point);
  };
  const free = (point: Point, span: Span, of: ReadonlySet<string>) => cellsOf(point, span).every((cell) => !of.has(cell));
  const columnOf = (id: string) => Math.round(at.get(id)!.x / CELL_WIDTH);

  for (const id of order) {
    const here = onFloor.get(id);
    if (here && free(here, spanOfId(id), unfolded)) put(id, here);
  }
  for (const id of order) {
    const left = saved?.get(id);
    if (!at.has(id) && left && free(left, spanOfId(id), taken)) put(id, left);
  }
  /**
   * The closed cards `after` joins to `id`, placed or not, oldest first. `id` alone when it is open, and when what joins it goes round in
   * a cycle, which a record edited by hand could have: each of those cards is then placed on its own turn.
   */
  const groupOf = (id: string): string[] => {
    if (spans.has(id)) return [id];
    const found = new Set([id]);
    for (const one of found) {
      for (const other of [...parents.get(one)!, ...children.get(one)!]) if (!spans.has(other)) found.add(other);
    }
    const group = ids.filter((other) => found.has(other));
    try {
      layers(group.map((name) => ({ name, after: parents.get(name)!.filter((p) => found.has(p)) })));
    } catch {
      return [id];
    }
    return group;
  };
  /**
   * Where each of `members` goes, in cells from the corner of the room they take: their layering's columns, each centred on the
   * tallest — so a column a card short of it sits half a row down. Asked only of cards `groupOf` found in no cycle.
   */
  const shapeOf = (members: readonly string[]): Map<string, Point> => {
    const columns = layers(members.map((name) => ({ name, after: parents.get(name)!.filter((p) => members.includes(p)) })));
    const cells = columns.flatMap((column, c) => column.map((name, i) => [name, { x: c, y: i - (column.length - 1) / 2 }] as const));
    const top = Math.min(...cells.map(([, p]) => p.y));
    return new Map(cells.map(([name, p]) => [name, { x: p.x, y: p.y - top }]));
  };
  /**
   * `members` put down in their shape at the first free place, row by row, where each is right of every card already down that it waits
   * on and left of every one that waits on it. When no column keeps both, `strict` puts nothing and says so; otherwise the second gives
   * way, and the first holds.
   */
  const placeTogether = (members: readonly string[], strict: boolean): boolean => {
    const shape = shapeOf(members);
    const cell = (name: string) => shape.get(name)!;
    const first = Math.max(0, ...members.flatMap((m) => parents.get(m)!.filter((p) => at.has(p)).map((p) => columnOf(p) + 1 - cell(m).x)));
    const cap = Math.min(Infinity, ...members.flatMap((m) => children.get(m)!.filter((c) => at.has(c)).map((c) => columnOf(c) - 1 - cell(m).x)));
    if (cap < first && strict) return false;
    const width = Math.max(...members.map((m) => cell(m).x + spanOfId(m).columns));
    // The last column an anchor can take and keep the whole in the row, or the first for one wider than the grid — and no further right
    // than the cards that wait on them allow, when they allow a column at all.
    const last = Math.min(Math.max(first, GRID_COLUMNS - Math.min(width, GRID_COLUMNS)), cap < first ? Infinity : cap);
    for (let row = 0; ; row++) {
      for (let column = first; column <= last; column++) {
        const points = members.map((m) => [m, { x: (column + cell(m).x) * CELL_WIDTH, y: (row + cell(m).y) * CELL_HEIGHT }] as const);
        if (points.every(([m, point]) => free(point, spanOfId(m), taken))) {
          for (const [m, point] of points) put(m, point);
          return true;
        }
      }
    }
  };

  for (const id of order) {
    if (at.has(id)) continue;
    const group = groupOf(id);
    const loose = group.filter((m) => !at.has(m));
    const down = group.filter((m) => at.has(m));
    if (!down.length) {
      placeTogether(group, false);
      continue;
    }
    /** The cards not yet placed, in among the cards down, which stay where they are. */
    const amongDown = () => placeTogether(loose, true);
    /** The whole group laid out again — or, where a card outside it leaves no column for that, the cards down put back. */
    const again = () => {
      const were = down.map((m) => [m, at.get(m)!] as const);
      unput(down);
      if (placeTogether(group, true)) return true;
      for (const [m, point] of were) put(m, point);
      return false;
    };
    // A card of the group that was on the floor and has lost its place — a graph unfolded over it — takes the rest of its group with it,
    // laid out again together: moved a card at a time, the group would be layered over the cards that moved alone. Cards coming onto the
    // floor go in among the ones down first, which a person is looking at. Either only where every edge still points right: laid out
    // again, a group that waits on an open run and that the open run waits on too has no column when the two are also joined directly
    // (a triangle, a chain with a skip). And if neither can, the cards down stay, and only the cards not yet placed give way.
    const movedAside = loose.some((m) => onFloor.has(m));
    if (!(movedAside ? again() || amongDown() : amongDown() || again())) placeTogether(loose, false);
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

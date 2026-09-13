/**
 * What the Factory works out about the runs, without React Flow: which are in flight, what a card
 * says, and where a card goes. Pure.
 */
import type { RunSummary } from './api';
import type { Point } from './layout';

/**
 * First words of a step's status — `wf ls`'s, before any ` · ` — that say the step will not move
 * again by itself. `unknown` is a task the engine has no record of, which never moves again. `done`,
 * `verified ✓`, `unverified` and `unsigned` are words `wf ls` has and the api does not use yet; every
 * word starting `failed`, `failed ✗ check (…)` among them, is stopped too.
 */
const STOPPED = new Set(['succeeded', 'done', 'verified', 'verified ✓', 'unverified', 'unsigned', 'stopped', 'unknown']);

/**
 * Whether a step is still to move: not started, or started and not stopped.
 *
 * A word this does not know counts as moving — `running (working)`, `starting`, `between attempts`,
 * `needs-human`, `checking`, and whatever the engine says next — so a new word puts a run on the
 * floor rather than hiding it.
 */
export function stepInFlight(status: string, runCancelled: boolean): boolean {
  const [word = ''] = status.split(' · ');
  // Not started; on a run somebody called off, it never will be.
  if (word === 'waiting' || word === 'pending') return !runCancelled;
  return !(STOPPED.has(word) || word.startsWith('failed'));
}

/**
 * Whether a run is in flight, and so on the Factory by default: a step still to move, or a step
 * waiting on a person. Finished is every step stopped and nobody waited on.
 *
 * `waitingOnYou` is the api's, which already leaves out a run somebody called off. A step still
 * `waiting` counts even behind a failure it will never get past — `wf decide` reads that run as
 * over — so a failed run stays on the floor until somebody calls it off.
 */
export const inFlight = (run: RunSummary): boolean =>
  run.waitingOnYou.length > 0 || run.steps.some((step) => stepInFlight(step.status, run.cancelledAt !== null));

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

/**
 * Where each run's card goes: where it was left, if it was; else the first cell, row by row, that no
 * card is in. A card is in the cell nearest its corner, and one dragged off the grid is in none.
 */
export function placeRuns(ids: readonly string[], kept: ReadonlyMap<string, Point>): Map<string, Point> {
  const taken = new Set(ids.flatMap((id) => {
    const left = kept.get(id);
    return left ? [cellOf(left)] : [];
  }));
  const at = new Map<string, Point>();
  let cell = 0;
  for (const id of ids) {
    const left = kept.get(id);
    if (left) {
      at.set(id, left);
      continue;
    }
    while (taken.has(cell)) cell++;
    taken.add(cell);
    at.set(id, { x: (cell % GRID_COLUMNS) * CELL_WIDTH, y: Math.floor(cell / GRID_COLUMNS) * CELL_HEIGHT });
  }
  return at;
}

function cellOf({ x, y }: Point): number {
  const column = Math.round(x / CELL_WIDTH);
  const row = Math.round(y / CELL_HEIGHT);
  return column >= 0 && column < GRID_COLUMNS && row >= 0 ? row * GRID_COLUMNS + column : -1;
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

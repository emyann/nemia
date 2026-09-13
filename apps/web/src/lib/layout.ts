/**
 * Where each step of a run goes on the canvas: longest-path layering from `after`, read left to right.
 *
 * A step sits one column right of the deepest step it waits on, so every edge points right and a
 * fan-in lands to the right of all of its parents. Within a column, steps are ordered top to bottom
 * by where their parents are — the mean of their places in their own columns — then by the run's
 * own order, which keeps a chain in one row and a fan-out uncrossed. A run is a handful of steps;
 * nothing here is cleverer than that.
 *
 * Pure, and it ends on any input. A cycle is refused rather than followed: `loadWorkflows` refuses
 * one before a run can start, so only a folder or record edited by hand could bring one here.
 */

export type StepEdges = { name: string; after: readonly string[] };
export type Point = { x: number; y: number };

/** Room for one node and the arrow to the next column. The nodes are drawn a fixed width to fit. */
export const COLUMN_WIDTH = 300;
/** Room for one node and the gap below it, within a column. */
export const ROW_HEIGHT = 150;

/** The columns, left first, each top to bottom. Throws, naming the steps it could not place, on a cycle. */
export function layers(steps: readonly StepEdges[]): string[][] {
  const order = new Map<string, number>();
  const afterOf = new Map<string, readonly string[]>();
  for (const step of steps) {
    if (order.has(step.name)) continue;
    order.set(step.name, order.size);
    afterOf.set(step.name, step.after);
  }
  const names = [...order.keys()];

  // Edges between the run's own steps only: an `after` naming anything else draws nothing.
  const parents = new Map(names.map((name) => [name, [...new Set(afterOf.get(name))].filter((p) => order.has(p))]));
  const children = new Map(names.map((name) => [name, [] as string[]]));
  for (const [name, ps] of parents) for (const p of ps) children.get(p)!.push(name);

  // Kahn's algorithm. A step is taken once, when the last step it waits on has been, so the loop
  // visits each edge once and ends whatever `after` says; what is never taken is in or behind a cycle.
  const depthOf = new Map<string, number>();
  const waiting = new Map(names.map((name) => [name, parents.get(name)!.length]));
  const taken = names.filter((name) => waiting.get(name) === 0);
  for (const name of taken) depthOf.set(name, 0);
  for (let i = 0; i < taken.length; i++) {
    const name = taken[i]!;
    for (const child of children.get(name)!) {
      depthOf.set(child, Math.max(depthOf.get(child) ?? 0, depthOf.get(name)! + 1));
      waiting.set(child, waiting.get(child)! - 1);
      if (waiting.get(child) === 0) taken.push(child);
    }
  }
  if (taken.length < names.length) {
    const stuck = names.filter((name) => waiting.get(name)! > 0);
    throw new Error(
      `The steps' \`after\` go round in a cycle among ${stuck.join(', ')}, so they have no order to be drawn in. ` +
        '`wf start` refuses a folder like that; look at what changed in the workflow folder since the run started.',
    );
  }

  const columns: string[][] = [];
  for (const name of names) (columns[depthOf.get(name)!] ??= []).push(name);
  const place = new Map<string, number>();
  columns.forEach((column, c) => {
    if (c > 0) {
      // Every step right of the first column has a parent, and every parent is in a column already placed.
      const pull = (name: string) => mean(parents.get(name)!.map((p) => place.get(p)!));
      column.sort((a, b) => pull(a) - pull(b) || order.get(a)! - order.get(b)!);
    }
    column.forEach((name, i) => place.set(name, i - (column.length - 1) / 2));
  });
  return columns;
}

/** Each step's top-left corner: the first column at x = 0, every column centred on y = 0. */
export function layout(steps: readonly StepEdges[]): Map<string, Point> {
  const at = new Map<string, Point>();
  layers(steps).forEach((column, c) =>
    column.forEach((name, i) => at.set(name, { x: c * COLUMN_WIDTH, y: (i - (column.length - 1) / 2) * ROW_HEIGHT })),
  );
  return at;
}

const mean = (xs: readonly number[]) => xs.reduce((sum, x) => sum + x, 0) / xs.length;

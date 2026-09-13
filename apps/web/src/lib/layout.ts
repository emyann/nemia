/**
 * Where each step of a run goes on the canvas: longest-path layering from `after`.
 *
 * A step sits one row below the deepest step it waits on, so every edge points down and a fan-in
 * lands below all of its parents. Within a row, steps are ordered by where their parents are — the
 * mean of their columns — then by the run's own order, which keeps a chain in one column and a
 * fan-out uncrossed. A run is a handful of steps; nothing here is cleverer than that.
 *
 * Pure, and it ends on any input. A cycle is refused rather than followed: `loadWorkflows` refuses
 * one before a run can start, so only a folder or record edited by hand could bring one here.
 */

export type StepEdges = { name: string; after: readonly string[] };
export type Point = { x: number; y: number };

/** Room for one node and the gap beside it. The nodes are drawn a fixed width to fit. */
export const COLUMN_WIDTH = 260;
export const ROW_HEIGHT = 150;

/** The rows, top first, each left to right. Throws, naming the steps it could not place, on a cycle. */
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
  const rowOf = new Map<string, number>();
  const waiting = new Map(names.map((name) => [name, parents.get(name)!.length]));
  const taken = names.filter((name) => waiting.get(name) === 0);
  for (const name of taken) rowOf.set(name, 0);
  for (let i = 0; i < taken.length; i++) {
    const name = taken[i]!;
    for (const child of children.get(name)!) {
      rowOf.set(child, Math.max(rowOf.get(child) ?? 0, rowOf.get(name)! + 1));
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

  const rows: string[][] = [];
  for (const name of names) (rows[rowOf.get(name)!] ??= []).push(name);
  const column = new Map<string, number>();
  rows.forEach((row, r) => {
    if (r > 0) {
      // Every step below the first row has a parent, and every parent is in a row already placed.
      const pull = (name: string) => mean(parents.get(name)!.map((p) => column.get(p)!));
      row.sort((a, b) => pull(a) - pull(b) || order.get(a)! - order.get(b)!);
    }
    row.forEach((name, i) => column.set(name, i - (row.length - 1) / 2));
  });
  return rows;
}

/** Each step's top-left corner, rows centred on x = 0. */
export function layout(steps: readonly StepEdges[]): Map<string, Point> {
  const at = new Map<string, Point>();
  layers(steps).forEach((row, r) =>
    row.forEach((name, i) => at.set(name, { x: (i - (row.length - 1) / 2) * COLUMN_WIDTH, y: r * ROW_HEIGHT })),
  );
  return at;
}

const mean = (xs: readonly number[]) => xs.reduce((sum, x) => sum + x, 0) / xs.length;

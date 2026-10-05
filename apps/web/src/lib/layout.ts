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

/**
 * A run's steps for the layering, off the graph the api gives: each step, in the run's order, with the steps its `after`
 * edges come from. A `loop` edge is left out: it points back, so laid out it would open a column right of the step it
 * returns to — or read as a cycle — for an edge that orders nothing.
 */
export function stepsOf(names: readonly string[], edges: ReadonlyArray<{ from: string; to: string; kind: string }>): StepEdges[] {
  return names.map((name) => ({ name, after: edges.filter((e) => e.kind === 'after' && e.to === name).map((e) => e.from) }));
}

/** Room for one node and the arrow to the next column. The nodes are drawn a fixed width to fit. */
export const COLUMN_WIDTH = 300;
/** Room for one node and the gap below it, within a column. */
export const ROW_HEIGHT = 150;
/** How wide a step's node is drawn (`w-56`): the rest of its column is the arrow to the next. */
export const NODE_WIDTH = 224;

/**
 * The columns, left first, each top to bottom. An `after` naming anything but one of the run's own steps draws nothing. Each step is
 * taken once, when the last step it waits on has been (Kahn's algorithm), so every edge is visited once and the layering ends whatever
 * `after` says. Throws, naming the steps it could not place, on a cycle: a step never taken is in or behind one.
 */
export function layers(steps: readonly StepEdges[]): string[][] {
  const order = new Map<string, number>();
  const afterOf = new Map<string, readonly string[]>();
  for (const step of steps) {
    if (order.has(step.name)) continue;
    order.set(step.name, order.size);
    afterOf.set(step.name, step.after);
  }
  const names = [...order.keys()];

  const parents = new Map(names.map((name) => [name, [...new Set(afterOf.get(name))].filter((p) => order.has(p))]));
  const children = new Map(names.map((name) => [name, [] as string[]]));
  for (const [name, ps] of parents) for (const p of ps) children.get(p)!.push(name);

  const depthOf = new Map<string, number>();
  const waiting = new Map(names.map((name) => [name, parents.get(name)!.length]));
  const taken = names.filter((name) => waiting.get(name) === 0);
  for (const name of taken) depthOf.set(name, 0);
  for (let i = 0; i < taken.length; i++) {
    const name = taken[i];
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
        'A start refuses a folder like that; look at what changed in the workflow folder since the run started.',
    );
  }

  const columns: string[][] = [];
  for (const name of names) (columns[depthOf.get(name)!] ??= []).push(name);
  const place = new Map<string, number>();
  columns.forEach((column, c) => {
    if (c > 0) {
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

/** The room a layout takes: a column's width per column, and a row's height per row of its tallest column. */
export function extentOf(at: ReadonlyMap<string, Point>): { width: number; height: number } {
  if (!at.size) return { width: 0, height: 0 };
  const xs = [...at.values()].map((p) => p.x);
  const ys = [...at.values()].map((p) => p.y);
  return { width: Math.max(...xs) - Math.min(...xs) + COLUMN_WIDTH, height: Math.max(...ys) - Math.min(...ys) + ROW_HEIGHT };
}

const mean = (xs: readonly number[]) => xs.reduce((sum, x) => sum + x, 0) / xs.length;

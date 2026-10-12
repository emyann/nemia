/**
 * What the canvases work out, without React Flow: the words on a step's node, which edges are
 * complete, and where a person left the nodes — a run's steps, or the Factory's runs and which are open. Pure, apart
 * from the storage calls at the end, each of which survives a browser that refuses storage.
 */
import type { GraphEdge, RunGraph, StepAttempts } from './api';
import type { Point } from './layout';
import { satisfiesAfter, type StepState } from './status.ts';

/** A session is going, so its attempt's time is still counting. */
export const isLive = (state: StepState): boolean => state === 'working' || state === 'needs-human';

/**
 * A duration in its two largest units: `42s`, `12m 04s`, `3h 12m`, `2d 4h`; one below zero, where this clock is behind the engine's, is
 * `0s`.
 */
export function duration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${pad(s % 60)}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${pad(m % 60)}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * `#<attempts> · <time>` for a step's latest attempt, or null before its first.
 *
 * While the attempt runs, the time counts. Once it is over, the time is how long it took, from its
 * start to its end. An attempt over whose record has no end (`endedAt`) says how long ago it started
 * instead.
 */
export function attemptLine(attempts: StepAttempts, live: boolean, now: number): string | null {
  const { count, latest } = attempts;
  if (!latest) return null;
  const started = Date.parse(latest.startedAt);
  if (latest.ended === null && live) return `#${count} · ${duration(now - started)}`;
  if (latest.endedAt) return `#${count} · ${duration(Date.parse(latest.endedAt) - started)}`;
  return `#${count} · started ${duration(now - started)} ago`;
}

/**
 * What an edge says, which is how the canvases draw it (`StateEdge`): `done`, the work at both its ends is done — solid;
 * `running`, work is moving along it now — in the running colour, a dot travelling it; `to-come`, what it stands for is
 * still to happen — dashed, and still.
 */
export type EdgeState = 'to-come' | 'running' | 'done';

/**
 * Work is moving into a step: its session is at work, or its check is running. Not a step asking a person, a human gate, a
 * refused check or a step not filed: nothing is moving there.
 */
export const movingInto = (state: StepState): boolean => state === 'working' || state === 'checking';

/** An edge into `target`: done once the work at both ends is, running while work moves into the target, and to come otherwise. */
export const edgeState = (sourceDone: boolean, target: StepState): EdgeState =>
  sourceDone && satisfiesAfter(target) ? 'done' : movingInto(target) ? 'running' : 'to-come';

/**
 * An edge as the canvases draw it. `state`: what it says — on a `loop` edge never `done`, since it stands for a round that
 * may yet come: `running` while its next round is due, and `to-come` otherwise. `label`: on a `loop` edge past its first
 * round, the round it is on.
 */
export type CanvasEdge = {
  id: string;
  source: string;
  target: string;
  kind: GraphEdge['kind'];
  state: EdgeState;
  label: string | null;
};

/** A step as its edges read it: its state, the note the list words beside it, and whether its next round is due, as the api answers it. */
export type EdgeStep = { name: string; state: StepState; note: string | null; roundDue: boolean };

/**
 * The run's graph as the api gives it, between the steps the run has: an `after` edge done when the work at both ends is
 * done — verified, or on its own word — and a `loop` edge from the looping step back to its target.
 */
export function edgesOf(graph: RunGraph, steps: readonly EdgeStep[]): CanvasEdge[] {
  const of = new Map(steps.map((s) => [s.name, s]));
  const seen = new Set<string>();
  return graph.edges.flatMap((edge): CanvasEdge[] => {
    const source = of.get(edge.from);
    const target = of.get(edge.to);
    const id = edge.kind === 'loop' ? `loop:${edge.from}->${edge.to}` : `${edge.from}->${edge.to}`;
    if (!source || !target || seen.has(id)) return [];
    seen.add(id);
    if (edge.kind === 'after') {
      return [
        {
          id,
          source: edge.from,
          target: edge.to,
          kind: 'after',
          state: edgeState(satisfiesAfter(source.state), target.state),
          label: null,
        },
      ];
    }
    return [
      {
        id,
        source: edge.from,
        target: edge.to,
        kind: 'loop',
        state: source.roundDue ? 'running' : 'to-come',
        label: loopLabel([source.note, target.note], edge.rounds),
      },
    ];
  });
}

/**
 * The round a note puts a step of a loop on — `round 2 of 3`, `round 3 of 3, and it asked again — …`, `round 4 asked (…) — …`
 * — and its cap when it says one.
 */
const ROUND = /^round (\d+)(?: of (\d+))?/;

/**
 * `round n of N` for a loop past its first round, off the notes the CLI's `ls` prints: the looping step's first, where a round due
 * and a loop out of rounds are said, then its target's, which is filed first each round. Null while the loop is on its first.
 * N is the note's, else the loop's `rounds`: a round a person asked for past the cap reads `round 4 of 3`.
 */
export function loopLabel(notes: ReadonlyArray<string | null>, rounds: number): string | null {
  for (const note of notes) {
    const m = note ? ROUND.exec(note) : null;
    if (m && Number(m[1]) > 1) return `round ${m[1]} of ${m[2] ?? rounds}`;
  }
  return null;
}

/** The handles a `loop` edge leaves its looping step by and comes into its target by: under each node (`StepNode`). */
export const LOOP_SOURCE = 'loop-out';
export const LOOP_TARGET = 'loop-in';

/**
 * An edge's colour, its arrow's and its travelling dot's too, each theme's in styles.css: the running colour while work moves
 * along it — a loop's edge back too, while its round is due — else a loop's own, and the rest's for work done and to come.
 */
export function edgeStroke(state: EdgeState, loop: boolean): string {
  if (state === 'running') return 'var(--edge-running)';
  if (loop) return 'var(--edge-loop)';
  return state === 'done' ? 'var(--edge-done)' : 'var(--edge-to-come)';
}

/**
 * An edge's line, on the canvas and in its legend alike: dashed while what it stands for is still to happen — work to come,
 * and a loop's edge back, always — and a little heavier while work moves along it.
 */
export const edgeLine = (state: EdgeState, loop: boolean): { strokeWidth: number; strokeDasharray?: string } => ({
  strokeWidth: state === 'running' ? 2 : 1.5,
  ...(loop || state === 'to-come' ? { strokeDasharray: '5 4' } : {}),
});

/** How long the dot takes along a moving edge, and along the legend's: one animation, at one pace, wherever it is. */
export const TRAVEL_SECONDS = 1.8;

/** How far below the lower of its ends a `loop` edge dips: under the row, and clear of the node's own border. */
export const LOOP_DEPTH = 44;

/**
 * A `loop` edge's path, from under its looping step to under its target: straight down from one, beneath the row, and up
 * into the other, where its arrow points. A cubic whose control points sit below both ends, at the height that puts its middle
 * (at t = ½, ⅛ of each end and ⅜ of each control point), where the label goes, `depth` below the lower end.
 */
export function loopPath(source: Point, target: Point, depth = LOOP_DEPTH): { path: string; labelX: number; labelY: number } {
  const bottom = Math.max(source.y, target.y) + depth;
  const control = (bottom - (source.y + target.y) / 8) / 0.75;
  return {
    path: `M ${source.x},${source.y} C ${source.x},${control} ${target.x},${control} ${target.x},${target.y}`,
    labelX: (source.x + target.x) / 2,
    labelY: bottom,
  };
}

/** The least zoom a run's canvas is drawn at, which a fit does not go below. */
export const LEAST_ZOOM = 0.5;

/** The least width of canvas the bar must leave uncovered for a fit to keep the nodes clear of it, in pixels. */
export const BESIDE_MIN = 240;

/** The room a fit beside the bar keeps between the nodes and the bar, in pixels. */
const BESIDE_GAP = 24;

/**
 * The padding that fits a canvas `width` pixels wide in the part the floating bar leaves uncovered, the bar `over` pixels over its right
 * edge, for nodes `nodes` wide at a zoom of 1: a tenth of the width on the left, the bar and a gap on the right. Null, for a fit over the
 * whole canvas, when the bar covers none of it, when it leaves less than `BESIDE_MIN`, or when the nodes are wider at `LEAST_ZOOM` than the
 * part it leaves: a fit there would put nodes off the canvas.
 */
export function besideBar(width: number, over: number, nodes: number): Beside | null {
  const right = over + BESIDE_GAP;
  if (over <= 0 || width - over < BESIDE_MIN || nodes * LEAST_ZOOM > width * 0.9 - right) return null;
  return { left: '10%', right: `${right}px`, y: '20%' };
}

/** The padding of a fit beside the floating bar (`besideBar`). */
export type Beside = { left: '10%'; right: `${number}px`; y: '20%' };

/**
 * How a canvas `width` pixels wide, the bar `over` pixels over its right edge, is fitted as a step opens in the bar: the run's nodes,
 * `run` wide at a zoom of 1, beside the bar where they fit there (`besideBar`); else, where the open step's node — `step`, its right edge
 * `right` pixels from the canvas's left as drawn and its width at a zoom of 1 — lies under the bar, that node alone beside it. Null, to
 * leave the view as it is: no step open, its node clear of the bar, or no room beside the bar even for it.
 */
export function besideOpen(
  width: number,
  over: number,
  run: number,
  step: { right: number; width: number } | null,
): { padding: Beside; alone: boolean } | null {
  const whole = besideBar(width, over, run);
  if (whole) return { padding: whole, alone: false };
  if (!step || step.right <= width - over) return null;
  const alone = besideBar(width, over, step.width);
  return alone && { padding: alone, alone: true };
}

/**
 * Whether the nodes in `bounds`, a box at a zoom of 1, are drawn whole on a canvas `width` by `height` pixels in the view `view`, its
 * offset and zoom: no edge of theirs past an edge of the canvas.
 */
export function drawnWhole(
  bounds: { x: number; y: number; width: number; height: number },
  view: { x: number; y: number; zoom: number },
  width: number,
  height: number,
): boolean {
  const left = bounds.x * view.zoom + view.x;
  const top = bounds.y * view.zoom + view.y;
  return left >= 0 && top >= 0 && left + bounds.width * view.zoom <= width && top + bounds.height * view.zoom <= height;
}

/**
 * The step whose session a click opens: on the second click of a double click, `detail` being the browser's count of the clicks, the
 * step `pressed` that its first click showed, wherever the second lands — on the bar the first opened, or on the pane a fit moved the
 * node off. Null for any other click, and where the first click showed no step.
 */
export const secondClick = (pressed: string | null, detail: number): string | null => (detail === 2 ? pressed : null);

/** Where each step goes: where a person left it, if they moved it, else where the layering puts it. */
export function place(
  names: readonly string[],
  computed: ReadonlyMap<string, Point>,
  saved: ReadonlyMap<string, Point> | null,
): Map<string, Point> {
  return new Map(names.map((name) => [name, saved?.get(name) ?? computed.get(name) ?? { x: 0, y: 0 }]));
}

/** A layout as it was saved, or null for anything that is not an object of finite points. */
export function parseLayout(raw: string | null): Map<string, Point> | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const at = new Map<string, Point>();
  for (const [name, point] of Object.entries(value)) {
    const { x, y } = (point ?? {}) as { x?: unknown; y?: unknown };
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    at.set(name, { x, y });
  }
  return at;
}

/**
 * Per run, in this browser only: a layout is a person's arrangement, not a fact about the run.
 *
 * `v2`, the key of an arrangement on the left-to-right layering: one under the key without it, made for a top-to-bottom one, is never read.
 */
const layoutKey = (runId: string) => `nemia:canvas-layout:v2:${runId}`;

/**
 * The Factory's arrangement, one per browser: where each run's card was left, by run id.
 *
 * `v2`, the key of an arrangement whose cells are wide enough to hold a card's rail. One under the key an older board wrote puts its cards
 * a narrower cell apart: it is read only while no `v2` one is saved, widened on the way (`widenLayout`), and forgotten when the first `v2`
 * one is.
 */
const FACTORY_KEY = 'nemia:factory-layout:v2';
const NARROW_FACTORY_KEY = 'hkb:factory-layout';

/** The Factory's open runs, one list per browser, beside its arrangement: whose cards are open on their steps, in the order opened. */
const FACTORY_OPEN_KEY = 'nemia:factory-open';

/**
 * What a browser may keep for the Factory that nothing reads, each under the key an older board wrote: an arrangement of the steps of a
 * graph unfolded beside a card, and the arrangement and open runs kept before the keys were `nemia:`. Forgotten when the floor opens, so
 * they do not sit in a browser for ever.
 */
const FACTORY_LEFTOVER_KEYS = ['hkb:factory-steps', 'hkb:factory-layout:v2', 'hkb:factory-open'];

export const readLayout = (runId: string): Map<string, Point> | null => readAt(layoutKey(runId), parseLayout, null);
export const saveLayout = (runId: string, at: ReadonlyMap<string, Point>): void => saveAt(layoutKey(runId), Object.fromEntries(at));
export const forgetLayout = (runId: string): void => forgetAt(layoutKey(runId));

export const readFactoryLayout = (): Map<string, Point> | null => readAt(FACTORY_KEY, parseLayout, null);
/** The arrangement saved while a cell was narrower, as it was saved: for `widenLayout`. */
export const readNarrowFactoryLayout = (): Map<string, Point> | null => readAt(NARROW_FACTORY_KEY, parseLayout, null);
export const saveFactoryLayout = (at: ReadonlyMap<string, Point>): void => {
  saveAt(FACTORY_KEY, Object.fromEntries(at));
  forgetAt(NARROW_FACTORY_KEY);
};
export const forgetFactoryLayout = (): void => {
  forgetAt(FACTORY_KEY);
  forgetAt(NARROW_FACTORY_KEY);
};

export const readFactoryOpen = (): string[] => readAt(FACTORY_OPEN_KEY, parseOpen, []);
export const saveFactoryOpen = (ids: readonly string[]): void => saveAt(FACTORY_OPEN_KEY, ids);
export const forgetFactoryOpen = (): void => forgetAt(FACTORY_OPEN_KEY);

export const forgetFactoryLeftovers = (): void => {
  for (const key of FACTORY_LEFTOVER_KEYS) forgetAt(key);
};

/** The open runs as they were saved: run ids, each once, in order; none for anything that is not a list of ids. */
export function parseOpen(raw: string | null): string[] {
  if (raw === null) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  return Array.isArray(value) && value.every((id) => typeof id === 'string' && id !== '') ? [...new Set<string>(value)] : [];
}

function readAt<T>(key: string, parse: (raw: string | null) => T, none: T): T {
  try {
    return parse(localStorage.getItem(key));
  } catch {
    return none;
  }
}

/** Saves `value` under `key`: where storage is refused or full, nothing is kept, and the arrangement lasts as long as the page does. */
function saveAt(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

/** Forgets what is kept under `key`: where storage is refused, nothing was kept to forget. */
function forgetAt(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {}
}

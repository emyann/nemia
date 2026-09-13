/**
 * What the canvases work out, without React Flow: the words on a step's node, which edges are
 * complete, and where a person left the nodes — a run's steps, or the Factory's runs. Pure, apart
 * from the storage calls at the end, each of which survives a browser that refuses storage.
 */
import type { StepAttempts } from './api';
import type { Point } from './layout';
import type { StepState } from './status';

/** A session is going, so its attempt's time is still counting. */
export const isLive = (state: StepState): boolean => state === 'working' || state === 'needs-human';

/** A duration in its two largest units: `42s`, `12m 04s`, `3h 12m`, `2d 4h`. */
export function duration(ms: number): string {
  // Below zero only when this clock is behind the engine's; nothing has elapsed yet.
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
 * `#<attempts> · <elapsed>` for a step's latest attempt, or null before its first.
 *
 * Elapsed counts only while the attempt runs. Once it is over the api has no end time to stop the
 * clock at — the engine's view does not keep one — so it says how long ago the attempt started.
 */
export function attemptLine(attempts: StepAttempts, live: boolean, now: number): string | null {
  const { count, latest } = attempts;
  if (!latest) return null;
  const since = duration(now - Date.parse(latest.startedAt));
  return latest.ended === null && live ? `#${count} · ${since}` : `#${count} · started ${since} ago`;
}

export type CanvasEdge = { id: string; source: string; target: string; complete: boolean };

/** One edge per `after` between steps the run has. Complete when the steps at both ends are done. */
export function edgesOf(steps: ReadonlyArray<{ name: string; after: readonly string[]; state: StepState }>): CanvasEdge[] {
  const stateOf = new Map(steps.map((s) => [s.name, s.state]));
  return steps.flatMap((step) =>
    [...new Set(step.after)]
      .filter((parent) => stateOf.has(parent))
      .map((parent) => ({
        id: `${parent}->${step.name}`,
        source: parent,
        target: step.name,
        complete: stateOf.get(parent) === 'done' && step.state === 'done',
      })),
  );
}

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
 * `v2` since the graph reads left to right. An arrangement dragged on the top-to-bottom canvas is
 * left unread under the old key, rather than laid over the new layering with its steps stacked.
 */
const layoutKey = (runId: string) => `hkb:canvas-layout:v2:${runId}`;

/** The Factory's arrangement, one per browser: where each run's card was left, by run id. */
const FACTORY_KEY = 'hkb:factory-layout';

export const readLayout = (runId: string): Map<string, Point> | null => readAt(layoutKey(runId));
export const saveLayout = (runId: string, at: ReadonlyMap<string, Point>): void => saveAt(layoutKey(runId), at);
export const forgetLayout = (runId: string): void => forgetAt(layoutKey(runId));

export const readFactoryLayout = (): Map<string, Point> | null => readAt(FACTORY_KEY);
export const saveFactoryLayout = (at: ReadonlyMap<string, Point>): void => saveAt(FACTORY_KEY, at);
export const forgetFactoryLayout = (): void => forgetAt(FACTORY_KEY);

function readAt(key: string): Map<string, Point> | null {
  try {
    return parseLayout(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function saveAt(key: string, at: ReadonlyMap<string, Point>): void {
  try {
    localStorage.setItem(key, JSON.stringify(Object.fromEntries(at)));
  } catch {
    // Refused or full: the arrangement lasts as long as the page does.
  }
}

function forgetAt(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing could have been kept, so there is nothing to forget.
  }
}

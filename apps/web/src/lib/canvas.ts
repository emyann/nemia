/**
 * What the canvases work out, without React Flow: the words on a step's node, which edges are
 * complete, and where a person left the nodes — a run's steps, or the Factory's runs and which are open. Pure, apart
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
 * `#<attempts> · <time>` for a step's latest attempt, or null before its first.
 *
 * While the attempt runs, the time counts. Once it is over, the time is how long it took, from its
 * start to its end. A record from before the engine kept the end has no clock to stop, so it says how
 * long ago the attempt started instead.
 */
export function attemptLine(attempts: StepAttempts, live: boolean, now: number): string | null {
  const { count, latest } = attempts;
  if (!latest) return null;
  const started = Date.parse(latest.startedAt);
  if (latest.ended === null && live) return `#${count} · ${duration(now - started)}`;
  if (latest.endedAt) return `#${count} · ${duration(Date.parse(latest.endedAt) - started)}`;
  return `#${count} · started ${duration(now - started)} ago`;
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

/** The Factory's open runs, one list per browser, beside its arrangement: whose graphs are unfolded, in the order opened. */
const FACTORY_OPEN_KEY = 'hkb:factory-open';

export const readLayout = (runId: string): Map<string, Point> | null => readAt(layoutKey(runId), parseLayout, null);
export const saveLayout = (runId: string, at: ReadonlyMap<string, Point>): void => saveAt(layoutKey(runId), Object.fromEntries(at));
export const forgetLayout = (runId: string): void => forgetAt(layoutKey(runId));

export const readFactoryLayout = (): Map<string, Point> | null => readAt(FACTORY_KEY, parseLayout, null);
export const saveFactoryLayout = (at: ReadonlyMap<string, Point>): void => saveAt(FACTORY_KEY, Object.fromEntries(at));
export const forgetFactoryLayout = (): void => forgetAt(FACTORY_KEY);

export const readFactoryOpen = (): string[] => readAt(FACTORY_OPEN_KEY, parseOpen, []);
export const saveFactoryOpen = (ids: readonly string[]): void => saveAt(FACTORY_OPEN_KEY, ids);
export const forgetFactoryOpen = (): void => forgetAt(FACTORY_OPEN_KEY);

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

function saveAt(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
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

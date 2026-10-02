/**
 * The frame's floating bar, as the address and this browser keep it: what it shows, read from and written to the root's search key `bar`,
 * what a press beside it does, how wide it is drawn, and what Escape does. Pure, for `useBar`, the bar (`FloatingBar`) and its node test.
 */

/** What the bar shows: the start of a run in a factory, a run, or a step of a run. */
export type Bar = { kind: 'start'; factory: string } | { kind: 'run'; run: string } | { kind: 'step'; run: string; step: string };

/** The key this browser keeps the bar's one width under, for every page. */
export const BAR_KEY = 'nemia:bar-width';
/** The narrowest the bar is drawn, in pixels. */
export const BAR_MIN = 320;
/** The width of a bar never resized. */
export const BAR_DEFAULT = 576;
/** The strip of page a resized bar always leaves in view at its left, in pixels. */
export const BAR_GAP = 96;
/** How far one arrow key moves the bar's edge, in pixels. */
export const BAR_STEP = 16;

/**
 * The bar `value` names in the address — `start:<factory>`, `run:<run>` or `step:<run>/<step>` — or none for anything else: another kind,
 * an empty name, a run with a `/` in its id, not a string. A run id is a file name in the store, so a step's address splits at its first
 * `/`, and the step keeps any `/` or `:` of its own.
 */
export function barOf(value: unknown): Bar | undefined {
  if (typeof value !== 'string') return undefined;
  const at = value.indexOf(':');
  if (at <= 0) return undefined;
  const kind = value.slice(0, at);
  const name = value.slice(at + 1);
  if (!name) return undefined;
  if (kind === 'start') return { kind, factory: name };
  if (kind === 'run') return name.includes('/') ? undefined : { kind, run: name };
  if (kind !== 'step') return undefined;
  const slash = name.indexOf('/');
  const run = name.slice(0, slash);
  const step = name.slice(slash + 1);
  return slash > 0 && step ? { kind, run, step } : undefined;
}

/** How `bar` is written in the address, which `barOf` reads back. */
export function barValue(bar: Bar): string {
  switch (bar.kind) {
    case 'start':
      return `start:${bar.factory}`;
    case 'run':
      return `run:${bar.run}`;
    case 'step':
      return `step:${bar.run}/${bar.step}`;
  }
}

/** The root route's search: a `bar` that names a bar, and none of the keys a page's own route reads (`factory`, `step`, the filters). */
export const barSearch = (search: Record<string, unknown>): { bar?: string } => (barOf(search.bar) ? { bar: search.bar as string } : {});

/** Whether `one` and `other` show the same thing: the same address, so the same kind for the same factory, run or step. */
const sameBar = (one: Bar, other: Bar): boolean => barValue(one) === barValue(other);

/** What the bar shows once `pressed` is pressed while it shows `open`: nothing, for the same thing again, else what was pressed. */
export const nextBar = (open: Bar | undefined, pressed: Bar): Bar | undefined => (open && sameBar(open, pressed) ? undefined : pressed);

/** The page Open visits from the bar: a run's page, a step's session, or none for what is no page, the start of a run. */
export type BarPage =
  | { to: '/runs/$runId'; params: { runId: string } }
  | { to: '/runs/$runId/steps/$step'; params: { runId: string; step: string } };

/** The page the bar's Open visits for `bar`: a run's page for a run, the step's session for a step, and none for the start of a run. */
export function barOpens(bar: Bar): BarPage | null {
  switch (bar.kind) {
    case 'run':
      return { to: '/runs/$runId', params: { runId: bar.run } };
    case 'step':
      return { to: '/runs/$runId/steps/$step', params: { runId: bar.run, step: bar.step } };
    case 'start':
      return null;
  }
}

/**
 * Whether `open` is something a canvas inspects — a run or a step — which a press on the empty canvas closes; never the start of a run,
 * whose half-typed brief a press beside it would lose, and nothing for a bar already closed.
 */
export const inspects = (open: Bar | undefined): boolean => open?.kind === 'run' || open?.kind === 'step';

/** The width `raw`, as this browser stored it, in pixels: `BAR_DEFAULT` for nothing stored and for anything not a positive number. */
export function parseWidth(raw: string | null): number {
  const width = raw === null || raw.trim() === '' ? Number.NaN : Number(raw);
  return Number.isFinite(width) && width > 0 ? width : BAR_DEFAULT;
}

/**
 * `width` drawn in a window `viewport` pixels wide: no narrower than `BAR_MIN`, and no wider than the window less `BAR_GAP`; the whole
 * window when it is too narrow for both.
 */
export function barWidth(width: number, viewport: number): number {
  const most = viewport - BAR_GAP;
  if (most < BAR_MIN) return viewport;
  return Math.min(Math.max(width, BAR_MIN), most);
}

/** The widest `barWidth` draws the bar in a window `viewport` pixels wide, for its edge to say. */
export const barMost = (viewport: number): number => barWidth(Number.POSITIVE_INFINITY, viewport);

/** An Escape pressed while the bar is open: whether a menu or a modal took it, whether it ends a composition, the text of its field. */
export type EscapeKey = { defaultPrevented: boolean; isComposing: boolean; fieldText: string | null };

/**
 * What `key` does to the open bar: nothing when something else took it or it ends a composition; `leave` the field it was pressed in when
 * that holds text, so a half-typed brief is not lost to one key; else `close` the bar.
 */
export function escapeDoes(key: EscapeKey): 'ignore' | 'leave' | 'close' {
  if (key.defaultPrevented || key.isComposing) return 'ignore';
  return key.fieldText ? 'leave' : 'close';
}

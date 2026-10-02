/**
 * The frame's floating bar, as the address and this browser keep it: what it shows, read from and written to the root's search key `bar`,
 * what a press beside it does, how wide it is drawn, and what Escape does. Pure, for `useBar`, the bar (`FloatingBar`) and its node test.
 */

/** What the bar shows: the start of a run in a factory. */
export type Bar = { kind: 'start'; factory: string };

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

/** The bar `value` names in the address — `start:<factory>` — or none for anything else: another kind, no name, not a string. */
export function barOf(value: unknown): Bar | undefined {
  if (typeof value !== 'string') return undefined;
  const at = value.indexOf(':');
  const kind = value.slice(0, at);
  const factory = value.slice(at + 1);
  return at > 0 && kind === 'start' && factory ? { kind, factory } : undefined;
}

/** How `bar` is written in the address, which `barOf` reads back. */
export const barValue = (bar: Bar): string => `${bar.kind}:${bar.factory}`;

/** The root route's search: a `bar` that names a bar, and none of the keys a page's own route reads (`factory`, `step`, the filters). */
export const barSearch = (search: Record<string, unknown>): { bar?: string } => (barOf(search.bar) ? { bar: search.bar as string } : {});

/** Whether `one` and `other` show the same thing: the same kind, for the same factory. */
const sameBar = (one: Bar, other: Bar): boolean => one.kind === other.kind && one.factory === other.factory;

/** What the bar shows once `pressed` is pressed while it shows `open`: nothing, for the same thing again, else what was pressed. */
export const nextBar = (open: Bar | undefined, pressed: Bar): Bar | undefined => (open && sameBar(open, pressed) ? undefined : pressed);

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

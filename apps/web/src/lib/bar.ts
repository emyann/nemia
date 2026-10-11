/**
 * The frame's floating bar, as the address and this browser keep it: what it shows, read from and written to the root's search key `bar`,
 * what a press beside it does, how wide it is drawn, and what Escape does. Pure, for `useBar`, the bar (`FloatingBar`) and its node test.
 */
import type { PagePlace } from './api/workflows.ts';

/**
 * What the bar shows: the start of a run in a factory, or in none yet (`null`), which asks which first; a factory, a run, a step of a
 * run, a step of a workflow (`spec`), read from the repository's workflows or yours (`from`), a state of one of the code's state
 * machines, the machine's gauges the bottom bar opens: the daemon, the feed, what is at work, the quota and the version, whole, or the
 * runs waiting on you across every factory, which the header's bell opens.
 */
export type Bar =
  | { kind: 'start'; factory: string | null }
  | { kind: 'factory'; factory: string }
  | { kind: 'run'; run: string }
  | { kind: 'step'; run: string; step: string }
  | { kind: 'spec'; from: 'repo' | 'yours'; workflow: string; step: string }
  | { kind: 'state'; machine: string; state: string }
  | { kind: 'gauges' }
  | { kind: 'waiting' };

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

/** The step of a run `name` names, `<run>/<step>`, split at its first `/`; none without a run or a step. */
function stepOf(name: string): Bar | undefined {
  const slash = name.indexOf('/');
  const run = name.slice(0, slash);
  const step = name.slice(slash + 1);
  return slash > 0 && step ? { kind: 'step', run, step } : undefined;
}

/**
 * The step of a workflow `name` names, `<from>/<workflow>/<step>`, split at its first two `/`; none for a `from` other than `repo` or
 * `yours`, or without a workflow or a step.
 */
function specOf(name: string): Bar | undefined {
  const [from, workflow] = name.split('/', 2);
  const step = name.slice(`${from}/${workflow}/`.length);
  if (from !== 'repo' && from !== 'yours') return undefined;
  return workflow && step && name.startsWith(`${from}/${workflow}/`) ? { kind: 'spec', from, workflow, step } : undefined;
}

/** The state of a machine `name` names, `<machine>/<state>`, split at its first `/`; none without a machine or a state. */
function machineStateOf(name: string): Bar | undefined {
  const slash = name.indexOf('/');
  const machine = name.slice(0, slash);
  const state = name.slice(slash + 1);
  return slash > 0 && state ? { kind: 'state', machine, state } : undefined;
}

/** The address of a start in no factory yet: no factory's name is free for it, since a name is `[a-z0-9-]`, so it is the bare word. */
const ASKING = 'start';

/** The address of the machine's gauges: the bare word, since there is one machine. */
const GAUGES = 'gauges';

/** The address of the runs waiting on you: the bare word, since the bell lists them across every factory. */
const WAITING = 'waiting';

/** Each kind of bar the address names, by its word, read from the non-empty name after its `:`; none for a name the kind refuses. */
const PARSERS: Record<string, (name: string) => Bar | undefined> = {
  start: (name) => ({ kind: 'start', factory: name }),
  factory: (name) => ({ kind: 'factory', factory: name }),
  run: (name) => (name.includes('/') ? undefined : { kind: 'run', run: name }),
  step: stepOf,
  spec: specOf,
  state: machineStateOf,
};

/**
 * The bar `value` names in the address — `start`, the bare word, for a start that asks its factory first, `gauges`, the bare word, for the
 * machine's gauges, `waiting`, the bare word, for the runs waiting on you, `start:<factory>`, `factory:<factory>`, `run:<run>`,
 * `step:<run>/<step>`, `spec:<from>/<workflow>/<step>` or `state:<machine>/<state>` — or none for anything else: another kind bare or with
 * an empty name, a run with a `/` in its id, a `from` other than `repo` or `yours`, not a string. A factory keeps its whole name. A run id
 * is a file name in the store, a workflow's name its folder's, and a machine's name a word, so a step's and a state's address split at its
 * first `/`, a workflow's step's at its first two, and the step or the state keeps any `/` or `:` of its own.
 */
export function barOf(value: unknown): Bar | undefined {
  if (typeof value !== 'string') return undefined;
  if (value === ASKING) return { kind: 'start', factory: null };
  if (value === GAUGES) return { kind: 'gauges' };
  if (value === WAITING) return { kind: 'waiting' };
  const at = value.indexOf(':');
  const name = value.slice(at + 1);
  const parse = Object.hasOwn(PARSERS, value.slice(0, at)) ? PARSERS[value.slice(0, at)] : undefined;
  return at > 0 && name && parse ? parse(name) : undefined;
}

/** How `bar` is written in the address, which `barOf` reads back. */
export function barValue(bar: Bar): string {
  switch (bar.kind) {
    case 'start':
      return bar.factory === null ? ASKING : `start:${bar.factory}`;
    case 'factory':
      return `factory:${bar.factory}`;
    case 'run':
      return `run:${bar.run}`;
    case 'step':
      return `step:${bar.run}/${bar.step}`;
    case 'spec':
      return `spec:${bar.from}/${bar.workflow}/${bar.step}`;
    case 'state':
      return `state:${bar.machine}/${bar.state}`;
    case 'gauges':
      return GAUGES;
    case 'waiting':
      return WAITING;
  }
}

/** The root route's search: a `bar` that names a bar, and none of the keys a page's own route reads (`factory`, `step`, the filters). */
export const barSearch = (search: Record<string, unknown>): { bar?: string } => (barOf(search.bar) ? { bar: search.bar as string } : {});

/** Whether `one` and `other` show the same thing: the same address, so the same kind for the same factory, run, step or state. */
const sameBar = (one: Bar, other: Bar): boolean => barValue(one) === barValue(other);

/** What the bar shows once `pressed` is pressed while it shows `open`: nothing, for the same thing again, else what was pressed. */
export const nextBar = (open: Bar | undefined, pressed: Bar): Bar | undefined => (open && sameBar(open, pressed) ? undefined : pressed);

/**
 * The page Open visits from the bar: a factory's floor, a run's page, a step's session, a workflow's step's page, or none for what is no
 * page, the start of a run, a state of a machine, the gauges and the runs waiting on you.
 */
export type BarPage =
  | { to: '/factories/$factory'; params: { factory: string } }
  | { to: '/runs/$runId'; params: { runId: string } }
  | { to: '/runs/$runId/steps/$step'; params: { runId: string; step: string } }
  | { to: '/workflows/$from/$workflow/$step'; params: { from: string; workflow: string; step: string }; search: PagePlace };

/**
 * The page of the workflow's step `bar` shows, read in `place`: where the bar's Open and a double click on the step's node both lead, so
 * neither reaches the step of another folder of the same name.
 */
export const stepPage = (bar: Extract<Bar, { kind: 'spec' }>, place: PagePlace = {}): Extract<BarPage, { search: PagePlace }> => ({
  to: '/workflows/$from/$workflow/$step',
  params: { from: bar.from, workflow: bar.workflow, step: bar.step },
  search: place,
});

/**
 * The page the bar's Open visits for `bar`: a factory's floor for a factory, a run's page for a run, the step's session for a step, the
 * step's page for a workflow's step, read in `place`, the place the page under the bar is read in, and none for the start of a run, a
 * state of a machine, the gauges or the runs waiting on you, which have no page of their own: each row of those opens its run's.
 */
export function barOpens(bar: Bar, place: PagePlace = {}): BarPage | null {
  switch (bar.kind) {
    case 'factory':
      return { to: '/factories/$factory', params: { factory: bar.factory } };
    case 'run':
      return { to: '/runs/$runId', params: { runId: bar.run } };
    case 'step':
      return { to: '/runs/$runId/steps/$step', params: { runId: bar.run, step: bar.step } };
    case 'spec':
      return stepPage(bar, place);
    case 'start':
    case 'state':
    case 'gauges':
    case 'waiting':
      return null;
  }
}

/** Whether `open` shows what is the whole machine's, not a page's: its gauges, or the runs waiting on you across every factory. */
export function wholeMachine(open: Bar | undefined): boolean {
  switch (open?.kind) {
    case 'gauges':
    case 'waiting':
      return true;
    case 'factory':
    case 'run':
    case 'step':
    case 'spec':
    case 'start':
    case 'state':
    case undefined:
      return false;
  }
}

/** The step of the workflow `workflow` read from `from` that `open` shows, or null for a bar that shows none of its steps. */
export const specStep = (open: Bar | undefined, from: string, workflow: string): string | null =>
  open?.kind === 'spec' && open.from === from && open.workflow === workflow ? open.step : null;

/** The state of the machine `machine` that `open` shows, or null for a bar that shows none of its states. */
export const machineState = (open: Bar | undefined, machine: string): string | null =>
  open?.kind === 'state' && open.machine === machine ? open.state : null;

/**
 * Whether `open` is something a canvas inspects — everything the bar shows but the start of a run — which a press on the empty canvas
 * closes; never the start of a run, whose half-typed brief a press beside it would lose, and nothing for a bar already closed.
 */
export const inspects = (open: Bar | undefined): boolean => open !== undefined && open.kind !== 'start';

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

/**
 * How many pixels of a frame whose right edge is at `frameRight` the bar covers, its left edge at `barLeft` (null with no bar drawn): none
 * on a `narrow` screen, where the bar is the whole width and a frame narrowed by it would have no room left, and never fewer than none.
 */
export const barOver = (frameRight: number, barLeft: number | null, narrow: boolean): number =>
  barLeft === null || narrow ? 0 : Math.max(0, frameRight - barLeft);

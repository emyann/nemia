/**
 * A dashboard of the throwaway stack, opened in headless Chromium and read as a person would see it: one full-page picture, and the
 * text of every panel — its title, its kind, and what it draws: each bar's name and value, a chart's series, a table's rows, a log's
 * lines, `no data`, or the error its query answered, word for word. A bar drawn with no name is written `(no name)`.
 *
 * `addressOf`, `heightOf` and `written` are pure; `seen` drives the browser. What is read off the page is Grafana's own markup, as
 * measured on the pinned image (Grafana 13.2.2): a panel is `[data-viz-panel-key]`, its kind `data-plugin-id`, a bar's value
 * `data-testid="data-testid Bar gauge value"`, a series its legend entry. Render again after moving the image.
 */
import type { Page } from 'playwright';
import type { Picks } from './seed.ts';

/** A dashboard file, as far as the render reads it. */
export type Dashboard = { uid: string; title: string; panels: DashboardPanel[] };
type DashboardPanel = { type: string; gridPos?: { y: number; h: number }; panels?: DashboardPanel[] };

/** A bar of a bar gauge: the name drawn beside it, empty when none is, and its value as drawn. */
export type Bar = { name: string; value: string };

/** A panel as the page shows it: what each kind of panel draws, and the error its queries answered. */
export type Seen = {
  id: string;
  title: string;
  type: string;
  bars: Bar[];
  series: string[];
  header: string[];
  rows: string[][];
  lines: string[];
  body: string;
  error?: string;
};

/** How wide the window is, and how tall one unit of a dashboard's grid is drawn with its gap, in pixels. */
export const WIDTH = 1600;
const UNIT = 38;

/** How long a dashboard is given to load and to settle, in milliseconds. */
const LOAD_MS = 90_000;

/** `at` as Grafana's time relative to `now`, to the second: `now-90s`, `now+300s`, or `now`. */
const relative = (at: number, now: number): string => {
  const seconds = Math.round((at - now) / 1000);
  return seconds === 0 ? 'now' : `now${seconds > 0 ? '+' : '-'}${Math.abs(seconds)}s`;
};

/**
 * The address `uid` is opened at on the Grafana at `base`: the picks' range, run and session, the times in UTC. Given `now`, the range is
 * written relative to it, the same range while the page is opened: Grafana honours a panel's own range (`timeFrom`, the quota's week)
 * only under a dashboard range that is relative, and drops it under one of two instants. Without it the two instants are written, as a
 * held stack's lines are, which a person may open long after.
 */
export function addressOf(base: string, uid: string, picks: Picks, now?: number): string {
  const query = new URLSearchParams({
    orgId: '1',
    from: now === undefined ? String(picks.from) : relative(picks.from, now),
    to: now === undefined ? String(picks.to) : relative(picks.to, now),
    timezone: 'utc',
    'var-run': picks.run,
    'var-session': picks.session,
  });
  return `${base}/d/${uid}?${query.toString()}`;
}

/** Every panel of `panels` that draws, a row's own among them and no row. */
export const drawing = (panels: readonly DashboardPanel[]): DashboardPanel[] =>
  panels.flatMap((panel) => (panel.type === 'row' ? drawing(panel.panels ?? []) : [panel]));

/**
 * The window's height that holds every panel of `dashboard` at once, in pixels: Grafana loads a panel's data only once the window
 * reaches it, so a window shorter than the page leaves the panels below it empty.
 */
export function heightOf(dashboard: Dashboard): number {
  const bottom = Math.max(0, ...dashboard.panels.map((panel) => (panel.gridPos?.y ?? 0) + (panel.gridPos?.h ?? 0)));
  return Math.max(900, bottom * UNIT + 400);
}

/** What a panel draws, as lines: its bars, its series, its rows, its log lines, or its text; none when it draws nothing. */
function drawn(panel: Seen): string[] {
  if (panel.bars.length) return panel.bars.map((bar) => `bar: ${bar.name || '(no name)'} = ${bar.value}`);
  if (panel.series.length) return panel.series.map((name) => `series: ${name || '(no name)'}`);
  if (panel.header.length) return [`columns: ${panel.header.join(' | ')}`, ...panel.rows.map((row) => `row: ${row.join(' | ')}`)];
  if (panel.lines.length) return panel.lines.map((line) => `line: ${line}`);
  if (panel.type === 'text') return [`text: ${panel.body.slice(0, 120)}`];
  const empty = panel.body === '' || /^No data\b/i.test(panel.body) || (panel.type === 'flamegraph' && /\b0 samples\b/.test(panel.body));
  return empty ? [] : [`shows: ${panel.body.slice(0, 200)}`];
}

/**
 * The text of a dashboard's panels as it is written to a file: each its title and kind, then its error, what it draws, or `no data`,
 * and for a panel `unseeded` names by its title, why no fixture meets it.
 */
export function written(title: string, address: string, panels: readonly Seen[], unseeded: Readonly<Record<string, string>> = {}): string {
  const blocks = panels.map((panel) => {
    const why = unseeded[panel.title];
    const shown = panel.error === undefined ? drawn(panel) : [`error: ${panel.error}`];
    const lines = [...(shown.length ? shown : ['no data']), ...(why === undefined ? [] : [`not seeded: ${why}`])];
    return [`## ${panel.title || '(no title)'} [${panel.type}]`, ...lines.map((line) => `  ${line}`)].join('\n');
  });
  return [`# ${title}`, address, '', ...blocks].join('\n\n').replace(/\n{3,}/g, '\n\n') + '\n';
}

/** The little of a page's element the reader uses, declared here: no browser types are loaded where this file is checked. */
type Element = {
  innerText: string;
  textContent: string | null;
  parentElement: Element | null;
  getAttribute(name: string): string | null;
  matches(selector: string): boolean;
  querySelector(selector: string): Element | null;
  querySelectorAll(selector: string): ArrayLike<Element>;
};

/** The page's document, there only inside the browser, where `readPanels` and the waits of `seen` run. */
declare const document: Element;

/** Read every panel off the page, in the browser: Grafana's markup, nothing of ours. */
function readPanels(): Omit<Seen, 'error'>[] {
  const VALUE = '[data-testid="data-testid Bar gauge value"]';
  const CONTENT = '[data-testid$="panel content"]';
  const all = (root: Element, selector: string): Element[] => Array.from(root.querySelectorAll(selector));
  const said = (element: Element): string => element.innerText.replace(/\s+/g, ' ').trim();
  const barOf = (value: Element): Bar => {
    let box = value;
    while (box.parentElement && box.parentElement.querySelectorAll(VALUE).length === 1 && !box.parentElement.matches(CONTENT))
      box = box.parentElement;
    const whole = said(box);
    return { name: whole.endsWith(said(value)) ? whole.slice(0, whole.length - said(value).length).trim() : whole, value: said(value) };
  };
  return all(document, '[data-viz-panel-key]').map((panel) => {
    const content = panel.querySelector(CONTENT) ?? panel;
    return {
      id: (panel.getAttribute('data-viz-panel-key') ?? '').replace(/^panel-/, ''),
      title: panel.querySelector('h2')?.textContent ?? '',
      type: panel.getAttribute('data-plugin-id') ?? '',
      bars: all(content, VALUE).map(barOf),
      series: all(content, '[data-testid^="data-testid VizLegend series"]').map((entry) =>
        (entry.getAttribute('data-testid') ?? '').replace('data-testid VizLegend series', '').trim(),
      ),
      header: all(content, '[role="columnheader"]').map(said),
      rows: all(content, '[role="row"]')
        .map((row) => all(row, '[role="gridcell"]').map(said))
        .filter((row) => row.length > 0),
      lines: all(content, '[data-log-index]').map(said),
      body: said(content),
    };
  });
}

/** The errors of one answer of Grafana's query API, each query's own, joined. */
function errorsOf(answer: unknown): string | undefined {
  const results = Object.values((answer as { results?: Record<string, { error?: string }> }).results ?? {});
  const errors = results.flatMap((result) => (result.error ? [result.error] : []));
  const whole = (answer as { message?: string }).message;
  return errors.length ? errors.join('; ') : typeof whole === 'string' ? whole : undefined;
}

/**
 * Open `address` in `page`, sized to hold every panel of `dashboard`, wait until its queries are answered and no panel is loading,
 * take the full-page picture into `picture`, and answer its panels as seen, each with the error its queries answered. Refuses, in an
 * error naming the count, a page that does not draw every panel the dashboard's file has.
 */
export async function seen(page: Page, dashboard: Dashboard, address: string, picture: string): Promise<Seen[]> {
  const errors = new Map<string, string>();
  page.on('response', (response) => {
    if (!response.url().includes('/api/ds/query')) return;
    const id = response.request().headers()['x-panel-id'];
    void response
      .json()
      .then((answer) => errorsOf(answer))
      .then((error) => (error === undefined || id === undefined ? undefined : errors.set(id, error)))
      .catch(() => undefined);
  });
  await page.setViewportSize({ width: WIDTH, height: heightOf(dashboard) });
  await page.goto(address, { timeout: LOAD_MS });
  const expected = drawing(dashboard.panels).length;
  await page
    .waitForFunction((count) => document.querySelectorAll('[data-viz-panel-key]').length >= count, expected, { timeout: LOAD_MS })
    .catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: LOAD_MS });
  await page.waitForFunction(() => document.querySelector('[aria-label="Panel loading bar"]') === null, undefined, { timeout: LOAD_MS });
  await page.waitForLoadState('networkidle', { timeout: LOAD_MS });
  const panels = await page.evaluate(readPanels);
  if (panels.length !== expected)
    throw new Error(`${dashboard.title} drew ${panels.length} of its ${expected} panels at ${address}: the page did not load whole`);
  await page.screenshot({ path: picture, fullPage: true });
  return panels.map((panel) => (errors.has(panel.id) ? { ...panel, error: errors.get(panel.id) } : panel));
}

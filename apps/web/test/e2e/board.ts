/** What several pages of the e2e look for or do on the board, beyond checks.ts: the menu, a next visit, a page's files and markdown. */
import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled, WAIT_MS, watch } from './checks.ts';
import { DIAMOND } from './seed.ts';
import { measure } from './contrast.ts';
import { API, measuring, photographing, store } from './world.ts';

/** The sidebar's sections under All factories, in their order: the Inbox first. */
export const SECTIONS = ['Inbox', 'Runs', 'Workflows'] as const;

/** The sidebar's sections with a factory picked: its Floor first, then the others. */
export const PICKED_SECTIONS = ['Floor', ...SECTIONS] as const;

/** The pages whose `?factory=` picks a factory; on any other page only the path of a factory's floor or settings does. */
const LISTINGS = ['/inbox', '/runs', '/workflows'];

/** The factory `url` picks, as the board reads it: the name of a factory's floor or settings, else a listing's `?factory=`, else none. */
export const pickedIn = (url: URL): string | null =>
  /^\/factories\/([^/]+)(?:\/settings)?$/.exec(url.pathname)?.[1] ??
  (LISTINGS.includes(url.pathname) ? url.searchParams.get('factory') || null : null);

/** The rail's places, in its order, one column from the top: Home first, Machines & Capabilities, a place of two tabs, then Settings. */
export const RAIL_PLACES = ['Home', 'Agents', 'Machines & Capabilities', 'Settings'];

/** The rail of places at the frame's left, under the header. */
export const railOf = (page: Page): Locator => page.locator('nav[aria-label="Places"]');

/** The rail's place named `name`, and none whose name only holds it. */
export const railPlace = (page: Page, name: string): Locator => railOf(page).getByRole('link', { name, exact: true });

/** The frame's strip of a place's tabs, under the header and above the page. */
export const frameTabsOf = (page: Page): Locator => page.locator('[data-slot="tabs-list"][role="tablist"]');

/** The sidebar beside the rail. */
export const sidebarOf = (page: Page): Locator => page.locator('[data-sidebar="sidebar"]');

/** The sidebar's factory picker. */
export const pickerOf = (page: Page): Locator => sidebarOf(page).locator('[data-factory-picker]');

/** The sidebar's sections, each a link. */
export const sectionsOf = (page: Page): Locator => sidebarOf(page).locator('ul[aria-label="Sections"] a[data-sidebar="menu-button"]');

/** The sidebar's Start a run, which opens the floating bar on the start of a run. */
export const startOf = (page: Page): Locator => sidebarOf(page).getByRole('button', { name: 'Start a run' });

/** Picks `choice` in the sidebar's factory picker, a factory's name or All factories. */
export async function pick(page: Page, choice: string): Promise<void> {
  await pickerOf(page).locator('button').first().click();
  await page
    .getByRole('option')
    .filter({
      has: choice === 'All factories' ? page.getByText('All factories', { exact: true }) : page.locator(`[data-factory="${choice}"]`),
    })
    .click();
}

/** Opens the Select pressed at `trigger` and picks the level said `word` among its options. */
export async function pickLevel(page: Page, trigger: Locator, word: 'Manual' | 'Semi-auto' | 'Auto'): Promise<void> {
  await trigger.click();
  await page.getByRole('option', { name: word, exact: true }).click();
}

/**
 * On every page: the header with the logo and the bell, the rail with its places in their order, and the sidebar with its factory picker,
 * reading the factory the address picks or All factories, and its sections in their order, the Floor only with a factory picked.
 */
export async function sidebar(page: Page): Promise<void> {
  const header = page.locator('header[data-frame-header]');
  await expectVisible(header.getByRole('link', { name: 'Nemia' }), 'the header has the logo, a link to Home');
  await expectVisible(header.locator('button[data-bell]'), 'the header has the bell');
  const rail = railOf(page);
  for (const place of RAIL_PLACES) await expectVisible(railPlace(page, place), `the rail has ${place}`);
  const named = await rail.getByRole('link').evaluateAll((links) => links.map((link) => link.getAttribute('aria-label')));
  if (named.join() !== RAIL_PLACES.join())
    throw new Refused(`the rail lists its places in order, ${RAIL_PLACES.join(', ')} — it lists ${named.join(', ')}`);
  const picked = pickedIn(new URL(page.url()));
  await expectTexts(
    pickerOf(page).locator('button').first(),
    [picked ?? 'All factories'],
    'the picker reads the factory the address picks',
  );
  const sections = picked === null ? SECTIONS : PICKED_SECTIONS;
  await expectTexts(sectionsOf(page), [...sections], `the sidebar lists its sections in order, ${sections.join(', ')}`);
}

/**
 * Another visit to `page`'s address in the same browser, so what this browser kept, checked by `check` and
 * watched as the page itself is. A page of its own rather than a reload: a reload cuts off an in-flight
 * refetch, which the watch would rightly count as a failed request.
 */
export async function nextVisit(page: Page, check: (again: Page) => Promise<void>): Promise<void> {
  const again = await page.context().newPage();
  try {
    const { problems } = watch(again);
    await again.goto(page.url(), { waitUntil: 'load' });
    await idle(again);
    await check(again);
    await idle(again);
    const seen = problems();
    if (seen.length)
      throw new Refused(`no console error and no failed request on the next visit — ${seen.length} seen:\n    ${seen.join('\n    ')}`);
  } finally {
    await again.close();
  }
}

/**
 * One line appended to the workflow feed, `$store/feed.jsonl`, in the shape the package's tick writes it (`FeedLine`:
 * `{ at, run, step?, word }`): for a page that edits the store by hand, where no tick runs to say so, and a board that reads the feed must
 * see the edit. `word` is what `wf ls` says of the step after the edit — or of the run, given no step. A report and never an input, as the
 * package's own lines are: the api reads the feed only to stream it, so a line left behind changes no page after this one.
 */
export function fed(run: string, word: string): void;
export function fed(run: string, step: string, word: string): void;
export function fed(run: string, ...said: [string] | [string, string]): void {
  const [step, word] = said.length === 2 ? said : [undefined, said[0]];
  const line = { at: new Date().toISOString(), run, ...(step !== undefined ? { step } : {}), word };
  fs.appendFileSync(path.join(store!, 'feed.jsonl'), `${JSON.stringify(line)}\n`);
}

/** When the run DIAMOND calls off was cancelled, as `wf cancel` wrote it beside its record. */
export const cancelledAt = (): string => fs.readFileSync(path.join(store!, 'runs', `${DIAMOND.cancelled.id}.cancelled`), 'utf8').trim();

/** The frame's floating bar while it shows the step `step` of the run `run`, found by the address it carries (`data-bar`). */
export const stepBar = (page: Page, run: string, step: string): Locator => page.locator(`aside[data-bar="step:${run}/${step}"]`);

/** The theme a page is in, as its browser prefers it: what names a photograph taken beside the visit's own. */
export const themeOf = (page: Page): Promise<string> =>
  page.evaluate(() => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

/**
 * Takes a picture of a page or of what a locator finds into `file`, with every CSS animation stilled for the shot and played again after
 * it: an agent's face, which moves at all times, is drawn at rest with its eyes open, the same in every run. `fullPage` as Playwright's,
 * but a page taller than its window is taken in a window as tall as the page (`grownToPage`), so its sticky header and footer and its fixed
 * sidebar are drawn once, where a person sees them, never where the window was; the window and the scroll are put back after the shot,
 * whether it was taken or refused. A page that fits its window, and a locator, are taken as Playwright takes them.
 * Takes none, and writes nothing, unless the page being visited is pictured (`photographing`) or the picture is taken `always`: a
 * failure's. While the run measures (`measuring`), writes the text pairs of what it pictured beside the picture, as
 * `<file>.contrast.json`; never for a failure's.
 */
export async function photograph(
  target: Page | Locator,
  file: string,
  { always = false, ...options }: { fullPage?: boolean; always?: boolean } = {},
): Promise<void> {
  if (!photographing && !always) return;
  const putBack = options.fullPage && 'viewportSize' in target ? await grownToPage(target, file) : undefined;
  try {
    await target.screenshot({ ...options, path: file, animations: 'disabled' });
    if (measuring && !always) fs.writeFileSync(`${file}.contrast.json`, `${JSON.stringify(await measure(target))}\n`);
  } finally {
    await putBack?.();
  }
}

/** The tallest window a picture is taken in: Chromium draws no texture taller, and a page past it is taken as Playwright takes it. */
export const TALLEST_WINDOW = 16_384;

/** How tall `page`'s document is, measured as Playwright measures a full-page picture. */
const pageHeight = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const { body, documentElement: root } = document;
    return Math.max(body.scrollHeight, root.scrollHeight, body.offsetHeight, root.offsetHeight, body.clientHeight, root.clientHeight);
  });

/** Resolves once `page` has drawn two more frames: what a resize or a scroll changes is laid out and painted. */
const twoFrames = (page: Page): Promise<void> =>
  page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));

/**
 * Grows `page`'s window to the height of its document, measured again after each growth until it holds still (three tries at most: a
 * part as tall as the window grows with it), and waits for the floor to settle. Resolves with what puts the window's size and the scroll
 * back, or with nothing, having changed nothing, when the page fits its window, has none, or is taller than `TALLEST_WINDOW`: that last
 * is said on the log with `file`'s name, since its picture shows the frame where the window was.
 */
async function grownToPage(page: Page, file: string): Promise<(() => Promise<void>) | undefined> {
  const size = page.viewportSize();
  let height = await pageHeight(page);
  if (!size || height <= size.height) return undefined;
  if (height > TALLEST_WINDOW) {
    console.log(
      `e2e: ${path.basename(file)} is taken in its own window: its page is ${height} px tall, over the ${TALLEST_WINDOW} px a window can be`,
    );
    return undefined;
  }
  const scrolled = await page.evaluate(() => window.scrollY);
  const putBack = async () => {
    await page.setViewportSize(size);
    await page.evaluate((y) => scrollTo(0, y), scrolled);
    await twoFrames(page);
  };
  try {
    for (let tries = 0; tries < 3 && height !== page.viewportSize()?.height; tries++) {
      await page.setViewportSize({ width: size.width, height: Math.min(height, TALLEST_WINDOW) });
      await twoFrames(page);
      height = await pageHeight(page);
    }
    await settled(page);
  } catch (err) {
    await putBack();
    throw err;
  }
  return putBack;
}

/** A face's idle loops, as Blobatar's stylesheet names them: it breathes, bobs, blinks and glances. */
const IDLE_LOOPS = ['mo-breathe', 'mo-bob', 'mo-blink', 'mo-saccade'];

/** What the face `face` (a selector for its drawing) shows of its life: its root's classes, its `--mo-amp`, and its idle loops running. */
const lifeOf = (page: Page, face: string) =>
  page.evaluate(
    ({ face, loops }) => {
      const svg = document.querySelector(face);
      const root = svg?.querySelector('.mo-root');
      if (!svg || !root) return null;
      const running = svg
        .getAnimations({ subtree: true })
        .filter((a): a is CSSAnimation => a instanceof CSSAnimation && a.playState === 'running')
        .map((a) => a.animationName)
        .filter((name) => loops.includes(name));
      return {
        classes: root.getAttribute('class') ?? '',
        amp: getComputedStyle(root).getPropertyValue('--mo-amp').trim(),
        running: [...new Set(running)],
      };
    },
    { face, loops: IDLE_LOOPS },
  );

/** Waits until `ok` holds of the face's life, as `lifeOf` reads it; refuses with the last reading after `WAIT_MS`. */
async function waitForLife(page: Page, face: string, ok: 'alive' | 'still', assertion: string) {
  try {
    await page.waitForFunction(
      ({ face, ok, loops }) => {
        const svg = document.querySelector(face);
        const root = svg?.querySelector('.mo-root');
        if (!svg || !root) return false;
        const running = new Set(
          svg
            .getAnimations({ subtree: true })
            .filter((a) => a instanceof CSSAnimation && a.playState === 'running')
            .map((a) => (a as CSSAnimation).animationName),
        );
        if (ok === 'still') return loops.every((name) => !running.has(name));
        return (
          root.classList.contains('mo-always') &&
          getComputedStyle(root).getPropertyValue('--mo-amp').trim() === '1' &&
          running.has('mo-breathe') &&
          running.has('mo-blink')
        );
      },
      { face, ok, loops: IDLE_LOOPS },
      { timeout: WAIT_MS },
    );
  } catch {
    throw new Refused(`${assertion} — it shows ${JSON.stringify(await lifeOf(page, face))}`);
  }
}

/**
 * The face `face` (a selector for its drawing) is alive with nothing hovering it: Blobatar's `mo-always` on its root, awake (`--mo-amp` 1),
 * breathing and blinking with the pointer away from it. With reduced motion asked for, none of its idle loops runs; no longer asked, they
 * run again, without a reload. Leaves the pointer in the page's top-right corner and reduced motion not asked for.
 */
export async function expectAlive(page: Page, face: string, who: string): Promise<void> {
  await page.locator(face).scrollIntoViewIfNeeded();
  await page.mouse.move((page.viewportSize()?.width ?? 1280) - 5, 5, { steps: 4 });
  await waitForLife(page, face, 'alive', `${who}'s face moves with nothing hovering it`);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await waitForLife(page, face, 'still', `with reduced motion asked for, ${who}'s face is still`);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await waitForLife(page, face, 'alive', `once the person no longer asks, ${who}'s face moves again, without a reload`);
}

/** The places of the queued cards, as the board says them. */
export const PLACES_SAID = ['1st', '2nd', '3rd', '4th'] as const;

/** A folder's files, each name with its text: what a page that writes nothing leaves as it found. */
export const filesIn = (dir: string): Array<[string, string]> =>
  fs
    .readdirSync(dir)
    .sort()
    .map((name) => [name, fs.statSync(path.join(dir, name)).isFile() ? fs.readFileSync(path.join(dir, name), 'utf8') : '(a folder)']);

/** A text's markdown, rendered: its `##` a heading two levels down, an h4 — the page's own are h1 and h2 — and its list, a list. */
export async function expectRendered(
  body: Locator,
  text: { heading: string; items: readonly string[]; cells?: readonly string[]; code?: string },
): Promise<void> {
  await expectVisible(body.getByRole('heading', { level: 4, name: text.heading }), `its ## is a heading, an h4 (${text.heading})`);
  await expectTexts(body.locator('ul > li'), text.items, `its list is a list (${text.items.join(' · ')})`);
  for (const cell of text.cells ?? [])
    await expectVisible(body.getByRole('cell', { name: cell, exact: true }), `its table is a table, with a cell ${cell}`);
  if (text.code)
    await expectVisible(
      body.locator('[data-language="bash"]', { hasText: text.code }),
      `its fenced block is the board's code block, in bash (${text.code})`,
    );
}

/**
 * A page's key table: a row per key the api answers, in its order, each with its value — or `not set` — and what it means, as the api says
 * it. `set` is what the file sets, by key, as the seed wrote it: every other key reads `not set`.
 */
export async function expectKeys(page: Page, file: Locator, api: string, set: Readonly<Record<string, string>>): Promise<void> {
  const answered = await page.request.get(new URL(api, page.url()).href);
  if (!answered.ok()) throw new Refused(`GET ${api} answers the page's keys — it answered ${answered.status()}`);
  const { keys } = (await answered.json()) as { keys: Array<{ key: string; value: string | null; meaning: string }> };
  const rows = file.locator('section[aria-label="Keys"] tr[data-key]');
  await expectCount(rows, keys.length, `a row per key (${keys.map((k) => k.key).join(', ')})`);
  const order = await rows.evaluateAll((trs) => trs.map((tr) => tr.getAttribute('data-key')));
  if (JSON.stringify(order) !== JSON.stringify(keys.map((k) => k.key)))
    throw new Refused(`the rows are in the package's order — ${order.join(', ')}`);
  for (const { key, value, meaning } of keys) {
    if (value !== (set[key] ?? null))
      throw new Refused(`GET ${api} reads ${key} as the file sets it (${set[key] ?? 'not set'}) — it answered ${JSON.stringify(value)}`);
    const row = rows.filter({ has: page.locator(`th[scope="row"]`, { hasText: new RegExp(`^${key}$`) }) });
    await expectTexts(row.locator('[data-value]'), [value ?? 'not set'], `${key}'s value reads ${value ?? 'not set'}`);
    await expectTexts(
      row.locator('[data-meaning]'),
      [meaning.replaceAll('`', '')],
      `${key}'s row says what it means, as the package does, its markdown code spans drawn as code`,
    );
  }
}

/** Source: the file as written, frontmatter included, in place of what the page renders of it — and back. */
export async function expectSource(file: Locator, body: Locator, onDisk: string): Promise<void> {
  const toggle = file.getByRole('button', { name: 'Source' });
  await toggle.click();
  const source = file.locator('pre[data-source]');
  await expectVisible(source, 'Source shows the file as written');
  const shown = await source.textContent();
  const written = fs.readFileSync(onDisk, 'utf8');
  if (shown !== written)
    throw new Refused(
      `Source is the file byte for byte, frontmatter included — it shows ${JSON.stringify(shown)}, and ${onDisk} holds ${JSON.stringify(written)}`,
    );
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') throw new Refused('Source says it is pressed while the file is shown');
  await expectCount(file.locator('section[aria-label="Keys"]'), 0, 'in place of the rendered body and the keys');
  await toggle.click();
  await expectCount(source, 0, 'pressed again, Source gives the rendered page back');
  await expectVisible(body, 'the body rendered again');
}

/**
 * Claude Code 2.1.278's recorded answers to get_usage (the api's `test/fixtures`), with `@ID@` for the request's id: what the quota pages
 * write.
 */
export function recordedUsage(name: 'no-plan' | 'unsupported' | 'unanswered'): string {
  const file = path.join(API, 'test', 'fixtures', `get-usage-${name}-2.1.278.json`);
  return fs.readFileSync(file, 'utf8').replace('"request_id":"usage-1"', '"request_id":"@ID@"');
}

/**
 * How long the e2e's api lets a read of the quota wait for its ask (`HKB_QUOTA_WAIT_MS`), so that at its keep of 0 a slow ask answers the
 * read rather than leave it `asking`: the ask in flight before it and the one the api queues behind it, each given up by the runtime's
 * claude harness after 15 s (`QUOTA_TIMEOUT_MS`).
 */
export const QUOTA_ASKS_MS = 2 * 15_000;

/**
 * The longest a reload waits for the quota a change makes, as a bound on a hang and never as when it comes: the api's wait for the asks
 * (`QUOTA_ASKS_MS`), and the board's next read, 2 s after a read told `asking`.
 */
export const QUOTA_ANSWER_MS = QUOTA_ASKS_MS + 2_000;

/**
 * Reloads `page` and waits for the board's `GET /api/quota` answered in `state`, the state the page's change makes, then for the page to
 * idle. It waits on the state, never on a time compared between the e2e's clock and the api's, which steps: at its keep of 0 the api
 * answers a read only from an ask begun after the read came, and each change a quota page makes gives a state other than the one before
 * it. A page that wrote the same state twice in a row would pass on an answer from before its change. Refuses, naming the state it waited
 * for and the state and `askedAt` of each answer it saw, when none came in `state` within `QUOTA_ANSWER_MS`.
 */
export async function reloadForQuota(page: Page, state: string): Promise<void> {
  const seen: string[] = [];
  const answered = page.waitForResponse(
    async (r) => {
      if (r.request().method() !== 'GET' || new URL(r.url()).pathname !== '/api/quota' || !r.ok()) return false;
      const quota = (await r.json()) as { state?: unknown; askedAt?: unknown };
      seen.push(`${String(quota.state)} asked at ${String(quota.askedAt)}`);
      return quota.state === state;
    },
    { timeout: QUOTA_ANSWER_MS },
  );
  await page.reload({ waitUntil: 'load' });
  try {
    await answered;
  } catch {
    throw new Refused(
      `the board reads the quota ${state} after the change — GET /api/quota answered ${seen.length ? seen.join('; ') : 'nothing'} in ${QUOTA_ANSWER_MS} ms`,
    );
  }
  await idle(page);
}

/** A step's Debug panel on `page`, opened: its trigger pressed and the path of `taskId` drawn, with the lifecycle it is drawn on. */
export async function openDebug(page: Page, taskId: string): Promise<{ panel: Locator; lifecycle: Locator }> {
  const panel = page.getByRole('region', { name: 'Debug' });
  await panel.getByRole('button', { name: /Debug$/ }).click();
  await expectVisible(panel.locator(`[data-path="${taskId}"]`), `opened, the Debug panel draws the path of ${taskId}`);
  return { panel, lifecycle: panel.locator('[data-machine="lifecycle"]') };
}

/** What the api answers at `pathname`, read apart from the page: the page's own requests do not count it. */
export async function answered<T>(page: Page, pathname: string): Promise<T> {
  return (await (await page.request.get(new URL(pathname, page.url()).href)).json()) as T;
}

/**
 * Photographs the whole page as `<name>-<what>-<theme>.png` in the window it is in, then 390 wide as `<name>-<what>-phone-<theme>.png`,
 * and puts the window back. Takes none unless the page is pictured (`photograph`); the window is narrowed and put back all the same.
 */
export async function photographBothWidths(page: Page, out: string, name: string, what: string): Promise<void> {
  const size = page.viewportSize() ?? { width: 1280, height: 800 };
  const theme = await themeOf(page);
  await photograph(page, path.join(out, `${name}-${what}-${theme}.png`), { fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await photograph(page, path.join(out, `${name}-${what}-phone-${theme}.png`), { fullPage: true });
  await page.setViewportSize(size);
}

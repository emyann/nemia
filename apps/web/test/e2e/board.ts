/** What several pages of the e2e look for or do on the board, beyond checks.ts: the menu, a next visit, a page's files and markdown. */
import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled, WAIT_MS, watch } from './checks.ts';
import { instantWhole, instantWords } from '../../src/lib/instant.ts';
import { DIAMOND, REGISTRY } from './seed.ts';
import { measure } from './contrast.ts';
import { API, measuring, photographing, store } from './world.ts';

/** The rail's lists, whose destinations carry the `?factory=` the address picks: the Inbox, Runs and Workflows. */
export const SECTIONS = ['Inbox', 'Runs', 'Workflows'] as const;

/** The pages whose `?factory=` picks a factory; on any other page only the path of a factory's floor or settings does. */
const LISTINGS = ['/inbox', '/runs', '/workflows'];

/** The factory `url` picks, as the board reads it: the name of a factory's floor or settings, else a listing's `?factory=`, else none. */
export const pickedIn = (url: URL): string | null =>
  /^\/factories\/([^/]+)(?:\/settings)?$/.exec(url.pathname)?.[1] ??
  (LISTINGS.includes(url.pathname) ? url.searchParams.get('factory') || null : null);

/** The rail's destinations, in its order, one column from the top. */
export const RAIL_PLACES = ['Overview', 'Runs', 'Inbox', 'Factories', 'Agents', 'Workflows', 'Stats', 'Settings'];

/** The frame's rail at the left of a wide window: the menu button and the FAB above the kit's navigation rail. */
export const railColumnOf = (page: Page): Locator => page.locator('[data-frame-rail]');

/** The destinations of the frame, the rail's on a wide window and the drawer's on a narrow one. */
export const railOf = (page: Page): Locator => page.locator('nav[aria-label="Places"]');

/** The rail's destination named `name`, by its label, whatever its badge adds to its name. */
export const railPlace = (page: Page, name: string): Locator =>
  railOf(page)
    .getByRole('link')
    .filter({ has: page.getByText(name, { exact: true }) });

/** The destinations the rail lights: the page's own, one on every page of the board. */
export const litOf = (page: Page): Locator => railOf(page).locator('a[aria-current="page"]');

/** The frame's strip of Settings' tabs, under the top bar and above the page. */
export const frameTabsOf = (page: Page): Locator => page.locator('[data-slot="tabs-list"][role="tablist"]');

/** The frame's top bar. */
export const topBarOf = (page: Page): Locator => page.locator('header[data-frame-header]');

/** The top bar's factory switcher. */
export const pickerOf = (page: Page): Locator => page.locator('[data-factory-picker]');

/** The rail's lists that carry the factory picked, each a link. */
export const sectionsOf = (page: Page): Locator =>
  railOf(page)
    .getByRole('link')
    .filter({ hasText: /^(Inbox|Runs|Workflows)/ });

/** The rail's FAB, Start a run, which opens the floating bar on the start of a run. */
export const startOf = (page: Page): Locator => railColumnOf(page).getByRole('button', { name: 'Start a run' });

/** The top bar's gauges button, which opens the machine's gauges in the floating bar. */
export const gaugesButtonOf = (page: Page): Locator => topBarOf(page).locator('[data-gauges-button] button');

/** Opens the machine's gauges in the floating bar, unless they are open, and returns the bar. */
export async function gaugesOf(page: Page): Promise<Locator> {
  const bar = page.locator('aside[data-bar="gauges"]');
  if (!(await bar.isVisible())) await gaugesButtonOf(page).click();
  await expectVisible(bar, 'the gauges button opens the gauges in the floating bar');
  return bar;
}

/** Picks `choice` in the top bar's factory switcher, a factory's name or All factories. */
export async function pick(page: Page, choice: string): Promise<void> {
  await pickerOf(page).locator('button').first().click();
  await page
    .getByRole('option')
    .filter({ has: page.getByText(choice, { exact: true }) })
    .click();
}

/** Opens the Select pressed at `trigger` and picks the level said `word` among its options. */
export async function pickLevel(page: Page, trigger: Locator, word: 'Manual' | 'Semi-auto' | 'Auto'): Promise<void> {
  await trigger.click();
  await page.getByRole('option', { name: word, exact: true }).click();
}

/**
 * On every page of a wide window: the top bar with the factory switcher, reading the factory the address picks or All factories, the
 * pause and the gauges button, and the rail with its destinations in their order, one lit or none on an address no route has.
 */
export async function sidebar(page: Page): Promise<void> {
  const header = topBarOf(page);
  await expectVisible(header.locator('[data-gauges-button]'), 'the top bar has the gauges button');
  for (const place of RAIL_PLACES) await expectVisible(railPlace(page, place), `the rail has ${place}`);
  await expectCount(railOf(page).getByRole('link'), RAIL_PLACES.length, `the rail holds its ${RAIL_PLACES.length} destinations alone`);
  const order = await Promise.all(RAIL_PLACES.map(async (place) => (await railPlace(page, place).boundingBox())?.y ?? -1));
  if (order.some((y, at) => at > 0 && y <= order[at - 1]))
    throw new Refused(`the rail lists its places in order, ${RAIL_PLACES.join(', ')}`);
  if ((await litOf(page).count()) > 1) throw new Refused('the rail lights one destination at most');
  await expectPicked(page, pickedIn(new URL(page.url())) ?? 'All factories');
}

/** That the top bar's switcher reads `name`, the factory picked or All factories, over its runs in flight. */
export async function expectPicked(page: Page, name: string): Promise<void> {
  await expectVisible(
    pickerOf(page).locator('[data-slot="select-value"]').getByText(name, { exact: true }),
    `the switcher reads ${name}, the factory the address picks`,
  );
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
 * whether it was taken or refused. A page that fits its window, and a locator, are taken as Playwright takes them; `clip` takes that
 * part of a page's window alone.
 * Takes none, and writes nothing, unless the page being visited is pictured (`photographing`) or the picture is taken `always`: a
 * failure's. While the run measures (`measuring`), writes the text pairs of what it pictured beside the picture, as
 * `<file>.contrast.json`; never for a failure's.
 */
export async function photograph(
  target: Page | Locator,
  file: string,
  {
    always = false,
    ...options
  }: { fullPage?: boolean; always?: boolean; clip?: { x: number; y: number; width: number; height: number } } = {},
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

/**
 * Refuses a `<time>` that does not say its instant as the board writes one where the browser is: `words` of its `datetime` as its
 * text (`instantWords` by default, against now), and on hover `about`, a colon, then the instant whole (`instantWhole`). `what` names
 * the time in the refusal.
 */
export async function expectInstant(
  time: Locator,
  about: string,
  what: string,
  words: (at: Date, timeZone: string) => string = (at, timeZone) => instantWords(at, new Date(), timeZone),
): Promise<void> {
  const timeZone = await time.page().evaluate(() => new Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [at, text, title] = [await time.getAttribute('datetime'), await time.textContent(), await time.getAttribute('title')];
  if (!at) throw new Refused(`${what} is a time with its instant — it has no datetime`);
  const [said, whole] = [words(new Date(at), timeZone), `${about}${instantWhole(new Date(at), timeZone)}`];
  if (text !== said) throw new Refused(`${what} reads as the board writes it, ${said} — it reads ${JSON.stringify(text)}`);
  if (title !== whole) throw new Refused(`${what} says the whole instant on hover, ${whole} — its title is ${JSON.stringify(title)}`);
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

/** Where Nemia's chat is served from: the folder of her own in the store, and the task her level file names. */
const NEMIA_TASK = 'nemia-e2e-chat';

/** Her session's id, and the folder its transcript is kept under, which Claude Code names after the session's `cwd`. */
const NEMIA_SESSION = '7b1d0c3e-e2e0-4a1b-9c21-0d5f6a7b8c90';
const NEMIA_CWD = '/code/nemia';
const NEMIA_PROJECT = NEMIA_CWD.replaceAll('/', '-');

/** One line of her session's transcript: her words, or one tool call, or its result. */
export type HerLine = { text: string } | { tool: string; says: string; result?: string };

/** What a page plants of her: her level, where her session is, her transcript, the read mark, and the person's outbox. */
export type HerChat = {
  level?: 'manual' | 'semi-auto' | 'auto';
  /** Her session as `claude agents` lists it: answering a turn, up and waiting for words, or none filed at all. */
  session?: 'answering' | 'up' | 'none';
  /** Her transcript, oldest first: her words are `m:1:e<i>` in the chat, a tool call `t:1:e<i>`, by its line's place here. */
  said?: readonly HerLine[];
  /** The id the read mark names, which the chat gives each line of `said`. */
  read?: string;
  /** What the person wrote that the api took, each entry drawn as their own bubble. */
  outbox?: readonly { id: string; at: string; text: string }[];
  /**
   * What the keeper said to her session, journalled as the runtime journals a said: a quiet marker in the chat, unless `delivers` names
   * an outbox entry it carried, which draws that entry as the person's own bubble.
   */
  told?: readonly { text: string; delivers?: string }[];
};

/**
 * The id her chat gives the line at `i` of `said`: `m:1:e<i>:0` for her words, the `0` their place in the message's content, and
 * `t:1:e<i>` for a tool call.
 */
export const herEvent = (said: readonly HerLine[], i: number): string => ('text' in said[i] ? `m:1:e${i}:0` : `t:1:e${i}`);

/** One line of her transcript as Claude Code writes it, `seconds` before now. */
const herTranscriptLine = (line: HerLine, i: number, at: (seconds: number) => string): object[] => {
  const head = {
    sessionId: NEMIA_SESSION,
    isSidechain: false,
    userType: 'external',
    cwd: NEMIA_CWD,
    version: '2.1.270',
    uuid: `e${i}`,
    timestamp: at(i * 4),
  };
  if ('text' in line) return [{ ...head, type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: line.text }] } }];
  const call = {
    ...head,
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'tool_use', id: `e${i}`, name: line.tool, input: { description: line.says } }] },
  };
  if (line.result === undefined) return [call];
  const result = {
    ...head,
    uuid: `r${i}`,
    timestamp: at(i * 4 + 2),
    type: 'user',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `e${i}`, content: line.result }] },
  };
  return [call, result];
};

/**
 * Plants Nemia's chat in the store the worker serves: her level file naming her task, her task journalled filed and spawned, her
 * session's row for the fake `claude agents` (`REGISTRY`), her session's transcript, the person's outbox and their read mark. Each file
 * is written as the keeper, the api and the runtime write theirs — a key they leave out absent, never null.
 *
 * Answers what takes it back: every file it made removed, and the registry put back as the seed left it. A page calls it in a `try` and
 * the take-back in its `finally`, so no page after it reads her.
 */
export function herChat(what: HerChat): () => void {
  const root = store!;
  const now = Date.now();
  const at = (seconds: number) => new Date(now - 600_000 + seconds * 1000).toISOString();
  const level = what.level ?? 'semi-auto';
  const nemiaDir = path.join(root, 'nemia');
  const journal = path.join(root, 'engine', 'tasks', `${NEMIA_TASK}.jsonl`);
  const registry = path.join(root, REGISTRY);
  const transcript = path.join(root, 'claude', 'projects', NEMIA_PROJECT, `${NEMIA_SESSION}.jsonl`);
  const rows = JSON.parse(fs.readFileSync(registry, 'utf8')) as object[];
  const lines = (entries: readonly object[]) => entries.map((entry) => `${JSON.stringify(entry)}\n`).join('');

  fs.mkdirSync(nemiaDir, { recursive: true });
  fs.writeFileSync(path.join(nemiaDir, 'level.json'), `${JSON.stringify({ level, since: at(0), task: NEMIA_TASK })}\n`);
  fs.mkdirSync(path.dirname(journal), { recursive: true });
  fs.writeFileSync(
    journal,
    lines([
      {
        kind: 'filed',
        at: at(0),
        brief: 'Keep the factories running.',
        cwd: NEMIA_CWD,
        maxAttempts: 1,
        harness: 'claude',
        /** Her session is long-lived, as the keeper files it: a session between turns reads idle only under this policy (`idleOf`). */
        restartPolicy: 'Always',
      },
      { kind: 'starting', at: at(1), attempt: 1 },
      { kind: 'spawned', at: at(1), attempt: 1 },
      ...(what.told ?? []).map((told, i) => ({ kind: 'said', at: at(2 + i), attempt: 1, text: told.text })),
    ]),
  );
  const session = what.session ?? 'answering';
  if (session !== 'none') {
    const row =
      session === 'answering'
        ? /** A session in a turn: the engine reads it running, and her phase answering. */
          { state: 'working', status: 'busy', pid: 424242 }
        : /** A session Claude Code holds, its turn over: the engine reads it `input-required` with nothing waited for, so her phase is idle. */
          { state: 'done', status: 'idle', pid: 424242 };
    fs.writeFileSync(
      registry,
      JSON.stringify([
        ...rows,
        { name: `ae/${NEMIA_TASK}/1`, sessionId: NEMIA_SESSION, kind: 'background', ...row, startedAt: now - 600_000 },
      ]),
    );
  }
  const said = what.said ?? [];
  fs.mkdirSync(path.dirname(transcript), { recursive: true });
  fs.writeFileSync(transcript, lines(said.flatMap((line, i) => herTranscriptLine(line, i, at))));
  if (what.outbox?.length) {
    fs.mkdirSync(path.join(nemiaDir, 'chat'), { recursive: true });
    fs.writeFileSync(path.join(nemiaDir, 'chat', 'outbox.jsonl'), lines(what.outbox));
  }
  const delivered = (what.told ?? []).flatMap((told, i) =>
    told.delivers === undefined ? [] : [{ id: told.delivers, said: at(2 + i), attempt: 1 }],
  );
  if (delivered.length > 0) {
    fs.mkdirSync(path.join(nemiaDir, 'chat'), { recursive: true });
    fs.writeFileSync(path.join(nemiaDir, 'chat', 'delivered.jsonl'), lines(delivered));
  }
  if (what.read !== undefined) {
    fs.mkdirSync(path.join(nemiaDir, 'chat'), { recursive: true });
    fs.writeFileSync(path.join(nemiaDir, 'chat', 'read.json'), `${JSON.stringify({ through: what.read, at: at(600) })}\n`);
  }
  return () => {
    fs.rmSync(nemiaDir, { recursive: true, force: true });
    fs.rmSync(journal, { force: true });
    fs.rmSync(path.join(root, 'claude', 'projects', NEMIA_PROJECT), { recursive: true, force: true });
    fs.writeFileSync(registry, JSON.stringify(rows));
  };
}

/** Her docked face, the cue beside it, and the panel it opens. */
export const dockOf = (page: Page): Locator => page.locator('[data-nemia-dock]');
export const dockFaceOf = (page: Page): Locator => page.locator('[data-nemia-dock-face]');
export const chatPanelOf = (page: Page): Locator => page.locator('[data-chat-panel]');

/** Opens the panel from her docked face, and waits for it. */
export async function openChat(page: Page): Promise<Locator> {
  await dockFaceOf(page).click();
  const panel = chatPanelOf(page);
  await expectVisible(panel, "her docked face opens Nemia's chat");
  return panel;
}

/** The composer's field in her chat. */
export const chatFieldOf = (page: Page): Locator => page.locator('[data-chat-composer] textarea');

/** What several pages of the e2e look for or do on the board, beyond checks.ts: the menu, a next visit, a page's files and markdown. */
import fs from 'node:fs';
import path from 'node:path';
import type { BrowserContext, Locator, Page } from 'playwright';
import { expectCount, expectNone, expectTexts, expectUncut, expectVisible, idle, Refused, settled, WAIT_MS, watch } from './checks.ts';
import { type Card, CARD_KEY_MEANINGS, CARD_KEYS, type FactoryCommands, type FactoryList, LIST_PAGE, type RunList } from 'objects';
import { FINISHED_SELECTOR, FINISHED_SIZE, finishedOf, OPEN_SELECTOR, openOf, rowsOf } from '../../src/lib/api/runs.ts';
import { judged } from '../../src/lib/api/judged.ts';
import { factoryViewOf } from '../../src/lib/api/factories.ts';
import { instantWhole, instantWords } from '../../src/lib/instant.ts';
import { attachedFiles, attachedRun, DIAMOND } from './seed.ts';
import { measure } from './contrast.ts';
import { API, measuring, photographing, store, storedMarker } from './world.ts';

/** The factory a page sits in, read from its path as the board reads it (`seatOf`, src/components/nav/nav.ts): none for the store's. */
export const pickedIn = (url: URL) => {
  const name = /^\/factories\/([^/]+)/.exec(url.pathname)?.[1];
  return (name === undefined ? null : decodeURIComponent(name)) satisfies string | null;
};

/** The store rail's groups, in their order, each with its destinations in theirs. */
const RAIL_GROUPS = [
  ['Across factories', ['Factories', 'Waiting']],
  ['Yours', ['Agents', 'Skills', 'Library']],
  ['You', ['Stats', 'Settings']],
] as const;

/** The rail's destinations, in its order, one column from the top. */
export const RAIL_PLACES: readonly string[] = RAIL_GROUPS.flatMap(([, places]) => places);

/** The factory pane's places, in their order. */
export const PANE_PLACES = ['Floor', 'Runs', 'Inbox', 'Workflows', 'Agents', 'Skills', 'Proposals', 'Settings'] as const;

/** The store's rail at the left of a window not narrow: her face, the menu button on a factory's page, and the groups. */
export const railColumnOf = (page: Page) => page.locator('[data-frame-rail]') satisfies Locator;

/** The destinations of the frame, the rail's on a wide window and the drawer's on a narrow one. */
const railOf = (page: Page) => page.locator('[data-frame-rail], [aria-label="Places"]') satisfies Locator;

/** The rail's destination named `name`, by its label, whatever its badge adds to its name; never a place of the pane in the drawer. */
export const railPlace = (page: Page, name: string) =>
  railOf(page)
    .getByRole('link')
    .and(page.locator(':not([data-pane-place])'))
    .filter({ has: page.getByText(name, { exact: true }) }) satisfies Locator;

/** The destinations the rail lights: the page's own, one at most on every page of the board. */
export const litOf = (page: Page) => railOf(page).locator('a[aria-current="page"]:not([data-pane-place])') satisfies Locator;

/** The factory pane, docked beside the rail or in the narrow screen's drawer. */
export const paneOf = (page: Page) => page.locator('[data-factory-pane]') satisfies Locator;

/** The pane's place named `name`. */
export const placeOf = (page: Page, name: (typeof PANE_PLACES)[number]) =>
  paneOf(page).locator(`a[data-pane-place="${name.toLowerCase()}"]`) satisfies Locator;

/** The pane's place lit: the one the page sits at. */
export const placeLitOf = (page: Page) => paneOf(page).locator('a[data-pane-place][aria-current="page"]') satisfies Locator;

/** The frame's strip of Settings' tabs, under the page's head and above the page. */
export const frameTabsOf = (page: Page) => page.getByRole('tablist', { name: 'Settings', exact: true }) satisfies Locator;

/**
 * A level of a deep page's trail, by its name: a link up to that level's page, or the page itself, the last.
 * @param page The page whose head draws the trail.
 * @param name The level's name.
 */
export const trailLevel = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Where you are' }).getByRole('link', { name, exact: true }) satisfies Locator;

/** The page's head, one line over the page's column. */
export const topBarOf = (page: Page) => page.locator('header[data-frame-header]') satisfies Locator;

/** The machine bar at the window's foot. */
export const machineBarOf = (page: Page) => page.locator('footer[data-machine-bar]') satisfies Locator;

/** The factory pane's switcher. */
export const pickerOf = (page: Page) => page.locator('[data-factory-picker]') satisfies Locator;

/** The pane's lists, each a link: the Runs, the Inbox and the Workflows of its factory. */
export const sectionsOf = (page: Page) =>
  paneOf(page).locator('a[data-pane-place="runs"], a[data-pane-place="inbox"], a[data-pane-place="workflows"]') satisfies Locator;

/** The pane's Start a run, which opens the start of a run in the frame's side sheet. */
export const startOf = (page: Page) => paneOf(page).getByRole('button', { name: 'Start a run' }) satisfies Locator;

/** The machine bar's line, which opens the machine's gauges in the frame's side sheet. */
export const gaugesButtonOf = (page: Page) => machineBarOf(page).locator('button[data-gauges-button]') satisfies Locator;

/** Opens the machine's gauges in the frame's side sheet, unless they are open, and returns the bar. */
export async function gaugesOf(page: Page) {
  const bar = page.locator('aside[data-bar="gauges"]');
  if (!(await bar.isVisible())) await gaugesButtonOf(page).click();
  await expectVisible(bar, 'the machine bar opens the gauges in the side sheet');
  return bar;
}

/** Picks the factory `choice` in the pane's switcher. */
export async function pick(page: Page, choice: string) {
  await pickerOf(page).locator('button').first().click();
  await page
    .getByRole('option')
    .filter({ has: page.getByText(choice, { exact: true }) })
    .click();
}

/**
 * Opens the kit's Select `select`, its root as the page marks it, picks the option said `word` among its options, and waits for its
 * menu to leave the page, so the next Select opened finds its own menu alone.
 * @param page The page the Select's options open over.
 * @param select The Select's root.
 * @param word The option's words.
 */
export async function pickIn(page: Page, select: Locator, word: string) {
  await select.locator('[data-slot="select-trigger"]').click();
  const menu = page.locator('[data-slot="select-popover"]');
  await menu.getByRole('option', { name: word, exact: true }).click();
  await menu.waitFor({ state: 'detached' });
}

/**
 * The words of the option the kit's Select `select` holds picked, `''` while it holds none.
 * @param select The Select's root.
 */
export async function heldIn(select: Locator) {
  if ((await select.locator('[data-slot="select-trigger"]').getAttribute('data-populated')) === null) return '';
  return ((await select.locator('[data-slot="select-value"]').textContent()) ?? '').trim();
}

/** Opens the Select pressed at `trigger` and picks the level said `word` among its options. */
export async function pickLevel(page: Page, trigger: Locator, word: 'Manual' | 'Semi-auto' | 'Auto') {
  await trigger.click();
  await page.getByRole('option', { name: word, exact: true }).click();
}

/**
 * On every page of a window not narrow: the machine bar with its gauges, the store's rail with its groups and their destinations in
 * their order, one lit at most; and on a factory's page whose pane is docked, the pane's switcher reading that factory.
 */
export async function sidebar(page: Page) {
  await expectVisible(gaugesButtonOf(page), 'the machine bar has its gauges');
  for (const place of RAIL_PLACES) await expectVisible(railPlace(page, place), `the rail has ${place}`);
  await expectCount(
    railColumnOf(page).getByRole('link'),
    RAIL_PLACES.length,
    `the rail holds its ${RAIL_PLACES.length} destinations alone`,
  );
  const order = await Promise.all(RAIL_PLACES.map(async (place) => (await railPlace(page, place).boundingBox())?.y ?? -1));
  if (order.some((y, at) => at > 0 && y <= order[at - 1]))
    throw new Refused(`the rail lists its places in order, ${RAIL_PLACES.join(', ')}`);
  if ((await litOf(page).count()) > 1) throw new Refused('the rail lights one destination at most');
  const factory = pickedIn(new URL(page.url()));
  if (factory === null) await expectCount(paneOf(page), 0, "a page of the store's level has no factory pane");
  else if (await paneOf(page).isVisible()) await expectPicked(page, factory);
}

/** That the pane's switcher reads `name`, the factory the page sits in. */
async function expectPicked(page: Page, name: string) {
  await expectVisible(
    pickerOf(page).locator('[data-slot="select-value"]').getByText(name, { exact: true }),
    `the switcher reads ${name}, the factory the page sits in`,
  );
}

/**
 * Another visit to `page`'s address in the same browser, so what this browser kept, checked by `check` and
 * watched as the page itself is. A page of its own rather than a reload: a reload cuts off an in-flight
 * refetch, which the watch would rightly count as a failed request.
 */
export async function nextVisit(page: Page, check: (again: Page) => Promise<void>) {
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
export function fed(run: string, ...said: [string] | [string, string]) {
  const [step, word] = said.length === 2 ? said : [undefined, said[0]];
  const line = { at: new Date().toISOString(), run, ...(step !== undefined ? { step } : {}), word };
  fs.appendFileSync(path.join(store!, 'feed.jsonl'), `${JSON.stringify(line)}\n`);
}

/**
 * One daemon's line appended to the workflow feed, in the shape the package writes it once a daemon has taken the store (`DaemonLine`:
 * `{ at, daemon, word }`, the pid and `daemon started`): for a page that writes a `daemon.json` by hand, where no daemon runs to say so,
 * and a board that must see it on the feed rather than on the fallback a minute later. A report and never an input, as `fed`'s lines are.
 */
export function fedDaemon(pid: number = process.pid) {
  const line = { at: new Date().toISOString(), daemon: pid, word: 'daemon started' };
  fs.appendFileSync(path.join(store!, 'feed.jsonl'), `${JSON.stringify(line)}\n`);
}

/** When the run DIAMOND calls off was cancelled, as `wf cancel` wrote it beside its record. */
export const cancelledAt = () => (storedMarker(DIAMOND.cancelled.id, 'cancelled') ?? '').trim();

/** The frame's bar, in its side sheet, while it shows the step `step` of the run `run`, found by the address it carries (`data-bar`). */
export const stepBar = (page: Page, run: string, step: string) => page.locator(`aside[data-bar="step:${run}/${step}"]`) satisfies Locator;

/**
 * The step's conversation in its bar, opened from the bar's ⋯ menu, in place of the step's card.
 * @param page The page the bar is open on, where the menu opens.
 * @param bar The step's bar (`stepBar`).
 */
export async function openConversation(page: Page, bar: Locator) {
  await bar.locator('button[data-bar-menu]').click();
  await page.getByRole('menuitem', { name: 'Open conversation', exact: true }).click();
  const talk = bar.locator('section[aria-label="Its conversation"]');
  await expectVisible(talk, "the bar's menu opens the step's conversation in place of its card");
  await expectCount(bar.locator('article[data-step-part]'), 0, "and the step's card is no longer drawn");
  return talk;
}

/**
 * The page a bar shows, opened by its ⋯ menu's Open.
 * @param page The page the bar is open on, where the menu opens.
 * @param bar The bar.
 */
export async function openFromBar(page: Page, bar: Locator) {
  await bar.locator('button[data-bar-menu]').click();
  await page.getByRole('menuitem', { name: 'Open', exact: true }).click();
}

/**
 * The Clock cell's button of `row` — or the Cost cell's, by `cell` — reached by the table's own arrow keys from the row: the keyboard
 * alone, which is what makes the focus a visible one and so opens the preview — React Aria opens a tooltip on focus only where the focus
 * came from the keyboard. `where` names the table the row is in, for the refusal.
 */
export async function reachClock(page: Page, row: Locator, where: string, cell: 'clock' | 'cost' = 'clock') {
  const button = row.locator(`td[data-${cell}] button`);
  await row.scrollIntoViewIfNeeded();
  await row.focus();
  const elsewhere = () => button.evaluate((found) => found !== document.activeElement);
  for (let at = 0; at < 14 && (await elsewhere()); at += 1) await page.keyboard.press('ArrowRight');
  if (await elsewhere()) throw new Refused(`the arrow keys reach the ${cell} cell's button along a ${where} row — they do not`);
  return button;
}

/** The theme a page is in, as its browser prefers it: what names a photograph taken beside the visit's own. */
export const themeOf = (page: Page) =>
  page.evaluate(() => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) satisfies Promise<string>;

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
) {
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
const TALLEST_WINDOW = 16_384;

/** How tall `page`'s document is, measured as Playwright measures a full-page picture. */
const pageHeight = (page: Page) =>
  page.evaluate(() => {
    const { body, documentElement: root } = document;
    return Math.max(body.scrollHeight, root.scrollHeight, body.offsetHeight, root.offsetHeight, body.clientHeight, root.clientHeight);
  }) satisfies Promise<number>;

/** Resolves once `page` has drawn two more frames: what a resize or a scroll changes is laid out and painted. */
const twoFrames = (page: Page) =>
  page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));

/**
 * Grows `page`'s window to the height of its document, measured again after each growth until it holds still (three tries at most: a
 * part as tall as the window grows with it), and waits for the floor to settle. Resolves with what puts the window's size and the scroll
 * back, or with nothing, having changed nothing, when the page fits its window, has none, or is taller than `TALLEST_WINDOW`: that last
 * is said on the log with `file`'s name, since its picture shows the frame where the window was.
 */
async function grownToPage(page: Page, file: string) {
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
export async function expectAlive(page: Page, face: string, who: string) {
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

/**
 * The path of the Card's verbs the board sends, in whatever namespace: the cards filed into (no `name`), a card (`name`), or its `verb`
 * (`queue`, `unqueue`, `start`, `labels`) — as a pattern, since a card's namespace is its factory, `default` for none.
 */
export const cardsPath = (name?: string, verb?: string) =>
  new RegExp(
    `^/api/namespaces/[^/]+/cards${name === undefined ? '' : `/${encodeURIComponent(name)}`}${verb === undefined ? '' : `/${verb}`}$`,
  ) satisfies RegExp;

/** A folder's files, each name with its text: what a page that writes nothing leaves as it found. */
export const filesIn = (dir: string) =>
  fs
    .readdirSync(dir)
    .sort()
    .map((name) => [
      name,
      fs.statSync(path.join(dir, name)).isFile() ? fs.readFileSync(path.join(dir, name), 'utf8') : '(a folder)',
    ]) satisfies Array<[string, string]>;

/**
 * A text's markdown, rendered: its `##` a heading two levels down, an h4 — the page's own are h1 and h2 — or at `level` where the page
 * places the text's shallowest heading itself, and its list, a list.
 */
export async function expectRendered(
  body: Locator,
  text: { heading: string; items: readonly string[]; cells?: readonly string[]; code?: string },
  level = 4,
) {
  await expectVisible(body.getByRole('heading', { level, name: text.heading }), `its ## is a heading, an h${level} (${text.heading})`);
  await expectTexts(body.locator('ul > li'), text.items, `its list is a list (${text.items.join(' · ')})`);
  for (const cell of text.cells ?? [])
    await expectVisible(body.getByRole('cell', { name: cell, exact: true }), `its table is a table, with a cell ${cell}`);
  if (text.code)
    await expectVisible(
      body.locator('[data-language="bash"]', { hasText: text.code }),
      `its fenced block is the board's code block, in bash (${text.code})`,
    );
}

/** A key's row as a page's key table draws it: the key, its value or none, and what it means. */
type KeyRow = { key: string; value: string | null; meaning: string };

/**
 * A page's key table: a row per key the api answers, in its order, each with its value — or `not set` — and what it means, as the api says
 * it. `set` is what the file sets, by key, as the seed wrote it: every other key reads `not set`.
 */
export async function expectKeys(page: Page, file: Locator, api: string, set: Readonly<Record<string, string>>) {
  const answered = await page.request.get(new URL(api, page.url()).href);
  if (!answered.ok()) throw new Refused(`GET ${api} answers the page's keys — it answered ${answered.status()}`);
  const { keys } = (await answered.json()) as { keys: KeyRow[] };
  for (const { key, value } of keys)
    if (value !== (set[key] ?? null))
      throw new Refused(`GET ${api} reads ${key} as the file sets it (${set[key] ?? 'not set'}) — it answered ${JSON.stringify(value)}`);
  await expectKeyRows(page, file, keys);
}

/**
 * A card's key table: the Card read by its name (`GET /api/cards/<name>`) as the file sets it, and a row per key a card may set, in
 * `CARD_KEYS`' order, each with its value — or `not set` — and what it means (`CARD_KEY_MEANINGS`). `set` is what the card's file sets, by
 * key, as the seed wrote it, of a card in the default factory: every other key reads `not set`.
 */
export async function expectCardKeys(page: Page, file: Locator, name: string, set: Readonly<Record<string, string>>) {
  const api = `/api/cards/${name}`;
  const answered = await page.request.get(new URL(api, page.url()).href);
  if (!answered.ok()) throw new Refused(`GET ${api} answers the card — it answered ${answered.status()}`);
  const card = (await answered.json()) as Card;
  if (card.metadata.name !== name || (card.spec.workflow ?? null) !== (set.workflow ?? null))
    throw new Refused(
      `GET ${api} reads the card as its file sets it (workflow ${set.workflow ?? 'not set'}) — it answered ${JSON.stringify(card)}`,
    );
  await expectKeyRows(
    page,
    file,
    CARD_KEYS.map((key) => ({ key, value: set[key] ?? null, meaning: CARD_KEY_MEANINGS[key] })),
  );
}

/** The key table's rows: one per row of `keys`, in its order, each with its value — or `not set` — and what it means. */
async function expectKeyRows(page: Page, file: Locator, keys: readonly KeyRow[]) {
  const rows = file.locator('section[aria-label="Keys"] tr[data-key]');
  await expectCount(rows, keys.length, `a row per key (${keys.map((k) => k.key).join(', ')})`);
  const order = await rows.evaluateAll((trs) => trs.map((tr) => tr.getAttribute('data-key')));
  if (JSON.stringify(order) !== JSON.stringify(keys.map((k) => k.key)))
    throw new Refused(`the rows are in the package's order — ${order.join(', ')}`);
  for (const { key, value, meaning } of keys) {
    const row = rows.filter({ has: page.locator(`th[scope="row"]`, { hasText: new RegExp(`^${key}$`) }) });
    await expectTexts(row.locator('[data-value]'), [value ?? 'not set'], `${key}'s value reads ${value ?? 'not set'}`);
    await expectTexts(
      row.locator('[data-meaning]'),
      [meaning.replaceAll('`', '')],
      `${key}'s row says what it means, as the package does, its markdown code spans drawn as code`,
    );
  }
}

/**
 * Source: the file as written, frontmatter included, in place of what the page renders of it — and back.
 * @param file The page's file section.
 * @param body The rendered body Source stands in for.
 * @param held Where the text is held, named in a refusal.
 * @param written The text as it is held: a file's bytes, or a card's text as the store keeps it.
 */
export async function expectSource(file: Locator, body: Locator, held: string, written: string) {
  const toggle = file.getByRole('button', { name: 'Source' });
  await toggle.click();
  const source = file.locator('pre[data-source]');
  await expectVisible(source, 'Source shows the file as written');
  const shown = await source.textContent();
  if (shown !== written)
    throw new Refused(
      `Source is the file byte for byte, frontmatter included — it shows ${JSON.stringify(shown)}, and ${held} holds ${JSON.stringify(written)}`,
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
export function recordedUsage(name: 'no-plan' | 'unsupported' | 'unanswered') {
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
const QUOTA_ANSWER_MS = QUOTA_ASKS_MS + 2_000;

/**
 * Reloads `page` and waits for the board's `GET /api/quota` answered in `state`, the state the page's change makes, then for the page to
 * idle. It waits on the state, never on a time compared between the e2e's clock and the api's, which steps: at its keep of 0 the api
 * answers a read only from an ask begun after the read came, and each change a quota page makes gives a state other than the one before
 * it. A page that wrote the same state twice in a row would pass on an answer from before its change. Refuses, naming the state it waited
 * for and the state and `askedAt` of each answer it saw, when none came in `state` within `QUOTA_ANSWER_MS`.
 */
export async function reloadForQuota(page: Page, state: string) {
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

/** The run page's ledger: every step's part at L, in run order. */
export const LEDGER = 'section[aria-label="Every step"]';

/** A step's part at L in `scope`: its row of the run page's ledger, the step bar's part or the step page's. */
export const partOf = (scope: Page | Locator, step: string) =>
  scope.locator(`article[data-step-part="L"][data-step-name="${step}"]`) satisfies Locator;

/** The first fold `name` in `scope`, opened if it is closed (a fold draws what it holds only once open), and returned. */
export async function openFold(scope: Locator, name: string) {
  const fold = scope.locator(`[data-fold="${name}"]`).first();
  const trigger = fold.locator(':scope > [data-slot="disclosure-trigger"]');
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
  await expectVisible(trigger.and(scope.page().locator('[aria-expanded="true"]')), `the fold ${name} opens`);
  return fold;
}

/** The run page's menu of actions on `page`, opened: its button pressed and the kit's menu that holds Remove, Hold or Lift, and Prune. */
export async function openRunMenu(page: Page) {
  const menu = page.getByRole('menu', { name: /^Actions on / });
  if (!(await menu.isVisible())) await page.locator('button[data-run-menu]').click();
  await expectVisible(menu, "the run's menu opens on its actions");
  return menu;
}

/**
 * The question the run page's action `label` asks (`Remove…`, `Hold…`, `Lift…`, `Prune…`), opened: the menu opened, its item pressed, and
 * the dialog named `asked` that opens beside the menu's button once the menu closes.
 * @param page The run's page.
 * @param label What the action's item says.
 * @param asked The name the question's dialog is given (`Hold <run>`, `Lift the hold on <run>`).
 */
export async function askRunAction(page: Page, label: string, asked: string) {
  await (await openRunMenu(page)).getByRole('menuitem', { name: label, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: asked });
  await expectVisible(dialog, `${label} asks its question once the menu closes`);
  return dialog;
}

/**
 * The actions the run page's menu holds, as its button names them (`remove`, `hold` or `lift`, `prune`): none where the page, read, draws
 * no menu.
 */
export async function runMenuActions(page: Page) {
  await expectVisible(page.locator('header[data-run-header]'), "the run's header is drawn");
  const menu = page.locator('button[data-run-menu]');
  if (!(await menu.count())) return [] satisfies string[];
  return ((await menu.getAttribute('data-run-menu')) ?? '').split(' ').filter(Boolean);
}

/**
 * The Debug panel of the step part `part`, opened: its Detail fold opened, its trigger pressed and the path of `taskId` drawn, with the
 * lifecycle it is drawn on.
 */
export async function openDebug(part: Locator, taskId: string) {
  const detail = await openFold(part, 'detail');
  const panel = detail.getByRole('region', { name: 'Debug' });
  await panel.getByRole('button', { name: /Debug$/ }).click();
  await expectVisible(panel.locator(`[data-path="${taskId}"]`), `opened, the Debug panel draws the path of ${taskId}`);
  return { panel, lifecycle: panel.locator('[data-machine="lifecycle"]') } satisfies { panel: Locator; lifecycle: Locator };
}

/**
 * How old the clock the board drew an instant with can be when the assertion reads its words: `Instant` reads its clock every
 * 60 s (`useNow`, src/components/time/Instant.tsx), and a render and this read follow it. A midnight or a new year inside that window
 * gives the page's words and the assertion's two forms, and both are the board's.
 */
export const DREW_WITHIN_MS = 90_000;

/**
 * The clocks the page may have drawn an instant with, read now: the one this read sees, and the oldest `DREW_WITHIN_MS` allows.
 * Oldest first, so a refusal names the page's own form first.
 */
const drewWith = () => {
  const now = new Date();
  return [new Date(now.getTime() - DREW_WITHIN_MS), now] satisfies readonly Date[];
};

/**
 * What the kit's tooltip of each of `triggers` says, in their order, read as a person reads it: the pointer moves first, since React
 * Aria opens a tooltip on hover only once a pointer has moved over the page since the last key, then rests on each in turn, two pixels
 * in from its left edge, where no target beside it reaches (the copy control's reaches over the short id's right, `finger` in
 * `pages/050-runs.ts`), and the tooltip that describes it (`role="tooltip"`, named by its `aria-describedby`) is read once it opens;
 * then the pointer leaves, and the last tooltip is waited out, so nothing after this reads or pictures one. Refuses a trigger no
 * tooltip describes within `WAIT_MS`.
 * @param triggers The marks, links or buttons the tooltips hang off.
 * @param what What the triggers are, named in the refusal.
 */
export async function tipsOf(triggers: Locator, what: string) {
  const page = triggers.page();
  const said: string[] = [];
  await page.mouse.move(1, 1);
  for (const trigger of await triggers.all()) {
    const box = await trigger.boundingBox();
    await trigger.hover({ position: { x: 2, y: (box?.height ?? 4) / 2 } });
    const tip = await trigger
      .and(page.locator('[aria-describedby]'))
      .waitFor({ timeout: WAIT_MS })
      .then(
        async () =>
          page.locator(`[role="tooltip"][id="${await trigger.getAttribute('aria-describedby')}"]`).textContent({ timeout: WAIT_MS }),
        () => null,
      );
    if (tip === null) throw new Refused(`${what} each say their words in the kit's tooltip — no tooltip describes one`);
    said.push(tip);
  }
  await page.mouse.move(0, 0);
  await page.locator('[role="tooltip"]').waitFor({ state: 'detached', timeout: WAIT_MS });
  return said;
}

/**
 * Refuses a `<time>` that does not say its instant as the board writes one where the browser is: `words` of its `datetime` as its
 * text (`instantWords` by default), and on hover `about`, a colon, then the instant whole (`instantWhole`). `what` names the time in
 * the refusal. The text is taken for every clock the page may have drawn with (`DREW_WITHIN_MS`), so a day or a year that turns
 * between the drawing and this read refuses nothing; a text that is no clock's is refused all the same.
 */
export async function expectInstant(
  time: Locator,
  about: string,
  what: string,
  words: (at: Date, timeZone: string, now: Date) => string = (at, timeZone, now) => instantWords(at, now, timeZone),
) {
  const timeZone = await time.page().evaluate(() => new Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [at, text, title] = [await time.getAttribute('datetime'), await time.textContent(), await time.getAttribute('title')];
  if (!at) throw new Refused(`${what} is a time with its instant — it has no datetime`);
  const said = [...new Set(drewWith().map((now) => words(new Date(at), timeZone, now)))];
  const whole = `${about}${instantWhole(new Date(at), timeZone)}`;
  if (!said.includes(text ?? ''))
    throw new Refused(`${what} reads as the board writes it, ${said.join(' or ')} — it reads ${JSON.stringify(text)}`);
  if (title !== whole) throw new Refused(`${what} says the whole instant on hover, ${whole} — its title is ${JSON.stringify(title)}`);
}

/** What the api answers at `pathname`, read apart from the page: the page's own requests do not count it. */
export async function answered<T>(page: Page, pathname: string) {
  return (await (await page.request.get(new URL(pathname, page.url()).href)).json()) as T;
}

/** The path of a RunList read: every factory's (`/api/runs`), or the namespace of `factory`'s, with `query` encoded as the client does. */
export const runListPath = (factory: string | undefined, query: Record<string, string> = {}) => {
  const params = new URLSearchParams(query).toString();
  return `${factory === undefined ? '/api/runs' : `/api/namespaces/${encodeURIComponent(factory)}/runs`}${params ? `?${params}` : ''}`;
};

/**
 * Every run, read apart from the page as the board reads them: the plain RunList whole (`GET /api/runs`, a page of the most a page
 * holds), each run's view (`rowsOf`). The api judges every run of the seed: a run it could not judge is refused.
 */
export const rowsAnswered = async (page: Page) =>
  rowsOf(await answered<RunList>(page, runListPath(undefined, { limit: String(LIST_PAGE.most) }))).map((row) => {
    if (judged(row)) return row;
    throw new Refused(`the api judges every run of the seed: it could not judge ${row.id} (${row.unjudged})`);
  });

/** The frame, read apart from the page as the board reads it: the RunList of the runs not finished, of every factory or `factory`'s. */
export const openAnswered = async (page: Page, factory?: string) =>
  openOf(await answered<RunList>(page, runListPath(factory, { fieldSelector: OPEN_SELECTOR })));

/** A page of the finished runs, read apart from the page as the board reads it: nine from the token `from`, the first for none. */
export const finishedAnswered = async (page: Page, factory?: string, from?: string) =>
  finishedOf(
    await answered<RunList>(
      page,
      runListPath(factory, { fieldSelector: FINISHED_SELECTOR, limit: String(FINISHED_SIZE), ...(from ? { continue: from } : {}) }),
    ),
  );

/**
 * Whether `pathname` is the run `id` on its namespaced path, in whichever namespace it is: the run itself (its removal), or with `tail` one
 * of its named actions (`/hold`, `/labels`, `/steps/<step>/retry`).
 */
export const isRunAction = (pathname: string, id: string, tail = '') =>
  /^\/api\/namespaces\/[^/]+\/runs\/(.+)$/.exec(pathname)?.[1] === `${id}${tail}`;

/** The namespaced path of the run `id` (`/api/namespaces/<factory>/runs/<id>`), its namespace read off its object. */
export async function runPath(page: Page, id: string) {
  const run = await answered<{ metadata: { namespace?: string; labels: Record<string, string> } }>(page, `/api/runs/${id}`);
  return `/api/namespaces/${run.metadata.namespace ?? run.metadata.labels.factory ?? 'default'}/runs/${id}`;
}

/** Whether `pathname` is a run's start, in whichever namespace (`POST /api/namespaces/<factory>/runs`). */
export const isRunStart = (pathname: string) => /^\/api\/namespaces\/[^/]+\/runs$/.test(pathname);

/**
 * The factories as the board's pages draw them, read apart from the page: the api's `FactoryList` (a page of the most a page holds),
 * each factory's lines, made the board's view as the board makes it (`factoryViewOf`).
 */
export async function factoriesAnswered(page: Page) {
  const listed = await answered<FactoryList>(page, `/api/factories?limit=${LIST_PAGE.most}`);
  return Promise.all(
    listed.items.map(async (factory) =>
      factoryViewOf(factory, await answered<FactoryCommands>(page, `/api/factories/${encodeURIComponent(factory.metadata.name)}/commands`)),
    ),
  );
}

/**
 * Photographs the whole page as `<name>-<what>-<theme>.png` in the window it is in, then 390 wide as `<name>-<what>-phone-<theme>.png`,
 * and puts the window back. Takes none unless the page is pictured (`photograph`); the window is narrowed and put back all the same.
 */
export async function photographBothWidths(page: Page, out: string, name: string, what: string) {
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

/** One question of an ask of hers, as the keeper copied it into her chat. */
type HerQuestion = {
  question: string;
  header: string;
  options: readonly { label: string; description: string; recommended: boolean }[];
  multiSelect?: boolean;
};

/** One ask of hers in her chat: its id, its questions, and the person's answer where the page plants one answered already. */
export type HerAsk = { id: string; questions: readonly HerQuestion[]; answers?: Record<string, string> };

/**
 * Who an outbox entry is from, as the orchestrator's `Speaker` writes it: the person, or another agent under the name it speaks as. An
 * entry with no `from` is the person's.
 */
type HerSpeaker = { kind: 'person' } | { kind: 'agent'; name: string };

/** What a page plants of her: her level, where her session is, her transcript, the read mark, the person's outbox, and her asks. */
export type HerChat = {
  level?: 'manual' | 'semi-auto' | 'auto';
  /** Her session as its holder's run file says it: answering a turn, up and waiting for words, or none filed at all. */
  session?: 'answering' | 'up' | 'none';
  /** Her transcript, oldest first: her words are `m:1:e<i>` in the chat, a tool call `t:1:e<i>`, by its line's place here. */
  said?: readonly HerLine[];
  /** The id the read mark names, which the chat gives each line of `said`. */
  read?: string;
  /**
   * What the api took for her outbox, each entry drawn as the person's own bubble, or, an entry `from` an agent, as that agent's: the
   * `from` written on its line as the api writes it, and left off where the page names none.
   */
  outbox?: readonly { id: string; at: string; text: string; from?: HerSpeaker }[];
  /**
   * What the keeper said to her session, journalled as the runtime journals a said: a quiet marker in the chat, unless `delivers` names
   * an outbox entry it carried, which draws that entry as the person's own bubble.
   */
  told?: readonly { text: string; delivers?: string }[];
  /** The questions of hers waiting on the person, each drawn in her talk by what its choices carry (`drawnAsk`). */
  asks?: readonly HerAsk[];
  /** Why the keeper could not trust her folder, written as its record (`untrusted.json`): a message no longer wakes her. */
  untrusted?: string;
};

/**
 * The id her chat gives the line at `i` of `said`: `m:1:e<i>:0` for her words, the `0` their place in the message's content, and
 * `t:1:e<i>` for a tool call.
 */
export const herEvent = (said: readonly HerLine[], i: number) => ('text' in said[i] ? `m:1:e${i}:0` : `t:1:e${i}`);

/**
 * Her session's run file (`attachedRun`): in a turn the engine reads it `working`, and her phase answering; its turn over it is `idle`,
 * which the engine reads `input-required` with nothing waited for, so her phase is idle, which `idleOf` grants a long-lived session
 * alone.
 */
const herRun = (state: 'working' | 'idle', startedAt: string) => attachedRun(`ae/${NEMIA_TASK}/1`, NEMIA_SESSION, state, startedAt);

/** One line of her transcript as Claude Code writes it, `seconds` before now. */
const herTranscriptLine = (line: HerLine, i: number, at: (seconds: number) => string) => {
  const head = {
    sessionId: NEMIA_SESSION,
    isSidechain: false,
    userType: 'external',
    cwd: NEMIA_CWD,
    version: '2.1.270',
    uuid: `e${i}`,
    timestamp: at(i * 4),
  };
  if ('text' in line) {
    const made: object[] = [{ ...head, type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: line.text }] } }];
    return made;
  }
  const call = {
    ...head,
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'tool_use', id: `e${i}`, name: line.tool, input: { description: line.says } }] },
  };
  if (line.result === undefined) {
    const made: object[] = [call];
    return made;
  }
  const result = {
    ...head,
    uuid: `r${i}`,
    timestamp: at(i * 4 + 2),
    type: 'user',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `e${i}`, content: line.result }] },
  };
  {
    const made: object[] = [call, result];
    return made;
  }
};

/**
 * Plants Nemia's chat in the store the worker serves: her level file naming her task, her task journalled filed and spawned as her
 * transcript's first line is written (a line timed before her attempt began is her parent session's, never drawn), her
 * session's run file as its holder writes one (`herRun`), her session's transcript, the person's outbox and their read mark. Each file
 * is written as the keeper, the api and the runtime write theirs — a key they leave out absent, never null.
 *
 * Answers what takes it back: every file it made removed. A page calls it in a `try` and
 * the take-back in its `finally`, so no page after it reads her.
 */
export function herChat(what: HerChat) {
  const root = store!;
  const now = Date.now();
  const at = (seconds: number) => new Date(now - 600_000 + seconds * 1000).toISOString();
  const level = what.level ?? 'semi-auto';
  const nemiaDir = path.join(root, 'nemia');
  const journal = path.join(root, 'engine', 'tasks', `${NEMIA_TASK}.jsonl`);
  const { run: herRunFile } = attachedFiles(root, `ae/${NEMIA_TASK}/1`);
  const transcript = path.join(root, 'claude', 'projects', NEMIA_PROJECT, `${NEMIA_SESSION}.jsonl`);
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
      { kind: 'starting', at: at(0), attempt: 1 },
      { kind: 'spawned', at: at(0), attempt: 1 },
      ...(what.told ?? []).map((told, i) => ({ kind: 'said', at: at(2 + i), attempt: 1, text: told.text })),
    ]),
  );
  const session = what.session ?? 'answering';
  if (session !== 'none') {
    fs.mkdirSync(path.dirname(herRunFile), { recursive: true });
    fs.writeFileSync(herRunFile, herRun(session === 'answering' ? 'working' : 'idle', new Date(now - 600_000).toISOString()));
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
  if (what.asks?.length) {
    const chat = path.join(nemiaDir, 'chat');
    fs.mkdirSync(chat, { recursive: true });
    fs.writeFileSync(
      path.join(chat, 'asks.jsonl'),
      lines(
        what.asks.map((ask, i) => ({
          id: ask.id,
          at: at(300 + i),
          questions: ask.questions.map((question) => ({ ...question, multiSelect: question.multiSelect ?? false })),
        })),
      ),
    );
    const answered = what.asks.flatMap((ask, i) =>
      ask.answers === undefined ? [] : [{ id: ask.id, at: at(360 + i), answers: ask.answers }],
    );
    if (answered.length > 0) fs.writeFileSync(path.join(chat, 'answers.jsonl'), lines(answered));
  }
  if (what.untrusted !== undefined)
    fs.writeFileSync(path.join(nemiaDir, 'untrusted.json'), `${JSON.stringify({ refused: what.untrusted })}\n`);
  if (what.read !== undefined) {
    fs.mkdirSync(path.join(nemiaDir, 'chat'), { recursive: true });
    fs.writeFileSync(path.join(nemiaDir, 'chat', 'read.json'), `${JSON.stringify({ through: what.read, at: at(600) })}\n`);
  }
  return (() => {
    fs.rmSync(nemiaDir, { recursive: true, force: true });
    fs.rmSync(journal, { force: true });
    fs.rmSync(path.join(root, 'claude', 'projects', NEMIA_PROJECT), { recursive: true, force: true });
    fs.rmSync(herRunFile, { force: true });
  }) satisfies () => void;
}

/**
 * Her chat made unreadable where it stands: a line the chat's record does not decode, written on the person's outbox, which every read
 * of her chat refuses (`decoded` in the orchestrator's `chat/chat.store.ts`) while it is there. The api's chat stream then says
 * `unreadable` with `retrying` on its next look at her chat's files (`Beats.chatFiles` in apps/api) and goes on reading, which is
 * what her panel draws as a quiet band.
 *
 * Answers what puts it back — the file as it was, or gone where there was none — so the read works on the beat after and the band goes.
 * Called between `herChat` and its take-back, whose removal of her folder would take the file too.
 */
export function herChatUnreadable() {
  const file = path.join(store!, 'nemia', 'chat', 'outbox.jsonl');
  const held = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${held ?? ''}{"id":"half-written"}\n`);
  return (() => {
    if (held === undefined) fs.rmSync(file, { force: true });
    else fs.writeFileSync(file, held);
  }) satisfies () => void;
}

/**
 * Her turn over, as her holder writes it once a turn of the session it holds has ended: her run file `idle`, which the engine reads
 * `input-required`, so her presence says she is no longer answering. Taken back with the rest by `herChat`'s take-back.
 */
export function herTurnOver() {
  const { run } = attachedFiles(store!, `ae/${NEMIA_TASK}/1`);
  fs.writeFileSync(run, JSON.stringify({ ...(JSON.parse(fs.readFileSync(run, 'utf8')) as object), state: 'idle' }));
}

/**
 * The stop the api writes when the turn she was answering is ended, on her chat's own file as `chatStop` appends it: one line, so a
 * second visit of a page reads the one stop it made. Her chat draws it as the keeper's quiet marker.
 */
export function herStopped(at: string) {
  const dir = path.join(store!, 'nemia', 'chat');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'stops.jsonl'), `${JSON.stringify({ at, attempt: 1 })}\n`);
}

/** Her face in the rail (or in the top bar on a narrow screen), the frame's side sheet that holds her chat or a bar, and her panel. */
export const herFaceOf = (page: Page) => page.locator('[data-nemia-face-button]') satisfies Locator;
export const herSheetOf = (page: Page) => page.locator('[data-slot="side-sheet"]') satisfies Locator;

/** The frame's docked sheet's holder, which says how it stands (`data-frame-sheet`) and what it shows (`data-sheet-shows`). */
export const frameSheetOf = (page: Page) => page.locator('[data-frame-sheet]') satisfies Locator;

/** The frame's docked sheet comes to show `shows`, within `WAIT_MS`: what the address's `?bar=` names, her chat, or nothing. */
export async function expectSheetShows(page: Page, shows: 'bar' | 'her' | 'none', assertion: string) {
  try {
    await page.locator(`[data-frame-sheet][data-sheet-shows="${shows}"]`).waitFor({ state: 'attached', timeout: WAIT_MS });
  } catch {
    const now = await frameSheetOf(page)
      .getAttribute('data-sheet-shows', { timeout: 1000 })
      .catch(() => 'no docked sheet');
    throw new Refused(`${assertion} — the sheet shows ${now}`);
  }
}
export const chatPanelOf = (page: Page) => page.locator('[data-chat-panel]') satisfies Locator;

/**
 * The words of every cue her face says now, in its order: none where her face counts none (`data-nemia-cues`), else read off the tooltip
 * a fresh hover of her face opens.
 */
async function herCues(page: Page) {
  const face = herFaceOf(page);
  const count = Number(await face.getAttribute('data-nemia-cues', { timeout: WAIT_MS }));
  if (count === 0) return [] satisfies string[];
  await page.mouse.move(0, 0);
  await face.hover();
  const cues = page.locator('[data-nemia-cues] [data-cue]');
  await expectCount(cues, count, 'a hover of her face says every cue that holds in its tooltip');
  return (await cues.allTextContents()).map((words) => words.trim());
}

/** Her cues come to hold what `holds` asks of their words, within `timeout`, each read by a fresh hover (`herCues`). */
export async function expectCues(page: Page, holds: (words: string[]) => boolean, assertion: string, timeout = WAIT_MS) {
  await expectNone(
    async () => {
      const words = await herCues(page);
      return holds(words) ? null : `her face says ${JSON.stringify(words)}`;
    },
    assertion,
    timeout,
  );
}

/**
 * `element` is in the window and nothing is drawn over it: the element at the centre of its box is it or inside it. What a fixed layer
 * laid over a page's foot would fail.
 */
export async function expectUncovered(element: Locator, assertion: string) {
  const seen = await element.evaluate((own) => {
    const box = own.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    if (box.bottom > innerHeight + 1 || box.top < -1)
      return `it stands from ${Math.round(box.top)} to ${Math.round(box.bottom)} of ${innerHeight}`;
    const at = document.elementFromPoint(x, y);
    return at !== null && own.contains(at) ? null : `the element at its centre is ${at?.outerHTML.slice(0, 120) ?? 'none'}`;
  });
  if (seen !== null) throw new Refused(`${assertion} — ${seen}`);
}

/** Opens her side sheet from her face, and waits for the panel in it and for the sheet to have come in whole. */
export async function openChat(page: Page) {
  await herFaceOf(page).click();
  const panel = chatPanelOf(page);
  await expectVisible(panel, "her face in the rail opens Nemia's chat");
  await expectSheetIn(page);
  return panel;
}

/** Her sheet, docked or modal, has come in whole: it stands at the right of the window, its slide or its widening done. */
export async function expectSheetIn(page: Page) {
  await expectNone(
    () =>
      herSheetOf(page).evaluate((sheet) => {
        const right = sheet.getBoundingClientRect().right;
        return Math.abs(right - innerWidth) > 1 ? `its right is at ${right} of ${innerWidth}` : null;
      }),
    'her sheet comes to stand at the right of the window',
  );
}

/**
 * The panel stands wholly inside the window, and its composer wholly inside its frame: the header's three controls can be reached, the
 * frame's cut corners are drawn, and nothing of the panel is laid over the page beneath it.
 */
export async function expectPanelHeld(page: Page) {
  const room = page.viewportSize();
  const panel = await chatPanelOf(page).boundingBox();
  if (room === null || panel === null) throw new Refused('the panel has a size to measure');
  const past = [
    panel.y < -1 && `its top is at ${Math.round(panel.y)}`,
    panel.x < -1 && `its left is at ${Math.round(panel.x)}`,
    panel.x + panel.width > room.width + 1 && `its right is at ${Math.round(panel.x + panel.width)} of ${room.width}`,
    panel.y + panel.height > room.height + 1 && `its foot is at ${Math.round(panel.y + panel.height)} of ${room.height}`,
  ].filter((said) => said !== false);
  if (past.length > 0) throw new Refused(`the panel stands inside the window — ${past.join(', ')}`);
  const composer = await page.locator('[data-chat-composer]').boundingBox();
  if (composer === null) throw new Refused('the composer has a size to measure');
  if (composer.y + composer.height > panel.y + panel.height + 1)
    throw new Refused(
      `the composer stands inside the panel — it ends at ${Math.round(composer.y + composer.height)}, the panel at ${Math.round(panel.y + panel.height)}`,
    );
}

/** The composer's field in her chat. */
export const chatFieldOf = (page: Page) => page.locator('[data-chat-composer] textarea') satisfies Locator;

/** The piece the e2e plants in every readiness read the board makes: missing, and a run waits on it, so the setup banner is raised. */
const BANNER_PIECE = {
  name: 'e2e-banner',
  area: 'harness',
  state: 'missing',
  message: 'a piece the e2e plants, which a run waits on, so the setup banner shows on every page',
  fixes: [],
  cost: 'run',
} as const;

/** Where the board reads the readiness read, as a route's pattern. */
export const READINESS_ROUTE = '**/api/readiness';

/**
 * Every page of `context` judged with the setup banner shown, whatever the machine misses: the board's readiness read answered as the api
 * answers it, with BANNER_PIECE added, so a page that measures to the window's foot is measured under the banner's row. A page that reads
 * the api's own read on the board routes it on to the api itself (`page.route` with `route.continue()`, which a page's route takes before
 * the context's).
 */
export async function bannerShown(context: BrowserContext) {
  await context.route(READINESS_ROUTE, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const response = await route.fetch();
    if (!response.ok()) return route.fulfill({ response });
    const read = (await response.json()) as { ready: boolean; pieces: unknown[] };
    // oxlint-disable-next-line landmines-testing/no-test-doubles -- a banner on the api's own read: the seat has none
    return route.fulfill({ response, json: { ...read, ready: false, pieces: [...read.pieces, BANNER_PIECE] } });
  });
}

/**
 * The Overview's strip reads whole in the room its page column gives it: its three headings, the readout and the agents' count are cut
 * by nothing, and each agent's row shows at least the agent's name, the words before its first ` · `, whole inside its row (the rest of
 * the row may be cut short). The intent's 'A.', 'Q.' and 'd…' at 1280 beside her sheet are what this refuses.
 */
export async function expectStripWhole(page: Page, assertion: string) {
  const strip = page.locator('[data-overview-strip]');
  await expectCount(strip.locator('[data-strip-heading]'), 3, `${assertion}: the strip shows its three headings`);
  await expectUncut(strip.locator('[data-strip-heading]'), `${assertion}: each heading is read whole`);
  await expectUncut(
    strip.locator('[data-strip-readout], [data-strip-agents]'),
    `${assertion}: the readout and the agents' count are whole`,
  );
  await expectNone(
    () =>
      strip.locator('[data-agent-words]').evaluateAll((all) => {
        const cut = all.flatMap((words) => {
          const text = document.createTreeWalker(words, NodeFilter.SHOW_TEXT).nextNode();
          const said = text?.textContent ?? '';
          const name = said.split(' · ')[0] ?? '';
          if (!text || !name) return [`a row with no name (${said})`];
          const range = document.createRange();
          range.setStart(text, 0);
          range.setEnd(text, name.length);
          const right = range.getBoundingClientRect().right;
          return right > words.getBoundingClientRect().right + 1 ? [name] : [];
        });
        return cut.length ? `the agent's name is cut in its row: ${cut.join(', ')}` : null;
      }),
    `${assertion}: each agent's row shows the agent's name whole`,
  );
}

/**
 * The frame's snackbar, refused unless it shows naming `name`: what a write says once its thing left the page (`sayWritten`). A snackbar
 * stays five seconds, so a page reads it, and pictures it, before anything slow.
 * @param page The board's page that wrote.
 * @param name The run's id, the card's or the proposal's name, which the snackbar names.
 * @param assertion What the page asserts by it.
 */
export async function snackbarSaying(page: Page, name: string, assertion: string) {
  const said = page.locator('[data-slot="snackbar-region"] [data-slot="snackbar"]', { hasText: name });
  await expectVisible(said, assertion);
  return said;
}

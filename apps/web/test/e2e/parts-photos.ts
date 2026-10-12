/**
 * Pictures the look's parts for a person who reviews them: `node test/e2e/parts-photos.ts` from `apps/web` builds the page of their
 * stories (`parts/main.tsx`), opens it in light, then in dark, and writes into the e2e's folder of pictures (`OUT`, the run's files
 * where `WF_ARTIFACTS` names them) a sheet of each part's stories (`parts-<Part>-<theme>.png`); then, enlarged for a person's eye,
 * the cut button at rest and with the keyboard's focus, as a link and as a press, and disabled, six times, the corner of a frame
 * that waits on a person, four times, the rail of a run whose steps are done, a page's name over its rule, a text link at rest,
 * under the pointer and with the keyboard on it, and a short id at rest and just copied, on a clipboard that takes anything. Then,
 * in a browser that draws scroll bars, which the first hides, four times as large: in one whose bars take room, the bottom-left
 * corner and the right edge of a table in a cut frame (`parts-bars-corner-classic-<theme>.png`,
 * `parts-bars-edge-classic-<theme>.png`); and in that one and in one whose bars float, a box's scroll bar at rest, while it scrolls,
 * under the pointer and while it is held (`parts-bars-thumb-<state>-<kind>-<theme>.png`), and the sideways bar of a table narrower
 * than its columns (`parts-bars-sideways-<kind>-<theme>.png`). Last it builds Nemia's Storybook into a scratch folder, says what
 * the build took and its largest process held, and pictures its index with a story open (`storybook-<theme>.png`). No test runs
 * it, and it asserts nothing.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { Browser, Page } from 'playwright';
import { scratch } from '../scratch.ts';
import { photograph } from './board.ts';
import { buildParts, openParts, story, typeOf } from './parts/gallery.ts';
import { launch } from './visit.ts';
import { fromNodeModules, OUT, WEB } from './world.ts';

/** The grounds the stories draw the cut button on, as a link, as a press and disabled, and a text link and a short id on. */
const BUTTON_GROUND = `${story('look-cutbutton--link')} [data-story-ground] > div`;
const PRESS_GROUND = `${story('look-cutbutton--press')} [data-story-ground] > div`;
const DISABLED_GROUND = `${story('look-cutbutton--disabled-press')} [data-story-ground] > div`;
const TITLE_GROUND = `${story('look-textlink--title')} [data-title-ground]`;
const ID_GROUND = `${story('look-copyid--short')} [data-id-ground]`;

/**
 * Pictures what `selector` finds drawn `times` as large, as `name` in the folder of pictures, and puts it back at its size. `under`
 * is what the pointer is put on once it is enlarged, since what grows moves from under a pointer placed before.
 */
async function enlarged(page: Page, selector: string, times: number, name: string, under?: string): Promise<void> {
  const part = page.locator(selector);
  await part.evaluate((found, zoom) => ((found as HTMLElement).style.zoom = String(zoom)), times);
  if (under) await page.locator(under).hover();
  const file = path.join(OUT, name);
  await photograph(part, file, { always: true });
  await part.evaluate((found) => ((found as HTMLElement).style.zoom = ''));
  if (under) await page.mouse.move(0, 0);
  console.log(`parts: ${file}`);
}

/** Presses Tab until what has the focus is inside what `selector` finds. */
async function tabInto(page: Page, selector: string): Promise<void> {
  for (let i = 0; i < 80; i += 1) {
    await page.keyboard.press('Tab');
    if (await page.locator(selector).evaluate((found) => found.contains(document.activeElement))) return;
  }
  throw new Error(`Tab never reached ${selector}`);
}

/** Takes the focus and the pointer off everything. */
async function atRest(page: Page): Promise<void> {
  await page.mouse.move(0, 0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

/** The box a story draws shorter than what it holds, and the framed tables with one row and narrower than their columns. */
const SCROLLER = `${story('look-scrollbars--marked')} [data-scroller]`;
const ONE_ROW = '[data-framed="one"] [data-cut-frame]';
const NARROW = '[data-framed="narrow"]';

/** Pictures what `selector` finds as `name` in the folder of pictures, as large as its page draws it. */
async function pictured(page: Page, selector: string, name: string): Promise<void> {
  const file = path.join(OUT, name);
  await photograph(page.locator(selector), file, { always: true });
  console.log(`parts: ${file}`);
}

/** Writes on what `selector` finds the mark of what scrolls, as the board's listener does, or takes it off. */
const mark = (page: Page, selector: string, word: 'shown' | null): Promise<void> =>
  page
    .locator(selector)
    .evaluate((found, word) => (word ? found.setAttribute('data-scroll-bar', word) : found.removeAttribute('data-scroll-bar')), word);

/** Pictures the bottom-left corner and the right edge of the one-row framed table, as `parts-bars-corner-` and `-edge-<tail>`. */
async function framedCorners(page: Page, tail: string): Promise<void> {
  await page.locator(ONE_ROW).evaluate((frame) => frame.scrollIntoView({ block: 'center' }));
  const box = await page.locator(ONE_ROW).boundingBox();
  if (!box) throw new Error(`${ONE_ROW} is not drawn`);
  const clips = {
    corner: { x: box.x - 16, y: box.y + box.height - 56, width: 120, height: 72 },
    edge: { x: box.x + box.width - 104, y: box.y - 16, width: 120, height: box.height + 32 },
  };
  for (const [what, clip] of Object.entries(clips)) {
    const file = path.join(OUT, `parts-bars-${what}-${tail}`);
    await photograph(page, file, { always: true, clip });
    console.log(`parts: ${file}`);
  }
}

/** Pictures the box's scroll bar at rest, while it scrolls, under the pointer and held, and the narrow table's sideways bar. */
async function barStates(page: Page, tail: string): Promise<void> {
  await page.locator(SCROLLER).evaluate((box) => box.scrollIntoView({ block: 'center' }));
  await pictured(page, SCROLLER, `parts-bars-thumb-rest-${tail}`);
  await mark(page, SCROLLER, 'shown');
  await pictured(page, SCROLLER, `parts-bars-thumb-scrolling-${tail}`);
  const box = await page.locator(SCROLLER).boundingBox();
  if (!box) throw new Error(`${SCROLLER} is not drawn`);
  await page.mouse.move(box.x + box.width - 4, box.y + 20);
  await pictured(page, SCROLLER, `parts-bars-thumb-pointer-${tail}`);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 4, box.y + 40);
  await pictured(page, SCROLLER, `parts-bars-thumb-held-${tail}`);
  await page.mouse.up();
  await page.mouse.move(0, 0);
  await page.locator(NARROW).evaluate((table) => table.scrollIntoView({ block: 'center' }));
  await mark(page, `${NARROW} [data-table-box]`, 'shown');
  await pictured(page, NARROW, `parts-bars-sideways-${tail}`);
}

/** The pictures of the scroll bars, in a browser of each kind of bar, light then dark. */
async function barsPictured(dir: string): Promise<void> {
  for (const kind of ['classic', 'overlay'] as const) {
    const drawing = await launch(kind);
    try {
      for (const theme of ['light', 'dark'] as const) {
        const page = await openParts(drawing, dir, theme, '', { scale: 4, still: true });
        if (kind === 'classic') await framedCorners(page, `${kind}-${theme}.png`);
        await barStates(page, `${kind}-${theme}.png`);
        await page.context().close();
      }
    } finally {
      await drawing.close();
    }
  }
}

/** A sheet of each part's stories, as `parts-<Part>-<theme>.png`. */
async function sheets(browser: Browser, dir: string, theme: 'light' | 'dark'): Promise<void> {
  const index = await openParts(browser, dir, theme);
  const parts = await index.locator('[data-story]').evaluateAll((all) => [...new Set(all.map((one) => one.getAttribute('data-part')!))]);
  await index.context().close();
  for (const part of parts) {
    const page = await openParts(browser, dir, theme, `?part=${part}`);
    await page.locator('main').evaluate((main) => ((main as HTMLElement).style.minHeight = '0'));
    await page.setViewportSize({ width: 1280, height: 200 });
    const file = path.join(OUT, `parts-${part}-${theme}.png`);
    await photograph(page, file, { fullPage: true, always: true });
    console.log(`parts: ${file}`);
    await page.context().close();
  }
}

/** The enlarged pictures of the cut, its button, the rail, a page's name, a title and an id, in `theme`. */
async function closeUps(browser: Browser, dir: string, theme: 'light' | 'dark'): Promise<void> {
  const page = await openParts(browser, dir, theme);
  await enlarged(page, `${story('look-cutframe--on-the-page')} [data-ground="plain"]`, 4, `parts-cut-corner-${theme}.png`);
  await enlarged(page, BUTTON_GROUND, 6, `parts-cut-button-${theme}.png`);
  await tabInto(page, BUTTON_GROUND);
  await enlarged(page, BUTTON_GROUND, 6, `parts-cut-button-focused-${theme}.png`);
  await atRest(page);
  await enlarged(page, PRESS_GROUND, 6, `parts-cut-press-${theme}.png`);
  await tabInto(page, PRESS_GROUND);
  await enlarged(page, PRESS_GROUND, 6, `parts-cut-press-focused-${theme}.png`);
  await atRest(page);
  await enlarged(page, DISABLED_GROUND, 6, `parts-cut-press-disabled-${theme}.png`);
  await enlarged(page, `${story('look-runsteps--done')} [data-rail]`, 4, `parts-rail-done-${theme}.png`);
  await enlarged(page, `${story('look-plate--name-of-a-page')} [data-story-ground]`, 2, `parts-page-name-${theme}.png`);
  await enlarged(page, TITLE_GROUND, 6, `parts-title-rest-${theme}.png`);
  await enlarged(page, TITLE_GROUND, 6, `parts-title-pointer-${theme}.png`, `${TITLE_GROUND} [data-plain-link]`);
  await tabInto(page, TITLE_GROUND);
  await enlarged(page, TITLE_GROUND, 6, `parts-title-focused-${theme}.png`);
  await atRest(page);
  await enlarged(page, ID_GROUND, 6, `parts-id-rest-${theme}.png`);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => {} }, configurable: true }));
  await page.locator(`${ID_GROUND} button`).click();
  await page.locator(`${ID_GROUND} [data-copied]`).waitFor();
  await page.mouse.move(0, 0);
  await enlarged(page, ID_GROUND, 6, `parts-id-copied-${theme}.png`);
  await page.context().close();
}

/** How long Storybook's build may take. */
const STORYBOOK_MS = 5 * 60_000;

/**
 * Builds Nemia's Storybook into `out`, and says how long it took and the most memory its largest process held, as the system's
 * `time` measures them.
 */
async function buildStorybook(out: string): Promise<void> {
  const args = ['-v', process.execPath, fromNodeModules(path.join('storybook', 'dist', 'bin', 'dispatcher.js')), 'build', '-o', out];
  const child = spawn('/usr/bin/time', [...args, '--disable-telemetry'], {
    cwd: WEB,
    stdio: ['ignore', 'ignore', 'pipe'],
    timeout: STORYBOOK_MS,
  });
  let said = '';
  child.stderr.on('data', (chunk: Buffer) => (said += chunk));
  const code = await new Promise<number | null>((resolve) => child.on('exit', resolve));
  if (code !== 0) throw new Error(`Storybook did not build (exit ${code}):\n${said}`);
  const took = /Elapsed \(wall clock\) time[^\n]*: ([\d:.]+)/.exec(said)?.[1] ?? '?';
  const held = Number(/Maximum resident set size \(kbytes\): (\d+)/.exec(said)?.[1] ?? Number.NaN);
  console.log(`parts: Storybook built in ${took} (m:ss), its largest process holding ${Math.round(held / 1024)} MB at most`);
}

/** Pictures Storybook, built in `dir`, with a story of the cut button open: served from the folder for the time of the pictures. */
async function storybookPictured(browser: Browser, dir: string): Promise<void> {
  const server = http.createServer((request, response) => {
    const asked = path.join(dir, decodeURIComponent(new URL(`http://storybook${request.url ?? '/'}`).pathname));
    const file = asked.startsWith(dir) && fs.existsSync(asked) && fs.statSync(asked).isFile() ? asked : path.join(dir, 'index.html');
    response.writeHead(200, { 'content-type': typeOf(file) }).end(fs.readFileSync(file));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  try {
    for (const theme of ['light', 'dark'] as const) {
      const context = await browser.newContext({ colorScheme: theme, viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${port}/?path=/story/look-cutbutton--press`);
      await page.frameLocator('#storybook-preview-iframe').locator('[data-cut-button]').waitFor();
      const file = path.join(OUT, `storybook-${theme}.png`);
      await photograph(page, file, { always: true });
      console.log(`parts: ${file}`);
      await context.close();
    }
  } finally {
    server.close();
    server.closeAllConnections();
  }
}

const built = scratch('nemia-parts-photos-');
await buildParts(built);
fs.mkdirSync(OUT, { recursive: true });
const browser = await launch();
try {
  for (const theme of ['light', 'dark'] as const) {
    await sheets(browser, built, theme);
    await closeUps(browser, built, theme);
  }
  await barsPictured(built);
  const storybook = path.join(scratch('nemia-storybook-'), 'static');
  await buildStorybook(storybook);
  await storybookPictured(browser, storybook);
} finally {
  await browser.close();
}

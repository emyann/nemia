/**
 * Pictures the look's parts for a person who reviews them: `node test/e2e/look-photos.ts` from `apps/web` builds Nemia's Storybook
 * into a scratch folder, says what the build took and its largest process held, and opens each story alone in it
 * (`iframe.html?id=<id>`, `stories/built.ts`), in light, then in dark, writing into the e2e's folder of pictures (`OUT`, the run's
 * files where `WF_ARTIFACTS` names them) a picture of every story but a page body's (`parts-<id>-<theme>.png`); then, enlarged for a
 * person's eye, the cut button at rest and with the keyboard's focus, as a link and as a press, and disabled, six times, the corner of
 * a frame that waits on a person, four times, the rail of a run whose steps are done, a page's name over its rule, short and long, a
 * text link at rest, under the pointer and with the keyboard on it, and a short id at rest and just copied, on a clipboard that takes
 * anything. Then, in a browser that draws scroll bars, which the first hides, four times as large: in one whose bars take room, the
 * bottom-left corner and the right edge of a table in a cut frame (`parts-bars-corner-classic-<theme>.png`,
 * `parts-bars-edge-classic-<theme>.png`); and in that one and in one whose bars float, a box's scroll bar at rest, while it scrolls,
 * under the pointer and while it is held (`parts-bars-thumb-<state>-<kind>-<theme>.png`), and the sideways bar of a table narrower
 * than its columns (`parts-bars-sideways-<kind>-<theme>.png`). Last it pictures Storybook's index with a story open
 * (`storybook-<theme>.png`). No test runs it, and it asserts nothing.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Browser, Page } from 'playwright';
import { scratch } from 'test-kit/scratch';
import { photograph } from './board.ts';
import { builtIds, openStory, serveBuilt, type Look } from './stories/built.ts';
import { launch } from './visit.ts';
import { fromNodeModules, OUT, WEB } from './world.ts';

/** The ground a story draws its part on: the cut button's, as a link, as a press and disabled, and a text link's and a short id's. */
const CARD_GROUND = '[data-story-ground] > div';
const TITLE_GROUND = '[data-title-ground]';
const ID_GROUND = '[data-id-ground]';

/**
 * Pictures what `selector` finds drawn `times` as large, as `name` in the folder of pictures, and puts it back at its size. `under`
 * is what the pointer is put on once it is enlarged, since what grows moves from under a pointer placed before.
 */
async function enlarged(page: Page, selector: string, times: number, name: string, under?: string) {
  const part = page.locator(selector);
  await part.evaluate((found, zoom) => ((found as HTMLElement).style.zoom = String(zoom)), times);
  if (under) await page.locator(under).hover();
  const file = path.join(OUT, name);
  await photograph(part, file, { always: true });
  await part.evaluate((found) => ((found as HTMLElement).style.zoom = ''));
  if (under) await page.mouse.move(0, 0);
  console.log(`parts: ${file}`);
}

/** Presses Tab until what has the focus is inside what `selector` finds, from the top of the story, which is drawn alone. */
async function tabInto(page: Page, selector: string) {
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press('Tab');
    if (await page.locator(selector).evaluate((found) => found.contains(document.activeElement))) return;
  }
  throw new Error(`Tab never reached ${selector}`);
}

/** Takes the focus and the pointer off everything. */
async function atRest(page: Page) {
  await page.mouse.move(0, 0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

/** The box a story draws shorter than what it holds, and the framed tables with one row and narrower than their columns. */
const SCROLLER = '[data-scroller]';
const ONE_ROW = '[data-framed="one"] [data-cut-frame]';
const NARROW = '[data-framed="narrow"]';

/** Pictures what `selector` finds as `name` in the folder of pictures, as large as its page draws it. */
async function pictured(page: Page, selector: string, name: string) {
  const file = path.join(OUT, name);
  await photograph(page.locator(selector), file, { always: true });
  console.log(`parts: ${file}`);
}

/** Writes on what `selector` finds the mark of what scrolls, as the board's listener does, or takes it off. */
const mark = (page: Page, selector: string, word: 'shown' | null) =>
  page
    .locator(selector)
    .evaluate((found, word) => (word ? found.setAttribute('data-scroll-bar', word) : found.removeAttribute('data-scroll-bar')), word);

/** Pictures the bottom-left corner and the right edge of the one-row framed table, as `parts-bars-corner-` and `-edge-<tail>`. */
async function framedCorners(page: Page, tail: string) {
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

/** Pictures the box's scroll bar at rest, while it scrolls, under the pointer and held. */
async function barStates(page: Page, tail: string) {
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
}

/** Pictures the narrow table's sideways bar, marked as scrolling. */
async function sideways(page: Page, tail: string) {
  await page.locator(NARROW).evaluate((table) => table.scrollIntoView({ block: 'center' }));
  await mark(page, `${NARROW} [data-table-box]`, 'shown');
  await pictured(page, NARROW, `parts-bars-sideways-${tail}`);
}

/** Where the static build pictured is served. */
let at = '';

/** The story `id` opened alone in `browser`, in `theme`. */
const open = (browser: Browser, id: string, theme: 'light' | 'dark', look: Look = {}) =>
  openStory(browser, at, theme, id, look) satisfies Promise<Page>;

/** Runs `use` on the story `id` opened alone, and closes it. */
async function onStory(browser: Browser, id: string, theme: 'light' | 'dark', use: (page: Page) => Promise<void>, look: Look = {}) {
  const page = await open(browser, id, theme, look);
  try {
    await use(page);
  } finally {
    await page.context().close();
  }
}

/** The pictures of the scroll bars, in a browser of each kind of bar, light then dark. */
async function barsPictured() {
  const look = { scale: 4, still: true };
  for (const kind of ['classic', 'overlay'] as const) {
    const drawing = await launch(kind);
    try {
      for (const theme of ['light', 'dark'] as const) {
        const tail = `${kind}-${theme}.png`;
        if (kind === 'classic') await onStory(drawing, 'look-cutframe--table-of-one-row', theme, (page) => framedCorners(page, tail), look);
        await onStory(drawing, 'look-scrollbars--marked', theme, (page) => barStates(page, tail), look);
        await onStory(drawing, 'look-cutframe--table-narrower-than-its-columns', theme, (page) => sideways(page, tail), look);
      }
    } finally {
      await drawing.close();
    }
  }
}

/** A picture of each story of `ids` but a page body's, as `parts-<id>-<theme>.png`. */
async function sheets(browser: Browser, ids: readonly string[], theme: 'light' | 'dark') {
  for (const id of ids.filter((one) => !one.startsWith('pages-'))) {
    await onStory(browser, id, theme, async (page) => {
      await page.setViewportSize({ width: 1280, height: 200 });
      const file = path.join(OUT, `parts-${id}-${theme}.png`);
      await photograph(page, file, { fullPage: true, always: true });
      console.log(`parts: ${file}`);
    });
  }
}

/** The enlarged pictures of the cut, its button, the rail, a page's name, a title and an id, in `theme`. */
async function closeUps(browser: Browser, theme: 'light' | 'dark') {
  await onStory(browser, 'look-cutframe--on-the-page', theme, (page) =>
    enlarged(page, '[data-ground="plain"]', 4, `parts-cut-corner-${theme}.png`),
  );
  for (const [id, name] of [
    ['look-cutbutton--link', 'button'],
    ['look-cutbutton--press', 'press'],
  ] as const)
    await onStory(browser, id, theme, async (page) => {
      await enlarged(page, CARD_GROUND, 6, `parts-cut-${name}-${theme}.png`);
      await tabInto(page, CARD_GROUND);
      await enlarged(page, CARD_GROUND, 6, `parts-cut-${name}-focused-${theme}.png`);
    });
  await onStory(browser, 'look-cutbutton--disabled-press', theme, (page) =>
    enlarged(page, CARD_GROUND, 6, `parts-cut-press-disabled-${theme}.png`),
  );
  await onStory(browser, 'look-stepgraph--at-work', theme, (page) =>
    enlarged(page, '[data-run-steps]', 4, `parts-graph-at-work-${theme}.png`),
  );
  await onStory(browser, 'look-plate--name-of-a-page', theme, (page) =>
    enlarged(page, '[data-story-ground]', 2, `parts-page-name-${theme}.png`),
  );
  await onStory(browser, 'look-plate--long-name-of-a-page', theme, (page) =>
    enlarged(page, '[data-story-ground]', 2, `parts-page-name-long-${theme}.png`),
  );
  await onStory(browser, 'look-textlink--title', theme, async (page) => {
    await enlarged(page, TITLE_GROUND, 6, `parts-title-rest-${theme}.png`);
    await enlarged(page, TITLE_GROUND, 6, `parts-title-pointer-${theme}.png`, `${TITLE_GROUND} [data-plain-link]`);
    await tabInto(page, TITLE_GROUND);
    await enlarged(page, TITLE_GROUND, 6, `parts-title-focused-${theme}.png`);
    await atRest(page);
  });
  await onStory(browser, 'look-copyid--short', theme, async (page) => {
    await enlarged(page, ID_GROUND, 6, `parts-id-rest-${theme}.png`);
    // oxlint-disable-next-line landmines-testing/no-test-doubles -- the story's page has no clipboard permission
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => {} }, configurable: true }));
    await page.locator(`${ID_GROUND} button`).click();
    await page.locator(`${ID_GROUND} [data-copied]`).waitFor();
    await page.mouse.move(0, 0);
    await enlarged(page, ID_GROUND, 6, `parts-id-copied-${theme}.png`);
  });
}

/** How long Storybook's build may take. */
const STORYBOOK_MS = 5 * 60_000;

/**
 * Builds Nemia's Storybook into `out`, and says how long it took and the most memory its largest process held, as the system's
 * `time` measures them.
 */
async function buildStorybook(out: string) {
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

/** Pictures Storybook's index, served at `at`, with a story of the cut button open. */
async function storybookPictured(browser: Browser) {
  for (const theme of ['light', 'dark'] as const) {
    const context = await browser.newContext({ colorScheme: theme, viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto(`${at}/?path=/story/look-cutbutton--press`);
    await page.frameLocator('#storybook-preview-iframe').locator('[data-cut-button]').waitFor();
    const file = path.join(OUT, `storybook-${theme}.png`);
    await photograph(page, file, { always: true });
    console.log(`parts: ${file}`);
    await context.close();
  }
}

const storybook = path.join(scratch('nemia-storybook-'), 'static');
await buildStorybook(storybook);
const served = await serveBuilt(storybook);
at = served.at;
fs.mkdirSync(OUT, { recursive: true });
const browser = await launch();
try {
  for (const theme of ['light', 'dark'] as const) {
    await sheets(browser, builtIds(storybook), theme);
    await closeUps(browser, theme);
  }
  await barsPictured();
  await storybookPictured(browser);
} finally {
  await browser.close();
  served.close();
}

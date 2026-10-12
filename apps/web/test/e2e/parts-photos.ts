/**
 * Pictures the board's parts no page mounts yet, for a person who reviews them: `node test/e2e/parts-photos.ts` from `apps/web` builds
 * the gallery (`parts/main.tsx`), opens it in light, then in dark, and writes `parts-light.png` and `parts-dark.png` into the e2e's
 * folder of pictures (`OUT`, the run's files where `WF_ARTIFACTS` names them); then, enlarged for a person's eye, the cut button at
 * rest and with the keyboard's focus, six times, the corner of a frame that waits on a person, four times, the rail of a run whose
 * steps are done, a page's name over its rule, a text link at rest, under the pointer and with the keyboard on it, and a short id at
 * rest and just copied, on a clipboard that takes anything. Then, in a browser that draws scroll bars, which the first hides, four
 * times as large: in one whose bars take room, the bottom-left corner and the right edge of a table in a cut frame
 * (`parts-bars-corner-classic-<theme>.png`, `parts-bars-edge-classic-<theme>.png`); and in that one and in one whose bars float, a
 * box's scroll bar at rest, while it scrolls, under the pointer and while it is held (`parts-bars-thumb-<state>-<kind>-<theme>.png`),
 * and the sideways bar of a table narrower than its columns (`parts-bars-sideways-<kind>-<theme>.png`). No test runs it, and it
 * asserts nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { scratch } from '../scratch.ts';
import { photograph } from './board.ts';
import { buildParts, openParts } from './parts/gallery.ts';
import { launch } from './visit.ts';
import { OUT } from './world.ts';

/** The ground the gallery draws its cut button on. */
const BUTTON_GROUND = '[data-part="ring"] > div:last-child';

/** The ground the gallery draws its text link on. */
const TITLE_GROUND = '[data-part="text-link"] > div';

/** Pictures what `selector` finds drawn `times` as large, as `name` in the folder of pictures, and puts it back at its size. */
async function enlarged(page: Page, selector: string, times: number, name: string): Promise<void> {
  const part = page.locator(selector);
  await part.evaluate((found, zoom) => ((found as HTMLElement).style.zoom = String(zoom)), times);
  const file = path.join(OUT, name);
  await photograph(part, file, { always: true });
  await part.evaluate((found) => ((found as HTMLElement).style.zoom = ''));
  console.log(`parts: ${file}`);
}

/** The box the gallery draws shorter than what it holds, and its framed tables with one row and narrower than their columns. */
const SCROLLER = '[data-part="scrollers"] [data-scroller]';
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

const built = scratch('nemia-parts-photos-');
await buildParts(built);
fs.mkdirSync(OUT, { recursive: true });
const browser = await launch();
try {
  for (const theme of ['light', 'dark'] as const) {
    const page = await openParts(browser, built, theme);
    const file = path.join(OUT, `parts-${theme}.png`);
    await photograph(page, file, { fullPage: true, always: true });
    console.log(`parts: ${file}`);
    await enlarged(page, '[data-part="cut"] [data-ground="plain"]', 4, `parts-cut-corner-${theme}.png`);
    await enlarged(page, BUTTON_GROUND, 6, `parts-cut-button-${theme}.png`);
    for (
      let i = 0;
      i < 40 && !(await page.evaluate(() => 'cutButton' in ((document.activeElement as HTMLElement | null)?.dataset ?? {})));
      i += 1
    )
      await page.keyboard.press('Tab');
    await enlarged(page, BUTTON_GROUND, 6, `parts-cut-button-focused-${theme}.png`);
    await page.mouse.move(0, 0);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await enlarged(page, '[data-part="rail"] > div', 4, `parts-rail-done-${theme}.png`);
    await enlarged(page, '[data-part="page-name"]', 2, `parts-page-name-${theme}.png`);
    await enlarged(page, TITLE_GROUND, 6, `parts-title-rest-${theme}.png`);
    await page.locator('[data-plain-link]').hover();
    await enlarged(page, TITLE_GROUND, 6, `parts-title-pointer-${theme}.png`);
    await page.mouse.move(0, 0);
    await page.locator('[data-plain-link]').focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await enlarged(page, TITLE_GROUND, 6, `parts-title-focused-${theme}.png`);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await enlarged(page, '[data-part="copy-id"] > div', 6, `parts-id-rest-${theme}.png`);
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => {} }, configurable: true }));
    await page.locator('[data-part="copy-id"] button').first().click();
    await page.locator('[data-part="copy-id"] [data-copied]').waitFor();
    await page.mouse.move(0, 0);
    await enlarged(page, '[data-part="copy-id"] > div', 6, `parts-id-copied-${theme}.png`);
    await page.context().close();
  }
} finally {
  await browser.close();
}
await barsPictured(built);

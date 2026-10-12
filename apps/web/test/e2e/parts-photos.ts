/**
 * Pictures the board's parts no page mounts yet, for a person who reviews them: `node test/e2e/parts-photos.ts` from `apps/web` builds
 * the gallery (`parts/main.tsx`), opens it in light, then in dark, and writes `parts-light.png` and `parts-dark.png` into the e2e's
 * folder of pictures (`OUT`, the run's files where `WF_ARTIFACTS` names them); then, enlarged for a person's eye, the cut button at
 * rest and with the keyboard's focus, six times, and the corner of a frame that waits on a person, four times. No test runs it, and
 * it asserts nothing.
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

/** Pictures what `selector` finds drawn `times` as large, as `name` in the folder of pictures, and puts it back at its size. */
async function enlarged(page: Page, selector: string, times: number, name: string): Promise<void> {
  const part = page.locator(selector);
  await part.evaluate((found, zoom) => ((found as HTMLElement).style.zoom = String(zoom)), times);
  const file = path.join(OUT, name);
  await photograph(part, file, { always: true });
  await part.evaluate((found) => ((found as HTMLElement).style.zoom = ''));
  console.log(`parts: ${file}`);
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
    await page.context().close();
  }
} finally {
  await browser.close();
}

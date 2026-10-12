/**
 * Pictures the board's parts no page mounts yet, for a person who reviews them: `node test/e2e/parts-photos.ts` from `apps/web` builds
 * the gallery (`parts/main.tsx`), opens it in light, then in dark, and writes `parts-light.png` and `parts-dark.png` into the e2e's
 * folder of pictures (`OUT`, the run's files where `WF_ARTIFACTS` names them). No test runs it, and it asserts nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../scratch.ts';
import { photograph } from './board.ts';
import { buildParts, openParts } from './parts/gallery.ts';
import { launch } from './visit.ts';
import { OUT } from './world.ts';

const built = scratch('nemia-parts-photos-');
await buildParts(built);
fs.mkdirSync(OUT, { recursive: true });
const browser = await launch();
try {
  for (const theme of ['light', 'dark'] as const) {
    const page = await openParts(browser, built, theme);
    const file = path.join(OUT, `parts-${theme}.png`);
    await photograph(page, file, { fullPage: true, always: true });
    await page.context().close();
    console.log(`parts: ${file}`);
  }
} finally {
  await browser.close();
}

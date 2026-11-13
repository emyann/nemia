import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { fed, LEDGER, partOf, photograph, themeOf } from '../board.ts';
import { expectCount, expectDrawn, expectVisible, idle, Refused, settled } from '../checks.ts';
import { SHAPED, writeShaped } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The sheet, open on `step`'s file `file`. */
const sheetOn = (page: Page, step: string, file: string): Locator => page.locator(`[data-viewer-sheet="${step}/${file}"]`);

/** Refuses unless the address names `step`'s file `file` as the one viewed (`?view=`). */
function viewing(page: Page, step: string, file: string): void {
  const view = new URL(page.url()).searchParams.get('view');
  if (view !== `${step}/${file}`) throw new Refused(`the address names ${step}/${file} as the file viewed — it says view=${view}`);
}

export default {
  /**
   * A file a step gave opens in the viewer's sheet, a place of the address: SHAPED's `build` named a picture and a markdown note and left a
   * JSON and a log in its artifacts folder. Its picture's thumbnail, pressed, sets `?view=build/<path>` and the sheet draws the picture;
   * Next goes to the step's next file, in the order the sheet steps through them (the named, then the folder's), each drawn by its kind —
   * the note as markdown, the JSON as JSON, the log as text — the address following; and Back closes the sheet, its key gone from the
   * address. SHAPED is written for the visit and taken back.
   */
  name: 'viewer-sheet',
  route: '/runs',
  expect: async (page) => {
    const written = writeShaped(store!);
    const { id, step } = SHAPED;
    const files = path.join(store!, 'runs', id, 'artifacts', step);
    const at = (name: string) => path.join(files, name);
    try {
      await page.goto(new URL(`/runs/${id}`, page.url()).href, { waitUntil: 'load' });
      await idle(page);
      const gave = partOf(page.locator(LEDGER), step).locator('[data-part-gave="L"]');
      const thumb = gave.locator(`a[data-opens-view="${at(SHAPED.named.picture)}"]`);
      await expectVisible(thumb.locator('img'), `${step}'s picture is drawn in its Gave as a thumbnail`);
      await thumb.click();
      const picture = sheetOn(page, step, at(SHAPED.named.picture));
      await expectVisible(picture, 'the thumbnail opens the sheet on its picture');
      viewing(page, step, at(SHAPED.named.picture));
      await expectDrawn(picture.locator('img[data-viewer="picture"]'), 'and the sheet draws the picture');
      await settled(page);
      await photograph(page, path.join(OUT, `viewer-sheet-picture-${await themeOf(page)}.png`));

      const kinds: Array<[string, string, string]> = [
        [SHAPED.named.markdown, 'markdown', 'Notes'],
        [SHAPED.unnamed.json, 'json', 'widgets'],
        [SHAPED.unnamed.log, 'text', 'built the widgets'],
      ];
      for (const [name, viewer, says] of kinds) {
        await page.locator('[data-viewer-sheet] a[data-viewer-step="next"]').click();
        const sheet = sheetOn(page, step, at(name));
        await expectVisible(sheet, `Next goes to ${name}, the step's next file`);
        viewing(page, step, at(name));
        await expectVisible(sheet.locator(`[data-viewer="${viewer}"]`, { hasText: says }), `${name} is drawn as ${viewer}`);
        await settled(page);
        await photograph(page, path.join(OUT, `viewer-sheet-${viewer}-${await themeOf(page)}.png`));
      }
      await page.goBack();
      await expectCount(page.locator('[data-viewer-sheet]'), 0, 'Back closes the sheet');
      if (new URL(page.url()).searchParams.has('view')) throw new Refused(`closed, the address names no file — it is ${page.url()}`);
    } finally {
      await page.goto(new URL('/runs', page.url()).href, { waitUntil: 'load' });
      await idle(page);
      for (const file of written) fs.rmSync(file, { recursive: true, force: true });
      fed(id, 'removed');
    }
  },
} satisfies PageSpec;

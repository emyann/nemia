import path from 'node:path';
import type { Page } from 'playwright';
import { photograph, stepBar, themeOf } from '../board.ts';
import { cardOf, expectClearOfEachOther } from '../canvas.ts';
import { expectInside, expectNone, expectVisible, settled } from '../checks.ts';
import { ENDING } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The window every page is visited in, which this page narrows and gives back. */
const WIDE = { width: 1280, height: 800 };

/**
 * A window so narrow the header over the floor wraps word by word and leaves the floor no height: what a full-page screenshot lays the
 * page out in for a moment, before it gives the window back.
 */
const BLINK = { width: 100, height: 160 };

/** The floor's frame. */
const floorOf = (page: Page) => page.locator('.react-flow').first();

/** The frame's side sheet, docked at the right of the frame's row. */
const sheetOf = (page: Page) => page.locator('[data-frame-sheet]');

export default {
  /**
   * The Factory keeps the run a person inspected in view when the floor's frame changes size, down as well as across, and aims no view at
   * a frame without one. Twice, with ENDING's card open and its ending's step in the frame's side sheet: the floor loses its height for a
   * moment and gets it back, as a full-page screenshot lays the page out, then the bar is closed; and the floor narrows beside the docked
   * sheet, ending where the sheet begins, then the bar is closed. Each time the card's head, with its Hide steps button, is inside the
   * floor, clear of the queue lane and the header over it, and Hide steps closes the card. The window is given back and the floor laid
   * out again, as each page after it reads them.
   */
  name: 'factory-frame',
  route: '/factories/default',
  expect: async (page) => {
    const { id, ending } = ENDING;
    const card = cardOf(page, id);
    const tile = card.locator(`[data-tile="${ending}"]`);
    const inspector = stepBar(page, id, ending);
    const hide = card.getByRole('button', { name: 'Hide steps' });

    const inspectThenClose = async (when: string, squeeze: () => Promise<void>) => {
      await card.getByRole('button', { name: 'Show steps' }).click();
      await expectVisible(tile, `${when}: the card opens into its steps, ${ending} among them`);
      await settled(page);
      await tile.click();
      await expectVisible(inspector, `${when}: ${ending}'s bar opens`);
      await squeeze();
      await settled(page);
      await inspector.getByRole('button', { name: 'Close', exact: true }).click();
      await expectVisible(page.locator('aside[aria-label="Queued cards"]'), `${when}: the queue lane is beside the floor`);
      await settled(page);
      await expectInside(
        hide,
        floorOf(page),
        `${when}: the run inspected shows its head in the floor once the bar closes, clear of what is drawn over it`,
      );
      await photograph(page, path.join(OUT, `factory-frame-${when}-${await themeOf(page)}.png`), { fullPage: true });
      await hide.click();
      await expectVisible(card.getByRole('button', { name: 'Show steps' }), `${when}: Hide steps closes the card`);
    };

    await page.getByRole('button', { name: 'Reset layout' }).click();
    await settled(page);
    await inspectThenClose('blink', async () => {
      await page.setViewportSize(BLINK);
      await page.waitForFunction(() => (document.querySelector('.react-flow')?.clientHeight ?? 0) === 0);
      await page.setViewportSize(WIDE);
    });

    await page.getByRole('button', { name: 'Reset layout' }).click();
    await settled(page);
    await inspectThenClose('beside', () =>
      expectNone(async () => {
        const floor = await floorOf(page).boundingBox();
        const sheet = await sheetOf(page).boundingBox();
        if (!floor || !sheet) return 'the floor and the sheet are not both drawn';
        return floor.x + floor.width > sheet.x + 1 ? `it ends at ${floor.x + floor.width}, the sheet begins at ${sheet.x}` : null;
      }, 'the floor narrows beside the sheet, ending where it begins'),
    );

    await page.setViewportSize(WIDE);
    await page.getByRole('button', { name: 'Reset layout' }).click();
    await settled(page);
    await expectClearOfEachOther(page);
  },
} satisfies PageSpec;

import path from 'node:path';
import type { Page } from 'playwright';
import { photograph, stepBar, themeOf } from '../board.ts';
import { BAR_KEY } from '../../../src/lib/bar.ts';
import { cardOf, expectClearOfEachOther } from '../canvas.ts';
import { expectInside, expectVisible, Refused, settled } from '../checks.ts';
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

/** How wide the floor is drawn: 0 once the bar at its widest covers it whole. */
const widthOf = async (page: Page) => (await floorOf(page).boundingBox())?.width ?? 0;

/** How wide a strip of the floor the bar leaves in view, in pixels, once its edge is dragged there. */
const STRIP = 40;

/** Drags the bar's edge to `x`, as a person does, and waits for the floor to settle. */
async function dragEdgeTo(page: Page, x: number): Promise<void> {
  const edge = await page.getByRole('separator', { name: 'Resize the bar' }).boundingBox();
  if (!edge) throw new Refused("the bar's edge is not drawn");
  const y = edge.y + edge.height / 2;
  await page.mouse.move(edge.x + edge.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 12 });
  await page.mouse.up();
  await settled(page);
}

export default {
  /**
   * The Factory keeps the run a person inspected in view when the floor's frame changes size, down as well as across, and aims no view at
   * a frame without one. Three times, with ENDING's card open and its ending's step in the bar: the floor loses its height for a moment
   * and gets it back, as a full-page screenshot lays the page out, then the bar is closed; the bar's edge is dragged to its widest, until
   * the bar covers the floor whole and squeezes its frame flat across, then the bar is closed; and the edge is dragged until the bar leaves
   * the floor a strip, then is closed. Each time the card's head, with its Hide steps button, is inside the floor, clear of the queue
   * lane and the header over it, and Hide steps closes the card. The window and the bar's width are given back and the floor laid out
   * again, as each page after it reads them.
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
    await inspectThenClose('squeezed', async () => {
      await dragEdgeTo(page, 0);
      const width = await widthOf(page);
      if (width > 1) throw new Refused(`the bar at its widest covers the floor whole and squeezes it flat — it leaves ${width} px`);
    });

    await page.getByRole('button', { name: 'Reset layout' }).click();
    await settled(page);
    await inspectThenClose('strip', async () => {
      const floor = await floorOf(page).boundingBox();
      await dragEdgeTo(page, (floor?.x ?? 0) + STRIP);
      const width = await widthOf(page);
      if (!width || width > 2 * STRIP) throw new Refused(`the bar leaves the floor a strip, ${STRIP} px or so — it leaves ${width}`);
    });
    await page.evaluate((key) => localStorage.removeItem(key), BAR_KEY);

    await page.setViewportSize(WIDE);
    await page.getByRole('button', { name: 'Reset layout' }).click();
    await settled(page);
    await expectClearOfEachOther(page);
  },
} satisfies PageSpec;

import path from 'node:path';
import type { Page } from 'playwright';
import { photograph, themeOf } from '../board.ts';
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
const BLINK = { width: 320, height: 480 };

/** A window too short for the floor and a step's inspector under it: opening one squeezes the floor to nothing (`squeezed`), or nearly. */
const SHORT = { width: 700, height: 480 };

/** A window short enough that the inspector leaves the floor a strip, a few pixels tall, over it. */
const STRIP = { width: 700, height: 560 };

/** The floor's frame. */
const floorOf = (page: Page) => page.locator('.react-flow').first();

/** How tall the floor is drawn: 0 once the inspector squeezes it flat. */
const heightOf = async (page: Page) => (await floorOf(page).boundingBox())?.height ?? 0;

export default {
  /**
   * The Factory keeps the run a person inspected in view when the floor's frame changes size, down as well as across, and aims no view at
   * a frame without one. Three times, with ENDING's card open and its ending's inspector open: the floor loses its height for a moment
   * and gets it back, as a full-page screenshot lays the page out, then the inspector is closed; the window is narrowed and shortened
   * until the inspector squeezes the floor flat, then the inspector is closed; and, in a short window from the start, the inspector
   * leaves the floor a strip, then is closed. Each time the card's head, with its Hide steps button, is inside the floor, clear of the
   * queue lane and the header over it, and Hide steps closes the card. The window is given back and the floor laid out again, as each
   * page after it reads it.
   */
  name: 'factory-frame',
  route: '/factories/default',
  expect: async (page) => {
    const { id, ending } = ENDING;
    const card = cardOf(page, id);
    const tile = card.locator(`[data-tile="${ending}"]`);
    const inspector = page.locator(`aside[aria-label="Step ${ending}"]`);
    const hide = card.getByRole('button', { name: 'Hide steps' });

    const inspectThenClose = async (when: string, squeeze: () => Promise<void>) => {
      await card.locator('time').click();
      await expectVisible(tile, `${when}: the card opens into its steps, ${ending} among them`);
      await settled(page);
      await tile.click();
      await expectVisible(inspector, `${when}: ${ending}'s inspector opens`);
      await squeeze();
      await settled(page);
      await page.getByRole('button', { name: "Close the step's panel" }).click();
      await expectVisible(page.locator('aside[aria-label="Queued cards"]'), `${when}: the queue lane is back over the floor`);
      await settled(page);
      await expectInside(
        hide,
        floorOf(page),
        `${when}: the run inspected shows its head in the floor once the inspector closes, clear of what is drawn over it`,
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
      await page.setViewportSize(SHORT);
      await page.waitForFunction(() => (document.querySelector('.react-flow')?.clientHeight ?? 0) === 0);
    });

    await page.setViewportSize(WIDE);
    await page.getByRole('button', { name: 'Reset layout' }).click();
    await settled(page);
    await page.setViewportSize(STRIP);
    await settled(page);
    await inspectThenClose('strip', async () => {
      const height = await heightOf(page);
      if (!height || height > 100) throw new Refused(`the inspector leaves the floor a strip, a few pixels tall — it leaves ${height}`);
    });

    await page.setViewportSize(WIDE);
    await page.getByRole('button', { name: 'Reset layout' }).click();
    await settled(page);
    await expectClearOfEachOther(page);
  },
} satisfies PageSpec;

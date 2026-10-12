/**
 * The standing contrast check of the Runs page, for each page of the e2e that shows a state of it: no text pair under 4.5:1 in either
 * scheme, measured against the look's ground at its densest, and a text dimmed on purpose refused.
 */
import type { Page } from 'playwright';
import { paint } from '../../src/lib/meaning.ts';
import { themeOf } from './board.ts';
import { expectNone, Refused } from './checks.ts';
import { measure, ratioOf, under } from './contrast.ts';

/**
 * How much of the hue of a session at work the look's ground holds where it is densest, in percent: a scan line, 4, over the glow's
 * corner, 7. A text is hardest to read there in both schemes, the hue being lighter than the dark ground and darker than the light one.
 */
const DENSEST = 11;

/**
 * Draws the look's ground under `page` as one colour, its densest, where `measure` reads no ground drawn as an image; answers what
 * draws it as it was.
 */
async function flattened(page: Page): Promise<() => Promise<void>> {
  const grounds = page.locator('[data-scan-lines]');
  await grounds.evaluateAll(
    (all, [hue, share]) => {
      for (const ground of all as HTMLElement[]) {
        ground.dataset.groundWas = ground.style.backgroundImage;
        const plain = getComputedStyle(ground).backgroundColor;
        ground.style.backgroundImage = 'none';
        ground.style.backgroundColor = `color-mix(in srgb, ${hue} ${share}%, ${plain})`;
      }
    },
    [paint.alive, DENSEST] as const,
  );
  return () =>
    grounds.evaluateAll((all) => {
      for (const ground of all as HTMLElement[]) {
        ground.style.backgroundImage = ground.dataset.groundWas ?? '';
        ground.style.backgroundColor = '';
        delete ground.dataset.groundWas;
      }
    });
}

/**
 * Each text pair under 4.5:1 on the Runs page as it is, said as the report says a pair, its ground flattened for the measure.
 *
 * @throws `Refused` when the page shows no text, or a text whose ground could still not be read: an unmeasured text is never passed
 */
export async function failingPairs(page: Page): Promise<string[]> {
  const restore = await flattened(page);
  try {
    const { pairs, scheme } = await measure(page.locator('[data-runs-page]'));
    const unread = pairs.filter((pair) => pair.state === 'unmeasured');
    if (unread.length || !pairs.some((pair) => pair.state === 'measured'))
      throw new Refused(
        `every text of the Runs page is measured against its ground in ${scheme} — ` +
          (unread.map((pair) => `"${pair.text}": ${pair.why ?? 'unread'}`).join('; ') || 'it shows no text'),
      );
    return pairs.filter(under).map((pair) => `${ratioOf(pair)}:1 "${pair.text}" (${pair.classes}) in ${scheme}`);
  } finally {
    await restore();
  }
}

/**
 * No text pair of the Runs page `page` shows is under 4.5:1, in the scheme the visit is in and in the other, the browser's preference
 * turned and put back, each once the colours have made their turn; and the measure sees a pair that is: each of `dimmed`, a selector
 * of a text the page shows, dimmed on purpose, fails it, in each scheme.
 */
export async function contrastHolds(page: Page, dimmed: readonly string[]): Promise<void> {
  const scheme = (await themeOf(page)) as 'light' | 'dark';
  const other = scheme === 'dark' ? 'light' : 'dark';
  for (const turned of [other, scheme] as const) {
    await page.emulateMedia({ colorScheme: turned });
    await expectNone(async () => ((await themeOf(page)) === turned ? null : 'the scheme has not turned'), `the page is in ${turned}`);
    await expectNone(
      async () => (await failingPairs(page)).join('; ') || null,
      `no text pair of the Runs page is under 4.5:1 in ${turned}, once its colours have turned`,
    );
    for (const text of dimmed) {
      if (!(await page.locator('[data-runs-page]').locator(text).count())) throw new Refused(`the page shows ${text}, to dim it`);
      const dim = await page.addStyleTag({ content: `[data-runs-page] ${text} { opacity: 0.4 }` });
      const low = await failingPairs(page);
      await dim.evaluate((style) => (style as HTMLStyleElement).remove());
      if (!low.length) throw new Refused(`the contrast check sees a pair under 4.5:1 in ${turned} — ${text}, dimmed on purpose, passed it`);
    }
  }
}

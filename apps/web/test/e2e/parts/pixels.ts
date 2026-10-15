/**
 * How the stories' tests read what a browser painted: the colour of a pixel in a picture, how far two colours are apart, and where
 * the whole pixels beside a part's edges are.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { Browser, Page } from 'playwright';
import { photograph } from '../board.ts';

/** A colour as a picture holds it. */
export type Rgb = [number, number, number];

/** How far two colours are apart: their widest channel's difference. */
export const apart = (a: Rgb, b: Rgb): number => Math.max(...a.map((channel, i) => Math.abs(channel - b[i])));

/** The colour of each of `points` in the picture `file`, read on a canvas in a blank page of `browser`. */
export async function coloursAt(browser: Browser, file: string, points: ReadonlyArray<readonly [number, number]>): Promise<Rgb[]> {
  const page = await browser.newPage();
  try {
    const url = `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
    return await page.evaluate(
      async ({ url, points }) => {
        const img = new Image();
        img.src = url;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        return points.map(([x, y]) => Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3)) as [number, number, number]);
      },
      { url, points },
    );
  } finally {
    await page.close();
  }
}

/** The colours of the named `points` in a picture of `page`'s window taken now into `file`, read in a page of `browser`. */
export async function coloursOf<K extends string>(
  browser: Browser,
  page: Page,
  file: string,
  points: Record<K, readonly [number, number]>,
): Promise<Record<K, Rgb>> {
  await photograph(page, file, { always: true });
  const found = await coloursAt(browser, file, Object.values<readonly [number, number]>(points));
  return Object.fromEntries(Object.keys(points).map((key, i) => [key, found[i]])) as Record<K, Rgb>;
}

/**
 * The edges of what `selector` finds, brought to the window's middle, in the window's pixels: `out`, the first whole pixels outside
 * its box on each side, and `box`, its box as measured, which a text's width leaves between two pixels.
 */
export async function edgesOf(page: Page, selector: string) {
  await page.locator(selector).evaluate((found) => found.scrollIntoView({ block: 'center' }));
  const box = await page.locator(selector).boundingBox();
  assert.ok(box, `${selector} is drawn`);
  const [left, top, right, bottom] = [box.x, box.y, box.x + box.width, box.y + box.height];
  return {
    box: { left, top, right, bottom },
    out: {
      left: Math.floor(left + 0.01) - 1,
      top: Math.floor(top + 0.01) - 1,
      right: Math.ceil(right - 0.01),
      bottom: Math.ceil(bottom - 0.01),
    },
  };
}

/**
 * The names of the `found` points painted over `ground`, each name cut at its first `:`, without repetition and in one order: a name
 * is kept when its colour is more than `apartBy` from `ground`. Sorted, so that which of two cuts a borderline pixel was first seen
 * in does not decide what the caller compares, and the set of names is what is read.
 */
export const spilledOver = (found: Record<string, Rgb>, ground: Rgb, apartBy: number): string[] =>
  [...new Set(Object.entries(found).flatMap(([where, colour]) => (apart(colour, ground) > apartBy ? [where.split(':')[0]] : [])))].sort();

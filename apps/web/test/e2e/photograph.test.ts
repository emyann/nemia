/**
 * `photograph`'s full-page picture made to refuse: a page taller than the window, framed as the board is — a header, a sidebar and a
 * column that
 * scrolls between a header and a footer, in a shell as tall as the window — is pictured with each part of the frame once, where a person
 * sees it, and every row of its content visible; the same page taken as Playwright takes the window is refused, its column's rows
 * left out, as the window's own picture shows it. A page that fits is taken without a resize.
 * `npm run e2e -- --look` runs this, and a whole `npm run e2e` first; it needs Chromium.
 */
import { afterAll, beforeAll, test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { scratch } from 'test-kit/scratch';
import { photograph } from './board.ts';

let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
});

const HEADER = 48;
const FOOTER = 32;
const SIDEBAR = 256;
const ROW = 100;
const WINDOW = { width: 1280, height: 800 };

/** A colour as the picture holds it, red, green and blue. */
type Rgb = [number, number, number];

const H: Rgb = [200, 0, 0];
const S: Rgb = [0, 200, 0];
const F: Rgb = [0, 0, 200];
/** The colour of content row `i`: each its own, none a frame part's. */
const rowColour = (i: number) => [20 + 10 * i, 100, 150] satisfies Rgb;
const css = ([r, g, b]: Rgb) => `rgb(${r},${g},${b})`;

/** The board's frame in solid colours, around `rows` content rows of `ROW` pixels each. */
const framed = (rows: number) => `<!doctype html><body style="margin:0;background:#fff">
<div style="height:100vh;display:flex;flex-direction:column;overflow:hidden">
  <header style="height:${HEADER}px;flex:none;background:${css(H)}"></header>
  <div style="display:flex;flex:1;min-height:0">
    <aside style="width:${SIDEBAR}px;flex:none;background:${css(S)}"></aside>
    <main data-frame-page style="flex:1;min-height:0;overflow-y:auto">${Array.from({ length: rows }, (_, i) => `<div style="height:${ROW}px;background:${css(rowColour(i))}"></div>`).join('')}</main>
  </div>
  <footer style="height:${FOOTER}px;flex:none;background:${css(F)}"></footer>
</div>
<script>window.resized = 0; addEventListener('resize', () => window.resized++);</script>
</body>`;

/** A 1280 × 800 page showing `framed(rows)`, scrolled down `scrollY` pixels. */
async function framedPage(rows: number, scrollY = 0) {
  const page = await (await browser.newContext({ viewport: WINDOW })).newPage();
  // oxlint-disable-next-line landmines-testing/no-test-doubles -- the runner's check needs a page, not a board
  await page.route('http://e2e.test/**', (route) => route.fulfill({ contentType: 'text/html', body: framed(rows) }));
  await page.goto('http://e2e.test/');
  await page.evaluate((y) => document.querySelector('main')?.scrollTo(0, y), scrollY);
  return page;
}

/**
 * What is wrong with the picture `file` of `framed(rows)`, a sentence each, none when the frame is drawn once where a person sees it: the
 * header in the top band alone, the footer in the bottom band alone, the sidebar at the left of every row between them, each content row
 * its own colour all the way down, and the picture as tall as the page. Read in a blank page of the same browser, on a canvas.
 */
async function wrongIn(file: string, rows: number) {
  const page = await browser.newPage();
  try {
    const url = `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
    return await page.evaluate(
      async ({ url, rows, H, S, F, colours, HEADER, FOOTER, ROW, WINDOW }) => {
        const img = new Image();
        img.src = url;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const { data } = ctx.getImageData(0, 0, img.width, img.height);
        const is = (x: number, y: number, [r, g, b]: Rgb) => {
          const at = (y * img.width + x) * 4;
          return Math.abs(data[at] - r) <= 2 && Math.abs(data[at + 1] - g) <= 2 && Math.abs(data[at + 2] - b) <= 2;
        };
        const wrong: string[] = [];
        const tall = Math.max(WINDOW, HEADER + rows * ROW + FOOTER);
        if (img.height !== tall) wrong.push(`the picture is ${img.height} px tall, the page ${tall}`);
        const footerTop = img.height - FOOTER;
        const once = (what: string, colour: Rgb, inBand: (y: number) => boolean) => {
          const out = [10, 640, 1200].flatMap((x) =>
            Array.from({ length: img.height }, (_, y) => y).filter((y) => is(x, y, colour) && !inBand(y)),
          );
          if (out.length) wrong.push(`the ${what} is drawn outside its band, from y ${Math.min(...out)} to ${Math.max(...out)}`);
        };
        once('header', H, (y) => y < HEADER);
        once('footer', F, (y) => y >= footerTop);
        const bare = Array.from({ length: footerTop - HEADER }, (_, i) => HEADER + i).filter((y) => !is(10, y, S));
        if (bare.length) wrong.push(`the sidebar is missing beside the content from y ${Math.min(...bare)} to ${Math.max(...bare)}`);
        for (let i = 0; i < rows; i++) {
          const top = HEADER + i * ROW;
          const hidden = Array.from({ length: ROW }, (_, k) => top + k).filter((y) => !is(640, y, colours[i]));
          if (hidden.length) wrong.push(`content row ${i + 1} is covered from y ${Math.min(...hidden)} to ${Math.max(...hidden)}`);
        }
        return wrong;
      },
      { url, rows, H, S, F, colours: Array.from({ length: rows }, (_, i) => rowColour(i)), HEADER, FOOTER, ROW, WINDOW: WINDOW.height },
    );
  } finally {
    await page.close();
  }
}

/** The window's size and how far it is scrolled, with how many times the page heard a resize. */
const stateOf = async (page: Page) => ({
  window: page.viewportSize(),
  scrollY: await page.evaluate(() => document.querySelector('main')?.scrollTop ?? 0),
  resized: await page.evaluate(() => (window as unknown as { resized: number }).resized),
});

test('a tall page is pictured with its frame once, where a person sees it, at the top or scrolled, and left as it was found', async () => {
  const out = scratch('nemia-photograph-');
  for (const scrollY of [0, 900]) {
    const page = await framedPage(20, scrollY);
    const file = path.join(out, `tall-${scrollY}.png`);
    await photograph(page, file, { fullPage: true, always: true });
    assert.deepEqual(await wrongIn(file, 20), [], `the picture of the page scrolled ${scrollY} px`);
    const { window, scrollY: after } = await stateOf(page);
    assert.deepEqual(window, WINDOW, 'the window is put back');
    assert.equal(after, scrollY, 'the scroll is put back');
    await page.context().close();
  }
});

test('REFUSED: a tall page taken as the window alone, the rows its column holds past it left out', async () => {
  const out = scratch('nemia-photograph-old-');
  const said: Record<number, string[]> = {};
  for (const scrollY of [0, 900]) {
    const page = await framedPage(20, scrollY);
    const file = path.join(out, `old-${scrollY}.png`);
    await photograph(page.locator('html'), file, { always: true });
    said[scrollY] = await wrongIn(file, 20);
    await page.context().close();
  }
  for (const scrollY of [0, 900]) {
    const wrong = said[scrollY] ?? [];
    assert.ok(
      wrong.some((s) => s.startsWith('the picture is')),
      `scrolled ${scrollY}, the window's own picture is refused as shorter than the page: ${wrong.join('; ')}`,
    );
    assert.ok(
      wrong.some((s) => /^content row \d+ is covered/.test(s)),
      `scrolled ${scrollY}, a content row the column holds past its window is refused as missing: ${wrong.join('; ')}`,
    );
  }
});

test('a page that fits the window is pictured as it is, with no resize', async () => {
  const out = scratch('nemia-photograph-fits-');
  const page = await framedPage(5);
  const file = path.join(out, 'fits.png');
  await photograph(page, file, { fullPage: true, always: true });
  assert.deepEqual(await wrongIn(file, 5), [], 'the picture of the page that fits');
  assert.deepEqual(await stateOf(page), { window: WINDOW, scrollY: 0, resized: 0 });
  await page.context().close();
});

test('a tall page whose picture is refused is put back all the same, its window and its scroll', async () => {
  const out = scratch('nemia-photograph-refused-');
  const page = await framedPage(20, 900);
  await assert.rejects(photograph(page, out, { fullPage: true, always: true }), 'a folder is no file to write a picture to');
  const { window, scrollY } = await stateOf(page);
  assert.deepEqual({ window, scrollY }, { window: WINDOW, scrollY: 900 });
  await page.context().close();
});

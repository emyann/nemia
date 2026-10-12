/**
 * The board's parts no page mounts yet, pressed in a browser: the gallery (`parts/main.tsx`) built as the board is and opened in dark.
 * The pager's and the text link's keyboard paths navigate once, a pager's end that leads nowhere takes no focus, and a focus ring
 * inside the cut-corner frame is drawn whole over its cut corner — refused for the same frame cut by a clip. `npm run e2e` runs this
 * first; it needs Chromium.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { scratch } from '../scratch.ts';
import { WAITED } from '../waits.ts';
import { photograph } from './board.ts';
import { expectNone } from './checks.ts';
import { buildParts, openParts } from './parts/gallery.ts';

const built = scratch('nemia-parts-');
let browser: Browser;
before(async () => {
  await buildParts(built);
  browser = await chromium.launch();
}, WAITED);
after(async () => {
  await browser?.close();
});

/** What has the focus, as its marks say it: its `data-` attributes' names, and its text. */
const focused = (page: Page): Promise<{ marks: string[]; text: string }> =>
  page.evaluate(() => {
    const at = document.activeElement as HTMLElement | null;
    return { marks: at ? Object.keys(at.dataset) : [], text: at?.textContent ?? '' };
  });

/** Every stop of the Tab key, in order, from the top of the page until it comes back to the first: each by its marks and text. */
async function tabStops(page: Page): Promise<Array<{ marks: string[]; text: string }>> {
  const stops: Array<{ marks: string[]; text: string }> = [];
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press('Tab');
    const stop = await focused(page);
    if (stops.length > 0 && stop.text === stops[0].text && stop.marks.join() === stops[0].marks.join()) return stops;
    if (stop.marks.length > 0) stops.push(stop);
  }
  throw new Error(`Tab did not come back to its first stop in 40 presses: ${JSON.stringify(stops)}`);
}

/** Presses Tab until what has the focus carries `mark`, a `data-` attribute by its camel-cased name. */
async function tabTo(page: Page, mark: string): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press('Tab');
    if ((await focused(page)).marks.includes(mark)) return;
  }
  throw new Error(`Tab never reached ${mark}`);
}

/** Counts every navigation of `page`'s own document from now on, one inside the document too: an entry pushed or replaced. */
function navigationsOf(page: Page): () => number {
  let count = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) count += 1;
  });
  return () => count;
}

/** Waits for two frames of the page: what a press started has been drawn. */
const drawn = (page: Page): Promise<void> =>
  page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));

/** Enter on what has the focus leads to `search`, by one navigation and one entry of the history. */
async function entersOnce(page: Page, navigations: () => number, search: string, what: string): Promise<void> {
  const before = { navigations: navigations(), history: await page.evaluate(() => history.length) };
  await page.keyboard.press('Enter');
  await expectNone(
    async () => (new URL(page.url()).search === search ? null : `the address is ${page.url()}`),
    `${what} leads to ${search}`,
  );
  await drawn(page);
  assert.equal(navigations() - before.navigations, 1, `${what}: Enter navigates once, never twice`);
  assert.equal((await page.evaluate(() => history.length)) - before.history, 1, `${what}: one entry more in the history`);
}

test('the pager by the keyboard: Enter on Older leads to the next page once, then Newer back to the bare address', WAITED, async () => {
  const page = await openParts(browser, built, 'dark');
  try {
    const navigations = navigationsOf(page);
    await tabTo(page, 'pagerOlder');
    await entersOnce(page, navigations, '?page=2', 'Older');
    assert.equal(await page.locator('[data-pager-at]').textContent(), 'Page 2 / 3');
    assert.equal(await page.locator('[data-pager-rows]').textContent(), 'Runs 10–18 of 25');
    await page.keyboard.press('Shift+Tab');
    assert.ok((await focused(page)).marks.includes('pagerNewer'), 'on page 2 Newer takes the focus');
    await entersOnce(page, navigations, '', 'Newer');
    assert.equal(await page.locator('[data-pager-at]').textContent(), 'Page 1 / 3');
  } finally {
    await page.context().close();
  }
});

test('REFUSED: an end of the pager that leads nowhere takes no focus, and is no link', WAITED, async () => {
  const first = await openParts(browser, built, 'dark');
  const last = await openParts(browser, built, 'dark', '?page=3');
  try {
    const stops = (await tabStops(first)).flatMap((stop) => stop.marks);
    assert.ok(stops.includes('pagerOlder'), `Tab reaches Older: ${stops.join(' ')}`);
    assert.ok(!stops.includes('pagerNewer'), 'on the first page Newer takes no focus');
    assert.equal(await first.locator('[data-pager-newer]').getAttribute('aria-disabled'), 'true');
    assert.equal(await first.locator('[data-pager-newer]').getAttribute('href'), null);
    const ends = (await tabStops(last)).flatMap((stop) => stop.marks);
    assert.ok(ends.includes('pagerNewer') && !ends.includes('pagerOlder'), `on the last page Older takes no focus: ${ends.join(' ')}`);
  } finally {
    await first.context().close();
    await last.context().close();
  }
});

test('the text link by the keyboard: Enter navigates once', WAITED, async () => {
  const page = await openParts(browser, built, 'dark');
  try {
    const navigations = navigationsOf(page);
    await tabTo(page, 'plainLink');
    await entersOnce(page, navigations, '?read=link', 'the text link');
  } finally {
    await page.context().close();
  }
});

/** A colour as a picture holds it. */
type Rgb = [number, number, number];

/** The colour of each of `points` in the picture `file`, read on a canvas in a blank page. */
async function coloursAt(file: string, points: ReadonlyArray<readonly [number, number]>): Promise<Rgb[]> {
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

/**
 * The colour of the ring drawn around what has the focus, off its computed shadow: the last one that is not transparent, the ring
 * itself where a ground-coloured offset is drawn before it.
 */
const ringOf = (page: Page): Promise<Rgb | null> =>
  page.evaluate(() => {
    const shadow = getComputedStyle(document.activeElement!).boxShadow;
    const colours = [...shadow.matchAll(/rgba?\(([^)]+)\)/g)].map((m) => m[1].split(/[\s,/]+/).map(Number));
    const solid = colours.findLast((c) => c.length === 3 || c[3] > 0);
    return solid ? (solid.slice(0, 3) as [number, number, number]) : null;
  });

/**
 * Where the ring of the focused link in the frame's cut corner is missing, a side each, none when it is drawn on all four: read in a
 * picture of the window, a pixel outside each side of the link, the top's and the right's inside the cut corner.
 */
async function ringGaps(page: Page, name: string): Promise<string[]> {
  const ring = await ringOf(page);
  assert.ok(ring, 'the focused link has a ring, by its computed shadow');
  const box = await page.locator('[data-ring-probe]').boundingBox();
  assert.ok(box, 'the link is drawn');
  const [left, top, right, bottom] = [box.x, box.y, box.x + box.width, box.y + box.height].map(Math.round);
  const sides: Record<string, readonly [number, number]> = {
    top: [right - 4, top - 1],
    right: [right, Math.round((top + bottom) / 2)],
    bottom: [Math.round((left + right) / 2), bottom],
    left: [left - 1, Math.round((top + bottom) / 2)],
  };
  const file = path.join(built, `${name}.png`);
  await photograph(page, file, { always: true });
  const found = await coloursAt(file, Object.values(sides));
  const near = (a: Rgb, b: Rgb) => a.every((channel, i) => Math.abs(channel - b[i]) <= 3);
  return Object.keys(sides).flatMap((side, i) =>
    near(found[i], ring) ? [] : [`${side}: ${found[i].join(' ')}, the ring is ${ring.join(' ')}`],
  );
}

/**
 * Where the ring of the focused cut button is missing, a side each, none when it is drawn on all four: read in a picture of the window,
 * in the middle of the ring's own band, three pixels outside each side of the button, the top's and the right's beside the top-right
 * cut corner, the bottom's and the left's beside the bottom-left one.
 */
async function buttonRingGaps(page: Page, name: string): Promise<string[]> {
  const ring = await ringOf(page);
  assert.ok(ring, 'the focused button has a ring, by its computed shadow');
  const box = await page.locator('[data-part="ring"] [data-cut-button]').boundingBox();
  assert.ok(box, 'the button is drawn');
  const [left, top, right, bottom] = [box.x, box.y, box.x + box.width, box.y + box.height].map(Math.round);
  const sides: Record<string, readonly [number, number]> = {
    top: [right - 4, top - 3],
    right: [right + 2, top + 4],
    bottom: [left + 4, bottom + 2],
    left: [left - 3, bottom - 4],
  };
  const file = path.join(built, `${name}.png`);
  await photograph(page, file, { always: true });
  const found = await coloursAt(file, Object.values(sides));
  const near = (a: Rgb, b: Rgb) => a.every((channel, i) => Math.abs(channel - b[i]) <= 3);
  return Object.keys(sides).flatMap((side, i) =>
    near(found[i], ring) ? [] : [`${side}: ${found[i].join(' ')}, the ring is ${ring.join(' ')}`],
  );
}

/** The cut button as a clip would cut it: its two corners, and with them whatever is drawn outside its box. */
const CLIPPED_BUTTON = `[data-part="ring"] [data-cut-button] {
  clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px));
}`;

test(
  'REFUSED: the cut button keeps its focus ring whole beside both cut corners, and a button cut by a clip loses it',
  WAITED,
  async () => {
    const page = await openParts(browser, built, 'dark');
    try {
      await tabTo(page, 'cutButton');
      const button = page.locator('[data-part="ring"] [data-cut-button]');
      assert.equal(await button.locator('[data-cut-corner]').count(), 2, 'its two corners are cut by overlays');
      const cut = await button.evaluate((link) => [getComputedStyle(link).clipPath, getComputedStyle(link).overflow]);
      assert.deepEqual(cut, ['none', 'visible'], 'and nothing of it clips');
      assert.deepEqual(await buttonRingGaps(page, 'button-ring-whole'), [], 'the ring is whole on its four sides');
      await page.addStyleTag({ content: CLIPPED_BUTTON });
      const gaps = (await buttonRingGaps(page, 'button-ring-clipped')).map((gap) => gap.split(':')[0]);
      assert.deepEqual(gaps, ['top', 'right', 'bottom', 'left'], 'cut by a clip, the ring is lost: the check sees it');
    } finally {
      await page.context().close();
    }
  },
);

/** The frame as the look's source cut it: by a clip, which cuts off whatever it holds too. */
const CLIPPED = `[data-part="ring"] [data-cut-frame] {
  clip-path: polygon(0 0, calc(100% - 28px) 0, 100% 28px, 100% 100%, 28px 100%, 0 calc(100% - 28px));
}`;

test(
  'REFUSED: a focus ring inside the cut-corner frame is drawn whole over its cut corner, and a frame cut by a clip loses it',
  WAITED,
  async () => {
    const page = await openParts(browser, built, 'dark');
    try {
      await tabTo(page, 'ringProbe');
      const corner = page.locator('[data-part="ring"] [data-cut-frame] > [data-cut-corner="top-right"]');
      const [link, cut] = [await page.locator('[data-ring-probe]').boundingBox(), await corner.boundingBox()];
      assert.ok(link && cut);
      assert.ok(link.x + link.width > cut.x && link.y < cut.y + cut.height, 'the link stands in the cut corner');
      assert.deepEqual(await ringGaps(page, 'ring-whole'), [], 'the ring is whole, the corner cut by overlays');
      await page.addStyleTag({ content: CLIPPED });
      const gaps = (await ringGaps(page, 'ring-clipped')).map((gap) => gap.split(':')[0]);
      assert.deepEqual(gaps, ['top', 'right'], 'cut by a clip, the ring is lost in the corner: the check sees it');
    } finally {
      await page.context().close();
    }
  },
);

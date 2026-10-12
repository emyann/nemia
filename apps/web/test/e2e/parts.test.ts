/**
 * The board's parts no page mounts yet, pressed in a browser: the gallery (`parts/main.tsx`) built as the board is and opened in dark.
 * The pager's and the text link's keyboard paths navigate once, a pager's end that leads nowhere takes no focus, and a focus ring
 * inside the cut-corner frame is drawn whole over its cut corner — refused for the same frame cut by a clip; the cut button's shape
 * and its ring, and a frame's cut corner and its glow, are each read in a picture, pixel by pixel. `npm run e2e` runs this first; it
 * needs Chromium.
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
    const solid = colours.filter((c) => c.length === 3 || c[3] > 0).at(-1);
    return solid ? (solid.slice(0, 3) as [number, number, number]) : null;
  });

/**
 * Where the ring of the focused link in the frame's cut corner is missing, a side each, none when it is drawn on all four: read in a
 * picture of the window, in the band the kit's ring draws four pixels outside each side of the link, the top's and the right's inside the
 * cut corner.
 */
async function ringGaps(page: Page, name: string): Promise<string[]> {
  const ring = await ringOf(page);
  assert.ok(ring, 'the focused link has a ring, by its computed shadow');
  const box = await page.locator('[data-ring-probe]').boundingBox();
  assert.ok(box, 'the link is drawn');
  const [left, top, right, bottom] = [box.x, box.y, box.x + box.width, box.y + box.height].map(Math.round);
  const sides: Record<string, readonly [number, number]> = {
    top: [right - 4, top - 4],
    right: [right + 3, Math.round((top + bottom) / 2)],
    bottom: [Math.round((left + right) / 2), bottom + 3],
    left: [left - 4, Math.round((top + bottom) / 2)],
  };
  const file = path.join(built, `${name}.png`);
  await photograph(page, file, { always: true });
  const found = await coloursAt(file, Object.values(sides));
  const near = (a: Rgb, b: Rgb) => a.every((channel, i) => Math.abs(channel - b[i]) <= 3);
  return Object.keys(sides).flatMap((side, i) =>
    near(found[i], ring) ? [] : [`${side}: ${found[i].join(' ')}, the ring is ${ring.join(' ')}`],
  );
}

/** The cut button the gallery draws on a card's ground. */
const BUTTON = '[data-part="ring"] [data-cut-button]';

/** How far two colours are apart: their widest channel's difference. */
const apart = (a: Rgb, b: Rgb): number => Math.max(...a.map((channel, i) => Math.abs(channel - b[i])));

/**
 * The edges of what `selector` finds, brought to the window's middle, in the window's pixels: `out`, the first whole pixels outside
 * its box on each side, and `box`, its box as measured, which a text's width leaves between two pixels.
 */
async function edgesOf(page: Page, selector: string) {
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

/** The colours of the named `points` in a picture of the window taken now, as `name`. */
async function coloursOf<K extends string>(
  page: Page,
  name: string,
  points: Record<K, readonly [number, number]>,
): Promise<Record<K, Rgb>> {
  const file = path.join(built, `${name}.png`);
  await photograph(page, file, { always: true });
  const found = await coloursAt(file, Object.values<readonly [number, number]>(points));
  return Object.fromEntries(Object.keys(points).map((key, i) => [key, found[i]])) as Record<K, Rgb>;
}

/**
 * Where the cut button paints what it must not, none when its shape is exact: a pixel outside its box beside each cut, which must
 * be the ground it sits on, and inside each cut corner, which must be too; and its fill, which must not be.
 */
async function buttonSpills(page: Page, name: string): Promise<string[]> {
  const { box, out } = await edgesOf(page, BUTTON);
  assert.ok(
    [box.left, box.top].every((edge) => Math.abs(edge - Math.round(edge)) < 0.02),
    `the gallery lays the button on whole pixels, where a pixel beside it is its neighbour: ${box.left}, ${box.top}`,
  );
  const points = {
    ground: [out.left - 7, out.top - 7],
    fill: [out.left + 5, out.top + 5],
    'above the top-right cut': [out.right - 7, out.top],
    'right of the top-right cut': [out.right, out.top + 7],
    'below the bottom-left cut': [out.left + 7, out.bottom],
    'left of the bottom-left cut': [out.left, out.bottom - 7],
    'in the top-right cut': [out.right - 3, out.top + 2],
    'in the bottom-left cut': [out.left + 3, out.bottom - 2],
  } as const;
  const { ground, fill, ...found } = await coloursOf(page, name, points);
  assert.ok(apart(fill, ground) > 40, `the button's fill is read apart from its ground: ${fill.join(' ')} on ${ground.join(' ')}`);
  return Object.entries(found).flatMap(([where, colour]) => (apart(colour, ground) <= 3 ? [] : [where]));
}

/**
 * The cut button as its corners were laid out past it: its shape square and grown two pixels past its box, whose width a text leaves
 * between two pixels, so that a whole pixel is painted on every side.
 */
const SPILLED = `${BUTTON} [data-cut-shape] { clip-path: none !important; box-shadow: 0 0 0 2px var(--meaning-yours); }`;

test(
  'REFUSED: the cut button paints its cut shape exactly inside its box, and a shape that reaches a pixel past it is seen',
  WAITED,
  async () => {
    const page = await openParts(browser, built, 'dark');
    try {
      assert.equal(await page.locator(`${BUTTON} [data-cut-corner]`).count(), 0, 'no corner is laid over it');
      assert.deepEqual(await buttonSpills(page, 'button-exact'), [], 'nothing of it is painted outside its box, nor in a cut corner');
      await page.addStyleTag({ content: SPILLED });
      assert.deepEqual(
        await buttonSpills(page, 'button-spilled'),
        [
          'above the top-right cut',
          'right of the top-right cut',
          'below the bottom-left cut',
          'left of the bottom-left cut',
          'in the top-right cut',
          'in the bottom-left cut',
        ],
        'grown past its box and square, it spills on every side: the check sees it',
      );
    } finally {
      await page.context().close();
    }
  },
);

/**
 * What is wrong with the focused cut button's ring, nothing when it follows the button's shape whole: `missing`, where along the
 * shape's outline the ring's band, three pixels out, is not drawn (three places a straight side, three a cut); and `square`, the
 * box's corners a rectangular ring would turn and the shape's does not, where the ring is drawn.
 */
async function buttonRing(page: Page, name: string): Promise<{ missing: string[]; square: string[] }> {
  const { box, out } = await edgesOf(page, BUTTON);
  const [midX, midY] = [Math.round((box.left + box.right) / 2), Math.round((box.top + box.bottom) / 2)];
  const [ringTop, ringLeft, ringRight, ringBottom] = [out.top - 2, out.left - 2, out.right + 2, out.bottom + 2];
  const off = 3 / Math.SQRT2;
  const along = [0.25, 0.5, 0.75].map((t) => 12 * t);
  const outline: Record<string, readonly [number, number]> = {
    'top, at its left': [out.left + 3, ringTop],
    'top, in its middle': [midX, ringTop],
    'top, before the cut': [out.right - 17, ringTop],
    'right, after the cut': [ringRight, out.top + 17],
    'right, in its middle': [ringRight, Math.max(midY, out.top + 17)],
    'right, at its foot': [ringRight, out.bottom - 3],
    'bottom, at its right': [out.right - 3, ringBottom],
    'bottom, in its middle': [midX, ringBottom],
    'bottom, before the cut': [out.left + 17, ringBottom],
    'left, after the cut': [ringLeft, out.bottom - 17],
    'left, in its middle': [ringLeft, Math.min(midY, out.bottom - 17)],
    'left, at its head': [ringLeft, out.top + 3],
    ...Object.fromEntries(
      along.flatMap((d, i) => [
        [`the top-right cut, ${i + 1} of 3`, [Math.floor(box.right - 12 + d + off), Math.floor(box.top + d - off)]],
        [`the bottom-left cut, ${i + 1} of 3`, [Math.floor(box.left + d - off), Math.floor(box.bottom - 12 + d + off)]],
      ]),
    ),
  };
  const corners: Record<string, readonly [number, number]> = {
    'the top-right corner': [ringRight, ringTop],
    'the bottom-left corner': [ringLeft, ringBottom],
  };
  const points: Record<string, readonly [number, number]> = { ground: [out.left - 9, out.top - 9], ...outline, ...corners };
  const found = await coloursOf(page, name, points);
  const { ground } = found;
  const ring = found['top, in its middle'];
  const ringed = (where: string) => apart(ring, ground) > 40 && apart(found[where], ring) < apart(found[where], ground);
  return { missing: Object.keys(outline).filter((where) => !ringed(where)), square: Object.keys(corners).filter(ringed) };
}

/** The cut button's ring as a rectangle around its box: the ring every other button has. */
const SQUARE_RING = `${BUTTON} [data-cut-ring] { clip-path: none !important; }`;

/** The cut button as a clip on the link itself would cut it: its two corners, and with them whatever is drawn outside its box. */
const CLIPPED_BUTTON = `${BUTTON} {
  clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px));
}`;

test(
  "REFUSED: the cut button's focus ring follows its shape whole, both cuts too; a rectangular ring and a ring cut off are each seen",
  WAITED,
  async () => {
    const page = await openParts(browser, built, 'dark');
    try {
      assert.equal(await page.locator(`${BUTTON} [data-cut-ring]`).isVisible(), false, 'no ring before the keyboard reaches it');
      await tabTo(page, 'cutButton');
      const cut = await page.locator(BUTTON).evaluate((link) => [getComputedStyle(link).clipPath, getComputedStyle(link).overflow]);
      assert.deepEqual(cut, ['none', 'visible'], 'nothing clips the link itself');
      assert.deepEqual(await buttonRing(page, 'button-ring-shaped'), { missing: [], square: [] }, 'the ring runs along the whole shape');
      const square = await page.addStyleTag({ content: SQUARE_RING });
      const squared = await buttonRing(page, 'button-ring-square');
      assert.deepEqual(squared.square, ['the top-right corner', 'the bottom-left corner'], 'a rectangular ring turns the corners: seen');
      await square.evaluate((style) => (style as HTMLStyleElement).remove());
      await page.addStyleTag({ content: CLIPPED_BUTTON });
      const clipped = await buttonRing(page, 'button-ring-clipped');
      assert.equal(
        clipped.missing.length,
        18,
        `cut by a clip, the ring is lost along the whole shape: seen (${clipped.missing.join('; ')})`,
      );
    } finally {
      await page.context().close();
    }
  },
);

/** A cut frame of the gallery's `cut` part, by the ground it stands on. */
const frameOn = (ground: 'plain' | 'other'): string => `[data-part="cut"] [data-ground="${ground}"] [data-cut-frame]`;

/** Where the cut frame on the other ground paints over that ground inside a cut corner, none when the ground shows through both. */
async function cornerPatches(page: Page, name: string): Promise<string[]> {
  const { out } = await edgesOf(page, frameOn('other'));
  const found = await coloursOf(page, name, {
    ground: [out.left - 30, out.top - 30],
    edge: [Math.round((out.left + out.right) / 2), out.top + 1],
    'edge, a row lower': [Math.round((out.left + out.right) / 2), out.top + 2],
    'the top-right cut': [out.right - 4, out.top + 3],
    'the bottom-left cut': [out.left + 4, out.bottom - 3],
  });
  const edge = Math.max(apart(found.edge, found.ground), apart(found['edge, a row lower'], found.ground));
  assert.ok(edge > 8, `the frame's edge is read apart from the ground, on the row a box between two pixels is drawn from: ${edge}`);
  return (['the top-right cut', 'the bottom-left cut'] as const).filter((where) => apart(found[where], found.ground) > 3);
}

/** The frame with its shape left square: its edge and its ground painted into both cut corners. */
const PATCHED = `${frameOn('other')} [data-cut-shape] > * { clip-path: none !important; }`;

/**
 * How much the glow of the frame that waits on a person tints the ground, as the widest channel's difference from the ground thirty pixels
 * from it: three pixels above its top edge, three pixels outside the middle of its top-right cut, and past the box's own top-right
 * corner, where a glow that follows the cut has faded and a square one has not.
 */
async function glowOf(page: Page, name: string): Promise<{ edge: number; cut: number; corner: number }> {
  const { box, out } = await edgesOf(page, frameOn('plain'));
  const off = 3 / Math.SQRT2;
  const found = await coloursOf(page, name, {
    ground: [out.left - 30, out.top - 30],
    edge: [Math.round((box.left + box.right) / 2), out.top - 2],
    cut: [Math.floor(box.right - 14 + off), Math.floor(box.top + 14 - off)],
    corner: [out.right + 2, out.top - 2],
  });
  return { edge: apart(found.edge, found.ground), cut: apart(found.cut, found.ground), corner: apart(found.corner, found.ground) };
}

/** Whether a glow, as `glowOf` measured it, is there along the edge and the cut, and follows the cut. */
const glowFollows = (glow: { edge: number; cut: number; corner: number }): boolean =>
  glow.edge >= 6 && glow.cut >= 6 && glow.corner * 3 <= glow.cut;

/** The frame with no glow, and with a glow its box casts, square behind the cut. */
const NO_GLOW = `${frameOn('plain')} [data-cut-shape] { filter: none !important; }`;
const SQUARE_GLOW = `${frameOn('plain')} { box-shadow: 0 0 10px var(--meaning-yours); }`;

test(
  'REFUSED: a cut corner shows the ground under it, and a waiting frame glows along its cut; a patch, no glow and a square glow are each seen',
  WAITED,
  async () => {
    const page = await openParts(browser, built, 'dark');
    try {
      assert.deepEqual(await cornerPatches(page, 'corner-clear'), [], 'the ground shows through both cut corners');
      const glow = await glowOf(page, 'glow-shaped');
      assert.ok(glowFollows(glow), `the frame glows along its edge and its cut, and not past the corner it cut: ${JSON.stringify(glow)}`);
      await page.addStyleTag({ content: PATCHED });
      assert.deepEqual(
        await cornerPatches(page, 'corner-patched'),
        ['the top-right cut', 'the bottom-left cut'],
        'a shape left square paints the corners over: seen',
      );
      await page.addStyleTag({ content: NO_GLOW });
      const none = await glowOf(page, 'glow-none');
      assert.ok(!glowFollows(none) && none.cut < 6, `with no glow, none is read: ${JSON.stringify(none)}`);
      await page.addStyleTag({ content: SQUARE_GLOW });
      const square = await glowOf(page, 'glow-square');
      assert.ok(
        !glowFollows(square) && square.corner >= 6,
        `a glow the box casts is square behind the cut: seen ${JSON.stringify(square)}`,
      );
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
      const [link, frame] = [
        await page.locator('[data-ring-probe]').boundingBox(),
        await page.locator('[data-part="ring"] [data-cut-frame]').boundingBox(),
      ];
      assert.ok(link && frame);
      assert.ok(link.x + link.width > frame.x + frame.width - 28 && link.y < frame.y + 28, 'the link stands in the cut corner');
      assert.deepEqual(await ringGaps(page, 'ring-whole'), [], 'the ring is whole, the corner cut by a shape under the link');
      await page.addStyleTag({ content: CLIPPED });
      const gaps = (await ringGaps(page, 'ring-clipped')).map((gap) => gap.split(':')[0]);
      assert.deepEqual(gaps, ['top', 'right'], 'cut by a clip, the ring is lost in the corner: the check sees it');
    } finally {
      await page.context().close();
    }
  },
);

const TITLE = '[data-plain-link]';

/** Whether the link `TITLE` finds is underlined as it stands now. */
const underlined = (page: Page): Promise<boolean> =>
  page.locator(TITLE).evaluate((link) => getComputedStyle(link).textDecorationLine.includes('underline'));

/**
 * Where a text link is underlined when it must not be, or not when it must, none when it is right: with the pointer away and the
 * keyboard elsewhere, under the pointer, and with the keyboard on it.
 */
async function lineFaults(page: Page): Promise<string[]> {
  const faults: string[] = [];
  await page.mouse.move(0, 0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  if (await underlined(page)) faults.push('underlined at rest');
  await page.locator(TITLE).hover();
  if (!(await underlined(page))) faults.push('no line under the pointer');
  await page.mouse.move(0, 0);
  await tabTo(page, 'plainLink');
  if (!(await underlined(page))) faults.push('no line with the keyboard on it');
  if (!(await ringOf(page))) faults.push('no ring with the keyboard on it');
  return faults;
}

/** The link as it was drawn before: underlined at rest. */
const ALWAYS_LINED = `${TITLE} { text-decoration-line: underline !important; }`;

/** The link as plain text: no line, whatever is on it. */
const NEVER_LINED = `${TITLE} { text-decoration-line: none !important; }`;

test(
  'REFUSED: a text link is underlined under the pointer and with the keyboard on it, never at rest; each fault is seen',
  WAITED,
  async () => {
    const page = await openParts(browser, built, 'dark');
    try {
      assert.deepEqual(await lineFaults(page), [], 'no line at rest, a line under the pointer and on focus, and the ring');
      const always = await page.addStyleTag({ content: ALWAYS_LINED });
      assert.deepEqual(await lineFaults(page), ['underlined at rest'], 'underlined at rest: the check sees it');
      await always.evaluate((style) => (style as HTMLStyleElement).remove());
      await page.addStyleTag({ content: NEVER_LINED });
      assert.deepEqual(
        await lineFaults(page),
        ['no line under the pointer', 'no line with the keyboard on it'],
        'never underlined: the check sees both',
      );
    } finally {
      await page.context().close();
    }
  },
);

test('a short id stands in a hairline box with six pixels of room, and a whole id in none', WAITED, async () => {
  const page = await openParts(browser, built, 'dark');
  try {
    const boxes = await page.locator('[data-part="copy-id"] [data-run-id]').evaluateAll((all) =>
      all.map((id) => {
        const style = getComputedStyle(id);
        return `${id.textContent}: ${style.borderTopWidth}, ${style.paddingLeft} ${style.paddingRight}, ${id.getBoundingClientRect().height}px tall`;
      }),
    );
    assert.deepEqual(boxes, ['2e13: 1px, 6px 6px, 20px tall', 'lay-the-diamond-top-e2e4: 0px, 0px 0px, 16px tall']);
  } finally {
    await page.context().close();
  }
});

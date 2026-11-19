/**
 * The look's cuts, read in pixels: each story opened alone in Storybook's static build (`iframe.html?id=<id>`, `stories/built.ts`), in
 * dark. The cut button's shape and its ring, as a link and as a press, a frame's cut corner and its glow, the grain of a card's ground,
 * a sticker and a plate, a focus ring inside the cut-corner frame drawn whole over its cut corner, a disabled press's ground, and ids
 * of different lengths holding their copy controls at one edge: each read in a picture, pixel by pixel, and refused for a fault put
 * back. Beside them what needs the browser's own input, which a play function's events are not: the pager's and the text link's
 * Enter, which the browser turns into a click and which navigates once, and a text link's line under the pointer (CSS's `:hover`)
 * and the keyboard. What a person does to a part that needs neither is its story's play function (`npm run stories`).
 * `npm run e2e -- --look` runs this, and a whole `npm run e2e` first; it needs Chromium.
 */
import { afterAll, beforeAll, test } from 'vitest';
import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { scratch } from 'test-kit/scratch';
import { WAITED } from '../waits.ts';
import { photograph } from './board.ts';
import { entersOnce, focused, tabTo } from './keys.ts';
import { apart, coloursAt, coloursOf as coloursIn, edgesOf, type Rgb } from './pixels.ts';
import { openStory, serveBuilt, storybookFor, type Look } from './stories/built.ts';

const pictures = scratch('nemia-cuts-');
let browser: Browser;
let served: { at: string; close: () => void };
beforeAll(async () => {
  served = await serveBuilt(await storybookFor(scratch('nemia-cuts-storybook-')));
  browser = await chromium.launch();
}, WAITED.timeout);
afterAll(async () => {
  await browser?.close();
  served?.close();
});

/** The story `id` opened alone, in `theme`. */
const open = (id: string, theme: 'light' | 'dark' = 'dark', look: Look = {}) => openStory(browser, served.at, theme, id, look);

const PAGER_FIRST = 'look-pager--on-the-first-page';
const TITLE_STORY = 'look-textlink--title';
const CORNER = 'look-cutframe--link-in-the-cut-corner';

test('the pager by the keyboard: Enter on Older leads to the next page once, then Newer back to the bare address', WAITED, async () => {
  const page = await open(PAGER_FIRST);
  try {
    await tabTo(page, 'pagerOlder');
    await entersOnce(page, '?older=f.page2', 'Older');
    assert.equal(await page.locator('[data-pager-at]').textContent(), 'Page 2 / 3');
    assert.equal(await page.locator('[data-pager-rows]').textContent(), 'Runs 10–18 of 25');
    await page.keyboard.press('Shift+Tab');
    assert.ok((await focused(page)).marks.includes('pagerNewer'), 'on page 2 Newer takes the focus');
    await entersOnce(page, '', 'Newer');
    assert.equal(await page.locator('[data-pager-at]').textContent(), 'Page 1 / 3');
  } finally {
    await page.context().close();
  }
});

test('the text link by the keyboard: Enter navigates once', WAITED, async () => {
  const page = await open(TITLE_STORY);
  try {
    await tabTo(page, 'plainLink');
    await entersOnce(page, '?read=link', 'the text link');
  } finally {
    await page.context().close();
  }
});

/**
 * The colour of the ring drawn around what has the focus, off its computed outline, the kit's ring: null when no outline is drawn,
 * none wide or one that is transparent.
 */
const ringOf = (page: Page) =>
  page.evaluate(() => {
    const style = getComputedStyle(document.activeElement!);
    if (style.outlineStyle === 'none' || !(parseFloat(style.outlineWidth) > 0)) return null;
    const colour = /rgba?\(([^)]+)\)/
      .exec(style.outlineColor)?.[1]
      .split(/[\s,/]+/)
      .map(Number);
    return colour && (colour.length === 3 || colour[3] > 0) ? (colour.slice(0, 3) as [number, number, number]) : null;
  });

/**
 * Where the ring of the focused link in the frame's cut corner is missing, a side each, none when it is drawn on all four: read in a
 * picture of the window, in the band the kit's ring draws four pixels outside each side of the link, the top's and the right's inside the
 * cut corner.
 */
async function ringGaps(page: Page, name: string) {
  const ring = await ringOf(page);
  assert.ok(ring, 'the focused link has a ring, by its computed outline');
  const box = await page.locator('[data-ring-probe]').boundingBox();
  assert.ok(box, 'the link is drawn');
  const [left, top, right, bottom] = [box.x, box.y, box.x + box.width, box.y + box.height].map(Math.round);
  const sides: Record<string, readonly [number, number]> = {
    top: [right - 4, top - 4],
    right: [right + 3, Math.round((top + bottom) / 2)],
    bottom: [Math.round((left + right) / 2), bottom + 3],
    left: [left - 4, Math.round((top + bottom) / 2)],
  };
  const file = path.join(pictures, `${name}.png`);
  await photograph(page, file, { always: true });
  const found = await coloursAt(browser, file, Object.values(sides));
  const near = (a: Rgb, b: Rgb) => a.every((channel, i) => Math.abs(channel - b[i]) <= 3);
  return Object.keys(sides).flatMap((side, i) =>
    near(found[i], ring) ? [] : [`${side}: ${found[i].join(' ')}, the ring is ${ring.join(' ')}`],
  );
}

/** The cut button, in each of its stories, drawn on a card's ground: as a link, as a press, and as a press that is disabled. */
const BUTTON = '[data-cut-button]';
const LINK_STORY = 'look-cutbutton--link';
const PRESS_STORY = 'look-cutbutton--press';
const DISABLED_STORY = 'look-cutbutton--disabled-press';

/** The colours of the named `points` in a picture of the window taken now, as `name`. */
const coloursOf = <K extends string>(page: Page, name: string, points: Record<K, readonly [number, number]>) =>
  coloursIn(browser, page, path.join(pictures, `${name}.png`), points);

/**
 * Where the cut button paints what it must not, none when its shape is exact: a pixel outside its box beside each cut, which must
 * be the ground it sits on, and inside each cut corner, which must be too; and its fill, which must not be.
 */
async function buttonSpills(page: Page, name: string) {
  const { box, out } = await edgesOf(page, BUTTON);
  assert.ok(
    [box.left, box.top].every((edge) => Math.abs(edge - Math.round(edge)) < 0.02),
    `the story lays the button on whole pixels, where a pixel beside it is its neighbour: ${box.left}, ${box.top}`,
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
    const page = await open(LINK_STORY);
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
async function buttonRing(page: Page, name: string) {
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
const SQUARE_RING = '[data-cut-button] [data-cut-ring] { clip-path: none !important; }';

/** The cut button as a clip on the link itself would cut it: its two corners, and with them whatever is drawn outside its box. */
const CLIPPED_BUTTON = `${BUTTON} {
  clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px));
}`;

test(
  "REFUSED: the cut button's focus ring follows its shape whole, both cuts too; a rectangular ring and a ring cut off are each seen",
  WAITED,
  async () => {
    const page = await open(LINK_STORY);
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

const QUIET_STORY = 'look-cutbutton--quiet';

/**
 * Where the quiet cut button's hairline is not drawn, none when it runs along its whole cut shape: read in a picture, on its four
 * straight sides a row or a column inside its box, and three places along each cut, on the pixel whose middle is half a pixel inside
 * the cut's line, each closer to the hairline's colour, read in the middle of its top, than to the card's ground beside it.
 */
async function hairlineGaps(page: Page, name: string) {
  const { box, out } = await edgesOf(page, BUTTON);
  const [midX, midY] = [Math.round((box.left + box.right) / 2), Math.round((box.top + box.bottom) / 2)];
  const inside = 0.5 * Math.SQRT2;
  const [first, last] = [Math.floor(box.right - 0.5), Math.floor(box.bottom - 0.5)];
  const sides: Record<string, readonly [number, number]> = {
    'top, at its left': [out.left + 4, out.top + 1],
    'right, at its foot': [first, last - 4],
    'right, in its middle': [first, midY],
    'bottom, at its right': [first - 4, last],
    'left, at its head': [out.left + 1, out.top + 5],
    'left, in its middle': [out.left + 1, midY],
  };
  const cuts = Object.fromEntries(
    [3, 6, 9].flatMap((d, i) => {
      const [right, left] = [Math.floor(box.right - 12 + d), Math.floor(box.left + d)];
      return [
        [`the top-right cut, ${i + 1} of 3`, [right, Math.floor(box.top + right + 0.5 - (box.right - 12) + inside)]],
        [`the bottom-left cut, ${i + 1} of 3`, [left, Math.floor(box.bottom - 12 + left + 0.5 - box.left - inside)]],
      ];
    }),
  ) as Record<string, readonly [number, number]>;
  const points: Record<string, readonly [number, number]> = {
    ground: [out.left - 7, out.top - 7],
    hairline: [midX, out.top + 1],
    ...sides,
    ...cuts,
  };
  const found = await coloursOf(page, name, points);
  const { ground, hairline } = found;
  assert.ok(apart(hairline, ground) > 12, `the hairline is read apart from the card: ${hairline.join(' ')} on ${ground.join(' ')}`);
  return [...Object.keys(sides), ...Object.keys(cuts)].filter((where) => !(apart(found[where], hairline) < apart(found[where], ground)));
}

/** The quiet button's hairline as a ring around its box, which its shape's clip cuts away at both cuts: how it was drawn before. */
const RING_HAIRLINE = `${BUTTON} [data-cut-hairline] { display: none; }
${BUTTON} [data-cut-shape] { box-shadow: inset 0 0 0 1px var(--md-sys-color-outline); }`;

test(
  "REFUSED: the quiet cut button's hairline runs along its whole shape, both cuts too; a ring its clip cuts open is seen",
  WAITED,
  async () => {
    for (const theme of ['dark', 'light'] as const) {
      const page = await open(QUIET_STORY, theme);
      try {
        assert.deepEqual(await hairlineGaps(page, `quiet-hairline-${theme}`), [], `the hairline is drawn whole, in ${theme}`);
        await page.addStyleTag({ content: RING_HAIRLINE });
        const ringed = await hairlineGaps(page, `quiet-hairline-ring-${theme}`);
        assert.ok(
          ringed.length === 6 && ringed.every((where) => where.startsWith('the ')),
          `a ring cut by the clip draws the straight sides and leaves both cuts open, in ${theme}: seen (${ringed.join('; ')})`,
        );
      } finally {
        await page.context().close();
      }
    }
  },
);

/** The cut frame its stories draw on the page's own ground, and on another, each by its story's id and the frame there. */
const ON = { plain: 'look-cutframe--on-the-page', other: 'look-cutframe--on-another-ground' } as const;
const frameOn = (ground: 'plain' | 'other') => `[data-ground="${ground}"] [data-cut-frame]`;

/** Where the cut frame on the other ground paints over that ground inside a cut corner, none when the ground shows through both. */
async function cornerPatches(page: Page, name: string) {
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
async function glowOf(page: Page, name: string) {
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
const glowFollows = (glow: { edge: number; cut: number; corner: number }) => glow.edge >= 6 && glow.cut >= 6 && glow.corner * 3 <= glow.cut;

/** The frame with no glow, and with a glow its box casts, square behind the cut. */
const NO_GLOW = `${frameOn('plain')} [data-cut-shape] { filter: none !important; }`;
const SQUARE_GLOW = `${frameOn('plain')} { box-shadow: 0 0 10px var(--meaning-yours); }`;

test(
  'REFUSED: a cut corner shows the ground under it, and a waiting frame glows along its cut; a patch, no glow and a square glow are each seen',
  WAITED,
  async () => {
    const other = await open(ON.other);
    const plain = await open(ON.plain);
    try {
      assert.deepEqual(await cornerPatches(other, 'corner-clear'), [], 'the ground shows through both cut corners');
      const glow = await glowOf(plain, 'glow-shaped');
      assert.ok(glowFollows(glow), `the frame glows along its edge and its cut, and not past the corner it cut: ${JSON.stringify(glow)}`);
      await other.addStyleTag({ content: PATCHED });
      assert.deepEqual(
        await cornerPatches(other, 'corner-patched'),
        ['the top-right cut', 'the bottom-left cut'],
        'a shape left square paints the corners over: seen',
      );
      await plain.addStyleTag({ content: NO_GLOW });
      const none = await glowOf(plain, 'glow-none');
      assert.ok(!glowFollows(none) && none.cut < 6, `with no glow, none is read: ${JSON.stringify(none)}`);
      await plain.addStyleTag({ content: SQUARE_GLOW });
      const square = await glowOf(plain, 'glow-square');
      assert.ok(
        !glowFollows(square) && square.corner >= 6,
        `a glow the box casts is square behind the cut: seen ${JSON.stringify(square)}`,
      );
    } finally {
      await other.context().close();
      await plain.context().close();
    }
  },
);

/** A part of each kind that wears a grain, in a story of its own: a card's ground, and the two labels, each by its story's id. */
const GRAINED = {
  'a cut frame': [ON.plain, frameOn('plain')],
  'a sticker': ['look-sticker--cost', '[data-sticker]'],
  'a plate': ['look-plate--grey', '[data-plate]'],
} as const;

/**
 * How many colours a strip of what `selector` finds is painted in: twenty-four pixels in a row, four under its top edge and
 * twenty in from its left, where a part holds no text. One is a plain ground; a grain paints several.
 */
async function coloursAlong(page: Page, name: string, selector: string) {
  const { out } = await edgesOf(page, selector);
  const strip = Object.fromEntries(Array.from({ length: 24 }, (_, i) => [`${i}`, [out.left + 21 + i, out.top + 5] as const]));
  const found = Object.values(await coloursOf(page, name, strip));
  return new Set(found.map((colour) => colour.join(','))).size;
}

/** Every part drawn with no grain, whatever it names. */
const NO_GRAIN = '[data-grain] { background-image: none !important; }';

for (const scheme of ['dark', 'light'] as const)
  test(
    `REFUSED: a card's ground, a sticker or a plate drawn plain in ${scheme}: each wears its grain, and a cut button none`,
    WAITED,
    async () => {
      for (const [part, [id, selector]] of Object.entries(GRAINED)) {
        const page = await open(id, scheme);
        try {
          const grained = await coloursAlong(page, `grain-${scheme}`, selector);
          assert.ok(grained >= 4, `${part} is grained in ${scheme}: its strip holds ${grained} colours`);
          await page.addStyleTag({ content: NO_GRAIN });
          assert.equal(await coloursAlong(page, `grain-none-${scheme}`, selector), 1, `${part} with no grain is one colour: seen`);
        } finally {
          await page.context().close();
        }
      }
      const button = await open(LINK_STORY, scheme);
      try {
        assert.equal(await coloursAlong(button, `grain-button-${scheme}`, BUTTON), 1, 'a cut button wears no grain');
      } finally {
        await button.context().close();
      }
    },
  );

/** The frame as the look's source cut it: by a clip, which cuts off whatever it holds too. */
const CLIPPED = `[data-cut-frame] {
  clip-path: polygon(0 0, calc(100% - 28px) 0, 100% 28px, 100% 100%, 28px 100%, 0 calc(100% - 28px));
}`;

test(
  'REFUSED: a focus ring inside the cut-corner frame is drawn whole over its cut corner, and a frame cut by a clip loses it',
  WAITED,
  async () => {
    const page = await open(CORNER);
    try {
      await tabTo(page, 'ringProbe');
      const [link, frame] = [await page.locator('[data-ring-probe]').boundingBox(), await page.locator('[data-cut-frame]').boundingBox()];
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
const underlined = (page: Page) => page.locator(TITLE).evaluate((link) => getComputedStyle(link).textDecorationLine.includes('underline'));

/**
 * Where a text link is underlined when it must not be, or not when it must, none when it is right: with the pointer away and the
 * keyboard elsewhere, under the pointer, and with the keyboard on it. The pointer is the browser's own: the link's line is CSS's
 * `:hover`, which no event a play function sends reaches.
 */
async function lineFaults(page: Page) {
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
    const page = await open(TITLE_STORY);
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

test(
  "REFUSED: a pressed cut button's ring is the link's band, offset for offset, one ring element alike; a rectangular ring on it is seen",
  WAITED,
  async () => {
    const page = await open(PRESS_STORY);
    const link = await open(LINK_STORY);
    try {
      await tabTo(page, 'cutButton');
      const pressed = await buttonRing(page, 'press-ring-shaped');
      assert.deepEqual(pressed, { missing: [], square: [] }, "the press's ring runs along its whole shape");
      await tabTo(link, 'cutButton');
      assert.deepEqual(pressed, await buttonRing(link, 'link-ring-shaped'), "and it is the link's band, offset for offset from its box");
      const [onPress, onLink] = [
        await page.locator(`${BUTTON} [data-cut-ring]`).evaluate((ring) => [getComputedStyle(ring).clipPath, getComputedStyle(ring).inset]),
        await link.locator(`${BUTTON} [data-cut-ring]`).evaluate((ring) => [getComputedStyle(ring).clipPath, getComputedStyle(ring).inset]),
      ];
      assert.deepEqual(onPress, onLink, 'one ring element, the same clip and the same offsets');
      await page.addStyleTag({ content: SQUARE_RING });
      const squared = await buttonRing(page, 'press-ring-square');
      assert.deepEqual(squared.square, ['the top-right corner', 'the bottom-left corner'], 'a rectangular ring on the press: seen');
    } finally {
      await page.context().close();
      await link.context().close();
    }
  },
);

test('a disabled press is drawn in a ground of its own, apart from the card and not the yellow of the press', WAITED, async () => {
  const fills: Rgb[] = [];
  for (const [id, name] of [
    [DISABLED_STORY, 'press-disabled'],
    [PRESS_STORY, 'press-enabled'],
  ] as const) {
    const page = await open(id);
    try {
      await page.mouse.move(0, 0);
      const { out } = await edgesOf(page, BUTTON);
      const { fill, ground } = await coloursOf(page, name, { fill: [out.left + 5, out.top + 5], ground: [out.left - 7, out.top - 7] });
      assert.ok(apart(fill, ground) > 8, `${name}: its ground is read apart from the card's: ${fill.join(' ')} on ${ground.join(' ')}`);
      fills.push(fill);
    } finally {
      await page.context().close();
    }
  }
  assert.ok(apart(fills[0], fills[1]) > 40, `the disabled ground is not the yellow: ${fills[0].join(' ')} beside ${fills[1].join(' ')}`);
});

test('ids of different lengths given one room hold their copy controls at one edge', WAITED, async () => {
  const page = await open('look-copyid--lined');
  try {
    const lefts = await page
      .locator('[data-lined] [data-copy-id]')
      .evaluateAll((all) => all.map((copy) => Math.round(copy.querySelector('button')!.getBoundingClientRect().left)));
    assert.equal(lefts.length, 2, 'the story draws two ids');
    assert.equal(lefts[0], lefts[1], `the two controls stand at one left edge: ${lefts.join(' and ')}`);
  } finally {
    await page.context().close();
  }
});

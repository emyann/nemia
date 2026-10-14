/**
 * The look's parts, pressed in a browser: the page of their stories (`parts/main.tsx`) built as the board is and opened in dark. Every
 * story draws. The pager's and the text link's keyboard paths navigate once, a pager's end that leads nowhere takes no focus, and a
 * focus ring inside the cut-corner frame is drawn whole over its cut corner — refused for the same frame cut by a clip; the cut
 * button's shape and its ring, as a link and as a press, and a frame's cut corner and its glow, are each read in a picture, pixel by
 * pixel; a press is pressed by the keyboard, and a disabled one by nothing. `npm run e2e` runs this first; it needs Chromium.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { scratch } from '../scratch.ts';
import { WAITED } from '../waits.ts';
import { photograph } from './board.ts';
import { buildParts, openParts, story } from './parts/gallery.ts';
import { entersOnce, focused, tabStops, tabTo } from './parts/keys.ts';
import { apart, coloursAt, coloursOf as coloursIn, edgesOf, type Rgb } from './parts/pixels.ts';
import { undrawn, type StoryDrawn } from './parts/drawn.ts';

const built = scratch('nemia-parts-');
let browser: Browser;
before(async () => {
  await buildParts(built);
  browser = await chromium.launch();
}, WAITED);
after(async () => {
  await browser?.close();
});

/** A story's page, by the story's id. */
const alone = (id: string): string => `?story=${id}`;

const PAGER_FIRST = 'look-pager--on-the-first-page';
const PAGER_LAST = 'look-pager--on-the-last-page';
const TITLE_STORY = 'look-textlink--title';
const CORNER = 'look-cutframe--link-in-the-cut-corner';

test(
  'REFUSED: a story that throws or draws nothing; every story of the look draws, and one is drawn alone at its address',
  WAITED,
  async () => {
    const fixture: StoryDrawn[] = [
      { id: 'look-a--fine', broken: null, height: 40 },
      { id: 'look-a--throws', broken: 'no such part', height: 20 },
      { id: 'look-a--empty', broken: null, height: 0 },
    ];
    assert.deepEqual(undrawn(fixture), ['look-a--throws threw: no such part', 'look-a--empty draws nothing']);
    const page = await openParts(browser, built, 'dark');
    const one = await openParts(browser, built, 'dark', alone(TITLE_STORY));
    try {
      const listed = await page
        .locator('[data-story-link]')
        .evaluateAll((links) => links.map((link) => link.getAttribute('data-story-link')));
      const drawn: StoryDrawn[] = await page.locator('[data-story]').evaluateAll((sections) =>
        sections.map((section) => ({
          id: section.getAttribute('data-story') ?? '',
          broken: section.querySelector('[data-broken]')?.textContent ?? null,
          height: section.querySelector('[data-story-ground] > *')?.getBoundingClientRect().height ?? 0,
        })),
      );
      assert.ok(drawn.length >= 30, `the page draws the look's stories: ${drawn.length}`);
      assert.deepEqual(
        drawn.map((one) => one.id),
        listed,
        'every story the index lists is drawn',
      );
      assert.deepEqual(undrawn(drawn), [], 'no story throws, and none draws nothing');
      assert.deepEqual(
        await one.locator('[data-story]').evaluateAll((sections) => sections.map((section) => section.getAttribute('data-story'))),
        [TITLE_STORY],
        'at its address a story is drawn alone',
      );
    } finally {
      await page.context().close();
      await one.context().close();
    }
  },
);

test('the pager by the keyboard: Enter on Older leads to the next page once, then Newer back to the bare address', WAITED, async () => {
  const page = await openParts(browser, built, 'dark', alone(PAGER_FIRST));
  try {
    await tabTo(page, 'pagerOlder');
    await entersOnce(page, story(PAGER_FIRST), '?page=2', 'Older');
    assert.equal(await page.locator('[data-pager-at]').textContent(), 'Page 2 / 3');
    assert.equal(await page.locator('[data-pager-rows]').textContent(), 'Runs 10–18 of 25');
    await page.keyboard.press('Shift+Tab');
    assert.ok((await focused(page)).marks.includes('pagerNewer'), 'on page 2 Newer takes the focus');
    await entersOnce(page, story(PAGER_FIRST), '', 'Newer');
    assert.equal(await page.locator('[data-pager-at]').textContent(), 'Page 1 / 3');
  } finally {
    await page.context().close();
  }
});

test('REFUSED: an end of the pager that leads nowhere takes no focus, and is no link', WAITED, async () => {
  const first = await openParts(browser, built, 'dark', alone(PAGER_FIRST));
  const last = await openParts(browser, built, 'dark', alone(PAGER_LAST));
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
  const page = await openParts(browser, built, 'dark', alone(TITLE_STORY));
  try {
    await tabTo(page, 'plainLink');
    await entersOnce(page, story(TITLE_STORY), '?read=link', 'the text link');
  } finally {
    await page.context().close();
  }
});

/**
 * The colour of the ring drawn around what has the focus, off its computed outline, the kit's ring: null when no outline is drawn,
 * none wide or one that is transparent.
 */
const ringOf = (page: Page): Promise<Rgb | null> =>
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
async function ringGaps(page: Page, name: string): Promise<string[]> {
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
  const file = path.join(built, `${name}.png`);
  await photograph(page, file, { always: true });
  const found = await coloursAt(browser, file, Object.values(sides));
  const near = (a: Rgb, b: Rgb) => a.every((channel, i) => Math.abs(channel - b[i]) <= 3);
  return Object.keys(sides).flatMap((side, i) =>
    near(found[i], ring) ? [] : [`${side}: ${found[i].join(' ')}, the ring is ${ring.join(' ')}`],
  );
}

/** The cut button its stories draw on a card's ground: as a link, as a press, and as a press that is disabled. */
const BUTTON = `${story('look-cutbutton--link')} [data-cut-button]`;
const PRESS = `${story('look-cutbutton--press')} [data-cut-button]`;
const DISABLED = `${story('look-cutbutton--disabled-press')} [data-cut-button]`;

/** The page of the cut button's three stories. */
const BUTTONS = '?part=CutButton';

/** The colours of the named `points` in a picture of the window taken now, as `name`. */
const coloursOf = <K extends string>(page: Page, name: string, points: Record<K, readonly [number, number]>): Promise<Record<K, Rgb>> =>
  coloursIn(browser, page, path.join(built, `${name}.png`), points);

/**
 * Where the cut button paints what it must not, none when its shape is exact: a pixel outside its box beside each cut, which must
 * be the ground it sits on, and inside each cut corner, which must be too; and its fill, which must not be.
 */
async function buttonSpills(page: Page, name: string): Promise<string[]> {
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
    const page = await openParts(browser, built, 'dark', BUTTONS);
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
async function buttonRing(page: Page, name: string, button = BUTTON): Promise<{ missing: string[]; square: string[] }> {
  const { box, out } = await edgesOf(page, button);
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
    const page = await openParts(browser, built, 'dark', alone('look-cutbutton--link'));
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

/** The cut frame its stories draw on the page's own ground, and on another. */
const ON = { plain: 'look-cutframe--on-the-page', other: 'look-cutframe--on-another-ground' } as const;
const frameOn = (ground: 'plain' | 'other'): string => `${story(ON[ground])} [data-ground="${ground}"] [data-cut-frame]`;

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
    const page = await openParts(browser, built, 'dark', '?part=CutFrame');
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

/** A part of each kind that wears a grain, in a story of its own: a card's ground, and the two labels. */
const GRAINED = {
  'a cut frame': `${story(ON.plain)} [data-ground="plain"] [data-cut-frame]`,
  'a sticker': `${story('look-sticker--cost')} [data-sticker]`,
  'a plate': `${story('look-plate--grey')} [data-plate]`,
} as const;

/**
 * How many colours a strip of what `selector` finds is painted in: twenty-four pixels in a row, four under its top edge and
 * twenty in from its left, where a part holds no text. One is a plain ground; a grain paints several.
 */
async function coloursAlong(page: Page, name: string, selector: string): Promise<number> {
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
      const pages = {
        'a cut frame': await openParts(browser, built, scheme, '?part=CutFrame'),
        'a sticker': await openParts(browser, built, scheme, '?part=Sticker'),
        'a plate': await openParts(browser, built, scheme, '?part=Plate'),
      };
      const button = await openParts(browser, built, scheme, BUTTONS);
      try {
        for (const [part, selector] of Object.entries(GRAINED) as Array<[keyof typeof GRAINED, string]>) {
          const page = pages[part];
          const grained = await coloursAlong(page, `grain-${scheme}`, selector);
          assert.ok(grained >= 4, `${part} is grained in ${scheme}: its strip holds ${grained} colours`);
          await page.addStyleTag({ content: NO_GRAIN });
          assert.equal(await coloursAlong(page, `grain-none-${scheme}`, selector), 1, `${part} with no grain is one colour: seen`);
        }
        assert.equal(await coloursAlong(button, `grain-button-${scheme}`, BUTTON), 1, 'a cut button wears no grain');
      } finally {
        for (const page of [...Object.values(pages), button]) await page.context().close();
      }
    },
  );

/** The frame as the look's source cut it: by a clip, which cuts off whatever it holds too. */
const CLIPPED = `${story(CORNER)} [data-cut-frame] {
  clip-path: polygon(0 0, calc(100% - 28px) 0, 100% 28px, 100% 100%, 28px 100%, 0 calc(100% - 28px));
}`;

test(
  'REFUSED: a focus ring inside the cut-corner frame is drawn whole over its cut corner, and a frame cut by a clip loses it',
  WAITED,
  async () => {
    const page = await openParts(browser, built, 'dark', alone(CORNER));
    try {
      await tabTo(page, 'ringProbe');
      const [link, frame] = [
        await page.locator('[data-ring-probe]').boundingBox(),
        await page.locator(`${story(CORNER)} [data-cut-frame]`).boundingBox(),
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
    const page = await openParts(browser, built, 'dark', alone(TITLE_STORY));
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
  'a short id stands in a hairline box with six pixels of room, and a whole id in none; the glyph is twelve pixels, seven from it',
  WAITED,
  async () => {
    const page = await openParts(browser, built, 'dark', '?part=CopyId');
    try {
      const boxes = await page.locator('[data-part="CopyId"] [data-run-id]').evaluateAll((all) =>
        all.map((id) => {
          const style = getComputedStyle(id);
          return `${id.textContent}: ${style.borderTopWidth}, ${style.paddingLeft} ${style.paddingRight}, ${id.getBoundingClientRect().height}px tall`;
        }),
      );
      assert.deepEqual(boxes, [
        '2e13: 1px, 6px 6px, 20px tall',
        'lay-the-diamond-top-e2e4: 0px, 0px 0px, 16px tall',
        'lay-the-diamond-top-e2e4: 0px, 0px 0px, 16px tall',
      ]);
      const drawn = await page.locator('[data-part="CopyId"] [data-copy-id]').evaluateAll((all) =>
        all.map((copy) => {
          const [glyph, id] = ['[data-copy-glyph]', '[data-run-id]'].map((part) => copy.querySelector(part)!.getBoundingClientRect());
          return `glyph ${glyph.width} by ${glyph.height}, ${Math.round(glyph.left - id.right)} from the id, on a line ${copy.getBoundingClientRect().height} tall`;
        }),
      );
      assert.deepEqual(
        drawn,
        [20, 16, 16].map((line) => `glyph 12 by 12, 7 from the id, on a line ${line} tall`),
        'the glyph is 12 pixels across, 7 from the id, and the line is no taller than the id',
      );
      const under = await page.locator('[data-under-title]').evaluate((holder) => {
        const [title, copy] = [...holder.children].map((child) => child.getBoundingClientRect());
        return copy.top - title.bottom;
      });
      assert.equal(under, 4, 'under a title, the id stands four pixels from it');
    } finally {
      await page.context().close();
    }
  },
);

test(
  "REFUSED: a cut button that is pressed is pressed by the keyboard, once a key, and its ring is the link's band; a rectangular ring is seen",
  WAITED,
  async () => {
    const page = await openParts(browser, built, 'dark', alone('look-cutbutton--press'));
    const link = await openParts(browser, built, 'dark', alone('look-cutbutton--link'));
    try {
      const presses = () => page.locator(`${story('look-cutbutton--press')} [data-presses]`).getAttribute('data-presses');
      await tabTo(page, 'cutButton');
      assert.equal(await page.locator(PRESS).evaluate((button) => button.tagName), 'BUTTON', 'the press is a button, no link');
      assert.equal(await presses(), '0');
      await page.keyboard.press('Enter');
      assert.equal(await presses(), '1', 'Enter presses it once');
      await page.keyboard.press('Space');
      assert.equal(await presses(), '2', 'Space presses it once');
      const pressed = await buttonRing(page, 'press-ring-shaped', PRESS);
      assert.deepEqual(pressed, { missing: [], square: [] }, "the press's ring runs along its whole shape");
      await tabTo(link, 'cutButton');
      assert.deepEqual(pressed, await buttonRing(link, 'link-ring-shaped'), "and it is the link's band, offset for offset from its box");
      const [onPress, onLink] = [
        await page.locator(`${PRESS} [data-cut-ring]`).evaluate((ring) => [getComputedStyle(ring).clipPath, getComputedStyle(ring).inset]),
        await link.locator(`${BUTTON} [data-cut-ring]`).evaluate((ring) => [getComputedStyle(ring).clipPath, getComputedStyle(ring).inset]),
      ];
      assert.deepEqual(onPress, onLink, 'one ring element, the same clip and the same offsets');
      await page.addStyleTag({ content: SQUARE_RING });
      const squared = await buttonRing(page, 'press-ring-square', PRESS);
      assert.deepEqual(squared.square, ['the top-right corner', 'the bottom-left corner'], 'a rectangular ring on the press: seen');
    } finally {
      await page.context().close();
      await link.context().close();
    }
  },
);

test(
  'REFUSED: a disabled press takes no focus and no press, draws no ring, and is not the yellow of the press beside it',
  WAITED,
  async () => {
    const page = await openParts(browser, built, 'dark', BUTTONS);
    try {
      const stops = await tabStops(page);
      assert.deepEqual(
        stops.filter((stop) => stop.marks.includes('cutButton')).map((stop) => stop.text),
        ['Open the run', 'Approve'],
        'Tab reaches the link and the press, and passes the disabled press',
      );
      const count = () => page.locator(`${story('look-cutbutton--disabled-press')} [data-presses]`).getAttribute('data-presses');
      await page.locator(DISABLED).click({ force: true });
      assert.equal(await count(), '0', 'a click presses nothing');
      assert.equal(await page.locator(DISABLED).isDisabled(), true);
      assert.equal(await page.locator(`${DISABLED} [data-cut-ring]`).count(), 0, 'it draws no ring');
      await page.mouse.move(0, 0);
      const fills: Rgb[] = [];
      for (const [button, name] of [
        [DISABLED, 'press-disabled'],
        [PRESS, 'press-enabled'],
      ] as const) {
        const { out } = await edgesOf(page, button);
        const { fill, ground } = await coloursOf(page, name, { fill: [out.left + 5, out.top + 5], ground: [out.left - 7, out.top - 7] });
        assert.ok(apart(fill, ground) > 8, `${name}: its ground is read apart from the card's: ${fill.join(' ')} on ${ground.join(' ')}`);
        fills.push(fill);
      }
      assert.ok(
        apart(fills[0], fills[1]) > 40,
        `the disabled ground is not the yellow: ${fills[0].join(' ')} beside ${fills[1].join(' ')}`,
      );
    } finally {
      await page.context().close();
    }
  },
);

/** The short id its story draws, and the box it stands in. */
const SHORT = story('look-copyid--short');

/** The colour of the edge of the short id's box, as the page computes it. */
const edgeOf = (page: Page): Promise<string> =>
  page.locator(`${SHORT} [data-run-id]`).evaluate((id) => getComputedStyle(id).borderTopColor);

/** The hue of a session at work, as the page computes it. */
const aliveOf = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const probe = document.createElement('i');
    probe.style.color = 'var(--meaning-alive)';
    document.body.append(probe);
    const said = getComputedStyle(probe).color;
    probe.remove();
    return said;
  });

/** The short id's box as it is at rest, whatever was just copied. */
const KEPT_HAIRLINE = '[data-copied] [data-run-id] { border-color: var(--md-sys-color-outline-variant) !important; }';

test(
  'REFUSED: the box of an id just copied takes the hue of a session at work, and its hairline back at rest; a box left as it was is seen',
  WAITED,
  async () => {
    const page = await openParts(browser, built, 'dark', alone('look-copyid--short'), { still: true });
    try {
      await page.evaluate(() =>
        Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => {} }, configurable: true }),
      );
      const [rest, alive] = [await edgeOf(page), await aliveOf(page)];
      assert.notEqual(rest, alive, `at rest the box is no hue of a session at work: ${rest}`);
      await page.locator(`${SHORT} button`).click();
      await page.locator(`${SHORT} [data-copied]`).waitFor();
      assert.equal(await edgeOf(page), alive, 'just copied, its edge is the hue of a session at work');
      await page.addStyleTag({ content: KEPT_HAIRLINE });
      assert.equal(await edgeOf(page), rest, 'a box left with its hairline: seen');
    } finally {
      await page.context().close();
    }
  },
);

const CARD_NARROW = 'board-waitingcard--narrow';
const CARD_WIDE = 'board-waitingcard--wide';

/** Where the button of the card the page draws stands against its tiles, and how far its right edge is from the foot's. */
const footOf = (page: Page): Promise<{ under: boolean; beside: boolean; fromRight: number }> =>
  page.locator('[data-foot]').evaluate((foot) => {
    const [tiles, button] = ['[data-tiles]', '[data-cut-button]'].map((part) => foot.querySelector(part)!.getBoundingClientRect());
    return {
      under: button.top >= tiles.bottom,
      beside: button.top < tiles.bottom && button.bottom > tiles.top,
      fromRight: Math.round(foot.getBoundingClientRect().right - button.right),
    };
  });

test(
  "a waiting card's button stands at the card's right: under its tiles where the card is narrow, beside them where it is wide",
  WAITED,
  async () => {
    const narrow = await openParts(browser, built, 'dark', alone(CARD_NARROW));
    const wide = await openParts(browser, built, 'dark', alone(CARD_WIDE));
    try {
      assert.deepEqual(await footOf(narrow), { under: true, beside: false, fromRight: 0 }, 'narrow, the button wraps under the tiles');
      assert.deepEqual(await footOf(wide), { under: false, beside: true, fromRight: 0 }, 'wide, it stands beside them');
    } finally {
      await narrow.context().close();
      await wide.context().close();
    }
  },
);

test("a press on a waiting card's title, on its lowest pixels over the copy control, opens the run", WAITED, async () => {
  const page = await openParts(browser, built, 'dark', alone(CARD_WIDE));
  try {
    const hit = await page.locator('article[data-run]').evaluate((article) => {
      const link = article.querySelector('h3 a')!;
      const button = article.querySelector('[data-copy-id] button')!.getBoundingClientRect();
      const [x, cy] = [button.left + button.width / 2, button.top + button.height / 2];
      const rows = [...link.getClientRects()];
      const row = rows.at(-1)!;
      const at = document.elementFromPoint(x, row.bottom - 1);
      return {
        run: article.getAttribute('data-run'),
        x,
        y: row.bottom - 1,
        rows: rows.length,
        over: x > row.left && x < row.right,
        above: Math.round(cy - row.bottom),
        title: at?.closest('a') === link,
        tag: at?.tagName ?? 'nothing',
      };
    });
    assert.ok(
      hit.rows === 1 && hit.over && hit.above < 24,
      `the title runs over the copy control, within its reach: ${JSON.stringify(hit)}`,
    );
    assert.ok(hit.title, `the point a pixel inside the title, over the copy control, answers the title's link: it answers ${hit.tag}`);
    await page.mouse.click(hit.x, hit.y);
    await page.locator(`${story(CARD_WIDE)} [data-story-ground][data-at="/runs/${hit.run}"]`).waitFor();
    assert.equal(await page.locator('[data-copied]').count(), 0, 'and nothing was copied');
  } finally {
    await page.context().close();
  }
});

test(
  "a page's name lights its rule exactly under the whole name, short or long, and the hairline runs the h1's width",
  WAITED,
  async () => {
    const page = await openParts(browser, built, 'dark', '?part=Plate');
    try {
      const measured = await page.locator('[data-page-name]').evaluateAll((names) =>
        names.map((name) => {
          const text = document.createRange();
          text.selectNodeContents(name.querySelector('[data-page-name-text]')!.firstChild!);
          const [word, lit, rule, whole] = [
            text.getBoundingClientRect(),
            name.querySelector('[data-page-rule-lit]')!.getBoundingClientRect(),
            name.querySelector('[data-page-rule]')!.getBoundingClientRect(),
            name.getBoundingClientRect(),
          ];
          return {
            name: name.textContent,
            word: [Math.round(word.left), Math.round(word.right)],
            lit: [Math.round(lit.left), Math.round(lit.right)],
            rule: [Math.round(rule.left), Math.round(rule.right)],
            whole: [Math.round(whole.left), Math.round(whole.right)],
            onTheRule: Math.round(lit.bottom) === Math.round(rule.bottom) && Math.round(lit.bottom) === Math.round(whole.bottom),
          };
        }),
      );
      assert.deepEqual(
        measured.map((one) => one.name).toSorted(),
        ['Factories and their workflows', 'Runs'],
        "the plate's stories draw a short name and a long one",
      );
      for (const one of measured) {
        assert.deepEqual(one.lit, one.word, `the lit part is as wide as the name: ${JSON.stringify(one)}`);
        assert.deepEqual(one.rule, one.whole, `the hairline runs the h1's width: ${JSON.stringify(one)}`);
        assert.ok(one.onTheRule, `the lit part lies on the hairline, at the h1's foot: ${JSON.stringify(one)}`);
      }
      const [short, long] = measured.map((one) => one.lit[1] - one.lit[0]).toSorted((a, b) => a - b);
      assert.ok(long > short && long > 140, `a long name's lit part reaches past a short one's: ${short} then ${long}`);
    } finally {
      await page.context().close();
    }
  },
);

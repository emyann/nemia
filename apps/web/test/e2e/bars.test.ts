/**
 * The look's scroll bars and a table in a cut frame, read in browsers that draw scroll bars, which the e2e's own hides: the page of
 * the look's stories (`parts/main.tsx`) opened in a browser whose bars take room (`classic`) and in one whose bars float (`overlay`).
 * The last row of a framed table draws no line and nothing of the table is painted in a cut corner; a table whose rows fit shows no
 * upright bar and a narrow one still scrolls sideways, its thumb off the cut; a bar is an 8-pixel lane the ground shows through, its
 * thumb in the look's inks while it scrolls, under the pointer and while held, in both kinds of browser and both schemes; and what
 * scrolls is marked while it scrolls. Each is refused for a fault put back. `npm run e2e` runs this first; it needs Chromium.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import type { Browser, Page } from 'playwright';
import { scratch } from '../scratch.ts';
import { WAITED } from '../waits.ts';
import { expectNone } from './checks.ts';
import { buildParts, openParts, story } from './parts/gallery.ts';
import { apart, coloursOf, edgesOf, type Rgb } from './parts/pixels.ts';
import { launch, type Bars } from './visit.ts';

const built = scratch('nemia-bars-');
const browsers = {} as Record<Bars, Browser>;
before(async () => {
  await buildParts(built);
  browsers.classic = await launch('classic');
  browsers.overlay = await launch('overlay');
}, WAITED);
after(async () => {
  await browsers.classic?.close();
  await browsers.overlay?.close();
});

const THEMES = ['light', 'dark'] as const;
const KINDS = ['classic', 'overlay'] as const;

/** A framed table of the cut frame's stories, by its name, and the box that scrolls it. */
const framed = (name: string): string => `[data-framed="${name}"]`;
const boxOf = (name: string): string => `${framed(name)} [data-table-box]`;

/** The box the scroll bars' story draws shorter than what it holds, and the same box in the story nothing marks the scrolls of. */
const SCROLLER = `${story('look-scrollbars--marked')} [data-scroller]`;
const UNMARKED = 'look-scrollbars--unmarked';
const UNMARKED_SCROLLER = `${story(UNMARKED)} [data-scroller]`;

/** The colours of the named `points` in a picture of the window taken now, as `name`. */
const read = <K extends string>(kind: Bars, page: Page, name: string, points: Record<K, readonly [number, number]>) =>
  coloursOf(browsers[kind], page, path.join(built, `${name}.png`), points);

/** The line under each row of the framed table `name`, as its computed width, top to bottom. */
const linesOf = (page: Page, name: string): Promise<string[]> =>
  page.locator(`${framed(name)} tbody tr`).evaluateAll((rows) => rows.map((row) => getComputedStyle(row).borderBottomWidth));

/** The framed tables with the line under their last row put back. */
const LINED = '[data-framed] tbody tr:last-child { border-bottom-width: 1px !important; }';

test(
  'REFUSED: the last row of a framed table draws no line under it, with one row and with several; a line put back is seen',
  WAITED,
  async () => {
    const page = await openParts(browsers.classic, built, 'dark');
    try {
      assert.deepEqual(await linesOf(page, 'one'), ['0px'], 'one row: no line under it');
      assert.deepEqual(await linesOf(page, 'several'), ['1px', '1px', '0px'], 'several: a line under each row but the last');
      await page.addStyleTag({ content: LINED });
      assert.deepEqual(await linesOf(page, 'one'), ['1px'], 'the line put back is read');
    } finally {
      await page.context().close();
    }
  },
);

/**
 * Where the framed table `name` paints over the ground in a cut corner of its frame, none when the ground shows through both, with
 * the pointer on its last row: two columns of pixels through the bottom-left cut, down to the frame's last row of pixels, where the
 * last row's line was, and a column through the top-right cut, beside the header.
 */
async function cutSpills(kind: Bars, page: Page, name: string, shot: string): Promise<string[]> {
  const { out } = await edgesOf(page, `${framed(name)} [data-cut-frame]`);
  await page
    .locator(`${framed(name)} tbody tr`)
    .last()
    .locator('td')
    .first()
    .hover();
  const rows = [1, 2, 3, 4, 5, 6];
  const points: Record<string, readonly [number, number]> = {
    ground: [out.left - 20, out.top - 20],
    edge: [Math.round((out.left + out.right) / 2), out.top + 1],
    lower: [Math.round((out.left + out.right) / 2), out.top + 2],
    ...Object.fromEntries(
      rows.flatMap((d) => [
        [`the bottom-left cut:${d}a`, [out.left + 3, out.bottom - d]],
        [`the bottom-left cut:${d}b`, [out.left + 10, out.bottom - d]],
        [`the top-right cut:${d}`, [out.right - 3, out.top + d]],
      ]),
    ),
  };
  const { ground, edge, lower, ...found } = await read(kind, page, shot, points);
  const seen = Math.max(apart(edge, ground), apart(lower, ground));
  assert.ok(seen > 8, `the frame's edge is read apart from the ground, on the row a box between two pixels is drawn from: ${seen}`);
  const spilled = Object.entries(found).flatMap(([where, colour]) => (apart(colour, ground) > 3 ? [where.split(':')[0]] : []));
  return [...new Set(spilled)];
}

/** The framed tables with a ground of their own under the header's cells and the rows, as the kit draws a row by default. */
const GROUNDED = '[data-framed] :is(th, tbody tr) { background-color: var(--md-sys-color-surface) !important; }';

for (const theme of THEMES) {
  test(
    `REFUSED: nothing of a framed table is painted in its frame's cut corners, ${theme}; a line put back and a ground are each seen`,
    WAITED,
    async () => {
      const page = await openParts(browsers.classic, built, theme);
      try {
        for (const name of ['one', 'several'])
          assert.deepEqual(
            await cutSpills('classic', page, name, `cut-${name}-${theme}`),
            [],
            `${name}: the ground shows through both cuts`,
          );
        const lined = await page.addStyleTag({ content: LINED });
        assert.deepEqual(
          await cutSpills('classic', page, 'one', `cut-lined-${theme}`),
          ['the bottom-left cut'],
          'the line put back crosses the cut',
        );
        await lined.evaluate((style) => (style as HTMLStyleElement).remove());
        await page.addStyleTag({ content: GROUNDED });
        assert.deepEqual(
          await cutSpills('classic', page, 'one', `cut-grounded-${theme}`),
          ['the bottom-left cut', 'the top-right cut'],
          'a ground under the header and the row paints both cuts over',
        );
      } finally {
        await page.context().close();
      }
    },
  );
}

/** What is wrong with the room the framed tables' boxes take, none when no bar is drawn that nothing scrolls. */
const roomFaults = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const faults: string[] = [];
    const box = (name: string) => document.querySelector<HTMLElement>(`[data-framed="${name}"] [data-table-box]`)!;
    for (const name of ['one', 'several', 'narrow']) {
      const at = box(name);
      if (at.scrollHeight > at.clientHeight) faults.push(`${name}: ${at.scrollHeight} tall inside a box of ${at.clientHeight}`);
      if (at.offsetWidth !== at.clientWidth) faults.push(`${name}: an upright bar takes ${at.offsetWidth - at.clientWidth}`);
    }
    for (const name of ['one', 'several']) {
      const at = box(name);
      if (at.offsetHeight !== at.clientHeight) faults.push(`${name}: a sideways bar takes ${at.offsetHeight - at.clientHeight}`);
    }
    const narrow = box('narrow');
    if (narrow.scrollWidth <= narrow.clientWidth) faults.push('narrow: nothing to scroll sideways');
    if (narrow.offsetHeight - narrow.clientHeight !== 8)
      faults.push(`narrow: its sideways lane is ${narrow.offsetHeight - narrow.clientHeight}`);
    narrow.scrollLeft = 60;
    if (narrow.scrollLeft !== 60) faults.push(`narrow: scrolled sideways to ${narrow.scrollLeft}, not 60`);
    narrow.scrollLeft = 0;
    return faults;
  });

/** The framed tables laid out as a table is by default: what it holds runs past its box. */
const UNCLIPPED = '[data-framed] table { overflow: visible !important; }';

test(
  'REFUSED: a framed table whose rows fit shows no scroll bar, and a narrow one scrolls sideways alone; a table left unclipped is seen',
  WAITED,
  async () => {
    const page = await openParts(browsers.classic, built, 'dark');
    try {
      assert.deepEqual(await roomFaults(page), [], 'no box is taller inside than it is, and no bar takes room where nothing scrolls');
      await page.addStyleTag({ content: UNCLIPPED });
      const faults = await roomFaults(page);
      assert.ok(
        faults.some((fault) => fault.startsWith('one:') && fault.includes('tall inside')),
        `unclipped, the content is taller: ${faults.join('; ')}`,
      );
    } finally {
      await page.context().close();
    }
  },
);

/** A role of the theme as the page computes it, or what it computed when that is no plain colour. */
const inkOf = (page: Page, role: string): Promise<Rgb> =>
  page.evaluate((role) => {
    const probe = document.createElement('i');
    probe.style.backgroundColor = `var(--md-sys-color-${role})`;
    document.body.append(probe);
    const said = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const found = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(said);
    if (!found) throw new Error(`the role ${role} computes to ${said}, no plain colour`);
    return [Number(found[1]), Number(found[2]), Number(found[3])] as [number, number, number];
  }, role);

/** Writes the mark of what scrolls on what `selector` finds, as the board's listener does while it scrolls, or takes it off. */
const mark = (page: Page, selector: string, word: 'shown' | 'rest' | null): Promise<void> =>
  page
    .locator(selector)
    .evaluate((found, word) => (word ? found.setAttribute('data-scroll-bar', word) : found.removeAttribute('data-scroll-bar')), word);

/**
 * Waits until the page, brought to a part by a scroll of the test's own, is marked as scrolling no more: two frames, in which a scroll
 * just made is heard, then for as long as the root's mark reads shown.
 */
async function pageAtRest(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
  await expectNone(
    async () => ((await page.locator('html').getAttribute('data-scroll-bar')) === 'shown' ? 'its root is still marked shown' : null),
    'the page comes to rest',
  );
}

/**
 * What is wrong with the scroll bar of the story's box and of the page, none when each is the look's: an 8-pixel lane the ground
 * shows through at rest; the page's thumb in `outline` while the page is marked as scrolling, the box's unlit by it; and the box's
 * thumb in `outline` while marked, 4 pixels wide, in `on-surface-variant` under the pointer and `on-surface` while held, the lane's
 * whole width. Read with nothing moving, each mark placed by hand.
 */
async function barFaults(kind: Bars, page: Page, shot: string): Promise<string[]> {
  const faults: string[] = [];
  const says = (what: string, found: Rgb, wanted: Rgb) => {
    if (apart(found, wanted) > 3) faults.push(`${what}: ${found.join(' ')}, not ${wanted.join(' ')}`);
  };
  const { out } = await edgesOf(page, SCROLLER);
  await pageAtRest(page);
  const lanes = await page.evaluate((selector) => {
    const box = document.querySelector<HTMLElement>(selector)!;
    const root = document.documentElement;
    return {
      box: box.offsetWidth - box.clientWidth,
      page: innerWidth - root.clientWidth,
      thumb: Math.round(((scrollY + innerHeight / 2) / root.scrollHeight) * innerHeight),
    };
  }, SCROLLER);
  if (lanes.box !== 8) faults.push(`lane: the box's is ${lanes.box} wide`);
  if (lanes.page !== 8) faults.push(`lane: the page's is ${lanes.page} wide`);
  const [outline, variant, surface, floor] = await Promise.all(
    ['outline', 'on-surface-variant', 'on-surface', 'background'].map((role) => inkOf(page, role)),
  );
  const points = {
    ground: [out.right - 40, out.top + 20],
    thumb: [out.right - 4, out.top + 20],
    side: [out.right - 8, out.top + 20],
    lane: [out.right - 4, out.bottom - 20],
    page: [1280 - 4, lanes.thumb],
  } as const;
  const rest = await read(kind, page, `${shot}-rest`, points);
  says('rest: the thumb', rest.thumb, rest.ground);
  says('rest: the lane', rest.lane, rest.ground);
  says("rest: the page's thumb", rest.page, floor);
  await mark(page, 'html', 'shown');
  const paged = await read(kind, page, `${shot}-page`, points);
  says("shown: the page's thumb", paged.page, outline);
  says('shown: the thumb of a box in a page that scrolls', paged.thumb, rest.ground);
  await mark(page, 'html', null);
  await mark(page, SCROLLER, 'shown');
  const shown = await read(kind, page, `${shot}-shown`, points);
  says('shown: the thumb', shown.thumb, outline);
  says("shown: the thumb's side", shown.side, rest.ground);
  says('shown: the lane under the thumb', shown.lane, rest.ground);
  await page.locator(SCROLLER).evaluate((box) => box.setAttribute('data-autoscrolling', ''));
  const following = await read(kind, page, `${shot}-following`, points);
  says('following: the thumb of a box that follows its stream', following.thumb, rest.ground);
  await page.locator(SCROLLER).evaluate((box) => box.removeAttribute('data-autoscrolling'));
  await page.mouse.move(...points.thumb);
  const pointed = await read(kind, page, `${shot}-pointer`, points);
  says('pointer: the thumb', pointed.thumb, variant);
  says("pointer: the thumb's side", pointed.side, variant);
  await page.mouse.down();
  const held = await read(kind, page, `${shot}-held`, points);
  says('held: the thumb', held.thumb, surface);
  await page.mouse.up();
  await page.mouse.move(0, 0);
  await mark(page, SCROLLER, null);
  return faults;
}

/** The board's scroll bars as a browser draws them: its own width, and a thumb the page gives no ink. */
const UNSTYLED = `::-webkit-scrollbar { width: auto !important; height: auto !important; }
::-webkit-scrollbar-thumb { background-color: transparent !important; }`;

for (const kind of KINDS) {
  for (const theme of THEMES) {
    test(`REFUSED: a scroll bar is the look's in a browser whose bars are ${kind}, ${theme}; the rule undone is seen`, WAITED, async () => {
      const page = await openParts(browsers[kind], built, theme, '', { still: true });
      try {
        assert.deepEqual(await barFaults(kind, page, `bar-${kind}-${theme}`), [], 'an 8-pixel lane, the ground at rest, the three inks');
        await page.addStyleTag({ content: UNSTYLED });
        const faults = (await barFaults(kind, page, `bar-${kind}-${theme}-undone`)).map((fault) => fault.split(':')[0]);
        assert.ok(faults.includes('shown') && faults.includes('pointer'), `undone, no ink is read: ${faults.join(' ')}`);
        if (kind === 'classic') assert.ok(faults.includes('lane'), `and the browser's own lane is no 8 pixels: ${faults.join(' ')}`);
      } finally {
        await page.context().close();
      }
    });
  }
}

/** The mark on what `selector` finds, awaited until it reads `word`. */
const marked = (page: Page, selector: string, word: string, what: string): Promise<void> =>
  expectNone(async () => {
    const found = await page.locator(selector).getAttribute('data-scroll-bar');
    return found === word ? null : `its mark reads ${found}`;
  }, what);

/** Turns the wheel over the middle of what `selector` finds, and waits until it has scrolled. */
async function wheelOver(page: Page, selector: string): Promise<void> {
  const box = await page.locator(selector).boundingBox();
  assert.ok(box, `${selector} is drawn`);
  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height, 800) / 2);
  await page.mouse.wheel(0, 120);
  await expectNone(
    async () => ((await page.locator(selector).evaluate((found) => found.scrollTop)) > 0 ? null : 'it has not scrolled'),
    `the wheel scrolls ${selector}`,
  );
}

test(
  'REFUSED: what scrolls is marked shown while it scrolls and at rest after, a box and the page; with nothing listening no mark is written',
  WAITED,
  async () => {
    const page = await openParts(browsers.classic, built, 'dark');
    const unmarked = await openParts(browsers.classic, built, 'dark', `?story=${UNMARKED}`);
    try {
      await page.locator(SCROLLER).scrollIntoViewIfNeeded();
      await marked(page, 'html', 'rest', 'the page, brought to the box, comes to rest');
      await wheelOver(page, SCROLLER);
      await marked(page, SCROLLER, 'shown', 'a box that scrolls is marked shown');
      await marked(page, SCROLLER, 'rest', 'and at rest once it scrolls no more');
      await page.evaluate(() => scrollTo(0, 0));
      await marked(page, 'html', 'rest', 'the page, brought to its top, comes to rest');
      await wheelOver(page, 'html');
      await marked(page, 'html', 'shown', 'the page that scrolls is marked shown, on its root');
      await marked(page, 'html', 'rest', 'and at rest once it scrolls no more');
      await unmarked.locator(UNMARKED_SCROLLER).scrollIntoViewIfNeeded();
      await wheelOver(unmarked, UNMARKED_SCROLLER);
      assert.equal(
        await unmarked.locator(UNMARKED_SCROLLER).getAttribute('data-scroll-bar'),
        null,
        'nothing listening, a box that scrolled has no mark',
      );
      assert.equal(await unmarked.locator('html').getAttribute('data-scroll-bar'), null, 'nor has the page');
    } finally {
      await page.context().close();
      await unmarked.context().close();
    }
  },
);

/** Where the sideways thumb of the narrow framed table, at its left end and marked as scrolling, is painted in the bottom-left cut. */
async function thumbInCut(page: Page, shot: string): Promise<string[]> {
  await mark(page, boxOf('narrow'), 'shown');
  const spills = await cutSpills('classic', page, 'narrow', shot);
  const { out } = await edgesOf(page, boxOf('narrow'));
  const { thumb, ground } = await read('classic', page, `${shot}-thumb`, {
    thumb: [out.left + 40, out.bottom - 5],
    ground: [out.left + 40, out.bottom - 20],
  });
  assert.ok(apart(thumb, ground) > 20, `the sideways thumb is drawn past the cut: ${thumb.join(' ')} on ${ground.join(' ')}`);
  return spills;
}

/** Lays what `selector` finds out again from nothing: a scroll bar already laid out keeps the track it had under a style added since. */
const laidOutAgain = (page: Page, selector: string): Promise<void> =>
  page.locator(selector).evaluate((found) => {
    const box = found as HTMLElement;
    box.style.display = 'none';
    void box.offsetHeight;
    box.style.display = '';
  });

/** The sideways scroll bars with their track from the box's very left. */
const UNSET_TRACK = '::-webkit-scrollbar-track { margin: 0 !important; }';

test(
  "REFUSED: the sideways thumb of a framed table starts past its frame's bottom-left cut; a track from the box's left is seen",
  WAITED,
  async () => {
    const page = await openParts(browsers.classic, built, 'dark', '', { still: true });
    try {
      assert.deepEqual(await thumbInCut(page, 'thumb-clear'), [], 'the ground shows through the cut, the thumb beside it');
      await page.addStyleTag({ content: UNSET_TRACK });
      await laidOutAgain(page, boxOf('narrow'));
      assert.deepEqual(await thumbInCut(page, 'thumb-in-cut'), ['the bottom-left cut'], 'from the left, the thumb is painted in the cut');
    } finally {
      await page.context().close();
    }
  },
);

import path from 'node:path';
import type { Browser, Page } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectNone, facesLoaded, idle, Refused } from '../checks.ts';
import { launch, type Bars, type PageSpec } from '../visit.ts';
import { OUT, photographing } from '../world.ts';

/** The two tables' boxes, each with what the page says of it. */
const BOXES = [
  ['section[data-section="in-flight"] [data-table-box]', 'the table in flight'],
  ['section[data-section="finished"] [data-table-box]', 'the finished table'],
] as const;

/** What a box that scrolls measures: its content against its own room, and its room against its border box. */
const measured = (page: Page, selector: string) =>
  page.locator(selector).evaluate((found) => {
    const box = found as HTMLElement;
    return {
      inside: [box.scrollWidth, box.scrollHeight],
      room: [box.clientWidth, box.clientHeight],
      upright: box.offsetWidth - box.clientWidth,
    };
  });

/** Each table's box is no taller inside than its content: nothing it holds makes it scroll upright. */
async function boxesFit(page: Page): Promise<void> {
  for (const [selector, what] of BOXES) {
    const { inside, room } = await measured(page, selector);
    if (inside[1] > room[1]) throw new Refused(`${what} is no taller inside than its box — ${inside[1]} inside a box of ${room[1]}`);
  }
}

/** The last row of each table draws no line under it and the row before it does; the pager stands under a line of its own. */
async function lastRowsClose(page: Page): Promise<void> {
  for (const [selector, what] of BOXES) {
    const lines = await page
      .locator(`${selector} tbody tr`)
      .evaluateAll((rows) => rows.map((row) => getComputedStyle(row).borderBottomWidth));
    if (lines.length < 2) throw new Refused(`${what} holds two rows at least, a last and one before it — ${lines.length}`);
    const wanted = lines.map((_, i) => (i === lines.length - 1 ? '0px' : '1px'));
    if (lines.join(' ') !== wanted.join(' ')) throw new Refused(`${what}: a line under every row but the last — ${lines.join(' ')}`);
  }
  await expectCount(page.locator('[data-pager-box]'), 1, 'the pager stands in a box of its own');
  const over = await page.locator('[data-pager-box]').evaluate((box) => getComputedStyle(box).borderTopWidth);
  if (over !== '1px') throw new Refused(`the pager stands under a line of its own — its top line is ${over}`);
}

/**
 * A page of the finished runs past the last, in a tab of its own: it holds no row, so no table is drawn, and the pager, which says
 * why, stands under no line: nothing is there to part it from.
 */
async function noRowsNoLine(page: Page): Promise<void> {
  const other = await page.context().newPage();
  try {
    await other.goto(new URL('/runs?page=99', page.url()).href, { waitUntil: 'load' });
    await idle(other);
    await expectCount(other.locator('section[data-section="finished"] [data-pager-box]'), 1, 'past the last page, the pager is drawn');
    await expectCount(other.locator('section[data-section="finished"] table'), 0, 'and no table, for no row');
    const over = await other.locator('[data-pager-box]').evaluate((box) => getComputedStyle(box).borderTopWidth);
    if (over !== '0px') throw new Refused(`with no row the pager stands under no line — its top line is ${over}`);
  } finally {
    await other.close();
  }
}

/** The mark on the page's root, awaited until it reads `word`. */
const rootMarked = (page: Page, word: string, what: string): Promise<void> =>
  expectNone(async () => {
    const found = await page.locator('html').getAttribute('data-scroll-bar');
    return found === word ? null : `the root's mark reads ${found}`;
  }, what);

/** The page that scrolls is marked while it scrolls and at rest after, by the frame's own listener; then put back at its top. */
async function pageIsMarked(page: Page): Promise<void> {
  await page.mouse.move(640, 400);
  await page.mouse.wheel(0, 200);
  await rootMarked(page, 'shown', 'the page that scrolls is marked shown');
  await rootMarked(page, 'rest', 'and at rest once it scrolls no more');
  await page.evaluate(() => scrollTo(0, 0));
  await rootMarked(page, 'rest', 'put back at its top, it comes to rest');
}

/** The page `from` is on, opened in a window of `browser` in the same theme, `scale` times as fine, once its reads are answered. */
async function sameIn(browser: Browser, from: Page, width: number, height: number, scale = 1): Promise<Page> {
  const theme = (await themeOf(from)) as 'light' | 'dark';
  const context = await browser.newContext({
    colorScheme: theme,
    viewport: { width, height },
    deviceScaleFactor: scale,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.goto(from.url(), { waitUntil: 'load' });
  await facesLoaded(page);
  await idle(page);
  return page;
}

/**
 * In a browser whose bars take room: no table's box gives room to an upright bar; the page, longer than its window, keeps the look's
 * 8-pixel lane; the sidebar's list, in a window shorter than it, keeps the same lane; and 390 wide, the table in flight is narrower
 * than its columns and scrolls sideways, still with no upright bar.
 */
async function barsTakeTheLooksRoom(from: Page): Promise<void> {
  const browser = await launch('classic');
  try {
    const page = await sameIn(browser, from, 1280, 800);
    for (const [selector, what] of BOXES) {
      const { upright } = await measured(page, selector);
      if (upright !== 0) throw new Refused(`${what} shows no upright scroll bar — one takes ${upright} pixels`);
    }
    const lane = await page.evaluate(() => ({
      taken: innerWidth - document.documentElement.clientWidth,
      scrolls: document.documentElement.scrollHeight > innerHeight,
    }));
    if (!lane.scrolls || lane.taken !== 8)
      throw new Refused(`the page is longer than its window and keeps an 8-pixel lane — ${JSON.stringify(lane)}`);
    await page.setViewportSize({ width: 1280, height: 300 });
    const list = await measured(page, '[data-rail-scroll]');
    if (list.inside[1] <= list.room[1] || list.upright !== 8)
      throw new Refused(`the rail, longer than a short window, keeps an 8-pixel lane — ${JSON.stringify(list)}`);
    await page.setViewportSize({ width: 390, height: 844 });
    const narrow = await measured(page, BOXES[0][0]);
    if (narrow.inside[0] <= narrow.room[0] || narrow.upright !== 0 || narrow.inside[1] > narrow.room[1])
      throw new Refused(`390 wide, the table in flight scrolls sideways and not upright — ${JSON.stringify(narrow)}`);
    const moved = await page.locator(BOXES[0][0]).evaluate((box) => {
      box.scrollLeft = 80;
      return box.scrollLeft;
    });
    if (moved !== 80) throw new Refused(`390 wide, the table in flight is scrolled sideways by 80 — it stands at ${moved}`);
  } finally {
    await browser.close();
  }
}

/** Marks what `selector` finds as scrolling, as the frame's listener does, once any mark of its own has come to rest. */
async function shown(page: Page, selector: string): Promise<void> {
  await expectNone(
    async () =>
      (await page.locator(selector).getAttribute('data-scroll-bar')) === 'shown' ? 'it is still marked by a scroll of its own' : null,
    `${selector} is at rest`,
  );
  await page.locator(selector).evaluate((found) => found.setAttribute('data-scroll-bar', 'shown'));
}

/**
 * The page's pictures in a browser whose bars are `kind`, each bar marked as scrolling so that it is seen: the window with the
 * page's own bar; 390 wide, the table in flight with its sideways bar; in a window 300 tall, the sidebar's list with its bar; and the
 * window's top-right corner four times as large, the thumb and the lane beside the scan lines.
 */
async function pictured(from: Page, kind: Bars): Promise<void> {
  const browser = await launch(kind);
  const theme = await themeOf(from);
  const fileOf = (what: string) => path.join(OUT, `runs-bars-${what}-${kind}-${theme}.png`);
  try {
    const page = await sameIn(browser, from, 1280, 800);
    await shown(page, 'html');
    await photograph(page, fileOf('page'));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator(BOXES[0][0]).evaluate((box) => box.scrollIntoView({ block: 'center' }));
    await shown(page, 'html');
    await shown(page, BOXES[0][0]);
    await photograph(page, fileOf('table'));
    const short = await sameIn(browser, from, 1280, 300);
    await shown(short, '[data-rail-scroll]');
    await photograph(short, fileOf('rail'));
    const large = await sameIn(browser, from, 1280, 800, 4);
    await shown(large, 'html');
    await photograph(large, fileOf('lane'), { clip: { x: 1280 - 200, y: 0, width: 200, height: 260 } });
  } finally {
    await browser.close();
  }
}

export default {
  /**
   * The runs page's tables and scroll bars, as a browser that draws scroll bars shows them: no table's box is taller inside than its
   * content, the last row of each draws no line and the pager stands under its own, or under none past the last page, and the page
   * is marked while it scrolls; in a browser whose bars take room, which the page opens itself, no table shows an upright bar, the
   * page and the sidebar's list keep the look's lane, and the narrow table scrolls sideways. Pictured in that browser and in one
   * whose bars float. Writes nothing.
   */
  name: 'runs-bars',
  route: '/runs',
  expect: async (page) => {
    await boxesFit(page);
    await lastRowsClose(page);
    await noRowsNoLine(page);
    await pageIsMarked(page);
    await barsTakeTheLooksRoom(page);
    if (photographing) for (const kind of ['classic', 'overlay'] as const) await pictured(page, kind);
  },
} satisfies PageSpec;

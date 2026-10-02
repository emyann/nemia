import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled } from '../checks.ts';
import { FACTORIES } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The factory whose start the page opens in the bar. */
const FACTORY = FACTORIES.hiring.name;
/** The floor the page starts on. */
const FLOOR = `/factories/${FACTORY}`;
/** The bar's value in the address, on any page. */
const OPEN = `start:${FACTORY}`;
/** The key this browser keeps the bar's width under. */
const WIDTH_KEY = 'nemia:bar-width';
/** How far the page drags the bar's edge to the left, in pixels. */
const DRAG = 120;
/** How far one arrow key moves the edge, in pixels. */
const STEP = 16;

/** The bar on the start of a run in FACTORY. */
const barOf = (page: Page) => page.getByRole('complementary', { name: `Start a run in ${FACTORY}` });

/** What the address's search holds for `bar`, or null. */
const barInUrl = (page: Page) => new URL(page.url()).searchParams.get('bar');

/** The box of `target`, refused when it is not drawn. */
async function boxOf(target: Locator, what: string) {
  const box = await target.boundingBox();
  if (!box) throw new Refused(`${what} is drawn`);
  return box;
}

/** Goes to `to` in this tab and waits for its reads. */
async function visit(page: Page, to: string): Promise<void> {
  await page.goto(new URL(to, page.url()).href, { waitUntil: 'load' });
  await idle(page);
}

/** Presses the header's Start a run and waits for the bar it opens. */
async function openFromHeader(page: Page): Promise<Locator> {
  await page.locator('header').getByRole('button', { name: 'Start a run' }).click();
  const bar = barOf(page);
  await expectVisible(bar, "the header's Start a run opens the floating bar");
  return bar;
}

/** Refuses unless the address names no bar on `pathname`, and none is drawn. */
async function expectClosed(page: Page, pathname: string, assertion: string): Promise<void> {
  await expectCount(barOf(page), 0, assertion);
  const url = new URL(page.url());
  if (url.searchParams.has('bar') || url.pathname !== pathname)
    throw new Refused(`${assertion}: the address keeps ${pathname} and loses bar — it is ${url.pathname}${url.search}`);
}

/** The bar floats: the page under it keeps its width, and it sits below the header. A picture of it open. */
async function floats(page: Page): Promise<void> {
  const main = page.locator('main');
  const before = (await boxOf(main, 'the page')).width;
  const bar = await openFromHeader(page);
  if (barInUrl(page) !== OPEN) throw new Refused(`the address names the bar as bar=${OPEN} — it is ${page.url()}`);
  const after = (await boxOf(main, 'the page')).width;
  if (Math.abs(after - before) > 1) throw new Refused(`the page keeps its width under the bar — ${before} became ${after}`);
  const header = await boxOf(page.locator('header'), 'the header');
  const box = await boxOf(bar, 'the bar');
  if (box.y < header.y + header.height - 1)
    throw new Refused(`the bar sits below the header — its top is ${box.y}, the header's foot ${header.y + header.height}`);
  await settled(page);
  await photograph(page, path.join(OUT, `floating-bar-open-${await themeOf(page)}.png`));
}

/** The address is the bar's: a reload keeps it, Back closes it, it opens on another page, and a link to another page closes it. */
async function inTheAddress(page: Page): Promise<void> {
  await page.reload({ waitUntil: 'load' });
  await idle(page);
  await expectVisible(barOf(page), 'a reload keeps the bar open');
  await page.goBack({ waitUntil: 'load' });
  await expectClosed(page, FLOOR, 'Back closes the bar');
  await visit(page, `/runs?bar=${OPEN}`);
  await expectVisible(barOf(page), 'the same address opens the same bar on the Runs page');
  await expectVisible(page.locator('header', { hasText: 'Runs' }), 'with the Runs page under it');
  await page.locator('[data-sidebar="sidebar"]').getByRole('link', { name: 'Inbox' }).click();
  await idle(page);
  await expectClosed(page, '/inbox', 'a link to another page closes the bar');
}

/** Escape closes the bar, from inside it and from the page, in place of the history entry; so does its Close button. */
async function closes(page: Page): Promise<void> {
  await visit(page, FLOOR);
  let bar = await openFromHeader(page);
  if (!(await bar.evaluate((el) => el.contains(document.activeElement)))) throw new Refused('the bar takes the focus as it opens');
  await page.keyboard.press('Escape');
  await expectClosed(page, FLOOR, 'Escape inside the bar closes it');
  await page.goBack({ waitUntil: 'load' });
  await expectClosed(page, FLOOR, 'and replaces its entry: Back after closing it does not open it again');
  await openFromHeader(page);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Escape');
  await expectClosed(page, FLOOR, 'Escape with the focus on the page closes the bar');
  bar = await openFromHeader(page);
  await bar.getByRole('button', { name: 'Close' }).click();
  await expectClosed(page, FLOOR, 'its Close button closes the bar');
}

/** The bar's width: dragged, moved with the keys, the same on another page and after a reload. */
async function resizes(page: Page): Promise<void> {
  await visit(page, FLOOR);
  const bar = await openFromHeader(page);
  const edge = bar.getByRole('separator', { name: 'Resize the bar' });
  const start = (await boxOf(bar, 'the bar')).width;
  const grip = await boxOf(edge, "the bar's edge");
  const x = grip.x + grip.width / 2;
  const y = grip.y + grip.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - DRAG, y, { steps: 12 });
  await page.mouse.up();
  const dragged = (await boxOf(bar, 'the bar')).width;
  if (Math.abs(dragged - (start + DRAG)) > 2)
    throw new Refused(`dragging the edge ${DRAG} pixels left widens the bar by as much — ${start} became ${dragged}`);
  await edge.focus();
  await page.keyboard.press('ArrowRight');
  const keyed = (await boxOf(bar, 'the bar')).width;
  if (Math.abs(keyed - (dragged - STEP)) > 1)
    throw new Refused(`ArrowRight on the edge narrows the bar by ${STEP} — ${dragged} became ${keyed}`);
  await visit(page, `/inbox?bar=${OPEN}`);
  const elsewhere = (await boxOf(barOf(page), 'the bar on the Inbox')).width;
  if (Math.abs(elsewhere - keyed) > 1)
    throw new Refused(`the bar is as wide on every page — ${keyed} on the floor, ${elsewhere} on the Inbox`);
  await page.reload({ waitUntil: 'load' });
  await idle(page);
  const reloaded = (await boxOf(barOf(page), 'the bar after a reload')).width;
  if (Math.abs(reloaded - keyed) > 1) throw new Refused(`this browser keeps the width across a reload — ${keyed} became ${reloaded}`);
}

/** On a phone's screen the bar is the whole width, with no edge to drag, under the menu's sheet, which Escape closes alone. */
async function onPhone(page: Page): Promise<void> {
  const size = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  try {
    await visit(page, `${FLOOR}?bar=${OPEN}`);
    const bar = barOf(page);
    await expectVisible(bar, 'the bar opens on a phone');
    const box = await boxOf(bar, 'the bar on a phone');
    if (Math.abs(box.x) > 1 || Math.abs(box.width - 390) > 1)
      throw new Refused(`on a phone the bar is the screen's whole width — it is ${box.width} wide at ${box.x}`);
    await expectCount(bar.getByRole('separator'), 0, 'with no edge to drag');
    await settled(page);
    await photograph(page, path.join(OUT, `floating-bar-narrow-${await themeOf(page)}.png`));
    await page.locator('header').locator('[data-sidebar="trigger"]').click();
    const menu = page.getByRole('dialog');
    await expectVisible(menu, "the header's menu button opens the menu over the bar");
    await page.keyboard.press('Escape');
    await expectCount(menu, 0, 'Escape closes the menu');
    await expectVisible(bar, 'and leaves the bar open: the menu took the key');
  } finally {
    if (size) await page.setViewportSize(size);
  }
}

export default {
  /**
   * The frame's floating bar, opened by the header's Start a run on a factory's floor: it floats over the page below the header, and the
   * page keeps its width. The address holds it, `?bar=start:<factory>`, the same on every page: a reload keeps it, Back closes it, and a
   * link to another page closes it. Escape and its Close button close it, Escape in place of its history entry, and a menu that takes
   * Escape keeps it. Its edge resizes it, by pointer and by the arrow keys, and this browser keeps one width for every page. On a phone it
   * is the screen's whole width. The width kept and the window's size are taken back.
   */
  name: 'floating-bar',
  route: FLOOR,
  expect: async (page) => {
    try {
      await floats(page);
      await inTheAddress(page);
      await closes(page);
      await resizes(page);
      await onPhone(page);
    } finally {
      await page.evaluate((key) => localStorage.removeItem(key), WIDTH_KEY);
    }
  },
} satisfies PageSpec;

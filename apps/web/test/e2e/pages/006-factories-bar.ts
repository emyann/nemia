import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectInside, expectLeftOf, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import { FACTORIES } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The factory the page inspects, and the one it switches to: last in the grid, in its right-hand column, where the bar opens over it. */
const [HIRING, LAST] = [FACTORIES.hiring.name, FACTORIES.others[2]];

/** The canvas's frame. */
const canvasOf = (page: Page) => page.locator('.react-flow').first();

/** The block of the factory `name`. */
const blockOf = (page: Page, name: string) => canvasOf(page).locator(`.react-flow__node [data-factory="${name}"]`);

/** The bar showing the factory `name`. */
const factoryBar = (page: Page, name: string) => page.locator(`aside[data-bar="factory:${name}"]`);

/** What the address's search holds for `bar`, or null. */
const barInUrl = (page: Page) => new URL(page.url()).searchParams.get('bar');

/** Goes to `to` in this tab and waits for its reads. */
async function visit(page: Page, to: string): Promise<void> {
  await page.goto(new URL(to, page.url()).href, { waitUntil: 'load' });
  await idle(page);
}

/** Refuses unless no bar is drawn and the address names none. */
async function expectNoBar(page: Page, assertion: string): Promise<void> {
  await expectCount(page.locator('aside[data-bar]'), 0, assertion);
  if (barInUrl(page) !== null) throw new Refused(`${assertion}: the address names no bar — it is ${page.url()}`);
}

/** Refuses unless the bar shows the factory `name`, the address names it, and its block alone is marked as inspected. */
async function expectFactory(page: Page, name: string, assertion: string): Promise<Locator> {
  const bar = factoryBar(page, name);
  await expectVisible(bar, assertion);
  if (barInUrl(page) !== `factory:${name}`) throw new Refused(`${assertion}: the address names bar=factory:${name} — it is ${page.url()}`);
  await expectVisible(canvasOf(page).locator(`[data-factory="${name}"][data-inspected]`), `${assertion}: its block is ringed`);
  await expectCount(canvasOf(page).locator('[data-inspected]'), 1, `${assertion}: and no other block is`);
  return bar;
}

/** Refuses unless the page reaches `pathname` within the wait. */
async function expectAt(page: Page, pathname: string, assertion: string): Promise<void> {
  try {
    await page.waitForURL((url) => url.pathname === pathname, { timeout: WAIT_MS });
  } catch {
    throw new Refused(`${assertion} — the page is at ${page.url()}`);
  }
}

/** Clicks a point of the canvas with nothing drawn on it, where the click lands on the empty pane. */
async function clickPane(page: Page): Promise<void> {
  const spot = await canvasOf(page).evaluate((canvas) => {
    const box = canvas.getBoundingClientRect();
    for (let y = box.top + box.height - 24; y > box.top + 24; y -= 24)
      for (let x = box.left + box.width / 2; x > box.left + 24; x -= 24)
        if (document.elementFromPoint(x, y)?.classList.contains('react-flow__pane')) return { x, y };
    return null;
  });
  if (!spot) throw new Refused('the canvas has an empty spot to click');
  await page.mouse.click(spot.x, spot.y);
}

/**
 * A click on a block shows its factory, the block brought whole onto the canvas, and it and the canvas's controls clear of the bar; again
 * closes it; another switches it.
 */
async function presses(page: Page): Promise<void> {
  await blockOf(page, LAST).click();
  const bar = await expectFactory(page, LAST, `a click on ${LAST}'s block shows the factory in the bar`);
  await settled(page);
  const node = canvasOf(page).locator(`.react-flow__node[data-id="${LAST}"]`);
  await expectInside(
    node,
    canvasOf(page),
    `${LAST}'s block, in the right-hand column where the bar opens, is brought whole onto the canvas`,
  );
  await expectLeftOf(node, bar, 'left of the bar');
  await expectLeftOf(canvasOf(page).locator('.react-flow__controls'), bar, "and the canvas's zoom controls");
  await photograph(page, path.join(OUT, `factories-bar-last-${await themeOf(page)}.png`));
  await blockOf(page, LAST).click();
  await expectNoBar(page, `a click on ${LAST}'s block again closes the bar`);
  await expectCount(canvasOf(page).locator('[data-inspected]'), 0, 'and no block is ringed');

  await settled(page);
  await blockOf(page, HIRING).click();
  await expectFactory(page, HIRING, `a click on ${HIRING}'s block shows it`);
  await settled(page);
  await blockOf(page, LAST).click();
  await expectFactory(page, LAST, `a click on ${LAST}'s block then switches the bar to it`);
  await settled(page);
  await clickPane(page);
  await expectNoBar(page, 'a click on the empty canvas closes the bar');
}

/**
 * The bar says what the block says: the factory's repositories, what its runs are doing and what it offers, or why its file does not
 * read.
 */
async function contents(page: Page): Promise<void> {
  await canvasOf(page).locator(`.react-flow__node[data-id="${HIRING}"]`).focus();
  await page.keyboard.press('Enter');
  const bar = await expectFactory(page, HIRING, `Enter on ${HIRING}'s block shows it in the bar`);
  await expectVisible(bar.getByRole('heading', { name: HIRING }), `the bar is titled ${HIRING}`);
  await expectVisible(bar.getByText('on checkout', { exact: true }), 'and says it works on the checkout, by its folder');
  await expectVisible(bar.locator('[data-runs]', { hasText: /^0 in flight · 1 run$/ }), 'what its runs are doing, as its block says it');
  await expectVisible(bar.locator('[data-offer]', { hasText: /^1 workflow · 1 hire$/ }), 'and what it offers');
  await settled(page);
  await photograph(page, path.join(OUT, `factories-bar-open-${await themeOf(page)}.png`));

  const { broken } = FACTORIES;
  await settled(page);
  await blockOf(page, broken).click();
  const why = await expectFactory(page, broken, `a click on ${broken}'s block shows it`);
  await expectVisible(
    why.locator('[data-error]', { hasText: /^Its file does not read: [\s\S]*repos/ }),
    'and why its file does not read, whole',
  );
  await settled(page);
  await photograph(page, path.join(OUT, `factories-bar-broken-${await themeOf(page)}.png`));
  await page.keyboard.press('Escape');
  await expectNoBar(page, 'Escape closes it');
}

/** The bar's Open and a double click on a block each open the factory's floor, with no bar. */
async function opens(page: Page): Promise<void> {
  await blockOf(page, HIRING).click();
  const bar = await expectFactory(page, HIRING, `a click on ${HIRING}'s block shows it`);
  await bar.getByRole('link', { name: 'Open', exact: true }).click();
  await expectAt(page, `/factories/${HIRING}`, "the bar's Open opens the factory's floor");
  await visit(page, '/');
  await blockOf(page, HIRING).dblclick();
  await expectAt(page, `/factories/${HIRING}`, `a double click on ${HIRING}'s block opens its floor`);
  if (barInUrl(page) !== null) throw new Refused(`the floor opens with no bar — it is ${page.url()}`);
  await visit(page, '/');
}

/** The start of a run in the bar survives a click on the empty canvas, and its Close closes it. */
async function start(page: Page): Promise<void> {
  const value = `start:${HIRING}`;
  await visit(page, `/?bar=${value}`);
  const bar = page.locator(`aside[data-bar="${value}"]`);
  await expectVisible(bar, 'the start of a run opens in the bar on the Factories');
  await clickPane(page);
  await expectVisible(bar, 'a click on the empty canvas leaves the start of a run open');
  if (barInUrl(page) !== value) throw new Refused(`and the address keeps bar=${value} — it is ${page.url()}`);
  await bar.getByRole('button', { name: 'Close', exact: true }).click();
  await expectNoBar(page, 'its Close closes it');
}

export default {
  /**
   * The Factories and the frame's bar: a click or Enter on a block shows its factory in the bar, ringed, with the block and the canvas's
   * controls clear of the bar; again, or the empty canvas, closes it, and another block switches it. The factory bar says what the block
   * says: its repositories, its runs and what it offers, or why its file does not read. Open and a double click open the factory's floor.
   * The start of a run is not closed by the canvas.
   */
  name: 'factories-bar',
  route: '/',
  expect: async (page) => {
    await presses(page);
    await contents(page);
    await opens(page);
    await start(page);
  },
} satisfies PageSpec;

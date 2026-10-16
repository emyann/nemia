import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectInside, expectLeftOf, expectNone, expectUncut, expectVisible, Refused, settled } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The state the page inspects first: one a person's close leaves, to `ending`. */
const ASKS = 'input-required';

/** Another state of the lifecycle, the bar switched to. */
const WORKS = 'working';

/** The lifecycle's drawing on the Machines page. */
const frameOf = (page: Page) => page.locator('section[aria-label="A task\'s lifecycle"] [data-machine="lifecycle"]');

/** The node of the state `state` on the lifecycle's drawing. */
const nodeOf = (page: Page, state: string) => frameOf(page).locator(`.react-flow__node[data-id="${state}"]`);

/** The bar showing the state `state` of the lifecycle. */
const stateBar = (page: Page, state: string) => page.locator(`aside[data-bar="state:lifecycle/${state}"]`);

/** What the address's search holds for `bar`, or null. */
const barInUrl = (page: Page) => new URL(page.url()).searchParams.get('bar');

/** Refuses unless no bar is drawn, the address names none, and no state is ringed. */
async function expectNoBar(page: Page, assertion: string): Promise<void> {
  await expectCount(page.locator('aside[data-bar]'), 0, assertion);
  if (barInUrl(page) !== null) throw new Refused(`${assertion}: the address names no bar — it is ${page.url()}`);
  await expectCount(page.locator('[data-inspected]'), 0, `${assertion}: and no state is ringed`);
}

/** Refuses unless the bar shows the lifecycle's state `state`, the address names it, and its node alone on the page is ringed. */
async function expectState(page: Page, state: string, assertion: string): Promise<Locator> {
  const bar = stateBar(page, state);
  const value = `state:lifecycle/${state}`;
  await expectVisible(bar, assertion);
  if (barInUrl(page) !== value) throw new Refused(`${assertion}: the address names bar=${value} — it is ${page.url()}`);
  await expectVisible(nodeOf(page, state).locator('[data-inspected]'), `${assertion}: its node is ringed`);
  await expectCount(page.locator('[data-inspected]'), 1, `${assertion}: and no other node on the page is`);
  return bar;
}

/** What the focus stands on: a state's name where it is on a node of the drawing, the tag's name elsewhere, and null for nothing. */
const focusedOn = (page: Page): Promise<string | null> =>
  page.evaluate(() => {
    const now = document.activeElement;
    if (now === null || now === document.body) return null;
    return now.classList.contains('react-flow__node') ? now.getAttribute('data-id') : now.tagName.toLowerCase();
  });

/** Refuses unless the focus stands on `what` — a state's name, or null for nothing — within the wait. */
async function expectFocus(page: Page, what: string | null, assertion: string): Promise<void> {
  await expectNone(async () => {
    const now = await focusedOn(page);
    return now === what ? null : `the focus is on ${now ?? 'nothing'}`;
  }, assertion);
}

/** Clicks a point of the lifecycle's drawing with nothing drawn on it, where the click lands on the empty pane. */
async function clickPane(page: Page): Promise<void> {
  const spot = await frameOf(page).evaluate((frame) => {
    const box = frame.getBoundingClientRect();
    for (let y = box.top + 8; y < box.bottom - 8; y += 12)
      for (let x = box.left + 8; x < box.right - 8; x += 12)
        if (document.elementFromPoint(x, y)?.classList.contains('react-flow__pane')) return { x, y };
    return null;
  });
  if (!spot) throw new Refused("the lifecycle's drawing has an empty spot to click");
  await page.mouse.click(spot.x, spot.y);
}

/**
 * A click on a state shows it in the bar, its node clear of the bar and whole on its narrowed drawing; the bar says its kind, what keeps
 * it there and each route out with its edges and verbs, and has no Open.
 */
async function shows(page: Page): Promise<void> {
  await nodeOf(page, ASKS).scrollIntoViewIfNeeded();
  await nodeOf(page, ASKS).click();
  const bar = await expectState(page, ASKS, `a click on ${ASKS}'s node shows the state in the bar`);
  await expectVisible(bar.getByRole('heading', { name: ASKS }), `the bar is titled ${ASKS}`);
  await expectVisible(bar.getByText("a state of A task's lifecycle"), "and says it is a state of a task's lifecycle");
  await expectVisible(bar.locator('[data-state-kind="state"]'), 'its kind: neither where the machine starts nor where it ends');
  const ending = bar.locator('[data-route-out="ending"]');
  await expectVisible(ending.locator('[data-route-verb="close [awaitsWord]"]'), "its route out to ending, with a person's close");
  await expectCount(bar.getByRole('link', { name: 'Open', exact: true }), 0, 'a state has no page: the bar has no Open');
  await expectCount(bar.getByRole('button', { name: 'Open', exact: true }), 0, 'nor an Open button');
  await settled(page);
  const node = nodeOf(page, ASKS);
  await expectLeftOf(node, bar, `${ASKS}'s node is clear of the bar`);
  await expectInside(node, frameOf(page), 'and whole on its narrowed drawing');
  await expectUncut(bar.locator('[data-edge-line], [data-route-verb]'), "every line of the bar's routes read whole");
  await photograph(page, path.join(OUT, `machines-bar-open-${await themeOf(page)}.png`));
}

/**
 * Again closes it; another state switches it; the empty canvas closes it and gives the focus back to no node, so Enter on the state
 * focused next shows that one; Escape closes it; a double click stays on the page, showing the state its first click showed.
 */
async function presses(page: Page): Promise<void> {
  await nodeOf(page, ASKS).click();
  await expectNoBar(page, `a click on ${ASKS}'s node again closes the bar`);
  await settled(page);

  await nodeOf(page, WORKS).click();
  await expectState(page, WORKS, `a click on ${WORKS}'s node shows it`);
  await settled(page);
  await nodeOf(page, ASKS).click();
  await expectState(page, ASKS, `a click on ${ASKS}'s node then switches the bar to it`);
  await settled(page);
  await clickPane(page);
  await expectNoBar(page, 'a click on the empty drawing closes the bar');
  await expectFocus(page, null, 'and leaves the focus where the press put it, on nothing: no node is given it back');

  await nodeOf(page, WORKS).focus();
  await expectFocus(page, WORKS, `the focus moves to ${WORKS}'s node, and nothing takes it back`);
  await page.keyboard.press('Enter');
  await expectState(page, WORKS, `Enter on ${WORKS}'s node shows it in the bar`);
  await page.keyboard.press('Escape');
  await expectNoBar(page, 'Escape closes it');

  await settled(page);
  await nodeOf(page, ASKS).dblclick();
  await expectState(page, ASKS, `a double click on ${ASKS}'s node shows it, as its first click does`);
  if (new URL(page.url()).pathname !== '/machines') throw new Refused(`and stays on the Machines page — it is ${page.url()}`);
  await page.keyboard.press('Escape');
  await expectNoBar(page, 'Escape closes it again');
}

export default {
  /**
   * The Machines page and the frame's bar: a click, Enter or a double click on a state shows it in the bar, ringed, clear of the bar, and
   * a state has no page, so the bar has no Open and a double click stays on the page; the bar says the state's kind and each route out
   * with its edges and verbs; again, the empty drawing or Escape closes it, and another state switches it.
   */
  name: 'machines-bar',
  route: '/machines',
  expect: async (page) => {
    await shows(page);
    await presses(page);
  },
} satisfies PageSpec;

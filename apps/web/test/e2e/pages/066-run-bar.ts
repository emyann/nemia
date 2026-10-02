import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { photograph, stepBar, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import { FAKE, FOLDER } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The run's page the page reads. */
const RUN = `/runs/${FAKE.id}`;
/** The step the page presses first, and the one it switches to. */
const [FIRST, OTHER] = [FAKE.unverified, 'review'];

/** A window wide enough for the run's steps to be fitted beside the bar at the canvas's least zoom. */
const WIDE = { width: 1920, height: 1080 };

/** The section that holds the run's canvas. */
const graphOf = (page: Page) => page.locator(`section[aria-label="The run's steps as a graph"]`);

/** The node of the step `step` on the run's canvas. */
const nodeOf = (page: Page, step: string) => graphOf(page).locator(`.react-flow__node[data-id="${step}"]`);

/** What the address's search holds for `bar`, or null. */
const barInUrl = (page: Page) => new URL(page.url()).searchParams.get('bar');

/** Goes to `to` in this tab and waits for its reads. */
async function visit(page: Page, to: string): Promise<void> {
  await page.goto(new URL(to, page.url()).href, { waitUntil: 'load' });
  await idle(page);
}

/** Refuses unless no bar is drawn and the address names none, on the run's page. */
async function expectClosed(page: Page, assertion: string): Promise<void> {
  await expectCount(page.locator('aside[data-bar]'), 0, assertion);
  const url = new URL(page.url());
  if (url.searchParams.has('bar') || url.pathname !== RUN)
    throw new Refused(`${assertion}: the address keeps ${RUN} and names no bar — it is ${url.pathname}${url.search}`);
}

/** Refuses unless the bar shows `step`, and the address names it. */
async function expectShows(page: Page, step: string, assertion: string): Promise<Locator> {
  const bar = stepBar(page, FAKE.id, step);
  await expectVisible(bar, assertion);
  if (barInUrl(page) !== `step:${FAKE.id}/${step}`)
    throw new Refused(`${assertion}: the address names the bar as bar=step:${FAKE.id}/${step} — it is ${page.url()}`);
  return bar;
}

/** Refuses unless the page reaches `pathname` within the wait, with no bar named. */
async function expectAt(page: Page, pathname: string, assertion: string): Promise<void> {
  try {
    await page.waitForURL((url) => url.pathname === pathname, { timeout: WAIT_MS });
  } catch {
    throw new Refused(`${assertion} — the page is at ${page.url()}`);
  }
}

/** An old link to a step, `?step=`, lands on the bar that shows it, and the canvas is the section's whole width under it. */
async function oldLink(page: Page): Promise<void> {
  await visit(page, `${RUN}?step=${OTHER}`);
  await expectShows(page, OTHER, `an old link, ?step=${OTHER}, opens ${OTHER} in the bar`);
  if (new URL(page.url()).searchParams.has('step')) throw new Refused(`and the address keeps no step key — it is ${page.url()}`);
  const [section, canvas] = await Promise.all([
    graphOf(page).boundingBox(),
    graphOf(page).locator('.react-flow').locator('..').boundingBox(),
  ]);
  if (!section || !canvas || Math.abs(section.width - canvas.width) > 1)
    throw new Refused(`the canvas's frame takes the section's whole width — the section is ${section?.width}, the frame ${canvas?.width}`);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expectClosed(page, "the bar's Close closes it");
}

/**
 * A press on a node shows it, the same node again closes it, another switches it and keeps the tab, and the empty canvas closes it. In a
 * window as wide as `WIDE`, where the bar leaves the run's steps room beside it, the canvas is fitted clear of the bar.
 */
async function presses(page: Page): Promise<void> {
  const was = page.viewportSize();
  await page.setViewportSize(WIDE);
  try {
    await pressed(page);
  } finally {
    if (was) await page.setViewportSize(was);
  }
}

/** The presses of `presses`, in the window it sets. */
async function pressed(page: Page): Promise<void> {
  await nodeOf(page, FIRST).scrollIntoViewIfNeeded();
  const scrolled = await page.evaluate(() => window.scrollY);
  await nodeOf(page, FIRST).click();
  await expectShows(page, FIRST, `a click on ${FIRST} shows it in the bar`);
  const now = await page.evaluate(() => window.scrollY);
  if (now !== scrolled) throw new Refused(`the bar opens over the page and leaves it where it was scrolled — ${scrolled} became ${now}`);
  await nodeOf(page, FIRST).click();
  await expectClosed(page, `a click on ${FIRST} again closes the bar`);

  await nodeOf(page, FIRST).click();
  const first = await expectShows(page, FIRST, `a click on ${FIRST} shows it again`);
  await first.getByRole('tab', { name: 'Details' }).click();
  await nodeOf(page, OTHER).click();
  const other = await expectShows(page, OTHER, `a click on ${OTHER} switches the bar to it`);
  await expectCount(stepBar(page, FAKE.id, FIRST), 0, `and ${FIRST} is no longer shown`);
  await expectVisible(other.getByRole('tab', { name: 'Details', selected: true }), 'the tab picked is kept as the bar switches step');
  await expectVisible(graphOf(page).locator(`.react-flow__node.selected[data-id="${OTHER}"]`), `${OTHER}'s node is drawn selected`);

  await settled(page);
  const bar = await other.boundingBox();
  if (!bar) throw new Refused(`the bar on ${OTHER} is drawn`);
  const under: string[] = [];
  for (const node of await graphOf(page).locator('.react-flow__node').all()) {
    const box = await node.boundingBox();
    if (box && box.x + box.width > bar.x) under.push(String(await node.getAttribute('data-id')));
  }
  if (under.length) throw new Refused(`every node is fitted clear of the bar — ${under.join(', ')} lies under it`);
  await photograph(page, path.join(OUT, `run-bar-step-${await themeOf(page)}.png`));

  await graphOf(page)
    .locator('.react-flow__pane')
    .click({ position: { x: 8, y: 8 } });
  await expectClosed(page, 'a click on the empty canvas closes the bar');
}

/** Enter on a focused node shows it, and Escape closes it. */
async function keys(page: Page): Promise<void> {
  await nodeOf(page, OTHER).focus();
  await page.keyboard.press('Enter');
  await expectShows(page, OTHER, `Enter on ${OTHER}'s node shows it in the bar`);
  await page.keyboard.press('Escape');
  await expectClosed(page, 'Escape closes the bar');
}

/**
 * The bar's Open, and a double click on a node, each open the step's session. The node double clicked is the run's first, at the canvas's
 * left: the first click opens the bar, and a node under where it opens would take the second click on the bar.
 */
async function opens(page: Page): Promise<void> {
  const session = `${RUN}/steps/${OTHER}`;
  await nodeOf(page, OTHER).click();
  const bar = await expectShows(page, OTHER, `a click on ${OTHER} shows it`);
  await bar.getByRole('link', { name: 'Open', exact: true }).click();
  await expectAt(page, session, `the bar's Open opens ${OTHER}'s session`);
  await visit(page, RUN);
  await nodeOf(page, FAKE.blocked).dblclick();
  await expectAt(page, `${RUN}/steps/${FAKE.blocked}`, `a double click on ${FAKE.blocked}, left of where the bar opens, opens its session`);
  await visit(page, RUN);
}

/** With the start of a run open in the bar, a click on the empty canvas leaves it open, and it offers no Open. */
async function keepsTheStart(page: Page): Promise<void> {
  const start = `start:${FOLDER.factory}`;
  await visit(page, `${RUN}?bar=${start}`);
  const bar = page.locator(`aside[data-bar="${start}"]`);
  await expectVisible(bar, 'the start of a run opens in the bar on the run page');
  await graphOf(page)
    .locator('.react-flow__pane')
    .click({ position: { x: 8, y: 8 } });
  await expectVisible(bar, 'a click on the empty canvas leaves the start of a run open, with its brief');
  if (barInUrl(page) !== start) throw new Refused(`and the address keeps bar=${start} — it is ${page.url()}`);
  await expectCount(bar.getByRole('link', { name: 'Open', exact: true }), 0, 'the start of a run is no page, so the bar offers no Open');
  await bar.getByRole('button', { name: 'Close', exact: true }).click();
  await expectClosed(page, 'its Close closes it');
}

export default {
  /**
   * A run's canvas and the floating bar: an old `?step=` link lands on the bar, the canvas the page's whole width; a click on a node shows
   * it, the same node again closes it, another switches it with the tab kept, and the nodes are fitted clear of the bar; the empty canvas
   * closes it, but never the start of a run; Enter and Escape do as a click and Close; Open and a double click open the step's session.
   */
  name: 'run-bar',
  route: RUN,
  expect: async (page) => {
    await oldLink(page);
    await presses(page);
    await keys(page);
    await opens(page);
    await keepsTheStart(page);
  },
} satisfies PageSpec;

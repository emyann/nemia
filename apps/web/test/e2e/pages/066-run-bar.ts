import path from 'node:path';
import type { Locator, Page, Request } from 'playwright';
import { photograph, stepBar, themeOf } from '../board.ts';
import { expectCount, expectLeftOf, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
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
  await expectLeftOf(
    graphOf(page).getByRole('button', { name: 'Reset layout' }),
    other,
    "the canvas's buttons are drawn left of the bar, not under it",
  );
  await photograph(page, path.join(OUT, `run-bar-step-${await themeOf(page)}.png`));

  await graphOf(page)
    .locator('.react-flow__pane')
    .click({ position: { x: 8, y: 8 } });
  await expectClosed(page, 'a click on the empty canvas closes the bar');
}

/** Refuses unless the focus is on the node of the step `step`. */
async function expectFocused(page: Page, step: string, assertion: string): Promise<void> {
  const focused = await page.evaluate(() => {
    const now = document.activeElement;
    return now?.classList.contains('react-flow__node') ? now.getAttribute('data-id') : (now?.tagName.toLowerCase() ?? null);
  });
  if (focused !== step) throw new Refused(`${assertion} — the focus is on ${focused}`);
}

/**
 * Enter on a focused node shows it, and Escape closes it and gives the focus back to the node; after a switch by Enter to another node,
 * and the focus taken into the bar from there, Escape gives it back to the node switched from, not to the one that opened the bar.
 */
async function keys(page: Page): Promise<void> {
  await nodeOf(page, OTHER).focus();
  await page.keyboard.press('Enter');
  await expectShows(page, OTHER, `Enter on ${OTHER}'s node shows it in the bar`);
  await page.keyboard.press('Escape');
  await expectClosed(page, 'Escape closes the bar');
  await expectFocused(page, OTHER, `and gives the focus back to ${OTHER}'s node`);

  await nodeOf(page, FIRST).focus();
  await page.keyboard.press('Enter');
  await expectShows(page, FIRST, `Enter on ${FIRST}'s node shows it`);
  await nodeOf(page, OTHER).focus();
  await page.keyboard.press('Enter');
  const other = await expectShows(page, OTHER, `Enter on ${OTHER}'s node switches the bar to it`);
  await other.focus();
  await page.keyboard.press('Escape');
  await expectClosed(page, 'Escape closes the switched bar');
  await expectFocused(page, OTHER, `and gives the focus back to ${OTHER}'s node, switched from, not to ${FIRST}'s, which opened the bar`);
}

/** The api's reads of a step's conversation: once, and followed. */
const TRANSCRIPT = /^\/api\/runs\/[^/]+\/steps\/[^/]+\/transcript(\/stream)?$/;

/** What the session page says of a step none of whose sessions has started. */
const NO_SESSION = 'No session of it has started yet, so there is no conversation to show.';

/** Refuses unless the session page says it has no conversation, in the family's empty shell, once its reads are done. */
async function expectNoConversation(page: Page, assertion: string): Promise<void> {
  await idle(page);
  await expectVisible(page.locator('[data-session-empty]').getByText(NO_SESSION, { exact: true }), assertion);
}

/**
 * The bar's Open, and a double click on a node, each open the step's session. The node double clicked lies where the bar opens: the
 * first click opens the bar over it, and the second, landing on the bar, still opens the step's session. The step has no session that
 * started, so neither its Activity tab nor its session page asks for its conversation, and each says it has none.
 */
async function opens(page: Page): Promise<void> {
  const asked: string[] = [];
  const ask = (request: Request) => {
    if (TRANSCRIPT.test(new URL(request.url()).pathname)) asked.push(request.url());
  };
  page.on('request', ask);
  try {
    await opened(page);
  } finally {
    page.off('request', ask);
  }
  if (asked.length) throw new Refused(`a step with no session that started asks for no conversation — asked ${asked.join(', ')}`);
}

/** The opens of `opens`, while it watches for a read of a conversation. */
async function opened(page: Page): Promise<void> {
  const session = `${RUN}/steps/${OTHER}`;
  await nodeOf(page, OTHER).click();
  const bar = await expectShows(page, OTHER, `a click on ${OTHER} shows it`);
  const where = await bar.boundingBox();
  await bar.getByRole('tab', { name: 'Activity' }).click();
  await expectVisible(
    bar.getByText('No session of it has started, so there is no conversation yet.', { exact: true }),
    `the Activity tab of ${OTHER}, none of whose sessions started, says it has no conversation yet`,
  );
  await idle(page);
  await bar.getByRole('link', { name: 'Open', exact: true }).click();
  await expectAt(page, session, `the bar's Open opens ${OTHER}'s session`);
  await expectNoConversation(page, `${OTHER}'s session page, opened from the bar, says it has no conversation to show`);
  await visit(page, RUN);
  const node = await nodeOf(page, OTHER).boundingBox();
  if (!where || !node || node.x + node.width / 2 <= where.x)
    throw new Refused(
      `${OTHER}'s node lies where the bar opens — its middle is at ${node && node.x + node.width / 2}, the bar at ${where?.x}`,
    );
  await nodeOf(page, OTHER).dblclick();
  await expectAt(page, session, `a double click on ${OTHER}, whose second click lands on the bar the first opened, opens its session`);
  await expectNoConversation(page, `${OTHER}'s session page, opened by a double click, says it has no conversation to show`);
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
   * closes it, but never the start of a run; Enter and Escape do as a click and Close, and Escape gives the focus back to the node; Open
   * and a double click open the step's session, its second click landing on the bar, and a step with no session asks no conversation.
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

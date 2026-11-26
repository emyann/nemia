import path from 'node:path';
import type { Page, Request } from 'playwright';
import { openConversation, openFromBar, photograph, stepBar, themeOf } from '../board.ts';
import { expectCount, expectLeftOf, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import { FAKE, FOLDER, SESSION } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The run's page the page reads. */
const RUN = `/runs/${FAKE.id}`;
/** The step the page presses first, and the one it switches to. */
const [FIRST, OTHER] = [FAKE.unverified, 'review'];

/** A window wide enough for the run's steps to be fitted beside the sheet at the canvas's least zoom. */
const WIDE = { width: 1920, height: 1080 };

/** The section that holds the run's canvas. */
const graphOf = (page: Page) => page.locator(`section[aria-label="The run's steps as a graph"]`);

/** The node of the step `step` on the run's canvas. */
const nodeOf = (page: Page, step: string) => graphOf(page).locator(`.react-flow__node[data-id="${step}"]`);

/** What the address's search holds for `bar`, or null. */
const barInUrl = (page: Page) => new URL(page.url()).searchParams.get('bar');

/** Goes to `to` in this tab and waits for its reads. */
async function visit(page: Page, to: string) {
  await page.goto(new URL(to, page.url()).href, { waitUntil: 'load' });
  await idle(page);
}

/** Refuses unless no bar is drawn and the address names none, on the run's page. */
async function expectClosed(page: Page, assertion: string) {
  await expectCount(page.locator('aside[data-bar]'), 0, assertion);
  const url = new URL(page.url());
  if (url.searchParams.has('bar') || url.pathname !== RUN)
    throw new Refused(`${assertion}: the address keeps ${RUN} and names no bar — it is ${url.pathname}${url.search}`);
}

/** Refuses unless the bar shows `step`, and the address names it. */
async function expectShows(page: Page, step: string, assertion: string) {
  const bar = stepBar(page, FAKE.id, step);
  await expectVisible(bar, assertion);
  if (barInUrl(page) !== `step:${FAKE.id}/${step}`)
    throw new Refused(`${assertion}: the address names the bar as bar=step:${FAKE.id}/${step} — it is ${page.url()}`);
  return bar;
}

/** Refuses unless the page reaches `pathname` within the wait, with no bar named. */
async function expectAt(page: Page, pathname: string, assertion: string) {
  try {
    await page.waitForURL((url) => url.pathname === pathname, { timeout: WAIT_MS });
  } catch {
    throw new Refused(`${assertion} — the page is at ${page.url()}`);
  }
}

/** An old link to a step, `?step=`, lands on the bar that shows it, and the canvas is the section's whole width under it. */
async function oldLink(page: Page) {
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
 * A press on a node shows it, the same node again closes it, another switches it, its part then its conversation in one scroll, and the
 * empty canvas closes it. In a window as wide as `WIDE`, where the sheet leaves the run's steps room beside it, the canvas narrows beside
 * it and is fitted whole.
 */
async function presses(page: Page) {
  const was = page.viewportSize();
  await page.setViewportSize(WIDE);
  try {
    await pressed(page);
  } finally {
    if (was) await page.setViewportSize(was);
  }
}

/** The presses of `presses`, in the window it sets. */
async function pressed(page: Page) {
  await nodeOf(page, FIRST).scrollIntoViewIfNeeded();
  const scrolled = await page.evaluate(() => window.scrollY);
  await nodeOf(page, FIRST).click();
  await expectShows(page, FIRST, `a click on ${FIRST} shows it in the bar`);
  const now = await page.evaluate(() => window.scrollY);
  if (now !== scrolled)
    throw new Refused(`the bar opens in the sheet beside the page and leaves it where it was scrolled — ${scrolled} became ${now}`);
  await nodeOf(page, FIRST).click();
  await expectClosed(page, `a click on ${FIRST} again closes the bar`);

  await nodeOf(page, FIRST).click();
  const first = await expectShows(page, FIRST, `a click on ${FIRST} shows it again`);
  await expectCount(first.getByRole('tab'), 0, 'the bar is one scroll, with no tabs');
  await expectVisible(first.locator(`article[data-step-part="L"][data-step-name="${FIRST}"]`), `its part whole, at L`);
  await expectCount(first.locator('section[aria-label="Its conversation"]'), 0, 'and no conversation until a person opens it');
  await nodeOf(page, OTHER).click();
  const other = await expectShows(page, OTHER, `a click on ${OTHER} switches the bar to it`);
  await expectCount(stepBar(page, FAKE.id, FIRST), 0, `and ${FIRST} is no longer shown`);
  await expectVisible(other.locator(`article[data-step-part="L"][data-step-name="${OTHER}"]`), `${OTHER}'s bar draws its part`);
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
async function expectFocused(page: Page, step: string, assertion: string) {
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
async function keys(page: Page) {
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
async function expectNoConversation(page: Page, assertion: string) {
  await idle(page);
  await expectVisible(page.locator('[data-session-empty]').getByText(NO_SESSION, { exact: true }), assertion);
}

/**
 * The bar's Open, and a double click on a node, each open the step's session. The first click opens the sheet beside the page, which
 * narrows the canvas and fits it again under the second click, wherever that lands, and the step's session still opens. The step has no
 * session that started, so neither its conversation under its part nor its session page asks for its conversation, and each says it has
 * none.
 */
async function opens(page: Page) {
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
async function opened(page: Page) {
  const session = `${RUN}/steps/${OTHER}`;
  await nodeOf(page, OTHER).click();
  const bar = await expectShows(page, OTHER, `a click on ${OTHER} shows it`);
  const where = await bar.boundingBox();
  const talk = await openConversation(page, bar);
  await expectVisible(
    talk.getByText('No session of it has started, so there is no conversation yet.', { exact: true }),
    `the conversation of ${OTHER}, none of whose sessions started, says it has none yet`,
  );
  await talk.getByRole('button', { name: 'Back to the step', exact: true }).click();
  await expectVisible(bar.locator(`article[data-step-part="L"][data-step-name="${OTHER}"]`), `Back shows ${OTHER}'s part again`);
  await idle(page);
  await openFromBar(page, bar);
  await expectAt(page, session, `the bar's Open opens ${OTHER}'s session`);
  await expectNoConversation(page, `${OTHER}'s session page, opened from the bar, says it has no conversation to show`);
  await visit(page, RUN);
  if (!where) throw new Refused(`the bar on ${OTHER} is drawn`);
  await nodeOf(page, OTHER).dblclick();
  await expectAt(
    page,
    session,
    `a double click on ${OTHER}, whose first click opens the sheet and narrows the canvas under the second, opens its session`,
  );
  await expectNoConversation(page, `${OTHER}'s session page, opened by a double click, says it has no conversation to show`);
  await visit(page, RUN);
}

/** With the start of a run open in the bar, a click on the empty canvas leaves it open, and it offers no Open. */
async function keepsTheStart(page: Page) {
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
  await expectCount(bar.locator('button[data-bar-menu]'), 0, 'nor a menu to hold one');
  await bar.getByRole('button', { name: 'Close', exact: true }).click();
  await expectClosed(page, 'its Close closes it');
}

/**
 * The conversation of the step whose session is on disk, opened from its bar's menu while each read is held (`slowConversations`), and
 * left by Back while its read is still out; opened again, and left by its closeout's Read what it said for the part at its Said; opened
 * again and left by a switch to another step, whose bar shows its card, and back, which shows the first step's card and reads nothing;
 * then opened and left by Close. No conversation is read before it is opened, and the board leaves each read to answer, the watch counting
 * any it abandons.
 */
async function talks(page: Page) {
  const asked: string[] = [];
  const ask = (request: Request) => {
    if (TRANSCRIPT.test(new URL(request.url()).pathname)) asked.push(request.url());
  };
  page.on('request', ask);
  try {
    await nodeOf(page, SESSION.step).click();
    const bar = await expectShows(page, SESSION.step, `a click on ${SESSION.step} shows it`);
    await expectVisible(bar.locator(`article[data-step-part="L"][data-step-name="${SESSION.step}"]`), `${SESSION.step}'s part is drawn`);
    await idle(page);
    if (asked.length) throw new Refused(`the bar reads no conversation until a person opens it — asked ${asked.join(', ')}`);
    await openConversation(page, bar);
    await bar.getByRole('button', { name: 'Back to the step', exact: true }).click();
    await expectVisible(
      bar.locator(`article[data-step-part="L"][data-step-name="${SESSION.step}"]`),
      'Back, the read still out, shows the part',
    );
    const talk = await openConversation(page, bar);
    await expectVisible(talk.locator('[data-session-closeout]'), `${SESSION.step}'s conversation is drawn once read`);
    await talk.getByRole('button', { name: 'Read what it said', exact: true }).click();
    await expectCount(talk, 0, "its closeout's Read what it said leaves the conversation");
    await expectVisible(
      bar.locator(`article[data-step-part="L"][data-step-name="${SESSION.step}"] [data-part-said]`),
      'for the part, at what it said',
    );

    await openConversation(page, bar);
    await idle(page);
    const read = asked.length;
    await nodeOf(page, OTHER).click();
    const other = await expectShows(page, OTHER, `a click on ${OTHER} switches the bar on ${SESSION.step}'s conversation to it`);
    await expectVisible(other.locator(`article[data-step-part="L"][data-step-name="${OTHER}"]`), `${OTHER}'s card is drawn`);
    await expectCount(other.locator('section[aria-label="Its conversation"]'), 0, 'and no conversation: the choice was the other step’s');
    await nodeOf(page, SESSION.step).click();
    const again = await expectShows(page, SESSION.step, `a click on ${SESSION.step} switches the bar back`);
    await expectVisible(again.locator(`article[data-step-part="L"][data-step-name="${SESSION.step}"]`), `${SESSION.step}'s card again`);
    await expectCount(again.locator('section[aria-label="Its conversation"]'), 0, 'not its conversation, which was left with the switch');
    await idle(page);
    if (asked.length !== read)
      throw new Refused(`no conversation is read once the bar moved off it — asked ${asked.slice(read).join(', ')}`);
    await openConversation(page, again);
    await again.getByRole('button', { name: 'Close', exact: true }).click();
    await expectClosed(page, 'Close closes the bar on its conversation');
    await idle(page);
  } finally {
    page.off('request', ask);
  }
  if (!asked.length) throw new Refused(`opening ${SESSION.step}'s conversation reads it`);
}

/** How long the page holds each read of a step's conversation before the api is asked it. */
const SLOW_MS = 600;

/**
 * Holds each read of a step's conversation `SLOW_MS` before it reaches the api, as a slow api would: the bar is closed on a step, and
 * switched off it, while its conversation is still read, and the watch counts a read the board then abandons as a failed request.
 */
async function slowConversations(page: Page) {
  await page.route(
    (url) => TRANSCRIPT.test(url.pathname) && !url.pathname.endsWith('/stream'),
    async (route) => {
      await new Promise((done) => setTimeout(done, SLOW_MS));
      await route.continue();
    },
  );
}

export default {
  /**
   * A run's canvas and the frame's side sheet: an old `?step=` link lands on the bar, the canvas the page's whole width; a click on a node
   * shows it, the same node again closes it, another switches it, the bar one scroll with no tabs, and the nodes are fitted clear of the
   * bar; the empty canvas closes it, but never the start of a run; Enter and Escape do as a click and Close, and Escape gives the focus
   * back to the node; the menu's Open and a double click open the step's session, its second click landing where the narrowed canvas put
   * it, and a step with no session asks no conversation. No conversation is read until the menu's Open conversation shows it in place of
   * the part; each read is held a moment, so Back and Close while one is out prove the board leaves it to answer rather than abort it.
   */
  name: 'run-bar',
  route: RUN,
  expect: async (page) => {
    await slowConversations(page);
    await oldLink(page);
    await presses(page);
    await keys(page);
    await opens(page);
    await talks(page);
    await keepsTheStart(page);
  },
} satisfies PageSpec;

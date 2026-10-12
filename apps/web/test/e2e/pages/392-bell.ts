import path from 'node:path';
import type { Locator, Page } from 'playwright';
import type { InboxEntry } from '../../../src/lib/api/inbox.ts';
import type { OpenRuns, RunSummary } from '../../../src/lib/api/runs.ts';
import { bellCount, bellHash, bellRows, type BellRow } from '../../../src/lib/bell.ts';
import { factoryOf } from '../../../src/lib/factories.ts';
import { waitsOnYou } from '../../../src/lib/factory.ts';
import { inboxBadgeTitle, notStarted } from '../../../src/lib/inbox.ts';
import { photograph, sectionsOf, sidebarOf, themeOf } from '../board.ts';
import { expectCount, expectOnScreen, expectTexts, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import { FACTORIES } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The header's bell. */
const bellOf = (page: Page): Locator => page.locator('header[data-frame-header] button[data-bell]');

/** The floating bar of the runs waiting on you. */
const waitingBar = (page: Page): Locator => page.getByRole('complementary', { name: 'Waiting on you' });

/** The Factory's queue lane, beside the floor. */
const lane = (page: Page): Locator => page.getByRole('complementary', { name: 'Queued cards' });

/** The sidebar's Inbox badge. */
const badgeOf = (page: Page): Locator => sidebarOf(page).locator('[data-inbox-badge]');

/** What the api answers at `pathname`, read as the board reads it. */
async function answer<T>(page: Page, pathname: string): Promise<T> {
  return (await (await page.request.get(new URL(pathname, page.url()).href)).json()) as T;
}

/** Goes to `to` in this tab and waits for its reads. */
async function visit(page: Page, to: string): Promise<void> {
  await page.goto(new URL(to, page.url()).href, { waitUntil: 'load' });
  await idle(page);
}

/**
 * The bell counts the runs the api says wait on you (`counts.waiting` of its light answer), across every factory, and names the count in
 * full; refused for none, and for a count that is not that of the rows the answer lists.
 */
async function counts(page: Page, open: OpenRuns, rows: readonly BellRow[]): Promise<void> {
  const count = open.counts.waiting;
  if (!count) throw new Refused('the seeded store has runs waiting on you: the api counts none');
  if (count !== rows.length) throw new Refused(`the api counts ${count} runs waiting on you and lists ${rows.length}`);
  await expectTexts(
    bellOf(page).locator('[data-bell-count]'),
    [bellCount(count)],
    "the bell's count is the api's count of the runs waiting",
  );
  const label = await bellOf(page).getAttribute('aria-label');
  if (label !== `Waiting on you: ${count}`) throw new Refused(`the bell is named Waiting on you: ${count} — it is ${label}`);
}

/**
 * The board's own rule (`waitsOnYou`), which the pages still on the whole list keep, names the runs the api says wait: the one place the
 * two rules are compared, on the seeded store.
 */
async function agrees(page: Page, rows: readonly BellRow[]): Promise<void> {
  const own = bellRows((await answer<RunSummary[]>(page, '/api/runs')).filter(waitsOnYou)).map((row) => row.run);
  const said = rows.map((row) => row.run);
  if (own.join() !== said.join())
    throw new Refused(`the api says ${said.join(', ')} wait on you — the board's rule over the whole list says ${own.join(', ')}`);
}

/**
 * Pressed, the bell opens the runs waiting on you in the floating bar, named in the address: a row each, oldest first, with its factory's
 * tag, the queue lane giving its room to the floor; pressed again, it closes, and the lane is back.
 */
async function opens(page: Page, rows: readonly BellRow[]): Promise<void> {
  await expectVisible(lane(page), 'the seeded floor has its queue lane');
  await bellOf(page).click();
  await page.waitForURL((url) => url.searchParams.get('bar') === 'waiting', { timeout: WAIT_MS });
  if ((await bellOf(page).getAttribute('aria-expanded')) !== 'true') throw new Refused('the bell pressed says its bar is open');
  const bar = waitingBar(page);
  await expectCount(bar.locator('[data-waiting-run]'), rows.length, 'a row for each run waiting on you');
  const listed = await bar.locator('[data-waiting-run]').evaluateAll((all) => all.map((row) => row.getAttribute('data-waiting-run')));
  if (listed.join() !== rows.map((row) => row.run).join())
    throw new Refused(`the rows stand oldest first, ${rows.map((row) => row.run).join(', ')} — they stand ${listed.join(', ')}`);
  for (const row of rows)
    await expectVisible(
      bar.locator(`[data-waiting-run="${row.run}"] [data-factory-tag="${row.factory}"]`),
      `${row.run}'s row names its factory, ${row.factory}`,
    );
  await expectCount(lane(page), 0, 'the queue lane gives its room to the floor while the runs waiting on you are open');
  await settled(page);
  await photograph(page, path.join(OUT, `bell-open-${await themeOf(page)}.png`));
  await bellOf(page).click();
  await page.waitForURL((url) => !url.searchParams.has('bar'), { timeout: WAIT_MS });
  await expectCount(waitingBar(page), 0, 'pressed again, the bell closes its bar');
  await expectVisible(lane(page), 'and the queue lane is back');
}

/** A row at a gate opens its run's page at that step's section, the bar closed; Back returns to the bar. */
async function follows(page: Page, rows: readonly BellRow[]): Promise<void> {
  const row = rows.find((one) => one.gate !== null);
  if (!row?.gate) throw new Refused('the seeded store has a run waiting at its gate');
  await bellOf(page).click();
  await waitingBar(page).locator(`[data-waiting-run="${row.run}"]`).click();
  await page.waitForURL((url) => url.pathname === `/runs/${row.run}`, { timeout: WAIT_MS });
  const url = new URL(page.url());
  if (url.hash !== `#${bellHash(row)}` || url.searchParams.has('bar'))
    throw new Refused(`the row opens /runs/${row.run}#${bellHash(row)}, the bar closed — it opens ${url.pathname}${url.search}${url.hash}`);
  await expectOnScreen(page.locator(`section[id="${bellHash(row)}"] h2`).first(), "the gate's section is in view");
  await page.goBack();
  await page.waitForURL((back) => back.pathname === '/factories/default' && back.searchParams.get('bar') === 'waiting', {
    timeout: WAIT_MS,
  });
  await expectVisible(waitingBar(page), 'Back returns to the bar');
  await bellOf(page).click();
  await page.waitForURL((back) => !back.searchParams.has('bar'), { timeout: WAIT_MS });
}

/** The Inbox's badge, at `to`, counts `count` cards not yet started, said whole on hover over the Inbox for `picked`; none for none. */
async function badgeAt(page: Page, to: string, count: number, picked: string | undefined): Promise<void> {
  await visit(page, to);
  if (!count) return expectCount(badgeOf(page), 0, `${to}: no badge for no card`);
  await expectTexts(badgeOf(page), [`${count} ${inboxBadgeTitle(count, picked)}`], `${to}: the Inbox badge counts ${count}`);
  const title = await sidebarOf(page)
    .locator('li', { has: page.locator('[data-inbox-badge]') })
    .getAttribute('title');
  if (title !== inboxBadgeTitle(count, picked))
    throw new Refused(`${to}: the Inbox says ${inboxBadgeTitle(count, picked)} on hover — it says ${title}`);
  await expectTexts(
    sectionsOf(page).filter({ has: page.getByText('Inbox', { exact: true }) }),
    ['Inbox'],
    'the Inbox link reads Inbox alone',
  );
}

/**
 * The Inbox's badge counts the cards not yet started: every factory's under All factories, refused for none, and a press on its count
 * opens the Inbox; a factory's that has cards; and none in a factory that has none.
 */
async function badges(page: Page): Promise<void> {
  const inbox = await answer<InboxEntry[]>(page, '/api/inbox');
  const all = notStarted(inbox, undefined);
  if (!all.length) throw new Refused('the seeded inbox has cards not yet started');
  await badgeAt(page, '/runs', all.length, undefined);
  await settled(page);
  await photograph(page, path.join(OUT, `bell-badge-${await themeOf(page)}.png`));
  const count = await badgeOf(page).boundingBox();
  if (!count) throw new Refused('the Inbox badge is drawn');
  await page.mouse.click(count.x + count.width / 2, count.y + count.height / 2);
  await page.waitForURL((url) => url.pathname === '/inbox', { timeout: WAIT_MS });
  await idle(page);
  const factory = factoryOf(all.find((card) => factoryOf(card) !== 'default') ?? all[0]);
  await badgeAt(page, `/runs?factory=${factory}`, notStarted(inbox, factory).length, factory);
  const other = FACTORIES.others[1];
  await badgeAt(page, `/runs?factory=${other}`, notStarted(inbox, other).length, other);
}

/** On a phone's screen the bell keeps its count, and its bar is the whole width. */
async function onPhone(page: Page, rows: readonly BellRow[]): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
  await visit(page, '/factories/default');
  await expectTexts(bellOf(page).locator('[data-bell-count]'), [bellCount(rows.length)], 'a phone keeps the bell and its count');
  await bellOf(page).click();
  await expectVisible(waitingBar(page), 'the bar opens on a phone');
  await settled(page);
  await photograph(page, path.join(OUT, `bell-phone-${await themeOf(page)}.png`));
}

export default {
  /**
   * The header's bell, on the default factory's floor: it counts the runs waiting on you across every factory, as the api's light answer
   * counts them, the board's own rule over the whole list naming the same runs, and pressed opens them in the floating bar, a row each,
   * oldest first, with its factory, the queue lane giving its room to the floor;
   * pressed again it closes. A row at a gate opens
   * its run's page at that step, and Back returns. The sidebar's Inbox badge counts the cards not yet started, every factory's under All
   * factories and the picked factory's under one. On a phone the bell keeps its count. The window's size is put back. It writes nothing.
   */
  name: 'bell',
  route: '/factories/default',
  expect: async (page) => {
    const size = page.viewportSize();
    try {
      const open = await answer<OpenRuns>(page, '/api/runs-open');
      const rows = bellRows(open.waiting);
      await counts(page, open, rows);
      await agrees(page, rows);
      await opens(page, rows);
      await follows(page, rows);
      await badges(page);
      await onPhone(page, rows);
    } finally {
      if (size) await page.setViewportSize(size);
      await visit(page, '/factories/default');
    }
  },
} satisfies PageSpec;

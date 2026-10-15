import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { atWork, atWorkWords, versionWords } from '../../../src/lib/footer.ts';
import type { OpenRuns } from '../../../src/lib/api/runs.ts';
import type { Version } from '../../../src/lib/api/version.ts';
import { gaugesButtonOf, photograph, themeOf, topBarOf } from '../board.ts';
import { expectCount, expectTexts, expectVisible, feedAnswered, idle, Refused, settled } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The Factory's queue lane, beside the floor. */
const lane = (page: Page): Locator => page.getByRole('complementary', { name: 'Queued cards' });

/** The gauges button's own box, which carries what its dot and mark say. */
const markOf = (page: Page): Locator => topBarOf(page).locator('[data-gauges-button]');

/** What the api answers at `pathname`, read as the board reads it. */
async function answer<T>(page: Page, pathname: string): Promise<T> {
  return (await (await page.request.get(new URL(pathname, page.url()).href)).json()) as T;
}

/** The button's dot says the daemon's tone, its mark the quota near its limit, and its name both; the feed is followed; no bottom bar. */
async function says(page: Page): Promise<void> {
  await expectCount(page.locator('footer[data-frame-footer]'), 0, 'no bottom bar: the gauges button holds its facts');
  await expectVisible(markOf(page).and(page.locator('[data-daemon-dot="none"][data-tone="down"]')), "the dot: the e2e's api ticks nothing");
  await expectVisible(markOf(page).locator('[data-quota-mark]'), 'the money mark: the week is past the mark');
  await expectVisible(
    topBarOf(page).getByRole('button', { name: 'This machine: daemon none, quota near its limit', exact: true }),
    'its name says the daemon and the quota',
  );
  await feedAnswered(page);
  await expectVisible(markOf(page).and(page.locator('[data-feed="open"]')), 'and that the board follows the feed');
}

/**
 * Pressed, the button opens the machine's gauges in the floating bar — the daemon, the feed, what is at work as the api's runs make it,
 * the quota and the version the api answers — the queue lane giving its room to the floor; pressed again it closes them.
 */
async function opens(page: Page): Promise<void> {
  await gaugesButtonOf(page).click();
  await page.waitForURL((url) => url.searchParams.get('bar') === 'gauges');
  const bar = page.locator('[data-gauges]');
  await expectVisible(bar.locator('[data-daemon="none"]'), 'the gauges say whether a daemon ticks, and how to start one');
  await expectVisible(bar.locator('[data-feed-sentence="open"]'), 'whether the board follows the feed');
  const work = atWorkWords(atWork(await answer<OpenRuns>(page, '/api/runs-open')));
  if (work.text.startsWith('0 runs')) throw new Refused(`the seeded store has a run in flight — the api's light answer makes ${work.text}`);
  await expectTexts(bar.locator('[data-at-work-sentence]'), [work.title], 'what is at work across every factory, whole');
  await expectVisible(bar.locator('[data-quota="fresh"]'), 'the quota');
  const served = await answer<Version>(page, '/api/version');
  await expectTexts(
    bar.locator('[data-version-sentence]'),
    [`${versionWords(served).title}, as the api serving this board answers it.`],
    'and the version the api answers',
  );
  if ((await gaugesButtonOf(page).getAttribute('aria-expanded')) !== 'true') throw new Refused('the button says the gauges are open');
  await expectCount(lane(page), 0, 'the queue lane gives its room to the floor while the gauges are open');
  await settled(page);
  await photograph(page, path.join(OUT, `gauges-button-open-${await themeOf(page)}.png`));
  await gaugesButtonOf(page).click();
  await page.waitForURL((url) => !url.searchParams.has('bar'));
  await expectCount(bar, 0, 'pressed again, the gauges close');
  await expectVisible(lane(page), 'and the queue lane is back');
}

export default {
  /**
   * The top bar's gauges button, on the Factory: its dot in the daemon's tone, a money mark while the quota nears its limit, its name
   * saying both; it opens the machine's gauges in the floating bar, which hold what the bottom bar held, and closes them. The pause is its
   * own page's (`480-pause.ts`).
   */
  name: 'gauges-button',
  route: '/factories/default',
  expect: async (page) => {
    await says(page);
    await opens(page);
    await idle(page);
  },
} satisfies PageSpec;

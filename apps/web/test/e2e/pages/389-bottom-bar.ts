import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { atWork, atWorkWords, versionWords } from '../../../src/lib/footer.ts';
import type { OpenRuns } from '../../../src/lib/api/runs.ts';
import type { Version } from '../../../src/lib/api/version.ts';
import { photograph, railOf, themeOf } from '../board.ts';
import { expectCount, expectTexts, expectUncut, expectVisible, feedAnswered, idle, Refused, settled } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The frame's bottom bar. */
const footerOf = (page: Page): Locator => page.locator('footer[data-frame-footer]');

/** The Factory's queue lane, beside the floor. */
const lane = (page: Page): Locator => page.getByRole('complementary', { name: 'Queued cards' });

/** The box of `target`, refused when it is not drawn. */
async function boxOf(target: Locator, what: string) {
  const box = await target.boundingBox();
  if (!box) throw new Refused(`${what} is drawn`);
  return box;
}

/** What the api answers at `pathname`, read as the board reads it. */
async function answer<T>(page: Page, pathname: string): Promise<T> {
  return (await (await page.request.get(new URL(pathname, page.url()).href)).json()) as T;
}

/** Refuses unless `target` ends above the bottom bar's top. */
async function aboveFooter(page: Page, target: Locator, what: string): Promise<void> {
  const top = (await boxOf(footerOf(page), 'the bottom bar')).y;
  const box = await boxOf(target, what);
  if (box.y + box.height > top + 1) throw new Refused(`${what} ends above the bottom bar at ${top} — it ends at ${box.y + box.height}`);
}

/** The bar spans the foot of the page, 32 tall, and the rail, the sidebar and the floor end above it. */
async function acrossTheFoot(page: Page): Promise<void> {
  const { width, height } = page.viewportSize()!;
  const bar = await boxOf(footerOf(page), 'the bottom bar');
  if (Math.abs(bar.x) > 1 || Math.abs(bar.width - width) > 1 || Math.abs(bar.y + bar.height - height) > 1 || Math.abs(bar.height - 32) > 1)
    throw new Refused(
      `the bottom bar spans the foot of the page, ${width} wide and 32 tall at the bottom of ${height} — it is ${bar.width} by ${bar.height} at ${bar.x},${bar.y}`,
    );
  await aboveFooter(page, railOf(page), 'the rail');
  await aboveFooter(page, page.locator('[data-sidebar="sidebar"]').first(), 'the sidebar');
  await aboveFooter(page, page.locator('.react-flow').first(), 'the floor');
}

/** Left to right: the daemon's dot, the feed, what is at work as the api's runs make it, the quota and the version the api answers. */
async function groups(page: Page): Promise<void> {
  const bar = footerOf(page);
  await expectVisible(bar.locator('[data-daemon-dot="none"][data-tone="down"]'), "the daemon's dot: the e2e's api ticks nothing");
  await feedAnswered(page);
  await expectTexts(bar.locator('[data-feed-word="open"]'), ['feed live'], 'whether the board follows the feed');
  const work = atWorkWords(atWork(await answer<OpenRuns>(page, '/api/runs-open')));
  if (work.text.startsWith('0 runs')) throw new Refused(`the seeded store has a run in flight — the api's light answer makes ${work.text}`);
  await expectTexts(bar.locator('[data-at-work]'), [work.text], 'what is at work across every factory, as the api lists the runs');
  if ((await bar.locator('[data-at-work]').getAttribute('title')) !== work.title)
    throw new Refused(`its hover says it whole, ${JSON.stringify(work.title)}`);
  await expectVisible(bar.locator('[data-quota-short][data-marked]'), 'the quota, marked: the week is past the mark');
  const served = await answer<Version>(page, '/api/version');
  if (served.release?.kind !== 'checkout')
    throw new Refused(`the e2e's api runs this checkout and says so — it answers ${JSON.stringify(served.release)}`);
  const words = versionWords(served);
  const version = bar.locator(`[data-version="${served.version}"][data-release="checkout"]`);
  await expectTexts(version, [`v${served.version} · checkout`], 'the version the api answers, and that it runs a checkout');
  if ((await version.getAttribute('title')) !== words.title || !words.title.endsWith(served.release.root))
    throw new Refused(`its hover names the folder the api runs from, ${JSON.stringify(words.title)}`);
  const order = await bar
    .locator('[data-daemon-dot], [data-feed-word], [data-at-work], [data-quota-short], [data-version]')
    .evaluateAll((all) => all.map((el) => Object.keys((el as HTMLElement).dataset)[0]));
  if (order.join() !== 'daemonDot,feedWord,atWork,quotaShort,version')
    throw new Refused(`the groups stand daemon, feed, at work, quota, version — they stand ${order.join(', ')}`);
  await expectUncut(bar.locator('[data-feed-word], [data-at-work], [data-quota-short], [data-version]'), 'each group is read whole');
}

/**
 * A group pressed opens the machine's gauges in the floating bar, above the bottom bar, the queue lane giving its room to the floor, and
 * pressed again closes them.
 */
async function gauges(page: Page): Promise<void> {
  const press = footerOf(page)
    .getByRole('button')
    .filter({ has: page.locator('[data-at-work]') });
  await press.click();
  await page.waitForURL((url) => url.searchParams.get('bar') === 'gauges');
  await expectVisible(page.locator('[data-gauges] [data-at-work-sentence]'), 'the gauges say what is at work whole');
  await expectVisible(page.locator('[data-gauges] [data-daemon="none"]'), 'and whether a daemon ticks, and how to start one');
  await expectVisible(page.locator('[data-gauges] [data-quota="fresh"]'), 'and the quota');
  await aboveFooter(page, page.getByRole('complementary', { name: 'This machine' }), 'the floating bar of the gauges');
  if ((await press.getAttribute('aria-expanded')) !== 'true') throw new Refused('the group pressed says the gauges are open');
  await expectCount(lane(page), 0, 'the queue lane gives its room to the floor while the gauges are open');
  await settled(page);
  await photograph(page, path.join(OUT, `bottom-bar-gauges-${await themeOf(page)}.png`));
  await press.click();
  await page.waitForURL((url) => !url.searchParams.has('bar'));
  await expectCount(page.locator('[data-gauges]'), 0, 'pressed again, the gauges close');
  await expectVisible(lane(page), 'and the queue lane is back');
}

/** On a phone's screen the bar keeps the daemon's dot, named, the pause, and the quota, whole, and nothing else. */
async function onPhone(page: Page): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
  const bar = footerOf(page);
  await expectVisible(bar.getByRole('button', { name: 'Daemon none' }), "a phone keeps the daemon's dot, named by its word");
  await expectVisible(bar.getByRole('button', { name: 'Pause all factories' }), 'and the pause of all factories');
  await expectUncut(bar.locator('[data-quota-short]'), 'and the quota, read whole');
  await expectCount(bar.locator('[data-feed-word], [data-at-work], [data-version]'), 0, 'and nothing else');
  await expectCount(bar.getByRole('button'), 3, 'three groups');
  await settled(page);
  await photograph(page, path.join(OUT, `bottom-bar-phone-${await themeOf(page)}.png`));
}

export default {
  /**
   * The frame's bottom bar, on the Factory: across the foot of the page under the rail, the sidebar and the floor. At its left the daemon's
   * dot and whether the board follows the feed, in its centre the runs in flight and the sessions at work across every factory, as the
   * api's runs make them, and at its right the quota and the version the api answers. A group pressed opens the machine's gauges in the
   * floating bar, above the bottom bar, the queue lane giving its room to the floor, and pressed again closes them. A phone keeps the dot,
   * the pause and the quota. The pause is its own page's (`480-pause.ts`). The window's size is put back.
   */
  name: 'bottom-bar',
  route: '/factories/default',
  expect: async (page) => {
    const size = page.viewportSize();
    try {
      await acrossTheFoot(page);
      await groups(page);
      await settled(page);
      await photograph(page, path.join(OUT, `bottom-bar-wide-${await themeOf(page)}.png`));
      await gauges(page);
      await onPhone(page);
    } finally {
      if (size) await page.setViewportSize(size);
      await idle(page);
    }
  },
} satisfies PageSpec;

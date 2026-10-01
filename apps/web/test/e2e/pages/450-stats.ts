import path from 'node:path';
import type { Page } from 'playwright';
import { photograph, sidebar, themeOf } from '../board.ts';
import { expectCount, expectUncut, expectVisible, idle, Refused } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The headline numbers the page draws, by the api's key, in its order. */
const KEYS = [
  'rounds',
  'firstTry',
  'costPerLanded',
  'timePerLanded',
  'landed',
  'runs',
  'tries',
  'refused',
  'gateWaitMs',
  'deniedPerTry',
] as const;

/** The part of `GET /api/stats`'s answer the page is held to. */
type Served = {
  all: {
    days: Array<Record<string, unknown> & { day: string }>;
    tiles: { last: Record<string, unknown> };
    marks: Array<{ day: string }>;
  };
};

/** The UTC day `n` days before today. */
const daysAgo = (n: number): string =>
  new Date(Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

/** What the api serves for `query`, read beside the page. */
async function served(page: Page, query: string): Promise<Served> {
  const answer = await page.request.get(new URL(`/api/stats?${query}`, page.url()).href);
  if (!answer.ok()) throw new Refused(`GET /api/stats?${query} answers — ${answer.status()}`);
  return (await answer.json()) as Served;
}

/** Each chart has a column per served day, each holding the day's served value, null kept; and a rule on each day a mark was served. */
async function expectCharts(page: Page, stats: Served, assertion: string): Promise<void> {
  const days = stats.all.days;
  for (const key of KEYS) {
    const chart = page.locator(`[data-chart="${key}"]`);
    await expectCount(
      chart.locator('[data-day]'),
      days.length,
      `${assertion}: the ${key} chart has a column for each of ${days.length} days`,
    );
    const drawn = await chart
      .locator('[data-day]')
      .evaluateAll((all) => all.map((g) => [g.getAttribute('data-day'), g.getAttribute('data-value')]));
    const wanted = days.map((d) => [d.day, JSON.stringify(d[key])]);
    if (JSON.stringify(drawn) !== JSON.stringify(wanted))
      throw new Refused(
        `${assertion}: the ${key} chart draws what the api serves — drew ${JSON.stringify(drawn)}, served ${JSON.stringify(wanted)}`,
      );
    const marked = new Set(stats.all.marks.map((m) => m.day)).size;
    await expectCount(
      chart.locator('[data-mark-day]'),
      marked,
      `${assertion}: the ${key} chart has a rule on each of the ${marked} days marked`,
    );
  }
}

/** The page on a phone's screen, photographed whole: nothing wider than the screen, every tile read whole; then the window put back. */
async function onPhone(page: Page): Promise<void> {
  const size = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  try {
    await idle(page);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (wide > 1) throw new Refused(`the page fits a phone's 390 pixels — it is ${wide} pixels wider`);
    await expectUncut(page.locator('[data-tile] [data-words]'), 'every tile says its name and its numbers whole on a phone');
    await photograph(page, path.join(OUT, `stats-phone-${await themeOf(page)}.png`), { fullPage: true });
  } finally {
    if (size) await page.setViewportSize(size);
  }
}

export default {
  /**
   * The Stats page: the sidebar lights Stats; each tile holds what the api serves for the last 14 days, null kept; each chart a column per
   * served day of the 28, with a rule on each day marked; All asks for every day and draws each; and a factory picked from its picker is
   * asked for as `ofFactory`, never `factory`, and lit.
   */
  name: 'stats',
  route: '/stats',
  expect: async (page) => {
    await sidebar(page);
    await expectVisible(
      page.locator('[data-sidebar="sidebar"] a[data-active="true"]', { hasText: 'Stats' }),
      'the sidebar lights Stats on its page',
    );
    const month = await served(page, `from=${daysAgo(27)}`);
    await expectCount(page.locator('[data-tile]'), KEYS.length, `a tile for each of the ${KEYS.length} headline numbers`);
    for (const key of KEYS) {
      const value = await page.locator(`[data-tile="${key}"]`).getAttribute('data-value');
      if (value !== JSON.stringify(month.all.tiles.last[key]))
        throw new Refused(
          `the ${key} tile holds the served last 14 days — holds ${value}, served ${JSON.stringify(month.all.tiles.last[key])}`,
        );
    }
    await expectUncut(page.locator('[data-tile] [data-words]'), 'every tile says its name and its numbers whole at 1280 wide');
    await expectCharts(page, month, 'over 28 days');
    await photograph(page.locator('section[aria-label="A day at a time"]'), path.join(OUT, `stats-charts-${await themeOf(page)}.png`));

    const every = page.waitForRequest((r) => new URL(r.url()).pathname === '/api/stats' && !new URL(r.url()).searchParams.has('from'));
    await page.locator('[data-period="all"]').click();
    await every;
    await idle(page);
    await expectVisible(page.locator('[data-period="all"][data-active]'), 'All lit once chosen');
    await expectCharts(page, await served(page, ''), 'over every day');

    await page.locator('[data-filter="factory"] button').click();
    const choice = page
      .getByRole('option')
      .filter({ hasNotText: /^any$/ })
      .filter({ hasNotText: /reading/ })
      .first();
    await expectVisible(choice, 'the factory picker offers the factories the runs were in, read as it opens');
    const factory = (await choice.textContent())?.trim() ?? '';
    const kept = page.waitForRequest((r) => {
      const url = new URL(r.url());
      return url.pathname === '/api/stats' && url.searchParams.get('ofFactory') === factory && !url.searchParams.has('by');
    });
    await choice.click();
    const asked = new URL((await kept).url());
    if (asked.searchParams.has('factory') || asked.searchParams.has('from'))
      throw new Refused(`the factory kept is asked for as ofFactory alone, over every day — asked ${asked.search}`);
    await idle(page);
    await expectVisible(page.locator('[data-filter="factory"][data-kept]'), `the factory picker lit, keeping ${factory}`);
    await expectCharts(page, await served(page, `ofFactory=${encodeURIComponent(factory)}`), `over every day of ${factory}`);
    await onPhone(page);
  },
} satisfies PageSpec;

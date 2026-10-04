import path from 'node:path';
import type { Page } from 'playwright';
import { pick, pickerOf, photograph, sidebar, themeOf } from '../board.ts';
import { expectCount, expectUncut, expectVisible, idle, Refused } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { FACTORIES, FAKE } from '../seed.ts';
import { OUT } from '../world.ts';

/** The headline numbers the page draws as tiles, by the api's key, in its order. */
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

/** The headline numbers the page draws as charts: every tile's, and skills loaded per try, which has no tile. */
const CHARTS = [...KEYS, 'skillsPerTry'] as const;

/** A step row's served count and how many of its tries were measured, for each table the page draws a step row in. */
const BY_STEP = {
  skills: { count: 'skillLoads', measured: 'skillTries' },
  denials: { count: 'deniedCalls', measured: 'deniedTries' },
} as const;

/** The part of `GET /api/stats`'s answer the page is held to. */
type Served = {
  all: {
    days: Array<Record<string, unknown> & { day: string }>;
    tiles: { last: Record<string, unknown> };
    marks: Array<{ day: string }>;
    steps: Array<Record<string, unknown> & { step: string; tries: number }>;
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
  for (const key of CHARTS) {
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

/**
 * Each step table has a row per served step, whose total is the served count — — where none of its tries was measured, and how many were
 * where not all — each name read whole; `theme`'s session's skills are named with their counts.
 */
async function expectByStep(page: Page, stats: Served, assertion: string): Promise<void> {
  for (const [kind, { count, measured }] of Object.entries(BY_STEP)) {
    const table = page.locator(`[data-by-step="${kind}"]`);
    await expectCount(table.locator('[data-by-step-row]'), stats.all.steps.length, `${assertion}: a ${kind} row for each served step`);
    const drawn = await table
      .locator('[data-by-step-row]')
      .evaluateAll((rows) => rows.map((r) => [r.getAttribute('data-by-step-row'), r.querySelector('[data-total]')?.textContent ?? '']));
    const wanted = stats.all.steps.map((s) => {
      const n = s[count] as number | null;
      const of = s[measured] as number;
      return [s.step, n === null ? '—' : of === s.tries ? String(n) : `${n} (${of} of ${s.tries})`];
    });
    if (JSON.stringify(drawn) !== JSON.stringify(wanted))
      throw new Refused(
        `${assertion}: the ${kind} rows say what the api serves — drew ${JSON.stringify(drawn)}, served ${JSON.stringify(wanted)}`,
      );
    await expectUncut(table.locator('[data-by-step-row] td, [data-item]'), `${assertion}: every ${kind} cell and name read whole`);
  }
  const theme = page.locator(`[data-by-step="skills"] [data-by-step-row="${FAKE.refused}"]`);
  await expectVisible(theme.locator('[data-item="look"]', { hasText: '×2' }), `${assertion}: ${FAKE.refused} loaded look twice`);
  await expectVisible(theme.locator('[data-item="effect"]', { hasText: '×1' }), `${assertion}: ${FAKE.refused} loaded effect once`);
}

/** Where the two step tables sit: side by side, or the calls refused below the skills loaded. */
async function byStepLayout(page: Page): Promise<'side by side' | 'stacked'> {
  const skills = await page.locator('[data-by-step="skills"]').boundingBox();
  const denials = await page.locator('[data-by-step="denials"]').boundingBox();
  if (!skills || !denials) throw new Refused('the two step tables are drawn');
  if (denials.y >= skills.y + skills.height) return 'stacked';
  if (Math.abs(denials.y - skills.y) < 2 && denials.x >= skills.x + skills.width) return 'side by side';
  throw new Refused(`the step tables neither sit side by side nor stack — ${JSON.stringify({ skills, denials })}`);
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
    await expectUncut(page.locator('[data-by-step-row] td, [data-item]'), 'every step table cell and name read whole on a phone');
    if ((await byStepLayout(page)) !== 'stacked') throw new Refused('the step tables stack on a phone');
    await photograph(page, path.join(OUT, `stats-phone-${await themeOf(page)}.png`), { fullPage: true });
  } finally {
    if (size) await page.setViewportSize(size);
  }
}

export default {
  /**
   * The Stats page: the sidebar lights Stats; each tile holds what the api serves for the last 14 days, null kept; each chart a column per
   * served day of the 28, with a rule on each day marked, skills loaded drawn as a chart with no tile; a row per served step in the skills
   * loaded and the calls refused, side by side from 1280 wide and stacked on a phone; All asks for every day and draws each; and a
   * factory picked in the sidebar's picker keeps the period, is asked for as `ofFactory`, never `factory`, and has no picker of its own
   * on the page.
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
    await expectByStep(page, month, 'over 28 days');
    if ((await byStepLayout(page)) !== 'side by side') throw new Refused('the step tables sit side by side at 1280 wide');
    await photograph(
      page.locator('[data-by-step="skills"]').locator('xpath=..'),
      path.join(OUT, `stats-by-step-${await themeOf(page)}.png`),
    );

    const every = page.waitForRequest((r) => new URL(r.url()).pathname === '/api/stats' && !new URL(r.url()).searchParams.has('from'));
    await page.locator('[data-period="all"]').click();
    await every;
    await idle(page);
    await expectVisible(page.locator('[data-period="all"][data-active]'), 'All lit once chosen');
    await expectCharts(page, await served(page, ''), 'over every day');

    await expectCount(page.locator('[data-filter="factory"]'), 0, "the page has no factory picker: the sidebar's picks it");
    const factory = FACTORIES.hiring.name;
    const kept = page.waitForRequest((r) => {
      const url = new URL(r.url());
      return url.pathname === '/api/stats' && url.searchParams.get('ofFactory') === factory && !url.searchParams.has('by');
    });
    await pick(page, factory);
    const asked = new URL((await kept).url());
    if (asked.searchParams.has('factory') || asked.searchParams.has('from'))
      throw new Refused(`the factory kept is asked for as ofFactory alone, over every day — asked ${asked.search}`);
    await idle(page);
    const at = new URL(page.url());
    if (at.pathname !== '/stats' || at.searchParams.get('factory') !== factory || at.searchParams.get('period') !== 'all')
      throw new Refused(`picked in the sidebar, ${factory} is kept in the address with the period — it is ${at.pathname}${at.search}`);
    await expectVisible(pickerOf(page).getByText(factory, { exact: true }), `the sidebar's picker reads ${factory}`);
    await expectCharts(page, await served(page, `ofFactory=${encodeURIComponent(factory)}`), `over every day of ${factory}`);
    await onPhone(page);
  },
} satisfies PageSpec;

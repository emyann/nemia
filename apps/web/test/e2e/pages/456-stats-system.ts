import path from 'node:path';
import type { Page } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectUncut, expectVisible, idle, Refused } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { SERIES } from '../seed.ts';
import { OUT } from '../world.ts';

/** The part of `GET /api/series`'s answer the section is held to. */
type Served = { span: string; series: Array<{ s: string; l: Record<string, string>; points: Array<{ p95?: number }> }> };

/** What the api serves over `range`, read beside the page. */
async function served(page: Page, range: string): Promise<Served> {
  const answer = await page.request.get(new URL(`/api/series?range=${range}`, page.url()).href);
  if (!answer.ok()) throw new Refused(`GET /api/series?range=${range} answers — ${answer.status()}`);
  return (await answer.json()) as Served;
}

/** The points served of a series, over every label set. */
const pointsOf = (read: Served, s: string): number => read.series.filter((x) => x.s === s).reduce((n, x) => n + x.points.length, 0);

/** Each chart draws a trace a series the api serves for it, each with as many points as it serves. */
async function expectCharts(page: Page, read: Served, range: string): Promise<void> {
  const section = page.locator('section#system');
  const wanted: Array<[string, string, number]> = [
    ['pass', 'p95', pointsOf(read, 'pass.ms')],
    ['pass', 'runs', pointsOf(read, 'store.runs')],
    ['admission', 'wait', pointsOf(read, 'admission.wait.ms')],
    ['admission', 'queued', pointsOf(read, 'sessions.queued')],
  ];
  for (const [chart, trace, count] of wanted) {
    if (!count) throw new Refused(`the api serves ${trace} over ${range} from the seeded series — it serves none`);
    const drawn = section.locator(`[data-system-chart="${chart}"] [data-trace="${trace}"]`);
    await expectCount(drawn, 1, `the ${chart} chart draws ${trace} over ${range}`);
    const points = Number(await drawn.getAttribute('data-points'));
    if (points !== count) throw new Refused(`${trace} over ${range} draws the ${count} points served — it draws ${points}`);
  }
  const windows = read.series.filter((x) => x.s === 'quota.used').length;
  await expectCount(section.locator('[data-system-chart="quota"] [data-trace]'), windows, `a quota line a window served, ${windows}`);
}

/** The range picked: its button marked, and the charts redrawn over what the api serves for it. */
async function pickRange(page: Page, range: string): Promise<Served> {
  await page.locator(`section#system [data-range="${range}"]`).click();
  await expectVisible(page.locator(`section#system [data-range="${range}"][data-active]`), `${range} is the range shown`);
  await idle(page);
  const read = await served(page, range);
  await expectCharts(page, read, range);
  return read;
}

/** The UTC day `back` days before today. */
const dayBack = (back: number): string => new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10);

/**
 * The landings by factory, answered for a week by a fixed `GET /api/stats?by=factory` while the range is picked: a factory that landed
 * nothing and a run with no repository left out, the most landed first, each day a column (`data-day`) scaled to the most landed on one,
 * a day with none a stub, and the totals said. Returns what the week read served.
 */
async function expectLandings(page: Page): Promise<Served> {
  const day = (back: number, landed: number | null, costPerLanded: number | null) => ({ day: dayBack(back), landed, costPerLanded });
  const groups = [
    { key: 'idle', days: [day(2, 0, null), day(1, null, null), day(0, 0, null)] },
    { key: 'home', days: [day(2, 0, null), day(1, 1, null), day(0, 0, null)] },
    { key: 'nemia', days: [day(2, 3, 2.5), day(1, 0, null), day(0, 1, 4)] },
    { key: null, days: [day(2, 2, 1), day(1, 0, null), day(0, 0, null)] },
  ];
  const isFactories = (url: URL) => url.pathname === '/api/stats' && url.searchParams.get('by') === 'factory';
  await page.route(isFactories, (route) => route.fulfill({ json: { groups } }));
  try {
    const read = await pickRange(page, '7d');
    const rows = page.locator('section#system [data-landings] [data-factory]');
    await expectCount(rows, 2, 'a row a factory that landed, none for one that landed nothing nor for a run with no repository');
    const order = await rows.evaluateAll((els) => els.map((el) => `${el.getAttribute('data-factory')}:${el.getAttribute('data-landed')}`));
    if (order.join(' ') !== 'nemia:4 home:1') throw new Refused(`the most landed first, nemia:4 home:1 — the rows are ${order.join(' ')}`);
    const nemia = page.locator('section#system [data-landings] [data-factory="nemia"]');
    const totals = await nemia.locator('[data-totals]').textContent();
    if (totals !== '4 landed · $11.50') throw new Refused(`nemia's totals read 4 landed · $11.50 — they read ${totals}`);
    const heights = await nemia.locator('[data-day]').evaluateAll((els) => els.map((el) => (el as HTMLElement).offsetHeight));
    const [most, none, one] = heights;
    if (!(most > one && one > none && none <= 1 && Math.abs(most - 3 * one) <= 1))
      throw new Refused(`a column a day scaled to the 3 landed, a stub for none — the columns are ${heights.join(', ')} pixels tall`);
    await photograph(page.locator('section#system'), path.join(OUT, `stats-system-week-${await themeOf(page)}.png`));
    return read;
  } finally {
    await page.unroute(isFactories);
  }
}

/** On a phone's 390 pixels: the page no wider, the legends and facts read whole, and its picture. */
async function onPhone(page: Page): Promise<void> {
  const size = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  try {
    await idle(page);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (wide > 1) throw new Refused(`the page fits a phone's 390 pixels — it is ${wide} pixels wider`);
    await expectUncut(
      page.locator('section#system [data-fact] dt, section#system [data-fact] dd'),
      'every health fact reads whole on a phone',
    );
    await photograph(page.locator('section#system'), path.join(OUT, `stats-system-phone-${await themeOf(page)}.png`));
  } finally {
    if (size) await page.setViewportSize(size);
  }
}

export default {
  /**
   * The Stats page's section on the system (`#system`): over the last day, a chart each of a pass's time against the store, admission and
   * quota burn, each trace with as many points as the api serves; over 7 days and over every day once picked, the same; the system's
   * health over the page's period, its runs in the store the most the seeded hours hold; the landings by factory, drawn over a week from a
   * fixed answer; read whole at 1280 wide and on a phone.
   */
  name: 'stats-system',
  route: '/stats',
  expect: async (page) => {
    const day = await served(page, '24h');
    if (pointsOf(day, 'pass.ms') !== SERIES.minutes)
      throw new Refused(`the api serves the ${SERIES.minutes} minutes seeded — it serves ${pointsOf(day, 'pass.ms')}`);
    await expectVisible(page.locator('section#system [data-system-chart="pass"] svg'), 'the section draws the series kept');
    await expectCharts(page, day, '24h');
    const most = Math.max(...SERIES.lines(3_600_000, SERIES.hours, Date.now()).flatMap((x) => (x.s === 'store.runs' ? [x.max] : [])));
    const runs = await page.locator('section#system [data-health] [data-fact="runs"] dd').textContent();
    if (runs !== String(most)) throw new Refused(`the health says the most runs the seeded hours hold, ${most} — it says ${runs}`);
    await expectVisible(page.locator('section#system [data-landings]'), 'the landings by factory are drawn beside the charts');
    await expectUncut(page.locator('section#system [data-fact] dt, section#system [data-fact] dd'), 'every health fact reads whole');
    await photograph(page.locator('section#system'), path.join(OUT, `stats-system-section-${await themeOf(page)}.png`));

    await expectLandings(page);
    const all = await pickRange(page, 'all');
    if (all.span !== 'day') throw new Refused(`all is a point a day — the api serves a point a ${all.span}`);
    await pickRange(page, '24h');
    await onPhone(page);
  },
} satisfies PageSpec;

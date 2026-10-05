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
   * health over the page's period, its runs in the store the most the seeded hours hold; the landings by factory; read whole at 1280 wide
   * and on a phone.
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

    await pickRange(page, '7d');
    await photograph(page.locator('section#system'), path.join(OUT, `stats-system-week-${await themeOf(page)}.png`));
    const all = await pickRange(page, 'all');
    if (all.span !== 'day') throw new Refused(`all is a point a day — the api serves a point a ${all.span}`);
    await pickRange(page, '24h');
    await onPhone(page);
  },
} satisfies PageSpec;

import path from 'node:path';
import type { Page } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectUncut, expectVisible, idle, Refused } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { RECENT } from '../seed.ts';
import { OUT } from '../world.ts';

/** The part of `GET /api/passes`'s answer the section is held to. */
type Served = {
  histogram: Array<{ le: number | null; count: number }>;
  parts: Array<{ phase: string; share: number }>;
  summary: { passes: number; runs: number; reads: number } | null;
};

/** What the api serves for the recent passes, read beside the page. */
async function served(page: Page): Promise<Served> {
  const answer = await page.request.get(new URL('/api/passes', page.url()).href);
  if (!answer.ok()) throw new Refused(`GET /api/passes answers — ${answer.status()}`);
  return (await answer.json()) as Served;
}

/** The section draws a column for each served bucket with its count, and a bar for each served part, in the served order. */
async function expectDrawn(page: Page, passes: Served): Promise<void> {
  const section = page.locator('section#passes');
  await expectCount(section.locator('[data-bucket]'), passes.histogram.length, `a column for each of ${passes.histogram.length} buckets`);
  const drawn = await section
    .locator('[data-bucket]')
    .evaluateAll((all) => all.map((b) => [b.getAttribute('data-bucket'), Number(b.getAttribute('data-count'))]));
  const wanted = passes.histogram.map((b) => [b.le === null ? 'over' : String(b.le), b.count]);
  if (JSON.stringify(drawn) !== JSON.stringify(wanted))
    throw new Refused(`the histogram draws what the api serves — drew ${JSON.stringify(drawn)}, served ${JSON.stringify(wanted)}`);
  const parts = await section.locator('[data-part]').evaluateAll((all) => all.map((p) => p.getAttribute('data-part')));
  if (JSON.stringify(parts) !== JSON.stringify(passes.parts.map((p) => p.phase)))
    throw new Refused(`the parts are the served ones, heaviest first — drew ${JSON.stringify(parts)}`);
  const runs = await section.locator('[data-fact="runs"] dd').textContent();
  if (runs !== String(passes.summary?.runs))
    throw new Refused(`the runs in the store are the last pass's, ${passes.summary?.runs} — it says ${runs}`);
  await expectUncut(section.locator('[data-fact] dt, [data-fact] dd, [data-part] span'), 'every fact and part reads whole');
}

/** On a phone's 390 pixels: the page no wider, the section read whole, and its picture. */
async function onPhone(page: Page): Promise<void> {
  const size = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  try {
    await idle(page);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (wide > 1) throw new Refused(`the page fits a phone's 390 pixels — it is ${wide} pixels wider`);
    await expectUncut(page.locator('section#passes [data-fact] dt, section#passes [data-fact] dd'), 'every fact reads whole on a phone');
    await photograph(page.locator('section#passes'), path.join(OUT, `stats-passes-phone-${await themeOf(page)}.png`));
  } finally {
    if (size) await page.setViewportSize(size);
  }
}

export default {
  /**
   * The Stats page's section on the tick's pass (`#passes`): a column for each bucket of the recent passes the api serves, with its count;
   * a bar for each part of a pass, heaviest first; the facts beside them, the runs in the store the last pass's; read whole at 1280 wide
   * and on a phone. And the Factory's `a pass takes N ms` is a link to it, which lands on it.
   */
  name: 'stats-passes',
  route: '/stats',
  expect: async (page) => {
    const passes = await served(page);
    if (passes.summary?.passes !== RECENT.ms.length)
      throw new Refused(`the api serves the ${RECENT.ms.length} passes seeded — it serves ${passes.summary?.passes}`);
    await expectVisible(page.locator('section#passes [data-histogram]'), 'the section draws the recent passes');
    await expectDrawn(page, passes);
    await photograph(page.locator('section#passes'), path.join(OUT, `stats-passes-section-${await themeOf(page)}.png`));
    await onPhone(page);

    await page.goto(new URL('/factories/default', page.url()).href);
    await idle(page);
    const link = page.locator('[data-cap] [data-pass] a');
    await expectVisible(link, 'the Factory says what a pass takes, as a link');
    const href = await link.getAttribute('href');
    if (href !== '/stats#passes') throw new Refused(`the pass's line links to the Stats page's section — it links to ${href}`);
    await link.click();
    await page.waitForURL((url) => url.pathname === '/stats' && url.hash === '#passes');
    await idle(page);
    await expectVisible(page.locator('section#passes [data-histogram]'), 'the link lands on the section');
  },
} satisfies PageSpec;

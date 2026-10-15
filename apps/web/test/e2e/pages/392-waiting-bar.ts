import path from 'node:path';
import type { Locator, Page } from 'playwright';
import type { OpenRuns, RunSummary } from '../../../src/lib/api/runs.ts';
import { bellHash, bellRows, type BellRow } from '../../../src/lib/bell.ts';
import { waitsOnYou } from '../../../src/lib/factory.ts';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectOnScreen, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import { FACTORIES } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The button under the runs that wait on you, on the Runs page. */
const openerOf = (page: Page): Locator => page.locator('[data-section="waiting"] [data-waiting-opener]');

/** The floating bar of the runs waiting on you. */
const waitingBar = (page: Page): Locator => page.getByRole('complementary', { name: 'Waiting on you' });

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
 * The board's own rule (`waitsOnYou`), which the pages still on the whole list keep, names the runs the api says wait: the one place the
 * two rules are compared, on the seeded store.
 */
async function agrees(page: Page, rows: readonly BellRow[]): Promise<void> {
  if (!rows.length) throw new Refused('the seeded store has runs waiting on you: the api lists none');
  const own = bellRows((await answer<RunSummary[]>(page, '/api/runs')).filter(waitsOnYou)).map((row) => row.run);
  const said = rows.map((row) => row.run);
  if (own.join() !== said.join())
    throw new Refused(`the api says ${said.join(', ')} wait on you — the board's rule over the whole list says ${own.join(', ')}`);
}

/**
 * Pressed, the button under what waits on the Runs page `to` opens the runs waiting on you in every factory in the floating bar,
 * named in the address: a row each, oldest first, with its factory's tag; pressed again, it closes.
 */
async function opens(page: Page, to: string, rows: readonly BellRow[]): Promise<void> {
  await visit(page, to);
  await openerOf(page).click();
  await page.waitForURL((url) => url.searchParams.get('bar') === 'waiting', { timeout: WAIT_MS });
  if ((await openerOf(page).getAttribute('aria-expanded')) !== 'true') throw new Refused('the button pressed says its bar is open');
  const bar = waitingBar(page);
  await expectCount(bar.locator('[data-waiting-run]'), rows.length, `${to}: a row for each run waiting on you, in every factory`);
  const listed = await bar.locator('[data-waiting-run]').evaluateAll((all) => all.map((row) => row.getAttribute('data-waiting-run')));
  if (listed.join() !== rows.map((row) => row.run).join())
    throw new Refused(`the rows stand oldest first, ${rows.map((row) => row.run).join(', ')} — they stand ${listed.join(', ')}`);
  for (const row of rows)
    await expectVisible(
      bar.locator(`[data-waiting-run="${row.run}"] [data-factory-tag="${row.factory}"]`),
      `${row.run}'s row names its factory, ${row.factory}`,
    );
  await openerOf(page).click();
  await page.waitForURL((url) => !url.searchParams.has('bar'), { timeout: WAIT_MS });
  await expectCount(waitingBar(page), 0, 'pressed again, the button closes the bar');
}

/** A row at a gate opens its run's page at that step's section, the bar closed; Back returns to the bar on the Runs page. */
async function follows(page: Page, rows: readonly BellRow[]): Promise<void> {
  const row = rows.find((one) => one.gate !== null);
  if (!row?.gate) throw new Refused('the seeded store has a run waiting at its gate');
  await visit(page, '/runs');
  await openerOf(page).click();
  await settled(page);
  await photograph(page, path.join(OUT, `waiting-bar-open-${await themeOf(page)}.png`));
  await waitingBar(page).locator(`[data-waiting-run="${row.run}"]`).click();
  await page.waitForURL((url) => url.pathname === `/runs/${row.run}`, { timeout: WAIT_MS });
  const url = new URL(page.url());
  if (url.hash !== `#${bellHash(row)}` || url.searchParams.has('bar'))
    throw new Refused(`the row opens /runs/${row.run}#${bellHash(row)}, the bar closed — it opens ${url.pathname}${url.search}${url.hash}`);
  await expectOnScreen(page.locator(`section[id="${bellHash(row)}"] h2`).first(), "the gate's section is in view");
  await page.goBack();
  await page.waitForURL((back) => back.pathname === '/runs' && back.searchParams.get('bar') === 'waiting', { timeout: WAIT_MS });
  await expectVisible(waitingBar(page), 'Back returns to the bar');
}

export default {
  /**
   * The bar of the runs waiting on you, opened from the Runs page under what waits on you: under All factories and under a factory that
   * holds none of them, it lists every run the api says waits on you, in every factory, the board's own rule over the whole list naming
   * the same runs, a row each, oldest first, with its factory; pressed again it closes. A row at a gate opens its run's page at that
   * step, and Back returns to the bar. It writes nothing.
   */
  name: 'waiting-bar',
  route: '/runs',
  expect: async (page) => {
    try {
      const rows = bellRows((await answer<OpenRuns>(page, '/api/runs-open')).waiting);
      await agrees(page, rows);
      await opens(page, '/runs', rows);
      await opens(page, `/runs?factory=${FACTORIES.others[0]}`, rows);
      await follows(page, rows);
    } finally {
      await visit(page, '/runs');
    }
  },
} satisfies PageSpec;

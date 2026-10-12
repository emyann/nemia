import type { Page } from 'playwright';
import type { Factory } from '../../../src/lib/api/factories.ts';
import type { OpenRuns, RunSummary } from '../../../src/lib/api/runs.ts';
import { barValue } from '../../../src/lib/bar.ts';
import { bellCount } from '../../../src/lib/bell.ts';
import { openBlockOf, runsOf } from '../../../src/lib/factories.ts';
import { openRows, titleOf } from '../../../src/lib/factory.ts';
import { atWork, atWorkWords } from '../../../src/lib/footer.ts';
import { sidebarOf } from '../board.ts';
import { expectNone, expectTexts, idle, Refused } from '../checks.ts';
import { FACTORIES } from '../seed.ts';
import type { PageSpec } from '../visit.ts';

/** The key this browser keeps its favourites under. */
const FAVORITES_KEY = 'nemia:favorites';
/** The factory whose bar the page opens: the one that holds a run. */
const FACTORY = FACTORIES.hiring.name;
/** The whole list of the runs, and the light answer, by their paths on the api. */
const [WHOLE, LIGHT] = ['/api/runs', '/api/runs-open'];

/** What the api answers at `pathname`, read apart from the page: the page's own requests do not count it. */
async function answer<T>(page: Page, pathname: string): Promise<T> {
  return (await (await page.request.get(new URL(pathname, page.url()).href)).json()) as T;
}

/** Goes to `to` in this tab and waits for its reads. */
async function visit(page: Page, to: string): Promise<void> {
  await page.goto(new URL(to, page.url()).href, { waitUntil: 'load' });
  await idle(page);
}

/** The frame says the bell's count, what is at work and the starred run's title, each off the api's light answer or the run's own read. */
async function frameSays(page: Page, open: OpenRuns, starred: Pick<RunSummary, 'id' | 'brief'>, where: string): Promise<void> {
  const count = page.locator('header[data-frame-header] [data-bell-count]');
  await expectTexts(
    count,
    open.counts.waiting ? [bellCount(open.counts.waiting)] : [],
    `${where}: the bell counts what the api says waits`,
  );
  const work = atWorkWords(atWork(openRows(open))).text;
  await expectTexts(page.locator('footer[data-frame-footer] [data-at-work]'), [work], `${where}: the footer says what is at work`);
  const links = sidebarOf(page).locator('[data-favorites]').getByRole('link');
  await expectTexts(links, [titleOf(starred)], `${where}: a starred finished run keeps its title`);
}

export default {
  /**
   * The frame's reads, on two pages that hold no reader of the whole list, Agents and a factory's Workflows with its bar open: the bell,
   * the footer, the factory's bar and a starred finished run are drawn, the page asked for the light answer, and it made no request for
   * the whole list of the runs. Home, which reads the whole list, is then heard asking for it by the same listener. The star is taken
   * back.
   */
  name: 'frame-reads',
  route: '/agents',
  expect: async (page) => {
    const heard: string[] = [];
    const hear = (request: { url: () => string }) => heard.push(new URL(request.url()).pathname);
    page.on('request', hear);
    try {
      const finished = (await answer<{ runs: RunSummary[] }>(page, '/api/runs-finished')).runs[0];
      if (!finished) throw new Refused('the seeded store has a finished run to star');
      const kept = JSON.stringify([{ kind: 'run', run: finished.id }]);
      await page.evaluate(([key, value]) => localStorage.setItem(key, value), [FAVORITES_KEY, kept] as const);

      await visit(page, '/agents');
      await frameSays(page, await answer<OpenRuns>(page, LIGHT), finished, 'Agents');

      const bar = barValue({ kind: 'factory', factory: FACTORY });
      await visit(page, `/workflows?factory=${FACTORY}&bar=${encodeURIComponent(bar)}`);
      await frameSays(page, await answer<OpenRuns>(page, LIGHT), finished, "a factory's Workflows");
      const factory = (await answer<Factory[]>(page, '/api/factories')).find((one) => one.name === FACTORY);
      if (!factory) throw new Refused(`the seeded store has the factory ${FACTORY}`);
      const block = openBlockOf(factory, await answer<OpenRuns>(page, `${LIGHT}?ofFactory=${FACTORY}`));
      if (block.runs === 0) throw new Refused(`the factory ${FACTORY} holds a run, so its bar counts the finished`);
      await expectTexts(
        page.locator(`[data-factory-bar="${FACTORY}"] [data-runs]`),
        [runsOf(block)],
        "the factory's bar says its runs off its own light answer",
      );

      if (!heard.includes(LIGHT)) throw new Refused(`the frame asked for ${LIGHT} — the page asked for ${[...new Set(heard)].join(', ')}`);
      if (heard.includes(WHOLE))
        throw new Refused(
          `no page that holds no reader of the whole list asks for ${WHOLE} — one did, ${heard.filter((p) => p === WHOLE).length} times`,
        );

      await visit(page, '/');
      await expectNone(
        async () => (heard.includes(WHOLE) ? null : `it has not asked for ${WHOLE}`),
        `Home, which reads the whole list, is heard asking for ${WHOLE}: the listener is not deaf`,
      );
    } finally {
      page.off('request', hear);
      await page.evaluate((key) => localStorage.removeItem(key), FAVORITES_KEY);
      await visit(page, '/agents');
    }
  },
} satisfies PageSpec;

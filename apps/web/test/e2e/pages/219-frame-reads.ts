import type { Page } from 'playwright';
import { OPEN_SELECTOR, type OpenRuns } from '../../../src/lib/api/runs.ts';
import { barValue } from '../../../src/lib/bar.ts';
import { openBlockOf, runsOf } from '../../../src/lib/factories.ts';
import { atWork, atWorkWords } from '../../../src/lib/footer.ts';
import { factoriesAnswered, gaugesOf, openAnswered, railPlace } from '../board.ts';
import { expectNone, expectTexts, idle, Refused } from '../checks.ts';
import { FACTORIES } from '../seed.ts';
import type { PageSpec } from '../visit.ts';

/** The factory whose bar the page opens: the one that holds a run. */
const FACTORY = FACTORIES.hiring.name;
/**
 * The whole list of the runs, the plain RunList, and the frame's, the RunList of the runs not finished, each by its path and query on the
 * api as a request's address says them decoded.
 */
const [WHOLE, LIGHT] = ['/api/runs', `/api/runs?fieldSelector=${OPEN_SELECTOR}`];

/** Goes to `to` in this tab and waits for its reads. */
async function visit(page: Page, to: string): Promise<void> {
  await page.goto(new URL(to, page.url()).href, { waitUntil: 'load' });
  await idle(page);
}

/** The rail's Runs badge counts what `open`, the api's light answer for the factory picked, says waits; none for none. */
async function railCounts(page: Page, open: OpenRuns, where: string): Promise<void> {
  await expectTexts(
    railPlace(page, 'Runs').locator('[data-slot="badge"]'),
    open.counts.waiting ? [String(open.counts.waiting)] : [],
    `${where}: the Runs badge counts what the api says waits`,
  );
}

export default {
  /**
   * The frame's reads, on two pages that hold no reader of the whole list, Agents and a factory's Workflows with its bar open: the rail's
   * Runs badge, the gauges and the factory's bar are drawn, the page asked for the light answer, and it made no request for the whole
   * list of the runs. The Overview, which reads the whole list, is then heard asking for it by the same listener.
   */
  name: 'frame-reads',
  route: '/agents',
  expect: async (page) => {
    const heard: string[] = [];
    const hear = (request: { url: () => string }) => {
      const url = new URL(request.url());
      heard.push(decodeURIComponent(`${url.pathname}${url.search}`));
    };
    page.on('request', hear);
    try {
      await visit(page, '/agents');
      const open = await openAnswered(page);
      await railCounts(page, open, 'Agents');
      await expectTexts(
        (await gaugesOf(page)).locator('[data-at-work-sentence]'),
        [atWorkWords(atWork(open)).title],
        'Agents: the gauges say what is at work',
      );

      const bar = barValue({ kind: 'factory', factory: FACTORY });
      await visit(page, `/workflows?factory=${FACTORY}&bar=${encodeURIComponent(bar)}`);
      await railCounts(page, await openAnswered(page, FACTORY), "a factory's Workflows");
      const factory = (await factoriesAnswered(page)).find((one) => one.name === FACTORY);
      if (!factory) throw new Refused(`the seeded store has the factory ${FACTORY}`);
      const block = openBlockOf(factory, await openAnswered(page, FACTORY));
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
        `the Overview, which reads the whole list, is heard asking for ${WHOLE}: the listener is not deaf`,
      );
    } finally {
      page.off('request', hear);
      await visit(page, '/agents');
    }
  },
} satisfies PageSpec;

import path from 'node:path';
import type { Locator, Page, Route } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { expectInside, expectVisible, idle, Refused, settled } from '../checks.ts';
import { FAKE } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** Why the runtime could not read one session alone, as it words a transcript line that does not decode: a path and a field quoted. */
const WHY =
  "`ae/t-tokens/1`'s transcript cannot be read: line 2 of ~/.claude/projects/-code-app/" +
  '0123456789abcdef0123456789abcdef.jsonl does not decode: Expected string, got "yesterday" at ["timestamp"]';

/** Where the run's detail is read. */
const isDetail = (url: URL) => url.pathname === `/api/runs/${FAKE.id}`;

/** The seeded run's detail with `FAKE.unverified`'s session alone unread, saying `WHY`; the rest as the api says it. */
const unread = async (route: Route) => {
  const response = await route.fetch();
  const body = (await response.json()) as { steps: Array<{ name: string }> };
  const steps = body.steps.map((step) => (step.name === FAKE.unverified ? { ...step, sessionUnread: WHY } : step));
  await route.fulfill({ response, json: { ...body, steps } });
};

/** The run's page, its detail answered with `FAKE.unverified` unread; its section once loaded. */
async function onRun(page: Page): Promise<Locator> {
  await page.route(isDetail, unread);
  await page.goto(new URL(`/runs/${FAKE.id}`, page.url()).href, { waitUntil: 'load' });
  await idle(page);
  return page.locator(`#step-${FAKE.unverified}`);
}

export default {
  /**
   * Why one step's session alone could not be read, on the run's page: an `unread` row in that step's facts, the runtime's words whole,
   * wrapped within its section on a phone's 390 pixels however long a path it quotes, and no such row on a step read beside it. The
   * run's detail is routed, since the e2e's sessions are all read, and let go after. Nothing is written to the store.
   */
  name: 'unread-session',
  route: '/runs',
  expect: async (page) => {
    const size = page.viewportSize();
    try {
      const section = await onRun(page);
      const row = section.locator('[data-fact="unread"] [data-unread]');
      await expectVisible(row, `${FAKE.unverified}'s facts say why its session is unread`);
      const said = await row.textContent();
      if (said !== WHY) throw new Refused(`the unread row says the runtime's words whole — it says ${said}`);
      const beside = await page.locator(`#step-${FAKE.refused} [data-fact="unread"]`).count();
      if (beside) throw new Refused(`${FAKE.refused}, read beside it, draws no unread row — it draws ${beside}`);
      await page.setViewportSize({ width: 390, height: 844 });
      await row.scrollIntoViewIfNeeded();
      await settled(page);
      await expectInside(row, section, `the unread row wraps within ${FAKE.unverified}'s section on a phone, the path it quotes too`);
      await photograph(section, path.join(OUT, `unread-session-row-${await themeOf(page)}.png`));
    } finally {
      await page.unroute(isDetail);
      if (size) await page.setViewportSize(size);
    }
  },
} satisfies PageSpec;

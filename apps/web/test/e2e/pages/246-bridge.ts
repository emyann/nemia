import path from 'node:path';
import type { Locator, Page, Route } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { expectVisible, idle, Refused, settled } from '../checks.ts';
import { FAKE } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The web link the api answers for a bridged session: Claude Code's form, an id of its own for the page. */
const LINK = 'https://claude.ai/code/session_01E2eBridgePage';

/** Where the run's detail is read, and Nemia's level. */
const isDetail = (url: URL) => url.pathname === `/api/runs/${FAKE.id}`;
const isLevel = (url: URL) => url.pathname === '/api/level';

/** The api's answer to `route`, its JSON changed by `change`: a bridge the e2e's sessions cannot raise, the rest as the api says it. */
const answered = (change: (body: Record<string, unknown>) => Record<string, unknown>) => async (route: Route) => {
  const response = await route.fetch();
  await route.fulfill({ response, json: change((await response.json()) as Record<string, unknown>) });
};

/** The seeded run's detail with `FAKE.unverified` filed bridged and its link up. */
const bridgedStep = (body: Record<string, unknown>) => ({
  ...body,
  steps: (body.steps as Array<{ name: string; filed: Record<string, unknown> | null }>).map((step) =>
    step.name === FAKE.unverified ? { ...step, filed: { ...step.filed, bridge: { url: LINK, why: null } } } : step,
  ),
});

/** Her level with her session up and bridged: the attach line, then her link, as the api says them. */
const bridgedLevel = (body: Record<string, unknown>) => ({
  ...body,
  level: 'semi-auto',
  task: 'nemia-20261006T080000Z',
  phase: 'running',
  sessionId: '0123456789abcdef',
  reach: ['claude attach 01234567', LINK],
  bridge: { url: LINK, why: null },
});

/** `link` is the bridge's web link, opened in a tab of its own with no referrer. */
async function expectLink(link: Locator, where: string): Promise<void> {
  await expectVisible(link, `${where} draws the web link`);
  const [href, target, rel] = await Promise.all(['href', 'target', 'rel'].map((name) => link.getAttribute(name)));
  if (href !== LINK || target !== '_blank' || rel !== 'noreferrer')
    throw new Refused(`${where}'s link opens ${LINK} in a new tab with no referrer — it is ${JSON.stringify({ href, target, rel })}`);
}

/** The run's page, its detail answered bridged for `FAKE.unverified`: the step's facts draw a `reach` row with the link. */
async function expectStep(page: Page): Promise<void> {
  await page.route(isDetail, answered(bridgedStep));
  try {
    await page.goto(new URL(`/runs/${FAKE.id}`, page.url()).href, { waitUntil: 'load' });
    await idle(page);
    const section = page.locator(`#step-${FAKE.unverified}`);
    await expectLink(section.locator('[data-fact="reach"] a[data-step-bridge]'), `${FAKE.unverified}'s section`);
    await section.scrollIntoViewIfNeeded();
    await settled(page);
    await photograph(section, path.join(OUT, `bridge-step-${await themeOf(page)}.png`));
  } finally {
    await page.unroute(isDetail);
  }
}

export default {
  /**
   * A bridged session's web link on the board, its api answer routed, since the e2e's sessions raise no bridge: a step filed bridged
   * draws a `reach` row on the run's page, and Nemia's section on Settings draws her link once, after her attach line, each an external
   * link to the exact address. Nothing is written to the store.
   */
  name: 'bridge',
  route: '/settings',
  expect: async (page) => {
    await page.route(isLevel, answered(bridgedLevel));
    try {
      await page.reload({ waitUntil: 'load' });
      await idle(page);
      const reach = page.locator('[data-nemia-section] [data-nemia-reach]');
      await expectVisible(reach.locator('[data-nemia-attach]', { hasText: 'attach 01234567' }), 'her attach line, to copy');
      await expectLink(reach.locator('a[data-nemia-bridge]'), 'her reach');
      const said = await reach.getByText(LINK).count();
      if (said !== 1) throw new Refused(`her link is drawn once — it is drawn ${said} times`);
      await reach.scrollIntoViewIfNeeded();
      await settled(page);
      await photograph(reach, path.join(OUT, `bridge-nemia-${await themeOf(page)}.png`));
    } finally {
      await page.unroute(isLevel);
    }
    await expectStep(page);
  },
} satisfies PageSpec;

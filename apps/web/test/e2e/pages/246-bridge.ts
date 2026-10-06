import path from 'node:path';
import type { Locator, Page, Route } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { expectInside, expectVisible, idle, Refused, settled } from '../checks.ts';
import { FAKE } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The web link the api answers for a bridged session: Claude Code's form, an id of its own for the page. */
const LINK = 'https://claude.ai/code/session_01E2eBridgePage';

/** A `bridgeSessionId` no link is built from, as JSON spells it: letters and digits with underscores, so no place a line may break. */
const MALFORMED = `"session_${'01E2e_Bridge_Page_'.repeat(4)}`;

/** Why a bridge is not up, as the runtime says it for `MALFORMED`: its first 60 characters quoted, then cut. */
const WHY =
  `its registration's \`bridgeSessionId\` is ${MALFORMED.slice(0, 60)}\u2026, not \`session_\` and letters and digits, so no link is` +
  ' built from it: run a Claude Code whose registration this runtime reads.';

/** Where the run's detail is read, and Nemia's level. */
const isDetail = (url: URL) => url.pathname === `/api/runs/${FAKE.id}`;
const isLevel = (url: URL) => url.pathname === '/api/level';

/** The api's answer to `route`, its JSON changed by `change`: a bridge the e2e's sessions cannot raise, the rest as the api says it. */
const answered = (change: (body: Record<string, unknown>) => Record<string, unknown>) => async (route: Route) => {
  const response = await route.fetch();
  await route.fulfill({ response, json: change((await response.json()) as Record<string, unknown>) });
};

/** A bridge up, its link `LINK`. */
const UP = { url: LINK, why: null };

/** A bridge asked and not up, saying `WHY`. */
const DOWN = { url: null, why: WHY };

/** The seeded run's detail with `FAKE.unverified` filed bridged, its bridge `bridge`. */
const bridgedStep = (bridge: typeof UP | typeof DOWN) => (body: Record<string, unknown>) => ({
  ...body,
  steps: (body.steps as Array<{ name: string; filed: Record<string, unknown> | null }>).map((step) =>
    step.name === FAKE.unverified ? { ...step, filed: { ...step.filed, bridge } } : step,
  ),
});

/** Her level with her session up and bridged, its bridge `bridge`: the attach line, then her link or why not, as the api says them. */
const bridgedLevel = (bridge: typeof UP | typeof DOWN) => (body: Record<string, unknown>) => ({
  ...body,
  level: 'semi-auto',
  task: 'nemia-20261006T080000Z',
  phase: 'running',
  sessionId: '0123456789abcdef',
  reach: ['claude attach 01234567', bridge.url ?? `her web link is not up: ${bridge.why}`],
  bridge,
});

/**
 * Why `where`'s bridge is not up, read whole on a phone's 390 pixels: `why` drawn, no link beside it, and inside `frame`, however long a
 * word it quotes; pictured as `bridge-<what>-down-<theme>.png`, then the page put back to its size.
 */
async function expectWhy(page: Page, why: Locator, frame: Locator, where: string, what: string): Promise<void> {
  const size = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  try {
    await expectVisible(why, `${where} says why its web link is not up`);
    if (!(await why.textContent())?.includes(WHY))
      throw new Refused(`${where} says the runtime's why whole — it says ${await why.textContent()}`);
    if (await frame.locator('a[href^="https://claude.ai/"]').count()) throw new Refused(`${where} draws no link while it is not up`);
    await why.scrollIntoViewIfNeeded();
    await settled(page);
    await expectInside(why, frame, `${where}'s why wraps within it on a phone, the word it quotes too`);
    await photograph(frame, path.join(OUT, `bridge-${what}-down-${await themeOf(page)}.png`));
  } finally {
    if (size) await page.setViewportSize(size);
  }
}

/** `link` is the bridge's web link, opened in a tab of its own with no referrer. */
async function expectLink(link: Locator, where: string): Promise<void> {
  await expectVisible(link, `${where} draws the web link`);
  const [href, target, rel] = await Promise.all(['href', 'target', 'rel'].map((name) => link.getAttribute(name)));
  if (href !== LINK || target !== '_blank' || rel !== 'noreferrer')
    throw new Refused(`${where}'s link opens ${LINK} in a new tab with no referrer — it is ${JSON.stringify({ href, target, rel })}`);
}

/** The run's page, its detail answered bridged for `FAKE.unverified` with `bridge`; read once loaded. */
async function onRun(page: Page, bridge: typeof UP | typeof DOWN): Promise<Locator> {
  await page.route(isDetail, answered(bridgedStep(bridge)));
  await page.goto(new URL(`/runs/${FAKE.id}`, page.url()).href, { waitUntil: 'load' });
  await idle(page);
  return page.locator(`#step-${FAKE.unverified}`);
}

/**
 * The step's facts draw a `reach` row: the link while its bridge is up, why not while it is not. The run's detail is routed for each, and
 * let go after.
 */
async function expectStep(page: Page): Promise<void> {
  try {
    const section = await onRun(page, UP);
    await expectLink(section.locator('[data-fact="reach"] a[data-step-bridge]'), `${FAKE.unverified}'s section`);
    await section.scrollIntoViewIfNeeded();
    await settled(page);
    await photograph(section, path.join(OUT, `bridge-step-${await themeOf(page)}.png`));
    await page.unroute(isDetail);
    const down = await onRun(page, DOWN);
    await expectWhy(page, down.locator('[data-fact="reach"] [data-bridge-why]'), down, `${FAKE.unverified}'s section`, 'step');
  } finally {
    await page.unroute(isDetail);
  }
}

/** Nemia's section, her level answered with `bridge`: her reach, once read. */
async function onSettings(page: Page, bridge: typeof UP | typeof DOWN): Promise<Locator> {
  await page.route(isLevel, answered(bridgedLevel(bridge)));
  await page.reload({ waitUntil: 'load' });
  await idle(page);
  return page.locator('[data-nemia-section] [data-nemia-reach]');
}

export default {
  /**
   * A bridged session's web link on the board, its api answer routed, since the e2e's sessions raise no bridge: a step filed bridged
   * draws a `reach` row on the run's page, and Nemia's section on Settings draws her link once, after her attach line, each an external
   * link to the exact address; asked and not up, each says why instead, once, wrapped within its place on a phone however long a word the
   * runtime quotes. Nothing is written to the store.
   */
  name: 'bridge',
  route: '/settings',
  expect: async (page) => {
    try {
      const reach = await onSettings(page, UP);
      await expectVisible(reach.locator('[data-nemia-attach]', { hasText: 'attach 01234567' }), 'her attach line, to copy');
      await expectLink(reach.locator('a[data-nemia-bridge]'), 'her reach');
      const said = await reach.getByText(LINK).count();
      if (said !== 1) throw new Refused(`her link is drawn once — it is drawn ${said} times`);
      await reach.scrollIntoViewIfNeeded();
      await settled(page);
      await photograph(reach, path.join(OUT, `bridge-nemia-${await themeOf(page)}.png`));
      await page.unroute(isLevel);
      const down = await onSettings(page, DOWN);
      await expectWhy(page, down.locator('[data-bridge-why]'), down, 'her reach', 'nemia');
      const told = await down.getByText('is not up').count();
      if (told !== 1) throw new Refused(`why her link is not up is said once — it is said ${told} times`);
    } finally {
      await page.unroute(isLevel);
    }
    await expectStep(page);
  },
} satisfies PageSpec;

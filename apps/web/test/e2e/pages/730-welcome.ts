import path from 'node:path';
import type { Page, Route } from 'playwright';
import { photograph, READINESS_ROUTE, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled } from '../checks.ts';
import { HARNESS_SKIP_KEY } from '../../../src/lib/harnessSkip.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** A check of a harness, as the api answers it: the keys the page reads. */
type Check = { name: 'version' | 'turn'; state: 'passed' | 'failed' | 'running' | 'unrun'; message: string; fixes: [] };

/** The install piece of the e2e's harness, met with `checks` or missing with its one fix. */
const install = (checks?: Check[]) => ({
  name: 'claude',
  area: 'harness',
  state: checks === undefined ? 'missing' : 'met',
  message: 'Claude Code (claude), at the version this release was tested with',
  fixes:
    checks === undefined
      ? [{ message: 'install Claude Code into the tools folder', command: 'nemia doctor fix claude', startable: true, index: 0 }]
      : [],
  harness: { name: 'claude', part: 'install' },
  cost: 'run',
  ...(checks === undefined ? {} : { checks }),
});

/** The sign-in piece of the e2e's harness, in `state`. */
const signIn = (state: 'met' | 'missing') => ({
  name: 'claude-sign-in',
  area: 'harness',
  state,
  message: 'Claude Code is signed in as the user the daemon runs as',
  fixes: [],
  harness: { name: 'claude', part: 'sign-in' },
  cost: 'run',
});

/** No factory filed: with no harness installed, the store is fresh. */
const NO_FACTORY = { name: 'factory', area: 'factory', state: 'missing', message: 'no factory is filed', fixes: [], cost: 'run' };

/** A check named `name` in `state`. */
const check = (name: Check['name'], state: Check['state']): Check => ({ name, state, message: `the ${name} check, ${state}`, fixes: [] });

/** The reads the page answers in place of the api's, by what it is showing: fresh, then the harness's two checks one way or another. */
const READS = {
  fresh: [install(), signIn('missing'), NO_FACTORY],
  turnFailed: [install([check('version', 'passed'), check('turn', 'failed')]), signIn('met'), NO_FACTORY],
  ready: [install([check('version', 'passed'), check('turn', 'passed')]), signIn('met'), NO_FACTORY],
} as const;

/** Activate starts the install's first fix, held here as `660-setup` holds it: the start answered, its output streamed and ended. */
async function holdInstall(page: Page, sent: unknown[]): Promise<() => Promise<void>> {
  const made = (phase: 'pending' | 'succeeded') => ({ id: 'fix-e2e-welcome', need: 'claude', phase, output: '' });
  const start = (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    sent.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(made('pending')) });
  };
  const output = (route: Route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
      body: `event: output\ndata: added 1 package\n\nevent: ended\ndata: ${JSON.stringify(made('succeeded'))}\n\n`,
    });
  await page.route('**/api/readiness/fixes', start);
  await page.route('**/api/readiness/fixes/*/output', output);
  return async () => {
    await page.unroute('**/api/readiness/fixes', start);
    await page.unroute('**/api/readiness/fixes/*/output', output);
  };
}

/**
 * The board's reads made again as a person coming back to its tab makes them (TanStack Query's refetch on focus): the welcome, once a
 * harness is installed, is no longer asked, so a reload would leave it.
 */
async function readAgain(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await idle(page);
}

/** The two ticks drawn on the welcome, the version's and the turn's, in `states`. */
async function drawsTicks(page: Page, states: readonly [Check['state'], Check['state']]): Promise<void> {
  const checks = page.locator('article[data-welcome] [data-harness-checks="claude"]');
  await expectVisible(checks, 'the welcome draws the harness’s checks under it');
  await expectVisible(checks.locator(`[data-harness-check="version"][data-check-state="${states[0]}"]`), `the version tick, ${states[0]}`);
  await expectVisible(checks.locator(`[data-harness-check="turn"][data-check-state="${states[1]}"]`), `the turn tick, ${states[1]}`);
}

export default {
  /**
   * The welcome, over readiness reads it answers in place of the api's: `/` on a fresh store lands on `/welcome`; Activate starts the
   * install piece's first fix; a turn failed and both passed are drawn as their ticks, Next shown once both passed; and Skip for now
   * leaves for `/`, under the Setup banner, which no longer sends that browser to the welcome. The skip is taken back.
   */
  name: 'welcome',
  route: '/setup',
  expect: async (page) => {
    let planted: keyof typeof READS = 'fresh';
    const answer = (route: Route) =>
      route.request().method() === 'GET'
        ? route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ready: false, ran: false, pieces: READS[planted] }),
          })
        : route.fallback();
    await page.route(READINESS_ROUTE, answer);
    const sent: unknown[] = [];
    const unhold = await holdInstall(page, sent);
    try {
      await page.goto(new URL('/', page.url()).href);
      await idle(page);
      if (new URL(page.url()).pathname !== '/welcome') throw new Refused(`a fresh store's / lands on /welcome — it is at ${page.url()}`);
      const welcome = page.locator('article[data-welcome]');
      await expectVisible(
        welcome.locator('[data-harness-option="claude"] [data-harness-activate]'),
        'the welcome offers to activate claude',
      );
      await settled(page);
      await photograph(page, path.join(OUT, `welcome-fresh-${await themeOf(page)}.png`));
      planted = 'turnFailed';
      await welcome.locator('[data-harness-option="claude"] [data-harness-activate]').click();
      await expectVisible(welcome.locator('section[data-fix-run="claude"]'), 'Activate starts the install, its run drawn on the welcome');
      const start = sent[0] as { need?: string; index?: number } | undefined;
      if (start?.need !== 'claude' || (start.index ?? 0) !== 0)
        throw new Refused(`Activate starts the install piece's first fix (claude, index 0) — it sent ${JSON.stringify(start)}`);
      await drawsTicks(page, ['passed', 'failed']);
      await expectCount(welcome.locator('[data-welcome-next]'), 0, 'a check failed: no Next');
      planted = 'ready';
      await readAgain(page);
      await drawsTicks(page, ['passed', 'passed']);
      await expectVisible(welcome.locator('[data-welcome-next]'), 'both checks passed: Next names what comes next');
      await settled(page);
      await photograph(page, path.join(OUT, `welcome-ready-${await themeOf(page)}.png`));

      planted = 'fresh';
      await page.goto(new URL('/', page.url()).href);
      await idle(page);
      await expectVisible(welcome, 'fresh again, / sends this browser to the welcome');
      await welcome.locator('[data-welcome-skip]').click();
      await page.waitForURL((url) => url.pathname === '/');
      await idle(page);
      await expectVisible(page.locator('[data-setup-banner]'), 'skipped, the board stands under the Setup banner');
      await page.goto(new URL('/', page.url()).href);
      await idle(page);
      if (new URL(page.url()).pathname !== '/') throw new Refused(`skipped in this browser, / stays / — it went to ${page.url()}`);
    } finally {
      await page.evaluate((key) => localStorage.removeItem(key), HARNESS_SKIP_KEY);
      await unhold();
      await page.unroute(READINESS_ROUTE, answer);
    }
  },
} satisfies PageSpec;

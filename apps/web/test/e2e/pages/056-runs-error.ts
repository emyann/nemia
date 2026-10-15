import { photographBothWidths } from '../board.ts';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled, watch } from '../checks.ts';
import { contrastHolds } from '../runs-contrast.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** What the held read is answered with, in the api's shape for a refusal. */
const WHY = 'the store could not be read';

export default {
  /**
   * The page when a read fails: a visit of its own whose read of the finished runs is answered with a failure says, under the page's
   * name, that the runs could not be loaded and why, in the api's words, and draws no part; the frame around it stands. Its one
   * failure is the point, so that visit counts exactly it: the answer, the browser's line for it, and the router's for the loader.
   * Pictured at 1280 and at 390 wide, and no text pair of it is under 4.5:1 in either scheme. Writes nothing.
   */
  name: 'runs-error',
  route: '/runs',
  expect: async (page) => {
    const other = await page.context().newPage();
    try {
      const { problems } = watch(other);
      await other.route(/\/api\/runs-finished\b/, (route) =>
        route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: WHY }) }),
      );
      await other.goto(new URL('/runs', page.url()).href, { waitUntil: 'load' });
      await idle(other);
      const state = other.locator('[data-runs-page="error"]');
      await expectVisible(
        state.locator('[role="alert"]', { hasText: 'The runs could not be loaded.' }),
        'the page says the runs could not be loaded',
      );
      await expectVisible(state.locator('[data-error-reason]', { hasText: WHY }), "and why, in the api's words");
      await expectTexts(state.getByRole('heading', { level: 1 }), ['Runs'], "under the page's name");
      await expectCount(other.locator('[data-plate], [data-run]'), 0, 'and draws no part');
      await expectVisible(other.locator('header[data-frame-header] [data-gauges-button]'), 'the frame around it stands');
      await settled(other);
      await photographBothWidths(other, OUT, 'runs-error', 'error');
      await contrastHolds(other, ['[role="alert"] p:first-child', '[data-error-reason]']);
      const seen = problems();
      const refused = /^request answered 500: GET .*\/api\/runs-finished\?/;
      const said = new RegExp(`^console error: \\w+: ${WHY}\\b`);
      const others = seen.filter(
        (p) =>
          !refused.test(p) &&
          !/^console error: Failed to load resource: the server responded with a status of 500\b/.test(p) &&
          !said.test(p),
      );
      if (!seen.some((p) => refused.test(p)) || others.length)
        throw new Refused(`the visit saw the read answered with a failure, and nothing else — it saw:\n    ${seen.join('\n    ')}`);
    } finally {
      await other.close();
    }
  },
} satisfies PageSpec;

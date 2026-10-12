import type { Page } from 'playwright';
import { photographBothWidths } from '../board.ts';
import { expectCount, expectTexts, expectVisible, idle, settled } from '../checks.ts';
import { FACTORIES } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** A factory of the seed that holds no run. */
const EMPTY = FACTORIES.others[0];

/**
 * The page while its reads are on their way: a visit of its own whose reads of the runs are held says it is loading, under the page's
 * name, and draws its three parts once they are let go.
 */
async function loading(page: Page): Promise<void> {
  const other = await page.context().newPage();
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await other.route(/\/api\/runs-(open|finished)\b/, async (route) => {
      await held;
      await route.continue();
    });
    await other.goto(new URL('/runs', page.url()).href, { waitUntil: 'load' });
    const state = other.locator('[data-runs-page="loading"]');
    await expectVisible(
      state.locator('[role="status"]', { hasText: /^Loading the runs…$/ }),
      'while its reads are held, the page says it is loading',
    );
    await expectTexts(state.getByRole('heading', { level: 1 }), ['Runs'], "under the page's name");
    await expectCount(other.locator('[data-plate]'), 0, 'and draws no part yet');
    await settled(other);
    await photographBothWidths(other, OUT, 'runs-states', 'loading');
    release();
    await expectCount(other.locator('[data-runs-page="loaded"] [data-plate]'), 3, 'let go, it draws its three parts');
    await idle(other);
  } finally {
    release();
    await other.close();
  }
}

export default {
  /**
   * The states nobody drew, built plain: with nothing to show, a factory that holds no run, each part says so under a quiet plate that
   * counts none; and while its reads are on their way the page says it is loading. Each pictured at 1280 and at 390 wide. Writes
   * nothing.
   */
  name: 'runs-states',
  route: `/runs?factory=${EMPTY}`,
  expect: async (page) => {
    await expectTexts(
      page.locator('[data-plate="quiet"] [data-plate-count]'),
      ['0', '0', '0'],
      'a factory with no run: three quiet plates, each counting none',
    );
    await expectCount(page.locator('[data-plate-barcode]'), 0, 'a quiet plate has no barcode');
    await expectTexts(
      page.locator('[data-nothing]'),
      ['Nothing waits on you.', 'Nothing is in flight.', 'No run has finished yet.'],
      'and each part says it holds nothing, plainly',
    );
    await expectCount(page.locator('[data-runs-page] table, [data-runs-page] [data-pager]'), 0, 'no table and no pager for nothing');
    await settled(page);
    await photographBothWidths(page, OUT, 'runs-states', 'nothing');
    await loading(page);
  },
} satisfies PageSpec;

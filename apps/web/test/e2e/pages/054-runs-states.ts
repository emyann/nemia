import type { Page } from 'playwright';
import { photographBothWidths } from '../board.ts';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled } from '../checks.ts';
import { contrastHolds } from '../runs-contrast.ts';
import { FACTORIES } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** A factory of the seed that holds no run. */
const EMPTY = FACTORIES.others[0];

/**
 * The page while its reads are on their way: a visit of its own whose reads of the runs are held draws the kit's skeleton of its parts
 * — the label field, two cards, three rows in flight and six finished, under three count chips' places — and says it is loading to a
 * screen reader alone, under the page's name in the top bar, and draws its three parts once they are let go.
 */
async function loading(page: Page): Promise<void> {
  const other = await page.context().newPage();
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await other.route(/\/runs\?[^#]*\bfieldSelector=/, async (route) => {
      await held;
      await route.continue();
    });
    await other.goto(new URL('/runs', page.url()).href, { waitUntil: 'load' });
    const state = other.locator('[data-runs-page="loading"]');
    await expectVisible(
      state.locator('[role="status"]', { hasText: /^Loading the runs…$/ }),
      'while its reads are held, the page says it is loading',
    );
    await expectCount(state.locator('[role="status"] [data-slot="skeleton"]'), 15, 'in the shape of its parts, inside the status');
    await expectTexts(
      other.locator('header[data-frame-header]').getByRole('heading', { level: 1 }),
      ['Runs'],
      "under the page's name, in the top bar",
    );
    await expectCount(other.locator('[data-count-chip]'), 0, 'and draws no part yet');
    await settled(other);
    await photographBothWidths(other, OUT, 'runs-states', 'loading');
    release();
    await expectCount(other.locator('[data-runs-page="loaded"] [data-count-chip]'), 3, 'let go, it draws its three parts');
    await idle(other);
  } finally {
    release();
    await other.close();
  }
}

export default {
  /**
   * The states nobody drew, built plain: with nothing to show, a factory that holds no run, each part says so under a quiet count chip
   * that counts none; and while its reads are on their way the page draws the shape of its parts, saying it is loading to a screen reader
   * alone. Each pictured at 1280 and at 390 wide, and no text pair of the empty page, the one of the two that shows text, is under 4.5:1
   * in either scheme. Writes nothing.
   */
  name: 'runs-states',
  route: `/factories/${EMPTY}/runs`,
  expect: async (page) => {
    const chips = await page
      .locator('[data-count-chip]')
      .evaluateAll((all) => all.map((chip) => `${chip.getAttribute('data-count-chip')} ${chip.getAttribute('data-count-tone')}`));
    if (chips.join('|') !== '0 quiet|0 quiet|0 quiet')
      throw new Refused(`a factory with no run: three quiet count chips, each counting none — ${chips.join(', ')}`);
    await expectTexts(
      page.locator('[data-nothing]'),
      ['Nothing waits on you.', 'Nothing is in flight.', 'No run has finished yet.'],
      'and each part says it holds nothing, plainly',
    );
    await expectCount(page.locator('[data-runs-page] table, [data-runs-page] [data-pager]'), 0, 'no table and no pager for nothing');
    await settled(page);
    await photographBothWidths(page, OUT, 'runs-states', 'nothing');
    await contrastHolds(page, ['[data-nothing]']);
    await loading(page);
  },
} satisfies PageSpec;

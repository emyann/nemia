import type { Page } from 'playwright';
import { litOf, sidebar } from '../board.ts';
import { expectCount, idle, Refused } from '../checks.ts';
import { FACTORIES } from '../seed.ts';
import type { PageSpec } from '../visit.ts';

/** An address no route of the board ever had. */
const NOWHERE = '/no-such-page';

/** Goes to `to` in this tab and waits for its reads. */
async function visit(page: Page, to: string): Promise<void> {
  await page.goto(new URL(to, page.url()).href, { waitUntil: 'load' });
  await idle(page);
}

/** What the frame draws as the page, beside its rail and under its top bar, as text. */
const drawnOf = (page: Page): Promise<string> => page.locator('main[data-frame-page]').innerText();

export default {
  /**
   * An address no route has: the frame stands around it with its destinations, none of them lit, and the top bar names no page; with a
   * `?factory=` it draws the same, word for word, and its switcher reads All factories.
   */
  name: 'unknown-address',
  route: NOWHERE,
  expect: async (page) => {
    await sidebar(page);
    await expectCount(litOf(page), 0, 'an address no route has lights no destination');
    await expectCount(page.locator('header[data-frame-header] [data-page-name]'), 0, 'and the top bar names no page');
    const nowhere = await drawnOf(page);
    await visit(page, `${NOWHERE}?factory=${FACTORIES.hiring.name}`);
    await sidebar(page);
    if ((await drawnOf(page)) !== nowhere) throw new Refused(`${NOWHERE} with a ?factory= draws what ${NOWHERE} draws`);
  },
} satisfies PageSpec;

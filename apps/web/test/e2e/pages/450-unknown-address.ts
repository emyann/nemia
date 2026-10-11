import type { Page } from 'playwright';
import { sectionsOf, sidebar } from '../board.ts';
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

/** What the frame draws as the page, between its sidebar and its bottom bar, as text. */
const drawnOf = (page: Page): Promise<string> => page.locator('[data-slot="sidebar-inset"]').innerText();

export default {
  /**
   * `/stats` is no page of the board: the frame stands around it with its sections, none of them lit and none of them Stats, nothing in
   * the document links to it, and it draws what an address no route ever had draws, word for word. Its `?factory=` picks no factory.
   */
  name: 'unknown-address',
  route: '/stats',
  expect: async (page) => {
    await sidebar(page);
    await expectCount(sectionsOf(page).and(page.locator('[data-active="true"]')), 0, '/stats lights no section');
    await expectCount(page.locator('a[href^="/stats"]'), 0, 'nothing on the page links to /stats');
    const here = await drawnOf(page);
    await visit(page, NOWHERE);
    await sidebar(page);
    const nowhere = await drawnOf(page);
    if (here !== nowhere)
      throw new Refused(
        `/stats draws what ${NOWHERE}, an address no route has, draws: ${JSON.stringify(nowhere)} — it draws ${JSON.stringify(here)}`,
      );
    await visit(page, `/stats?factory=${FACTORIES.hiring.name}`);
    await sidebar(page);
    if ((await drawnOf(page)) !== nowhere) throw new Refused(`/stats with a ?factory= draws what ${NOWHERE} draws`);
  },
} satisfies PageSpec;

import type { Locator, Page } from 'playwright';
import { FINISHED_SIZE } from '../../../src/lib/api/runs.ts';
import { photographBothWidths } from '../board.ts';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import { FACTORIES, FOLDER, seedFinished } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The factory the page fills: the one of the seed that holds a finished run, FOLDER's. */
const FACTORY = FACTORIES.hiring.name;

/** How many finished runs the page writes: with FOLDER's, two full pages and one row on a third. */
const WRITTEN = 2 * FINISHED_SIZE;

/** The id of the run written `nth`, from 1, the newest finished of them; each finished a minute before the one before it. */
const idOf = (nth: number): string => `a-page-of-finished-runs-e2p${String(nth).padStart(2, '0')}`;

/** The rows of the finished table. */
const rowsOf = (page: Page): Locator => page.locator('section[data-section="finished"] tr[data-run]');

/** Goes to `to` in this tab and waits for its reads. */
async function visit(page: Page, to: string): Promise<void> {
  await page.goto(new URL(to, page.url()).href, { waitUntil: 'load' });
  await idle(page);
}

/** The page's address, as its path and search. */
const addressOf = (page: Page): string => {
  const url = new URL(page.url());
  return `${url.pathname}${url.search}`;
};

/** Page 3 of the factory, loaded by its address and loaded again, shows page 3 of that factory: its last row, and where it stands. */
async function thirdPage(page: Page): Promise<void> {
  await visit(page, `/runs?factory=${FACTORY}&page=3`);
  for (const how of ['loaded by its address', 'loaded again']) {
    await expectTexts(page.locator('[data-pager-at]'), ['Page 3 / 3'], `${how}, the pager stands on page 3 of the factory's three`);
    await expectTexts(page.locator('[data-pager-rows]'), [`Runs 19–19 of ${WRITTEN + 1}`], 'and says its one row');
    await expectCount(rowsOf(page), 1, 'page 3 holds one row');
    await expectVisible(rowsOf(page).locator(`[data-run-id][title="${idOf(WRITTEN)}"]`), 'the oldest finished of the factory');
    await expectTexts(
      page.locator('section[data-section="finished"] [data-plate-count]'),
      [String(WRITTEN + 1)],
      "the plate's count is the factory's",
    );
    await expectVisible(page.locator('[data-pager-older][data-disabled]'), 'Older leads nowhere from the last page');
    if (how === 'loaded by its address') {
      await page.reload({ waitUntil: 'load' });
      await idle(page);
    }
  }
  if (addressOf(page) !== `/runs?factory=${FACTORY}&page=3`)
    throw new Refused(`the address keeps the factory and the page — ${addressOf(page)}`);
}

/** Newer and Older move a page at a time in the page, the factory kept in the address; the first page's address names no page. */
async function newerAndOlder(page: Page): Promise<void> {
  await page.locator('[data-pager-newer]').click();
  await page.waitForURL((url) => url.searchParams.get('page') === '2' && url.searchParams.get('factory') === FACTORY, { timeout: WAIT_MS });
  await expectCount(rowsOf(page), FINISHED_SIZE, 'Newer leads to page 2, nine rows');
  await expectTexts(page.locator('[data-pager-at]'), ['Page 2 / 3'], 'where the pager stands');
  const ids = await rowsOf(page)
    .locator('[data-run-id]')
    .evaluateAll((all) => all.map((id) => id.getAttribute('title')));
  const second = Array.from({ length: FINISHED_SIZE }, (_, i) => idOf(FINISHED_SIZE + i));
  if (ids.join() !== second.join())
    throw new Refused(`page 2 holds the tenth to the eighteenth, newest finished first — ${ids.join(', ')}`);
  await settled(page);
  await photographBothWidths(page, OUT, 'runs-pages', 'second');
  await page.locator('[data-pager-newer]').focus();
  await page.keyboard.press('Enter');
  await page.waitForURL((url) => !url.searchParams.has('page') && url.searchParams.get('factory') === FACTORY, { timeout: WAIT_MS });
  await expectVisible(rowsOf(page).locator(`[data-run-id][title="${FOLDER.id}"]`), 'Newer again, by the keyboard, leads to the first page');
  await expectVisible(page.locator('[data-pager-newer][data-disabled]'), 'where Newer leads nowhere');
  await page.locator('[data-pager-older]').click();
  await page.waitForURL((url) => url.searchParams.get('page') === '2', { timeout: WAIT_MS });
  await expectCount(rowsOf(page), FINISHED_SIZE, 'and Older back to page 2');
}

/** A page past the last draws no table, says so, and Newer leads to the last. */
async function pastTheLast(page: Page): Promise<void> {
  await visit(page, `/runs?factory=${FACTORY}&page=7`);
  await expectCount(rowsOf(page), 0, 'a page past the last holds no row');
  await expectTexts(page.locator('[data-pager-at]'), ['Page 7 is past the last, 3.'], 'and the pager says so');
  await expectTexts(page.locator('[data-pager-rows]'), [`No run on this page, of ${WRITTEN + 1}`], 'and how many there are');
  await page.locator('[data-pager-newer]').click();
  await page.waitForURL((url) => url.searchParams.get('page') === '3', { timeout: WAIT_MS });
  await expectCount(rowsOf(page), 1, 'Newer leads to the last page');
}

export default {
  /**
   * The finished runs a page at a time, the page in the address beside the factory: eighteen finished runs written into one factory
   * make it three pages; page 3 loaded by its address, and loaded again, is page 3 of that factory; Newer and Older move a page,
   * by the pointer and by the keyboard; a page past the last says so. The runs are taken back, and the page left on the seed's.
   */
  name: 'runs-pages',
  route: `/runs?factory=${FACTORY}`,
  expect: async (page) => {
    await expectCount(rowsOf(page), 1, `the seed's ${FACTORY} holds one finished run`);
    const takeBack = Array.from({ length: WRITTEN }, (_, i) =>
      seedFinished(store!, { id: idOf(i + 1), title: `A page of finished runs, ${i + 1}`, factory: FACTORY, finishedAgo: 30 + i }),
    );
    try {
      await thirdPage(page);
      await newerAndOlder(page);
      await pastTheLast(page);
    } finally {
      for (const back of takeBack.reverse()) back();
    }
    await visit(page, `/runs?factory=${FACTORY}`);
    await expectCount(rowsOf(page), 1, 'the runs taken back, the factory holds its one finished run again');
  },
} satisfies PageSpec;

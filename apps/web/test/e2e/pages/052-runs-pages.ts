import type { Locator, Page } from 'playwright';
import { FINISHED_SIZE } from '../../../src/lib/api/runs.ts';
import { agoWords } from '../../../src/lib/runWords.ts';
import { photographBothWidths } from '../board.ts';
import { expectCount, expectNone, expectTexts, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
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

/** A run that finished more than a year back, whenever the e2e runs: four hundred days ago. */
const LONG_AGO = { id: 'finished-another-year-e2py', title: 'Finished another year', factory: FACTORY, finishedAgo: 400 * 24 * 60 };

/**
 * The longest `how long ago` words a column writes: the longest unit at two digits, and the minute unit at its own longest, which
 * `formatDistanceStrict` keeps to just under the hour — a character more, and a wider word.
 */
const LONGEST_AGO = ['11 months ago', '59 minutes ago'];

/**
 * Every text of a column the owner saw run into the next: the two `how long ago` words, the Clock cell's own, and the note of a row in
 * flight, which read as one word with the clock beside it.
 */
const tightOf = (page: Page): Locator =>
  page.locator('td[data-created] time, td[data-finished] time, td[data-clock] [data-clock-words], tr[data-run] td [data-now-note]');

/** Every such text ends inside its cell's own room, short of the cell's padding: none reaches the next column. */
async function expectRoom(page: Page, assertion: string): Promise<void> {
  await expectNone(async () => {
    const over = await tightOf(page).evaluateAll((all) =>
      all.flatMap((text) => {
        const cell = text.closest('td')!;
        const room = cell.getBoundingClientRect().right - parseFloat(getComputedStyle(cell).paddingRight);
        const by = Math.round(text.getBoundingClientRect().right - room);
        return by > 0 ? [`"${text.textContent}" by ${by} px`] : [];
      }),
    );
    if (!(await tightOf(page).count())) return 'no cell to look at';
    return over.length ? `${over.join(', ')} past its room` : null;
  }, assertion);
}

/**
 * Every column the owner saw overlap has its room, at both widths: a run from more than a year back says how long ago it was, uncut,
 * and so do the longest words the column takes, written into every such cell and taken out again.
 */
async function datesFit(page: Page): Promise<void> {
  const back = seedFinished(store!, LONG_AGO);
  try {
    await visit(page, `/runs?factory=${FACTORY}`);
    const old = rowsOf(page).filter({ has: page.locator(`[data-run-id][title="${LONG_AGO.id}"]`) });
    await expectTexts(
      old.locator('td[data-finished]'),
      [agoWords(new Date(Date.now() - LONG_AGO.finishedAgo * 60_000), new Date())],
      'a run finished more than a year back still says how long ago, never a date',
    );
    const created = ((await old.locator('td[data-created]').textContent()) ?? '').trim();
    if (!created.endsWith(' ago')) throw new Refused(`and so does the day it was created — it says "${created}"`);
    const title = await old.locator('td[data-created] time').getAttribute('title');
    if (!title?.match(/\d{4}, \d{1,2}:\d{2}:\d{2} [AP]M$/)) throw new Refused(`with the exact instant on hover — it says "${title}"`);
    await expectRoom(page, 'each column of the runs page has its own room');
    await settled(page);
    await photographBothWidths(page, OUT, 'runs-pages', 'another-year');
    const tight = tightOf(page);
    const said = await tight.evaluateAll((all) => all.map((text) => text.firstChild?.nodeValue ?? ''));
    const wide = page.viewportSize();
    try {
      for (const words of LONGEST_AGO) {
        await tight.evaluateAll((all, word) => all.forEach((text) => (text.firstChild!.nodeValue = word)), words);
        await expectRoom(page, `and so have the longest words a column takes, "${words}"`);
        if (wide) {
          await page.setViewportSize({ width: 560, height: wide.height });
          await expectRoom(page, `and at a phone\u2019s width, where the tables scroll sideways inside their frames, "${words}"`);
          await page.setViewportSize(wide);
        }
      }
    } finally {
      if (wide) await page.setViewportSize(wide);
      await tight.evaluateAll((all, was) => all.forEach((text, i) => (text.firstChild!.nodeValue = was[i] ?? '')), said);
    }
  } finally {
    back();
  }
}

export default {
  /**
   * The finished runs a page at a time, the page in the address beside the factory: eighteen finished runs written into one factory
   * make it three pages; page 3 loaded by its address, and loaded again, is page 3 of that factory; Newer and Older move a page,
   * by the pointer and by the keyboard; a page past the last says so; and a run from more than a year back, as the longest words a
   * column takes, has its column's room, at the page's width and at a phone's. The runs are taken back, and the page left on the
   * seed's.
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
    await datesFit(page);
    await visit(page, `/runs?factory=${FACTORY}`);
    await expectCount(rowsOf(page), 1, 'the runs taken back, the factory holds its one finished run again');
  },
} satisfies PageSpec;

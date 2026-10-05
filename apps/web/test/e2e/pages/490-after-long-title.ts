import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { expectInside, expectUncut, expectVisible, idle, Refused, settled } from '../checks.ts';
import { DIAMOND, WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The runner's viewport, put back before the page ends. */
const WIDE = { width: 1280, height: 800 };

/** A phone held upright. */
const PHONE = { width: 390, height: 844 };

/** The run the page writes on the checkout, to be waited on, whose title runs longer than any row: a path in it breaks nowhere. */
const LONG = {
  id: 'a-long-title-to-wait-on-e2e',
  title:
    'Keep the After list inside its card however long a title runs, apps/web/src/components/StartRun.tsx/AfterPicker/rows/each-title-read-whole, and say every word of it',
};

/** The rows of the dev card's After list, and the long run's. */
const rowsOf = (page: Page) => {
  const card = page.locator(`section[aria-label="Workflow ${WORKFLOWS.good.name}"]`);
  const row = card.locator(`ul[aria-label="Runs to wait on"] li[data-run="${LONG.id}"]`);
  return { card, row, title: row.locator('[data-run-title]') };
};

/** The long run's row lies inside its card, its title read whole, every word of it on the page; and its picture, as `what`. */
async function expectWhole(page: Page, what: string): Promise<void> {
  const { card, row, title } = rowsOf(page);
  await expectVisible(row, `${LONG.id} is offered to wait on`);
  await settled(page);
  await row.scrollIntoViewIfNeeded();
  await expectInside(row.locator('label'), card, `on ${what}, the long run's row lies inside the card`);
  await expectUncut(title, `on ${what}, the long run's title is read whole, wrapped within its row`);
  const shown = await title.textContent();
  if (shown !== LONG.title) throw new Refused(`on ${what}, the row says the whole title — it says ${JSON.stringify(shown)}`);
  await photograph(card.locator('fieldset'), path.join(OUT, `after-long-title-${what}-${await themeOf(page)}.png`));
}

export default {
  /**
   * The start form's After list with a run on the repository whose title runs longer than a row, a path in it breaking nowhere: on a wide
   * screen and on a phone's, its row stays inside the workflow's card and the title wraps, read whole. The run is written beside the seed
   * as a copy of the diamond's top and taken back after.
   */
  name: 'after-long-title',
  route: '/workflows',
  expect: async (page) => {
    const runs = path.join(store!, 'runs');
    const record = JSON.parse(fs.readFileSync(path.join(runs, `${DIAMOND.top.id}.json`), 'utf8')) as { brief: string };
    const file = path.join(runs, `${LONG.id}.json`);
    try {
      fs.writeFileSync(file, JSON.stringify({ ...record, id: LONG.id, brief: `${LONG.title}\n\nA run the e2e waits on, by its title.` }));
      await page.reload({ waitUntil: 'load' });
      await idle(page);
      await expectWhole(page, 'wide');
      await page.setViewportSize(PHONE);
      await expectWhole(page, 'phone');
    } finally {
      await page.setViewportSize(WIDE);
      fs.rmSync(file, { force: true });
    }
    await page.reload({ waitUntil: 'load' });
    await idle(page);
  },
} satisfies PageSpec;

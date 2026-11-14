import path from 'node:path';
import { LEDGER, openDebug, partOf, photograph, themeOf } from '../board.ts';
import { expectCount, expectVisible, settled } from '../checks.ts';
import { LOOPING } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

const { id, target } = LOOPING;

/** The task each try of LOOPING's implement was filed as. */
const TASK = { 1: `${id}-${target}-1`, 3: `${id}-${target}-3` } as const;

export default {
  /**
   * Debug lives in the Detail fold of a ledger row, for the try its part shows: on LOOPING's page, implement's Detail, opened, holds the
   * Debug panel, which draws the path of its current try's task; choosing try 1 in its picker redraws the panel on try 1's task, and
   * nothing of try 3's; and Full width, pressed there, opens the path in the wide sheet, which its Close takes back.
   */
  name: 'debug-detail',
  route: `/runs/${id}`,
  expect: async (page) => {
    const part = partOf(page.locator(LEDGER), target);
    const { panel } = await openDebug(part, TASK[3]);
    await part.locator(`[data-try-picker="${target}"] [data-try="1"]`).click();
    await page.waitForURL((url) => url.searchParams.get('try') === `${target}:1`);
    await expectVisible(panel.locator(`[data-path="${TASK[1]}"]`), 'try 1 chosen, the panel draws the path of its task');
    await expectCount(panel.locator(`[data-path="${TASK[3]}"]`), 0, "and no more try 3's");
    await settled(page);
    await photograph(part, path.join(OUT, `debug-detail-part-${await themeOf(page)}.png`));

    await panel.getByRole('button', { name: 'Full width' }).click();
    const sheet = page.getByRole('dialog');
    await expectVisible(
      sheet.getByRole('heading', { name: "The task's path through the runtime's lifecycle" }),
      'Full width opens the wide sheet from the Detail fold',
    );
    await expectVisible(sheet.locator('[data-machine="lifecycle"]'), 'drawing the lifecycle');
    await sheet.getByRole('button', { name: 'Close' }).click();
    await expectCount(sheet, 0, 'and Close takes it back');
  },
} satisfies PageSpec;

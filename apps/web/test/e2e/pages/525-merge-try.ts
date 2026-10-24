import fs from 'node:fs';
import path from 'node:path';
import { fed, photograph, stepBar, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, settled } from '../checks.ts';
import { LOOPING } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

export default {
  /**
   * A try a merge replaced (`nemia refresh --base`), on the loop's page: LOOPING's record is written as the tick writes a merge filed —
   * implement's second try moved behind with `cause: 'merge'`, never `round` — and implement's Details list its third try as a merge, on
   * the round it was on. The record is put back as seeded before the page ends, said on the feed, so every page after it reads the store
   * as seeded.
   */
  name: 'merge-try',
  route: `/runs/${LOOPING.id}`,
  expect: async (page) => {
    const { id, target } = LOOPING;
    const recordFile = path.join(store!, 'runs', `${id}.json`);
    const seeded = fs.readFileSync(recordFile, 'utf8');
    const record = JSON.parse(seeded) as { steps: Record<string, { tries: Array<{ taskId: string; cause: string }> }> };
    record.steps[target].tries[1].cause = 'merge';
    const graph = page.locator(`section[aria-label="The run's steps as a graph"]`);
    try {
      fs.writeFileSync(recordFile, JSON.stringify(record, null, 2));
      fed(id, target, 'merge');
      await page.reload({ waitUntil: 'load' });
      await idle(page);
      await graph.locator(`.react-flow__node[data-id="${target}"]`).click();
      const bar = stepBar(page, id, target);
      await bar.getByRole('tab', { name: 'Details' }).click();
      const rows = bar.locator('section[aria-label="Rounds"] li[data-try]');
      await expectCount(rows, 3, `${target}'s Details list its three tries, a row each`);
      await expectVisible(rows.nth(1).getByText(/^round \d · try 2 \(round\)$/), 'try 2 came of a round');
      await expectVisible(rows.nth(2).getByText(/^round \d · try 3 \(merge\)/), 'try 3 came of a merge of the base, and says so');
      await expectCount(rows.nth(2).getByText(/\(round\)/), 0, 'a merge is never read as a round');
      await settled(page);
      await photograph(bar, path.join(OUT, `merge-try-details-${await themeOf(page)}.png`));
    } finally {
      fs.writeFileSync(recordFile, seeded);
      fed(id, target, 'round');
    }
    await page.reload({ waitUntil: 'load' });
    await idle(page);
    await settled(page);
  },
} satisfies PageSpec;

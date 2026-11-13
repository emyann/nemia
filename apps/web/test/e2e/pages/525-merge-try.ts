import fs from 'node:fs';
import path from 'node:path';
import { fed, openFold, photograph, stepBar, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, settled } from '../checks.ts';
import { LOOPING } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

export default {
  /**
   * A try a merge replaced (`nemia refresh --base`), on the loop's page: LOOPING's record is written as the tick writes a merge filed —
   * implement's second try moved behind with `cause: 'merge'`, never `round` — and implement's picker lists three tries, its Detail saying
   * the third came of a merge, on the round it was on, and the second of a round. The record is put back as seeded before the page ends,
   * said on the feed, so every page after it reads the store as seeded.
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
      const picker = bar.locator(`[data-try-picker="${target}"]`);
      await expectCount(picker.locator('[data-try]'), 3, `${target}'s picker lists its three tries, a toggle each`);
      const detail = await openFold(bar.locator('[data-part-detail]'), 'detail');
      await expectVisible(
        detail.locator('[data-shown-try="3"]').getByText(/^round \d · try 3 \(merge\)/),
        'try 3, shown as current, came of a merge of the base, and says so',
      );
      await expectCount(detail.locator('[data-shown-try="3"]').getByText(/\(round\)/), 0, 'a merge is never read as a round');
      await picker.locator('[data-try="2"]').click();
      await expectVisible(detail.locator('[data-shown-try="2"]').getByText(/^round \d · try 2 \(round\)$/), 'try 2 came of a round');
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

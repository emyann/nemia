import fs from 'node:fs';
import path from 'node:path';
import { fed, photograph, sidebar, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle } from '../checks.ts';
import { ENDING } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** A repository no place can read: where a branch of it stands is asked and not answered. */
const NOWHERE = '/code/no-such-repository';

export default {
  /**
   * A run at its ending's gate whose result branch no place could say where it stands: ENDING's record names a repository that is not
   * there, as a repository moved or deleted under a run leaves it. The decision asks the place live, which answers nothing, so what the
   * ending would act on says the branch is not read and why, in the package's words — never on the base, ahead or gone — and what it
   * changed not known, never a count. The record is put back before the page ends, and both writes said on the feed.
   */
  name: 'decide-unread',
  route: `/runs/${ENDING.id}`,
  expect: async (page) => {
    await sidebar(page);
    const record = path.join(store!, 'runs', `${ENDING.id}.json`);
    const was = fs.readFileSync(record, 'utf8');
    try {
      fs.writeFileSync(record, JSON.stringify({ ...JSON.parse(was), repo: NOWHERE }, null, 2));
      fed(ENDING.id, ENDING.ending, 'awaiting approval');
      await page.reload();
      const acts = page.locator(`article > section#step-${ENDING.ending} section[aria-label="What ${ENDING.ending} would act on"]`);
      await expectVisible(
        acts.locator('[data-standing="unread"]', { hasText: `${ENDING.branch}: where it stands is not read (` }),
        'the panel says where the branch stands is not read, with what the place said',
      );
      for (const where of ['on', 'ahead', 'gone'])
        await expectCount(acts.locator(`[data-standing="${where}"]`), 0, `and no branch reads ${where}: unread is no verdict`);
      await expectVisible(
        acts.locator('[data-stat]', { hasText: `what this run changed is not known: ${NOWHERE}` }),
        'and how much it changed is said not known, with why',
      );
      await expectCount(acts.locator('[data-stat]', { hasText: /\d+ files?:/ }), 0, 'never a count of files');
      await idle(page);
      await photograph(acts, path.join(OUT, `decide-unread-panel-${await themeOf(page)}.png`));
    } finally {
      fs.writeFileSync(record, was);
      fed(ENDING.id, ENDING.ending, 'awaiting approval');
    }
  },
} satisfies PageSpec;

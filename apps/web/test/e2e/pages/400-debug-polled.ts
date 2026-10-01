import fs from 'node:fs';
import path from 'node:path';
import { PATH_POLL_MS } from '../../../src/lib/lifecyclePath.ts';
import { openDebug, photograph, sidebar, themeOf } from '../board.ts';
import { expectCount, expectVisible, settled } from '../checks.ts';
import { SAYING } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** How long a move of the task may take to show: a few of the panel's polls. */
const POLLED_MS = 4 * PATH_POLL_MS;

export default {
  /**
   * The Debug panel reads its task's path again while the task is not in a final state: draft's session, at work, is asked to stop
   * behind the page's back, which changes no step's word, so nothing is said on the feed, and the panel lights stopping within a few of
   * its polls. The journal is put back as seeded, and working is lit again. The page follows a live session, whose stream never
   * finishes (`follows`).
   */
  name: 'debug-polled',
  route: `/runs/${SAYING.run}/steps/${SAYING.step}`,
  follows: true,
  expect: async (page) => {
    await sidebar(page);
    const taskId = `${SAYING.run}-${SAYING.step}`;
    const journal = path.join(store!, 'engine', 'tasks', `${taskId}.jsonl`);
    const seeded = fs.readFileSync(journal, 'utf8');
    const { panel, lifecycle } = await openDebug(page, taskId);
    await expectVisible(lifecycle.locator('[data-state="working"][data-lit]'), 'draft’s session is at work: working lit');
    try {
      fs.appendFileSync(journal, `${JSON.stringify({ kind: 'stop-requested', at: new Date().toISOString() })}\n`);
      await expectVisible(
        lifecycle.locator('[data-state="stopping"][data-lit]'),
        `asked to stop, with nothing said on the feed, the task lights stopping within ${POLLED_MS} ms: the panel polls a task still moving`,
        POLLED_MS,
      );
      await expectCount(lifecycle.locator('[data-state][data-lit]'), 1, 'and it alone');
      await expectVisible(
        panel.getByRole('list', { name: 'The path' }).getByText('(by a person: requestStop)'),
        'a person’s stop is named by its verb on the timeline',
      );
      await expectVisible(lifecycle.locator('[data-route="working->stopping"][data-taken]'), 'and its route, from working, is taken');
      await settled(page);
      await photograph(panel, path.join(OUT, `debug-polled-stopping-${await themeOf(page)}.png`));
    } finally {
      fs.writeFileSync(journal, seeded);
    }
    await expectVisible(
      lifecycle.locator('[data-state="working"][data-lit]'),
      'with the journal put back, working is lit again',
      POLLED_MS,
    );
  },
} satisfies PageSpec;

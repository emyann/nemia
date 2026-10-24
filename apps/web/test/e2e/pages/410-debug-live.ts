import fs from 'node:fs';
import path from 'node:path';
import { PATH_POLL_MS } from '../../../src/lib/lifecyclePath.ts';
import { fed, openDebug, photograph, sidebar, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled } from '../checks.ts';
import { FAKE, SESSION } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** How long a change on the feed may take to show, as the `live` page holds the board to. */
const LIVE_MS = 3_000;

/** Longer than three of the panel's polls: a panel that polled a settled task would read it within this time. */
const QUIET_MS = 3 * PATH_POLL_MS + 500;

export default {
  /**
   * The Debug panel reads what the feed says of its step. implement's task is settled, so its path is not polled; the step filed again
   * behind the page's back, as a retry files it — a new task, the first kept as try 1 — and that task stopped before it started, is not
   * read while nothing says so. Once the feed says implement moved, the panel draws the new task's path within `LIVE_MS`, lit where it
   * stands, and offers the try before it, which a person picks to see where that one ended. Taken back the same way. The new task is
   * settled, so no conversation of it is followed: a live one's stream, closed by the board as the take-back moves the step back, would be
   * a failed request.
   */
  name: 'debug-live',
  route: `/runs/${FAKE.id}/steps/${SESSION.step}`,
  expect: async (page) => {
    await sidebar(page);
    const { id } = FAKE;
    const step = SESSION.step;
    const first = `${id}-${step}`;
    const second = `${first}-2`;
    const record = path.join(store!, 'runs', `${id}.json`);
    const journal = path.join(store!, 'engine', 'tasks', `${second}.jsonl`);
    const seeded = fs.readFileSync(record, 'utf8');
    const { panel, lifecycle } = await openDebug(page, first);
    const completed = lifecycle.locator('[data-state="completed"][data-lit]');
    await expectVisible(completed, `${step}'s task settled: completed lit`);
    await idle(page);
    let reads = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === `/api/runs/${id}/steps/${step}/path`) reads += 1;
    });
    try {
      const run = JSON.parse(seeded) as { steps: Record<string, Record<string, unknown>> };
      const was = run.steps[step];
      run.steps[step] = { ...was, taskId: second, tries: [{ taskId: first, cause: 'retries' }] };
      const cwd = typeof was.workspace === 'string' ? was.workspace : store!;
      const at = new Date().toISOString();
      const stopped = [
        { kind: 'filed', at, brief: SESSION.prompt, cwd, maxAttempts: 1, harness: 'claude' },
        { kind: 'stop-requested', at },
        { kind: 'settled', at, outcome: 'stopped' },
      ];
      fs.writeFileSync(journal, stopped.map((entry) => `${JSON.stringify(entry)}\n`).join(''));
      fs.writeFileSync(record, JSON.stringify(run, null, 2));
      await page.waitForTimeout(QUIET_MS);
      if (reads !== 0)
        throw new Refused(
          `a settled task's path is not polled: nothing is read while nothing says so — it was read ${reads} times in ${QUIET_MS} ms`,
        );
      await expectVisible(completed, 'and completed is still lit');

      fed(id, step, 'stopped, try 2');
      await expectVisible(
        panel.locator(`[data-path="${second}"]`),
        `the new task's path within ${LIVE_MS} ms of the feed saying so`,
        LIVE_MS,
      );
      await expectVisible(lifecycle.locator('[data-state="canceled"][data-lit]'), 'stopped before it started: canceled lit', LIVE_MS);
      await expectCount(lifecycle.locator('[data-route][data-taken]'), 2, 'two routes taken: the person’s stop, and a pass’s settling');
      await expectVisible(lifecycle.locator('[data-route="submitted->stopping"][data-taken]'), 'submitted->stopping taken, by the stop');
      await expectVisible(lifecycle.locator('[data-route="stopping->canceled"][data-taken]'), 'stopping->canceled taken');
      const picker = panel.getByRole('radiogroup', { name: 'Which try' });
      await expectVisible(picker.getByRole('radio', { name: 'try 2 (current)', checked: true }), 'the current try is picked');
      await idle(page);
      await settled(page);
      await photograph(panel, path.join(OUT, `debug-live-retried-${await themeOf(page)}.png`));

      await picker.getByRole('radio', { name: 'try 1', exact: true }).click();
      await expectVisible(panel.locator(`[data-path="${first}"]`), 'try 1 picked: its own task');
      await expectVisible(completed, 'where it ended: completed lit');
    } finally {
      fs.writeFileSync(record, seeded);
      fs.rmSync(journal, { force: true });
      fed(id, step, 'succeeded');
    }
    await expectCount(
      panel.getByRole('radiogroup', { name: 'Which try' }),
      0,
      'with the retry taken back, one try, and no picker',
      LIVE_MS,
    );
    await expectVisible(panel.locator(`[data-path="${first}"]`), 'the panel draws the first task', LIVE_MS);
    await expectVisible(completed, 'completed lit again', LIVE_MS);
  },
} satisfies PageSpec;

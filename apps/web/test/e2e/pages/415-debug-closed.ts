import fs from 'node:fs';
import path from 'node:path';
import { fed, openDebug, photograph, sidebar, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, settled } from '../checks.ts';
import { FAKE, SESSION } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** How long a change on the feed may take to show, as the `live` page holds the board to. */
const LIVE_MS = 3_000;

export default {
  /**
   * The Debug panel lights the route a person's verb took. implement's step is pointed, behind the page's back, at a review task held
   * open after its turn and closed by a person, then settled; once the feed says so, the panel draws its path. At its newest entry the
   * route of the close, input-required to ending, is taken, dashed, and the timeline names the verb at the `closed` entry; scrubbed back
   * to the turn's end, input-required is lit and that route is not taken. Taken back the same way.
   */
  name: 'debug-closed',
  route: `/runs/${FAKE.id}/steps/${SESSION.step}`,
  expect: async (page) => {
    await sidebar(page);
    const { id } = FAKE;
    const step = SESSION.step;
    const first = `${id}-${step}`;
    const review = `${first}-closed`;
    const record = path.join(store!, 'runs', `${id}.json`);
    const journal = path.join(store!, 'engine', 'tasks', `${review}.jsonl`);
    const seeded = fs.readFileSync(record, 'utf8');
    const { panel, lifecycle } = await openDebug(page, first);
    await expectVisible(lifecycle.locator('[data-state="completed"][data-lit]'), `${step}'s task settled: completed lit`);
    await idle(page);
    const close = lifecycle.locator('[data-route="input-required->ending"]');
    try {
      const run = JSON.parse(seeded) as { steps: Record<string, Record<string, unknown>> };
      const was = run.steps[step];
      run.steps[step] = { ...was, taskId: review };
      const cwd = typeof was.workspace === 'string' ? was.workspace : store!;
      const at = new Date().toISOString();
      const closed = [
        { kind: 'filed', at, brief: SESSION.prompt, cwd, maxAttempts: 1, harness: 'claude', holdOpen: true },
        { kind: 'starting', at, attempt: 1 },
        { kind: 'spawned', at, attempt: 1 },
        { kind: 'ended', at, attempt: 1, sessionId: `${review}-1`, observed: 'done', reason: 'harness' },
        { kind: 'closed', at },
        { kind: 'settled', at, outcome: 'succeeded' },
      ];
      fs.writeFileSync(journal, closed.map((entry) => `${JSON.stringify(entry)}\n`).join(''));
      fs.writeFileSync(record, JSON.stringify(run, null, 2));
      fed(id, step, 'succeeded, closed');

      await expectVisible(panel.locator(`[data-path="${review}"]`), `the review task's path once the feed says so`, LIVE_MS);
      await expectVisible(lifecycle.locator('[data-state="completed"][data-lit]'), 'closed, then settled: completed lit');
      await expectVisible(close.and(page.locator('[data-taken][data-dashed]')), "the close's route taken, dashed: a person's verb took it");
      await expectCount(lifecycle.locator('[data-route][data-taken]'), 5, 'five routes taken, the close among them');
      const timeline = panel.getByRole('list', { name: 'The path' });
      await expectVisible(
        timeline.locator('[data-entry="4"][data-state-at="ending"] [data-by-person="close"]'),
        'the timeline names the verb at the closed entry',
      );
      await expectVisible(timeline.getByText('(by a person: close)'), 'in words');
      await expectCount(timeline.getByText('(no edge)'), 0, 'and no move is said to have no edge');
      await idle(page);
      await settled(page);
      await photograph(panel, path.join(OUT, `debug-closed-taken-${await themeOf(page)}.png`));

      await timeline.locator('[data-entry="3"] button').click();
      await expectVisible(lifecycle.locator('[data-state="input-required"][data-lit]'), "at the turn's end, input-required lit");
      await expectVisible(close.and(page.locator(':not([data-taken])')), 'and the close not taken yet');
      await expectCount(lifecycle.locator('[data-route][data-taken]'), 3, 'three routes taken to reach it');
      await settled(page);
      await photograph(panel, path.join(OUT, `debug-closed-held-${await themeOf(page)}.png`));
      await timeline.locator('[data-entry="5"] button').click();
      await expectVisible(close.and(page.locator('[data-taken]')), 'scrubbed back to the newest, the close taken again');
    } finally {
      fs.writeFileSync(record, seeded);
      fs.rmSync(journal, { force: true });
      fed(id, step, 'succeeded');
    }
    await expectVisible(panel.locator(`[data-path="${first}"]`), 'with the review taken back, the panel draws the first task', LIVE_MS);
    await expectVisible(lifecycle.locator('[data-state="completed"][data-lit]'), 'completed lit again', LIVE_MS);
  },
} satisfies PageSpec;

import fs from 'node:fs';
import path from 'node:path';
import { fed, photograph, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused } from '../checks.ts';
import { DIAMOND } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** A text as a regular expression matches it, character for character. */
const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A `measured` line whose usage no runtime wrote, as a person's or another program's edit leaves one. */
const MISWRITTEN = { kind: 'measured', at: new Date(0).toISOString(), attempt: 1, usage: { responses: 'three' } };

export default {
  /**
   * A task journal holding an entry no runtime wrote costs the runs that read it, never the list: the run whose session still works says,
   * on its row, where a row says what it does now, that its record reads and its task does not, and why in the runtime's words, and
   * every run is drawn still. Its step's bar on the rail is `unreadable`. The run waiting on it is answered from the api's memo, since
   * nothing of its own moved and a hand edit writes no feed entry (the api's src/runs/unreadable.test.ts judges it afresh). The journal
   * is put back before the page ends, and said on the feed.
   */
  name: 'unreadable',
  route: '/runs',
  expect: async (page) => {
    const { running } = DIAMOND;
    const task = `${running.id}-implement`;
    const journal = path.join(store!, 'engine', 'tasks', `${task}.jsonl`);
    const was = fs.readFileSync(journal, 'utf8');
    const row = (id: string) => page.locator(`tr[data-run="${id}"]`);
    const runs = page.locator('[data-runs-page] [data-run]');
    await expectVisible(row(running.id), 'the running run is listed before its journal is touched');
    const listed = await runs.count();
    try {
      fs.appendFileSync(journal, `${JSON.stringify(MISWRITTEN)}\n`);
      fed(running.id, 'implement', 'running');
      await expectVisible(
        row(running.id).locator('[data-now-unreadable]', {
          hasText: new RegExp(
            `^${escaped(`${running.id}'s record reads, but the journal of its task ${task} does not: ${task}'s journal (`)}.*\\), entry 4 is a \`measured\` event`,
          ),
        }),
        "the running run's row says its record reads and its task does not, in the runtime's words",
      );
      await expectVisible(
        row(running.id).locator('[data-run-steps][aria-label*="implement unreadable"] [data-state="unreadable"]'),
        "its step's bar on the rail is drawn unreadable, and the rail says so aloud",
      );
      await expectCount(runs, listed, 'every run of the store is drawn still');
      const said = await page.locator('[data-run][data-unreadable]').count();
      if (said < 1 || said > 2)
        throw new Refused(`only the run whose task does not read, and the run waiting on it, may say so — ${said} runs say so`);
      await idle(page);
      await photograph(row(running.id), path.join(OUT, `unreadable-row-${await themeOf(page)}.png`));
    } finally {
      fs.writeFileSync(journal, was);
      fed(running.id, 'implement', 'running');
    }
    await expectVisible(row(running.id).locator('[data-state="working"]'), 'put back: its step is at work again');
  },
} satisfies PageSpec;

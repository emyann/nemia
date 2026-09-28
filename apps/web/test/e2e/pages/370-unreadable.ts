import fs from 'node:fs';
import path from 'node:path';
import { fed, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused } from '../checks.ts';
import { DIAMOND } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** A text as a regular expression matches it, character for character. */
const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A `measured` line whose usage no runtime wrote, as a person's or another program's edit leaves one. */
const MISWRITTEN = { kind: 'measured', at: new Date(0).toISOString(), attempt: 1, usage: { turns: 'three' } };

export default {
  /**
   * A task journal holding an entry no runtime wrote costs the runs that read it, never the list: the run whose session still works says,
   * on its row, that its record reads and its task does not, and why in the runtime's words, and every run is listed still. Its step's
   * chip says `unreadable`. The run waiting on it is answered from the api's memo, since nothing of its own moved and a hand edit writes
   * no feed entry (the api's test/unreadable.test.ts judges it afresh). The journal is put back before the page ends, and said on the feed.
   */
  name: 'unreadable',
  route: '/runs',
  expect: async (page) => {
    const { running } = DIAMOND;
    const task = `${running.id}-implement`;
    const journal = path.join(store!, 'engine', 'tasks', `${task}.jsonl`);
    const was = fs.readFileSync(journal, 'utf8');
    const row = (id: string) => page.locator('li[data-in-flight]', { has: page.locator(`a[href="/runs/${id}"]`) });
    await expectVisible(row(running.id), 'the running run is listed before its journal is touched');
    const listed = await page.locator('li[data-in-flight]').count();
    try {
      fs.appendFileSync(journal, `${JSON.stringify(MISWRITTEN)}\n`);
      fed(running.id, 'implement', 'running');
      await expectVisible(
        row(running.id).locator('[data-unreadable]', {
          hasText: new RegExp(
            `^${escaped(`${running.id}'s record reads, but the journal of its task ${task} does not: ${task}'s journal (`)}.*\\), entry 4 is a \`measured\` event`,
          ),
        }),
        "the running run's row says its record reads and its task does not, in the runtime's words",
      );
      await expectVisible(
        row(running.id).locator('[data-state="unreadable"]', { hasText: 'unreadable' }),
        "its step's chip says unreadable, in its own colour",
      );
      await expectCount(page.locator('li[data-in-flight]'), listed, 'every run of the store is listed still');
      const said = await page.locator('li[data-in-flight]:has([data-unreadable])').count();
      if (said < 1 || said > 2)
        throw new Refused(`only the run whose task does not read, and the run waiting on it, may say so — ${said} rows say so`);
      await idle(page);
      await row(running.id).screenshot({ path: path.join(OUT, `unreadable-row-${await themeOf(page)}.png`) });
    } finally {
      fs.writeFileSync(journal, was);
      fed(running.id, 'implement', 'running');
    }
    await expectVisible(row(running.id).locator('[data-state="working"]'), 'put back: its step is at work again');
  },
} satisfies PageSpec;

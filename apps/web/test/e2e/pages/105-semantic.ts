import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fed, photograph, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, settled } from '../checks.ts';
import { ENDING } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

export default {
  /**
   * A landing its check refused, on the run's page: ENDING's record is written as the tick writes an ending whose landing aborted on the
   * base as it is now — `landed` with `refusedOn` main's head, and its check — and the Decide section's trial merges say the conflict is
   * one of meaning, linked to the ending's section. The record is put back as seeded before the page ends, said on the feed.
   */
  name: 'semantic',
  route: `/runs/${ENDING.id}`,
  expect: async (page) => {
    const { id, ending } = ENDING;
    const recordFile = path.join(store!, 'runs', `${id}.json`);
    const seeded = fs.readFileSync(recordFile, 'utf8');
    const record = JSON.parse(seeded) as { repo: string; steps: Record<string, Record<string, unknown>> };
    const head = execFileSync('git', ['-C', record.repo, 'rev-parse', 'main'], { encoding: 'utf8' }).trim();
    record.steps[ending] = {
      ...record.steps[ending],
      check: { taskId: `${id}-${ending}-check` },
      landed: { aborted: 'its check refused the merge (exit 1)', refusedOn: head },
    };
    const merges = page.locator('section[aria-label="Decide"] section[aria-label="Trial merges"]');
    try {
      fs.writeFileSync(recordFile, JSON.stringify(record, null, 2));
      fed(id, ending, 'aborted');
      await page.reload({ waitUntil: 'load' });
      await idle(page);
      await expectVisible(
        merges.locator('[data-fact="semantic"][data-state="bad"]', {
          hasText: `merges cleanly onto main, and ${ending}'s landing check refused the merged tree at ${head.slice(0, 7)}: a conflict of meaning, not of text`,
        }),
        "the Decide section says the landing's conflict is one of meaning: the text merges, its check refused the merged tree",
      );
      await expectCount(
        merges.locator(`[data-fact="semantic"] a[data-fact-link="${ending}"][href="/runs/${id}#step-${ending}"]`),
        1,
        `to ${ending}'s section`,
      );
      await settled(page);
      await photograph(merges, path.join(OUT, `semantic-merges-${await themeOf(page)}.png`));
    } finally {
      fs.writeFileSync(recordFile, seeded);
      fed(id, ending, 'approve');
    }
    await page.reload({ waitUntil: 'load' });
    await idle(page);
    await expectCount(merges.locator('[data-fact="semantic"]'), 0, 'the record put back: no semantic conflict');
    await settled(page);
  },
} satisfies PageSpec;

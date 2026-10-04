import fs from 'node:fs';
import path from 'node:path';
import { photograph, recordedUsage, reloadForQuota, themeOf } from '../board.ts';
import { expectClearOfEachOther } from '../canvas.ts';
import { expectCount, expectVisible, Refused, settled } from '../checks.ts';
import { QUOTA } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

export default {
  /**
   * The quota when Claude Code, signed in to a subscription, answers get_usage with rate_limits null: Anthropic's usage service gave it
   * nothing. The header says so in its own words, not as a shape it does not read, and under the sentence the last good reading — the one
   * the quota page left, read on its last reload — both windows dimmed and dated; the header, a line taller with it, leaves every card
   * clear of the one beneath it. The e2e's api asks on every read (HKB_QUOTA_KEEP_MS and HKB_QUOTA_BACKOFF_MS 0), so the api's waits are
   * its own tests'; the answer is put back.
   */
  name: 'quota-unanswered',
  route: '/factories/default',
  expect: async (page) => {
    const file = path.join(store!, QUOTA.file);
    const written = fs.readFileSync(file, 'utf8');
    await expectCount(page.locator('[data-quota="fresh"]'), 1, 'the header shows a good reading first: the last one, to keep in sight');
    try {
      fs.writeFileSync(file, recordedUsage('unanswered'));
      await reloadForQuota(page, 'unanswered');
      const line = page.locator('[data-quota="unanswered"]');
      await expectVisible(
        line.filter({
          hasText:
            /^Quota on this machine: Claude Code is signed in to a subscription \(max\), but Anthropic's usage service gave it nothing this time\. The service may be limiting how often it is asked/,
        }),
        'the header says the usage service gave nothing, and that it may be limiting how often it is asked',
      );
      await expectVisible(
        line.filter({ hasText: /Asked again on the next read\./ }),
        'and when it is asked again: here on every read, as the e2e sets it',
      );
      await expectCount(page.locator('[data-quota="unknown"]'), 0, 'not a shape the board does not read');
      await expectCount(page.locator('[data-quota-window]'), 0, 'and no number reads as now');
      await expectCount(
        line.locator('[data-quota-last-window="five_hour"]'),
        1,
        "the last good reading's five-hour window, under the sentence",
      );
      await expectCount(
        line.locator('[data-quota-last-window="seven_day"][data-marked]'),
        1,
        `and its week, ${QUOTA.week.used}% used, still marked`,
      );
      await expectVisible(
        line.locator('[data-quota-last-window="seven_day"]').filter({ hasText: new RegExp(`^week ${QUOTA.week.used}% · resets `) }),
        'with its percentage and reset',
      );
      await expectVisible(
        line.locator('[data-quota-last-age]').filter({ hasText: /^as of \d{2}:\d{2}, just now$/ }),
        'dated in the header itself: as of when, and how long ago',
      );
      const opacity = Number(await line.locator('[data-quota-last]').evaluate((el) => getComputedStyle(el).opacity));
      if (!(opacity < 1)) throw new Refused(`the last reading is dimmed, so that nobody takes it for now — its opacity is ${opacity}`);
      await settled(page);
      await photograph(page, path.join(OUT, `factory-quota-unanswered-${await themeOf(page)}.png`), { fullPage: true });

      await page.getByRole('button', { name: 'Reset layout' }).click();
      await settled(page);
      await expectClearOfEachOther(page);
    } finally {
      fs.writeFileSync(file, written);
    }
    await reloadForQuota(page, 'fresh');
    await expectCount(
      page.locator('[data-quota="fresh"]'),
      1,
      'with the answer put back, the header shows the quota again, and no last reading',
    );
    await expectCount(page.locator('[data-quota-last]'), 0, 'no last reading beside a fresh one');
  },
} satisfies PageSpec;

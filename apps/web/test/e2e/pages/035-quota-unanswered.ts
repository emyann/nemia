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
   * nothing. The machine's gauges say so in their own words, not as a shape they do not read, and under the sentence the last good reading
   * — the one the quota page left, read on its last reload — both windows dimmed and dated; the bottom bar keeps that reading in short,
   * dimmed and marked too, and the floor beside the gauges leaves every card clear of the one beneath it. The e2e's api asks on every read
   * (HKB_QUOTA_KEEP_MS and HKB_QUOTA_BACKOFF_MS 0), so the api's waits are its own tests'; the answer is put back.
   */
  name: 'quota-unanswered',
  route: '/factories/default?bar=gauges',
  expect: async (page) => {
    const file = path.join(store!, QUOTA.file);
    const written = fs.readFileSync(file, 'utf8');
    await expectCount(page.locator('[data-quota="fresh"]'), 1, 'the gauges show a good reading first: the last one, to keep in sight');
    try {
      fs.writeFileSync(file, recordedUsage('unanswered'));
      await reloadForQuota(page, 'unanswered');
      const line = page.locator('[data-quota="unanswered"]');
      await expectVisible(
        line.filter({
          hasText:
            /^Quota on this machine: Claude Code is signed in to a subscription \(max\), but Anthropic's usage service gave it nothing this time\. The service may be limiting how often it is asked/,
        }),
        'the gauges say the usage service gave nothing, and that it may be limiting how often it is asked',
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
        line.locator('[data-quota-last-age]').filter({ hasText: /^as of \d{1,2}:\d{2} [AP]M, just now$/ }),
        'dated in the gauges themselves: as of when, and how long ago',
      );
      const opacity = Number(await line.locator('[data-quota-last]').evaluate((el) => getComputedStyle(el).opacity));
      if (!(opacity < 1)) throw new Refused(`the last reading is dimmed, so that nobody takes it for now — its opacity is ${opacity}`);
      const short = page.locator(
        `footer[data-frame-footer] [data-quota-short="5-hour ${Math.round(QUOTA.fiveHour.used)}% · week ${QUOTA.week.used}%"]`,
      );
      await expectCount(short, 1, 'the bottom bar keeps the last good reading in short');
      await expectCount(short.and(page.locator('[data-marked]')), 1, `its week, ${QUOTA.week.used}% used, still marked`);
      const dimmed = Number(
        await short
          .locator('span')
          .last()
          .evaluate((el) => getComputedStyle(el).opacity),
      );
      if (!(dimmed < 1)) throw new Refused(`the bottom bar dims the last reading too — its opacity is ${dimmed}`);
      if (!(await short.getAttribute('title'))?.includes('Last read '))
        throw new Refused(
          `the bottom bar's hover says when the reading was last good — ${JSON.stringify(await short.getAttribute('title'))}`,
        );
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
      'with the answer put back, the gauges show the quota again, and no last reading',
    );
    await expectCount(page.locator('[data-quota-last]'), 0, 'no last reading beside a fresh one');
  },
} satisfies PageSpec;

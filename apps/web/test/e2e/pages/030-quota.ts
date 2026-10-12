import fs from 'node:fs';
import path from 'node:path';
import { photograph, recordedUsage, reloadForQuota, themeOf } from '../board.ts';
import { expectClearOfEachOther } from '../canvas.ts';
import { expectCount, expectTexts, expectUncut, expectVisible, Refused, settled } from '../checks.ts';
import { timeOfDay } from '../../../src/lib/timeOfDay.ts';
import { QUOTA } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

export default {
  /**
   * The subscription's quota in the frame's bottom bar, and whole in the machine's gauges it opens, as the api asked the e2e's `claude` for
   * it (get_usage). The bar says each window's label and percentage on one line, the week marked past 80%; the gauges say each window's
   * reset in the browser's own time, to the minute as `timeOfDay` writes it, with the weekday when it falls on another day than today
   * (`clockWord`), never assumed:
   * the week resets three days out and always reads with one, and the five-hour window's reset crosses midnight in the two hours before it.
   * Then three ways the harness cannot answer — no plan, a request it refuses, and a `claude` that ends before it answers — each asked
   * again on the reload, read in the state the change makes (`reloadForQuota`), and said in a sentence, with no number. The answer is put
   * back as seeded, and the floor beside the gauges leaves every card clear of the one beneath it.
   */
  name: 'quota',
  route: '/factories/default?bar=gauges',
  expect: async (page) => {
    const file = path.join(store!, QUOTA.file);
    const written = fs.readFileSync(file, 'utf8');
    const line = page.locator('[data-gauges] [data-quota]');
    const short = page.locator('footer[data-frame-footer] [data-quota-short]');
    const shoot = async (what: string) => {
      await settled(page);
      await photograph(page, path.join(OUT, `factory-quota-${what}-${await themeOf(page)}.png`), { fullPage: true });
    };
    const said = async (state: string, text: RegExp, why: string) => {
      await reloadForQuota(page, state);
      await expectVisible(page.locator(`[data-quota="${state}"]`, { hasText: text }), why);
      await expectCount(page.locator('[data-quota-window]'), 0, 'and no number reads as now');
      await shoot(state);
    };
    try {
      await expectCount(page.locator('[data-quota="fresh"]'), 1, 'the gauges show the quota Claude Code answered with');
      const fiveUsed = Math.round(QUOTA.fiveHour.used);
      await expectCount(
        short.and(page.locator(`[data-quota-short="5-hour ${fiveUsed}% · week ${QUOTA.week.used}%"][data-marked]`)),
        1,
        `the bottom bar says each window's label and percentage, marked: the week is ${QUOTA.week.used}% used`,
      );
      await expectTexts(short, [`quota 5-hour ${fiveUsed}% · week ${QUOTA.week.used}%`], 'on one line, led by the word quota');
      await expectUncut(short, 'and read whole');
      await expectTexts(
        line.locator('[data-quota-machine]'),
        ['Quota on this machine:'],
        "led by whose it is: the machine's, not the factory's whose floor shows it",
      );
      const { rate_limits: limits } = (
        JSON.parse(written) as { response: { response: { rate_limits: Record<'five_hour' | 'seven_day', { resets_at: string }> } } }
      ).response.response;
      const clock = async (iso: string) => {
        const { timeZone, weekday } = await page.evaluate((at) => {
          const d = new Date(at);
          const day = (on: Date) => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(on);
          return {
            timeZone: new Intl.DateTimeFormat().resolvedOptions().timeZone,
            weekday: day(d) === day(new Date()) ? null : new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(d),
          };
        }, iso);
        const time = timeOfDay(new Date(iso), timeZone);
        return weekday === null ? time : `${weekday} ${time}`;
      };
      const fiveResets = await clock(limits.five_hour.resets_at);
      const weekResets = await clock(limits.seven_day.resets_at);
      await expectTexts(
        line.locator('[data-quota-window="five_hour"]'),
        [`5-hour ${fiveUsed}% · resets ${fiveResets}`],
        'the five-hour window, used and when it resets, in the browser’s time',
      );
      await expectTexts(
        line.locator('[data-quota-window="seven_day"]'),
        [`week ${QUOTA.week.used}% · resets ${weekResets}`],
        'the week, with the weekday it resets on',
      );
      if (/^\p{N}/u.test(weekResets))
        throw new Refused(
          `three days out, the week's reset says the weekday it is on, which no locale writes with a number, where a bare time begins with one — this read ${JSON.stringify(weekResets)}, a time alone`,
        );
      await expectCount(line.locator('[data-quota-window="seven_day"][data-marked]'), 1, `the week, ${QUOTA.week.used}% used, is marked`);
      await expectCount(
        line.locator('[data-quota-window="five_hour"][data-marked]'),
        0,
        `the five-hour window, ${QUOTA.fiveHour.used}% used, is not`,
      );
      await expectVisible(line.locator('[data-quota-age]').filter({ hasText: /^read just now$/ }), 'and how old the answer is');
      await shoot('fresh');

      fs.writeFileSync(file, recordedUsage('no-plan'));
      await said(
        'no-plan',
        /^Quota on this machine: No plan limits to show: the Claude Code the api runs is not signed in to a Claude subscription/,
        'Claude Code with no subscription says how to sign in',
      );

      fs.writeFileSync(file, recordedUsage('unsupported'));
      await said(
        'unknown',
        /^Quota on this machine: Claude Code answered the usage request in a shape this board does not read: it refused the request \(Unsupported control request subtype/,
        'a Claude Code without get_usage says what it answered',
      );

      fs.rmSync(file);
      await said(
        'failed',
        /^Quota on this machine: Claude Code stopped before it answered the usage request \(exit 1: claude: not signed in, the e2e took its answer away\)\. Run claude -p/,
        'a claude that ends before it answers says how it ended',
      );
    } finally {
      fs.writeFileSync(file, written);
    }
    await reloadForQuota(page, 'fresh');
    await expectCount(page.locator('[data-quota="fresh"]'), 1, 'with the answer put back, the gauges show the quota again');

    await page.getByRole('button', { name: 'Reset layout' }).click();
    await settled(page);
    await expectClearOfEachOther(page);
  },
} satisfies PageSpec;

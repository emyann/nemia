import fs from 'node:fs';
import path from 'node:path';
import { recordedUsage, themeOf } from '../board.ts';
import { expectClearOfEachOther } from '../canvas.ts';
import { expectCount, expectTexts, expectVisible, Refused, settled } from '../checks.ts';
import { QUOTA } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

export default {
  // The subscription's quota over the Factory's floor, as the api asked the e2e's `claude` for it (get_usage): each window's percentage
  // and its reset in the browser's own time, the week marked past 80%, and the answer's age. Then three ways the harness cannot answer —
  // no plan, a request it refuses, and a `claude` that ends before it answers — each asked again on the reload and said in a sentence, with
  // no number. The answer is put back as seeded.
  name: 'quota',
  route: '/',
  expect: async (page) => {
    const file = path.join(store!, QUOTA.file);
    const written = fs.readFileSync(file, 'utf8');
    const line = page.locator('[data-quota]');
    const shoot = async (what: string) => {
      await settled(page);
      await page.screenshot({ path: path.join(OUT, `factory-quota-${what}-${await themeOf(page)}.png`), fullPage: true });
    };
    const said = async (state: string, text: RegExp, why: string) => {
      await page.reload({ waitUntil: 'networkidle' });
      await expectVisible(page.locator(`[data-quota="${state}"]`, { hasText: text }), why);
      await expectCount(page.locator('[data-quota-window]'), 0, 'and no number reads as now');
      await shoot(state);
    };
    try {
      await expectCount(page.locator('[data-quota="fresh"]'), 1, 'the header shows the quota Claude Code answered with');
      const { rate_limits: limits } = (JSON.parse(written) as { response: { response: { rate_limits: Record<'five_hour' | 'seven_day', { resets_at: string }> } } }).response.response;
      // The resets as the browser says a time where it is, to the minute, with the weekday when it is not today — as the week's is, three
      // days out, and as the five-hour window's is when the e2e runs in the two hours before midnight (`clockWord`, which this reads over).
      const clock = (iso: string) =>
        page.evaluate((at) => {
          const d = new Date(at);
          const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
          const day = (on: Date) => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(on);
          return day(d) === day(new Date()) ? time : `${new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(d)} ${time}`;
        }, iso);
      const fiveResets = await clock(limits.five_hour.resets_at);
      const weekResets = await clock(limits.seven_day.resets_at);
      await expectTexts(line.locator('[data-quota-window="five_hour"]'), [`5-hour ${Math.round(QUOTA.fiveHour.used)}% · resets ${fiveResets}`], 'the five-hour window, used and when it resets, in the browser’s time');
      await expectTexts(line.locator('[data-quota-window="seven_day"]'), [`week ${QUOTA.week.used}% · resets ${weekResets}`], 'the week, with the weekday it resets on');
      if (!/^\p{L}+\s/u.test(weekResets)) throw new Refused(`three days out, the week's reset says the weekday it is on — this read ${JSON.stringify(weekResets)}`);
      await expectCount(line.locator('[data-quota-window="seven_day"][data-marked]'), 1, `the week, ${QUOTA.week.used}% used, is marked`);
      await expectCount(line.locator('[data-quota-window="five_hour"][data-marked]'), 0, `the five-hour window, ${QUOTA.fiveHour.used}% used, is not`);
      await expectVisible(line.locator('[data-quota-age]').filter({ hasText: /^read just now$/ }), 'and how old the answer is');
      await shoot('fresh');

      fs.writeFileSync(file, recordedUsage('no-plan'));
      await said('no-plan', /^No plan limits to show: the Claude Code the api runs is not signed in to a Claude subscription/, 'Claude Code with no subscription says how to sign in');

      fs.writeFileSync(file, recordedUsage('unsupported'));
      await said('unknown', /^Claude Code answered the usage request in a shape this board does not read: it refused the request \(Unsupported control request subtype/, 'a Claude Code without get_usage says what it answered');

      fs.rmSync(file);
      await said('failed', /^Claude Code stopped before it answered the usage request \(exit 1: claude: not signed in, the e2e took its answer away\)\. Run claude -p/, 'a claude that ends before it answers says how it ended');
    } finally {
      fs.writeFileSync(file, written);
    }
    await page.reload({ waitUntil: 'networkidle' });
    await expectCount(page.locator('[data-quota="fresh"]'), 1, 'with the answer put back, the header shows the quota again');

    // The header, taller with the quota, leaves every card clear of the one beneath it.
    await page.getByRole('button', { name: 'Reset layout' }).click();
    await settled(page);
    await expectClearOfEachOther(page);
  },
} satisfies PageSpec;

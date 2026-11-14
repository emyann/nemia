import fs from 'node:fs';
import path from 'node:path';
import { fed, photograph, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, settled } from '../checks.ts';
import { DIAMOND, SHAPED, writeShaped } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The step of DIAMOND's running run at work. */
const AT_WORK = 'implement';

export default {
  /**
   * The run's result, beside its ask: DIAMOND's running run has given nothing yet, and its result says it is at work, naming the step
   * at work as a link to its part. DIAMOND's run called off before anything of it was filed says it was called off, never what is to
   * come. SHAPED, whose final step `build` has given, draws that step's fields as their widgets — its link, its
   * commit, its table and its list — and its files, under its name linked to its part, and says nothing of where it stands. SHAPED is
   * written for the visit and taken back.
   */
  name: 'run-result',
  route: `/runs/${DIAMOND.running.id}`,
  expect: async (page) => {
    const running = page.locator('section[data-run-result]');
    const stands = running.locator('[data-result-stands="working"]');
    await expectVisible(stands, 'a running run says its result is still at work');
    await expectVisible(
      stands.locator(`a[data-result-step="${AT_WORK}"][href$="#step-${AT_WORK}"]`),
      `naming ${AT_WORK}, at work, as a link to its part`,
    );
    await settled(page);
    await photograph(page.locator('section[data-run-ask]').locator('..'), path.join(OUT, `run-result-working-${await themeOf(page)}.png`));

    await page.goto(new URL(`/runs/${DIAMOND.cancelled.id}`, page.url()).href, { waitUntil: 'load' });
    await idle(page);
    const off = page.locator('section[data-run-result] [data-result-ended="calledOff"]');
    await expectVisible(off.getByText('called off'), 'a run called off before its final steps gave says it was called off');
    await expectCount(page.locator('section[data-run-result] [data-result-stands]'), 0, 'and never that they are still to come');
    await settled(page);
    await photograph(
      page.locator('section[data-run-ask]').locator('..'),
      path.join(OUT, `run-result-called-off-${await themeOf(page)}.png`),
    );

    const written = writeShaped(store!);
    const { id, step } = SHAPED;
    try {
      await page.goto(new URL(`/runs/${id}`, page.url()).href, { waitUntil: 'load' });
      await idle(page);
      const result = page.locator('section[data-run-result]');
      const gave = result.locator(`[data-result-gave="${step}"]`);
      await expectVisible(gave.locator(`a[data-result-step="${step}"][href$="#step-${step}"]`), `the result names ${step}, linked`);
      await expectCount(result.locator('[data-result-stands]'), 0, 'and says nothing of where the run stands: it has given');
      await expectVisible(gave.getByText(SHAPED.summary), 'what it said, in a line');
      await expectVisible(gave.locator(`[data-field="pr"][data-widget="link"] a[href="${SHAPED.pr}"]`), 'its link, a link');
      await expectVisible(gave.locator('[data-field="head"][data-widget="commit"]').getByText(SHAPED.head), 'its commit');
      await expectCount(gave.locator('[data-field="findings"][data-widget="table"] tbody tr'), SHAPED.findings.length, 'its table');
      await expectCount(gave.locator('[data-field="touched"][data-widget="list"] li'), SHAPED.touched.length, 'its list');
      await expectVisible(gave.locator('[data-artifacts]'), 'and the files it named');
      await settled(page);
      await photograph(result, path.join(OUT, `run-result-gave-${await themeOf(page)}.png`));
    } finally {
      await page.goto(new URL('/runs', page.url()).href, { waitUntil: 'load' });
      await idle(page);
      for (const file of written) fs.rmSync(file, { recursive: true, force: true });
      fed(id, 'removed');
    }
  },
} satisfies PageSpec;

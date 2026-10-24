import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Page } from 'playwright';
import { fed, photograph, themeOf } from '../board.ts';
import { cardOf } from '../canvas.ts';
import { expectCount, expectVisible, idle, literal, Refused, settled, WAIT_MS } from '../checks.ts';
import { GATED, HELD } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store, unreadName } from '../world.ts';

/** The why the page gives the hold. */
const WHY = 'its parser conflicts with the flag';

export default {
  /**
   * A hold put on the board, as `nemia hold <run> --until <run> --why <words>` puts it (`POST /api/runs/:id/hold`): Hold… in GATED's
   * header opens a form offering the runs of its repository that may still land, HELD among them and GATED not; HELD ticked through its
   * label and a why given, Hold writes the hold's file with the api's user as `by`, and the page says it in its Held section, offering Lift
   * and no Hold…; GATED's card on the Factory says it whole too. The hold is then lifted from the page, as the `lift` page lifts it. What
   * the api refuses is the `hold-put-refused` page's, and its own tests' (`apps/api/test/hold.test.ts`).
   */
  name: 'hold-put',
  route: `/runs/${GATED.id}`,
  expect: async (page) => {
    const { id, gated } = GATED;
    const until = HELD.id;
    const hold = path.join(store!, 'runs', `${id}.hold`);
    const word = `held until ${unreadName(until)} lands (why: ${WHY}; by ${os.userInfo().username})`;
    const theme = await themeOf(page);
    const section = page.locator('section[aria-label="Held"]');
    await expectCount(section, 0, `before the hold, ${id}'s page says no hold`);
    if (fs.existsSync(hold)) throw new Refused(`no hold on ${id} before the page puts one — ${hold} is there`);

    try {
      await page.locator('[data-hold-open]').click();
      const dialog = page.getByRole('dialog', { name: `Hold ${id}` });
      await expectVisible(dialog.locator(`[data-hold-run="${until}"]`), `the form offers ${until}, a run of the same repository`);
      await expectCount(dialog.locator(`[data-hold-run="${id}"]`), 0, `and not ${id} itself`);
      const put = dialog.getByRole('button', { name: 'Hold', exact: true });
      if (!(await put.isDisabled())) throw new Refused('Hold is not offered before a run to wait on is ticked');
      await dialog.locator(`label[data-hold-run="${until}"]`).click();
      await expectVisible(dialog.getByRole('checkbox', { name: new RegExp(literal(until)), checked: true }), `${until} is ticked`);
      await dialog.getByRole('textbox', { name: 'Why (optional)' }).fill(WHY);
      if (fs.existsSync(hold)) throw new Refused('filling the form writes nothing');
      await settled(page);
      await photograph(page, path.join(OUT, `hold-put-form-${theme}.png`), { fullPage: true });

      const [answered] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/runs/${id}/hold`, {
          timeout: WAIT_MS,
        }),
        put.click(),
      ]);
      if (answered.status() !== 200)
        throw new Refused(`the api puts the hold — it answered ${answered.status()}: ${await answered.text()}`);
      await expectCount(dialog, 0, 'the popover closes once the hold is put');
      const written = JSON.parse(fs.readFileSync(hold, 'utf8')) as { until?: string[]; why?: string; by?: string };
      if (JSON.stringify([written.until, written.why, written.by]) !== JSON.stringify([[until], WHY, os.userInfo().username]))
        throw new Refused(`the hold's file says the runs ticked, the why and the api's user — it says ${JSON.stringify(written)}`);
      await expectVisible(section.locator('p.font-mono', { hasText: new RegExp(`^${literal(word)}$`) }), `the page says ${word}`);
      await expectVisible(section.getByRole('button', { name: 'Lift…', exact: true }), 'and offers Lift… in its Held section');
      await expectCount(page.locator('[data-hold-open]'), 0, 'and no Hold…: a held run is held once');
      await expectCount(page.locator('[role="alert"][data-hold-refused]'), 0, 'with no refusal said');
      await idle(page);
      await settled(page);
      await photograph(page, path.join(OUT, `hold-put-held-${theme}.png`), { fullPage: true });

      await page.goto(new URL('/factories/default', page.url()).href, { waitUntil: 'load' });
      await idle(page);
      await expectVisible(
        cardOf(page, id)
          .locator('[data-holding="on-runs"]')
          .filter({ hasText: new RegExp(`^${literal(word)}$`) }),
        `GATED's card on the Factory says ${word}`,
      );
      await page.goto(new URL(`/runs/${id}`, page.url()).href, { waitUntil: 'load' });
      await idle(page);

      await section.getByRole('button', { name: 'Lift…', exact: true }).click();
      await section.getByRole('button', { name: 'Lift', exact: true }).click();
      await expectCount(section, 0, 'the lift takes it back, and the page says no hold');
      if (fs.existsSync(hold)) throw new Refused(`the lift removed ${hold} — it is still there`);
      await expectVisible(page.locator('[data-hold-open]'), 'and offers Hold… again');
    } finally {
      await takeBack(page, hold, id, gated);
    }
  },
} satisfies PageSpec;

/** Whatever hold the page left, taken back as `nemia hold --off` does and said on the feed: every page after reads the store as seeded. */
async function takeBack(page: Page, hold: string, id: string, gated: string): Promise<void> {
  const left = fs.existsSync(hold);
  fs.rmSync(hold, { force: true });
  fed(id, gated, 'awaiting approval');
  if (left) await idle(page);
}

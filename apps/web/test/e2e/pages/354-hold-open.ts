import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Page } from 'playwright';
import { waitsOnYou } from '../../../src/lib/factory.ts';
import { fed, photograph, themeOf, isRunAction, rowsAnswered } from '../board.ts';
import { cardOf } from '../canvas.ts';
import { expectCount, expectVisible, idle, literal, Refused, settled, WAIT_MS } from '../checks.ts';
import { GATED } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The why the page gives the hold. */
const WHY = 'folded into an intake not started';

export default {
  /**
   * A hold that names no run, put on the board as `nemia hold <run> --why <words>` puts it: Hold… in GATED's header, nothing ticked and a
   * why given, writes a hold whose `until` is empty, and the run is held until a person lifts it. The run's page says it in its Held
   * section, not in the colour of what waits on you, with no Approve on the gate; GATED's card on the Factory says it in grey, and the
   * api lists the run among none that wait on you, so the bell stays quiet. Lift… takes it back, and the gate's Approve is offered again.
   */
  name: 'hold-open',
  route: `/runs/${GATED.id}`,
  expect: async (page) => {
    const { id, gated } = GATED;
    const hold = path.join(store!, 'runs', `${id}.hold`);
    const word = `held until a person lifts it (why: ${WHY}; by ${os.userInfo().username})`;
    const theme = await themeOf(page);
    const section = page.locator('section[aria-label="Held"]');
    const approve = page.locator(`article > section#step-${gated}`).getByRole('button', { name: 'Approve', exact: true });
    await expectCount(section, 0, `before the hold, ${id}'s page says no hold`);
    await expectVisible(approve, `before the hold, ${gated}'s Approve is offered`);
    if (fs.existsSync(hold)) throw new Refused(`no hold on ${id} before the page puts one — ${hold} is there`);

    try {
      await page.locator('[data-hold-open]').click();
      const dialog = page.getByRole('dialog', { name: `Hold ${id}` });
      const put = dialog.getByRole('button', { name: 'Hold', exact: true });
      await expectVisible(put, 'the form offers Hold');
      if (await put.isDisabled()) throw new Refused('Hold is offered with no run ticked: the run is then held until a person lifts it');
      await dialog.getByRole('textbox', { name: 'Why (optional)' }).fill(WHY);
      const [answered] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'POST' && isRunAction(new URL(r.url()).pathname, id, `/hold`), {
          timeout: WAIT_MS,
        }),
        put.click(),
      ]);
      if (answered.status() !== 200)
        throw new Refused(`the api puts the hold — it answered ${answered.status()}: ${await answered.text()}`);
      await expectCount(dialog, 0, 'the popover closes once the hold is put');
      const written = JSON.parse(fs.readFileSync(hold, 'utf8')) as { until?: string[]; why?: string };
      if (JSON.stringify([written.until, written.why]) !== JSON.stringify([[], WHY]))
        throw new Refused(`the hold's file names no run and says the why — it says ${JSON.stringify(written)}`);

      await expectVisible(section.locator('p.font-mono', { hasText: new RegExp(`^${literal(word)}$`) }), `the page says ${word}`);
      if ((await section.getAttribute('data-on-you')) !== 'false')
        throw new Refused('the Held section is not drawn as waiting on you: the hold is the person’s word already given');
      await expectCount(approve, 0, `and ${gated}'s section offers no Approve`);
      await expectCount(page.getByText('waiting on you', { exact: true }), 0, 'and nothing on it says it waits on you');
      const row = (await rowsAnswered(page)).find((r) => r.id === id);
      if (!row || waitsOnYou(row)) throw new Refused(`the api lists ${id} among the runs that wait on no one, which the bell reads`);
      await idle(page);
      await settled(page);
      await photograph(page, path.join(OUT, `hold-open-run-${theme}.png`), { fullPage: true });

      await page.goto(new URL('/factories/default', page.url()).href, { waitUntil: 'load' });
      await idle(page);
      const card = cardOf(page, id);
      await expectVisible(
        card.locator('[data-holding="on-runs"]').filter({ hasText: new RegExp(`^${literal(word)}$`) }),
        `GATED's card says ${word}, in grey`,
      );
      await expectCount(card.locator('[data-answer="Approve"]'), 0, 'and offers no Approve');
      await page.goto(new URL(`/runs/${id}`, page.url()).href, { waitUntil: 'load' });
      await idle(page);

      await section.getByRole('button', { name: 'Lift…', exact: true }).click();
      await section.getByRole('button', { name: 'Lift', exact: true }).click();
      await expectCount(section, 0, 'the lift takes it back, and the page says no hold');
      if (fs.existsSync(hold)) throw new Refused(`the lift removed ${hold} — it is still there`);
      await expectVisible(approve, `and ${gated}'s Approve is offered again`);
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

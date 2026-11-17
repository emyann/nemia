import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Page } from 'playwright';
import { fed, isRunAction, photograph, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import { GATED, HELD } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The why the page gives the hold. */
const WHY = 'held from the runs page';

export default {
  /**
   * A run's actions open where it is listed: a right-click on GATED's row of the runs in flight opens the kit's context menu on the run
   * page's list of actions, Hold… among them; its press asks the hold's own question, as the run page's Hold… does, in a popover beside
   * the row; HELD ticked and a why given, Hold writes the hold's file and the popover closes, and the row's menu then offers Lift…. The
   * hold is taken back as `nemia hold --off` takes it.
   */
  name: 'hold-listed',
  route: '/runs',
  expect: async (page) => {
    const { id, gated } = GATED;
    const until = HELD.id;
    const hold = path.join(store!, 'runs', `${id}.hold`);
    const row = page.locator(`[role="row"][data-run="${id}"]`);
    if (fs.existsSync(hold)) throw new Refused(`no hold on ${id} before the page puts one — ${hold} is there`);
    try {
      await expectVisible(row, `${id} is a row of the runs in flight`);
      await row.click({ button: 'right' });
      const menu = page.getByRole('menu', { name: 'Actions on the run' });
      await expectVisible(
        menu.getByRole('menuitem', { name: 'Hold…' }),
        "a right-click on the row opens the run's actions, Hold… among them",
      );
      await settled(page);
      await photograph(page, path.join(OUT, `hold-listed-menu-${await themeOf(page)}.png`));
      await menu.getByRole('menuitem', { name: 'Hold…' }).click();
      await expectCount(menu, 0, 'the menu closes on its press');
      const dialog = page.getByRole('dialog', { name: `Hold ${id}` });
      await expectVisible(dialog.locator(`[data-hold-run="${until}"]`), `Hold… asks the hold's own question, offering ${until}`);
      await dialog.locator(`label[data-hold-run="${until}"]`).click();
      await dialog.getByRole('textbox', { name: 'Why (optional)' }).fill(WHY);
      await settled(page);
      await photograph(page, path.join(OUT, `hold-listed-form-${await themeOf(page)}.png`));
      const [answered] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'POST' && isRunAction(new URL(r.url()).pathname, id, '/hold'), {
          timeout: WAIT_MS,
        }),
        dialog.getByRole('button', { name: 'Hold', exact: true }).click(),
      ]);
      if (answered.status() !== 200)
        throw new Refused(`the api puts the hold — it answered ${answered.status()}: ${await answered.text()}`);
      await expectCount(dialog, 0, 'the popover closes once the hold is put');
      const written = JSON.parse(fs.readFileSync(hold, 'utf8')) as { until?: string[]; why?: string; by?: string };
      if (JSON.stringify([written.until, written.why, written.by]) !== JSON.stringify([[until], WHY, os.userInfo().username]))
        throw new Refused(`the hold's file says the run ticked, the why and the api's user — it says ${JSON.stringify(written)}`);
      await idle(page);
      await row.click({ button: 'right' });
      await expectVisible(menu.getByRole('menuitem', { name: 'Lift…' }), "read again, the held run's menu offers Lift…");
      await expectCount(menu.getByRole('menuitem', { name: 'Hold…' }), 0, 'and no Hold…: a held run is held once');
      await page.keyboard.press('Escape');
      await expectCount(menu, 0, 'Escape closes the menu');
    } finally {
      await takeBack(page, hold, id, gated);
    }
  },
} satisfies PageSpec;

/** Whatever hold the page left, taken back as `nemia hold --off` does and said on the feed: every page after reads the store as seeded. */
async function takeBack(page: Page, hold: string, id: string, gated: string): Promise<void> {
  const left = fs.existsSync(hold);
  fs.rmSync(hold, { force: true });
  fs.rmSync(hold.replace(/\.hold$/, '.unheld'), { force: true });
  fed(id, gated, 'awaiting approval');
  if (left) await idle(page);
}

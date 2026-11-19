import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Page } from 'playwright';
import { fed, isRunAction, photograph, themeOf } from '../board.ts';
import { cardOf } from '../canvas.ts';
import { expectCount, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import { NEIGHBOUR } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The why the page gives the hold. */
const WHY = 'held from the runs page';

export default {
  /**
   * A run's actions open where it is listed: a right-click on NEIGHBOUR's row of the runs in flight opens the kit's context menu on the
   * run page's list of actions, Hold… among them; its press asks the hold's own question, as the run page's Hold… does, in a popover beside
   * the row; a why given, Hold writes the hold's file and the popover closes, and the row's menu then offers Lift… and no Hold…, whose
   * press asks the lift's question, and whose Lift removes the file. On the floor, a right-click on its card opens the same actions, and
   * does not show the run in the bar as the card's own press does. A hold the page leaves is taken back as `nemia hold --off` takes it.
   */
  name: 'hold-listed',
  route: '/runs',
  expect: async (page) => {
    const { id } = NEIGHBOUR;
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
      await expectVisible(dialog.locator(`form[data-hold="${id}"]`), "Hold… asks the hold's own question");
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
      if (JSON.stringify([written.why, written.by]) !== JSON.stringify([WHY, os.userInfo().username]))
        throw new Refused(`the hold's file says the why and the api's user — it says ${JSON.stringify(written)}`);
      await idle(page);
      await row.click({ button: 'right' });
      await expectVisible(menu.getByRole('menuitem', { name: 'Lift…' }), "read again, the held run's menu offers Lift…");
      await expectCount(menu.getByRole('menuitem', { name: 'Hold…' }), 0, 'and no Hold…: a held run is held once');
      await menu.getByRole('menuitem', { name: 'Lift…' }).click();
      const lift = page.getByRole('dialog', { name: `Lift the hold on ${id}` });
      await expectVisible(lift.getByRole('button', { name: 'Lift', exact: true }), "Lift… asks the lift's own question");
      await lift.getByRole('button', { name: 'Lift', exact: true }).click();
      await expectCount(lift, 0, 'the lift closes the popover');
      if (fs.existsSync(hold)) throw new Refused(`the lift removed ${hold} — it is still there`);

      await page.goto(new URL('/factories/default', page.url()).href, { waitUntil: 'load' });
      await idle(page);
      const card = cardOf(page, id);
      await card.locator('article[data-run]').click({ button: 'right' });
      await expectVisible(menu.getByRole('menuitem', { name: 'Hold…' }), "on the floor, a right-click on the run's card opens its actions");
      await expectCount(page.locator('[data-inspected]'), 0, "and is not the card's own press: the bar shows no run");
      await settled(page);
      await photograph(page, path.join(OUT, `hold-listed-floor-${await themeOf(page)}.png`));
      await page.keyboard.press('Escape');
      await expectCount(menu, 0, 'Escape closes the menu');
    } finally {
      await takeBack(page, hold, id);
    }
  },
} satisfies PageSpec;

/** Whatever hold the page left, taken back as `nemia hold --off` does and said on the feed: every page after reads the store as seeded. */
async function takeBack(page: Page, hold: string, id: string) {
  const left = fs.existsSync(hold);
  fs.rmSync(hold, { force: true });
  fs.rmSync(hold.replace(/\.hold$/, '.unheld'), { force: true });
  fed(id, 'running');
  if (left) await idle(page);
}

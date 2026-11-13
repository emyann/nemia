import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { fed, openRunMenu, photograph, runMenuActions, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled } from '../checks.ts';
import { GATED, SHAPED, writeShaped } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The agent SHAPED is written as a try of, for the visit. */
const TRIED = 'menu-tried-e2e';

/** Refuses unless the run's header holds one menu button, and it offers exactly `want`. */
async function offers(page: Page, want: readonly string[], who: string): Promise<void> {
  await expectCount(page.locator('header[data-run-header] button[data-run-menu]'), 1, `${who}'s actions are behind one button`);
  const actions = await runMenuActions(page);
  if (actions.join() !== want.join()) throw new Refused(`${who}'s menu offers ${want.join(', ')} — it offers ${actions.join(', ')}`);
  for (const mark of ['[data-hold-open]', '[data-prune-open]', '[data-remove-run]', '[data-lift]'])
    await expectCount(page.locator(`header[data-run-header] ${mark}`), 0, `and none of them stands in the header outside it (${mark})`);
}

export default {
  /**
   * Whatever a person can do to a whole run is behind one button in its header: GATED, in flight, offers Hold, whose press opens the
   * hold's own dialog; SHAPED, written as a try of an agent, over and holding files on disk, offers Remove and Prune, Prune opening its
   * own dialog and Remove asking its own question. Nothing is pressed past the question: each is taken back, with Escape or Keep it, and
   * SHAPED with it.
   */
  name: 'run-menu',
  route: `/runs/${GATED.id}`,
  expect: async (page) => {
    await offers(page, ['hold'], GATED.id);
    await (await openRunMenu(page)).locator('[data-hold-open]').click();
    const hold = page.getByRole('dialog', { name: `Hold ${GATED.id}` });
    await expectVisible(hold, 'Hold opens its own dialog');
    await settled(page);
    await photograph(page, path.join(OUT, `run-menu-hold-${await themeOf(page)}.png`));
    await page.keyboard.press('Escape');
    await expectCount(hold, 0, 'and Escape closes it, nothing held');

    const tries = path.join(store!, 'tries');
    const hadTries = fs.existsSync(tries);
    const written = writeShaped(store!, { tried: TRIED });
    const { id } = SHAPED;
    try {
      await page.goto(new URL(`/runs/${id}`, page.url()).href, { waitUntil: 'load' });
      await idle(page);
      await offers(page, ['remove', 'prune'], id);
      const menu = await openRunMenu(page);
      await settled(page);
      await photograph(page, path.join(OUT, `run-menu-open-${await themeOf(page)}.png`));
      await menu.locator('[data-prune-open]').click();
      const prune = page.getByRole('dialog', { name: `Prune ${id}` });
      await expectVisible(prune, 'Prune opens its own dialog');
      await page.keyboard.press('Escape');
      await expectCount(prune, 0, 'and Escape closes it, nothing pruned');

      const again = await openRunMenu(page);
      await again.getByRole('button', { name: 'Remove…' }).click();
      await expectVisible(again.locator('[data-remove-run]').getByRole('button', { name: 'Remove', exact: true }), 'Remove asks first');
      await again.getByRole('button', { name: 'Keep it' }).click();
      await expectVisible(again.getByRole('button', { name: 'Remove…' }), 'and Keep it takes the question back, nothing removed');
    } finally {
      await page.goto(new URL('/runs', page.url()).href, { waitUntil: 'load' });
      await idle(page);
      for (const file of written) fs.rmSync(file, { recursive: true, force: true });
      if (!hadTries) fs.rmSync(tries, { recursive: true, force: true });
      fed(id, 'removed');
    }
  },
} satisfies PageSpec;

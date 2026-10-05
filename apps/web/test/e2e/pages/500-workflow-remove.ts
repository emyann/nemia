import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { photograph, sidebarOf, themeOf } from '../board.ts';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The workflow of yours the page writes, stars and removes from its card. */
const GOING = 'goes-from-its-card-e2e';

/** Its card on the Workflows page. */
const cardOf = (page: Page) => page.locator(`section[aria-label="Workflow ${GOING}"]`);

/** The sidebar's Favorites, by the link each favourite is. */
const favoritesOf = (page: Page) => sidebarOf(page).locator('[data-favorites]').getByRole('link');

/** What the confirm says goes, and what becomes of what names the folder. */
const asked = (dir: string): string =>
  `Remove ${dir}, its 2 steps and every file in it? A run started on it goes on from the steps it froze at its start; a card that names it and is not queued is refused when it starts; its star goes with it.`;

export default {
  /**
   * A workflow of yours removed from its card: Remove… asks first, naming the folder, its steps and its star, and saying that a run
   * started on it goes on from what it froze and that a card naming it not queued is refused at its start; Keep it takes the question
   * back. Remove then takes the folder off the disk, the card off the page and its star off Favorites. The repository's cards offer no
   * Remove. The folder is written by the page, and removed by it; a failure removes it too.
   */
  name: 'workflow-remove',
  route: '/workflows',
  expect: async (page) => {
    const dir = path.join(store!, 'workflows', GOING);
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'README.md'), `# ${GOING}\n\nA workflow the e2e removes from its card.\n`);
      fs.writeFileSync(path.join(dir, 'plan.md'), '---\nharness: claude\n---\nWrite PLAN.md.\n');
      fs.writeFileSync(path.join(dir, 'build.md'), '---\nafter: plan\n---\nBuild what PLAN.md says.\n');
      await page.reload({ waitUntil: 'load' });
      await idle(page);
      const card = cardOf(page);
      await expectCount(
        page.locator('section[data-from="repo"]').getByRole('button', { name: 'Remove…' }),
        0,
        "the repository's workflows offer no Remove: the board removes only yours",
      );
      await card.getByRole('button', { name: `Star ${GOING} (yours)` }).click();
      await expectTexts(
        favoritesOf(page).filter({ hasText: GOING }),
        [`${GOING} (yours)`],
        'starred, the workflow is under Favorites, as one of yours',
      );

      await card.getByRole('button', { name: 'Remove…' }).click();
      const asks = card.locator('[data-remove-asks]');
      await expectVisible(asks, 'Remove… asks before it removes');
      const said = (await asks.locator('p').first().textContent())?.replace(/\s+/g, ' ');
      if (said !== asked(dir)) throw new Refused(`the question says what goes — it says ${JSON.stringify(said)}`);
      await settled(page);
      await photograph(card, path.join(OUT, `workflow-remove-asks-${await themeOf(page)}.png`));
      await card.getByRole('button', { name: 'Keep it' }).click();
      await expectCount(asks, 0, 'Keep it takes the question back');
      if (!fs.existsSync(dir)) throw new Refused(`Keep it removes nothing — ${dir} is gone`);

      await card.getByRole('button', { name: 'Remove…' }).click();
      const [answered] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'DELETE' && new URL(r.url()).pathname === `/api/workflows/yours/${GOING}`, {
          timeout: WAIT_MS,
        }),
        card.getByRole('button', { name: 'Remove', exact: true }).click(),
      ]);
      if (answered.status() !== 200) throw new Refused(`the api removes the folder — it answered ${answered.status()}`);
      await expectCount(card, 0, 'removed, the card goes from the page');
      if (fs.existsSync(dir)) throw new Refused(`removed, the folder goes from the disk — ${dir} is still there`);
      await expectCount(
        sidebarOf(page).locator('[data-favorites] li', { hasText: GOING }),
        0,
        'removed, its star goes from Favorites, not left there as gone',
      );
      const kept = await page.evaluate(() => localStorage.getItem('nemia:favorites'));
      if (kept?.includes(GOING)) throw new Refused(`removed, its star goes from what the browser keeps — it keeps ${kept}`);
      await idle(page);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
} satisfies PageSpec;

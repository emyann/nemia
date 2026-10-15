import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectInside, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The workflow of yours the page writes, stars and removes from its page. */
const GOING = 'goes-from-its-card-e2e';

/** The runner's viewport, put back before the page ends. */
const WIDE = { width: 1280, height: 800 };

/** A phone held upright. */
const PHONE = { width: 390, height: 844 };

/** Its page, open. */
const cardOf = (page: Page) => page.locator(`article[aria-label="Workflow ${GOING}"]`);

/** What the confirm says goes, and what becomes of what names the folder. */
const asked = (dir: string): string =>
  `Remove ${dir}, its 2 steps and every file in it? A run started on it goes on from the steps it froze at its start; a card that names it and is not queued is refused when it starts; its star goes with it.`;

export default {
  /**
   * A workflow of yours removed from its page: Remove… asks first, naming the folder, its steps and its star, and saying that a run started
   * on it goes on from what it froze and that a card naming it not queued is refused at its start; Keep it takes the question back. On a
   * phone, the question and its buttons wrap inside the page. Remove then takes the folder off the disk, goes back to the Workflows page,
   * without its card, and takes its star off Favorites. No card on the Workflows page offers Remove. The folder is written by the page, and
   * removed by it; a failure removes it too.
   */
  name: 'workflow-remove',
  route: '/workflows',
  expect: async (page) => {
    const dir = path.join(store!, 'workflows', GOING);
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'README.md'), `# ${GOING}\n\nA workflow the e2e removes from its card.\n`);
      fs.writeFileSync(path.join(dir, 'plan.md'), '---\nplace: git\nharness: claude\n---\nWrite PLAN.md.\n');
      fs.writeFileSync(path.join(dir, 'build.md'), '---\nplace: git\nafter: plan\n---\nBuild what PLAN.md says.\n');
      await page.reload({ waitUntil: 'load' });
      await idle(page);
      const listed = page.locator(`section[aria-label="Workflow ${GOING}"]`);
      await expectVisible(listed, `${GOING} is listed`);
      await expectCount(page.locator('main').getByRole('button', { name: 'Remove…' }), 0, 'no card offers Remove: its page does');
      await listed.getByRole('heading').getByRole('link').click();
      await page.waitForURL((url) => url.pathname === `/workflows/yours/${GOING}`, { timeout: WAIT_MS });
      await idle(page);
      const card = cardOf(page);
      await card.getByRole('button', { name: `Star ${GOING} (yours)` }).click();
      await page.waitForFunction((going) => localStorage.getItem('nemia:favorites')?.includes(going) === true, GOING, { timeout: WAIT_MS });

      await card.getByRole('button', { name: 'Remove…' }).click();
      const asks = card.locator('[data-remove-asks]');
      await expectVisible(asks, 'Remove… asks before it removes');
      const said = (await asks.locator('p').first().textContent())?.replace(/\s+/g, ' ');
      if (said !== asked(dir)) throw new Refused(`the question says what goes — it says ${JSON.stringify(said)}`);
      await settled(page);
      await photograph(card, path.join(OUT, `workflow-remove-confirm-${await themeOf(page)}.png`));
      await page.setViewportSize(PHONE);
      await settled(page);
      await expectInside(asks.locator('p, button'), card, 'on a phone, the question and its buttons lie inside the page');
      await photograph(card, path.join(OUT, `workflow-remove-confirm-phone-${await themeOf(page)}.png`));
      await page.setViewportSize(WIDE);
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
      await page.waitForURL((url) => url.pathname === '/workflows', { timeout: WAIT_MS });
      await idle(page);
      await expectCount(listed, 0, 'removed, its page goes back to the Workflows page, its card gone');
      if (fs.existsSync(dir)) throw new Refused(`removed, the folder goes from the disk — ${dir} is still there`);
      const kept = await page.evaluate(() => localStorage.getItem('nemia:favorites'));
      if (kept?.includes(GOING)) throw new Refused(`removed, its star goes from what the browser keeps — it keeps ${kept}`);
      await idle(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await photograph(page, path.join(OUT, `workflow-remove-done-${await themeOf(page)}.png`), { fullPage: true });
    } finally {
      await page.setViewportSize(WIDE);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
} satisfies PageSpec;

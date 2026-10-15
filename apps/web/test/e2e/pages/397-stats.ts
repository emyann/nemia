import path from 'node:path';
import { litOf, photograph, railPlace, sidebar, themeOf } from '../board.ts';
import { expectCount, expectVisible, settled } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

export default {
  /**
   * Stats, a destination of the rail between Workflows and Settings: pressed on the Agents page it opens /stats, lit alone, which says
   * plainly that Stats is to come.
   */
  name: 'stats',
  route: '/agents',
  expect: async (page) => {
    await sidebar(page);
    await railPlace(page, 'Stats').click();
    await page.waitForURL((url) => url.pathname === '/stats');
    await expectVisible(railPlace(page, 'Stats').and(litOf(page)), 'the rail lights Stats on its page');
    await expectCount(litOf(page), 1, 'and no other destination');
    await expectVisible(page.locator('header[data-frame-header] [data-page-name]').getByText('Stats', { exact: true }), 'the top bar names it');
    await expectVisible(page.locator('[data-stats]').getByText('Stats is to come', { exact: true }), 'the page says Stats is to come');
    await settled(page);
    await photograph(page, path.join(OUT, `stats-to-come-${await themeOf(page)}.png`));
  },
} satisfies PageSpec;

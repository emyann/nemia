import path from 'node:path';
import { dockFaceOf, photograph, themeOf } from '../board.ts';
import { expectVisible, idle, Refused, settled } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

export default {
  /**
   * The frame leaves room under every page Nemia's face is docked over: Settings, longer than its window, scrolled to its end, shows
   * its last section whole above her face and its cues, its last line and its press included.
   */
  name: 'settings-end',
  route: '/settings',
  expect: async (page) => {
    await idle(page);
    const last = page.locator('[data-forget-token]');
    await expectVisible(last, "Settings ends on this browser's section");
    await expectVisible(dockFaceOf(page), "Nemia's face is docked over Settings");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await settled(page);
    const scrolled = await page.evaluate(() => window.scrollY);
    if (scrolled === 0) throw new Refused('Settings is longer than its window, so it scrolls to its end — it did not scroll');
    const lastLine = await last.locator('p').last().boundingBox();
    const section = await last.boundingBox();
    const dock = await dockFaceOf(page).locator('..').boundingBox();
    if (!lastLine || !section || !dock || lastLine.y + lastLine.height > dock.y || section.y + section.height > dock.y)
      throw new Refused(
        `scrolled to its end, Settings' last section ends above Nemia's dock, its last line read whole — line ${JSON.stringify(lastLine)}, section ${JSON.stringify(section)}, dock ${JSON.stringify(dock)}`,
      );
    await photograph(page, path.join(OUT, `settings-end-bottom-${await themeOf(page)}.png`));
    await page.evaluate(() => window.scrollTo(0, 0));
  },
} satisfies PageSpec;

import path from 'node:path';
import { expectUncovered, frameScrolled, photograph, scrollFrame, themeOf } from '../board.ts';
import { expectVisible, idle, Refused, settled } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

export default {
  /**
   * Nothing of the frame is laid over a page's foot: Settings, longer than its window, scrolled to its end, shows its last line in the
   * window with nothing drawn over it, Nemia's face being in the rail and her chat beside the page.
   */
  name: 'settings-end',
  route: '/settings',
  expect: async (page) => {
    await idle(page);
    const last = page.locator('[data-forget-token]');
    await expectVisible(last, "Settings ends on this browser's section");
    await scrollFrame(page, 'end');
    await settled(page);
    const scrolled = await frameScrolled(page);
    if (scrolled === 0) throw new Refused('Settings is longer than its window, so it scrolls to its end — it did not scroll');
    await expectUncovered(last.locator('p').last(), "scrolled to its end, Settings' last line is in the window with nothing over it");
    await photograph(page, path.join(OUT, `settings-end-bottom-${await themeOf(page)}.png`));
    await scrollFrame(page, 0);
  },
} satisfies PageSpec;

import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled } from '../checks.ts';
import { GATED } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The bottom bar's pause: its one button. */
const pauseOf = (page: Page) => page.locator('footer[data-frame-footer] button[data-pause]');

/** The pause's popover. */
const popoverOf = (page: Page) => page.locator('[data-pause-popover]');

/** Why the page pauses the store, given in the popover. */
const WHY = 'merging by hand on main';

/** Refuses unless the bar's pause stands right after the daemon's dot. */
async function afterTheDot(page: Page): Promise<void> {
  const order = await page
    .locator('footer[data-frame-footer]')
    .locator('[data-daemon-dot], [data-pause], [data-feed-word]')
    .evaluateAll((all) =>
      all.map((el) => ('daemonDot' in (el as HTMLElement).dataset ? 'dot' : 'pause' in (el as HTMLElement).dataset ? 'pause' : 'feed')),
    );
  if (order.join() !== 'dot,pause,feed')
    throw new Refused(`the pause stands right after the daemon's dot — the bar stands ${order.join(', ')}`);
}

/** Opens the popover and photographs the bottom bar's corner with it, as `<what>`. */
async function opened(page: Page, what: string): Promise<void> {
  await pauseOf(page).click();
  await expectVisible(popoverOf(page), 'the button opens its popover');
  await settled(page);
  await photograph(page, path.join(OUT, `pause-${what}-${await themeOf(page)}.png`));
}

export default {
  /**
   * The store paused and resumed from the bottom bar's one button, right after the daemon's dot, as `wf pause` and `wf resume` do
   * (`POST` and `DELETE /api/pause`), on the Factory. Running, the button is a pause icon; its popover says the store runs and offers
   * Pause…, which asks an optional why, and once sent the store's pause file holds it and the button says Paused since when, by whom and
   * why. While a session still finishes and a landing is held with its merge staged — the api's answer held with `route` — the button
   * says `Pausing · 1` and its popover names each. Which tasks finish, and which landings are held, is the package's judgement, proven in
   * its own tests (`packages/agent-orchestrator/src/tick/pause.test.ts`). Resume, in the popover, takes the file away. Then, on a phone's
   * screen, the button is still there, and its popover fits. The window's size is put back.
   */
  name: 'pause',
  route: '/factories/default',
  expect: async (page) => {
    const file = path.join(store!, 'cordon');
    const theme = await themeOf(page);
    const button = pauseOf(page);
    const popover = popoverOf(page);
    const size = page.viewportSize();
    try {
      await expectVisible(button.and(page.locator('[data-pause="running"]')), 'the bottom bar has the pause, the store running');
      await afterTheDot(page);
      if (fs.existsSync(file)) throw new Refused(`no pause before the page puts one — ${file} is there`);
      await opened(page, 'running');
      await expectTexts(popover.locator('[data-pause-actions] li'), ['Pause…'], 'its actions: Pause…, the store running');

      await popover.getByRole('button', { name: 'Pause…' }).click();
      await expectVisible(popover.getByText('Pause the store', { exact: true }), 'Pause… asks why first');
      if (fs.existsSync(file)) throw new Refused(`nothing is put while it asks why — ${file} is there`);
      await popover.locator('[data-pause-why]').fill(WHY);
      await settled(page);
      await photograph(page, path.join(OUT, `pause-why-${theme}.png`));
      await popover.getByRole('button', { name: 'Pause', exact: true }).click();
      await expectVisible(button.and(page.locator('[data-pause="paused"]')), 'sent, the store is Paused: nothing is at work in the e2e');
      await expectCount(popover, 0, 'and the popover closes once the api answered');
      if (!fs.existsSync(file)) throw new Refused(`the popover put the pause once the api answered — ${file} is not there`);
      const put = JSON.parse(fs.readFileSync(file, 'utf8')) as { at: string; by: string; why?: string };
      if (put.why !== WHY) throw new Refused(`the pause's file holds the why given, "${WHY}" — it holds ${JSON.stringify(put.why)}`);
      await expectTexts(button, ['Paused'], 'the button says Paused');
      await opened(page, 'paused');
      await expectVisible(
        popover
          .locator('[data-pause-line]')
          .getByText(new RegExp(`^Paused since .+ by ${put.by}: ${WHY}\\. Nothing runs and nothing new starts\\.$`)),
        'its popover says since when, by whom and why',
      );
      await expectTexts(popover.locator('[data-pause-actions] li'), ['Resume'], 'its actions: Resume, the store paused');
      await page.keyboard.press('Escape');
      await expectCount(popover, 0, 'Escape closes the popover');

      const staged = { run: GATED.id, step: 'ship', repo: '/code/app' };
      const finishing = { run: GATED.id, step: 'build', kind: 'session' };
      await page.route('**/api/pause', (route) =>
        route.request().method() === 'GET'
          ? route.fulfill({ json: { pause: put, finishing: [finishing], staged: [staged] } })
          : route.fallback(),
      );
      await page.reload({ waitUntil: 'load' });
      await idle(page);
      await expectTexts(
        button.and(page.locator('[data-pause="pausing"][data-finishing="1"]')),
        ['Pausing · 1'],
        'a session at work: Pausing · 1',
      );
      await opened(page, 'pausing');
      await expectTexts(
        popover.locator('[data-pause-finishing] li'),
        [`${GATED.id}'s build is finishing: its session is at work`],
        'its popover names what finishes',
      );
      await expectTexts(
        popover.locator('[data-pause-staged] li'),
        [`${GATED.id}'s ship has its merge staged in /code/app (MERGE_HEAD), and its check waits on the resume`],
        'and the landing it holds with its merge staged',
      );
      await page.keyboard.press('Escape');
      await page.unroute('**/api/pause');
      await page.reload({ waitUntil: 'load' });
      await idle(page);

      await expectVisible(button.and(page.locator('[data-pause="paused"]')), 'read again, the pause still stands');
      await pauseOf(page).click();
      await popover.getByRole('button', { name: 'Resume' }).click();
      await expectVisible(button.and(page.locator('[data-pause="running"]')), 'Resume resumes the store');
      if (fs.existsSync(file)) throw new Refused(`Resume took the pause away once the api answered — ${file} is still there`);
      await expectCount(popover, 0, 'the popover closes once the api answered');

      await page.setViewportSize({ width: 390, height: 844 });
      await expectVisible(button.and(page.locator('[data-pause="running"]')), "on a phone's screen, the bar keeps the pause");
      await opened(page, 'phone');
      await page.keyboard.press('Escape');
    } finally {
      await page.unroute('**/api/pause');
      fs.rmSync(file, { force: true });
      if (size) await page.setViewportSize(size);
      await idle(page);
    }
  },
} satisfies PageSpec;

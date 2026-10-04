import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled } from '../checks.ts';
import { GATED } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The header's pause: its switch, its label and its words. */
const pauseOf = (page: Page) => page.locator('header[data-frame-header] [data-pause]');

/** Why the page pauses the store, given in the switch's popover. */
const WHY = 'merging by hand on main';

export default {
  /**
   * The store paused and resumed from the frame's header, as `wf pause` and `wf resume` do (`POST` and `DELETE /api/pause`), on
   * the Factory, whose header is the fullest. The switch is labelled Pause with `nothing new starts` beside it; pressed, it asks why in a
   * popover, and once sent the store's pause file holds it and the header says since when, by whom and why; pressed again, the file is
   * gone. A landing held with its merge
   * staged is then shown by the api's answer held with `route`: the run is named beside the switch, and its sentence is on hover. Which
   * landings those are is the package's judgement, proven in its own tests (`packages/agent-orchestrator/src/tick/pause.test.ts`).
   */
  name: 'pause',
  route: '/factories/default',
  expect: async (page) => {
    const file = path.join(store!, 'cordon');
    const theme = await themeOf(page);
    const pause = pauseOf(page);
    const label = pause.locator('label', { hasText: /^Pause$/ });
    try {
      await expectVisible(pause.and(page.locator('[data-pause="off"]')), 'the header has the pause, off');
      await expectVisible(pause.getByText('nothing new starts', { exact: true }), 'with what it does beside it');
      if (fs.existsSync(file)) throw new Refused(`no pause before the page puts one — ${file} is there`);
      await settled(page);
      await photograph(page.locator('header[data-frame-header]'), path.join(OUT, `pause-off-${theme}.png`));

      await label.click();
      const ask = page.locator('[data-pause-ask]');
      await expectVisible(ask.getByText('Pause the store', { exact: true }), 'pressed, it asks why first');
      if (fs.existsSync(file)) throw new Refused(`nothing is put while it asks why — ${file} is there`);
      await ask.locator('[data-pause-why]').fill(WHY);
      await settled(page);
      await photograph(page.locator('[data-pause-ask]'), path.join(OUT, `pause-why-${theme}.png`));
      await ask.getByRole('button', { name: 'Pause', exact: true }).click();
      await expectVisible(pause.and(page.locator('[data-pause="on"]')), 'sent, the store is paused');
      if (!fs.existsSync(file)) throw new Refused(`the popover put the pause once the api answered — ${file} is not there`);
      const put = JSON.parse(fs.readFileSync(file, 'utf8')) as { at: string; by: string; why?: string };
      if (put.why !== WHY) throw new Refused(`the pause's file holds the why given, "${WHY}" — it holds ${JSON.stringify(put.why)}`);
      await expectVisible(
        pause.getByText(new RegExp(`^nothing new starts · since .+ by ${put.by}: ${WHY}$`)),
        'and the header says since when, by whom and why',
      );
      await settled(page);
      await photograph(page.locator('header[data-frame-header]'), path.join(OUT, `pause-on-${theme}.png`));

      const staged = { run: GATED.id, step: 'ship', repo: '/code/app' };
      await page.route('**/api/pause', (route) =>
        route.request().method() === 'GET' ? route.fulfill({ json: { pause: put, staged: [staged] } }) : route.fallback(),
      );
      await page.reload({ waitUntil: 'load' });
      await idle(page);
      const named = pause.locator(`[data-pause-staged="${staged.run}"]`);
      await expectVisible(named.getByText(`${staged.run} staged`, { exact: true }), 'a landing held with its merge staged is named');
      const title = await named.getAttribute('title');
      const sentence = `${staged.run}'s ship has its merge staged in /code/app (MERGE_HEAD), and its check waits on the lift`;
      if (title !== sentence) throw new Refused(`its sentence is on hover, "${sentence}" — it is "${title}"`);
      await settled(page);
      await photograph(page.locator('header[data-frame-header]'), path.join(OUT, `pause-staged-${theme}.png`));
      await page.unroute('**/api/pause');
      await page.reload({ waitUntil: 'load' });
      await idle(page);

      await expectVisible(pause.and(page.locator('[data-pause="on"]')), 'read again, the pause still stands');
      await label.click();
      await expectVisible(pause.and(page.locator('[data-pause="off"]')), 'pressed again, it is lifted');
      if (fs.existsSync(file)) throw new Refused(`the switch lifted the pause once the api answered — ${file} is still there`);
      await expectCount(pause.locator('[data-pause-refused]'), 0, 'with no refusal said');
      await expectCount(pause.locator('[data-pause-staged]'), 0, 'and no landing named');
    } finally {
      await page.unroute('**/api/pause');
      fs.rmSync(file, { force: true });
    }
  },
} satisfies PageSpec;

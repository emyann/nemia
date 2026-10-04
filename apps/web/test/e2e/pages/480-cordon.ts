import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled } from '../checks.ts';
import { GATED } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The header's cordon: its switch, its label and its words. */
const cordonOf = (page: Page) => page.locator('header[data-frame-header] [data-cordon]');

/** Why the page cordons the store, given in the switch's popover. */
const WHY = 'merging by hand on main';

export default {
  /**
   * The store cordoned and uncordoned from the frame's header, as `wf cordon` and `wf uncordon` do (`POST` and `DELETE /api/cordon`), on
   * the Factory, whose header is the fullest. The switch is labelled Cordon with `nothing new starts` beside it; pressed, it asks why in a
   * popover, and once sent the store's cordon file holds it and the header says since when, by whom and why; pressed again, the file is
   * gone. A landing held with its merge
   * staged is then shown by the api's answer held with `route`: the run is named beside the switch, and its sentence is on hover. Which
   * landings those are is the package's judgement, proven in its own tests (`packages/agent-orchestrator/src/tick/cordon.test.ts`).
   */
  name: 'cordon',
  route: '/factories/default',
  expect: async (page) => {
    const file = path.join(store!, 'cordon');
    const theme = await themeOf(page);
    const cordon = cordonOf(page);
    const label = cordon.locator('label', { hasText: /^Cordon$/ });
    try {
      await expectVisible(cordon.and(page.locator('[data-cordon="off"]')), 'the header has the cordon, off');
      await expectVisible(cordon.getByText('nothing new starts', { exact: true }), 'with what it does beside it');
      if (fs.existsSync(file)) throw new Refused(`no cordon before the page puts one — ${file} is there`);
      await settled(page);
      await photograph(page.locator('header[data-frame-header]'), path.join(OUT, `cordon-off-${theme}.png`));

      await label.click();
      const ask = page.locator('[data-cordon-ask]');
      await expectVisible(ask.getByText('Cordon the store', { exact: true }), 'pressed, it asks why first');
      if (fs.existsSync(file)) throw new Refused(`nothing is put while it asks why — ${file} is there`);
      await ask.locator('[data-cordon-why]').fill(WHY);
      await settled(page);
      await photograph(page.locator('[data-cordon-ask]'), path.join(OUT, `cordon-why-${theme}.png`));
      await ask.getByRole('button', { name: 'Cordon', exact: true }).click();
      await expectVisible(cordon.and(page.locator('[data-cordon="on"]')), 'sent, the store is cordoned');
      if (!fs.existsSync(file)) throw new Refused(`the popover put the cordon once the api answered — ${file} is not there`);
      const put = JSON.parse(fs.readFileSync(file, 'utf8')) as { at: string; by: string; why?: string };
      if (put.why !== WHY) throw new Refused(`the cordon's file holds the why given, "${WHY}" — it holds ${JSON.stringify(put.why)}`);
      await expectVisible(
        cordon.getByText(new RegExp(`^nothing new starts · since .+ by ${put.by}: ${WHY}$`)),
        'and the header says since when, by whom and why',
      );
      await settled(page);
      await photograph(page.locator('header[data-frame-header]'), path.join(OUT, `cordon-on-${theme}.png`));

      const staged = { run: GATED.id, step: 'ship', repo: '/code/app' };
      await page.route('**/api/cordon', (route) =>
        route.request().method() === 'GET' ? route.fulfill({ json: { cordon: put, staged: [staged] } }) : route.fallback(),
      );
      await page.reload({ waitUntil: 'load' });
      await idle(page);
      const named = cordon.locator(`[data-cordon-staged="${staged.run}"]`);
      await expectVisible(named.getByText(`${staged.run} staged`, { exact: true }), 'a landing held with its merge staged is named');
      const title = await named.getAttribute('title');
      const sentence = `${staged.run}'s ship has its merge staged in /code/app (MERGE_HEAD), and its check waits on the lift`;
      if (title !== sentence) throw new Refused(`its sentence is on hover, "${sentence}" — it is "${title}"`);
      await settled(page);
      await photograph(page.locator('header[data-frame-header]'), path.join(OUT, `cordon-staged-${theme}.png`));
      await page.unroute('**/api/cordon');
      await page.reload({ waitUntil: 'load' });
      await idle(page);

      await expectVisible(cordon.and(page.locator('[data-cordon="on"]')), 'read again, the cordon still stands');
      await label.click();
      await expectVisible(cordon.and(page.locator('[data-cordon="off"]')), 'pressed again, it is lifted');
      if (fs.existsSync(file)) throw new Refused(`the switch lifted the cordon once the api answered — ${file} is still there`);
      await expectCount(cordon.locator('[data-cordon-refused]'), 0, 'with no refusal said');
      await expectCount(cordon.locator('[data-cordon-staged]'), 0, 'and no landing named');
    } finally {
      await page.unroute('**/api/cordon');
      fs.rmSync(file, { force: true });
    }
  },
} satisfies PageSpec;

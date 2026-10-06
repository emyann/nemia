import fs from 'node:fs';
import path from 'node:path';
import { photograph, railPlace, themeOf } from '../board.ts';
import { expectVisible, idle, Refused, settled, WAIT_MS, watch } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

export default {
  /**
   * The rail's Settings leads to the store's settings, where Nemia's Semi-auto switch is refused while her folder is not trusted: one 409,
   * shown in the api's words, which name what trusts it; the switch stays off, and no level is written. Its one refusal is the point, so
   * its page counts exactly it.
   */
  name: 'nemia-untrusted',
  route: '/settings',
  expect: async (page) => {
    const levelFile = path.join(store!, 'nemia', 'level.json');
    const refused = await page.context().newPage();
    try {
      const { problems } = watch(refused);
      await refused.goto(new URL('/', page.url()).href, { waitUntil: 'load' });
      await idle(refused);
      await railPlace(refused, 'Settings').click();
      await refused.waitForURL((url) => url.pathname === '/settings', { timeout: WAIT_MS });
      await idle(refused);
      await expectVisible(refused.getByRole('heading', { level: 1, name: 'Settings' }), 'the rail leads to the Settings page');
      const section = refused.locator('[data-nemia-section]');
      await expectVisible(section.locator('[data-nemia-session][data-state="off"]'), 'her session is off, no level ever set');
      const [answered] = await Promise.all([
        refused.waitForResponse((r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === '/api/level', {
          timeout: WAIT_MS,
        }),
        section.locator('[data-nemia-switch]').click(),
      ]);
      const { error } = (await answered.json()) as { error?: string };
      if (answered.status() !== 409 || !error?.includes('is not trusted'))
        throw new Refused(`the api refuses Semi-auto while her folder is untrusted — it answered ${answered.status()}: ${error}`);
      const shown = section.locator('[data-nemia-refused]');
      await expectVisible(shown, 'the refusal is shown');
      if (!(await shown.textContent())?.includes(error))
        throw new Refused(`in the api's words — it says ${JSON.stringify(await shown.textContent())}`);
      await expectVisible(section.locator('[data-nemia-level="manual"]'), 'her level stays Manual');
      if (await section.getByRole('switch', { name: 'Semi-auto', exact: true }).isChecked()) throw new Refused('the switch stays off');
      if (fs.existsSync(levelFile)) throw new Refused(`no level is written — ${levelFile} is there`);
      await settled(refused);
      await photograph(refused, path.join(OUT, `nemia-untrusted-refused-${await themeOf(refused)}.png`));
      await idle(refused);
      const expected = `request answered 409: PUT ${answered.url()}`;
      const seen = problems();
      const others = seen.filter(
        (p) => p !== expected && !/^console error: Failed to load resource: the server responded with a status of 409\b/.test(p),
      );
      if (!seen.includes(expected) || others.length)
        throw new Refused(
          `the refused page saw its one refusal as the browser reports it (its answer, and the line Chromium writes to the console for one) and nothing else — it saw:\n    ${seen.join('\n    ')}`,
        );
    } finally {
      await refused.close();
      fs.rmSync(levelFile, { force: true });
    }
  },
} satisfies PageSpec;

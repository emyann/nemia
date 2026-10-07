import fs from 'node:fs';
import path from 'node:path';
import { photograph, pickLevel, railPlace, themeOf } from '../board.ts';
import { expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

export default {
  /**
   * The rail's Settings leads to the store's settings, where her folder is not trusted: the line that trusts it is shown, to copy, before
   * she is turned on; a pick of Semi-auto is written all the same, a 200 that names that line, and her session reads waiting on the
   * person's trust, with the line still shown. A pick of Manual takes it back, and the page removes the level file it wrote.
   */
  name: 'nemia-untrusted',
  route: '/settings',
  expect: async (page) => {
    const levelFile = path.join(store!, 'nemia', 'level.json');
    try {
      await page.goto(new URL('/', page.url()).href, { waitUntil: 'load' });
      await idle(page);
      await railPlace(page, 'Settings').click();
      await page.waitForURL((url) => url.pathname === '/settings', { timeout: WAIT_MS });
      await idle(page);
      await expectVisible(page.getByRole('heading', { level: 1, name: 'Settings' }), 'the rail leads to the Settings page');
      const section = page.locator('[data-nemia-section]');
      await expectVisible(section.locator('[data-nemia-session][data-state="off"]'), 'her session is off, no level ever set');
      const trustLine = section.locator('[data-nemia-trust]');
      await expectVisible(trustLine, 'the line that trusts her folder is shown before she is turned on');
      const [answered] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === '/api/level', { timeout: WAIT_MS }),
        pickLevel(page, section.locator('[data-nemia-pick]'), 'Semi-auto'),
      ]);
      const now = (await answered.json()) as { level?: string; trust?: string | null };
      if (answered.status() !== 200 || now.level !== 'semi-auto' || typeof now.trust !== 'string')
        throw new Refused(
          `Semi-auto is written while her folder is untrusted, naming what trusts it — ${answered.status()}: ${JSON.stringify(now)}`,
        );
      await idle(page);
      await expectVisible(section.locator('[data-nemia-level="semi-auto"]'), 'her level reads Semi-auto');
      await expectVisible(section.locator('[data-nemia-session][data-state="untrusted"]'), 'her session waits on the trust');
      await expectVisible(section.getByText('Waiting on your trust'), 'said in words');
      const code = section.locator('[data-nemia-session] [data-nemia-trust] code');
      if ((await code.textContent()) !== now.trust)
        throw new Refused(`the line shown is the api's — it shows ${JSON.stringify(await code.textContent())}, the api said ${now.trust}`);
      if (!fs.existsSync(levelFile)) throw new Refused(`her level is written — ${levelFile} is not there`);
      await settled(page);
      await photograph(page, path.join(OUT, `nemia-untrusted-waiting-${await themeOf(page)}.png`), { fullPage: true });
      const [back] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === '/api/level', { timeout: WAIT_MS }),
        pickLevel(page, section.locator('[data-nemia-pick]'), 'Manual'),
      ]);
      if (back.status() !== 200) throw new Refused(`a pick of Manual takes it back — the api answered ${back.status()}`);
      await idle(page);
      await expectVisible(section.locator('[data-nemia-session][data-state="off"]'), 'and her session reads off');
    } finally {
      fs.rmSync(levelFile, { force: true });
    }
  },
} satisfies PageSpec;

import fs from 'node:fs';
import path from 'node:path';
import { photograph, themeOf } from '../board.ts';
import { expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** Where the factories are read. */
const isFactories = (url: URL) => url.pathname === '/api/factories';

export default {
  /**
   * The Factories with no factory, the factories read as none: beside how to make one, Nemia off is offered Turn Nemia on, with the line
   * that does it from the command line. Pressed, it writes Semi-auto, one act, and the card says she is on, her session waiting on her
   * folder's trust with the line that trusts it. The page takes her level back to Manual and removes the level file it wrote.
   */
  name: 'nemia-turn-on',
  route: '/',
  expect: async (page) => {
    const levelFile = path.join(store!, 'nemia', 'level.json');
    await page.route(isFactories, (route) => route.fulfill({ json: [] }));
    try {
      await page.goto(new URL('/', page.url()).href, { waitUntil: 'load' });
      await idle(page);
      await expectVisible(page.getByText('No factory yet'), 'no factory read');
      const off = page.locator('[data-nemia-off]');
      await expectVisible(off, 'Nemia off is offered to be turned on');
      if ((await off.locator('code').textContent()) !== 'nemia level semi-auto')
        throw new Refused(`beside the command line that does it — it shows ${JSON.stringify(await off.locator('code').textContent())}`);
      await settled(page);
      await photograph(page, path.join(OUT, `nemia-turn-on-off-${await themeOf(page)}.png`));
      const [answered] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === '/api/level', { timeout: WAIT_MS }),
        off.locator('[data-nemia-turn-on]').click(),
      ]);
      const asked = answered.request().postDataJSON() as unknown;
      if (JSON.stringify(asked) !== JSON.stringify({ level: 'semi-auto' }))
        throw new Refused(`Turn Nemia on asks Semi-auto and nothing else — it asked ${JSON.stringify(asked)}`);
      if (answered.status() !== 200)
        throw new Refused(`and it is written — the api answered ${answered.status()}: ${await answered.text()}`);
      await idle(page);
      const on = page.locator('[data-nemia-on][data-state="untrusted"]');
      await expectVisible(on, 'the card says she is on, her session waiting on her folder trusted');
      await expectVisible(on.locator('[data-nemia-trust] code'), 'with the line that trusts it');
      if (await page.locator('[data-nemia-turn-on]').count()) throw new Refused('once on, Turn Nemia on is offered no more');
      if (!fs.existsSync(levelFile)) throw new Refused(`her level is written — ${levelFile} is not there`);
      await settled(page);
      await photograph(page, path.join(OUT, `nemia-turn-on-on-${await themeOf(page)}.png`));
      const back = await page.request.put(new URL('/api/level', page.url()).href, { data: { level: 'manual' } });
      if (back.status() !== 200) throw new Refused(`her level is taken back to Manual — the api answered ${back.status()}`);
    } finally {
      await page.unroute(isFactories);
      fs.rmSync(levelFile, { force: true });
    }
  },
} satisfies PageSpec;

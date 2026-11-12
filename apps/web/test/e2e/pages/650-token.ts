import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { BrowserContext, Page } from 'playwright';
import { photograph, themeOf, topBarOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled, WAIT_MS, watch } from '../checks.ts';
import { serveExposed } from '../served.ts';
import type { PageSpec } from '../visit.ts';
import { apiEnv, OUT, REPO, store } from '../world.ts';

/** The name the page mints its token under, taken back at its end. */
const NAME = 'board-e2e';

/** The cookie the api keeps the token in (`objects`' `TOKEN_COOKIE`). */
const COOKIE = 'nemia-token';

/** A token of the person's minted on the worker's store by `nemia token add`, as its owner mints one at the store's machine. */
function minted(): string {
  const printed = execFileSync(
    process.execPath,
    [path.join(REPO, 'packages', 'agent-orchestrator', 'bin', 'nemia.ts'), 'token', 'add', NAME],
    {
      encoding: 'utf8',
      env: apiEnv,
      stdio: 'pipe',
    },
  );
  const token = /^Authorization: Bearer (\S+)$/m.exec(printed)?.[1];
  if (!token) throw new Refused(`nemia token add prints the token it mints — it printed:\n${printed}`);
  return token;
}

/** The token field's press, sending what the field holds, and the answer of `POST /api/session` it is sent as. */
async function sent(other: Page, token: string): Promise<number> {
  await other.locator('input[data-token-field]').fill(token);
  const [answered] = await Promise.all([
    other.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/session', { timeout: WAIT_MS }),
    other.getByRole('button', { name: 'Use this token' }).click(),
  ]);
  return answered.status();
}

/** The page's next load, waited for from now; a page closed first leaves it unawaited and refused by nothing. */
const nextLoad = (other: Page): Promise<unknown> => {
  const loaded = other.waitForEvent('load', { timeout: WAIT_MS });
  loaded.catch(() => undefined);
  return loaded;
};

/** The cookie the token is kept in, as the browser holds it, or none. */
const keptIn = async (context: BrowserContext) => (await context.cookies()).find((c) => c.name === COOKIE);

export default {
  /**
   * On a store marked exposed (`WF_EXPOSED=1`), every read asks for a token, and the board shows the token page in place of every page:
   * a field that hides what is pasted, and the press that sends it. A token the store does not keep is refused there and the page stays;
   * one minted by `nemia token add` is kept by the api as an HttpOnly cookie, and the page loads again to the runs. Settings' Forget has
   * the api clear it, and the token page is back. A second seat serves the worker's store marked exposed, in a browser context of its
   * own, so its cookie reaches neither the worker's seat nor another page; the token is removed and the seat stopped at the end. Its
   * 401s are the point, so its page counts exactly those.
   */
  name: 'token',
  route: '/runs',
  expect: async (page) => {
    const dir = path.join(store!, 'person-tokens');
    const before = new Set(fs.existsSync(dir) ? fs.readdirSync(dir) : []);
    const seat = await serveExposed();
    const context = await page
      .context()
      .browser()!
      .newContext({ colorScheme: (await themeOf(page)) as 'light' | 'dark', viewport: { width: 1280, height: 800 } });
    try {
      const token = minted();
      const other = await context.newPage();
      const { problems } = watch(other);
      await other.goto(new URL('/runs', seat.base).href, { waitUntil: 'load' });
      const asked = other.locator('form[data-token-page="token-required"]');
      await expectVisible(asked, 'a store marked exposed asks this browser for a token');
      await expectCount(topBarOf(other), 0, 'in place of every page: no frame is drawn');
      await expectVisible(other.locator('[data-token-said]'), "the api's own words, which say where a token is minted");
      if ((await other.locator('input[data-token-field]').getAttribute('type')) !== 'password')
        throw new Refused('the field hides what is pasted into it (type=password)');
      await settled(other);
      await photograph(other, path.join(OUT, `token-asked-${await themeOf(other)}.png`));

      const refused = await sent(other, 'not-a-token-e2e');
      if (refused !== 401) throw new Refused(`a token the store does not keep is refused 401 — it answered ${refused}`);
      await expectVisible(other.locator('[data-token-refused]'), 'the page says the token was refused');
      await expectVisible(asked, 'and stays');
      if (await keptIn(context)) throw new Refused('a refused token is kept in no cookie');
      await settled(other);
      await photograph(other, path.join(OUT, `token-refused-${await themeOf(other)}.png`));

      const loaded = nextLoad(other);
      const kept = await sent(other, token);
      if (kept !== 200) throw new Refused(`a token of the person's is kept — POST /api/session answered ${kept}`);
      await loaded;
      const cookie = await keptIn(context);
      if (!cookie?.httpOnly || cookie.sameSite !== 'Strict' || cookie.path !== '/')
        throw new Refused(`the api keeps it as an HttpOnly, SameSite=Strict cookie on / — the browser holds ${JSON.stringify(cookie)}`);
      await expectVisible(other.locator('[data-runs-page="loaded"]'), 'the page loads again to the runs, read with the token');
      await expectCount(other.locator('[data-token-page]'), 0, 'and asks for no token');
      await idle(other);
      await settled(other);
      await photograph(other, path.join(OUT, `token-kept-${await themeOf(other)}.png`));

      await other.goto(new URL('/settings', seat.base).href, { waitUntil: 'load' });
      await idle(other);
      const forgot = nextLoad(other);
      await other.locator('[data-forget-token-press]').click();
      await forgot;
      await expectVisible(asked, "Settings' Forget clears the token, and the store asks for one again");
      if (await keptIn(context)) throw new Refused('a forgotten token is kept in no cookie');

      const seen = problems();
      const others = seen.filter(
        (p) =>
          !p.startsWith('request answered 401: ') &&
          !/^console error: Failed to load resource: the server responded with a status of 401\b/.test(p),
      );
      if (!seen.some((p) => p === `request answered 401: POST ${new URL('/api/session', seat.base).href}`) || others.length)
        throw new Refused(`the token page saw the store's 401s and nothing else — it saw:\n    ${seen.join('\n    ')}`);
    } finally {
      await context.close();
      await seat.stop();
      if (fs.existsSync(dir)) {
        for (const file of fs.readdirSync(dir)) if (!before.has(file)) fs.rmSync(path.join(dir, file), { force: true });
        if (before.size === 0) fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  },
} satisfies PageSpec;

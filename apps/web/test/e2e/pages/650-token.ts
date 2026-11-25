import path from 'node:path';
import type { BrowserContext, Page } from 'playwright';
import { photograph, themeOf, topBarOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled, WAIT_MS, watch } from '../checks.ts';
import { mintPersonToken, serveExposed } from '../served.ts';
import type { PageSpec } from '../visit.ts';
import { TOKEN_COOKIE as COOKIE } from 'objects';
import { dropStoredKey, OUT, store, storedKeys } from '../world.ts';

/** The name the page mints its token under, taken back at its end. */
const NAME = 'board-e2e';

/** The token field's press, sending what the field holds, and the answer of `POST /api/session` it is sent as. */
async function sent(other: Page, token: string) {
  await other.locator('[data-token-field] input').fill(token);
  const [answered] = await Promise.all([
    other.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/session', { timeout: WAIT_MS }),
    other.getByRole('button', { name: 'Use this token' }).click(),
  ]);
  return answered.status();
}

/** The page's next load, waited for from now; a page closed first leaves it unawaited and refused by nothing. */
const nextLoad = (other: Page) => {
  const loaded = other.waitForEvent('load', { timeout: WAIT_MS });
  loaded.catch(() => undefined);
  return loaded satisfies Promise<unknown>;
};

/** The cookie the token is kept in, as the browser holds it, or none. */
const keptIn = async (context: BrowserContext) => (await context.cookies()).find((c) => c.name === COOKIE);

export default {
  /**
   * On a store marked exposed (`WF_EXPOSED=1`), as on every store, a browser with no token is shown the token page in place of every
   * page: the way in it names (`nemia board link`), a field that hides what is pasted, and the press that sends it. A token the store
   * does not keep is refused there and the page stays; one of the person's minted on the store (`mintPersonToken`, as `nemia token add`
   * mints one) is kept by the api as an HttpOnly cookie, and the page loads again to the runs. Settings' Forget has the api clear it,
   * and the token page is back. A second seat serves the worker's store marked exposed, in a browser context of its own with no cookie,
   * so its cookie reaches neither the worker's seat nor another page; the token is removed and the seat stopped at the end. Its 401s
   * are the point, so its page counts exactly those.
   *
   * Before it, the worker's own seat, which is not marked exposed, opened in a bare browser context: the page there names `nemia open`
   * and shows no token field until the person opens its disclosure, which holds one for someone handed a token.
   */
  name: 'token',
  route: '/runs',
  expect: async (page) => {
    const here = await page
      .context()
      .browser()!
      .newContext({ colorScheme: await themeOf(page), viewport: { width: 1280, height: 800 } });
    try {
      const bare = await here.newPage();
      const { problems } = watch(bare);
      await bare.goto(new URL('/runs', page.url()).href, { waitUntil: 'load' });
      const local = bare.locator('form[data-token-page="token-required"][data-token-here]');
      await expectVisible(local, 'a store served on this machine alone shows a browser with no token the page that names nemia open');
      await expectVisible(
        bare.locator('[data-token-way] code').getByText('nemia open', { exact: true }),
        'the page names the one command that opens the board here signed in, nemia open',
      );
      await expectCount(bare.locator('[data-token-field]'), 0, 'and asks for no token: the field is folded away');
      await settled(bare);
      await photograph(bare, path.join(OUT, `token-local-${await themeOf(bare)}.png`));
      await bare.getByRole('button', { name: 'I was given a token' }).click();
      await expectVisible(bare.locator('[data-token-field]'), 'its disclosure holds the field for someone handed a token');
      const others = problems().filter(
        (p) =>
          !p.startsWith('request answered 401: ') &&
          !/^console error: Failed to load resource: the server responded with a status of 401\b/.test(p),
      );
      if (others.length)
        throw new Refused(`the page on this machine saw the store's 401s and nothing else — it saw:\n    ${others.join('\n    ')}`);
    } finally {
      await here.close();
    }

    const before = new Set(storedKeys('/registry/persontokens/'));
    const seat = await serveExposed();
    const context = await page
      .context()
      .browser()!
      .newContext({ colorScheme: await themeOf(page), viewport: { width: 1280, height: 800 } });
    try {
      const token = mintPersonToken(store!, NAME);
      const other = await context.newPage();
      const { problems } = watch(other);
      await other.goto(new URL('/runs', seat.base).href, { waitUntil: 'load' });
      const asked = other.locator('form[data-token-page="token-required"]');
      await expectVisible(asked, 'a store marked exposed asks this browser for a token');
      await expectCount(topBarOf(other), 0, 'in place of every page: no frame is drawn');
      await expectVisible(other.locator('[data-token-said]'), "the api's own words, which say where a token is minted");
      await expectVisible(
        other.locator('[data-token-way] code').getByText('nemia board link', { exact: true }),
        "the page names the way in typed on the store's machine, nemia board link",
      );
      if ((await other.locator('[data-token-field] input').getAttribute('type')) !== 'password')
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
      const section = other.locator('[data-forget-token]');
      await expectVisible(section, "Settings says this browser's token, with a press that forgets it");
      await section.scrollIntoViewIfNeeded();
      await settled(other);
      await photograph(other, path.join(OUT, `token-forget-${await themeOf(other)}.png`));
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
      {
        for (const key of storedKeys('/registry/persontokens/')) if (!before.has(key)) dropStoredKey(key);
      }
    }
  },
} satisfies PageSpec;

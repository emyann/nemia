import path from 'node:path';
import { photograph, sidebarOf, themeOf } from '../board.ts';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled, watch } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The key this browser keeps its favourites under. */
const FAVORITES_KEY = 'nemia:favorites';
/** A run the store does not have. */
const GONE = 'no-such-run';

export default {
  /**
   * A starred run the store no longer has, in a browser of its own, so its star reaches no other page: Favorites says it gone by its id,
   * with no link, and its star takes it off. The one refusal that browser sees is the read of the run that finds none, once: a run gone
   * is not asked for again.
   */
  name: 'favorite-gone',
  route: '/agents',
  expect: async (page) => {
    const browser = page.context().browser();
    if (!browser) throw new Refused('the page has a browser to open another in');
    const theme = (await themeOf(page)) === 'dark' ? 'dark' : 'light';
    const context = await browser.newContext({ colorScheme: theme, viewport: page.viewportSize() ?? { width: 1280, height: 800 } });
    try {
      const other = await context.newPage();
      const { problems } = watch(other);
      await other.goto(page.url(), { waitUntil: 'load' });
      await idle(other);
      const favorites = sidebarOf(other).locator('[data-favorites]');
      await expectVisible(favorites.getByText('Nothing starred yet.'), 'a browser of its own keeps no favourite');
      if (problems().length)
        throw new Refused(`with nothing starred the page saw nothing wrong — it saw:\n    ${problems().join('\n    ')}`);

      const kept = JSON.stringify([{ kind: 'run', run: GONE }]);
      await other.evaluate(([key, value]) => localStorage.setItem(key, value), [FAVORITES_KEY, kept] as const);
      await other.reload({ waitUntil: 'load' });
      await idle(other);
      await expectTexts(
        favorites.locator('li[data-gone]'),
        [`${GONE}gone`],
        'a starred run the store no longer has is said gone, by its id',
      );
      await expectCount(favorites.getByRole('link'), 0, 'and links nowhere');
      await settled(other);
      await photograph(other, path.join(OUT, `favorite-gone-row-${theme}.png`));

      const refused = `request answered 404: GET ${new URL(`/api/runs/${GONE}`, page.url()).href}`;
      const seen = problems();
      const others = seen.filter(
        (p) => p !== refused && !/^console error: Failed to load resource: the server responded with a status of 404\b/.test(p),
      );
      if (seen.filter((p) => p === refused).length !== 1 || others.length)
        throw new Refused(`the page saw the read of a run gone, once, and nothing else — it saw:\n    ${seen.join('\n    ')}`);

      await favorites.getByRole('button', { name: `Unstar ${GONE}`, exact: true }).click();
      await expectVisible(favorites.getByText('Nothing starred yet.'), 'its star takes it off');
    } finally {
      await context.close();
    }
  },
} satisfies PageSpec;

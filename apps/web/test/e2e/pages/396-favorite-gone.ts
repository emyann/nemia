import { themeOf } from '../board.ts';
import { idle, Refused, watch } from '../checks.ts';
import type { PageSpec } from '../visit.ts';

/** The key this browser keeps its favourites under. */
const FAVORITES_KEY = 'nemia:favorites';
/** A run the store does not have. */
const GONE = 'no-such-run';

export default {
  /**
   * A starred run the store no longer has, in a browser of its own, so its star reaches no other page: the frame lists no favourite, so
   * nothing reads the run, and the page sees no refusal and nothing wrong.
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
      const kept = JSON.stringify([{ kind: 'run', run: GONE }]);
      await other.evaluate(([key, value]) => localStorage.setItem(key, value), [FAVORITES_KEY, kept] as const);
      await other.reload({ waitUntil: 'load' });
      await idle(other);
      const seen = problems();
      if (seen.length) throw new Refused(`a run gone, starred, reads nothing on the frame — the page saw:\n    ${seen.join('\n    ')}`);
    } finally {
      await context.close();
    }
  },
} satisfies PageSpec;

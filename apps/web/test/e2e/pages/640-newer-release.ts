import path from 'node:path';
import { photograph, themeOf, topBarOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled, watch } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The release the routed version answer says is out, newer than any the e2e's checkout runs. */
const NEWER = '99.0.0';

export default {
  /**
   * The frame says a newer release is out, and where to upgrade, where the api's version answer says one is (`latest.newer`):
   * under the top bar, on every page. The e2e's api runs from a checkout and reads no release, so the runner's page shows no line; a
   * second page reads the api's own answer with `latest` added, as an archive install whose check found a newer one answers it.
   */
  name: 'newer-release',
  route: '/runs',
  expect: async (page) => {
    await idle(page);
    await expectCount(page.locator('[data-newer-release]'), 0, 'an api that read no newer release: the frame says none');
    const other = await page.context().newPage();
    try {
      const { problems } = watch(other);
      await other.route('**/api/version', async (route) => {
        const response = await route.fetch();
        const served = (await response.json()) as Record<string, unknown>;
        await route.fulfill({ response, json: { ...served, latest: { version: NEWER, newer: true } } });
      });
      await other.goto(new URL('/runs', page.url()).href, { waitUntil: 'load' });
      await idle(other);
      const line = other.locator(`[data-newer-release="${NEWER}"]`);
      await expectVisible(line, 'the frame says the newer release');
      await expectVisible(line.getByText(`nemia ${NEWER} is out`), 'naming the release that is out');
      const bar = await topBarOf(other).boundingBox();
      const box = await line.boundingBox();
      if (!bar || !box || box.y < bar.y + bar.height - 1)
        throw new Refused(`the line stands under the top bar — the bar ends at ${bar && bar.y + bar.height}, the line starts at ${box?.y}`);
      await other.goto(new URL('/settings', page.url()).href, { waitUntil: 'load' });
      await idle(other);
      await expectVisible(other.locator(`[data-newer-release="${NEWER}"]`), 'and on another page');
      await settled(other);
      await photograph(other, path.join(OUT, `newer-release-line-${await themeOf(other)}.png`));
      const seen = problems();
      if (seen.length) throw new Refused(`the page with a newer release saw nothing wrong — it saw:\n    ${seen.join('\n    ')}`);
    } finally {
      await other.close();
    }
  },
} satisfies PageSpec;

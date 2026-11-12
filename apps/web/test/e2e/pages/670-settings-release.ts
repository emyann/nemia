import path from 'node:path';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled, watch } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The release the routed version answer says is out, newer than any the e2e's checkout runs, and its tag. */
const NEWER = '99.0.0';
const TAG = `v${NEWER}`;

/** The release the routed upgrades read says going back would go to, refused by the store's floor. */
const PREVIOUS = 'v0.0.1';

export default {
  /**
   * Settings shows the server's release first: the e2e's api runs from a checkout, reads no newer release and has none older installed,
   * so the section says the checkout and offers neither Upgrade nor Back. A second page reads the api's own answers with a newer release
   * (its tag and notes) and a Back the floor refuses routed in, as an archive install whose check read one answers them: the notes link,
   * the Upgrade press, which asks once before anything is sent — Cancel sends nothing — and Back shown refused with its reason.
   */
  name: 'settings-release',
  route: '/settings',
  expect: async (page) => {
    await idle(page);
    const section = page.locator('[data-server-release]');
    await expectVisible(section, 'Settings shows the server release section');
    await expectVisible(section.locator('[data-server-running]').getByText('run from the checkout'), 'naming the checkout it runs');
    await expectCount(section.locator('[data-upgrade-press]'), 0, 'a checkout that read no newer release: no Upgrade');
    await expectCount(section.locator('[data-back-press]'), 0, 'and no release older installed: no Back');
    const first = await page.locator('article[data-settings] > section').first().getAttribute('data-server-release');
    if (first === null) throw new Refused('the server release is the first section of Settings — another stands before it');
    await photograph(section, path.join(OUT, `settings-release-checkout-${await themeOf(page)}.png`));

    const other = await page.context().newPage();
    try {
      const { problems } = watch(other);
      let started = 0;
      await other.route('**/api/version', async (route) => {
        const response = await route.fetch();
        const served = (await response.json()) as Record<string, unknown>;
        const latest = { version: NEWER, newer: true, tag: TAG, notes: `https://example.com/releases/${TAG}` };
        await route.fulfill({ response, json: { ...served, latest } });
      });
      await other.route('**/api/upgrades', async (route) => {
        if (route.request().method() !== 'GET') {
          started += 1;
          await route.abort();
          return;
        }
        const previous = { tag: PREVIOUS, refused: `the store was written by a newer release than ${PREVIOUS}` };
        await route.fulfill({ json: { previous, last: null } });
      });
      await other.goto(new URL('/settings', page.url()).href, { waitUntil: 'load' });
      await idle(other);
      const offered = other.locator('[data-server-release]');
      await expectVisible(offered.locator(`[data-server-newer="${NEWER}"]`), 'the newer release is said');
      const notes = offered.locator('a[data-server-notes]');
      await expectVisible(notes, 'with the link to its notes');
      if ((await notes.getAttribute('href')) !== `https://example.com/releases/${TAG}`)
        throw new Refused(`the notes link goes where the release check read — it goes to ${await notes.getAttribute('href')}`);
      const upgrade = offered.locator('[data-upgrade-press]');
      await expectVisible(upgrade.getByText(`Upgrade to ${TAG}`), 'Upgrade names the tag it goes to');
      const back = offered.locator('[data-back-press="refused"]');
      await expectVisible(back, 'Back is shown refused');
      if (!(await back.isDisabled())) throw new Refused('a Back the floor refuses takes no press');
      await expectVisible(offered.locator('[data-back-refused]'), "with the floor's reason under it");
      await upgrade.click();
      const confirm = offered.locator('[data-upgrade-confirm="upgrade"]');
      await expectVisible(confirm, 'Upgrade asks once before anything is sent');
      await settled(other);
      await photograph(offered, path.join(OUT, `settings-release-offered-${await themeOf(other)}.png`));
      await confirm.getByRole('button', { name: 'Cancel' }).click();
      await expectCount(confirm, 0, 'Cancel closes the ask');
      if (started !== 0) throw new Refused(`nothing is sent before the ask is confirmed — ${started} starts were sent`);
      const seen = problems();
      if (seen.length) throw new Refused(`the page with a newer release saw nothing wrong — it saw:\n    ${seen.join('\n    ')}`);
    } finally {
      await other.close();
    }
  },
} satisfies PageSpec;

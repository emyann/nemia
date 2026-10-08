import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled } from '../checks.ts';
import { FACTORIES } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The factory the page files, made from a template, and takes back at its end. */
const SHAPED = 'shaped';
/** The template it is made from, as `nemia factory apply` writes it into the factory's file: a newer version than its tree was applied at. */
const TEMPLATE = { source: '/drafts/team', version: 'v2', params: { reviewers: 2, gated: true, branch: 'main' } };
/** What the daemon last wrote of it: its tree applied at v1, and the drift that leaves it not Applied. */
const STATUS = {
  version: 'v1',
  digest: 'sha256:e2e',
  params: TEMPLATE.params,
  conditions: [
    {
      type: 'Applied',
      status: 'False',
      reason: 'VersionDrift',
      message: "the template is at v2, and the factory's tree was applied at v1",
    },
    { type: 'ConflictsPending', status: 'False', reason: 'NoConflicts', message: 'no file of the tree waits on a merge' },
  ],
};

/** Go to the floor of the factory `name`, read again. */
async function floorOf(page: Page, name: string): Promise<void> {
  await page.goto(new URL(`/factories/${name}`, page.url()).href, { waitUntil: 'load' });
  await idle(page);
}

export default {
  /**
   * A factory made from a template shows it above its floor, read-only: where it is, the version wanted and the one its tree was applied
   * at, each parameter, and each condition, the one amiss in the destructive colour; the floor keeps the rest of the frame. A factory made
   * from none shows no template. Photographed.
   */
  name: 'factory-template',
  route: '/',
  expect: async (page) => {
    const file = path.join(store!, 'factories', `${SHAPED}.json`);
    const folder = path.join(store!, 'factories', SHAPED);
    try {
      fs.writeFileSync(file, `${JSON.stringify({ repos: [path.join(store!, 'checkout')], template: TEMPLATE }, null, 2)}\n`);
      fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(path.join(folder, 'status.json'), `${JSON.stringify(STATUS, null, 2)}\n`);
      await floorOf(page, SHAPED);
      const card = page.locator(`[data-template="${TEMPLATE.source}"]`);
      await expectVisible(card.getByText('Template', { exact: true }), 'the templated factory shows its template above the floor');
      await expectVisible(card.locator('[data-template-version]', { hasText: 'v2' }), 'with the version wanted');
      await expectVisible(card.locator('[data-template-applied="v1"]'), 'and the version its tree was applied at');
      await expectVisible(card.locator('[data-param="reviewers"]', { hasText: '2' }), 'each parameter given');
      await expectVisible(
        card.locator('[data-condition="Applied"][data-condition-status="False"][data-amiss] [data-variant="destructive"]'),
        'Applied False is amiss, in the destructive colour',
      );
      await expectVisible(card.getByText(STATUS.conditions[0].message), 'with what it says');
      await expectVisible(
        card.locator('[data-condition="ConflictsPending"]:not([data-amiss]) [data-variant="secondary"]'),
        'no conflict pending is as it should be',
      );
      await expectCount(card.locator('button, input, textarea'), 0, 'read-only: nothing to press or type in');
      const below = await page.locator('[data-factory-settings-link]').boundingBox();
      const shown = await card.boundingBox();
      if (!below || !shown || shown.y + shown.height > below.y)
        throw new Refused(
          `the template sits above the floor's header — it ends at ${shown ? shown.y + shown.height : '?'}, the header at ${below?.y}`,
        );
      await settled(page);
      await photograph(page, path.join(OUT, `factory-template-card-${await themeOf(page)}.png`));
      await floorOf(page, FACTORIES.hiring.name);
      await expectCount(page.locator('[data-template]'), 0, 'a factory made from no template shows none');
    } finally {
      fs.rmSync(file, { force: true });
      fs.rmSync(folder, { recursive: true, force: true });
    }
  },
} satisfies PageSpec;

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
/** The template it is made from, as `nemia factory apply` writes it into its file. */
const TEMPLATE = { source: '/drafts/team', version: '0.1.0', params: { reviewers: 2, gated: true, branch: 'main' } };
/** ConflictsPending as the daemon writes it while no upgrade is under way (`NO_CONFLICTS`). */
const NO_UPGRADE = {
  type: 'ConflictsPending',
  status: 'False',
  reason: 'NoUpgrade',
  message: 'No upgrade is under way, so no change waits to be merged.',
};
/** Applied as the daemon writes it once the base holds the template: rendered, at the version the factory's file names. */
const RENDERED = {
  type: 'Applied',
  status: 'True',
  reason: 'Rendered',
  message: `The base holds ${TEMPLATE.source} at ${TEMPLATE.version}; the tree is yours to change.`,
};
/** Applied as the daemon writes it once the template's folder moved on to a version the factory was not applied at. */
const DRIFTED = {
  type: 'Applied',
  status: 'False',
  reason: 'VersionDrift',
  message:
    `The template is at version 0.2.0, and ${SHAPED} was applied at ${TEMPLATE.version}: its base and tree are left as they are until ` +
    `upgrades come. Put the template back at ${TEMPLATE.version}, or apply it again under another name.`,
};
/** What the daemon last wrote of the factory, with the conditions `applied` gives. */
const statusOf = (applied: typeof RENDERED) => ({
  version: TEMPLATE.version,
  digest: 'sha256:e2e',
  params: TEMPLATE.params,
  conditions: [applied, NO_UPGRADE],
});

/** Go to the floor of the factory `name`, read again. */
async function floorOf(page: Page, name: string): Promise<void> {
  await page.goto(new URL(`/factories/${name}`, page.url()).href, { waitUntil: 'load' });
  await idle(page);
}

/** Photograph the floor `page` shows, as `what`, once it has settled. */
async function pictured(page: Page, what: string): Promise<void> {
  await settled(page);
  await photograph(page, path.join(OUT, `factory-template-${what}-${await themeOf(page)}.png`));
}

export default {
  /**
   * A factory made from a template shows it above its floor, read-only: where it is, the version wanted and the one its tree was applied
   * at, each parameter, and each condition the daemon wrote, in its words, the one amiss in the destructive colour; the floor keeps the
   * rest of the frame. Before the daemon renders it, the card says so and shows no condition; rendered, Applied is True; drifted, False. A
   * factory made from none shows no template. Each state photographed.
   */
  name: 'factory-template',
  route: '/',
  expect: async (page) => {
    const file = path.join(store!, 'factories', `${SHAPED}.json`);
    const folder = path.join(store!, 'factories', SHAPED);
    const card = page.locator(`[data-template="${TEMPLATE.source}"]`);
    const writeStatus = (applied: typeof RENDERED) =>
      fs.writeFileSync(path.join(folder, 'status.json'), `${JSON.stringify(statusOf(applied), null, 2)}\n`);
    try {
      fs.writeFileSync(file, `${JSON.stringify({ repos: [path.join(store!, 'checkout')], template: TEMPLATE }, null, 2)}\n`);
      await floorOf(page, SHAPED);
      await expectVisible(card.getByText('Template', { exact: true }), 'the templated factory shows its template above the floor');
      await expectVisible(card.locator('[data-template-version]', { hasText: TEMPLATE.version }), 'with the version wanted');
      await expectVisible(
        card.locator('[data-template-applied=""]', { hasText: 'not rendered yet: the daemon renders its tree on its next pass' }),
        'before the daemon renders it, the card says its tree is not rendered yet',
      );
      await expectCount(card.locator('[data-condition]'), 0, 'and shows no condition, since the daemon has written none');
      await expectVisible(card.locator('[data-param="reviewers"]', { hasText: '2' }), 'each parameter given');
      await expectCount(card.locator('button, input, textarea'), 0, 'read-only: nothing to press or type in');
      const below = await page.locator('[data-factory-settings-link]').boundingBox();
      const shown = await card.boundingBox();
      if (!below || !shown || shown.y + shown.height > below.y)
        throw new Refused(
          `the template sits above the floor's header — it ends at ${shown ? shown.y + shown.height : '?'}, the header at ${below?.y}`,
        );
      await pictured(page, 'unrendered');

      fs.mkdirSync(folder, { recursive: true });
      writeStatus(RENDERED);
      await floorOf(page, SHAPED);
      await expectVisible(card.locator(`[data-template-applied="${TEMPLATE.version}"]`), 'rendered, the version its tree was applied at');
      await expectVisible(
        card.locator('[data-condition="Applied"][data-condition-status="True"]:not([data-amiss]) [data-variant="secondary"]'),
        'Applied True is as it should be',
      );
      await expectVisible(card.getByText(RENDERED.message), "in the daemon's words");
      await expectVisible(
        card.locator('[data-condition="ConflictsPending"]:not([data-amiss]) [data-variant="secondary"]'),
        'no upgrade under way is as it should be',
      );
      await expectVisible(card.getByText(NO_UPGRADE.message), "in the daemon's words too");
      await pictured(page, 'applied');

      writeStatus(DRIFTED);
      await floorOf(page, SHAPED);
      await expectVisible(
        card.locator('[data-condition="Applied"][data-condition-status="False"][data-amiss] [data-variant="destructive"]'),
        'Applied False, the template drifted, is amiss, in the destructive colour',
      );
      await expectVisible(card.getByText(DRIFTED.message), 'with what the daemon says to do');
      await pictured(page, 'drift');

      await floorOf(page, FACTORIES.hiring.name);
      await expectCount(page.locator('[data-template]'), 0, 'a factory made from no template shows none');
    } finally {
      fs.rmSync(file, { force: true });
      fs.rmSync(folder, { recursive: true, force: true });
    }
  },
} satisfies PageSpec;

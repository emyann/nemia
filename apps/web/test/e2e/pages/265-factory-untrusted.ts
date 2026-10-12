import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import type { Factory } from '../../../src/lib/api/factories.ts';
import { barValue } from '../../../src/lib/bar.ts';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled } from '../checks.ts';
import { FACTORIES, FAKE } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The factory the page gives an untrusted place: one that names only a folder in the seed. */
const FACTORY = FACTORIES.bare;
/** Its settings alone, no bar over them. */
const ALONE = `/factories/${FACTORY}/settings`;
/** Its settings, with its bar open beside them. */
const SETTINGS = `/factories/${FACTORY}/settings?bar=${encodeURIComponent(barValue({ kind: 'factory', factory: FACTORY }))}`;
/** The run one of whose steps was denied calls, and its page. */
const RUN = `/runs/${FAKE.id}`;

/** Goes to `to` in this tab and waits for its reads. */
async function visit(page: Page, to: string): Promise<void> {
  await page.goto(new URL(to, page.url()).href, { waitUntil: 'load' });
  await idle(page);
}

export default {
  /**
   * A factory one of whose places no harness trusts. The page files the seeded run's repository, where a step was denied two calls, as
   * the place of a factory, which the seed's trust does not cover: the factory's settings, pictured with no bar over them, and then
   * its bar, each say the place and the line that trusts it as the api answers it, and the run's denied row names the place as the
   * likely cause. Once the harness's file trusts the place, none of the three says anything. The factory's file and the harness's are
   * put back.
   */
  name: 'factory-untrusted',
  route: SETTINGS,
  expect: async (page) => {
    const file = path.join(store!, 'factories', `${FACTORY}.json`);
    const config = path.join(store!, 'claude', '.claude.json');
    const place = path.join(store!, 'hkb-v2');
    const [filed, trusts] = [fs.readFileSync(file, 'utf8'), fs.readFileSync(config, 'utf8')];
    const caution = page.locator(`article[data-factory-settings="${FACTORY}"] [data-untrusted="${FACTORY}"]`);
    const inBar = page.locator(`[data-factory-bar="${FACTORY}"] [data-untrusted="${FACTORY}"]`);
    const denied = page.locator(`#step-${FAKE.refused} [data-fact="denied"]`);
    try {
      fs.writeFileSync(file, JSON.stringify({ repos: [place] }, null, 2));
      await visit(page, ALONE);
      const answered = (await (await page.request.get(new URL('/api/factories', page.url()).href)).json()) as Factory[];
      const factory = answered.find((one) => one.name === FACTORY);
      if (factory?.untrusted.length !== 1 || factory.untrusted[0].place !== place)
        throw new Refused(`the api says ${place} is the one untrusted place of ${FACTORY} — ${JSON.stringify(factory?.untrusted)}`);
      const { trust } = factory.commands;
      await expectVisible(caution.locator(`[data-untrusted-place="${place}"]`), "the factory's settings say the place that is not trusted");
      await expectVisible(caution.getByText(factory.untrusted[0].withheld), 'and what is withheld there, in the words the api gave');
      await expectTexts(caution.locator('[data-trust-command] code'), [trust], "with the line that trusts it, the api's");
      await settled(page);
      await photograph(page, path.join(OUT, `factory-untrusted-settings-${await themeOf(page)}.png`), { fullPage: true });

      await visit(page, SETTINGS);
      await expectVisible(inBar.locator(`[data-untrusted-place="${place}"]`), "the factory's bar says the same place");
      await expectTexts(inBar.locator('[data-trust-command] code'), [trust], 'and the same line');
      await settled(page);
      await photograph(page, path.join(OUT, `factory-untrusted-bar-${await themeOf(page)}.png`), { fullPage: true });

      await visit(page, RUN);
      const cause = denied.locator(`[data-denied-cause="${FACTORY}"]`);
      await expectVisible(cause.getByText(place), `${FAKE.refused}'s denied row names the untrusted place as the likely cause`);
      await expectTexts(cause.locator('code'), [trust], 'with the line that trusts it');
      await cause.scrollIntoViewIfNeeded();
      await settled(page);
      await photograph(page, path.join(OUT, `factory-untrusted-denied-${await themeOf(page)}.png`));

      const held = JSON.parse(trusts) as { projects: Record<string, unknown> };
      fs.writeFileSync(config, JSON.stringify({ projects: { ...held.projects, [place]: { hasTrustDialogAccepted: true } } }, null, 2));
      await visit(page, SETTINGS);
      await expectVisible(page.locator(`[data-factory-bar="${FACTORY}"] [data-runs]`), "trusted, the factory's bar is drawn");
      await expectCount(page.locator('[data-untrusted]'), 0, 'and neither its settings nor its bar says a place is untrusted');
      await visit(page, RUN);
      await expectVisible(denied.locator('[data-denied]'), `${FAKE.refused}'s denied row still names its calls`);
      await expectCount(page.locator('[data-denied-cause]'), 0, 'and names no cause');
    } finally {
      fs.writeFileSync(file, filed);
      fs.writeFileSync(config, trusts);
    }
  },
} satisfies PageSpec;

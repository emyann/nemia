import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled } from '../checks.ts';
import { FACTORIES, FOLDER, WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The card this page files in the factory, to tag and filter. */
const CARD = 'tag-the-cards-by-factory-e2e0';

/** Open `route` of the board `page` shows, and wait for its reads. */
async function open(page: Page, route: string): Promise<void> {
  await page.goto(new URL(route, page.url()).href, { waitUntil: 'load' });
  await idle(page);
}

/** The options of the filter by factory on the page, as it says them. */
const filterOf = (page: Page): Locator => page.locator('[data-factory-filter] select');

export default {
  /**
   * Each item says which factory it is in. On Workflows, `dev` is tagged with the factory that attaches it on the checkout, linked to its
   * floor, and not with `broken`, whose file does not read; on Agents, the agent that factory hires is tagged with it. On Runs, FOLDER's
   * row is tagged with its factory and every other row `default`; the filter offers both with how many, keeps one factory's runs in the
   * page's address, says when it keeps none, and shows every factory's again. On the Inbox, a card filed in the factory is tagged with it,
   * linked, and the filter by `default` leaves it out. The card is taken back.
   */
  name: 'factory-tags',
  route: '/runs',
  expect: async (page) => {
    const factory = FACTORIES.hiring.name;
    const theme = await themeOf(page);
    const shoot = async (what: string) => {
      await settled(page);
      await photograph(page, path.join(OUT, `factory-tags-${what}-${theme}.png`), { fullPage: true });
    };
    const rows = page.locator('li[data-in-flight]');
    const total = await rows.count();
    await expectVisible(
      page.locator(`li a[href="/runs/${FOLDER.id}"] span[data-factory-tag="${factory}"]`),
      `${FOLDER.id}'s row is tagged with the factory it was started in, ${factory}, as text inside the row's link`,
    );
    await expectCount(page.locator('[data-factory-tag="default"]'), total - 1, 'and every other row with the default factory');
    await expectCount(page.locator('li a [data-factory-tag] a, li a a[data-factory-tag]'), 0, 'no tag is a link inside the row');
    await expectTexts(
      filterOf(page).locator('option'),
      [`All factories (${total})`, `default (${total - 1})`, `${factory} (1)`],
      'the filter offers every factory the runs name, with how many, the default first',
    );
    await filterOf(page).selectOption(factory);
    await page.waitForURL((url) => url.searchParams.get('factory') === factory);
    await idle(page);
    await expectCount(rows, 1, `filtered by ${factory}, Runs keeps its one run`);
    await expectVisible(page.locator(`li a[href="/runs/${FOLDER.id}"]`), `and that run is ${FOLDER.id}`);
    await shoot('runs');

    await open(page, '/runs?factory=default');
    await expectCount(rows, total - 1, "the page's address filtered by default keeps every run that names no factory");
    await expectCount(page.locator(`li a[href="/runs/${FOLDER.id}"]`), 0, `and not ${FOLDER.id}`);

    const empty = FACTORIES.others[0];
    await open(page, `/runs?factory=${empty}`);
    await expectCount(rows, 0, `filtered by ${empty}, which holds no run, Runs lists none`);
    const out = page.locator('[data-filtered-out]');
    await expectVisible(out.filter({ hasText: `No run of the factory ${empty}.` }), 'and says so');
    await expectTexts(filterOf(page).locator('option:checked'), [`${empty} (0)`], 'its filter still offers the factory it keeps, at none');
    await out.getByRole('link', { name: "Show every factory's" }).click();
    await page.waitForURL((url) => !url.searchParams.has('factory'));
    await expectCount(rows, total, 'which shows every run again');

    await open(page, '/workflows');
    const dev = page.locator(`section[aria-label="Workflow ${WORKFLOWS.good.name}"]`);
    await expectTexts(
      dev.locator('[data-factory-tag]'),
      [factory],
      `${WORKFLOWS.good.name} is tagged with the factory that attaches it on the checkout, not with ${FACTORIES.broken}, whose file does not read`,
    );
    await expectVisible(dev.locator(`a[data-factory-tag="${factory}"][href="/factories/${factory}"]`), 'its tag linked to the floor');
    await expectCount(page.locator('[data-factory-tag="default"]'), 0, 'and no workflow is tagged with the default factory');
    await shoot('workflows');

    await open(page, '/agents');
    const hired = page.locator(`section[data-agent="${WORKFLOWS.good.agent.name}"][data-from="repo"]`);
    await expectTexts(
      hired.locator('[data-factory-tag]'),
      [factory],
      `${WORKFLOWS.good.agent.name}, hired by ${factory}, is tagged with it`,
    );
    await expectVisible(hired.locator(`a[href="/factories/${factory}"]`), 'linked to its floor');
    await expectCount(
      page.locator('section[data-agent][data-from="yours"] [data-factory-tag]'),
      0,
      'and your agent, hired nowhere, with none',
    );
    await shoot('agents');

    const cardFile = path.join(store!, 'inbox', `${CARD}.md`);
    try {
      fs.writeFileSync(cardFile, `---\nworkflow: ${WORKFLOWS.good.name}\nfactory: ${factory}\n---\nTag the cards by factory\n`);
      await open(page, '/inbox');
      const cards = page.locator('section[aria-label="Cards"] li[data-card]');
      const filed = await cards.count();
      const card = page.locator(`section[aria-label="Cards"] li[data-card="${CARD}"]`);
      await expectVisible(
        card.locator(`a[data-factory-tag="${factory}"][href="/factories/${factory}"]`),
        'the card is tagged with its factory, linked',
      );
      await expectCount(cards.locator('[data-factory-tag="default"]'), filed - 1, 'and every other card with the default factory');
      await expectTexts(
        filterOf(page).locator('option'),
        [`All factories (${filed})`, `default (${filed - 1})`, `${factory} (1)`],
        "the Inbox's filter offers every factory its cards name, with how many",
      );
      await shoot('inbox');
      await filterOf(page).selectOption('default');
      await page.waitForURL((url) => url.searchParams.get('factory') === 'default');
      await expectCount(cards, filed - 1, 'filtered by default, the Inbox keeps every card that names no factory');
      await expectCount(card, 0, 'and not the one filed in the factory');
      if (Number(await page.locator('section[aria-label="Cards"] h2 [data-count]').textContent()) !== filed - 1)
        throw new Refused(`the heading counts the cards the filter keeps, ${filed - 1}`);
    } finally {
      fs.rmSync(cardFile, { force: true });
    }
  },
} satisfies PageSpec;

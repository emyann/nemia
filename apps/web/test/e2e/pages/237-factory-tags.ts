import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
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

export default {
  /**
   * Each item says which factory it is in. On Workflows, `dev` is tagged with the factory that attaches it on the checkout, linked to its
   * floor, and not with `broken`, whose file does not read, and the factory picked in the address keeps it alone, or none and says so; on
   * Agents, the agent that factory hires is tagged with it. On Runs, FOLDER's row says its factory and every other run `default`; the
   * factory picked in the address keeps its runs alone, counted by the api, and each part says when it keeps none. On the
   * Inbox, a card filed in the factory is tagged with it, linked, every other card says it has no factory yet and wears no tag, and
   * `default` picked leaves the tagged one out. The card is taken back.
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
    const runs = page.locator('[data-runs-page] [data-run]');
    await expectVisible(runs.first(), 'Runs draws its runs: a card or a row each');
    const total = await runs.count();
    await expectVisible(
      page.locator(`tr[data-run="${FOLDER.id}"] [data-factory="${factory}"]`, { hasText: factory }),
      `${FOLDER.id}'s row says the factory it was started in, ${factory}, in plain text`,
    );
    await expectCount(page.locator('[data-run] [data-factory="default"]'), total - 1, 'and every other run says the default factory');
    await expectCount(page.locator('[data-run] a[data-factory], [data-run] [data-factory] a'), 0, "no run's factory is a link");
    await open(page, `/runs?factory=${factory}`);
    await expectCount(runs, 1, `with ${factory} picked, Runs keeps its one run`);
    await expectVisible(page.locator(`tr[data-run="${FOLDER.id}"]`), `and that run is ${FOLDER.id}`);
    await expectTexts(
      page.locator('[data-plate-count]'),
      ['0', '0', '1'],
      "and each plate says the factory's own count, as the api filtered it",
    );
    await shoot('runs');

    await open(page, '/runs?factory=default');
    await expectCount(runs, total - 1, "the page's address filtered by default keeps every run that names no factory");
    await expectCount(page.locator(`[data-run="${FOLDER.id}"]`), 0, `and not ${FOLDER.id}`);

    const empty = FACTORIES.others[0];
    await open(page, `/runs?factory=${empty}`);
    await expectCount(runs, 0, `filtered by ${empty}, which holds no run, Runs draws none`);
    await expectTexts(
      page.locator('[data-nothing]'),
      ['Nothing waits on you.', 'Nothing is in flight.', 'No run has finished yet.'],
      'and each part says so, plainly',
    );
    await expectCount(
      page.getByRole('link', { name: "Show every factory's" }),
      0,
      "with no link of its own back: the sidebar's picker does that",
    );

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
    const cards = page.locator('section[aria-label^="Workflow "]');
    const every = await cards.count();
    await open(page, `/workflows?factory=${factory}`);
    await expectCount(cards, 1, `with ${factory} picked, Workflows keeps the one it offers`);
    await expectVisible(dev, `and it is ${WORKFLOWS.good.name}`);
    await open(page, '/workflows?factory=default');
    await expectCount(cards, every, 'with the default factory picked, every workflow, which it offers');
    await open(page, `/workflows?factory=${empty}`);
    await expectCount(cards, 0, `with ${empty} picked, which offers none, Workflows lists none`);
    await expectVisible(page.locator('[data-filtered-out]', { hasText: `No workflow is in the factory ${empty}.` }), 'and says so');
    await page.locator('[data-filtered-out]').getByRole('link', { name: "Show every factory's" }).click();
    await page.waitForURL((url) => url.pathname === '/workflows' && !url.searchParams.has('factory'));
    await expectCount(cards, every, 'which shows every workflow again');

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
      await expectCount(cards.locator('[data-factory-tag="default"]'), 0, 'no card wears the default factory for a tag');
      await expectCount(cards.locator('[data-unassigned]'), filed - 1, 'and every other card says it has no factory yet');
      await shoot('inbox');
      await open(page, '/inbox?factory=default');
      await expectCount(cards, filed - 1, 'with default picked, the Inbox keeps every card that names no factory');
      await expectCount(card, 0, 'and not the one filed in the factory');
      if (Number(await page.locator('section[aria-label="Cards"] h2 [data-count]').textContent()) !== filed - 1)
        throw new Refused(`the heading counts the cards the factory picked keeps, ${filed - 1}`);
    } finally {
      fs.rmSync(cardFile, { force: true });
    }
  },
} satisfies PageSpec;

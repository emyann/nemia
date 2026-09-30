import path from 'node:path';
import type { Page } from 'playwright';
import { photograph, sidebar, themeOf } from '../board.ts';
import { cardOf, showFinished } from '../canvas.ts';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import { FACTORIES, FOLDER, WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The menu's sub-items under the Factories, by the factory each leads to. */
const subItems = (page: Page) => page.locator('[data-sidebar="sidebar"] [data-sidebar="menu-sub"] a[data-sidebar="menu-sub-button"]');

/** The factories FACTORIES seeds, listed as the api lists them: the default first, then the store's by name. */
const LISTED = ['default', FACTORIES.broken, ...FACTORIES.others, FACTORIES.hiring.name, FACTORIES.bare];

export default {
  /**
   * The Factories at `/`: every factory a block on a canvas, the default one first — it holds every run started in no factory — and a file
   * that does not read a block that says why. The menu's Factories lists the first five under it and a button for the rest. A block pressed
   * opens its factory's floor, at `/factories/<name>`, with only its runs on it: FOLDER's, in `hiring`, once finished runs are shown. A name
   * no factory has says so, answered with no 4xx, and leads back. The default block counts its runs as the default floor does, the two
   * read a moment apart: the store the pages leave moves between the themes.
   */
  name: 'factories',
  route: '/',
  expect: async (page) => {
    await sidebar(page);
    const menu = page.locator('[data-sidebar="sidebar"]');
    await expectVisible(
      menu.locator('a[data-sidebar="menu-button"][data-active="true"]', { hasText: 'Factories' }),
      'the menu lights the Factories at /',
    );
    const blocks = page.locator('.react-flow__node a[data-factory]');
    await expectCount(blocks, LISTED.length, 'a block for each factory, the default one among them: it holds runs');
    await expectTexts(
      page.locator('.react-flow__node a[data-factory] > span:first-child'),
      LISTED.map((name) => (name === 'default' ? 'defaultdefault' : name)),
      'the blocks in the order the api lists them, the default one first and badged',
    );
    const block = (name: string) => page.locator(`.react-flow__node a[data-factory="${name}"]`);
    await expectVisible(block('default').locator('[data-offer]', { hasText: /^every workflow · no hires$/ }), 'and offers every workflow');
    const hiring = block(FACTORIES.hiring.name);
    await expectVisible(hiring.locator('[data-runs]', { hasText: /^0 in flight · 1 run$/ }), `${FACTORIES.hiring.name} holds FOLDER's run`);
    await expectVisible(
      hiring.locator('[data-offer]', { hasText: /^1 workflow · 1 hire$/ }),
      `and offers ${WORKFLOWS.good.name}, hiring into ${FACTORIES.hiring.hire}`,
    );
    await expectVisible(hiring.getByText('on checkout', { exact: true }), 'and works on the checkout, by its folder');
    await expectVisible(block(FACTORIES.bare).locator('[data-runs]', { hasText: /^No runs yet$/ }), `${FACTORIES.bare} holds none`);
    await expectVisible(
      block(FACTORIES.broken).locator('[data-error]', { hasText: `Its file does not read: ` }),
      `${FACTORIES.broken}'s file names no repository: its block says it does not read`,
    );
    const why = (await block(FACTORIES.broken).locator('[data-error]').getAttribute('title')) ?? '';
    if (!why.includes(`${FACTORIES.broken}.json`) || !why.includes('repos'))
      throw new Refused(`the broken block says which file and why, whole on hover — its title is ${JSON.stringify(why)}`);

    await expectTexts(subItems(page), LISTED.slice(0, 5), 'the menu lists the first five factories under the Factories');
    const more = menu.getByRole('button', { name: 'Show 1 more' });
    await expectVisible(more, 'and a button saying how many more there are');
    await settled(page);
    await photograph(page, path.join(OUT, `factories-canvas-${await themeOf(page)}.png`));
    await more.click();
    await expectTexts(subItems(page), LISTED, 'pressed, the menu lists every factory');
    await expectCount(more, 0, 'and the button is gone');

    await hiring.click();
    await page.waitForURL((url) => url.pathname === `/factories/${FACTORIES.hiring.name}`, { timeout: WAIT_MS });
    await idle(page);
    await expectVisible(
      page.getByRole('heading', { level: 1, name: FACTORIES.hiring.name }),
      `the block opens ${FACTORIES.hiring.name}'s floor, named over it`,
    );
    await expectVisible(
      subItems(page).and(page.locator(`[data-factory="${FACTORIES.hiring.name}"][data-active="true"]`)),
      'its sub-item lit in the menu',
    );
    await expectVisible(
      menu.locator('a[data-sidebar="menu-button"][data-active="true"]', { hasText: 'Factories' }),
      'under the Factories, lit too',
    );
    await showFinished(page);
    await expectCount(
      page.locator('.react-flow__node'),
      1,
      `the floor holds one card, finished runs shown: ${FOLDER.id}, the one run in it`,
    );
    const inFolders = cardOf(page, FOLDER.id).getByText('folders', { exact: true });
    await expectVisible(inFolders, `a folder run's card says folders, and names no repository (${FOLDER.id})`);
    const where = await inFolders.getAttribute('title');
    if (!new RegExp(String.raw`^Its steps work in folders under .+[\\/]runs[\\/]${FOLDER.id}[\\/]work$`).test(where ?? '')) {
      throw new Refused(
        `the card says where its steps work on hover, not in a row of its own, ending in runs/${FOLDER.id}/work — it says ${JSON.stringify(where)}`,
      );
    }
    await settled(page);
    await photograph(page, path.join(OUT, `factories-floor-${await themeOf(page)}.png`));

    await page.goto(new URL('/factories/nope', page.url()).href, { waitUntil: 'load' });
    await idle(page);
    await expectVisible(
      page.locator('[data-no-factory="nope"]', { hasText: 'No factory named nope' }),
      'a name no factory has says so, and the api refuses nothing',
    );
    await settled(page);
    await photograph(page, path.join(OUT, `factories-none-${await themeOf(page)}.png`));
    await page.getByRole('link', { name: 'Go to Factories' }).click();
    await page.waitForURL((url) => url.pathname === '/', { timeout: WAIT_MS });
    await expectCount(blocks, LISTED.length, 'and leads back to the Factories');

    await block('default').click();
    await page.waitForURL((url) => url.pathname === '/factories/default', { timeout: WAIT_MS });
    const tally = page.getByText(/^\d+ in flight · \d+ finished · \d+ to decide · \d+ waiting on you$/);
    await expectVisible(tally, "the default block opens the default factory's floor, which counts its runs");
    const [flying, finished, , waiting] = ((await tally.textContent()) ?? '').match(/\d+/g)!.map(Number);
    await page.locator('nav[aria-label="Factory"]').getByRole('link', { name: 'Factories' }).click();
    await page.waitForURL((url) => url.pathname === '/', { timeout: WAIT_MS });
    await expectVisible(
      block('default').locator('[data-runs]', { hasText: `${flying} in flight · ${waiting} waiting on you · ${flying + finished} runs` }),
      "the header's Factories leads back, and the default block counts its runs as its floor does: in flight, waiting on you, and all",
    );
  },
} satisfies PageSpec;

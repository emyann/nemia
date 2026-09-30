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

/** The factories FACTORIES seeds, listed as the api lists them, by name: the default factory is no block once a factory is filed. */
const LISTED = [FACTORIES.broken, ...FACTORIES.others.slice(0, 2), FACTORIES.hiring.name, FACTORIES.bare, FACTORIES.others[2]];
/** The factory the menu leaves behind 'Show 1 more', last by name. */
const PAST = LISTED[LISTED.length - 1];

export default {
  /**
   * The Factories at `/`: every factory a block on a canvas, and a file that does not read a block that says why; the default factory is
   * none, in the canvas or the menu, once a factory is filed, though it holds runs. The menu's Factories lists the first five under it and
   * a button for the rest; a factory past them, opened by its address, is lit in the menu as a sixth. A block pressed opens its factory's
   * floor, at `/factories/<name>`, with only its runs on it — FOLDER's, in `hiring`, once finished runs are shown — and a start in its
   * header. A name no factory has says so, answered with no 4xx, and leads back. The default factory's floor still answers its address,
   * with no start in its header.
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
    await expectCount(blocks, LISTED.length, 'a block for each factory filed');
    await expectTexts(
      page.locator('.react-flow__node a[data-factory] > span:first-child'),
      LISTED,
      'the blocks in the order the api lists them, by name',
    );
    const block = (name: string) => page.locator(`.react-flow__node a[data-factory="${name}"]`);
    await expectCount(block('default'), 0, 'and none for the default factory, which holds runs, once a factory is filed');
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
    await expectCount(menu.locator('[data-factory="default"]'), 0, 'and no item for the default factory');
    await settled(page);
    await photograph(page, path.join(OUT, `factories-canvas-${await themeOf(page)}.png`));

    await page.goto(new URL(`/factories/${PAST}`, page.url()).href, { waitUntil: 'load' });
    await idle(page);
    await expectTexts(subItems(page), LISTED, `${PAST}'s floor opened by its address, the menu lists it after the first five`);
    await expectVisible(subItems(page).and(page.locator(`[data-factory="${PAST}"][data-active="true"]`)), 'lit');
    await expectCount(menu.getByRole('button', { name: /^Show \d+ more$/ }), 0, 'with no factory left behind the button');
    await page.goto(new URL('/', page.url()).href, { waitUntil: 'load' });
    await idle(page);
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
    const header = page.locator('header');
    await expectVisible(header.getByRole('button', { name: 'Start a run' }), `and ${FACTORIES.hiring.name}'s header offers a start`);
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

    await page.goto(new URL('/factories/default', page.url()).href, { waitUntil: 'load' });
    await idle(page);
    await expectVisible(
      page.getByText(/^\d+ in flight · \d+ finished · \d+ to decide · \d+ waiting on you$/),
      "the default factory's floor answers its address, and counts its runs",
    );
    await expectCount(
      header.getByRole('button', { name: 'Start a run' }),
      0,
      'with no start in its header: a run from a floor names its factory',
    );
    await page.locator('nav[aria-label="Factory"]').getByRole('link', { name: 'Factories' }).click();
    await page.waitForURL((url) => url.pathname === '/', { timeout: WAIT_MS });
    await expectCount(blocks, LISTED.length, "and the header's Factories leads back");
  },
} satisfies PageSpec;

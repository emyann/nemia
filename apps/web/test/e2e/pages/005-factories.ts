import path from 'node:path';
import type { Page } from 'playwright';
import { litOf, photograph, pickerOf, railPlace, sidebar, startOf, themeOf } from '../board.ts';
import { cardOf, showFinished } from '../canvas.ts';
import { expectCount, expectTexts, expectTwoDeep, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import { FACTORIES, FOLDER, WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The factories the open picker lists, by name, in its order. */
const pickedFrom = (page: Page) =>
  page
    .getByRole('listbox')
    .locator('[data-factory]')
    .evaluateAll((items) => items.map((item) => item.getAttribute('data-factory')));

/** Opens the pane's switcher, and refuses unless it lists `names`, in their order, then a new factory to come, which it does not offer. */
async function pickerLists(page: Page, names: readonly string[], assertion: string) {
  await pickerOf(page).locator('button').first().click();
  const last = page.getByRole('option').last();
  await expectVisible(last.getByText('New factory · to come', { exact: true }), `${assertion}: a new factory to come last`);
  if ((await last.getAttribute('aria-disabled')) !== 'true') throw new Refused(`${assertion}: the new factory is not offered yet`);
  const listed = await pickedFrom(page);
  if (listed.join() !== names.join()) throw new Refused(`${assertion}: ${names.join(', ')} — it lists ${listed.join(', ')}`);
}

/** The factories FACTORIES seeds, listed as the api lists them, by name: the default factory is no block once a factory is filed. */
const LISTED = [FACTORIES.broken, ...FACTORIES.others.slice(0, 2), FACTORIES.hiring.name, FACTORIES.bare, FACTORIES.others[2]];

export default {
  /**
   * The Factories at `/`: every factory a block on a canvas, and a file that does not read a block that says why; the default factory is
   * none, in the canvas or the switcher, once a factory is filed, though it holds runs. On a floor the pane's switcher lists every factory,
   * each with its runs in flight, or that its file does not read, then a new factory to come. A block double-clicked opens its factory's
   * floor, at `/factories/<name>`, with only its runs on it — FOLDER's, in `hiring`, once finished runs are shown, its card opened saying
   * it works in folders and naming no repository — its name in the switcher, Factories lit, and a start in the pane. A name no factory
   * has says so, answered with no 4xx, and leads back. The default factory's floor still answers its address, the switcher listing it
   * after the others, its start asking which factory; Factories in the rail leads back.
   */
  name: 'factories',
  route: '/',
  expect: async (page) => {
    await sidebar(page);
    await expectVisible(railPlace(page, 'Factories').and(litOf(page)), 'the rail lights Factories at /');
    await expectCount(page.locator('[data-factory-pane]'), 0, 'and no factory pane, the page being the store’s');
    const blocks = page.locator('.react-flow__node [data-factory]');
    await expectCount(blocks, LISTED.length, 'a block for each factory filed');
    await expectTwoDeep(page, 'the page is two boxes deep at most: a third box is a rule or a gap');
    await expectTexts(
      page.locator('.react-flow__node [data-factory] > span:first-child'),
      LISTED,
      'the blocks in the order the api lists them, by name',
    );
    const block = (name: string) => page.locator(`.react-flow__node [data-factory="${name}"]`);
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
      `${FACTORIES.broken}'s file's volumes are no list: its block says it does not read`,
    );
    const why = (await block(FACTORIES.broken).locator('[data-error]').getAttribute('title')) ?? '';
    if (!why.includes(`${FACTORIES.broken}.json`) || !why.includes('volumes'))
      throw new Refused(`the broken block says which file and why, whole on hover — its title is ${JSON.stringify(why)}`);

    await settled(page);
    await photograph(page, path.join(OUT, `factories-canvas-${await themeOf(page)}.png`));

    await hiring.dblclick();
    await page.waitForURL((url) => url.pathname === `/factories/${FACTORIES.hiring.name}`, { timeout: WAIT_MS });
    await idle(page);
    await sidebar(page);
    await expectVisible(
      railPlace(page, 'Factories').and(litOf(page)),
      `the block opens ${FACTORIES.hiring.name}'s floor, named in the switcher, Factories lit`,
    );
    await pickerLists(page, LISTED, 'the picker lists every factory, the default none');
    const brokenItem = page.getByRole('listbox').locator(`[data-factory="${FACTORIES.broken}"]`);
    await expectVisible(
      brokenItem.getByText('its file does not read', { exact: true }),
      `${FACTORIES.broken}'s item says its file does not read`,
    );
    await expectVisible(
      page
        .getByRole('listbox')
        .locator(`[data-factory="${FACTORIES.hiring.name}"]`)
        .getByText(/^(none|\d+) in flight$/),
      `${FACTORIES.hiring.name}'s item says its runs in flight`,
    );
    await settled(page);
    await photograph(page, path.join(OUT, `factories-picker-${await themeOf(page)}.png`));
    await page.keyboard.press('Escape');
    await expectCount(page.getByRole('listbox'), 0, 'Escape closes the picker');

    await showFinished(page);
    await expectCount(
      page.locator('.react-flow__node'),
      1,
      `the floor holds one card, finished runs shown: ${FOLDER.id}, the one run in it`,
    );
    const folderCard = cardOf(page, FOLDER.id);
    await folderCard.getByRole('button', { name: 'Show steps' }).click();
    const inFolders = folderCard.locator('article[data-size="xl"] [data-works-in="folders"]');
    await expectVisible(inFolders, `a folder run's opened card says it works in folders, and names no repository (${FOLDER.id})`);
    await expectTexts(
      inFolders,
      ['folders'],
      `the folder run's card says folders where a repository run names its repository (${FOLDER.id})`,
    );
    const where = await inFolders.getAttribute('title');
    if (!new RegExp(String.raw`^Its steps work in folders under .+[\\/]runs[\\/]${FOLDER.id}[\\/]work$`).test(where ?? '')) {
      throw new Refused(
        `the opened card says where its steps work on hover, ending in runs/${FOLDER.id}/work — it says ${JSON.stringify(where)}`,
      );
    }
    await folderCard.getByRole('button', { name: 'Hide steps' }).click();
    await expectCount(folderCard.locator('article[data-size="xl"]'), 0, `the folder run's card closes again (${FOLDER.id})`);
    await expectVisible(startOf(page), `and the pane offers a start in ${FACTORIES.hiring.name}`);
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
    await sidebar(page);
    await startOf(page).click();
    await expectVisible(
      page.getByRole('complementary', { name: 'Start a run', exact: true }),
      "the FAB asks which factory: the default factory's floor starts no run",
    );
    await page.getByRole('complementary').getByRole('button', { name: 'Close' }).click();
    await pickerLists(page, [...LISTED, 'default'], 'on its floor, the picker lists the default factory after the others');
    await page.keyboard.press('Escape');
    await railPlace(page, 'Factories').click();
    await page.waitForURL((url) => url.pathname === '/', { timeout: WAIT_MS });
    await expectCount(blocks, LISTED.length, 'and Factories in the rail leads back to every factory');
  },
} satisfies PageSpec;

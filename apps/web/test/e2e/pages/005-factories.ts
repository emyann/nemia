import path from 'node:path';
import type { Page } from 'playwright';
import { litOf, photograph, pick, pickerOf, railPlace, sectionsOf, sidebar, startOf, themeOf } from '../board.ts';
import { cardOf, showFinished } from '../canvas.ts';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import { FACTORIES, FOLDER, WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The factories the open picker lists after All factories, by name, in its order. */
const pickedFrom = (page: Page) =>
  page
    .getByRole('listbox')
    .locator('[data-factory]')
    .evaluateAll((items) => items.map((item) => item.getAttribute('data-factory')));

/** Opens the sidebar's picker, and refuses unless it lists All factories first, then `names`, in their order. */
async function pickerLists(page: Page, names: readonly string[], assertion: string): Promise<void> {
  await pickerOf(page).locator('button').first().click();
  await expectVisible(page.getByRole('option').first().getByText('All factories', { exact: true }), `${assertion}: All factories first`);
  const listed = await pickedFrom(page);
  if (listed.join() !== names.join()) throw new Refused(`${assertion}: ${names.join(', ')} — it lists ${listed.join(', ')}`);
}

/** The factories FACTORIES seeds, listed as the api lists them, by name: the default factory is no block once a factory is filed. */
const LISTED = [FACTORIES.broken, ...FACTORIES.others.slice(0, 2), FACTORIES.hiring.name, FACTORIES.bare, FACTORIES.others[2]];

export default {
  /**
   * The Factories at `/`: every factory a block on a canvas, and a file that does not read a block that says why; the default factory is
   * none, in the canvas or the switcher, once a factory is filed, though it holds runs. The picker lists All factories, then every
   * factory, each with its runs in flight, or that its file does not read. A block double-clicked opens its factory's floor, at
   * `/factories/<name>`, with only its runs on it — FOLDER's, in `hiring`, once finished runs are shown — its name in the picker, Factories
   * lit, and a start in the rail. A name no factory has says so, answered with no 4xx, and leads back. The default factory's floor still
   * answers its address, the picker listing it after the others, its FAB asking which factory; All factories picked there leads to the Overview.
   */
  name: 'factories',
  route: '/',
  expect: async (page) => {
    await sidebar(page);
    await expectVisible(railPlace(page, 'Overview').and(litOf(page)), 'the rail lights Overview at /');
    await expectCount(sectionsOf(page).and(litOf(page)), 0, 'and no list');
    const blocks = page.locator('.react-flow__node [data-factory]');
    await expectCount(blocks, LISTED.length, 'a block for each factory filed');
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
      `${FACTORIES.broken}'s file names no repository: its block says it does not read`,
    );
    const why = (await block(FACTORIES.broken).locator('[data-error]').getAttribute('title')) ?? '';
    if (!why.includes(`${FACTORIES.broken}.json`) || !why.includes('repos'))
      throw new Refused(`the broken block says which file and why, whole on hover — its title is ${JSON.stringify(why)}`);

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
    await expectVisible(startOf(page), `and the rail offers a start in ${FACTORIES.hiring.name}`);
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
    await pick(page, 'All factories');
    await page.waitForURL((url) => url.pathname === '/', { timeout: WAIT_MS });
    await expectCount(blocks, LISTED.length, 'and All factories picked on a floor leads to the Overview');
  },
} satisfies PageSpec;

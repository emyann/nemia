import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { pick, photograph, sectionsOf, sidebar, sidebarOf, startOf, themeOf } from '../board.ts';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import { FACTORIES, FOLDER, WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The factory the page picks. */
const FACTORY = FACTORIES.hiring.name;
/** The key this browser keeps its favourites under. */
const FAVORITES_KEY = 'nemia:favorites';
/** The cookie the sidebar's fold is kept in. */
const FOLD_COOKIE = 'sidebar_state';

/** Goes to `to` in this tab and waits for its reads. */
async function visit(page: Page, to: string): Promise<void> {
  await page.goto(new URL(to, page.url()).href, { waitUntil: 'load' });
  await idle(page);
}

/** Refuses unless the address is `pathname` with `search`, whole. */
async function expectAt(page: Page, pathname: string, search: string, assertion: string): Promise<void> {
  await page.waitForURL((url) => url.pathname === pathname && url.search === search, { timeout: WAIT_MS }).catch(() => undefined);
  const url = new URL(page.url());
  if (url.pathname !== pathname || url.search !== search)
    throw new Refused(`${assertion}: the address is ${pathname}${search} — it is ${url.pathname}${url.search}`);
}

/** Each section's `href`, in its order. */
const hrefsOf = (page: Page) => sectionsOf(page).evaluateAll((links) => links.map((link) => link.getAttribute('href')));

/** The sidebar's own state, `expanded` or `collapsed`, as the provider draws it. */
const foldOf = (page: Page) => page.locator('[data-slot="sidebar"][data-state]').getAttribute('data-state');

/** The header's button that folds the sidebar, or opens its sheet on a narrow screen. */
const trigger = (page: Page): Locator => page.locator('header[data-frame-header]').locator('[data-sidebar="trigger"]');

/**
 * A factory picked on a section's page stays on it with `?factory=`, every section carrying it and the Floor drawn first; a section keeps
 * it, the Floor opens the floor, and All factories on the floor leads Home. A page that is no section's list reads All factories.
 */
async function picks(page: Page): Promise<void> {
  await pick(page, FACTORY);
  await expectAt(page, '/runs', `?factory=${FACTORY}`, `${FACTORY} picked on Runs stays on Runs`);
  await sidebar(page);
  const hrefs = await hrefsOf(page);
  const want = [`/factories/${FACTORY}`, ...['inbox', 'runs', 'workflows'].map((s) => `/${s}?factory=${FACTORY}`)];
  if (hrefs.join() !== want.join())
    throw new Refused(`every section carries ${FACTORY}: ${want.join(', ')} — they are ${hrefs.join(', ')}`);
  await settled(page);
  await photograph(page, path.join(OUT, `sidebar-picked-${await themeOf(page)}.png`));
  await sectionsOf(page).filter({ hasText: 'Workflows' }).click();
  await expectAt(page, '/workflows', `?factory=${FACTORY}`, 'Workflows keeps the factory picked');
  await sidebar(page);
  await sectionsOf(page).filter({ hasText: 'Floor' }).click();
  await expectAt(page, `/factories/${FACTORY}`, '', 'the Floor opens its floor');
  await sidebar(page);
  await pick(page, 'All factories');
  await expectAt(page, '/', '', 'All factories picked on a floor leads Home');
  await sidebar(page);
  await visit(page, `/runs/${FOLDER.id}?factory=${FACTORY}`);
  await sidebar(page);
  await pick(page, FACTORY);
  await expectAt(page, `/factories/${FACTORY}`, '', "picked on a run's page, a factory opens its floor");
}

/**
 * Under All factories, Start a run asks for the factory first; moving through the factories with the keyboard picks none, and pressing one
 * opens the start in it, named in the address.
 */
async function asksItsFactory(page: Page): Promise<void> {
  await visit(page, '/runs');
  await startOf(page).click();
  const bar = page.getByRole('complementary', { name: 'Start a run', exact: true });
  await expectVisible(bar, 'under All factories, Start a run opens the bar asking for the factory');
  await expectAt(page, '/runs', '?bar=start', 'the address names the start in no factory yet with the bare word');
  await expectTexts(
    bar.locator('[data-start-factory] button'),
    [FACTORIES.broken, ...FACTORIES.others.slice(0, 2), FACTORY, FACTORIES.bare, FACTORIES.others[2]],
    'it offers every factory filed, as the api lists them, the default none',
  );
  await expectVisible(bar.locator(`[data-start-factory="${FACTORIES.broken}"] [data-why-not]`), `${FACTORIES.broken} says why it cannot`);
  if (!(await bar.locator(`[data-start-factory="${FACTORIES.broken}"] button`).isDisabled()))
    throw new Refused(`${FACTORIES.broken}, whose file does not read, cannot be picked`);
  await settled(page);
  await photograph(page, path.join(OUT, `sidebar-asking-${await themeOf(page)}.png`));
  const choice = (name: string) => bar.locator(`[data-start-factory="${name}"] button`);
  await choice(FACTORIES.others[0]).focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  if (!(await choice(FACTORY).evaluate((button) => button === document.activeElement)))
    throw new Refused(`Tab moves from ${FACTORIES.others[0]} past ${FACTORIES.others[1]} to ${FACTORY}`);
  await expectAt(page, '/runs', '?bar=start', 'and moving through the factories with the keyboard picks none of them');
  await choice(FACTORY).click();
  await expectVisible(page.getByRole('complementary', { name: `Start a run in ${FACTORY}` }), `picked, the bar starts a run in ${FACTORY}`);
  await expectAt(page, '/runs', `?bar=start%3A${FACTORY}`, `and the address names it start:${FACTORY}`);
  await page.getByRole('complementary').getByRole('button', { name: 'Close' }).click();
  await expectCount(page.getByRole('complementary'), 0, 'Close closes it');
}

/** The fold is kept by this browser: folded, a reload draws it folded; opened, open. */
async function foldKept(page: Page): Promise<void> {
  await trigger(page).click();
  await page.reload({ waitUntil: 'load' });
  await idle(page);
  if ((await foldOf(page)) !== 'collapsed') throw new Refused('folded, the sidebar is drawn folded after a reload');
  await expectCount(sectionsOf(page), 0, 'its sections not drawn');
  await trigger(page).click();
  await page.reload({ waitUntil: 'load' });
  await idle(page);
  if ((await foldOf(page)) !== 'expanded') throw new Refused('opened again, the sidebar is drawn open after a reload');
  const width = (await page.locator('[data-slot="sidebar-container"]').boundingBox())?.width ?? 0;
  if (Math.abs(width - 256) > 1) throw new Refused(`open, the sidebar is 16rem wide, 256px — it is ${width}`);
}

/** The favourites this browser keeps are links: a run to its page, a workflow to its card; none kept says so. */
async function favorites(page: Page): Promise<void> {
  const group = sidebarOf(page).locator('[data-favorites]');
  await expectVisible(group.getByText('Nothing starred yet.'), 'with none kept, the favourites say none is starred yet');
  const kept = [
    { kind: 'run', run: FOLDER.id },
    { kind: 'workflow', from: 'repo', workflow: WORKFLOWS.good.name },
  ];
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [FAVORITES_KEY, JSON.stringify(kept)] as const);
  await page.reload({ waitUntil: 'load' });
  await idle(page);
  const links = group.getByRole('link');
  await expectTexts(links, [FOLDER.title, WORKFLOWS.good.name], 'each favourite kept is a link, a run by its title, in the order kept');
  await settled(page);
  await photograph(page, path.join(OUT, `sidebar-favorites-${await themeOf(page)}.png`));
  await links.filter({ hasText: WORKFLOWS.good.name }).click();
  await expectAt(page, `/workflows/repo/${WORKFLOWS.good.name}`, '', 'a workflow favourite opens its own page');
  await expectVisible(page.locator('h1', { hasText: new RegExp(`^${WORKFLOWS.good.name}$`) }), 'which is titled by its name');
  await links.filter({ hasText: FOLDER.title }).click();
  await expectAt(page, `/runs/${FOLDER.id}`, '', 'a run favourite opens its page');
}

/** On a phone's screen the sheet holds the picker and the sections, and any press in it closes it. */
async function onPhone(page: Page): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
  await visit(page, '/runs');
  await trigger(page).click();
  const sheet = page.getByRole('dialog');
  await expectVisible(sheet.locator('[data-factory-picker]'), "the sheet holds the factory's picker");
  await settled(page);
  await photograph(page, path.join(OUT, `sidebar-narrow-${await themeOf(page)}.png`));
  await sheet.locator('ul[aria-label="Sections"]').getByRole('link', { name: 'Inbox' }).click();
  await expectCount(sheet, 0, 'a section pressed closes the sheet');
  await expectAt(page, '/inbox', '', 'and opens its page');
  await trigger(page).click();
  await expectVisible(sheet, 'the sheet opens again');
  await pick(page, FACTORY);
  await expectAt(page, '/inbox', `?factory=${FACTORY}`, 'a factory picked in the sheet stays on the Inbox');
  await expectCount(sheet, 0, 'and closes the sheet');
  await trigger(page).click();
  await startOf(page).click();
  await expectCount(sheet, 0, 'Start a run pressed closes the sheet');
  await expectVisible(page.getByRole('complementary', { name: `Start a run in ${FACTORY}` }), `and opens the start in ${FACTORY}`);
}

export default {
  /**
   * The sidebar beside the rail: its factory picker, read from the address and written to it, its sections carrying the factory picked
   * and the Floor only with one, its start asking for a factory under All factories, its fold kept across a reload, the favourites this
   * browser keeps, and a sheet on a phone that any press closes. The favourites, the fold's cookie and the window's size are taken back.
   */
  name: 'sidebar',
  route: '/runs',
  expect: async (page) => {
    const size = page.viewportSize();
    try {
      await sidebar(page);
      await picks(page);
      await asksItsFactory(page);
      await foldKept(page);
      await favorites(page);
      await onPhone(page);
    } finally {
      if (size) await page.setViewportSize(size);
      await page.evaluate((key) => localStorage.removeItem(key), FAVORITES_KEY);
      await page.context().clearCookies({ name: FOLD_COOKIE });
      await visit(page, '/runs');
    }
  },
} satisfies PageSpec;

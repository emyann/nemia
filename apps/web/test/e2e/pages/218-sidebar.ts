import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { notStarted } from '../../../src/lib/inbox.ts';
import type { InboxEntry } from '../../../src/lib/api/inbox.ts';
import type { OpenRuns } from '../../../src/lib/api/runs.ts';
import { pick, photograph, railPlace, sectionsOf, sidebar, startOf, themeOf } from '../board.ts';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import { FACTORIES, FOLDER } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The factory the page picks. */
const FACTORY = FACTORIES.hiring.name;

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

/** Each list's `href`, in the rail's order: the Inbox, Runs and Workflows. */
const hrefsOf = (page: Page) => sectionsOf(page).evaluateAll((links) => links.map((link) => link.getAttribute('href')));

/** The badge the rail draws on `place`, the count it shows. */
const badgeOf = (page: Page, place: string): Locator => railPlace(page, place).locator('[data-slot="badge"]');

/** What the api answers at `pathname`, read apart from the page. */
async function answer<T>(page: Page, pathname: string): Promise<T> {
  return (await (await page.request.get(new URL(pathname, page.url()).href)).json()) as T;
}

/**
 * The rail's counts are the api's, for the factory picked: Runs the light answer's runs that wait on you, the Inbox its cards not yet
 * started; none drawn for none.
 */
async function countsAre(page: Page, picked: string | undefined, where: string): Promise<void> {
  const open = await answer<OpenRuns>(page, `/api/runs-open${picked ? `?ofFactory=${picked}` : ''}`);
  const cards = notStarted(await answer<InboxEntry[]>(page, '/api/inbox'), picked).length;
  await expectTexts(
    badgeOf(page, 'Runs'),
    open.counts.waiting ? [String(open.counts.waiting)] : [],
    `${where}: Runs counts what waits on you`,
  );
  await expectTexts(badgeOf(page, 'Inbox'), cards ? [String(cards)] : [], `${where}: the Inbox counts its cards not yet started`);
}

/** The colour `role`, a meaning of the board's stylesheet, computes to in this page. */
const meaning = (page: Page, role: string): Promise<string> =>
  page.evaluate((role) => {
    const probe = document.createElement('span');
    probe.style.backgroundColor = `var(${role})`;
    document.body.append(probe);
    const colour = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return colour;
  }, role);

/** Runs' badge is drawn in yours, what waits on you, and the Inbox's in rest: never the kit's red, which is failure on the board. */
async function badgeColours(page: Page): Promise<void> {
  for (const [place, role] of [
    ['Runs', '--meaning-yours'],
    ['Inbox', '--meaning-rest'],
  ] as const) {
    const want = await meaning(page, role);
    const drawn = await badgeOf(page, place).evaluate((badge) => getComputedStyle(badge).backgroundColor);
    if (drawn !== want) throw new Refused(`the ${place} badge is drawn in ${role}, ${want} — it is ${drawn}`);
  }
}

/**
 * A factory picked on a list's page stays on it with `?factory=`, every list carrying it, the counts its own, and Factories leading to its
 * floor; All factories on the floor leads to the Overview. On a run's page a factory picked opens its floor.
 */
async function picks(page: Page): Promise<void> {
  await countsAre(page, undefined, 'under All factories');
  await badgeColours(page);
  await pick(page, FACTORY);
  await expectAt(page, '/runs', `?factory=${FACTORY}`, `${FACTORY} picked on Runs stays on Runs`);
  await sidebar(page);
  await countsAre(page, FACTORY, `${FACTORY} picked`);
  const hrefs = await hrefsOf(page);
  const want = ['runs', 'inbox', 'workflows'].map((s) => `/${s}?factory=${FACTORY}`);
  if (hrefs.join() !== want.join()) throw new Refused(`every list carries ${FACTORY}: ${want.join(', ')} — they are ${hrefs.join(', ')}`);
  await settled(page);
  await photograph(page, path.join(OUT, `sidebar-picked-${await themeOf(page)}.png`));
  await railPlace(page, 'Workflows').click();
  await expectAt(page, '/workflows', `?factory=${FACTORY}`, 'Workflows keeps the factory picked');
  await sidebar(page);
  await railPlace(page, 'Factories').click();
  await expectAt(page, `/factories/${FACTORY}`, '', 'Factories opens its floor');
  await sidebar(page);
  await pick(page, 'All factories');
  await expectAt(page, '/', '', 'All factories picked on a floor leads to the Overview');
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

/** On a phone's screen the drawer holds the destinations, with their counts; a destination pressed there closes it. */
async function onPhone(page: Page): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
  await visit(page, '/runs');
  await page.locator('header[data-frame-header] [data-menu-button]').click();
  const drawer = page.getByRole('dialog');
  await expectVisible(drawer, 'the menu button opens the drawer');
  await railPlace(page, 'Inbox').click();
  await expectCount(drawer, 0, 'a destination pressed closes the drawer');
  await expectAt(page, '/inbox', '', 'and opens its page');
}

export default {
  /**
   * The rail and the switcher together: the counts on Runs and the Inbox, the api's for the factory picked, in yours and rest; the
   * switcher read from the address and written to it, every list carrying the factory picked and Factories leading to its floor; the FAB
   * asking for a factory under All factories; and the drawer on a phone, which a pick closes. The window's size is taken back.
   */
  name: 'sidebar',
  route: '/runs',
  expect: async (page) => {
    const size = page.viewportSize();
    try {
      await sidebar(page);
      await picks(page);
      await asksItsFactory(page);
      await onPhone(page);
    } finally {
      if (size) await page.setViewportSize(size);
      await visit(page, '/runs');
    }
  },
} satisfies PageSpec;

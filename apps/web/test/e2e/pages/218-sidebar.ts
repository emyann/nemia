import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { notStarted } from '../../../src/lib/inbox.ts';
import { type CardList, DEFAULT_NAMESPACE, LIST_PAGE } from 'objects';
import { entriesOf } from '../../../src/lib/api/inbox.ts';
import { openAnswered, pick, pickedIn, photograph, placeOf, railPlace, sectionsOf, sidebar, startOf, themeOf } from '../board.ts';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import { FACTORIES, FOLDER } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The factory the page picks. */
const FACTORY = FACTORIES.hiring.name;

/** The factory picked from it. */
const OTHER = FACTORIES.others[0];

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

/** Each list's `href` in the pane, in its order: Runs, the Inbox and Workflows. */
const hrefsOf = (page: Page) => sectionsOf(page).evaluateAll((links) => links.map((link) => link.getAttribute('href')));

/** The badge the rail draws on Waiting, the count it shows. */
const badgeOf = (page: Page): Locator => railPlace(page, 'Waiting').locator('[data-slot="badge"]');

/** What the api answers at `pathname`, read apart from the page. */
async function answer<T>(page: Page, pathname: string): Promise<T> {
  return (await (await page.request.get(new URL(pathname, page.url()).href)).json()) as T;
}

/** The rail's Waiting counts the runs that wait on you in every factory, as the light answer says; none drawn for none. */
async function waitingIs(page: Page, where: string): Promise<void> {
  const open = await openAnswered(page);
  await expectTexts(badgeOf(page), open.counts.waiting ? [String(open.counts.waiting)] : [], `${where}: Waiting counts what waits on you`);
}

/** The pane's lines are `factory`'s own: Runs what waits on you there, the Inbox its cards not yet started, each count on its badge. */
async function linesAre(page: Page, factory: string): Promise<void> {
  const open = await openAnswered(page, factory);
  const cards = notStarted(entriesOf(await answer<CardList>(page, `/api/cards?limit=${LIST_PAGE.most}`)), factory).length;
  await expectVisible(
    placeOf(page, 'Runs').getByText(open.counts.waiting ? `${open.counts.waiting} waiting on you` : 'nothing waits on you'),
    `${factory}'s Runs says what waits on you there`,
  );
  await expectVisible(
    placeOf(page, 'Inbox').getByText(cards ? `${cards} not started` : 'every card started'),
    `${factory}'s Inbox says its cards not yet started`,
  );
  await expectTexts(
    placeOf(page, 'Runs').locator('[data-slot="badge"]'),
    open.counts.waiting ? [String(open.counts.waiting)] : [],
    `${factory}'s Runs counts what waits on you on its badge, none drawn for none`,
  );
  await expectTexts(
    placeOf(page, 'Inbox').locator('[data-slot="badge"]'),
    cards ? [String(cards)] : [],
    `${factory}'s Inbox counts its cards not yet started on its badge, none drawn for none`,
  );
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

/** Waiting's badge is drawn in yours, what waits on you: never the kit's red, which is failure on the board. */
async function badgeColour(page: Page): Promise<void> {
  const want = await meaning(page, '--meaning-yours');
  const drawn = await badgeOf(page).evaluate((badge) => getComputedStyle(badge).backgroundColor);
  if (drawn !== want) throw new Refused(`the Waiting badge is drawn in --meaning-yours, ${want} — it is ${drawn}`);
}

/**
 * The default factory's pane counts the seed's runs waiting on you on its Runs badge. On a factory's list, another factory picked keeps the place under its path, every place of the pane leading under it and its lines its
 * own; on a run's page a factory picked opens its runs; Factories in the rail leads to the store's floor.
 */
async function picks(page: Page): Promise<void> {
  await waitingIs(page, 'on the store');
  await badgeColour(page);
  await visit(page, `/factories/${DEFAULT_NAMESPACE}/runs`);
  await sidebar(page);
  await linesAre(page, DEFAULT_NAMESPACE);
  await settled(page);
  await photograph(page, path.join(OUT, `sidebar-counts-${await themeOf(page)}.png`));
  await visit(page, `/factories/${FACTORY}/runs`);
  await sidebar(page);
  await linesAre(page, FACTORY);
  await pick(page, OTHER);
  await expectAt(page, `/factories/${OTHER}/runs`, '', `${OTHER} picked on Runs stays on Runs`);
  await sidebar(page);
  await linesAre(page, OTHER);
  await waitingIs(page, `in ${OTHER}`);
  const hrefs = await hrefsOf(page);
  const want = ['runs', 'inbox', 'workflows'].map((s) => `/factories/${OTHER}/${s}`);
  if (hrefs.join() !== want.join())
    throw new Refused(`every place leads under ${OTHER}: ${want.join(', ')} — they are ${hrefs.join(', ')}`);
  await settled(page);
  await photograph(page, path.join(OUT, `sidebar-picked-${await themeOf(page)}.png`));
  await placeOf(page, 'Workflows').click();
  await expectAt(page, `/factories/${OTHER}/workflows`, '', 'Workflows stays in the factory');
  await sidebar(page);
  await railPlace(page, 'Factories').click();
  await expectAt(page, '/', '', 'Factories leads to the store floor');
  await sidebar(page);
  await visit(page, `/runs/${FOLDER.id}`);
  const home = pickedIn(new URL(page.url()));
  if (home === null) throw new Refused(`${FOLDER.id}, a run of a named factory, opens under its factory's path — it is at ${page.url()}`);
  await sidebar(page);
  const picked = home === FACTORY ? OTHER : FACTORY;
  await pick(page, picked);
  await expectAt(page, `/factories/${picked}/runs`, '', "picked on a run's page, a factory opens its runs");
}

/**
 * The pane's Start a run starts in its factory, named in the address. An address naming the start in no factory asks for the factory
 * first; moving through the factories with the keyboard picks none, and pressing one opens the start in it, named in the address.
 */
async function asksItsFactory(page: Page): Promise<void> {
  await visit(page, `/factories/${FACTORY}/runs`);
  await startOf(page).click();
  await expectVisible(page.getByRole('complementary', { name: `Start a run in ${FACTORY}` }), `the pane's start starts in ${FACTORY}`);
  await expectAt(page, `/factories/${FACTORY}/runs`, `?bar=start%3A${FACTORY}`, `and the address names it start:${FACTORY}`);
  await visit(page, '/runs?bar=start');
  const bar = page.getByRole('complementary', { name: 'Start a run', exact: true });
  await expectVisible(bar, 'the start in no factory opens the bar asking for the factory');
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

/** On a phone's screen the drawer holds the destinations, Waiting's count with them; a destination pressed there closes it. */
async function onPhone(page: Page): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
  await visit(page, '/runs');
  await page.locator('header[data-frame-header] [data-menu-button]').click();
  const drawer = page.getByRole('dialog');
  await expectVisible(drawer, 'the menu button opens the drawer');
  await railPlace(page, 'Agents').click();
  await expectCount(drawer, 0, 'a destination pressed closes the drawer');
  await expectAt(page, '/agents', '', 'and opens its page');
}

export default {
  /**
   * The rail, the pane and its switcher together: Waiting's count, the api's across every factory, in yours; the pane's lines its
   * factory's own; the switcher read from the path and moving the page under the picked factory's path; the pane's start in its factory,
   * and the start in no factory asking for one; and the drawer on a phone, which a pick closes. The window's size is taken back.
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

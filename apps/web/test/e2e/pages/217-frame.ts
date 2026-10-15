import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { litOf, photograph, RAIL_PLACES, railColumnOf, railOf, railPlace, themeOf, topBarOf } from '../board.ts';
import { expectCount, expectNone, expectVisible, idle, Refused, settled } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The rail's width with its border, closed and open. */
const WIDTH = { closed: 97, open: 221 };

/** The box of `target`, refused when it is not drawn. */
async function boxOf(target: Locator, what: string) {
  const box = await target.boundingBox();
  if (!box) throw new Refused(`${what} is drawn`);
  return box;
}

/** The button that opens and closes the rail, or on a phone its drawer. */
const menuOf = (page: Page) => page.locator('[data-menu-button]');

/** Waits until the rail is `width` wide, its transition done, and refuses if it never is. */
const expectWidth = (page: Page, width: number, assertion: string) =>
  expectNone(async () => {
    const box = await railColumnOf(page).boundingBox();
    return box && Math.abs(box.width - width) <= 1 ? null : `it is ${box?.width ?? 'not drawn'} wide`;
  }, `${assertion}: the rail is ${width} wide`);

/** Refuses unless `target` holds the keyboard's focus. */
async function expectFocused(target: Locator, what: string): Promise<void> {
  if (!(await target.evaluate((element) => element === document.activeElement))) throw new Refused(`${what} holds the focus`);
}

/** The rail stands the window's height at its left, and the top bar beside it, across the rest of the top. */
async function railBesideBar(page: Page): Promise<void> {
  const rail = await boxOf(railColumnOf(page), 'the rail');
  const bar = await boxOf(topBarOf(page), 'the top bar');
  if (Math.abs(rail.x) > 1 || Math.abs(rail.y) > 1)
    throw new Refused(`the rail starts at the window's top left — it is at ${rail.x},${rail.y}`);
  if (Math.abs(bar.x - (rail.x + rail.width)) > 1 || Math.abs(bar.y) > 1)
    throw new Refused(
      `the top bar starts beside the rail, at the top — it is at ${bar.x},${bar.y}, the rail ending at ${rail.x + rail.width}`,
    );
}

/** The top bar holds, left to right, the page's name, the factory switcher, the search, the pause, the gauges and the account. */
async function barInOrder(page: Page): Promise<void> {
  const bar = topBarOf(page);
  const parts: Array<[string, Locator]> = [
    ["the page's name", bar.locator('[data-page-name]')],
    ['the factory switcher', bar.locator('[data-factory-picker]')],
    ['the search', bar.locator('[data-slot="search-bar"]')],
    ['the pause', bar.locator('[data-pause]')],
    ['the gauges', bar.locator('[data-gauges-button]')],
    ['the account', bar.locator('[data-account-to-come]')],
  ];
  const xs = await Promise.all(parts.map(async ([what, part]) => (await boxOf(part, what)).x));
  if (xs.some((x, at) => at > 0 && x <= xs[at - 1]))
    throw new Refused(`the top bar holds ${parts.map(([what]) => what).join(', ')}, left to right — at ${xs.join(', ')}`);
  await expectVisible(bar.locator('[data-page-name]').getByText('Overview', { exact: true }), 'the top bar names the page Overview');
}

/**
 * The search and the account say they are not built yet, to the eye and to a screen reader, and neither takes the keyboard: Tab from the
 * factory switcher reaches the pause, and from the gauges leaves the bar.
 */
async function toCome(page: Page): Promise<void> {
  const bar = topBarOf(page);
  const search = bar.getByRole('searchbox', { name: 'Search, not built yet' });
  await expectVisible(search, 'the search is named not built yet');
  if (!(await search.isDisabled())) throw new Refused('the search is disabled: it takes no text and no focus');
  if ((await search.getAttribute('placeholder')) !== 'Search · to come') throw new Refused('the search says to the eye it is to come');
  const account = bar.getByRole('img', { name: 'Account, not built yet' });
  await expectVisible(account, 'the account is an image named not built yet');
  await expectCount(bar.locator('[data-account-to-come] [tabindex], [data-account-to-come] button'), 0, 'the account takes no focus');
  await bar.locator('[data-factory-picker] button').first().focus();
  await page.keyboard.press('Tab');
  await expectFocused(bar.locator('[data-pause]'), 'Tab from the factory switcher passes the search: the pause');
  await page.keyboard.press('Tab');
  await expectFocused(bar.locator('[data-gauges-button] button'), 'Tab from the pause: the gauges button');
}

/** The menu button closes the rail to its icons and opens it again, and so does Ctrl+B; each state outlives a reload. */
async function toggles(page: Page): Promise<void> {
  await expectWidth(page, WIDTH.open, 'open as this browser left it');
  await expectVisible(menuOf(page).and(page.getByRole('button', { name: 'Close the menu' })), 'open, the menu button closes it');
  await expectVisible(
    railColumnOf(page).getByRole('button', { name: 'Start a run' }).getByText('Start a run'),
    'open, the FAB says Start a run',
  );
  await settled(page);
  await photograph(page, path.join(OUT, `frame-open-${await themeOf(page)}.png`));
  await menuOf(page).click();
  await expectWidth(page, WIDTH.closed, 'the menu button closes it');
  await expectVisible(menuOf(page).and(page.getByRole('button', { name: 'Open the menu' })), 'closed, the menu button opens it');
  for (const place of RAIL_PLACES) await expectVisible(railPlace(page, place), `closed, the rail keeps ${place}`);
  await settled(page);
  await photograph(page, path.join(OUT, `frame-closed-${await themeOf(page)}.png`));
  await page.reload({ waitUntil: 'load' });
  await idle(page);
  await expectWidth(page, WIDTH.closed, 'closed, it stays closed across a reload');
  await page.locator('body').click({ position: { x: 600, y: 600 } });
  await page.keyboard.press('Control+b');
  await expectWidth(page, WIDTH.open, 'Ctrl+B opens it');
  await page.reload({ waitUntil: 'load' });
  await idle(page);
  await expectWidth(page, WIDTH.open, 'open, it stays open across a reload');
}

/** On a phone's screen the rail leaves the page's side: the top bar's menu button opens the destinations in a drawer, which a pick closes. */
async function onPhone(page: Page): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
  await expectCount(railColumnOf(page), 0, "on a phone the rail leaves the page's side");
  await topBarOf(page).locator('[data-menu-button]').click();
  const drawer = page.getByRole('dialog');
  await expectVisible(drawer, 'the menu button opens the drawer');
  for (const place of RAIL_PLACES) await expectVisible(railPlace(page, place), `the drawer holds ${place}`);
  await settled(page);
  await photograph(page, path.join(OUT, `frame-narrow-${await themeOf(page)}.png`));
  await railPlace(page, 'Agents').click();
  await expectCount(drawer, 0, 'a pick in the drawer closes it');
  await page.waitForURL((url) => url.pathname === '/agents');
}

export default {
  /**
   * The frame on the Overview: the rail at the left, the window's height, the top bar beside it holding the page's name, the factory
   * switcher, the search and the account to come, the pause and the gauges; Overview alone lit. The rail opens and closes by its menu
   * button and by Ctrl+B, each state kept across a reload; on a phone a drawer holds the destinations. The rail is left open, as a fresh
   * browser finds it, and the window's size is taken back.
   */
  name: 'frame',
  route: '/',
  expect: async (page) => {
    const size = page.viewportSize();
    try {
      await railBesideBar(page);
      await barInOrder(page);
      await expectVisible(railPlace(page, 'Overview').and(litOf(page)), 'the rail lights Overview on its page');
      await expectCount(litOf(page), 1, 'and no other destination');
      await expectCount(railOf(page), 1, 'one rail of destinations');
      await toCome(page);
      await toggles(page);
      await onPhone(page);
    } finally {
      if (size) await page.setViewportSize(size);
      await page.evaluate(() => (document.cookie = 'sidebar_state=true; path=/'));
    }
  },
} satisfies PageSpec;

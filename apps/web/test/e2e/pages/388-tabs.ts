import path from 'node:path';
import type { Page } from 'playwright';
import { frameTabsOf, nextVisit, photograph, themeOf, railPlace, litOf } from '../board.ts';
import { expectCount, expectTexts, expectUncut, expectVisible, idle, Refused, settled } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The destination whose tabs the strip holds, as the rail and the top bar name it. */
const PLACE = 'Settings';

/** The strip's tab named `name`. */
const tabOf = (page: Page, name: string) => frameTabsOf(page).getByRole('tab', { name, exact: true });

/** Refuses unless the address is `pathname`, with no `?bar=`. */
function expectAt(page: Page, pathname: string, assertion: string): void {
  const url = new URL(page.url());
  if (url.pathname !== pathname || url.searchParams.has('bar'))
    throw new Refused(`${assertion}: the address is ${pathname} — it is ${page.url()}`);
}

/** Refuses unless the strip selects `name` alone, and the rail lights the place alone. */
async function expectTab(page: Page, name: string, assertion: string): Promise<void> {
  await expectTexts(frameTabsOf(page).locator('[aria-selected="true"]'), [name], assertion);
  await expectVisible(railPlace(page, PLACE).and(litOf(page)), `${assertion}: the rail lights ${PLACE}`);
  await expectCount(litOf(page), 1, `${assertion}: and no other place`);
}

/** The strip sits under the header and above the page, across the page's width, the header naming the place. */
async function underHeader(page: Page): Promise<void> {
  const header = page.locator('header[data-frame-header]');
  await expectVisible(header.locator('[data-page-name]').getByText(PLACE, { exact: true }), `the header names the place, ${PLACE}`);
  await expectTexts(frameTabsOf(page).getByRole('tab'), ['Settings', 'Machines', 'Capabilities'], 'the strip holds Settings, Machines, then Capabilities');
  await expectTab(page, 'Machines', 'on /machines the Machines tab is selected');
  const top = (await header.boundingBox())!;
  const strip = await frameTabsOf(page).boundingBox();
  const panel = await page.getByRole('tabpanel').boundingBox();
  if (!strip || !panel || strip.y < top.y + top.height - 1 || panel.y < strip.y + strip.height - 1)
    throw new Refused(
      `the strip sits under the header and above the page — the header ends at ${top.y + top.height}, the strip is at ${strip?.y}, the page at ${panel?.y}`,
    );
  await settled(page);
  await photograph(page, path.join(OUT, `tabs-strip-${await themeOf(page)}.png`));
}

/** A click on a tab opens its own address, the floating bar closed; a next visit to it opens the same tab. */
async function clicks(page: Page): Promise<void> {
  await page.goto(new URL('/machines?bar=state:lifecycle/working', page.url()).href);
  await idle(page);
  await expectVisible(page.locator('aside[data-bar="state:lifecycle/working"]'), 'a state is shown in the floating bar');
  await tabOf(page, 'Capabilities').click();
  await expectTab(page, 'Capabilities', 'a click on Capabilities selects it');
  expectAt(page, '/capabilities', 'and opens its own address, which carries no bar');
  await expectCount(page.locator('aside[data-bar]'), 0, 'the floating bar is closed');
  await expectVisible(page.locator('section[aria-label="Skills"]'), "the Capabilities page is drawn in the tab's panel");
  await idle(page);
  await nextVisit(page, (again) => expectTab(again, 'Capabilities', 'a next visit to /capabilities opens the Capabilities tab'));
}

/** The arrow keys move between the tabs without opening one; Enter opens the one in focus, once. */
async function keys(page: Page): Promise<void> {
  await tabOf(page, 'Capabilities').focus();
  await page.keyboard.press('ArrowLeft');
  const focused = await page.evaluate(() => document.activeElement?.textContent?.trim());
  if (focused !== 'Machines') throw new Refused(`ArrowLeft moves the focus to Machines — it is on ${focused}`);
  await expectTab(page, 'Capabilities', 'and opens nothing: Capabilities is still selected');
  expectAt(page, '/capabilities', 'and the address is unchanged');
  const before = await page.evaluate(() => history.length);
  await page.keyboard.press('Enter');
  await expectTab(page, 'Machines', 'Enter on Machines selects it');
  expectAt(page, '/machines', 'and opens its address');
  await idle(page);
  const after = await page.evaluate(() => history.length);
  if (after !== before + 1) throw new Refused(`Enter opens the tab once — history grew by ${after - before}`);
  await page.goBack();
  await expectTab(page, 'Capabilities', 'one step back is Capabilities again');
  expectAt(page, '/capabilities', 'at its own address');
  await idle(page);
}

/** On a phone's screen the strip fits the page's width, its tabs whole, and the header names the place whole. */
async function onPhone(page: Page): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expectUncut(frameTabsOf(page).getByRole('tab'), 'on a phone each tab is read whole');
  await expectUncut(page.locator('header[data-frame-header] [data-page-name]').getByText(PLACE, { exact: true }), 'and the header names the place whole');
  const strip = await frameTabsOf(page).locator('xpath=..').boundingBox();
  if (!strip || strip.x < -1 || strip.x + strip.width > 391)
    throw new Refused(`the strip fits a 390 wide screen, scrolling sideways — it is ${strip?.width} wide at ${strip?.x}`);
  await settled(page);
  await photograph(page, path.join(OUT, `tabs-narrow-${await themeOf(page)}.png`));
}

export default {
  /**
   * The frame's tabs: Settings is one destination in the rail with a tab each, Settings, Machines and Capabilities, in a strip under the
   * top bar and above the page. A tab is its own address: a click opens it, closing the floating bar, and a next visit opens the same tab.
   * The arrow keys move between the tabs without opening one, and Enter opens one, once. A page with one view, Agents, has no strip. The
   * window's size is taken back.
   */
  name: 'tabs',
  route: '/machines',
  expect: async (page) => {
    const size = page.viewportSize();
    try {
      await underHeader(page);
      await clicks(page);
      await keys(page);
      await onPhone(page);
      if (size) await page.setViewportSize(size);
      await page.goto(new URL('/agents', page.url()).href);
      await idle(page);
      await expectVisible(railPlace(page, 'Agents').and(litOf(page)), 'on Agents');
      await expectCount(frameTabsOf(page), 0, 'a page with one view has no strip');
    } finally {
      if (size) await page.setViewportSize(size);
    }
  },
} satisfies PageSpec;

import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { photograph, RAIL_PLACES, railOf, themeOf } from '../board.ts';
import { expectCount, expectVisible, Refused, settled } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The box of `target`, refused when it is not drawn. */
async function boxOf(target: Locator, what: string) {
  const box = await target.boundingBox();
  if (!box) throw new Refused(`${what} is drawn`);
  return box;
}

/** The header's button that folds the sidebar, or opens its sheet on a narrow screen. */
const trigger = (page: Page) => page.locator('header[data-feed]').locator('[data-sidebar="trigger"]');

/** The sidebar's own state, `expanded` or `collapsed`, as the provider draws it. */
const foldOf = (page: Page) => page.locator('[data-slot="sidebar"][data-state]').getAttribute('data-state');

/** The list's Runs, which the sidebar shows open and leaves out folded. */
const runsLink = (page: Page) => page.locator('[data-sidebar="sidebar"]').getByRole('link', { name: 'Runs' });

/** The header runs across the whole top of the page, and the rail starts below it, at the left. */
async function headerOverRail(page: Page): Promise<void> {
  const width = page.viewportSize()?.width ?? 0;
  const header = await boxOf(page.locator('header[data-feed]'), 'the header');
  if (Math.abs(header.x) > 1 || Math.abs(header.y) > 1 || Math.abs(header.width - width) > 1)
    throw new Refused(`the header spans the top of the page, ${width} wide at 0,0 — it is ${header.width} wide at ${header.x},${header.y}`);
  const rail = await boxOf(railOf(page), 'the rail');
  if (rail.y < header.y + header.height - 1 || Math.abs(rail.x) > 1)
    throw new Refused(
      `the rail sits under the header at the left — the header ends at ${header.y + header.height}, the rail is at ${rail.x},${rail.y}`,
    );
}

/**
 * Moves the mouse onto `target` in steps, as a hand does: React Aria opens a tooltip on hover only once the pointer has moved, and a
 * single jump onto the link reads as no pointer at all.
 */
async function pointAt(page: Page, target: Locator, what: string): Promise<void> {
  const box = await boxOf(target, what);
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 40);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
}

/** Capabilities sits at the rail's foot, its bottom near the rail's, far below Machines, the rail's room between them left empty. */
async function capabilitiesAtFoot(page: Page): Promise<void> {
  const rail = await boxOf(railOf(page), 'the rail');
  const machines = await boxOf(railOf(page).getByRole('link', { name: 'Machines' }), "the rail's Machines");
  const capabilities = await boxOf(railOf(page).getByRole('link', { name: 'Capabilities' }), "the rail's Capabilities");
  const foot = rail.y + rail.height - (capabilities.y + capabilities.height);
  const gap = capabilities.y - (machines.y + machines.height);
  if (foot > 24 || gap < rail.height / 2)
    throw new Refused(
      `Capabilities sits at the rail's foot, far below Machines — it ends ${foot}px above the rail's bottom, ${gap}px below Machines, in a rail ${rail.height}px tall`,
    );
}

/** Each place in the rail is named by a tooltip: on hover, and on focus from the keyboard. */
async function named(page: Page): Promise<void> {
  const rail = railOf(page);
  await pointAt(page, rail.getByRole('link', { name: 'Machines' }), "the rail's Machines");
  await expectVisible(page.getByRole('tooltip').filter({ hasText: 'Machines' }), 'hovering Machines in the rail names it in a tooltip');
  await settled(page);
  await photograph(page, path.join(OUT, `frame-open-${await themeOf(page)}.png`));
  await page.mouse.move(600, 500);
  await expectCount(page.getByRole('tooltip'), 0, 'the tooltip goes when the pointer leaves');
  await page.locator('header[data-feed]').getByRole('link', { name: 'Nemia' }).focus();
  await page.keyboard.press('Tab');
  await expectVisible(
    page.getByRole('tooltip').filter({ hasText: 'Home' }),
    'Tab from the logo reaches Home in the rail, named in a tooltip',
  );
  await page.keyboard.press('Escape');
}

/** The header's button folds the sidebar to the rail alone, the list gone, and opens it again. */
async function folds(page: Page): Promise<void> {
  await trigger(page).click();
  await expectCount(runsLink(page), 0, "folded, the sidebar's list is not drawn");
  for (const place of RAIL_PLACES) await expectVisible(railOf(page).getByRole('link', { name: place }), `folded, the rail keeps ${place}`);
  await settled(page);
  const folded = await boxOf(page.locator('[data-slot="sidebar-container"]'), 'the folded sidebar');
  if (folded.width > 49) throw new Refused(`folded, the sidebar is the rail's width, 48 — it is ${folded.width}`);
  await photograph(page, path.join(OUT, `frame-folded-${await themeOf(page)}.png`));
  await trigger(page).click();
  await expectVisible(runsLink(page), 'pressed again, the list is back');
}

/** On a phone's screen the rail is not beside the page: the header's button opens a sheet holding the rail and the list. */
async function onPhone(page: Page): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
  await expectCount(railOf(page).filter({ visible: true }), 0, 'on a phone the rail folds away from beside the page');
  await trigger(page).click();
  const sheet = page.getByRole('dialog');
  await expectVisible(sheet, "the header's button opens the menu's sheet");
  for (const place of RAIL_PLACES)
    await expectVisible(
      sheet.locator('nav[aria-label="Places"]').getByRole('link', { name: place }),
      `the sheet holds the rail's ${place}`,
    );
  await expectVisible(sheet.getByRole('link', { name: 'Runs' }), "and the list's places");
  await settled(page);
  await photograph(page, path.join(OUT, `frame-narrow-${await themeOf(page)}.png`));
  await sheet.locator('nav[aria-label="Places"]').getByRole('link', { name: 'Agents' }).click();
  await expectCount(sheet, 0, 'a pick in the rail closes the sheet');
}

export default {
  /**
   * The frame's header and rail: the header across the whole top, the rail under it at the left, its places named by a tooltip on hover
   * and on keyboard focus, Agents lit on its page. The header's button folds the sidebar down to the rail and opens it again; on a phone's
   * screen the rail leaves the page's side and the button's sheet holds it with the list, and a pick in it closes it. The fold and the
   * window's size are taken back.
   */
  name: 'frame',
  route: '/agents',
  expect: async (page) => {
    const size = page.viewportSize();
    try {
      await headerOverRail(page);
      await capabilitiesAtFoot(page);
      await expectVisible(railOf(page).locator('a[data-active="true"][aria-label="Agents"]'), 'the rail lights Agents on its page');
      await expectCount(railOf(page).locator('a[data-active="true"]'), 1, 'and no other place');
      await named(page);
      await folds(page);
      await onPhone(page);
    } finally {
      if (size) await page.setViewportSize(size);
      if ((await foldOf(page)) === 'collapsed') await trigger(page).click();
    }
  },
} satisfies PageSpec;

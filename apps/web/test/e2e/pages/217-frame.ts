import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { photograph, RAIL_PLACES, railOf, railPlace, themeOf } from '../board.ts';
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

/**
 * The rail's places stand in one column from the top, nothing pushed to its foot: each gap between two places no wider than the one between
 * Home and Agents, and the last place ending far above the rail's bottom.
 */
async function oneColumn(page: Page): Promise<void> {
  const rail = await boxOf(railOf(page), 'the rail');
  const boxes = await Promise.all(RAIL_PLACES.map((place) => boxOf(railPlace(page, place), `the rail's ${place}`)));
  const gaps = boxes.slice(1).map((box, i) => box.y - (boxes[i].y + boxes[i].height));
  const last = boxes.at(-1)!;
  const foot = rail.y + rail.height - (last.y + last.height);
  if (gaps.some((gap) => gap > gaps[0] + 1) || foot < rail.height / 2)
    throw new Refused(
      `the rail's places stand in one column from the top — the gaps between them are ${gaps.join(', ')}px, and the last ends ${foot}px above the bottom of a rail ${rail.height}px tall`,
    );
}

/** Each place in the rail is named by a tooltip: on hover, and on focus from the keyboard. */
async function named(page: Page): Promise<void> {
  await pointAt(page, railPlace(page, 'Machines & Capabilities'), "the rail's Machines & Capabilities");
  await expectVisible(
    page.getByRole('tooltip').filter({ hasText: 'Machines & Capabilities' }),
    'hovering Machines & Capabilities in the rail names it in a tooltip',
  );
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
  for (const place of RAIL_PLACES) await expectVisible(railPlace(page, place), `folded, the rail keeps ${place}`);
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
      sheet.locator('nav[aria-label="Places"]').getByRole('link', { name: place, exact: true }),
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
   * The frame's header and rail: the header across the whole top, the rail under it at the left, its places in one column from the top,
   * nothing at its foot, named by a tooltip on hover
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
      await oneColumn(page);
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

import path from 'node:path';
import type { Locator, Page } from 'playwright';
import {
  frameSheetOf,
  herFaceOf,
  litOf,
  machineBarOf,
  paneOf,
  photograph,
  PANE_PLACES,
  placeOf,
  RAIL_PLACES,
  railColumnOf,
  railPlace,
  sidebar,
  themeOf,
  topBarOf,
} from '../board.ts';
import { expectCount, expectNone, expectVisible, idle, Refused, settled } from '../checks.ts';
import { FACTORIES } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The factory whose floor the page stands on. */
const FACTORY = FACTORIES.hiring.name;

/** The pane's width, as the design draws it. */
const PANE = 360;

/** The least room a page's column keeps beside the rail and the pane at 768: 768 less the rail's 80 and the pane's 360. */
const COLUMN_AT_768 = 328;

/** The box of `target`, refused when it is not drawn. */
async function boxOf(target: Locator, what: string) {
  const box = await target.boundingBox();
  if (!box) throw new Refused(`${what} is drawn`);
  return box;
}

/** The button that folds the pane, or on a phone opens the drawer. */
const menuOf = (page: Page) => page.locator('[data-menu-button]').first();

/** The page's column. */
const columnOf = (page: Page) => page.locator('main[data-frame-page]');

/** Waits until the pane is drawn `PANE` wide, or not at all when `shown` is false. */
const expectPane = (page: Page, shown: boolean, assertion: string) =>
  expectNone(
    async () => {
      const box = (await paneOf(page).count()) ? await paneOf(page).boundingBox() : null;
      if (!shown) return box ? `it is drawn ${box.width} wide` : null;
      return box && Math.abs(box.width - PANE) <= 1 ? null : `it is ${box?.width ?? 'not drawn'} wide`;
    },
    `${assertion}: the pane is ${shown ? `${PANE} wide` : 'not drawn'}`,
  );

/** The rail at the window's left, then the pane when docked, then the column, then the sheet when open, on one row over the machine bar. */
async function inRow(page: Page, width: number, pane: boolean, sheet: boolean) {
  const rail = await boxOf(railColumnOf(page), 'the rail');
  const column = await boxOf(columnOf(page), "the page's column");
  const bar = await boxOf(machineBarOf(page), 'the machine bar');
  const wrong: string[] = [];
  if (Math.abs(rail.x) > 1) wrong.push(`the rail starts at ${rail.x}`);
  let edge = rail.x + rail.width;
  if (pane) {
    const box = await boxOf(paneOf(page), 'the pane');
    if (Math.abs(box.x - edge) > 1) wrong.push(`the pane starts at ${box.x}, the rail ending at ${edge}`);
    edge = box.x + box.width;
  }
  if (Math.abs(column.x - edge) > 1) wrong.push(`the column starts at ${column.x}, what is before it ending at ${edge}`);
  if (sheet) {
    const box = await boxOf(frameSheetOf(page), 'the sheet');
    if (Math.abs(box.x + box.width - width) > 1) wrong.push(`the sheet ends at ${box.x + box.width} of ${width}`);
  }
  if (Math.abs(bar.x) > 1 || Math.abs(bar.width - width) > 1) wrong.push(`the machine bar runs ${bar.x} to ${bar.x + bar.width}`);
  if (bar.y < column.y) wrong.push('the machine bar stands above the column');
  if (wrong.length) throw new Refused(`${width} wide, the frame stands in its row: ${wrong.join('; ')}`);
}

/** Her sheet comes in, or goes, as `open` says, by her face. */
async function sheetTo(page: Page, open: boolean) {
  const shown =
    (await frameSheetOf(page)
      .getAttribute('data-sheet-shows')
      .catch(() => 'none')) === 'her';
  if (shown !== open) await herFaceOf(page).first().click();
  await expectNone(
    async () => {
      const now =
        (await frameSheetOf(page)
          .getAttribute('data-sheet-shows')
          .catch(() => 'none')) === 'her';
      return now === open ? null : `the sheet ${now ? 'shows' : 'does not show'} her`;
    },
    `her face ${open ? 'opens' : 'closes'} her sheet`,
  );
  await idle(page);
}

/**
 * At `width`, the frame plain then with her sheet open: plain, the rail's destinations in their order and the pane's switcher reading the
 * factory (`sidebar`); the pane docked at 1600 and wider whatever the sheet, under 1600 covered by the sheet; the column never under
 * `COLUMN_AT_768` beside the pane; each pictured.
 */
async function atWidth(page: Page, width: number) {
  const size = page.viewportSize();
  await page.setViewportSize({ width, height: size?.height ?? 900 });
  await sheetTo(page, false);
  await expectPane(page, true, `${width} wide, the sheet closed`);
  await inRow(page, width, true, false);
  await sidebar(page);
  const column = await boxOf(columnOf(page), "the page's column");
  if (column.width < COLUMN_AT_768 - 1) throw new Refused(`${width} wide, the column keeps ${COLUMN_AT_768} — it is ${column.width}`);
  await settled(page);
  await photograph(page, path.join(OUT, `frame-${width}-plain-${await themeOf(page)}.png`));
  await sheetTo(page, true);
  await expectPane(page, width >= 1600, `${width} wide, the sheet open`);
  await inRow(page, width, width >= 1600, true);
  await settled(page);
  await photograph(page, path.join(OUT, `frame-${width}-sheet-${await themeOf(page)}.png`));
  await sheetTo(page, false);
}

/** The menu button folds the pane and unfolds it, and so does Ctrl+B, but on a store's page; each state outlives a reload. */
async function folds(page: Page) {
  await expectPane(page, true, 'unfolded as this browser left it');
  await expectVisible(menuOf(page).and(page.getByRole('button', { name: 'Fold the factory pane' })), 'unfolded, the menu button folds it');
  await menuOf(page).click();
  await expectPane(page, false, 'the menu button folds it');
  await expectVisible(
    menuOf(page).and(page.getByRole('button', { name: 'Unfold the factory pane' })),
    'folded, the menu button unfolds it',
  );
  await page.reload({ waitUntil: 'load' });
  await idle(page);
  await expectPane(page, false, 'folded, it stays folded across a reload');
  await page.locator('body').click({ position: { x: 600, y: 300 } });
  await page.keyboard.press('Control+b');
  await expectPane(page, true, 'Ctrl+B unfolds it');
  await page.reload({ waitUntil: 'load' });
  await idle(page);
  await expectPane(page, true, 'unfolded, it stays unfolded across a reload');
  await page.goto(new URL('/stats', page.url()).href, { waitUntil: 'load' });
  await idle(page);
  await page.locator('body').click({ position: { x: 600, y: 300 } });
  await page.keyboard.press('Control+b');
  await page.goto(new URL(`/factories/${FACTORY}`, page.url()).href, { waitUntil: 'load' });
  await idle(page);
  await expectPane(page, true, 'Ctrl+B on a store page, which has no pane, folds nothing');
}

/** On a phone's screen the rail and the pane leave the page's side: the menu button opens a drawer that holds both, which a pick closes. */
async function onPhone(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await expectCount(railColumnOf(page), 0, "on a phone the rail leaves the page's side");
  await expectCount(paneOf(page), 0, 'and so does the pane');
  await topBarOf(page).locator('[data-menu-button]').click();
  const drawer = page.getByRole('dialog');
  await expectVisible(drawer, 'the menu button opens the drawer');
  for (const place of RAIL_PLACES) await expectVisible(railPlace(page, place), `the drawer holds ${place}`);
  for (const place of PANE_PLACES) await expectVisible(placeOf(page, place), `the drawer holds the pane's ${place}`);
  await settled(page);
  await photograph(page, path.join(OUT, `frame-390-drawer-${await themeOf(page)}.png`));
  await placeOf(page, 'Runs').click();
  await expectCount(drawer, 0, 'a pick in the drawer closes it');
  await page.waitForURL((url) => url.pathname === `/factories/${FACTORY}/runs`);
}

export default {
  /**
   * The frame on a factory's floor: the store's rail at the left, Factories alone lit; the factory pane beside it, then the page's
   * column, then her sheet when open, over the machine bar across the foot; at 1600 the sheet is a third pane, under it the sheet covers
   * the pane; at 768 the column keeps its 328 pixels. The menu button and Ctrl+B fold the pane, kept across a reload; on a phone a
   * drawer holds the rail and the pane. The pane is left unfolded and the window's size taken back.
   */
  name: 'frame',
  route: `/factories/${FACTORY}`,
  expect: async (page) => {
    const size = page.viewportSize();
    try {
      await expectVisible(railPlace(page, 'Factories').and(litOf(page)), "the rail lights Factories on a factory's page");
      await expectCount(litOf(page), 1, 'and no other destination');
      await expectVisible(placeOf(page, 'Floor').and(page.locator('[aria-current="page"]')), 'the pane lights its Floor');
      await expectCount(page.locator('[data-gauges-button]'), 1, 'the gauges stand once, in the machine bar');
      await expectCount(topBarOf(page).locator('[data-pause], [data-factory-picker]'), 0, 'the page head holds no pause and no switcher');
      for (const width of [1600, 1280, 1024, 768]) await atWidth(page, width);
      if (size) await page.setViewportSize(size);
      await folds(page);
      await onPhone(page);
    } finally {
      if (size) await page.setViewportSize(size);
      await page.evaluate(() => (document.cookie = 'sidebar_state=true; path=/'));
    }
  },
} satisfies PageSpec;

import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page, Request } from 'playwright';
import {
  chatPanelOf,
  expectSheetShows,
  frameSheetOf,
  herFaceOf,
  openChat,
  photograph,
  railColumnOf,
  railPlace,
  startOf,
  themeOf,
} from '../board.ts';
import { expectInside, expectCount, expectNone, expectVisible, idle, Refused, settled } from '../checks.ts';
import { ENDING, FACTORIES } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The factory whose start the page opens in the sheet. */
const FACTORY = FACTORIES.hiring.name;
/** The floor the page starts on. */
const FLOOR = `/factories/${FACTORY}`;
/** The bar's value in the address, on any page. */
const OPEN = `start:${FACTORY}`;
/** The sheet's one width, Material's most for a side sheet. */
const SHEET = 400;
/** The window at 1600, where the sheet docks beside an open rail. */
const WIDE = { width: 1600, height: 900 };
/** The window at 1280, where an open rail folds for the sheet. */
const MEDIUM = { width: 1280, height: 800 };
/** Her chat's stream, which the frame follows once for the visit. */
const CHAT_STREAM = '/api/nemia/chat/stream';

/** The bar on the start of a run in FACTORY. */
const barOf = (page: Page) => page.getByRole('complementary', { name: `Start a run in ${FACTORY}` });

/** What the address's search holds for `bar`, or null. */
const barInUrl = (page: Page) => new URL(page.url()).searchParams.get('bar');

/** The box of `target`, refused when it is not drawn. */
async function boxOf(target: Locator, what: string) {
  const box = await target.boundingBox();
  if (!box) throw new Refused(`${what} is drawn`);
  return box;
}

/** Goes to `to` in this tab and waits for its reads. */
async function visit(page: Page, to: string): Promise<void> {
  await page.goto(new URL(to, page.url()).href, { waitUntil: 'load' });
  await idle(page);
}

/** Presses the sidebar's Start a run and waits for the bar it opens in the sheet. */
async function openFromSidebar(page: Page): Promise<Locator> {
  await startOf(page).click();
  const bar = barOf(page);
  await expectVisible(bar, "the sidebar's Start a run opens its bar in the frame's side sheet");
  return bar;
}

/** Refuses unless the address names no bar on `pathname`, and none is drawn. */
async function expectClosed(page: Page, pathname: string, assertion: string): Promise<void> {
  await expectCount(barOf(page), 0, assertion);
  const url = new URL(page.url());
  if (url.searchParams.has('bar') || url.pathname !== pathname)
    throw new Refused(`${assertion}: the address keeps ${pathname} and loses bar — it is ${url.pathname}${url.search}`);
}

/** Refuses unless the focus is back on the sidebar's Start a run, which opened the bar. */
async function expectFocusBack(page: Page, assertion: string): Promise<void> {
  if (!(await startOf(page).evaluate((el) => el === document.activeElement))) {
    const now = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 120) ?? 'nothing');
    throw new Refused(`${assertion}: the sidebar's Start a run holds the focus — ${now} does`);
  }
}

/** The rail stands `state` (`expanded`, `collapsed`). */
const expectRail = (page: Page, state: string, assertion: string): Promise<void> =>
  expectVisible(railColumnOf(page).and(page.locator(`[data-state="${state}"]`)), assertion);

/** This browser's `sidebar_state` pair: none where it was never written. */
const railCookie = (page: Page): Promise<string | undefined> =>
  page.evaluate(() =>
    document.cookie
      .split(';')
      .map((pair) => pair.trim())
      .find((pair) => pair.startsWith('sidebar_state=')),
  );

/**
 * The bar stands docked in the frame's layout: the sheet 400 wide at the window's right, the bar inside it, the page ending where the
 * sheet begins, nothing modal over the page.
 */
async function expectDocked(page: Page, bar: Locator, assertion: string): Promise<void> {
  await expectCount(page.locator('[data-slot="side-sheet-overlay"]'), 0, `${assertion}: no scrim over the page`);
  await expectNone(async () => {
    const sheet = await frameSheetOf(page).boundingBox();
    const main = await page.locator('main[data-frame-page]').boundingBox();
    const own = await bar.boundingBox();
    const width = page.viewportSize()?.width ?? 0;
    if (!sheet || !main || !own) return 'the sheet, the page and the bar are not all drawn';
    if (Math.abs(sheet.width - SHEET) > 1) return `the sheet is ${sheet.width} wide, not ${SHEET}`;
    if (Math.abs(sheet.x + sheet.width - width) > 1) return `the sheet's right is at ${sheet.x + sheet.width} of ${width}`;
    if (main.x + main.width > sheet.x + 1) return `the page ends at ${main.x + main.width}, past the sheet's left at ${sheet.x}`;
    if (own.x < sheet.x - 1 || own.x + own.width > sheet.x + sheet.width + 1)
      return `the bar stands from ${own.x} to ${own.x + own.width}, outside the sheet`;
    return null;
  }, `${assertion}: the sheet stands ${SHEET} wide at the window's right, beside the page and holding the bar`);
}

/**
 * At 1600 the bar docks in the sheet beside the page and an open rail: the page narrows by the sheet's width, the address names it, and
 * nothing floats. A picture of it.
 */
async function docks(page: Page): Promise<void> {
  await page.setViewportSize(WIDE);
  await visit(page, FLOOR);
  const main = page.locator('main[data-frame-page]');
  const before = (await boxOf(main, 'the page')).width;
  const bar = await openFromSidebar(page);
  if (barInUrl(page) !== OPEN) throw new Refused(`the address names the bar as bar=${OPEN} — it is ${page.url()}`);
  await expectSheetShows(page, 'bar', 'the sheet shows the bar');
  await expectDocked(page, bar, 'at 1600');
  await expectRail(page, 'expanded', 'at 1600 an open rail stays open beside the sheet');
  await expectNone(async () => {
    const after = (await boxOf(main, 'the page')).width;
    return Math.abs(before - after - SHEET) > 2 ? `${before} became ${after}` : null;
  }, `the page narrows by the sheet's ${SHEET} beside the bar`);
  await settled(page);
  await photograph(page, path.join(OUT, `bar-sheet-docked-${await themeOf(page)}.png`));
}

/** The address is the bar's: a reload keeps it, Back closes it, it opens on another page, and a link to another page closes it. */
async function inTheAddress(page: Page): Promise<void> {
  await page.reload({ waitUntil: 'load' });
  await idle(page);
  await expectVisible(barOf(page), 'a reload keeps the bar open');
  await page.goBack({ waitUntil: 'load' });
  await expectClosed(page, FLOOR, 'Back closes the bar');
  await expectSheetShows(page, 'none', 'and the sheet with it');
  await visit(page, `/runs?bar=${OPEN}`);
  await expectVisible(barOf(page), 'the same address opens the same bar on the Runs page');
  await expectVisible(page.locator('header', { hasText: 'Runs' }), 'with the Runs page beside it');
  await railPlace(page, 'Inbox').click();
  await idle(page);
  await expectClosed(page, '/inbox', 'a link to another page closes the bar');
}

/**
 * Escape closes the bar, from inside it and from the page, in place of the history entry; so does its Close button; both give the focus
 * back to the sidebar's Start a run.
 */
async function closes(page: Page): Promise<void> {
  await visit(page, FLOOR);
  let bar = await openFromSidebar(page);
  if (!(await bar.evaluate((el) => el.contains(document.activeElement)))) throw new Refused('the bar takes the focus as it opens');
  await page.keyboard.press('Escape');
  await expectClosed(page, FLOOR, 'Escape inside the bar closes it');
  await expectFocusBack(page, 'Escape gives the focus back');
  await page.goBack({ waitUntil: 'load' });
  await expectClosed(page, FLOOR, 'and replaces its entry: Back after closing it does not open it again');
  await openFromSidebar(page);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Escape');
  await expectClosed(page, FLOOR, 'Escape with the focus on the page closes the bar');
  bar = await openFromSidebar(page);
  await bar.getByRole('button', { name: 'Close' }).click();
  await expectClosed(page, FLOOR, 'its Close button closes the bar');
  await expectFocusBack(page, 'its Close button gives the focus back');
}

/** Escape in a field of the page that holds text leaves the field and keeps the focus out of the bar; a second Escape closes the bar. */
async function pageField(page: Page): Promise<void> {
  await visit(page, `/inbox?bar=${OPEN}`);
  const bar = barOf(page);
  await expectVisible(bar, 'the bar opens on the Inbox');
  const idea = page.locator('form[aria-label="File a card"]').getByRole('textbox', { name: 'An idea' });
  await idea.fill('a half-typed idea');
  await page.keyboard.press('Escape');
  await idle(page);
  await expectVisible(bar, 'Escape in a field of the page that holds text leaves the bar open');
  if (await idea.evaluate((el) => el === document.activeElement)) throw new Refused('and leaves the field');
  if (await bar.evaluate((el) => el.contains(document.activeElement)))
    throw new Refused('and keeps the focus out of the bar: it was in a field of the page');
  if ((await idea.inputValue()) !== 'a half-typed idea') throw new Refused('and keeps what the field holds');
  await page.keyboard.press('Escape');
  await expectClosed(page, '/inbox', 'a second Escape closes the bar');
  await idea.fill('');
}

/** Refuses unless her face says the sheet shows her (`aria-expanded`) exactly when `shown`. */
async function expectFaceSays(page: Page, shown: boolean, assertion: string): Promise<void> {
  await expectNone(
    async () => {
      const said = await herFaceOf(page).first().getAttribute('aria-expanded');
      return said === String(shown) ? null : `it says aria-expanded=${said}`;
    },
    `${assertion}: her face says ${shown ? 'it shows her' : 'it does not show her'}`,
  );
}

/**
 * One sheet at a time: the bar replaces her chat, her face replaces the bar and takes it out of the address, a bar named by the address
 * alone (Forward, as a link would) closes her too, and a bar closed after it leaves no sheet: her chat does not come back. Her chat's
 * stream is opened once and kept throughout, the sheet showing her or not.
 */
async function oneAtATime(page: Page): Promise<void> {
  await page.setViewportSize(WIDE);
  await visit(page, FLOOR);
  const streams: string[] = [];
  const count = (request: Request) => {
    if (new URL(request.url()).pathname === CHAT_STREAM) streams.push(request.url());
  };
  page.on('request', count);
  try {
    await openChat(page);
    await expectSheetShows(page, 'her', 'her face shows her chat in the sheet');
    await expectFaceSays(page, true, 'her chat open');
    const opened = streams.length;

    await openFromSidebar(page);
    await expectSheetShows(page, 'bar', 'the bar replaces her chat in the sheet');
    await expectCount(chatPanelOf(page), 0, 'her panel is gone from the sheet');
    await expectFaceSays(page, false, 'the bar in the sheet');
    await settled(page);
    await photograph(page, path.join(OUT, `bar-sheet-replaces-her-${await themeOf(page)}.png`));

    await herFaceOf(page).first().click();
    await expectVisible(chatPanelOf(page), 'her face shows her chat again, in place of the bar');
    await expectSheetShows(page, 'her', 'the sheet shows her');
    await expectCount(barOf(page), 0, 'and the bar is gone');
    if (barInUrl(page) !== null) throw new Refused(`and the address loses bar — it is ${page.url()}`);
    await expectFaceSays(page, true, 'her chat back');

    await openFromSidebar(page);
    await page.goBack({ waitUntil: 'load' });
    await expectSheetShows(page, 'none', 'Back past the bar leaves no sheet: the bar had closed her chat');
    await herFaceOf(page).first().click();
    await expectSheetShows(page, 'her', 'her face opens her chat');
    await page.goForward({ waitUntil: 'load' });
    await expectVisible(barOf(page), 'the address naming the bar again, as a link does, shows it');
    await expectSheetShows(page, 'bar', 'in place of her chat');
    await barOf(page).getByRole('button', { name: 'Close' }).click();
    await expectSheetShows(page, 'none', 'closing that bar leaves no sheet: her chat does not come back');
    await expectCount(chatPanelOf(page), 0, 'her panel is not drawn');
    await expectFaceSays(page, false, 'no sheet');

    if (streams.length !== opened)
      throw new Refused(`her chat's stream is kept while the sheet shows something else — ${streams.length - opened} more were opened`);
  } finally {
    page.off('request', count);
  }
}

/**
 * At 1280 an open rail folds while the bar's sheet is open and comes back when it closes, with no `sidebar_state` written; the menu
 * button brings it back beside the sheet. A picture of each.
 */
async function railFolds(page: Page): Promise<void> {
  await page.setViewportSize(MEDIUM);
  await visit(page, FLOOR);
  await expectRail(page, 'expanded', 'at 1280 the rail stands open before the sheet');
  const cookie = await railCookie(page);
  const bar = await openFromSidebar(page);
  await expectDocked(page, bar, 'at 1280');
  await expectRail(page, 'collapsed', 'at 1280 the open rail folds beside the bar');
  if ((await railCookie(page)) !== cookie) throw new Refused('the fold for the sheet writes no sidebar_state');
  await settled(page);
  await photograph(page, path.join(OUT, `bar-sheet-folded-${await themeOf(page)}.png`));
  await page.locator('[data-menu-button]').click();
  await expectRail(page, 'expanded', 'the menu button brings the rail back beside the sheet');
  await expectDocked(page, bar, 'with the rail back');
  if ((await railCookie(page)) !== cookie) throw new Refused('asked back, the rail writes no sidebar_state');
  await bar.getByRole('button', { name: 'Close' }).click();
  await expectSheetShows(page, 'none', 'Close closes the sheet');
  await expectRail(page, 'expanded', 'and the rail stands as the person keeps it');
  await openFromSidebar(page);
  await expectRail(page, 'collapsed', 'opened again, the rail folds again: the ask was forgotten when the sheet closed');
  await barOf(page).getByRole('button', { name: 'Close' }).click();
  await expectRail(page, 'expanded', 'and comes back as the sheet closes');
  if ((await railCookie(page)) !== cookie) throw new Refused('closing the sheet writes no sidebar_state');
}

/** On a phone the bar is the kit's modal sheet at the window's right, a dialog named for it; Close and Escape close it. */
async function onPhone(page: Page): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
  await visit(page, `${FLOOR}?bar=${OPEN}`);
  const dialog = page.getByRole('dialog', { name: 'Start a run' });
  await expectVisible(dialog, 'on a phone the bar opens as a modal sheet named for it');
  await expectVisible(page.locator('[data-slot="side-sheet-overlay"]'), 'over a scrim');
  await expectVisible(dialog.getByRole('complementary', { name: `Start a run in ${FACTORY}` }), 'holding the bar');
  await expectNone(async () => {
    const box = await dialog.boundingBox();
    return box && Math.abs(box.x + box.width - 390) <= 1 ? null : `it stands from ${box?.x} to ${box && box.x + box.width}`;
  }, 'at the window’s right');
  await settled(page);
  await photograph(page, path.join(OUT, `bar-sheet-narrow-${await themeOf(page)}.png`));
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expectCount(dialog, 0, 'its Close closes the modal sheet');
  if (barInUrl(page) !== null) throw new Refused(`and the address loses bar — it is ${page.url()}`);
  await visit(page, `${FLOOR}?bar=${OPEN}`);
  await expectVisible(dialog, 'opened again');
  await page.keyboard.press('Escape');
  await expectCount(dialog, 0, 'Escape closes the modal sheet');
  if (barInUrl(page) !== null) throw new Refused(`and the address loses bar — it is ${page.url()}`);
}

/** What a page's widest content gives up beside the sheet: its tables' scroll, and the right of their last column. */
type Room = { at: string; main: number; tables: { scroll: number; client: number; lastRight: number; mainRight: number }[] };

/**
 * Beside a run's sheet at 1280 and 1600 the Runs page and a factory's floor are still read: each table's last column is in the page or
 * reached by its own scroll, and the floor's buttons and minimap stand inside the floor. What each gives up is written to
 * `bar-sheet-room.json` beside the pictures, which are taken of each.
 */
async function pagesBeside(page: Page): Promise<void> {
  const run = `run:${ENDING.id}`;
  const rooms: Room[] = [];
  for (const size of [MEDIUM, WIDE]) {
    await page.setViewportSize(size);
    await visit(page, `/runs?bar=${run}`);
    await expectVisible(page.locator(`aside[data-bar="${run}"]`), `at ${size.width} the run's bar opens beside the Runs page`);
    await expectVisible(page.locator('main table').first(), 'the Runs page draws its tables');
    await settled(page);
    const room = await page.evaluate((at) => {
      const main = document.querySelector('main[data-frame-page]')!.getBoundingClientRect();
      const tables = Array.from(document.querySelectorAll('main table')).map((table) => {
        let scroller: HTMLElement = table.parentElement!;
        while (scroller.parentElement && scroller.scrollWidth <= scroller.clientWidth && scroller !== document.body)
          scroller = scroller.parentElement;
        const cells = table.querySelectorAll('thead th');
        const last = cells[cells.length - 1]?.getBoundingClientRect();
        return { scroll: scroller.scrollWidth, client: scroller.clientWidth, lastRight: last?.right ?? 0, mainRight: main.right };
      });
      return { at, main: main.width, tables };
    }, `runs-${size.width}`);
    rooms.push(room);
    for (const table of room.tables)
      if (table.lastRight > table.mainRight + 1 && table.scroll <= table.client)
        throw new Refused(
          `at ${size.width} a table's last column ends at ${table.lastRight}, past the page's ${table.mainRight}, with no scroll to reach it`,
        );
    await photograph(page, path.join(OUT, `bar-sheet-runs-${size.width}-${await themeOf(page)}.png`));

    await visit(page, `/factories/default?bar=${run}`);
    await expectVisible(page.locator(`aside[data-bar="${run}"]`), `at ${size.width} the run's bar opens beside the floor`);
    await settled(page);
    const floor = page.locator('.react-flow').first();
    await expectInside(page.getByRole('button', { name: 'Reset layout' }), floor, `at ${size.width} the floor's buttons stand inside it`);
    await expectInside(page.locator('.react-flow__minimap'), floor, `at ${size.width} the minimap stands inside the floor`);
    const width = (await boxOf(floor, 'the floor')).width;
    rooms.push({ at: `floor-${size.width}`, main: width, tables: [] });
    await photograph(page, path.join(OUT, `bar-sheet-floor-${size.width}-${await themeOf(page)}.png`));
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'bar-sheet-room.json'), `${JSON.stringify(rooms, null, 2)}\n`);
}

export default {
  /**
   * What the address's `?bar=` names opens in the frame's one side sheet, docked at the right of the page as her chat is, opened here by
   * the sidebar's Start a run on a factory's floor. At 1600 it is 400 wide beside an open rail and the page narrows by as much. The
   * address holds it, `?bar=start:<factory>`, the same on every page: a reload keeps it, Back closes it, and a link to another page
   * closes it. Escape and its Close button close it, Escape in place of its history entry, and give the focus back to what opened it;
   * Escape in a field of the page that holds text leaves the field. One sheet at a time: the bar and her chat replace each other, a bar
   * closed after replacing her leaves no sheet, and her chat's stream is kept throughout. At 1280 an open rail folds for it without
   * writing `sidebar_state`. On a phone it is the kit's modal sheet. Beside a run's sheet at 1280 and 1600 the Runs page's tables and the
   * floor are still read. The window's size is taken back.
   */
  name: 'bar-sheet',
  route: FLOOR,
  expect: async (page) => {
    const home = page.url();
    const size = page.viewportSize();
    try {
      await docks(page);
      await inTheAddress(page);
      await closes(page);
      await pageField(page);
      await oneAtATime(page);
      await railFolds(page);
      await pagesBeside(page);
      await onPhone(page);
    } finally {
      if (size) await page.setViewportSize(size);
      await page.goto(home, { waitUntil: 'load' });
    }
  },
} satisfies PageSpec;

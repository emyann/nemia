import path from 'node:path';
import type { Page } from 'playwright';
import { photograph, sameIn, themeOf } from '../board.ts';
import { expectVisible, idle, Refused } from '../checks.ts';
import { launch, type PageSpec } from '../visit.ts';
import { OUT, photographing } from '../world.ts';

/** The page's content box (the frame grid's span) and what it needs, as drawn now. */
const spanOf = (page: Page) =>
  page
    .locator('[data-frame-span]')
    .first()
    .evaluate((span) => {
      const box = span.getBoundingClientRect();
      return { x: box.x, width: box.width };
    });

/** The pixels the menu may move the content by: none, within a half pixel of rounding. */
const SAME = 0.5;

/** Reads the content's box, opens something with `open`, reads it, shuts it with Escape and reads it a third time: all three are equal. */
async function movesNothing(page: Page, what: string, open: () => Promise<void>, shown: () => Promise<void>) {
  const before = await spanOf(page);
  await open();
  await shown();
  const during = await spanOf(page);
  await page.keyboard.press('Escape');
  await idle(page);
  const after = await spanOf(page);
  for (const [when, box] of [
    ['open', during],
    ['shut again', after],
  ] as const) {
    if (Math.abs(box.x - before.x) > SAME || Math.abs(box.width - before.width) > SAME)
      throw new Refused(`${what}: the content moves when it is ${when} — ${JSON.stringify(before)} became ${JSON.stringify(box)}`);
  }
}

/** The content takes the window's width, the reading span stops at its measure, the bar and the lane stand as the frame puts them. */
async function frameFits(from: Page) {
  const browser = await launch('classic');
  try {
    const page = await sameIn(browser, from, 1280, 800);
    const first = page.locator('section[aria-label="Cards"] [data-card]').first();
    await expectVisible(first, 'the inbox draws its cards');
    await movesNothing(
      page,
      "a card's menu",
      () => first.getByRole('button', { name: /^More actions on / }).click(),
      () => expectVisible(page.getByRole('menu'), 'the menu opens'),
    );
    await movesNothing(
      page,
      'the New card sheet',
      () => page.getByRole('button', { name: 'New card' }).first().click(),
      () => expectVisible(page.getByRole('dialog', { name: 'New card' }), 'the sheet opens'),
    );

    const frame = await page.evaluate(() => {
      const main = document.querySelector('main[data-frame-page]') as HTMLElement;
      const bar = document.querySelector('[data-machine-bar]') as HTMLElement;
      const root = document.documentElement;
      const heading = document.querySelector('section[aria-label="Cards"] > :first-child') as HTMLElement;
      const card = document.querySelector('section[aria-label="Cards"] [data-card]') as HTMLElement;
      return {
        barRight: bar.getBoundingClientRect().right,
        barTop: bar.getBoundingClientRect().top,
        window: innerWidth,
        windowLane: innerWidth - root.clientWidth,
        windowScrolls: root.scrollHeight > innerHeight,
        mainBottom: main.getBoundingClientRect().bottom,
        mainLane: main.offsetWidth - main.clientWidth,
        mainScrolls: main.scrollHeight > main.clientHeight,
        gap: card.closest('li')!.getBoundingClientRect().top - heading.getBoundingClientRect().bottom,
        gutter: parseFloat(getComputedStyle(document.querySelector('[data-frame-grid]')!).columnGap),
      };
    });
    if (frame.barRight !== frame.window) throw new Refused(`the bar ends at ${frame.barRight} in a window ${frame.window} wide`);
    if (frame.windowLane !== 0 || frame.windowScrolls) throw new Refused(`the window scrolls — ${JSON.stringify(frame)}`);
    if (Math.abs(frame.mainBottom - frame.barTop) > 1)
      throw new Refused(`the column ends at ${frame.mainBottom}, the bar begins at ${frame.barTop}`);
    if (frame.mainScrolls && frame.mainLane !== 8) throw new Refused(`the column that scrolls keeps an 8-pixel lane — ${frame.mainLane}`);
    if (Math.abs(frame.gap - frame.gutter) > 1)
      throw new Refused(`the cards stand ${frame.gap} below their count, the gutter is ${frame.gutter}`);

    const narrow = (await spanOf(page)).width;
    await page.setViewportSize({ width: 2560, height: 800 });
    await idle(page);
    const wide = (await spanOf(page)).width;
    if (wide <= narrow || wide <= 896)
      throw new Refused(`the content is ${narrow} wide at 1280 and ${wide} at 2560: it grows with the window past 896`);

    await page.goto(new URL('/settings', from.url()).href, { waitUntil: 'load' });
    await idle(page);
    const reading = (await spanOf(page)).width;
    if (reading > 768) throw new Refused(`the reading span is ${reading} wide at 2560, past its 48rem measure`);
    const select = page.locator('[data-nemia-pick] button').first();
    await movesNothing(
      page,
      "Settings' select",
      () => select.click(),
      () => expectVisible(page.getByRole('listbox'), 'the select opens'),
    );
    if (photographing) await photograph(page, path.join(OUT, `frame-grid-settings-2560-${await themeOf(page)}.png`));
  } finally {
    await browser.close();
  }
}

export default {
  /**
   * The frame is a shell as tall as the window and its column alone scrolls: opening a menu or a sheet moves the content by no pixel, the
   * content grows with the window, the bar spans it to its right edge and the column's lane ends at the bar, and the count tag stands a
   * gutter above the cards.
   */
  name: 'frame-grid',
  route: '/inbox',
  expect: async (page) => {
    await idle(page);
    await frameFits(page);
    if (photographing) await photograph(page, path.join(OUT, `frame-grid-inbox-${await themeOf(page)}.png`));
  },
} satisfies PageSpec;

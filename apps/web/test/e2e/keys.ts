/**
 * How the look's browser tests drive the keyboard, Playwright's own, whose Enter the browser itself turns into a click on a link: what
 * has the focus, Tab until a mark has it, and Enter on a link of a story opened alone (`stories/built.ts`), which leads its story's own
 * router once. A play function's keys are events a script sends, which the browser turns into no click, so a second navigation is
 * read here and not in `npm run stories`.
 */
import assert from 'node:assert/strict';
import type { Page } from 'playwright';
import { expectNone } from './checks.ts';

/** What has the focus, as its marks say it: its `data-` attributes' names, and its text. */
export const focused = (page: Page) =>
  page.evaluate(() => {
    const at = document.activeElement as HTMLElement | null;
    return { marks: at ? Object.keys(at.dataset) : [], text: at?.textContent ?? '' };
  }) satisfies Promise<{ marks: string[]; text: string }>;

/** Presses Tab until what has the focus carries `mark`, a `data-` attribute by its camel-cased name. */
export async function tabTo(page: Page, mark: string) {
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press('Tab');
    if ((await focused(page)).marks.includes(mark)) return;
  }
  throw new Error(`Tab never reached ${mark}`);
}

/** Waits for two frames of the page: what a press started has been drawn. */
export const drawn = (page: Page) =>
  page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));

/** Where the router of the story the page draws stands, as its search, and how many times it has moved. */
export const standing = (page: Page) =>
  page.locator('[data-story-ground]').evaluate((ground) => {
    const at = ground.getAttribute('data-at') ?? '';
    return { search: at.includes('?') ? at.slice(at.indexOf('?')) : '', moves: Number(ground.getAttribute('data-moves')) };
  }) satisfies Promise<{ search: string; moves: number }>;

/**
 * Enter on what has the focus, in the story the page draws, leads its router to `search` by one move, and the page's own address
 * stays where it was.
 */
export async function entersOnce(page: Page, search: string, what: string) {
  const before = { ...(await standing(page)), url: page.url() };
  await page.keyboard.press('Enter');
  await expectNone(
    async () => {
      const at = await standing(page);
      return at.search === search ? null : `the story stands on ${at.search || 'its bare address'}`;
    },
    `${what} leads to ${search || 'the bare address'}`,
  );
  await drawn(page);
  assert.equal((await standing(page)).moves - before.moves, 1, `${what}: Enter navigates once, never twice`);
  assert.equal(page.url(), before.url, `${what}: the page's own address is left alone`);
}

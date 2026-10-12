/**
 * How the stories' tests drive the keyboard: what has the focus, the stops of the Tab key, and Enter on a link of a story, which
 * leads its story's own router once.
 */
import assert from 'node:assert/strict';
import type { Page } from 'playwright';
import { expectNone } from '../checks.ts';

/** What has the focus, as its marks say it: its `data-` attributes' names, and its text. */
export const focused = (page: Page): Promise<{ marks: string[]; text: string }> =>
  page.evaluate(() => {
    const at = document.activeElement as HTMLElement | null;
    return { marks: at ? Object.keys(at.dataset) : [], text: at?.textContent ?? '' };
  });

/** Every stop of the Tab key, in order, from the top of the page until it comes back to the first: each by its marks and text. */
export async function tabStops(page: Page): Promise<Array<{ marks: string[]; text: string }>> {
  const stops: Array<{ marks: string[]; text: string }> = [];
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press('Tab');
    const stop = await focused(page);
    if (stops.length > 0 && stop.text === stops[0].text && stop.marks.join() === stops[0].marks.join()) return stops;
    if (stop.marks.length > 0) stops.push(stop);
  }
  throw new Error(`Tab did not come back to its first stop in 40 presses: ${JSON.stringify(stops)}`);
}

/** Presses Tab until what has the focus carries `mark`, a `data-` attribute by its camel-cased name. */
export async function tabTo(page: Page, mark: string): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press('Tab');
    if ((await focused(page)).marks.includes(mark)) return;
  }
  throw new Error(`Tab never reached ${mark}`);
}

/** Waits for two frames of the page: what a press started has been drawn. */
export const drawn = (page: Page): Promise<void> =>
  page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));

/** Where the router of the story `section` finds stands, as its search, and how many times it has moved. */
export const standing = (page: Page, section: string): Promise<{ search: string; moves: number }> =>
  page.locator(`${section} [data-story-ground]`).evaluate((ground) => {
    const at = ground.getAttribute('data-at') ?? '';
    return { search: at.includes('?') ? at.slice(at.indexOf('?')) : '', moves: Number(ground.getAttribute('data-moves')) };
  });

/**
 * Enter on what has the focus, in the story `section` finds, leads its router to `search` by one move, and the page's own address
 * stays where it was.
 */
export async function entersOnce(page: Page, section: string, search: string, what: string): Promise<void> {
  const before = { ...(await standing(page, section)), url: page.url() };
  await page.keyboard.press('Enter');
  await expectNone(
    async () => {
      const at = await standing(page, section);
      return at.search === search ? null : `the story stands on ${at.search || 'its bare address'}`;
    },
    `${what} leads to ${search || 'the bare address'}`,
  );
  await drawn(page);
  assert.equal((await standing(page, section)).moves - before.moves, 1, `${what}: Enter navigates once, never twice`);
  assert.equal(page.url(), before.url, `${what}: the page's own address is left alone`);
}

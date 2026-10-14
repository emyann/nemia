/**
 * The kit's parts draw Material's secondary on the board: in the stories' page (`parts/main.tsx`), built as the board is, a selected
 * tonal toggle's ground, a selected tonal icon toggle's ground, a collapsed rail's active label and a secondary meter's indicator each
 * take the colour of `--md-sys-color-secondary`, in light and dark, and not shadcn's quiet surface. `npm run e2e` runs this first; it
 * needs Chromium.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright';
import { scratch } from '../scratch.ts';
import { WAITED } from '../waits.ts';
import { buildParts, openParts } from './parts/gallery.ts';

const built = scratch('nemia-secondary-');
let browser: Browser;
before(async () => {
  await buildParts(built);
  browser = await chromium.launch();
}, WAITED);
after(async () => {
  await browser?.close();
});

const STORY = '?story=board-secondaryrole--drawn';

/** Each part of the story, by its box's `data-secondary`, the element in it that draws secondary, and the property it draws with. */
const DRAWN: { part: string; element: string; property: 'background-color' | 'color' }[] = [
  { part: 'toggle', element: '[data-slot="button"]', property: 'background-color' },
  { part: 'icon-toggle', element: 'button', property: 'background-color' },
  { part: 'rail', element: '[data-slot="navigation-rail-item"][data-active] > span:last-child', property: 'color' },
  { part: 'meter', element: '[data-slot="meter-active-indicator"]', property: 'background-color' },
];

/** The colour the page computes for a theme variable, read off a probe that paints with it. */
function colourOf(page: Page, variable: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement('div');
    probe.style.backgroundColor = `var(${name})`;
    document.body.append(probe);
    const colour = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return colour;
  }, variable);
}

/** What each part of the story draws secondary with, as `part: colour`. */
function drawnOf(page: Page): Promise<string[]> {
  return Promise.all(
    DRAWN.map(async ({ part, element, property }) => {
      const colour = await page
        .locator(`[data-secondary="${part}"] ${element}`)
        .first()
        .evaluate((node, name) => getComputedStyle(node).getPropertyValue(name), property);
      return `${part}: ${colour}`;
    }),
  );
}

for (const theme of ['light', 'dark'] as const)
  test(`the kit's parts draw Material's secondary in ${theme}, never shadcn's quiet surface`, WAITED, async () => {
    const page = await openParts(browser, built, theme, STORY, { still: true });
    try {
      const secondary = await colourOf(page, '--md-sys-color-secondary');
      const quiet = await colourOf(page, '--md-sys-color-surface-container-highest');
      assert.notEqual(secondary, quiet, 'the two roles differ in this theme, so the comparison can tell them apart');
      assert.deepEqual(
        await drawnOf(page),
        DRAWN.map(({ part }) => `${part}: ${secondary}`),
        "each part draws --md-sys-color-secondary: src/styles.css must leave Tailwind's secondary to the kit's theme",
      );
    } finally {
      await page.context().close();
    }
  });

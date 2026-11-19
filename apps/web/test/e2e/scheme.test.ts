/**
 * Storybook's theme switch reaches the board's styles: in the static build (`stories/built.ts`), a browser that asks for one colour
 * scheme, with the toolbar set to the other, draws the toolbar's — the theme's background role reads the value `theme/theme.css` gives
 * that scheme, and the run's own `dark:` grounds (`look/run.recipe.ts`) follow it — so a person sees any story in light or dark whatever
 * their system asks. `npm run e2e -- --look` runs this, and a whole `npm run e2e` first; it needs Chromium.
 */
import { afterAll, beforeAll, test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { scratch } from 'test-kit/scratch';
import { WAITED } from '../waits.ts';
import { openStory, serveBuilt, storybookFor } from './stories/built.ts';

let browser: Browser;
let served: { at: string; close: () => void };
beforeAll(async () => {
  served = await serveBuilt(await storybookFor(scratch('nemia-scheme-storybook-')));
  browser = await chromium.launch();
}, WAITED.timeout);
afterAll(async () => {
  await browser?.close();
  served?.close();
});

/** A story that draws the run's `dark:` grounds. */
const STORY = 'look-run--every-state';

/** The value `theme/theme.css` gives the background role in each scheme: its root's, and its dark media's. */
const BACKGROUND = (() => {
  const css = fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'theme', 'theme.css'), 'utf8');
  const [light, dark] = [...css.matchAll(/--md-sys-color-background:\s*([^;]+);/g)].map((m) => m[1]!.trim());
  return { light: light!, dark: dark! };
})();

/** The colour a value computes to, read off a probe that paints with it. */
function computed(page: Page, value: string): Promise<string> {
  return page.evaluate((colour) => {
    const probe = document.createElement('div');
    probe.style.backgroundColor = colour;
    document.body.append(probe);
    const drawn = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return drawn;
  }, value);
}

/** What the page draws the background role with, and the first row's ground of the run. */
async function drawnOf(page: Page): Promise<{ background: string; ground: string }> {
  return {
    background: await computed(page, 'var(--md-sys-color-background)'),
    ground: await page
      .locator('[data-story-ground] article')
      .first()
      .evaluate((node) => getComputedStyle(node).backgroundColor),
  };
}

for (const [system, toolbar] of [
  ['dark', 'light'],
  ['light', 'dark'],
] as const)
  test(`a browser asking for ${system}, with the toolbar on ${toolbar}, draws ${toolbar}`, WAITED, async () => {
    const page = await openStory(browser, served.at, system, STORY, { still: true, toolbar });
    const asked = await drawnOf(page);
    assert.equal(asked.background, await computed(page, BACKGROUND[toolbar]), `the background role in ${toolbar}`);
    await page.context().close();
    const same = await openStory(browser, served.at, toolbar, STORY, { still: true });
    assert.deepEqual(asked, await drawnOf(same), `the same as a browser that asks for ${toolbar} itself`);
    await same.context().close();
  });

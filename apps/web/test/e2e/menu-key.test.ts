/**
 * A run's actions open by the keyboard where the run is listed, by the browser's own keys: in the stories of `RunActions`, opened alone in
 * Storybook's static build (`stories/built.ts`), Chromium makes a `contextmenu` of Shift+F10 on a focused row and of the Menu key on a
 * card's focused title, which the kit's `ContextMenu` opens on. A play function's keys are a script's, which the browser makes nothing of
 * (`menuKey`, `.storybook/play.ts`), so this is read here. `npm run e2e -- --look` runs this; it needs Chromium.
 */
import { afterAll, beforeAll, test } from 'vitest';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright';
import { scratch } from 'test-kit/scratch';
import { WAITED } from '../waits.ts';
import { openStory, serveBuilt, storybookFor } from './stories/built.ts';

let browser: Browser;
let served: { at: string; close: () => void };
beforeAll(async () => {
  served = await serveBuilt(await storybookFor(scratch('nemia-menu-key-storybook-')));
  browser = await chromium.launch();
}, WAITED.timeout);
afterAll(async () => {
  await browser?.close();
  served?.close();
});

/** The entries of the run's menu once it is open on the page. */
async function entriesOf(page: Page) {
  const menu = page.getByRole('menu', { name: 'Actions on the run' });
  await menu.waitFor();
  return menu.getByRole('menuitem').allTextContents();
}

test("Shift+F10 on a focused row opens its run's actions", WAITED, async () => {
  const page = await openStory(browser, served.at, 'dark', 'run-runactions--on-a-row');
  try {
    await page.locator('[role="row"][data-run]').first().focus();
    await page.keyboard.press('Shift+F10');
    assert.deepEqual(await entriesOf(page), ['Hold…'], 'the run at work offers its hold');
    await page.keyboard.press('Escape');
    await page.getByRole('menu').waitFor({ state: 'detached' });
  } finally {
    await page.context().close();
  }
});

test("the Menu key on a card's focused title opens its run's actions", WAITED, async () => {
  const page = await openStory(browser, served.at, 'dark', 'run-runactions--on-a-card');
  try {
    await page.locator('article[data-run]').nth(1).getByRole('link').first().focus();
    await page.keyboard.press('ContextMenu');
    assert.deepEqual(await entriesOf(page), ['Lift…'], 'the held run offers the lift');
  } finally {
    await page.context().close();
  }
});

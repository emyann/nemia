/**
 * That a part's own read draws nothing for a moment, so a read that answers sooner does not flash grey (`look/reading.css`), and a
 * route's pending page draws its shapes at once: the look's `Reading` stories opened alone in Storybook's static build
 * (`stories/built.ts`), the group's opacity read where its animation stands just before and just after `--reading-after`. It reads
 * pixels' styles, which a play function cannot hold still, so it is read here and not in `npm run stories`. `npm run e2e -- --look`
 * runs this, and a whole `npm run e2e` first; it needs Chromium.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright';
import { scratch } from 'test-kit/scratch';
import { WAITED } from '../waits.ts';
import { openStory, serveBuilt, storybookFor } from './stories/built.ts';

let browser: Browser;
let served: { at: string; close: () => void };
before(async () => {
  const dir = await storybookFor(scratch('nemia-reading-storybook-'));
  served = await serveBuilt(dir);
  browser = await chromium.launch();
}, WAITED);
after(async () => {
  await browser?.close();
  served?.close();
});

/**
 * The group's hold-back as its style says it (`--reading-after`, 400ms, which the build writes `.4s`), and its opacity with its
 * animation set at each of `at` milliseconds.
 */
const heldAt = (page: Page, at: readonly number[]) =>
  page.locator('[data-slot="skeleton-group"]').evaluate((group, times) => {
    const style = getComputedStyle(group);
    const animations = group.getAnimations();
    const opacities = times.map((time) => {
      for (const animation of animations) {
        animation.pause();
        animation.currentTime = time;
      }
      return getComputedStyle(group).opacity;
    });
    return { name: style.animationName, delay: style.animationDelay, opacities };
  }, at);

test("a part's own read shows its shapes only once it has taken --reading-after, and a pending page's at once", WAITED, async () => {
  const late = await openStory(browser, served.at, 'dark', 'look-reading--late');
  const now = await openStory(browser, served.at, 'dark', 'look-reading--now');
  try {
    assert.deepEqual(await heldAt(late, [0, 399, 401]), {
      name: 'reading-shows',
      delay: '0.4s',
      opacities: ['0', '0', '1'],
    });
    assert.deepEqual(await heldAt(now, [0]), { name: 'none', delay: '0s', opacities: ['1'] });
  } finally {
    await late.context().close();
    await now.context().close();
  }
});

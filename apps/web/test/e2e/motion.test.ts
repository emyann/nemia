/**
 * What moves in the look's stories, and that it holds still for a person who asked for reduced motion: each story opened alone in
 * Storybook's static build (`stories/built.ts`), once as the browser draws motion and once told nothing may move. The second needs the
 * browser's own media (`reducedMotion`), which a play function cannot set, so it is read here and not in `npm run stories`.
 * `npm run e2e -- --look` runs this, and a whole `npm run e2e` first; it needs Chromium.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright';
import { scratch } from 'test-kit/scratch';
import { WAITED } from '../waits.ts';
import { builtIds, openStory, serveBuilt, storybookFor } from './stories/built.ts';

let browser: Browser;
let served: { at: string; close: () => void };
let ids: string[];
before(async () => {
  const dir = await storybookFor(scratch('nemia-motion-storybook-'));
  ids = builtIds(dir);
  served = await serveBuilt(dir);
  browser = await chromium.launch();
}, WAITED);
after(async () => {
  await browser?.close();
  served?.close();
});

/** What moves on each rail of the page: where, whether on the breath's own layer, and how. */
const animated = (page: Page) =>
  page.locator('[data-run-steps]').evaluateAll((rails) =>
    rails.flatMap((rail) =>
      [rail, ...rail.querySelectorAll('*')]
        .map((element) => ({ element, style: getComputedStyle(element) }))
        .filter(({ style }) => style.animationName !== 'none')
        .map(({ element, style }) => ({
          at: element.closest('[data-step]')?.getAttribute('data-state') ?? 'the rail',
          layer: element.hasAttribute('data-step-breath'),
          name: style.animationName,
          duration: style.animationDuration,
          count: style.animationIterationCount,
          easing: style.animationTimingFunction,
        })),
    ),
  );

test(
  "REFUSED: the step at work's glow breathes on a layer of its own, and nothing else on a rail moves, nor it under reduced motion",
  WAITED,
  async () => {
    const rails = ids.filter((id) => id.startsWith('look-runsteps--'));
    assert.ok(rails.length >= 2, `the rail's stories are built: ${rails.join(' ')}`);
    const states: (string | null)[] = [];
    const moving: Awaited<ReturnType<typeof animated>> = [];
    const still: Awaited<ReturnType<typeof animated>> = [];
    for (const id of rails) {
      const page = await openStory(browser, served.at, 'dark', id);
      const held = await openStory(browser, served.at, 'dark', id, { still: true });
      try {
        states.push(
          ...(await page.locator('[data-run-steps] [data-step]').evaluateAll((bars) => bars.map((bar) => bar.getAttribute('data-state')))),
        );
        moving.push(...(await animated(page)));
        still.push(...(await animated(held)));
      } finally {
        await page.context().close();
        await held.context().close();
      }
    }
    assert.ok(states.includes('awaiting-approval') && states.includes('failed-check'), `the stories draw other states: ${states}`);
    const breath = {
      at: 'working',
      layer: true,
      name: 'step-breath',
      duration: '2.6s',
      count: 'infinite',
      easing: 'cubic-bezier(0.2, 0, 0, 1)',
    };
    assert.deepEqual(moving, [breath, breath], 'the two rails at work breathe, each on its layer alone');
    assert.deepEqual(still, [], 'under reduced motion, nothing on a rail moves');
  },
);

/** The running line's title in Trace's story of it: the animation it runs and the image its text is painted with. */
const shimmerOf = (page: Page): Promise<{ animation: string; image: string }> =>
  page
    .locator('[data-status="running"] [data-slot="trace-title"]')
    .evaluate((title) => ({ animation: getComputedStyle(title).animationName, image: getComputedStyle(title).backgroundImage }));

test("a trace's running title shimmers, and holds still where the person asked for reduced motion", WAITED, async () => {
  const moving = await openStory(browser, served.at, 'dark', 'look-trace--running');
  const still = await openStory(browser, served.at, 'dark', 'look-trace--running', { still: true });
  try {
    const shimmer = await shimmerOf(moving);
    assert.equal(shimmer.animation, 'tw-shimmer', 'it shimmers');
    assert.match(shimmer.image, /gradient/);
    assert.deepEqual(await shimmerOf(still), { animation: 'none', image: 'none' });
  } finally {
    await moving.context().close();
    await still.context().close();
  }
});

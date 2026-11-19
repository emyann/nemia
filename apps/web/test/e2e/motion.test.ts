/**
 * What moves in the look's stories, and that it holds still for a person who asked for reduced motion: each story opened alone in
 * Storybook's static build (`stories/built.ts`), once as the browser draws motion and once told nothing may move. The second needs the
 * browser's own media (`reducedMotion`), which a play function cannot set, so it is read here and not in `npm run stories`.
 * `npm run e2e -- --look` runs this, and a whole `npm run e2e` first; it needs Chromium.
 */
import { afterAll, beforeAll, test } from 'vitest';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright';
import { scratch } from 'test-kit/scratch';
import { WAITED } from '../waits.ts';
import { builtIds, openStory, serveBuilt, storybookFor } from './stories/built.ts';

let browser: Browser;
let served: { at: string; close: () => void };
let ids: string[];
beforeAll(async () => {
  const dir = await storybookFor(scratch('nemia-motion-storybook-'));
  ids = builtIds(dir);
  served = await serveBuilt(dir);
  browser = await chromium.launch();
}, WAITED.timeout);
afterAll(async () => {
  await browser?.close();
  served?.close();
});

/** What moves on each graph of the page: where, whether on the pulse's own layer, and how. */
const animated = (page: Page) =>
  page.locator('[data-run-steps]').evaluateAll((rails) =>
    rails.flatMap((rail) =>
      [rail, ...rail.querySelectorAll('*')]
        .map((element) => ({ element, style: getComputedStyle(element) }))
        .filter(({ style }) => style.animationName !== 'none')
        .map(({ element, style }) => ({
          at: element.closest('[data-step]')?.getAttribute('data-state') ?? 'the graph',
          layer: element.hasAttribute('data-step-pulse'),
          name: style.animationName,
          duration: style.animationDuration,
          count: style.animationIterationCount,
          easing: style.animationTimingFunction,
        })),
    ),
  );

test(
  'REFUSED: the step at work, or its check, pulses on a layer of its own, and nothing else on a graph moves, nor it under reduced motion',
  WAITED,
  async () => {
    const rails = ids.filter((id) => id.startsWith('look-stepgraph--'));
    assert.ok(rails.length >= 2, `the graph's stories are built: ${rails.join(' ')}`);
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
    const pulse = (at: string) => ({
      at,
      layer: true,
      name: 'step-pulse',
      duration: '2.4s',
      count: 'infinite',
      easing: 'cubic-bezier(0.2, 0, 0, 1)',
    });
    const at = states.filter((state) => state === 'working' || state === 'checking');
    assert.ok(at.includes('working') && at.includes('checking'), `the stories draw a step at work and one checked: ${states}`);
    assert.deepEqual(moving, at.map(pulse), 'each step at work or checked pulses, on its layer alone, and nothing else moves');
    assert.deepEqual(still, [], 'under reduced motion, nothing on a graph moves');
  },
);

/** The running line's title in Trace's story of it: the animation it runs and the image its text is painted with. */
const shimmerOf = (page: Page) =>
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

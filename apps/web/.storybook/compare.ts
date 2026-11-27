/**
 * The stories project's comparison, a setup file of `vitest.config.ts`'s `storybook` project and never of a person's Storybook: once a
 * story has passed (it drew, its play function ran, axe found nothing), its ground is compared against its approved picture in the dark
 * theme, `test/approved/<story id>.png`, and a light canary's again in the light theme, `test/approved/light/<story id>.png`
 * (`approved.ts`). A story that draws the same passes and leaves no file; one that differs fails, its reference, actual and diff left
 * under the project's attachments folder; `npm run stories -- --update` writes the pictures that differ.
 *
 * The clock is faked and stands at one instant, so a relative or absolute time draws the same on every run, and the browser's zone and
 * locale are the config's, and it asks for reduced motion, which stops the canvases' one animation. Before each picture the pointer is
 * moved off the story, as the addon does before each test (`resetMousePosition`), since Chromium may keep a hover where nothing moved,
 * a read still out draws its skeleton at once, and the ground is painted again whole (`repainted`), so a part painted late never races
 * the picture. The comparison runs only in the pinned place (`test/e2e/stories/pinned.ts`, which
 * provides `approvedCompare`):
 * anywhere else the stories run as before, and the first one says that nothing was compared.
 */
import { afterEach, expect, inject, vi } from 'vitest';
import { commands, page } from 'vitest/browser';
import { LIGHT_CANARIES, pictureName } from './approved.ts';
import { SCHEME_CLASSES, type Scheme } from './scheme.ts';

declare module 'vitest' {
  interface ProvidedContext {
    approvedCompare: boolean;
  }
  interface TaskMeta {
    storyId?: string;
  }
}

declare module 'vitest/browser' {
  interface BrowserCommands {
    scheme: (theme: Scheme) => Promise<void>;
    resetMousePosition: () => Promise<void>;
  }
}

/** The instant every story's clock starts from. */
const NOW = new Date('2026-11-12T12:00:00.000Z');

vi.useFakeTimers({ toFake: ['Date'], now: NOW });

/** A read still out draws its skeleton at once, never faded in after `--reading-after` (`look/reading.css`), which a picture would race. */
const AT_ONCE = document.createElement('style');
AT_ONCE.textContent = '.reading-late { animation: none !important; }';
document.head.append(AT_ONCE);

/** What every picture is taken with: nothing moving, no caret. */
const STILL = { screenshotOptions: { animations: 'disabled', caret: 'hide' } } as const;

/**
 * Waits until the page has drawn `count` frames.
 * @param count How many frames.
 */
const frames = async (count: number) => {
  for (let frame = 0; frame < count; frame += 1) await new Promise((drawn) => requestAnimationFrame(drawn));
};

/**
 * Has Chromium paint `ground` again whole, by giving it a ground of its own for two frames and taking it off. What a story drew is painted in its first
 * frame, and parts of it may be painted again later on their own (the grain under a cut frame's ground, `look/grain.css`, lands a frame
 * or so after it), and a diagonal at a fraction of a pixel comes out a shade apart when only a part of the page around it is painted
 * again: whether that late paint came before the picture was a race (Frame/OverviewStrip's Quiet Day, one pixel off in one CI run in
 * three). Painted again whole, the picture is the same whichever came first.
 * @param ground The story's ground.
 */
const repainted = async (ground: HTMLElement) => {
  ground.style.backgroundColor = 'black';
  await frames(2);
  ground.style.backgroundColor = '';
  await frames(2);
};

let said = false;

/**
 * Has the frame stand as tall as `ground`, so a picture holds the whole story: Vitest draws a story in a frame the viewport's size, and
 * what overflows it is not drawn.
 */
const tallEnough = async (ground: Element) => {
  const height = Math.ceil(ground.getBoundingClientRect().height);
  if (height > window.innerHeight) await page.viewport(window.innerWidth, height);
};

/** Has `<html>` carry the class of `theme` alone, as the toolbar's switch does. */
const classFor = (theme: Scheme) => {
  const root = document.documentElement;
  root.classList.remove(SCHEME_CLASSES.light, SCHEME_CLASSES.dark);
  root.classList.add(SCHEME_CLASSES[theme]);
};

afterEach(async ({ task }) => {
  const id = task.meta.storyId;
  if (typeof id !== 'string' || task.result?.state === 'fail' || (task.result?.errors?.length ?? 0) > 0) return;
  if (!inject('approvedCompare')) {
    if (!said) console.warn('the stories were compared against no approved picture: run them in the pinned place, npm run stories');
    said = true;
    return;
  }
  const ground = document.querySelector<HTMLElement>('[data-story-ground]');
  if (!ground) throw new Error(`the story ${id} drew no ground to compare: draw it under .storybook/preview.tsx's decorator`);
  await commands.resetMousePosition();
  await tallEnough(ground);
  await repainted(ground);
  await expect(page.elementLocator(ground)).toMatchScreenshot(pictureName(id, 'dark'), STILL);
  if (!LIGHT_CANARIES.includes(id)) return;
  await commands.scheme('light');
  classFor('light');
  try {
    await tallEnough(ground);
    await repainted(ground);
    await expect(page.elementLocator(ground)).toMatchScreenshot(pictureName(id, 'light'), STILL);
  } finally {
    await commands.scheme('dark');
    classFor('dark');
  }
});

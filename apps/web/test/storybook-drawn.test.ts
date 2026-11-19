/**
 * What the stories' Storybook holds with no browser: a story that throws or draws nothing is refused after it draws (`undrawn`,
 * `.storybook/drawn.ts`, which the preview's `afterEach` runs on every story in `npm run stories`), and the stories but the page bodies'
 * are thirty and more; the router's plugin is left out of the board's Vite config where the stories are built, and every other plugin
 * kept (`withoutTheRouter`, `.storybook/router.ts`, which `main.ts` and `vitest.config.ts` both take).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'vitest';
import type { PluginOption } from 'vite';
import { files, REPO } from 'test-kit/repo';
import { undrawn, type StoryDrawn } from '../.storybook/drawn.ts';
import { ofTheRouter, withoutTheRouter } from '../.storybook/router.ts';
import { storyModuleOf } from './stories.ts';

test('REFUSED: a story that throws or draws nothing; one that draws is passed', () => {
  const fixture: StoryDrawn[] = [
    { id: 'look-a--fine', broken: null, height: 40 },
    { id: 'look-a--throws', broken: 'no such part', height: 20 },
    { id: 'look-a--empty', broken: null, height: 0 },
  ];
  assert.deepEqual(undrawn(fixture), ['look-a--throws threw: no such part', 'look-a--empty draws nothing']);
});

test("the stories but the page bodies' are thirty and more, each of which npm run stories draws", () => {
  const drawn = files()
    .filter((file) => /^apps\/web\/src\/components\/.+\.stories\.tsx$/.test(file) && !/\/components\/(ui|ai-elements)\//.test(file))
    .map((file) => storyModuleOf(fs.readFileSync(path.join(REPO, file), 'utf8')))
    .filter((module) => !module.title?.startsWith('Pages/'))
    .flatMap((module) => module.stories);
  assert.ok(drawn.length >= 30, `the stories but the page bodies': ${drawn.length}`);
});

test("REFUSED: the router's plugin, alone or in a list, is left out of the board's config; every other plugin is kept", async () => {
  const named = (name: string) => ({ name });
  assert.equal(ofTheRouter(named('tanstack-router:generator')), true);
  assert.equal(ofTheRouter([named('vite:react'), [named('tanstack-router:code-splitter')]]), true, 'in a list in a list');
  assert.equal(ofTheRouter(named('vite:react')), false);
  assert.equal(ofTheRouter(null), false);
  const board = (await import('../vite.config.ts')).default as { plugins?: PluginOption[] };
  assert.ok(board.plugins?.some(ofTheRouter), "the board's own config holds the router's plugin, which writes the route tree");
  const kept = withoutTheRouter(board.plugins);
  assert.equal(kept.some(ofTheRouter), false, "the stories' config holds none of it");
  assert.equal(kept.length, (board.plugins ?? []).length - 1, 'and every other plugin, the compiler, React and Tailwind');
});

/**
 * Dark answering to the root as well as to the system (`src/stylesheet/stylesheet.ts`): a system-dark root block is written twice, the
 * light root says light too, and a compiled sheet that still darkens on the system alone is named.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { darkOnTheSystemAlone, darkTwice, lightToo } from '../src/stylesheet/stylesheet.ts';

const SHEET = ':root {\n  --ink: black;\n}\n@media (prefers-color-scheme: dark) {\n  :root {\n    --ink: white;\n  }\n}\n';

test('a system-dark root is kept for the system but not on a root that says light, and written again for one that says dark', () => {
  const twice = darkTwice(SHEET);
  assert.ok(twice.includes('@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]):not(.light) {\n    --ink: white;'));
  assert.ok(twice.includes(':root[data-theme="dark"], [data-theme="dark"], .dark {\n    --ink: white;'));
  assert.deepEqual(darkOnTheSystemAlone(twice), []);
});

test('the light root also answers to a root or a part that says light', () => {
  assert.ok(lightToo(SHEET).startsWith(':root, [data-theme="light"], .light {'));
});

test('REFUSED: a compiled dark block left on a bare root is named by its selector', () => {
  const left =
    '@media (prefers-color-scheme: dark){.card{color:white}}@media (prefers-color-scheme: dark){:root:not([data-theme=light]){--a:1}}';
  assert.deepEqual(darkOnTheSystemAlone(left), ['.card']);
});

/**
 * The board's stories, held by the rules of `stories.ts`: each is first made to refuse on a fixture that breaks it, then run on the
 * tree against `stories.baseline.ts`, whose lists only shrink. A file that breaks a rule and is not listed is refused, and so is a
 * listed one that no longer breaks it, so the list is cut in the change that mends it. The categories rule has no list.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { files, REPO } from 'test-kit/repo';
import { DESTINATIONS, EXEMPT } from './destinations.ts';
import { a11yTodos, argless, handDrawn, mapGaps, offCategory, secondSystem, storyless, storyModuleOf } from './stories.ts';
import { BASELINE } from './stories.baseline.ts';

/** The board's files that are there, from the workspace root. */
const board = (): string[] => files().filter((file) => file.startsWith('apps/web/') && fs.existsSync(path.join(REPO, file)));

/** The text of `file`, from the workspace root. */
const textOf = (file: string): string => fs.readFileSync(path.join(REPO, file), 'utf8');

/** Each story file of the board but the vendored folders', with what `storyModuleOf` reads of it. */
const storyModules = (all: readonly string[]) =>
  all
    .filter((file) => /^apps\/web\/src\/components\/.+\.stories\.tsx$/.test(file) && !/\/components\/(ui|ai-elements)\//.test(file))
    .map((file) => ({ file, module: storyModuleOf(textOf(file)) }));

/** What `found` holds that `listed` does not (`added`), and what `listed` holds that `found` no longer does (`stale`). */
const against = (found: readonly string[], listed: readonly string[]) => ({
  added: found.filter((one) => !listed.includes(one)),
  stale: listed.filter((one) => !found.includes(one)),
});

/** Asserts `found` is `listed` exactly, naming what to add a story for and what to cut from the baseline's `list`. */
const heldTo = (found: readonly string[], listed: readonly string[], list: string): void => {
  const { added, stale } = against(found, listed);
  assert.deepEqual(added, [], `mend each of these, never add it to ${list} in test/stories.baseline.ts`);
  assert.deepEqual(stale, [], `each of these is mended: cut it from ${list} in test/stories.baseline.ts`);
};

const STORY = (body: string) => `import type { Meta, StoryObj } from '@storybook/react-vite';\n${body}`;

test('REFUSED: a component with no story beside it; the vendored folders and a story owe none', () => {
  assert.deepEqual(
    storyless([
      'apps/web/src/components/run/Foo.tsx',
      'apps/web/src/components/run/Bar.tsx',
      'apps/web/src/components/run/Bar.stories.tsx',
      'apps/web/src/components/ui/ds/Button.tsx',
      'apps/web/src/components/ai-elements/Message.tsx',
    ]),
    ['apps/web/src/components/run/Foo.tsx'],
  );
});

test('REFUSED: a story given no args, by its meta or itself', () => {
  const none = storyModuleOf(
    STORY(`const meta: Meta = { title: 'Run/X' };\nexport default meta;\nexport const A: StoryObj = { render: () => null };`),
  );
  assert.deepEqual(argless('x.stories.tsx', none), ['x.stories.tsx#A']);
  const own = storyModuleOf(STORY(`export default { title: 'Run/X' };\nexport const A: StoryObj = { args: { n: 1 } };`));
  assert.deepEqual(argless('x.stories.tsx', own), []);
  const meta = storyModuleOf(
    STORY(`const meta = { title: 'Run/X', args: { n: 1 } } satisfies Meta;\nexport default meta;\nexport const A = {};`),
  );
  assert.deepEqual(argless('x.stories.tsx', meta), []);
});

test("REFUSED: a title outside the board's categories, or none", () => {
  assert.equal(offCategory(storyModuleOf(STORY(`export default { title: 'Board/X' };`))), true);
  assert.equal(offCategory(storyModuleOf(STORY(`export default {};`))), true);
  assert.equal(offCategory(storyModuleOf(STORY(`export default { title: 'Run/X' };`))), false);
});

test("REFUSED: a part of shadcn's ui/ or React Aria imported outside the kit and the look, by each name it takes", () => {
  const file = 'apps/web/src/components/step/X.tsx';
  const source = [
    `import { Button as AriaButton, Dialog } from 'react-aria-components';`,
    `import type { TraceStatus } from '../ui/trace';`,
    `import Sheet from '@/components/ui/sheet';`,
    `import * as Tabs from '@/components/ui/tabs.tsx';`,
    `import { Card } from '../ui/ds';`,
    `import { Badge } from '../ui/badge';`,
    `import { Badge as Tag } from '@/components/ui/badge';`,
    `const later = () => import('@/components/ui/alert');`,
    `export { Label as FieldLabel } from '../ui/label';`,
    `export * from '@/components/ui/switch';`,
  ].join('\n');
  assert.deepEqual(
    secondSystem(file, source).map(({ module, name }) => `${module}:${name}`),
    [
      'react-aria-components:Button',
      'react-aria-components:Dialog',
      '@/components/ui/trace:TraceStatus',
      '@/components/ui/sheet:default',
      '@/components/ui/tabs:*',
      '@/components/ui/badge:Badge',
      '@/components/ui/alert:*',
      '@/components/ui/label:Label',
      '@/components/ui/switch:*',
    ],
  );
  assert.equal(secondSystem('apps/web/src/components/look/X.tsx', source).length, 0, 'the look draws on React Aria');
  assert.equal(secondSystem('apps/web/src/components/ui/ds/X.tsx', source).length, 0, 'so does the kit');
});

test('REFUSED: a control drawn by hand, by its element or a class string of lib/classes.ts, once each', () => {
  const file = 'apps/web/src/components/gate/X.tsx';
  const source = [
    `import { BUTTON, FLOOR_BOX } from '../../lib/classes';`,
    `import { Button } from '@/components/ui/ds';`,
    `export const X = () => (<div className={FLOOR_BOX}><button className={BUTTON} /><input type="checkbox"/>`,
    `<input value="x" /><input type="radio" /><input type={'radio'} /><input {...props} />`,
    `<select><option /></select><select></select><Button>ok</Button></div>);`,
  ].join('\n');
  assert.deepEqual([...handDrawn(file, source)].sort(), [
    '<button>',
    '<input type="checkbox">',
    '<input type="radio">',
    '<input>',
    '<select>',
    '@/lib/classes:BUTTON',
  ]);
  assert.equal(handDrawn('apps/web/src/components/look/X.tsx', source).length, 0, 'the look draws its own');
  assert.equal(handDrawn('apps/web/src/components/ui/ds/X.tsx', source).length, 0, 'so does the kit');
});

test('REFUSED: a key the board takes that the map gives no destination, and a destination nothing takes', () => {
  const { unmapped, unused } = mapGaps(['<button>', '<select>'], ['<button>', '<input>']);
  assert.deepEqual([...unmapped], ['<select>']);
  assert.deepEqual([...unused], ['<input>']);
});

test('REFUSED: a story whose axe is todo, by its meta or itself', () => {
  const own = storyModuleOf(
    STORY(
      `export default { title: 'Run/X' };\nexport const A: StoryObj = { parameters: { a11y: { test: 'todo' } } };\nexport const B = {};`,
    ),
  );
  assert.deepEqual(a11yTodos('x.stories.tsx', own), ['x.stories.tsx#A']);
  const meta = storyModuleOf(STORY(`export default { title: 'Run/X', parameters: { a11y: { test: 'todo' } } };\nexport const A = {};`));
  assert.deepEqual(a11yTodos('x.stories.tsx', meta), ['x.stories.tsx#A']);
});

test('REFUSED: a baseline that grows, and one that keeps an entry since mended', () => {
  assert.deepEqual(against(['a', 'b'], ['a']).added, ['b']);
  assert.deepEqual(against(['a'], ['a', 'b']).stale, ['b']);
});

test("the board's stories: every story titled in a category, and each other rule held to its baseline", () => {
  const all = board();
  const modules = storyModules(all);
  assert.ok(modules.length > 0, 'the board has stories');
  assert.deepEqual(
    modules.filter(({ module }) => offCategory(module)).map(({ file, module }) => `${file}: ${module.title}`),
    [],
    'title each story under Look/, Frame/, Store/, Factory/, Run/ or Pages/, by where its part sits',
  );
  heldTo(storyless(all), BASELINE.storyless, 'storyless');
  heldTo(
    modules.flatMap(({ file, module }) => argless(file, module)),
    BASELINE.argless,
    'argless',
  );
  const sources = all.filter((file) => /\.tsx?$/.test(file)).map((file) => ({ file, source: textOf(file) }));
  const imported = sources.flatMap(({ file, source }) =>
    secondSystem(file, source).map(({ module, name }) => ({ file, key: `${module}:${name}` })),
  );
  const drawn = sources.flatMap(({ file, source }) => handDrawn(file, source).map((key) => ({ file, key })));
  heldTo(
    imported.filter(({ key }) => !EXEMPT.includes(key)).map(({ file, key }) => `${file}#${key}`),
    BASELINE.secondSystem,
    'secondSystem',
  );
  heldTo(
    drawn.map(({ file, key }) => `${file}#${key}`),
    BASELINE.handDrawn,
    'handDrawn',
  );
  const { unmapped, unused } = mapGaps([...new Set([...imported, ...drawn].map(({ key }) => key))], Object.keys(DESTINATIONS));
  assert.deepEqual([...unmapped], [], 'give each of these its destination in test/destinations.ts');
  assert.deepEqual([...unused], [], 'nothing takes these any more: cut each from test/destinations.ts');
  heldTo(
    modules.flatMap(({ file, module }) => a11yTodos(file, module)),
    BASELINE.a11yTodo,
    'a11yTodo',
  );
});

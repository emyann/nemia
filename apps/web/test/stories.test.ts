/**
 * The board's stories, held by the rules of `stories.ts`: each is first made to refuse on a fixture that breaks it, then run on the
 * tree against the baseline, `test/baseline/` (`baseline.ts`), whose lists only shrink. A file that breaks a rule and is not listed is
 * refused, and so is a listed one that no longer breaks it, so the list is cut in the change that mends it: its line, or its file
 * where it is the last. The categories rule has no list. The baseline's folder is held to its layout: each entry in its source file's
 * file, no file empty, and nothing else there.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'vitest';
import { files, REPO } from 'test-kit/repo';
import { scratch } from 'test-kit/scratch';
import { FOLDER, LISTS, misfiled, readBaseline, shardOf } from './baseline.ts';
import type { BaselineList } from '../contracts/baseline-shard.contract.ts';
import { DESTINATIONS, EXEMPT } from './destinations.ts';
import { a11yTodos, argless, handDrawn, mapGaps, offCategory, secondSystem, seenOnceFound, storyless, storyModuleOf } from './stories.ts';

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

/** The entries the tree's baseline lists on `list`, every file's lines together. */
const listed = (list: BaselineList): string[] => readBaseline(REPO).lists[list].flatMap(({ entries }) => entries);

/**
 * Asserts `found` is the baseline's `list` exactly, naming what to add a story for, and for each mended entry the file it is cut
 * from: the line, or the whole file where it is the last.
 */
const heldTo = (found: readonly string[], list: BaselineList): void => {
  const { added, stale } = against(found, listed(list));
  assert.deepEqual(added, [], `mend each of these, never add it to ${FOLDER}${list}/`);
  assert.deepEqual(
    stale.map((entry) => `${shardOf(list, entry)}: ${entry}`),
    [],
    'each of these is mended: cut its line from the file named, and delete the file where it is the last line (git rm <file>)',
  );
};

/** Writes each of `planted` under `root`, by its path from the workspace root, with its text. */
const plant = (root: string, planted: Readonly<Record<string, string>>): void => {
  for (const [file, text] of Object.entries(planted)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
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

test("REFUSED: a control drawn by hand, by its element, an input by the look's CutField that frames it, or a class string of lib/classes.ts, once each", () => {
  const file = 'apps/web/src/components/gate/X.tsx';
  const source = [
    `import { BUTTON, FLOOR_BOX } from '../../lib/classes';`,
    `import { Button } from '@/components/ui/ds';`,
    `export const X = () => (<div className={FLOOR_BOX}><button className={BUTTON} /><input type="checkbox"/>`,
    `<input value="x" /><input type="radio" /><input type={'radio'} /><input {...props} />`,
    `<select><option /></select><select></select><Button>ok</Button><CutField><label><input value="y" /></label></CutField></div>);`,
  ].join('\n');
  assert.deepEqual([...handDrawn(file, source)].sort(), [
    '<CutField><input>',
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

test('REFUSED: a play that reads a part visible the moment a find answers; a wait for it to show passes', () => {
  const source = [
    `await expect(await screen.findByRole('option', { name: 'Auto' })).toBeVisible();`,
    `await expect(await within(page).findByText('x')).not.toBeVisible();`,
    `await expect(await findAllByText('x')).toBeVisible();`,
    `await waitFor(() => expect(screen.getByRole('option')).toBeVisible());`,
    `await expect(await page.findByRole('switch')).not.toBeChecked();`,
    `const found = await page.findByText('x');`,
    `await expect(found).toBeVisible();`,
  ].join('\n');
  assert.deepEqual(seenOnceFound(source), [1, 2, 3]);
});

test('REFUSED: a baseline that grows, and one that keeps an entry since mended', () => {
  assert.deepEqual(against(['a', 'b'], ['a']).added, ['b']);
  assert.deepEqual(against(['a'], ['a', 'b']).stale, ['b']);
});

test("REFUSED: a baseline entry filed in another source file's file, an empty file, and a file of no list", () => {
  const root = scratch('web-baseline-');
  const home = `${FOLDER}storyless/components/run/Bar.tsx.txt`;
  const other = `${FOLDER}storyless/components/run/Foo.tsx.txt`;
  const keyed = `${FOLDER}secondSystem/components/run/Bar.tsx.txt`;
  plant(root, {
    [home]: 'apps/web/src/components/run/Bar.tsx\n',
    [other]: 'apps/web/src/components/run/Foo.tsx\napps/web/src/components/run/Bar.tsx\n',
    [`${FOLDER}storyless/components/run/Baz.tsx.txt`]: '',
    [keyed]:
      'apps/web/src/components/run/Bar.tsx#@/components/ui/badge:Badge\napps/web/src/components/run/Foo.tsx#react-aria-components:Dialog\n',
    [`${FOLDER}storyless/components/run/Qux.tsx.ts`]: 'apps/web/src/components/run/Qux.tsx\n',
    [`${FOLDER}nowhere/components/run/Qux.tsx.txt`]: 'apps/web/src/components/run/Qux.tsx\n',
    [`${FOLDER}README.md`]: 'x\n',
  });
  const read = readBaseline(root);
  assert.deepEqual(misfiled('storyless', read.lists.storyless), {
    astray: [{ file: other, entry: 'apps/web/src/components/run/Bar.tsx' }],
    empty: [`${FOLDER}storyless/components/run/Baz.tsx.txt`],
  });
  assert.deepEqual(misfiled('secondSystem', read.lists.secondSystem), {
    astray: [{ file: keyed, entry: 'apps/web/src/components/run/Foo.tsx#react-aria-components:Dialog' }],
    empty: [],
  });
  assert.deepEqual(misfiled('argless', read.lists.storyless).astray.length, 3, "a file of one list read as another's is astray whole");
  assert.deepEqual(
    [...read.strays].sort(),
    [`${FOLDER}README.md`, `${FOLDER}nowhere/components/run/Qux.tsx.txt`, `${FOLDER}storyless/components/run/Qux.tsx.ts`].sort(),
  );
  assert.deepEqual(read.lists.storyless.find(({ file }) => file === other)?.entries, [
    'apps/web/src/components/run/Foo.tsx',
    'apps/web/src/components/run/Bar.tsx',
  ]);
});

test("the baseline's folder: each entry in its source file's file, no file empty, nothing else there, and no one-file baseline left", () => {
  const { lists, strays } = readBaseline(REPO);
  for (const list of LISTS) {
    const { astray, empty } = misfiled(list, lists[list]);
    assert.deepEqual(
      astray.map(({ file, entry }) => `${file}: ${entry} belongs in ${shardOf(list, entry)}`),
      [],
      'move each of these lines to the file named',
    );
    assert.deepEqual([...empty], [], 'delete each of these files: a mended file is deleted, never left empty (git rm <file>)');
  }
  assert.deepEqual([...strays], [], `only ${FOLDER}<list>/<path under apps/web/src>.txt belongs here: move or delete each of these`);
  assert.equal(
    fs.existsSync(path.join(REPO, 'apps/web/test/stories.baseline.ts')),
    false,
    'the baseline moved to test/baseline/: git rm apps/web/test/stories.baseline.ts, run npx vitest run --project=node test/stories.test.ts from apps/web, and cut from test/baseline/ what it names',
  );
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
  heldTo(storyless(all), 'storyless');
  heldTo(
    modules.flatMap(({ file, module }) => argless(file, module)),
    'argless',
  );
  const sources = all.filter((file) => /\.tsx?$/.test(file)).map((file) => ({ file, source: textOf(file) }));
  const imported = sources.flatMap(({ file, source }) =>
    secondSystem(file, source).map(({ module, name }) => ({ file, key: `${module}:${name}` })),
  );
  const drawn = sources.flatMap(({ file, source }) => handDrawn(file, source).map((key) => ({ file, key })));
  heldTo(
    imported.filter(({ key }) => !EXEMPT.includes(key)).map(({ file, key }) => `${file}#${key}`),
    'secondSystem',
  );
  heldTo(
    drawn.map(({ file, key }) => `${file}#${key}`),
    'handDrawn',
  );
  const { unmapped, unused } = mapGaps([...new Set([...imported, ...drawn].map(({ key }) => key))], Object.keys(DESTINATIONS));
  assert.deepEqual([...unmapped], [], 'give each of these its destination in test/destinations.ts');
  assert.deepEqual([...unused], [], 'nothing takes these any more: cut each from test/destinations.ts');
  assert.deepEqual(
    modules.flatMap(({ file }) => seenOnceFound(textOf(file)).map((line) => `${file}:${line}`)),
    [],
    'wait for each part to show, waitFor(() => expect(<…>.getBy…(…)).toBeVisible()), never on the find alone',
  );
  heldTo(
    modules.flatMap(({ file, module }) => a11yTodos(file, module)),
    'a11yTodo',
  );
});

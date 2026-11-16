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
import { a11yTodos, argless, offCategory, secondSystem, storyless, storyModuleOf } from './stories.ts';
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

test("REFUSED: a part of shadcn's ui/ or React Aria imported outside the kit and the look", () => {
  const source = `import { Button } from '@/components/ui/button';\nimport { Dialog } from 'react-aria-components';\nimport { Card } from '../ui/ds';\n`;
  assert.deepEqual(secondSystem('apps/web/src/components/run/X.tsx', source), ['@/components/ui/button', 'react-aria-components']);
  assert.deepEqual(secondSystem('apps/web/src/components/run/X.tsx', `import { Tag } from '../ui/badge';`), ['../ui/badge']);
  assert.deepEqual(secondSystem('apps/web/src/components/look/X.tsx', source), [], 'the look draws on React Aria');
  assert.deepEqual(secondSystem('apps/web/src/components/ui/ds/X.tsx', source), [], 'so does the kit');
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
  heldTo(
    all.filter((file) => /\.tsx?$/.test(file)).filter((file) => secondSystem(file, textOf(file)).length > 0),
    BASELINE.secondSystem,
    'secondSystem',
  );
  heldTo(
    modules.flatMap(({ file, module }) => a11yTodos(file, module)),
    BASELINE.a11yTodo,
    'a11yTodo',
  );
});

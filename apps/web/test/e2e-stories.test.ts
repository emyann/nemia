/**
 * The story pictures' tool (`e2e/stories/shoot.ts`) with no browser, on a planted git tree: a story importing a part importing a lib
 * file. What a change touches is read along the first parent, so what a merged branch changed is not the work's; `--list` prints
 * Storybook's ids and launches nothing; a changed part no story reaches is refused, exit 1, named; what every story is drawn in (the
 * preview, what it imports, the stylesheets those import) reaches every story. Each case a row.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';

const SHOOT = path.join(import.meta.dirname, 'e2e', 'stories', 'shoot.ts');

/** Writes `files` under `root`, each by its path from it. */
const write = (root: string, files: Record<string, string>): void => {
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
};

/** Runs git in `root`, as a fixed author, its output trimmed. */
const git = (root: string, ...args: string[]): string =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], {
    cwd: root,
    encoding: 'utf8',
  }).trim();

/** Commits every file under `root` with `message`, and its id. */
const commit = (root: string, message: string): string => {
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
};

const MONEY = 'apps/web/src/lib/money.ts';
const CARD = 'apps/web/src/components/run/Card.tsx';
const BARE = 'apps/web/src/components/run/Bare.tsx';
const LONE = 'apps/web/src/components/look/Lone.tsx';
const TAG_STORIES = 'apps/web/src/components/look/Tag.stories.tsx';
const PREVIEW = 'apps/web/.storybook/preview.tsx';
const STYLES = 'apps/web/src/styles.css';
const THEME = 'apps/web/theme/theme.css';
const KIT_THEME = 'apps/web/src/components/ui/ds/tokens/theme.css';
const GRAIN = 'apps/web/src/components/look/grain.css';
const DRAWN = 'apps/web/.storybook/drawn.ts';

/** A repository with a part, its story, a lib file it imports, a story of the look reaching nothing, and two parts with no story. */
function planted(): { root: string; base: string } {
  const root = scratch('stories-shoot-');
  git(root, 'init', '-q', '-b', 'main');
  write(root, {
    [MONEY]: 'export const dollars = (n: number) => String(n);\n',
    [CARD]: "import { dollars } from '@/lib/money';\nexport function Card() { return <p>{dollars(1)}</p>; }\n",
    'apps/web/src/components/run/Card.stories.tsx':
      "import type { Meta, StoryObj } from '@storybook/react-vite';\nimport { Card } from './Card';\n" +
      "const meta: Meta = { title: 'Run/Card' };\nexport default meta;\n" +
      'export const Wide: StoryObj = { render: () => <Card /> };\nexport const NarrowOne: StoryObj = { render: () => <Card /> };\n',
    [TAG_STORIES]: "export default { title: 'Look/Tag' };\nexport const Plain = {};\n",
    [BARE]: 'export function Bare() { return null; }\n',
    [LONE]: 'export function Lone() { return null; }\n',
    [PREVIEW]:
      "import { x } from 'react';\nimport '../src/styles.css';\nimport { undrawn } from './drawn';\n" +
      "import { Lone } from '../src/components/look';\nexport default {};\n",
    'apps/web/src/components/look/index.ts': "export { Lone } from './Lone';\n",
    [DRAWN]: 'export const undrawn = () => false;\n',
    [STYLES]:
      "@import 'tailwindcss';\n@import '../theme/theme.css';\n/* @import './components/ui/ds/tokens/theme.css'; */\n" +
      "@import './components/look/grain.css';\n",
    [THEME]: ':root { --md-sys-color-secondary: #5fa8b8; }\n',
    [GRAIN]: '.grain { opacity: 0.1; }\n',
    [KIT_THEME]: ':root {}\n',
  });
  return { root, base: commit(root, 'base') };
}

/** `shoot.ts --list` with `args`, from the planted board, with no browser it could launch: its exit and what it printed. */
const listed = (root: string, ...args: string[]) => {
  const ran = spawnSync(process.execPath, [SHOOT, '--list', ...args], {
    cwd: path.join(root, 'apps', 'web'),
    encoding: 'utf8',
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: path.join(root, 'no-browsers') },
  });
  const said = ran.stdout.trim();
  return { status: ran.status, said: said === '' ? undefined : (JSON.parse(said) as { stories: string[]; bare: string[] }) };
};

const CARD_STORIES = ['run-card--wide', 'run-card--narrow-one'];

test("what a change touches of the stories, along the work's first parent, by Storybook's ids", () => {
  const { root, base } = planted();
  git(root, 'checkout', '-q', '-b', 'work');
  write(root, { [MONEY]: 'export const dollars = (n: number) => n.toFixed(2);\n' });
  commit(root, 'a lib file a part reads');
  assert.deepEqual(
    listed(root, '--base', base),
    { status: 0, said: { stories: CARD_STORIES, bare: [] } },
    'the story of the part reading it',
  );

  git(root, 'checkout', '-q', 'main');
  write(root, { [TAG_STORIES]: "export default { title: 'Look/Tag' };\nexport const Plain = { args: {} };\n" });
  commit(root, "main's own change");
  git(root, 'checkout', '-q', 'work');
  git(root, 'merge', '-q', '--no-ff', '--no-edit', 'main');
  assert.deepEqual(listed(root, '--base', base).said?.stories, CARD_STORIES, "main's change, merged, is not the work's");
});

test('REFUSED: a changed part no story reaches, named, exit 1; a deleted part owes none', () => {
  const { root } = planted();
  assert.deepEqual(listed(root, '--changed', BARE, CARD), { status: 1, said: { stories: CARD_STORIES, bare: [BARE] } });
  fs.unlinkSync(path.join(root, BARE));
  assert.deepEqual(listed(root, '--changed', BARE), { status: 0, said: { stories: [], bare: [] } });
});

test('the touched stories in the order of their files, every story of a file in its order', () => {
  const { root } = planted();
  assert.deepEqual(
    listed(root, '--changed', MONEY, TAG_STORIES).said?.stories,
    ['look-tag--plain', ...CARD_STORIES],
    'look/ before run/, whatever order the paths came in',
  );
});

test('REFUSED: the bare parts in the order their files were handed in, whichever comes first', () => {
  const { root } = planted();
  assert.deepEqual(listed(root, '--changed', BARE, LONE).said?.bare, [BARE, LONE], 'run/ handed first, named first');
  assert.deepEqual(listed(root, '--changed', LONE, BARE).said?.bare, [LONE, BARE], 'look/ handed first, named first');
});

const EVERY_STORY = ['look-tag--plain', ...CARD_STORIES];

test('a change to a stylesheet the board styles import touches every story; a stylesheet named only in a comment none', () => {
  const { root } = planted();
  assert.deepEqual(listed(root, '--changed', THEME).said?.stories, EVERY_STORY, 'a theme stylesheet');
  assert.deepEqual(listed(root, '--changed', STYLES).said?.stories, EVERY_STORY, 'the stylesheet the preview imports');
  assert.deepEqual(listed(root, '--changed', GRAIN).said?.stories, EVERY_STORY, 'a stylesheet of the look it imports');
  assert.deepEqual(listed(root, '--changed', KIT_THEME).said?.stories, [], 'imported nowhere but in a comment');
});

test("a change to Storybook's preview, or to a file of the board it imports, touches every story", () => {
  const { root } = planted();
  assert.deepEqual(listed(root, '--changed', PREVIEW).said?.stories, EVERY_STORY, 'the preview');
  assert.deepEqual(listed(root, '--changed', DRAWN).said?.stories, EVERY_STORY, 'a file the preview imports');
});

test("a change to one part touches only the stories that reach it, though the preview imports the parts' door", () => {
  const { root } = planted();
  assert.deepEqual(listed(root, '--changed', CARD).said?.stories, CARD_STORIES, 'a part a story imports');
  assert.deepEqual(listed(root, '--changed', LONE), { status: 1, said: { stories: [], bare: [LONE] } }, 'a part behind the door');
});

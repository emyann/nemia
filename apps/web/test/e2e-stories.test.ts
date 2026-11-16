/**
 * The story pictures' tool (`e2e/stories/shoot.ts`) with no browser, on a planted git tree: a story importing a part importing a lib
 * file. What a change touches is read along the first parent, so what a merged branch changed is not the work's; `--list` prints
 * Storybook's ids and launches nothing; a changed part no story reaches is refused, exit 1, named. Each case a row.
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
const TAG_STORIES = 'apps/web/src/components/look/Tag.stories.tsx';

/** A repository with a part, its story, a lib file it imports, a story of the look reaching nothing, and a part with no story. */
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

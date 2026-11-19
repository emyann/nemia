/**
 * What a change hands of the board's look (`e2e/stories/changed.ts`) with no browser, on a planted git tree: a story importing a part
 * importing a lib file, and the approved pictures of its stories. What a change touches is read along the first parent, so what a merged
 * branch changed is not the work's; `--list` prints Storybook's ids of the stories it reaches and the approved pictures it added,
 * changed and removed, and launches nothing; a changed part no story reaches is refused, exit 1, named; what every story is drawn in
 * (the preview, what it imports, the stylesheets those import) reaches every story. A person's targets (`--targets`) are read off their
 * folder's names and paired with their stories' approved pictures, a target naming no story, or the light theme of a story that is no
 * canary, refused. Each case a row.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { LIGHT_CANARIES } from '../.storybook/approved.ts';
import { approvedName, handChanged, picturesOf } from './e2e/stories/changed.ts';
import { matchesOf, targetsOf, type Match } from './e2e/stories/targets.ts';

const CHANGED = path.join(import.meta.dirname, 'e2e', 'stories', 'changed.ts');

/** Writes `files` under `root`, each by its path from it. */
const write = (root: string, files: Record<string, string>) => {
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
};

/** Runs git in `root`, as a fixed author, its output trimmed. */
const git = (root: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], {
    cwd: root,
    encoding: 'utf8',
  }).trim();

/** Commits every file under `root` with `message`, and its id. */
const commit = (root: string, message: string) => {
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
const WIDE = 'apps/web/test/approved/run-card--wide.png';
const NARROW = 'apps/web/test/approved/run-card--narrow-one.png';
const PLAIN = 'apps/web/test/approved/look-tag--plain.png';
const PLAIN_LIGHT = 'apps/web/test/approved/light/look-tag--plain.png';

/**
 * A repository with a part, its story, a lib file it imports, a story of the look reaching nothing, two parts with no story, and the
 * approved pictures of two stories, one of them a light canary's too.
 */
function planted() {
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
    [WIDE]: 'wide',
    [PLAIN]: 'plain',
    [PLAIN_LIGHT]: 'plain light',
  });
  return { root, base: commit(root, 'base') };
}

/** What `--list` prints. */
type Listed = { stories: string[]; bare: string[]; added: string[]; changed: string[]; removed: string[] };

/** `changed.ts --list` with `args`, from the planted board, with no browser it could launch: its exit and what it printed. */
const listed = (root: string, ...args: string[]) => {
  const ran = spawnSync(process.execPath, [CHANGED, '--list', ...args], {
    cwd: path.join(root, 'apps', 'web'),
    encoding: 'utf8',
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: path.join(root, 'no-browsers') },
  });
  const said = ran.stdout.trim();
  return { status: ran.status, said: said === '' ? undefined : (JSON.parse(said) as Listed) };
};

const CARD_STORIES = ['run-card--wide', 'run-card--narrow-one'];

test("what a change touches of the stories, along the work's first parent, by Storybook's ids", () => {
  const { root, base } = planted();
  git(root, 'checkout', '-q', '-b', 'work');
  write(root, { [MONEY]: 'export const dollars = (n: number) => n.toFixed(2);\n' });
  commit(root, 'a lib file a part reads');
  assert.deepEqual(
    listed(root, '--base', base),
    { status: 0, said: { stories: CARD_STORIES, bare: [], added: [], changed: [], removed: [] } },
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
  assert.deepEqual(listed(root, '--changed', BARE, CARD).status, 1);
  assert.deepEqual(listed(root, '--changed', BARE, CARD).said?.bare, [BARE]);
  fs.unlinkSync(path.join(root, BARE));
  assert.deepEqual(listed(root, '--changed', BARE), { status: 0, said: { stories: [], bare: [], added: [], changed: [], removed: [] } });
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
  const lone = listed(root, '--changed', LONE);
  assert.deepEqual([lone.status, lone.said?.stories, lone.said?.bare], [1, [], [LONE]], 'a part behind the door');
});

/** `changed.ts --list --targets` over a folder holding `names`, beside the planted board, with `args`: its exit, matches and stderr. */
const targeted = (root: string, names: readonly string[], ...args: string[]) => {
  const dir = path.join(root, 'targets');
  fs.mkdirSync(dir, { recursive: true });
  for (const name of names) fs.writeFileSync(path.join(dir, name), 'png');
  const ran = spawnSync(process.execPath, [CHANGED, '--list', '--targets', dir, ...args], {
    cwd: path.join(root, 'apps', 'web'),
    encoding: 'utf8',
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: path.join(root, 'no-browsers') },
  });
  const said = ran.stdout.trim();
  return {
    status: ran.status,
    said: said === '' ? undefined : (JSON.parse(said) as { stories: string[]; matches: Match[] }),
    stderr: ran.stderr,
  };
};

/** Each match's story, theme and target, in order. */
const pairsOf = (matches: readonly Match[] | undefined) => (matches ?? []).map((m) => `${m.id} ${m.theme} ${m.target}`);

test("a target is set beside its story's approved picture: the dark one, and a canary's light one, the named theme winning", () => {
  const { matches, unknown, lightless } = matchesOf(
    targetsOf([
      'target-run-card--wide.png',
      'target-run-card--narrow-one-dark.png',
      'target-look-tag--plain.png',
      'target-look-tag--plain-dark.png',
    ]),
    [...CARD_STORIES, 'look-tag--plain'],
    ['look-tag--plain'],
  );
  assert.deepEqual([unknown, lightless], [[], []]);
  assert.deepEqual(pairsOf(matches), [
    'look-tag--plain light target-look-tag--plain.png',
    'look-tag--plain dark target-look-tag--plain-dark.png',
    'run-card--narrow-one dark target-run-card--narrow-one-dark.png',
    'run-card--wide dark target-run-card--wide.png',
  ]);
  assert.deepEqual(
    matches.map((m) => [m.story, m.match]),
    [
      ['test/approved/light/look-tag--plain.png', 'match-look-tag--plain-light.png'],
      ['test/approved/look-tag--plain.png', 'match-look-tag--plain-dark.png'],
      ['test/approved/run-card--narrow-one.png', 'match-run-card--narrow-one-dark.png'],
      ['test/approved/run-card--wide.png', 'match-run-card--wide-dark.png'],
    ],
    'the approved picture it is set beside, and the match it writes',
  );
});

test('a light target of a story that is no canary has no picture to be set beside, and is named', () => {
  const { matches, lightless } = matchesOf(targetsOf(['target-run-card--wide-light.png']), CARD_STORIES, []);
  assert.deepEqual([matches, lightless], [[], ['target-run-card--wide-light.png']]);
});

test('a file not named target-*.png is ignored', () => {
  assert.deepEqual(targetsOf(['notes.md', 'run-card--wide.png', 'target-run-card--wide.jpg', 'before-run-card--wide-light.png']), []);
});

test('a target for a story the change does not touch is still matched', () => {
  const { root } = planted();
  const ran = targeted(root, ['target-look-tag--plain-dark.png', 'README.md'], '--changed', MONEY);
  assert.equal(ran.status, 0);
  assert.deepEqual(ran.said?.stories, CARD_STORIES, 'the touched stories are the change’s alone');
  assert.deepEqual(pairsOf(ran.said?.matches), ['look-tag--plain dark target-look-tag--plain-dark.png']);
});

test('REFUSED: a light target of a story that is no light canary, exit 1, naming its file', () => {
  const { root } = planted();
  const story = LIGHT_CANARIES.includes('run-card--wide') ? 'run-card--narrow-one' : 'run-card--wide';
  const ran = targeted(root, [`target-${story}-light.png`], '--changed', MONEY);
  assert.equal(ran.status, 1);
  assert.equal(ran.said, undefined, 'nothing listed');
  assert.ok(ran.stderr.includes(`target-${story}-light.png`), 'the file named');
});

test('REFUSED: a target naming no story id, exit 1, naming its file and the nearest id', () => {
  const { root } = planted();
  const ran = targeted(root, ['target-run-card--wid.png'], '--changed', MONEY);
  assert.equal(ran.status, 1);
  assert.equal(ran.said, undefined, 'nothing listed');
  assert.ok(ran.stderr.includes('target-run-card--wid.png'), 'the file named');
  assert.ok(ran.stderr.includes('run-card--wide'), 'the nearest id named');
});

/** `changed.ts --out <out>` with a change that changes no approved picture, from the planted board, so no browser is launched: its exit. */
const shotNothing = (root: string, out: string) =>
  spawnSync(process.execPath, [CHANGED, '--changed', KIT_THEME, '--out', out], {
    cwd: path.join(root, 'apps', 'web'),
    encoding: 'utf8',
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: path.join(root, 'no-browsers') },
  }).status;

const EARLIER_PASS = [
  'before-run-card--wide.png',
  'after-run-card--wide.png',
  'diff-run-card--wide.png',
  'before-look-tag--plain-light.png',
  'match-run-card--wide-dark.png',
];

const NOT_ITS_OWN = [
  'notes.md',
  'target-run-card--wide.png',
  'story-run-card--wide-dark.png',
  'stories.json',
  'e2e/after-run-card--wide.png',
];

test('a pass clears the pictures and approved.json an earlier pass wrote in --out, and no other file or folder of it', () => {
  const { root } = planted();
  const out = path.join(root, 'files');
  write(out, Object.fromEntries([...EARLIER_PASS, 'approved.json', ...NOT_ITS_OWN].map((file) => [file, 'earlier'])));
  fs.mkdirSync(path.join(out, 'diff-folder.png'));
  assert.equal(shotNothing(root, out), 0);
  const left = fs.readdirSync(out, { recursive: true, encoding: 'utf8' }).sort();
  assert.deepEqual(left, ['e2e', ...NOT_ITS_OWN, 'approved.json', 'diff-folder.png'].sort(), "only this pass's report besides");
  assert.notEqual(fs.readFileSync(path.join(out, 'approved.json'), 'utf8'), 'earlier', "this pass's report");
});

test('a pass into an empty --out, or one not there yet, clears nothing and passes', () => {
  const { root } = planted();
  const empty = path.join(root, 'empty');
  fs.mkdirSync(empty);
  assert.equal(shotNothing(root, empty), 0);
  assert.deepEqual(fs.readdirSync(empty), ['approved.json']);
  const absent = path.join(root, 'absent', 'files');
  assert.equal(shotNothing(root, absent), 0);
  assert.deepEqual(fs.readdirSync(absent), ['approved.json']);
});

test('the approved pictures the work added, changed and removed, by name, a light picture as <id>-light, along its first parent', () => {
  const { root, base } = planted();
  git(root, 'checkout', '-q', '-b', 'work');
  write(root, { [WIDE]: 'wider', [NARROW]: 'narrow', [PLAIN_LIGHT]: 'plain, lighter' });
  fs.unlinkSync(path.join(root, PLAIN));
  commit(root, 'the pictures a change approves');
  const ran = listed(root, '--base', base);
  assert.equal(ran.status, 0);
  assert.deepEqual(
    [ran.said?.added, ran.said?.changed, ran.said?.removed],
    [['run-card--narrow-one'], ['look-tag--plain-light', 'run-card--wide'], ['look-tag--plain']],
  );
  git(root, 'checkout', '-q', 'main');
  write(root, { [PLAIN_LIGHT]: "main's own" });
  commit(root, "main's own picture");
  git(root, 'checkout', '-q', 'work');
  git(root, 'merge', '-q', '--no-ff', '--no-edit', '-X', 'ours', 'main');
  assert.deepEqual(
    listed(root, '--base', 'main').said?.changed,
    ['look-tag--plain-light', 'run-card--wide'],
    "main's, merged, is not the work's",
  );
});

test("an approved picture is named by its story, a light canary's with -light, and nothing else under the folder is one", () => {
  assert.equal(approvedName('apps/web/test/approved/run-card--wide.png'), 'run-card--wide');
  assert.equal(approvedName('apps/web/test/approved/light/run-card--wide.png'), 'run-card--wide-light');
  assert.equal(approvedName('apps/web/test/approved/notes.md'), undefined);
  assert.equal(approvedName('apps/web/test/approved/other/run-card--wide.png'), undefined);
  assert.equal(approvedName('apps/web/src/run-card--wide.png'), undefined);
});

test('a pass whose change adds and removes pictures, and changes none, lists them in approved.json and draws nothing', () => {
  const { root, base } = planted();
  write(root, { [NARROW]: 'narrow' });
  fs.unlinkSync(path.join(root, PLAIN));
  commit(root, 'one added, one removed');
  const out = path.join(root, 'files');
  const ran = spawnSync(process.execPath, [CHANGED, '--base', base, '--out', out], {
    cwd: path.join(root, 'apps', 'web'),
    encoding: 'utf8',
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: path.join(root, 'no-browsers') },
  });
  assert.equal(ran.status, 0, ran.stderr);
  assert.deepEqual(fs.readdirSync(out), ['approved.json'], 'no before, after or diff of a picture that did not change');
  const report = JSON.parse(fs.readFileSync(path.join(out, 'approved.json'), 'utf8')) as Listed & { base: string };
  assert.deepEqual([report.base, report.added, report.changed, report.removed], [base, ['run-card--narrow-one'], [], ['look-tag--plain']]);
});

test("a changed picture is handed as its base's bytes, the head's and their diff, a light canary's named <id>-light", async () => {
  const { root, base } = planted();
  write(root, { [WIDE]: 'wider', [PLAIN_LIGHT]: 'plain, lighter', [NARROW]: 'narrow' });
  commit(root, 'two pictures moved, one added');
  const touched = git(root, 'diff', '--name-only', base, 'HEAD').split('\n').filter(Boolean);
  const { changed } = picturesOf(root, touched, base);
  const out = path.join(root, 'files');
  fs.mkdirSync(out);
  await handChanged(root, base, out, changed, async (before, after) =>
    Buffer.from(`${fs.readFileSync(before, 'utf8')} | ${fs.readFileSync(after, 'utf8')}`),
  );
  const read = (file: string) => fs.readFileSync(path.join(out, file), 'utf8');
  assert.deepEqual(fs.readdirSync(out).sort(), [
    'after-look-tag--plain-light.png',
    'after-run-card--wide.png',
    'before-look-tag--plain-light.png',
    'before-run-card--wide.png',
    'diff-look-tag--plain-light.png',
    'diff-run-card--wide.png',
  ]);
  assert.deepEqual(
    [read('before-run-card--wide.png'), read('after-run-card--wide.png'), read('diff-run-card--wide.png')],
    ['wide', 'wider', 'wide | wider'],
  );
  assert.deepEqual([read('before-look-tag--plain-light.png'), read('after-look-tag--plain-light.png')], ['plain light', 'plain, lighter']);
});

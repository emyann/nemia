/**
 * The story pictures' tool (`e2e/stories/shoot.ts`) with no browser, on a planted git tree: a story importing a part importing a lib
 * file. What a change touches is read along the first parent, so what a merged branch changed is not the work's; `--list` prints
 * Storybook's ids and launches nothing; a changed part no story reaches is refused, exit 1, named; what every story is drawn in (the
 * preview, what it imports, the stylesheets those import) reaches every story. A person's targets (`--targets`) are read off their
 * folder's names and paired with their stories, a target naming no story refused. A picture's key moves with what its story is drawn
 * from and nothing else; the cache copies what it holds byte for byte, and a pass it holds whole builds no Storybook. Each case a row.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { keptInCache, keyName, keysOf, pictureName, picturesOf, takenFromCache } from './e2e/stories/cache.ts';
import { reachesOf } from './e2e/stories/shoot.ts';
import { matchesOf, targetsOf, type Match } from './e2e/stories/targets.ts';

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

/** `shoot.ts --list --targets` over a folder holding `names`, beside the planted board, with `args`: its exit, matches and stderr. */
const targeted = (root: string, names: readonly string[], ...args: string[]) => {
  const dir = path.join(root, 'targets');
  fs.mkdirSync(dir, { recursive: true });
  for (const name of names) fs.writeFileSync(path.join(dir, name), 'png');
  const ran = spawnSync(process.execPath, [SHOOT, '--list', '--targets', dir, ...args], {
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

test('a target is matched in both themes when it names none, in its own when it names one, the named one winning', () => {
  const { matches, unknown } = matchesOf(
    targetsOf(['target-run-card--wide.png', 'target-run-card--narrow-one-dark.png', 'target-run-card--wide-dark.png']),
    CARD_STORIES,
  );
  assert.deepEqual(unknown, []);
  assert.deepEqual(pairsOf(matches), [
    'run-card--narrow-one dark target-run-card--narrow-one-dark.png',
    'run-card--wide light target-run-card--wide.png',
    'run-card--wide dark target-run-card--wide-dark.png',
  ]);
  assert.deepEqual(
    matches.map((m) => [m.story, m.match]),
    [
      ['story-run-card--narrow-one-dark.png', 'match-run-card--narrow-one-dark.png'],
      ['story-run-card--wide-light.png', 'match-run-card--wide-light.png'],
      ['story-run-card--wide-dark.png', 'match-run-card--wide-dark.png'],
    ],
    'the head picture it is set beside, and the match it writes',
  );
});

test('a file not named target-*.png is ignored', () => {
  assert.deepEqual(targetsOf(['notes.md', 'run-card--wide.png', 'target-run-card--wide.jpg', 'before-run-card--wide-light.png']), []);
});

test('a target for a story the change does not touch is still matched', () => {
  const { root } = planted();
  const ran = targeted(root, ['target-look-tag--plain-light.png', 'README.md'], '--changed', MONEY);
  assert.equal(ran.status, 0);
  assert.deepEqual(ran.said?.stories, CARD_STORIES, 'the touched stories are the change’s alone');
  assert.deepEqual(pairsOf(ran.said?.matches), ['look-tag--plain light target-look-tag--plain-light.png']);
});

test('REFUSED: a target naming no story id, exit 1, naming its file and the nearest id', () => {
  const { root } = planted();
  const ran = targeted(root, ['target-run-card--wid.png'], '--changed', MONEY);
  assert.equal(ran.status, 1);
  assert.equal(ran.said, undefined, 'nothing listed');
  assert.ok(ran.stderr.includes('target-run-card--wid.png'), 'the file named');
  assert.ok(ran.stderr.includes('run-card--wide'), 'the nearest id named');
});

/** `shoot.ts --out <out>` with a change touching no story, from the planted board, so no browser is launched: its exit. */
const shotNothing = (root: string, out: string) =>
  spawnSync(process.execPath, [SHOOT, '--changed', KIT_THEME, '--out', out], {
    cwd: path.join(root, 'apps', 'web'),
    encoding: 'utf8',
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: path.join(root, 'no-browsers') },
  }).status;

const EARLIER_PASS = [
  'story-run-card--wide-light.png',
  'story-gone--plain-dark.png',
  'before-run-card--wide-dark.png',
  'after-run-card--wide-dark.png',
  'diff-run-card--wide-dark.png',
  'match-run-card--wide-light.png',
];

const NOT_ITS_OWN = ['notes.md', 'target-run-card--wide.png', 'story-notes.txt', 'e2e/story-run-card--wide-light.png'];

test('a pass clears the pictures and stories.json an earlier pass wrote in --out, and no other file or folder of it', () => {
  const { root } = planted();
  const out = path.join(root, 'files');
  write(out, Object.fromEntries([...EARLIER_PASS, 'stories.json', ...NOT_ITS_OWN].map((file) => [file, 'earlier'])));
  fs.mkdirSync(path.join(out, 'story-folder.png'));
  assert.equal(shotNothing(root, out), 0);
  const left = fs.readdirSync(out, { recursive: true, encoding: 'utf8' }).sort();
  assert.deepEqual(left, ['e2e', ...NOT_ITS_OWN, 'stories.json', 'story-folder.png'].sort(), "only this pass's report besides");
  assert.notEqual(fs.readFileSync(path.join(out, 'stories.json'), 'utf8'), 'earlier', "this pass's report");
});

test('a pass into an empty --out, or one not there yet, clears nothing and passes', () => {
  const { root } = planted();
  const empty = path.join(root, 'empty');
  fs.mkdirSync(empty);
  assert.equal(shotNothing(root, empty), 0);
  assert.deepEqual(fs.readdirSync(empty), ['stories.json']);
  const absent = path.join(root, 'absent', 'files');
  assert.equal(shotNothing(root, absent), 0);
  assert.deepEqual(fs.readdirSync(absent), ['stories.json']);
});

/** Each picture's key of the touched `ids` in the planted tree at `root`, by `<id>-<theme>`, as `shoot.ts` keys them. */
const keyed = (root: string, ids: readonly string[]): Map<string, string> =>
  keysOf(root, root, reachesOf(root, STORY_FILES, ids), picturesOf(ids));

/** The planted story files, from the root. */
const STORY_FILES = [TAG_STORIES, 'apps/web/src/components/run/Card.stories.tsx'];

/** The keys of `after` that differ from `before`'s, by picture. */
const movedKeys = (before: ReadonlyMap<string, string>, after: ReadonlyMap<string, string>): string[] =>
  [...before].flatMap(([name, key]) => (after.get(name) === key ? [] : [name])).sort();

const EVERY_PICTURE = EVERY_STORY.flatMap((id) => [`${id}-dark`, `${id}-light`]).sort();

test("a picture's key moves with what its story is drawn from, and with nothing else", () => {
  const { root } = planted();
  write(root, { 'package-lock.json': '{}\n' });
  const was = keyed(root, EVERY_STORY);
  assert.equal(new Set(was.values()).size, EVERY_PICTURE.length, 'a key a picture');
  const rows: [string, Record<string, string>, string[]][] = [
    ['a file one part imports', { [MONEY]: 'export const dollars = (n: number) => n.toFixed(2);\n' }, CARD_STORIES],
    ['a file of the board no story reaches', { [BARE]: 'export function Bare() { return 1; }\n' }, []],
    ['a story file', { [TAG_STORIES]: "export default { title: 'Look/Tag' };\nexport const Plain = { args: {} };\n" }, ['look-tag--plain']],
    [
      'a file under .storybook/ the preview imports not',
      { 'apps/web/.storybook/fixtures/runs.ts': 'export const runs = [];\n' },
      EVERY_STORY,
    ],
    ['a file under theme/ no stylesheet imports', { 'apps/web/theme/DESIGN.resolved.md': '# resolved\n' }, EVERY_STORY],
    ['a file under public/', { 'apps/web/public/logo.svg': '<svg/>\n' }, EVERY_STORY],
    ['the lockfile', { 'package-lock.json': '{ "lockfileVersion": 3 }\n' }, EVERY_STORY],
    ["objects' source, linked into node_modules", { 'packages/objects/src/run.ts': "export const PHASES = ['queued'];\n" }, EVERY_STORY],
    ["objects' package.json", { 'packages/objects/package.json': '{ "name": "objects" }\n' }, EVERY_STORY],
    ['a package of the workspace the board does not import', { 'packages/other/src/x.ts': 'export const x = 1;\n' }, []],
    ['the file that takes the picture', { 'apps/web/test/e2e/board.ts': 'export const photograph = () => 1;\n' }, EVERY_STORY],
    ['the tool', { 'apps/web/test/e2e/stories/shoot.ts': '// another wait\n' }, EVERY_STORY],
    ['an e2e file that takes no story picture', { 'apps/web/test/e2e/pages/010-runs.ts': 'export default {};\n' }, []],
  ];
  for (const [what, files, moved] of rows) {
    const { root: at } = planted();
    write(at, { 'package-lock.json': '{}\n' });
    const before = keyed(at, EVERY_STORY);
    write(at, files);
    assert.deepEqual(movedKeys(before, keyed(at, EVERY_STORY)), moved.flatMap((id) => [`${id}-dark`, `${id}-light`]).sort(), what);
  }
});

test('a picture the cache holds is copied byte for byte, the rest are left to draw and kept once drawn; none read under --no-cache', () => {
  const { root } = planted();
  const keys = keyed(root, EVERY_STORY);
  const cache = path.join(root, 'cache', 'not-there-yet');
  const out = path.join(root, 'out');
  fs.mkdirSync(out);
  const wanted = picturesOf(EVERY_STORY);
  assert.deepEqual(takenFromCache(cache, keys, wanted, out, 'story-'), wanted, 'a cache not there yet holds nothing');
  assert.deepEqual(fs.readdirSync(out), [], 'nothing copied');
  for (const picture of wanted) fs.writeFileSync(path.join(out, pictureName('story-', picture)), `png of ${keyName(picture)}`);
  keptInCache(cache, keys, wanted.slice(1), out, 'story-');
  const again = path.join(root, 'again');
  fs.mkdirSync(again);
  assert.deepEqual(takenFromCache(cache, keys, wanted, again, 'before-'), wanted.slice(0, 1), 'the one never kept is left to draw');
  for (const picture of wanted.slice(1))
    assert.ok(
      fs
        .readFileSync(path.join(again, pictureName('before-', picture)))
        .equals(fs.readFileSync(path.join(out, pictureName('story-', picture)))),
      `${keyName(picture)} copied byte for byte`,
    );
  assert.deepEqual(takenFromCache(undefined, keys, wanted, again, 'story-'), wanted, '--no-cache draws every picture');
});

/**
 * A stand-in for Storybook's build in the planted workspace, where `buildStorybook` runs it: it writes down the folder each build was
 * asked in, a line each, in `built.txt` beside it, and fails; the builds asked, by folder.
 */
const standInStorybook = (root: string): (() => string[]) => {
  const bin = path.join(root, 'node_modules', 'storybook', 'dist', 'bin');
  write(bin, {
    'dispatcher.js':
      "const fs = require('node:fs');\nfs.appendFileSync(require('node:path').join(__dirname, 'built.txt'), process.cwd() + '\\n');\nprocess.exit(1);\n",
  });
  const built = path.join(bin, 'built.txt');
  return () => (fs.existsSync(built) ? fs.readFileSync(built, 'utf8').split('\n').filter(Boolean) : []);
};

/** `shoot.ts --base <base> --out <out>` from the planted board, its cache `cache`, with no browser it could launch: its exit and report. */
const shot = (root: string, base: string, out: string, cache: string, ...args: string[]) => {
  const ran = spawnSync(process.execPath, [SHOOT, '--base', base, '--out', out, ...args], {
    cwd: path.join(root, 'apps', 'web'),
    encoding: 'utf8',
    env: { ...process.env, STORIES_CACHE: cache, PLAYWRIGHT_BROWSERS_PATH: path.join(root, 'no-browsers') },
  });
  const report = path.join(out, 'stories.json');
  return {
    status: ran.status,
    report: fs.existsSync(report)
      ? (JSON.parse(fs.readFileSync(report, 'utf8')) as { changed: string[]; fresh: string[]; pictures: unknown })
      : undefined,
  };
};

test('a pass whose every picture the cache holds, at the change and at the base, draws none and builds no Storybook', () => {
  const { root, base } = planted();
  git(root, 'checkout', '-q', '-b', 'work');
  write(root, { [CARD]: "import { dollars } from '@/lib/money';\nexport function Card() { return <b>{dollars(1)}</b>; }\n" });
  commit(root, 'a part');
  const cache = path.join(root, 'cache');
  fs.mkdirSync(cache);
  const builds = standInStorybook(root);
  const headKeys = keyed(root, CARD_STORIES);
  git(root, 'checkout', '-q', base);
  const baseKeys = keyed(root, CARD_STORIES);
  git(root, 'checkout', '-q', 'work');
  assert.equal(movedKeys(baseKeys, headKeys).length, 4, 'the part moved every key of its stories');
  for (const [name, key] of [...headKeys, ...baseKeys]) fs.writeFileSync(path.join(cache, `${key}.png`), `png of ${name}`);
  const out = path.join(root, 'out');
  const ran = shot(root, 'main', out, cache);
  assert.equal(ran.status, 0);
  assert.deepEqual(builds(), [], 'no Storybook built on either side');
  assert.deepEqual(ran.report?.pictures, { head: { copied: 4, rendered: 0 }, base: { copied: 4, rendered: 0 } });
  assert.deepEqual([ran.report?.changed, ran.report?.fresh], [[], []], 'pictures of the same bytes are the same');
  for (const [name, key] of headKeys)
    assert.ok(fs.readFileSync(path.join(out, `story-${name}.png`)).equals(fs.readFileSync(path.join(cache, `${key}.png`))), name);

  const storyPictures = (dir: string) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => name.startsWith('story-')) : []);
  const uncached = path.join(root, 'out-no-cache');
  const drawing = shot(root, 'main', uncached, cache, '--no-cache');
  assert.notEqual(drawing.status, 0, "the stand-in's build fails");
  assert.deepEqual(builds(), [path.join(root, 'apps', 'web')], '--no-cache built the head to draw');
  assert.deepEqual(storyPictures(uncached), [], '--no-cache copied no picture');

  write(root, { [MONEY]: 'export const dollars = (n: number) => n.toFixed(3);\n' });
  commit(root, 'a lib file');
  const moved = path.join(root, 'out-moved');
  const redrawn = shot(root, 'main', moved, cache);
  assert.notEqual(redrawn.status, 0, "the stand-in's build fails");
  assert.equal(builds().length, 2, 'a moved input built the head again to draw');
  assert.deepEqual(storyPictures(moved), [], 'no picture of a moved key copied');
});

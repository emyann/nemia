/**
 * The look's own parts are a group with one door (`src/components/look`): every part has its stories beside it, no file of `src`
 * outside the folder reaches past the door, and the skill a session loads before it changes the board names every part the door
 * exports. Each rule is run on a fixture that breaks it, then on the tree.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const WEB = path.join(import.meta.dirname, '..');
const SRC = path.join(WEB, 'src');
const LOOK = path.join(SRC, 'components', 'look');
const SKILL = path.join(WEB, '..', '..', '.claude', 'skills', 'change-the-board', 'SKILL.md');

/** Each part among `names`, the files of the look's folder, that has no stories beside it: a file named with a capital, by its name. */
export const storyless = (names: readonly string[]): string[] =>
  names
    .filter((name) => /^[A-Z]\w*\.tsx$/.test(name))
    .map((name) => name.slice(0, -'.tsx'.length))
    .filter((part) => !names.includes(`${part}.stories.tsx`));

/**
 * Each import in `source`, the text of `file` of `src`, that reaches a file of the look's folder other than its door, by the module
 * it names; none for a file of the folder itself.
 */
export function pastDoor(file: string, source: string): string[] {
  if (file.startsWith('components/look/')) return [];
  const modules = [...source.matchAll(/\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1] ?? m[2]);
  return modules.filter((mod) => {
    const at = mod.startsWith('@/') ? mod.slice(2) : mod.startsWith('.') ? path.posix.join(path.posix.dirname(file), mod) : '';
    return /^components\/look\/(?!index(?:\.ts)?$)./.test(at);
  });
}

/** The parts a door's text exports: each name written with a capital then a small letter, a type left out. */
export const partsOf = (door: string): string[] =>
  [...door.matchAll(/export\s*\{([^}]*)\}/g)]
    .flatMap(([, names]) => names.split(','))
    .map((name) => name.trim())
    .filter((name) => /^[A-Z][a-z]\w*$/.test(name));

/** Each part of `door` that `skill` does not name in backticks. */
export const untold = (door: string, skill: string): string[] => partsOf(door).filter((part) => !skill.includes(`\`${part}\``));

/** Every file under `dir`, by its path from `dir`. */
function filesUnder(dir: string, from = dir): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const at = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(at, from) : [path.relative(from, at).split(path.sep).join('/')];
  });
}

test('REFUSED: a part of the look with no story', () => {
  const shipped = fs.readdirSync(LOOK);
  assert.ok(shipped.includes('CutFrame.tsx') && shipped.includes('index.ts'), 'the folder is read');
  assert.deepEqual(storyless([...shipped, 'Extra.tsx']), ['Extra'], 'a part added with no stories is named');
  assert.deepEqual(
    storyless(['Extra.tsx', 'Extra.stories.tsx', 'cut.ts', 'index.ts']),
    [],
    'stories beside it, and a file that is no part',
  );
  assert.deepEqual(storyless(shipped), [], 'every shipped part has its stories');
});

test('REFUSED: an import past the door of the look', () => {
  assert.deepEqual(pastDoor('components/WaitingCard.tsx', "import { CutFrame } from './look/CutFrame';"), ['./look/CutFrame']);
  assert.deepEqual(pastDoor('routes/runs.index.tsx', "import { Plate } from '@/components/look/Plate';"), ['@/components/look/Plate']);
  assert.deepEqual(pastDoor('routes/x.tsx', "const cut = await import('../components/look/cut.ts');"), ['../components/look/cut.ts']);
  assert.deepEqual(pastDoor('routes/x.tsx', "import { Plate } from '../components/look';\nimport { cn } from '@/lib/look/cut';"), []);
  assert.deepEqual(pastDoor('components/x.tsx', "import { Plate } from './look/index';"), []);
  assert.deepEqual(pastDoor('components/look/CutButton.tsx', "import { cutRing } from './cut';"), [], 'a part reaches its siblings');
  const files = filesUnder(SRC).filter((file) => /\.tsx?$/.test(file) && !file.startsWith('components/ui/ds/'));
  assert.ok(files.includes('components/WaitingCard.tsx'), 'the source is read');
  const through = files.filter((file) =>
    /from '(?:\.\/look|\.\.\/components\/look|@\/components\/look)'/.test(fs.readFileSync(path.join(SRC, file), 'utf8')),
  );
  assert.ok(through.length >= 4, `the pages take the look through its door: ${through.join(', ')}`);
  for (const file of files)
    assert.deepEqual(pastDoor(file, fs.readFileSync(path.join(SRC, file), 'utf8')), [], `${file} goes through the door`);
});

test('REFUSED: a part the door exports that the skill does not name', () => {
  const door = fs.readFileSync(path.join(LOOK, 'index.ts'), 'utf8');
  const skill = fs.readFileSync(SKILL, 'utf8');
  assert.deepEqual(
    partsOf("export { cutRing, type CutSize } from './cut';\nexport { CutFrame, FRAMED_BOX, type FrameHue } from './CutFrame';"),
    ['CutFrame'],
  );
  assert.ok(partsOf(door).length >= 12, `the door's parts are read: ${partsOf(door).join(', ')}`);
  assert.deepEqual(untold(`${door}export { Extra } from './Extra';\n`, skill), ['Extra'], 'a part the skill does not name is said');
  assert.deepEqual(untold(door, skill), [], 'the skill names every part the door exports');
  for (const name of fs.readdirSync(LOOK).filter((name) => /^[A-Z]\w*\.tsx$/.test(name)))
    assert.ok(door.includes(`from './${name.slice(0, -4)}'`), `${name}, a part of the folder, is exported by the door`);
});

/**
 * Each focus ring written in `source`, the text of a file that draws a cut: a ring utility behind a focus state, and the kit's
 * `focusRing`, which writes them. A clip to the cut shape takes such a ring off the two cut corners, so a box drawn in a cut lights
 * its own edge in that shape instead (`CutField`, `CutFrame`), or draws a band beside it (`cutRing`). A ground named `bg-ring` is
 * none, and the word in a doc comment is none: a ring is read behind its state alone.
 */
export const ringedCut = (source: string): string[] => [
  ...(source.match(/(?<![\w-])(?:[\w/[\]-]+-)?focus(?:-visible|-within)?(?:\/[\w-]+)?:ring[\w[\]/.-]*/g) ?? []),
  ...(source.match(/\bfocusRing\(/g) ?? []),
];

test('REFUSED: a focus ring in a file that draws a cut: a clip takes a rectangular ring off the two cut corners', () => {
  assert.deepEqual(ringedCut("'ring-1 ring-outline-variant ring-inset focus-within:ring-2 focus-within:ring-alive'"), [
    'focus-within:ring-2',
    'focus-within:ring-alive',
  ]);
  assert.deepEqual(ringedCut("cn('inline-flex', focusRing())"), ['focusRing(']);
  assert.deepEqual(
    ringedCut("'absolute -inset-[5px] bg-ring group-data-focus-visible/cut:block' /* its focus ring */"),
    [],
    'neither a ground nor the word',
  );
  assert.deepEqual(ringedCut("'data-focus-visible:ring-3 group-focus-visible/send:ring-ring/50'"), [
    'data-focus-visible:ring-3',
    'group-focus-visible/send:ring-ring/50',
  ]);
  const drawing = filesUnder(SRC).filter(
    (file) => /\.tsx?$/.test(file) && /\bcut(?:Shape|Ring)\(/.test(fs.readFileSync(path.join(SRC, file), 'utf8')),
  );
  assert.ok(drawing.includes('components/chat/ChatComposer.tsx'), `the files that draw a cut are read: ${drawing.join(', ')}`);
  for (const file of drawing)
    assert.deepEqual(ringedCut(fs.readFileSync(path.join(SRC, file), 'utf8')), [], `${file} draws a ring the cut would break`);
});

test("a field drawn in a cut takes the look's cut field, and the send beside it a band in the cut shape", () => {
  const composer = fs.readFileSync(path.join(SRC, 'components', 'chat', 'ChatComposer.tsx'), 'utf8');
  assert.match(composer, /import\s*\{[^}]*\bCutField\b[^}]*\}\s*from\s*'@\/components\/look'/, 'the field through the door');
  assert.match(composer, /<CutField\s+size=\{COMPOSER_CUT\}/, 'its edge is drawn in its cut, never a ring a clip breaks');
  assert.doesNotMatch(composer, /ring-outline-variant|ring-inset/, 'and no rectangular edge is left on it');
  assert.match(composer, /clipPath:\s*cutRing\(COMPOSER_CUT, GAP, RING\)/, "the send's focus ring is a band in the send's cut");
  assert.match(composer, /group-has-data-focus-visible\/send:block/, 'shown when the keyboard reaches the send');
});

/** The one file that writes a grain's tile, by its path from `src`. */
const GRAIN = 'components/look/grain.css';

/** Each file of `sources`, texts by their path from `src`, that writes a noise tile and is not the look's grain. */
export const tilesOutside = (sources: Readonly<Record<string, string>>): string[] =>
  Object.keys(sources).filter((file) => file !== GRAIN && sources[file]?.includes('feTurbulence'));

/**
 * Whether `css`, an entry stylesheet, reads the look's grain: it imports it, above its first at-rule that is no import, under which
 * the build drops an import without a word.
 */
export function readsGrain(css: string): boolean {
  const at = css.search(/@import\s*['"]\.\/components\/look\/grain\.css['"]\s*;/);
  const other = css.search(/^@(?!import\b)[a-z-]+/m);
  return at !== -1 && (other === -1 || at < other);
}

test("REFUSED: a grain's tile written outside the look's grain, which holds three, each once", () => {
  const sources = Object.fromEntries(
    filesUnder(SRC)
      .filter((file) => /\.(?:tsx?|css)$/.test(file) && !file.startsWith('components/ui/ds/'))
      .map((file) => [file, fs.readFileSync(path.join(SRC, file), 'utf8')]),
  );
  assert.ok('styles.css' in sources && 'components/look/Sticker.tsx' in sources, 'the source is read');
  assert.deepEqual(tilesOutside({ ...sources, 'components/WaitingCard.tsx': "url('data:image/svg+xml,<feTurbulence/>')" }), [
    'components/WaitingCard.tsx',
  ]);
  assert.deepEqual(tilesOutside(sources), [], 'no page and no part writes a tile of its own');
  const grain = sources[GRAIN] ?? '';
  assert.equal(grain.split('feTurbulence').length - 1, 3, "the surface's in each scheme, and the label's");
  for (const name of ['--grain-surface', '--grain-label'])
    assert.equal(grain.split(`var(${name})`).length - 1, 1, `${name} is drawn by one rule`);
  assert.equal(grain.split('--grain-label:').length - 1, 1, "a label's tile is the same in both schemes");
  assert.equal(grain.split('--grain-surface:').length - 1, 2, "a surface's tile is written for each scheme");
});

test('REFUSED: an entry stylesheet that imports the grain under another at-rule, or not at all', () => {
  const grain = "@import './components/look/grain.css';";
  assert.equal(readsGrain(`@import 'tailwindcss';\n${grain}\n@custom-variant dark {\n}\n`), true);
  assert.equal(readsGrain(`@import 'tailwindcss';\n@custom-variant dark {\n}\n${grain}\n`), false, 'the build drops it there');
  assert.equal(readsGrain("@import 'tailwindcss';\n@layer base {\n}\n"), false, 'no import');
  assert.equal(readsGrain("@import\n  './components/look/grain.css'\n;\n@layer base {\n}\n"), true, 'across line breaks');
  assert.equal(readsGrain(fs.readFileSync(path.join(SRC, 'styles.css'), 'utf8')), true, 'the board reads it');
});

/** A surface's specks by the red, green and blue its tile's colour matrix gives every pixel. */
const SPECKS: Readonly<Record<string, string>> = { '0,0,0': 'ink', '1,1,1': 'white' };

/** The specks of the surface tile `rules` writes, `ink` or `white`; `unread` where it writes none, or one of another colour. */
const specksOf = (rules: string): string => {
  const tile = /--grain-surface\s*:\s*url\(\s*['"]([^'"]+)['"]\s*\)/.exec(rules)?.[1] ?? '';
  const values = /<feColorMatrix[^>]*\svalues="([^"]+)"/.exec(decodeURIComponent(tile))?.[1]?.trim().split(/\s+/) ?? [];
  return SPECKS[[values[4], values[9], values[14]].join(',')] ?? 'unread';
};

/**
 * The specks of a surface's grain in each scheme, as `css`, the look's grain, writes them: the light scheme's above the dark
 * scheme's media rule, the dark one's inside it, which ends above the rule that draws the surface. `unread` for both where either
 * mark is missing.
 */
export function surfaceSpecks(css: string): { light: string; dark: string } {
  const dark = css.search(/@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)/);
  const drawn = css.search(/\[data-grain\s*=\s*['"]surface['"]\s*\]/);
  if (dark === -1 || drawn < dark) return { light: 'unread', dark: 'unread' };
  return { light: specksOf(css.slice(0, dark)), dark: specksOf(css.slice(dark, drawn)) };
}

test("REFUSED: a surface's grain whose specks are ink in the dark scheme or white in the light one", () => {
  const grain = fs.readFileSync(path.join(SRC, GRAIN), 'utf8');
  const [light, dark] = [...grain.matchAll(/--grain-surface\s*:\s*(url\([^)]+\))/g)].map((found) => found[1] ?? '');
  assert.ok(light && dark && light !== dark, 'the grain writes a surface tile for each scheme');
  const swapped = grain.replace(light, '<light>').replace(dark, light).replace('<light>', dark);
  assert.deepEqual(surfaceSpecks(swapped), { light: 'white', dark: 'ink' }, 'the two swapped are read as swapped');
  assert.deepEqual(surfaceSpecks(grain.replace(/\[data-grain\s*=\s*'surface'\s*\]/, '[data-grain]')), { light: 'unread', dark: 'unread' });
  assert.deepEqual(surfaceSpecks(grain), { light: 'ink', dark: 'white' }, 'ink specks in the light scheme, light ones in the dark');
});

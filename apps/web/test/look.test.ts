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

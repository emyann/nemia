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

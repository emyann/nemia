/**
 * The judge is optional, and Effect stays inside it.
 *
 * - Nothing in the workspace imports the judge or its SDK, and the judge imports nothing from the workspace: take the
 *   package away and every other package still builds and passes.
 * - Effect is how the package is written. The plain files — the key, decide, the record, the card, the command — import
 *   none of it, and none of the Effect files' values: a consumer of the facade never has to adopt it.
 */
import './hermetic.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const PACKAGE = path.resolve(import.meta.dirname, '..');
const ROOT = path.resolve(PACKAGE, '../..');
const JUDGE = ['agent-judge', '@typesafe-ai/sdk'];

/** Every module `text` imports or re-exports, with whether the import is for types alone. */
export function importsOf(text: string): { from: string; typeOnly: boolean }[] {
  const found: { from: string; typeOnly: boolean }[] = [];
  const statement = /^\s*(import|export)\s+(type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gm;
  for (const m of text.matchAll(statement)) found.push({ from: m[3]!, typeOnly: Boolean(m[2]) });
  for (const m of text.matchAll(/\b(?:import|require)\s*\(\s*['"`]([^'"`]+)['"`]/g)) found.push({ from: m[1]!, typeOnly: false });
  return found;
}

const packageOf = (from: string) => (from.startsWith('@') ? from.split('/').slice(0, 2).join('/') : from.split('/')[0]!);

/** The modules `text` imports that it must not, from `names`. */
export const importsAny = (text: string, names: readonly string[]) =>
  importsOf(text).map((i) => i.from).filter((from) => names.includes(packageOf(from)));

const sources = (dir: string): string[] =>
  !fs.existsSync(dir) ? [] : fs.readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && /\.(ts|tsx|mts|js|mjs)$/.test(e.name) && !e.parentPath.includes('node_modules'))
    .map((e) => path.join(e.parentPath, e.name));

const workspaces = (): string[] =>
  ['packages', 'apps'].flatMap((top) => fs.readdirSync(path.join(ROOT, top)).map((d) => path.join(ROOT, top, d)))
    .filter((dir) => fs.existsSync(path.join(dir, 'package.json')));

const nameOf = (dir: string) => JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).name as string;

test('REFUSED: an import of the judge is found, however it is written; a word in a string is not', () => {
  const planted = [
    "import { judge } from 'agent-judge';",
    'import type { Judgment } from "agent-judge/effect";',
    "export { noul } from '@typesafe-ai/sdk';",
    "const j = await import('agent-judge');",
    "import 'agent-judge';",
    "import {\n  judge,\n} from 'agent-judge';",
  ];
  for (const text of planted) assert.equal(importsAny(text, JUDGE).length, 1, text);
  assert.deepEqual(importsAny("const s = 'agent-judge is optional';\nimport x from 'agent-judged';", JUDGE), []);
});

test('nothing in the workspace imports the judge or its SDK, or depends on them', () => {
  const found: string[] = [];
  for (const dir of workspaces().filter((d) => d !== PACKAGE)) {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    for (const deps of [pkg.dependencies, pkg.devDependencies, pkg.peerDependencies]) {
      for (const name of JUDGE) if (deps && name in deps) found.push(`${path.relative(ROOT, dir)}/package.json: ${name}`);
    }
    for (const file of ['src', 'test', 'bin'].flatMap((sub) => sources(path.join(dir, sub)))) {
      for (const from of importsAny(fs.readFileSync(file, 'utf8'), JUDGE)) found.push(`${path.relative(ROOT, file)}: ${from}`);
    }
  }
  assert.ok(workspaces().length >= 4, 'the scan found the workspace');
  assert.deepEqual(found, [], 'the judge is optional: call it from nothing until the README\'s conditions hold');
});

test('the judge imports nothing from the workspace', () => {
  const names = workspaces().filter((d) => d !== PACKAGE).map(nameOf);
  assert.ok(names.includes('agent-engine') && names.includes('agent-workflows'));
  const pkg = JSON.parse(fs.readFileSync(path.join(PACKAGE, 'package.json'), 'utf8'));
  assert.deepEqual(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((n) => names.includes(n)), []);
  const found = ['src', 'bin', 'test'].flatMap((sub) => sources(path.join(PACKAGE, sub)))
    .flatMap((file) => [
      ...importsAny(fs.readFileSync(file, 'utf8'), names),
      ...importsOf(fs.readFileSync(file, 'utf8')).map((i) => i.from).filter((f) => f.startsWith('.') && !path.resolve(path.dirname(file), f).startsWith(PACKAGE + path.sep)),
    ].map((from) => `${path.relative(PACKAGE, file)}: ${from}`));
  assert.deepEqual(found, []);
});

/** The files written in Effect; everything else in src is plain. */
const EFFECT = ['judge.ts', 'index.ts', 'facade.ts'];

/** Why a plain file's imports would bring Effect in, or [] when they do not. */
export const effectIn = (text: string): string[] =>
  importsOf(text).filter((i) => packageOf(i.from) === 'effect' || (!i.typeOnly && EFFECT.some((f) => i.from === `./${f}`) && i.from !== './facade.ts'))
    .map((i) => i.from);

test('REFUSED: a plain file that imports Effect, or a value from an Effect file, is found; a type is not', () => {
  assert.deepEqual(effectIn("import { Effect } from 'effect';"), ['effect']);
  assert.deepEqual(effectIn("import { Schema } from 'effect/Schema';"), ['effect/Schema']);
  assert.deepEqual(effectIn("import { recorded } from './judge.ts';"), ['./judge.ts']);
  assert.deepEqual(effectIn("import type { Asked } from './judge.ts';\nimport { judge } from './facade.ts';"), []);
});

test('the plain files import no Effect; the facade exports none of it', () => {
  const src = path.join(PACKAGE, 'src');
  const plain = fs.readdirSync(src).filter((f) => f.endsWith('.ts') && !EFFECT.includes(f));
  assert.deepEqual(plain.sort(), ['card.ts', 'cli.ts', 'decide.ts', 'key.ts', 'record.ts', 'rival.ts', 'runs.ts', 'score.ts'], 'a new file is sorted into plain or Effect here');
  const found = plain.flatMap((f) => effectIn(fs.readFileSync(path.join(src, f), 'utf8')).map((from) => `${f}: ${from}`));
  assert.deepEqual(found, []);
  const reexports = [...fs.readFileSync(path.join(src, 'facade.ts'), 'utf8').matchAll(/^\s*export\s+(type\s+)?\{[^}]*\}\s+from\s+['"]([^'"]+)['"]/gm)];
  assert.ok(reexports.length > 3, 'the scan found the facade\'s re-exports');
  assert.deepEqual(reexports.filter((m) => !m[1] && ['effect', './judge.ts', './index.ts'].includes(m[2]!)).map((m) => m[0].trim()), [],
    'the facade re-exports types from the Effect files, never values');
});

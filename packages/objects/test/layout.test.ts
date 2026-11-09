/**
 * The layout of the objects' package's source, held by path: the folder rule written once in `docs/architecture.md`, *Folders, in every
 * package*, and judged by `test-kit/layout`. A folder is a concept at most `src/<concept>/<part>/` deep, with no count of its files; no
 * folder or file is named `utils`, `helpers`, `common`, `shared` or `misc`; and no two source files need each other's values.
 *
 * Each rule is made to refuse a planted tree first: a rule that reads nothing passes too.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { cycles, depthBreaks, namelessBreaks, valueGraph } from 'test-kit/layout';

const PKG = path.join(import.meta.dirname, '..');

/** The package's source under `src/`, tests beside the code left out, by path from the package. */
const sourceFiles = (): string[] =>
  fs
    .readdirSync(path.join(PKG, 'src'), { recursive: true, encoding: 'utf8' })
    .map((f) => `src/${f.split(path.sep).join('/')}`)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

test('REFUSED: a file a third folder under src, a folder or a file named for no concept, and a cycle of value imports', () => {
  assert.equal(depthBreaks(['src/a/b/c/d.ts'], 'src').length, 1);
  assert.deepEqual(depthBreaks(['src/a/b/c.ts', 'src/a.ts'], 'src'), []);
  assert.equal(namelessBreaks(['src/utils/x.ts', 'src/a/helpers.ts'], 'src').length, 2);
  const planted = new Map([
    ['src/a.ts', "import { b } from './b.ts';"],
    ['src/b.ts', "import { a } from './a.ts';"],
    ['src/c.ts', "import type { A } from './d.ts';"],
    ['src/d.ts', "import { c } from './c.ts';"],
  ]);
  assert.deepEqual(cycles(valueGraph(planted)), [['src/a.ts', 'src/b.ts']], 'a type-only cycle is erased and let through');
});

test('every file sits at most at src/<concept>/<part>/, every name says a concept, and no two files need each other’s values', () => {
  const files = sourceFiles();
  assert.ok(files.includes('src/run.ts'), 'the scan reads the source');
  assert.deepEqual([...depthBreaks(files, 'src'), ...namelessBreaks(files, 'src')], []);
  assert.deepEqual(cycles(valueGraph(new Map(files.map((f) => [f, fs.readFileSync(path.join(PKG, f), 'utf8')])))), []);
});

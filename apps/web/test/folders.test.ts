/**
 * The layout of the board's components, held by path: the folder rule written once in `docs/architecture.md`, *Folders, in every
 * package*, and judged by `test-kit/layout` over `src/components`. A folder is a concept (a noun of the board: a run, a step, a
 * factory, or a mechanic such as the frame) at most `src/components/<concept>/<part>/` deep, with no count of its files; no folder or
 * file is named `utils`, `helpers`, `common`, `shared` or `misc`; and no two files of `src` need each other's values. `ui/` and
 * `ai-elements/` are vendored, shipped by their registries as they are, and read by none of it.
 *
 * The board names a module by `@/` and mostly with no extension, which the kit's graph does not resolve: each specifier is first
 * rewritten as the relative path, extension and all, of the file it names (`resolvedText`).
 *
 * Each rule is made to refuse a planted tree first: a rule that reads nothing passes too.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { cycles, depthBreaks, namelessBreaks, valueGraph } from 'test-kit/layout';

const PKG = path.join(import.meta.dirname, '..');
const ROOT = 'src/components';

/** The folders shipped by a registry as they are: the rule reads none of their files. */
const VENDORED = [`${ROOT}/ui/`, `${ROOT}/ai-elements/`];

/** The board's source files under `src/`, the vendored folders left out, by path from the package. */
const sourceFiles = (): string[] =>
  fs
    .readdirSync(path.join(PKG, 'src'), { recursive: true, encoding: 'utf8' })
    .map((f) => `src/${f.split(path.sep).join('/')}`)
    .filter((f) => /\.tsx?$/.test(f) && !VENDORED.some((folder) => f.startsWith(folder)))
    .sort();

/** The file a specifier of `file` names, among `known`, or undefined for a package's or one outside them. */
function target(file: string, spec: string, known: ReadonlySet<string>): string | undefined {
  const base = spec.startsWith('@/')
    ? `src/${spec.slice(2)}`
    : spec.startsWith('.')
      ? path.posix.normalize(path.posix.join(path.posix.dirname(file), spec))
      : undefined;
  if (base === undefined) return undefined;
  return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find((f) => known.has(f));
}

/** `text` with each specifier that names one of `known` rewritten as the relative path of that file, extension and all. */
const resolvedText = (file: string, text: string, known: ReadonlySet<string>): string =>
  text.replace(/(\bfrom\s*|\bimport\s*\(\s*|^\s*import\s*)(['"])([^'"]+)\2/gm, (whole, head: string, quote: string, spec: string) => {
    const found = target(file, spec, known);
    if (found === undefined) return whole;
    const relative = path.posix.relative(path.posix.dirname(file), found);
    return `${head}${quote}${relative.startsWith('.') ? relative : `./${relative}`}${quote}`;
  });

/** The value imports among `files`, each read from the package and named as the file it resolves to. */
const graphOf = (files: readonly string[], read: (file: string) => string): Map<string, string[]> => {
  const known = new Set(files);
  return valueGraph(new Map(files.map((f) => [f, resolvedText(f, read(f), known)])));
};

const readOf = (file: string): string => fs.readFileSync(path.join(PKG, file), 'utf8');

test('REFUSED: a component a third folder under src/components, a folder or a file named for no concept, a cycle of value imports', () => {
  assert.equal(depthBreaks(['src/components/run/x/y/z.tsx'], ROOT).length, 1);
  assert.deepEqual(depthBreaks(['src/components/run/x/y.tsx', 'src/components/run/z.tsx'], ROOT), []);
  assert.equal(namelessBreaks(['src/components/utils/x.tsx'], ROOT).length, 1);
  const planted = new Map([
    ['src/components/run/A.tsx', "import { B } from '@/components/step/B';"],
    ['src/components/step/B.tsx', "import { A } from '../run/A';"],
    ['src/components/gate/C.tsx', "import type { D } from '@/components/gate/D';"],
    ['src/components/gate/D.tsx', "import { C } from './C';"],
  ]);
  assert.deepEqual(
    cycles(graphOf([...planted.keys()], (f) => planted.get(f) ?? '')),
    [['src/components/run/A.tsx', 'src/components/step/B.tsx']],
    'an `@/` and an extensionless import are read, and a type-only cycle is erased and let through',
  );
});

test('every component sits at most at src/components/<concept>/<part>/ and every name says a concept', () => {
  const files = sourceFiles();
  assert.ok(files.includes('src/components/look/index.ts'), 'the scan reads the components');
  assert.ok(!files.some((f) => f.startsWith(`${ROOT}/ui/`)), 'the vendored folders are left out');
  assert.deepEqual([...depthBreaks(files, ROOT), ...namelessBreaks(files, ROOT)], []);
});

test('no two files of the board’s source need each other’s values', () => {
  const files = sourceFiles();
  const graph = graphOf(files, readOf);
  assert.ok((graph.get('src/routes/__root.tsx') ?? []).length > 0, 'the graph resolves the board’s specifiers');
  assert.deepEqual(cycles(graph), []);
});

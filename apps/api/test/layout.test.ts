/**
 * The api's layout, held by path (`docs/architecture.md`): no two source files need each other's values, no source file imports a test,
 * a face re-exports by name, and every api path `.oxlintrc.json` names is a file that is there.
 *
 * Each rule is made to refuse a planted import first: a rule that reads nothing passes too.
 */
import './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const API = path.join(import.meta.dirname, '..');
const ROOT = path.join(API, '..', '..');

/** A line of prose read as nothing, as the runtime's `layout.test.ts` reads one, the line kept so numbers still count. */
const withoutComments = (text: string): string =>
  text
    .split('\n')
    .map((line) => (/^\s*(\/\/|\/\*|\*)/.test(line) ? '' : line))
    .join('\n');

type Import = { spec: string; typeOnly: boolean };

/** Every module a piece of source names, and whether the import is erased: `import type`, `export type`, or braces of `type` names only. */
function importsIn(text: string): Import[] {
  const code = withoutComments(text);
  const out: Import[] = [];
  for (const m of code.matchAll(/^\s*(?:import|export)\s+(type\s+)?([^'"`;]*?)\s*\bfrom\s*['"]([^'"]+)['"]/gm)) {
    const braces = /^\{([\s\S]*)\}$/.exec(m[2].trim());
    const members = braces
      ? braces[1]
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    out.push({ spec: m[3], typeOnly: Boolean(m[1]) || (members.length > 0 && members.every((s) => /^type\s/.test(s))) });
  }
  for (const m of code.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) out.push({ spec: m[1], typeOnly: false });
  for (const m of code.matchAll(/\bimport\s*\(\s*['"`]([^'"`]+)['"`]/g)) out.push({ spec: m[1], typeOnly: false });
  return out;
}

/** The package path a relative specifier in `file` names, or undefined for a package or a builtin. */
const resolved = (file: string, spec: string): string | undefined =>
  spec.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)) : undefined;

const isTest = (file: string) => file.endsWith('.test.ts') || file.startsWith('test/');

/** The api's source under `src/`, tests beside the code left out, by path from the package. */
const sourceFiles = (): string[] =>
  fs
    .readdirSync(path.join(API, 'src'), { recursive: true, encoding: 'utf8' })
    .map((f) => `src/${f.split(path.sep).join('/')}`)
    .filter((f) => f.endsWith('.ts') && !isTest(f));

const read = (file: string) => fs.readFileSync(path.join(API, file), 'utf8');

/** Every set of two files or more that need each other's values, by Tarjan's strongly connected components. */
function cycles(graph: Map<string, string[]>): string[][] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const found: string[][] = [];
  const visit = (node: string) => {
    index.set(node, index.size);
    low.set(node, index.get(node)!);
    stack.push(node);
    onStack.add(node);
    for (const next of graph.get(node) ?? []) {
      if (!index.has(next)) {
        visit(next);
        low.set(node, Math.min(low.get(node)!, low.get(next)!));
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node)!, index.get(next)!));
      }
    }
    if (low.get(node) === index.get(node)) {
      const component: string[] = [];
      let member: string;
      do {
        member = stack.pop()!;
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      if (component.length > 1) found.push(component.sort());
    }
  };
  for (const node of [...graph.keys()].sort()) if (!index.has(node)) visit(node);
  return found.sort((a, b) => a[0].localeCompare(b[0]));
}

/** The value imports among `files`: a type-only import is erased, so it may cycle. */
const valueGraph = (files: Map<string, string>): Map<string, string[]> =>
  new Map(
    [...files].map(([file, text]) => [
      file,
      importsIn(text).flatMap(({ spec, typeOnly }) => {
        const target = resolved(file, spec);
        return !typeOnly && target !== undefined && files.has(target) ? [target] : [];
      }),
    ]),
  );

/** Where a source file imports a test: a test is imported by nothing but the runner. */
const testImports = (file: string, imports: Import[]): string[] =>
  imports
    .map(({ spec }) => resolved(file, spec))
    .filter((target): target is string => target !== undefined && isTest(target))
    .map((target) => `${file} imports ${target}: nothing but node --test loads a test — move what both need into the source`);

/** Where a face re-exports a whole module: a face names what it re-exports, so a name is added on purpose. */
const starExports = (file: string, text: string): string[] =>
  [...withoutComments(text).matchAll(/^\s*export\s*\*[^'"`;]*from\s*['"]([^'"]+)['"]/gm)].map(
    (m) => `${file} re-exports all of ${m[1]}: re-export by name`,
  );

/** Every path under `apps/api/` an override of the lint config names by file, a glob left out, from the config's text. */
function apiPathsIn(config: string): string[] {
  const parsed = ts.parseConfigFileTextToJson('.oxlintrc.json', config);
  assert.equal(parsed.error, undefined, '.oxlintrc.json reads');
  const overrides = (parsed.config as { overrides?: Array<{ files?: string[]; excludeFiles?: string[] }> }).overrides ?? [];
  return overrides
    .flatMap((o) => [...(o.files ?? []), ...(o.excludeFiles ?? [])])
    .filter((f) => f.startsWith('apps/api/') && !/[*?[{]/.test(f));
}

/** Where the lint config names an api file that is not there: its rules then read nothing, and lint still passes. */
const missingPaths = (config: string, exists: (file: string) => boolean): string[] =>
  apiPathsIn(config)
    .filter((f) => !exists(f))
    .map((f) => `.oxlintrc.json names ${f}, which is not there: move its entry with the file`);

test('REFUSED: a cycle of value imports; a cycle through a type-only import is erased and let through', () => {
  const planted = new Map([
    ['src/runs.ts', "import { detail } from './detail.ts';"],
    ['src/detail.ts', "import { tryOf } from './try.ts';"],
    ['src/try.ts', "import { judgedNow } from './runs.ts';"],
    ['src/graph.ts', "import type { RunDetail } from './detail.ts';"],
    ['src/judged.ts', "import { e, type Views } from './store.ts';"],
    ['src/store.ts', "import {\n  type Holding,\n  type Waiting,\n} from './judged.ts';"],
  ]);
  assert.deepEqual(cycles(valueGraph(planted)), [['src/detail.ts', 'src/runs.ts', 'src/try.ts']]);
  planted.set('src/store.ts', "import { wordOf } from './judged.ts';");
  assert.deepEqual(cycles(valueGraph(planted)), [
    ['src/detail.ts', 'src/runs.ts', 'src/try.ts'],
    ['src/judged.ts', 'src/store.ts'],
  ]);
});

test('no two source files need each other’s values', () => {
  const files = new Map(sourceFiles().map((f) => [f, read(f)]));
  assert.ok(files.has('src/app.ts') && files.size > 20, 'the scan reads the source');
  assert.deepEqual(cycles(valueGraph(files)), []);
});

test('REFUSED: a source file that imports a test; a face that re-exports a whole module', () => {
  assert.deepEqual(testImports('src/runs.ts', importsIn("import { scratch } from '../test/scratch.ts';")), [
    'src/runs.ts imports test/scratch.ts: nothing but node --test loads a test — move what both need into the source',
  ]);
  assert.deepEqual(testImports('src/runs/runs.ts', importsIn("const { aRun } = await import('./runs.test.ts');")), [
    'src/runs/runs.ts imports src/runs/runs.test.ts: nothing but node --test loads a test — move what both need into the source',
  ]);
  assert.deepEqual(starExports('src/runs/index.ts', "export { runs } from './runs.ts';\nexport * from './graph.ts';"), [
    'src/runs/index.ts re-exports all of ./graph.ts: re-export by name',
  ]);
  assert.deepEqual(starExports('src/runs/index.ts', '// export * from "./graph.ts";'), [], 'not refused: prose');
});

test('no source file imports a test, and every face re-exports by name', () => {
  assert.deepEqual(
    sourceFiles().flatMap((f) => [...testImports(f, importsIn(read(f))), ...starExports(f, read(f))]),
    [],
  );
});

test('REFUSED: an api path in .oxlintrc.json that is not there; a glob is not a path', () => {
  const config = JSON.stringify({
    overrides: [{ files: ['apps/api/src/body.ts', 'apps/api/src/gone.ts', 'apps/api/**', 'packages/x/src/gone.ts'] }],
  });
  const there = new Set(['apps/api/src/body.ts']);
  assert.deepEqual(
    missingPaths(`// the decode override\n${config}`, (f) => there.has(f)),
    ['.oxlintrc.json names apps/api/src/gone.ts, which is not there: move its entry with the file'],
  );
});

test('every api path .oxlintrc.json names is there', () => {
  const config = fs.readFileSync(path.join(ROOT, '.oxlintrc.json'), 'utf8');
  assert.ok(apiPathsIn(config).includes('apps/api/src/body.ts'), 'the scan reads the decode override');
  assert.deepEqual(
    missingPaths(config, (f) => fs.existsSync(path.join(ROOT, f))),
    [],
  );
});

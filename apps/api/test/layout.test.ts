/**
 * The api's layout, held by path (`docs/architecture.md`): the root of `src` holds the process, the mount, the guard, the store and the
 * body reader; every other file sits in a feature folder of at most six source files, which has a face (`index.ts`) when it has two or
 * more and none when it has one; `app.ts` mounts a folder through its face; a face holds nothing but re-exports by name. No two source
 * files need each other's values, no source file imports a test, no file or folder is named `utils`, `helpers`, `common`, `shared` or
 * `misc`, and every api path `.oxlintrc.json` names is a file that is there.
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

/** What the root of `src` holds: the process, the mount, the port, the guard every route passes, the shared store, the body reader. */
const ROOT_FILES = ['src/app.ts', 'src/body.ts', 'src/guard.ts', 'src/layer.ts', 'src/main.ts', 'src/port.ts', 'src/store.ts'];

/** The most source files a feature folder holds, its face included: a folder that needs another holds two features. */
const FOLDER_MAX = 6;

/** The folder of `src` a file sits in, or undefined for a file at the root. */
const folderOf = (file: string): string | undefined => /^src\/([^/]+)\//.exec(file)?.[1];

/** Where the tree breaks the layout: a stray file at the root, a folder too big, a folder with a face it needs not or without one it needs. */
function layoutBreaches(files: string[]): string[] {
  const out = files
    .filter((f) => folderOf(f) === undefined && !ROOT_FILES.includes(f))
    .map((f) => `${f} sits at the root of src, which holds ${ROOT_FILES.join(', ')}: move it into its feature's folder`);
  const byFolder = new Map<string, string[]>();
  for (const f of files) {
    const folder = folderOf(f);
    if (folder !== undefined) byFolder.set(folder, [...(byFolder.get(folder) ?? []), f]);
  }
  for (const [folder, inside] of [...byFolder].sort(([a], [b]) => a.localeCompare(b))) {
    const face = inside.includes(`src/${folder}/index.ts`);
    if (inside.length > FOLDER_MAX) {
      out.push(`src/${folder}/ holds ${inside.length} source files, more than ${FOLDER_MAX}: it holds two features — split it`);
    }
    if (!face && inside.length > 1) out.push(`src/${folder}/ has ${inside.length} source files and no index.ts: give it a face`);
    if (face && inside.length < 3) out.push(`src/${folder}/index.ts re-exports one file: import that file, and remove the face`);
  }
  return out;
}

/** The names of a module about nothing in particular: a split follows the feature, and what a feature shares lives in its own file. */
const GENERIC = ['utils', 'helpers', 'common', 'shared', 'misc'];

/** Where a folder or a file of `src` is named for no feature: its whole name, the `.ts` aside, is one of `GENERIC`. */
const genericNames = (files: string[]): string[] =>
  files.flatMap((f) =>
    f
      .replace(/\.ts$/, '')
      .split('/')
      .slice(1)
      .filter((part) => GENERIC.includes(part))
      .map((part) => `${f} is named \`${part}\`, which says no feature: name it for what it does, beside the code that uses it`),
  );

/** Where `app.ts` mounts a folder past its face: a folder with an `index.ts` is reached through it. */
const pastFaces = (file: string, imports: Import[], files: string[]): string[] =>
  imports.flatMap(({ spec }) => {
    const target = resolved(file, spec);
    const folder = target === undefined ? undefined : folderOf(target);
    if (folder === undefined || target === `src/${folder}/index.ts` || !files.includes(`src/${folder}/index.ts`)) return [];
    return [`${file} imports ${target}: mount src/${folder}/ through its face, src/${folder}/index.ts`];
  });

/** Where a face holds more than re-exports by name: a face is a door, and what it does lives in the folder's files. */
const faceBody = (file: string, text: string): string[] =>
  withoutComments(text)
    .split(/;\s*/)
    .map((s) => s.trim())
    .filter((s) => s !== '' && !/^export\s+(type\s+)?\{[^}]*\}\s*from\s*['"][^'"]+['"]$/.test(s))
    .map((s) => `${file} holds \`${s.split('\n')[0]}\`: a face holds only re-exports by name`);

test('REFUSED: a stray file at the root, a seventh source file in a folder, a folder of two without a face, a face over one file', () => {
  const tree = [...ROOT_FILES, 'src/runs/index.ts', 'src/runs/runs.ts', 'src/runs/graph.ts', 'src/asks/asks.ts'];
  assert.deepEqual(layoutBreaches(tree), []);
  assert.deepEqual(layoutBreaches([...tree, 'src/tries.ts']), [
    `src/tries.ts sits at the root of src, which holds ${ROOT_FILES.join(', ')}: move it into its feature's folder`,
  ]);
  const seven = ['a', 'b', 'c', 'd', 'e'].map((f) => `src/runs/${f}.ts`);
  assert.deepEqual(layoutBreaches([...tree, ...seven]), ['src/runs/ holds 8 source files, more than 6: it holds two features — split it']);
  assert.deepEqual(layoutBreaches([...tree, ...seven.slice(0, 3)]), []);
  assert.deepEqual(layoutBreaches([...tree, ...seven.slice(0, 4)]), [
    'src/runs/ holds 7 source files, more than 6: it holds two features — split it',
  ]);
  assert.deepEqual(layoutBreaches([...tree, 'src/asks/said.ts']), ['src/asks/ has 2 source files and no index.ts: give it a face']);
  assert.deepEqual(layoutBreaches([...tree, 'src/asks/index.ts']), [
    'src/asks/index.ts re-exports one file: import that file, and remove the face',
  ]);
});

test('the root of src holds its six files, and each folder is a feature of at most six source files with a face where it has two', () => {
  const files = sourceFiles();
  assert.ok(files.includes('src/runs/runs.ts') && files.includes('src/app.ts'), 'the scan reads the folders');
  assert.deepEqual(layoutBreaches(files), []);
});

test('REFUSED: app.ts mounting a folder past its face; a folder with one file and no face is reached by that file', () => {
  const files = ['src/app.ts', 'src/runs/index.ts', 'src/runs/runs.ts', 'src/asks/asks.ts'];
  assert.deepEqual(pastFaces('src/app.ts', importsIn("import { runs } from './runs/runs.ts';"), files), [
    'src/app.ts imports src/runs/runs.ts: mount src/runs/ through its face, src/runs/index.ts',
  ]);
  assert.deepEqual(pastFaces('src/app.ts', importsIn("import { runs } from './runs/index.ts';"), files), []);
  assert.deepEqual(pastFaces('src/app.ts', importsIn("import { asks } from './asks/asks.ts';"), files), []);
  assert.deepEqual(pastFaces('src/app.ts', importsIn("import { Hono } from 'hono';\nimport { e } from './store.ts';"), files), []);
});

test('app.ts mounts every folder that has a face through it', () => {
  const files = sourceFiles();
  const imports = importsIn(read('src/app.ts'));
  assert.ok(imports.filter(({ spec }) => spec.startsWith('./')).length >= 8, 'the scan reads app.ts');
  assert.deepEqual(pastFaces('src/app.ts', imports, files), []);
});

test('REFUSED: a face that declares, imports or computes anything but re-exports by name', () => {
  assert.deepEqual(
    faceBody('src/runs/index.ts', "/** The runs. */\nexport { runs } from './runs.ts';\nexport type { RunSummary } from './runs.ts';"),
    [],
  );
  assert.deepEqual(faceBody('src/runs/index.ts', "export { runs } from './runs.ts';\nexport const kept = new Map();"), [
    'src/runs/index.ts holds `export const kept = new Map()`: a face holds only re-exports by name',
  ]);
  assert.deepEqual(faceBody('src/runs/index.ts', "import { runs } from './runs.ts';\nexport { runs };"), [
    "src/runs/index.ts holds `import { runs } from './runs.ts'`: a face holds only re-exports by name",
    'src/runs/index.ts holds `export { runs }`: a face holds only re-exports by name',
  ]);
});

test('every face holds only re-exports by name', () => {
  const faces = sourceFiles().filter((f) => f.endsWith('/index.ts'));
  assert.ok(faces.length >= 8, 'the scan reads the faces');
  assert.deepEqual(
    faces.flatMap((f) => faceBody(f, read(f))),
    [],
  );
});

test('REFUSED: a file or a folder named utils, helpers, common, shared or misc; a name that only holds one is let through', () => {
  assert.deepEqual(genericNames(['src/runs/utils.ts', 'src/helpers.ts', 'src/shared/runs.ts']), [
    'src/runs/utils.ts is named `utils`, which says no feature: name it for what it does, beside the code that uses it',
    'src/helpers.ts is named `helpers`, which says no feature: name it for what it does, beside the code that uses it',
    'src/shared/runs.ts is named `shared`, which says no feature: name it for what it does, beside the code that uses it',
  ]);
  assert.deepEqual(genericNames(['src/runs/utility-words.ts', 'src/steps/logs.ts', 'src/common-runs/misc-free.ts', 'src/utils.tsx']), []);
});

test('no file or folder of src is named for no feature', () => {
  const files = sourceFiles();
  assert.ok(files.length >= 30, 'the scan reads the folders');
  assert.deepEqual(genericNames(files), []);
});

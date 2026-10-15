/**
 * The package's layout, held by path (`docs/architecture.md`): no two files need each other's values, no source file imports a test, a
 * barrel re-exports by name, and a feature folder is small, named for its feature, and read from outside through its face.
 *
 * A feature folder holds at most six source files, tests beside them not counted. Its face is its `index.ts`, or its one pure file when
 * it has no `index.ts`; a file outside the folder imports the folder's pure code through the face alone, and a store or a verb by its own
 * path. The CLI's folder, `src/cli/`, is controllers and has no face. The kinds themselves are held by `boundary.test.ts`.
 *
 * Each rule is made to refuse a planted source first: a rule that reads nothing passes too.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const PKG = path.join(import.meta.dirname, '..');

/** A line of prose read as nothing, as `contract.test.ts` reads one, the line kept so numbers still count. */
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

/** The package's source under `src/`, tests beside the code left out, by path from the package. */
const sourceFiles = (): string[] =>
  fs
    .readdirSync(path.join(PKG, 'src'), { recursive: true, encoding: 'utf8' })
    .map((f) => `src/${f.split(path.sep).join('/')}`)
    .filter((f) => f.endsWith('.ts') && !isTest(f));

const read = (file: string) => fs.readFileSync(path.join(PKG, file), 'utf8');

/** The feature folder `file` sits in, or undefined for a file at the root of `src`. */
const folderOf = (file: string): string | undefined => {
  const dir = path.posix.dirname(file);
  return dir.startsWith('src/') ? dir : undefined;
};

/** A folder's pure code: every file that is not a store, a verb or a test, outside the CLI's folder, which is controllers. */
const isFolderPure = (file: string): boolean =>
  folderOf(file) !== undefined && !/\.(store|verb|test)\.ts$/.test(file) && !file.startsWith('src/cli/');

/** The most source files a feature folder holds, its `index.ts` included and its tests not. */
const FOLDER_MAX = 6;

/** Names that say nothing of a feature: code split into them has no home. */
const NAMELESS = ['utils', 'helpers', 'common', 'shared', 'misc'];

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

/** Where a source file imports a test: a test beside the code, or anything under `test/`, is imported by nothing but a test. */
const testImports = (file: string, imports: Import[]): string[] =>
  imports
    .map(({ spec }) => resolved(file, spec))
    .filter((target): target is string => target !== undefined && isTest(target))
    .map((target) => `${file} imports ${target}: nothing but a test imports a test — move what both need into the source`);

/** Where a face or an entry re-exports a whole module: a barrel names what it re-exports, so a name is added on purpose. */
const starExports = (file: string, text: string): string[] =>
  [...withoutComments(text).matchAll(/^\s*export\s*\*[^'"`;]*from\s*['"]([^'"]+)['"]/gm)].map(
    (m) => `${file} re-exports all of ${m[1]}: re-export by name`,
  );

/** Each feature folder past `FOLDER_MAX` source files, and each folder or file whose name says no feature. */
function folderBreaks(files: readonly string[]): string[] {
  const sizes = new Map<string, number>();
  for (const file of files.filter((f) => !isTest(f))) {
    const folder = folderOf(file);
    if (folder !== undefined) sizes.set(folder, (sizes.get(folder) ?? 0) + 1);
  }
  const out = [...sizes]
    .filter(([, size]) => size > FOLDER_MAX)
    .map(
      ([folder, size]) =>
        `${folder}/ holds ${size} source files, past ${FOLDER_MAX}: a folder that needs more holds two features — split it along them`,
    );
  for (const file of files) {
    const named = path.posix
      .relative('src', file)
      .split('/')
      .map((part) => part.split('.')[0]);
    const nameless = named.find((part) => NAMELESS.includes(part));
    if (nameless !== undefined)
      out.push(`${file} is named ${nameless}, which says no feature: put each part beside the feature that uses it`);
  }
  return out.sort();
}

/**
 * Where a file outside a folder imports the folder's pure code past its face: the face is the folder's `index.ts`, or its one pure file
 * when it has no `index.ts`.
 */
function faceBreaks(files: readonly string[], importsOf: (file: string) => Import[]): string[] {
  const pureBy = new Map<string, string[]>();
  for (const file of files.filter(isFolderPure)) pureBy.set(folderOf(file)!, [...(pureBy.get(folderOf(file)!) ?? []), file]);
  const faceOf = (folder: string): string | undefined => {
    const pure = pureBy.get(folder) ?? [];
    if (pure.includes(`${folder}/index.ts`)) return `${folder}/index.ts`;
    return pure.length === 1 ? pure[0] : undefined;
  };
  const out: string[] = [];
  for (const file of files) {
    for (const { spec } of importsOf(file)) {
      const target = resolved(file, spec);
      if (target === undefined || !files.includes(target) || !isFolderPure(target)) continue;
      const folder = folderOf(target)!;
      if (folderOf(file) === folder) continue;
      const face = faceOf(folder);
      if (target === face) continue;
      out.push(
        face === undefined
          ? `${file} imports ${target}: ${folder}/ has ${pureBy.get(folder)!.length} pure files and no index.ts — write one that re-exports them by name, and import it`
          : `${file} imports ${target}: import ${face}, the face of ${folder}/`,
      );
    }
  }
  return out.sort();
}

test('REFUSED: a cycle of value imports; a cycle through a type-only import is erased and let through', () => {
  const planted = new Map([
    ['src/retry/retry.ts', "import { runReady } from '../run.ts';"],
    ['src/run.ts', "export { retryable } from './retry/index.ts';"],
    ['src/retry/index.ts', "export { retryable } from './retry.ts';"],
    ['src/timeline/timeline.ts', "import type { RunRecord } from '../run.ts';"],
    ['src/tick/tick.verb.ts', "import { assess, type RunRecord } from '../run.ts';\nimport { file } from './file.verb.ts';"],
    ['src/tick/file.verb.ts', "import type { Pass } from './tick.verb.ts';\nimport { type Filed } from './tick.verb.ts';"],
    ['src/status/status.ts', "import {\n  type RunRecord,\n  type StepStatus,\n} from '../run.ts';"],
  ]);
  assert.deepEqual(cycles(valueGraph(planted)), [['src/retry/index.ts', 'src/retry/retry.ts', 'src/run.ts']]);
  planted.set('src/tick/file.verb.ts', "import { pass } from './tick.verb.ts';");
  assert.deepEqual(cycles(valueGraph(planted)), [
    ['src/retry/index.ts', 'src/retry/retry.ts', 'src/run.ts'],
    ['src/tick/file.verb.ts', 'src/tick/tick.verb.ts'],
  ]);
});

test('no two source files need each other’s values', () => {
  const files = new Map(sourceFiles().map((f) => [f, read(f)]));
  assert.ok(files.has('src/run.ts') && files.size > 20, 'the scan reads the source');
  assert.deepEqual(cycles(valueGraph(files)), []);
});

test("REFUSED on the source: a value import from the format's leaf back to a folder above it closes a cycle", () => {
  const files = new Map(sourceFiles().map((f) => [f, read(f)]));
  files.set('src/step/step.ts', `${files.get('src/step/step.ts')}\nimport { countOf } from '../keys/index.ts';`);
  assert.deepEqual(cycles(valueGraph(files)), [
    [
      'src/closeout/closeout.ts',
      'src/closeout/envelope.ts',
      'src/closeout/index.ts',
      'src/harness/harness.ts',
      'src/keys/filed-as.ts',
      'src/keys/index.ts',
      'src/keys/keys.ts',
      'src/keys/merged-output.ts',
      'src/keys/tools.ts',
      'src/question/index.ts',
      'src/question/numbered.ts',
      'src/question/question.ts',
      'src/step/step.ts',
    ],
  ]);
});

test('REFUSED on the source: a value import from a leaf cut out of run.ts back to run.ts closes a cycle; the type is let through', () => {
  const files = new Map(sourceFiles().map((f) => [f, read(f)]));
  const wait = files.get('src/wait/wait.ts')!;
  files.set('src/wait/wait.ts', `${wait}\nimport { assess } from '../run.ts';`);
  assert.deepEqual(cycles(valueGraph(files)), [
    [
      'src/brief/brief-sections.ts',
      'src/brief/brief.ts',
      'src/brief/index.ts',
      'src/cancel/cancel.ts',
      'src/cap/cap.ts',
      'src/decide/decide.ts',
      'src/feed/feed.ts',
      'src/forget/forget.ts',
      'src/gate/gate.ts',
      'src/list/list.ts',
      'src/merge/merge.ts',
      'src/prune/prune.ts',
      'src/retry/index.ts',
      'src/retry/retry-refusal.ts',
      'src/retry/retry.ts',
      'src/round/round.ts',
      'src/run.ts',
      'src/say/say.ts',
      'src/start/context.ts',
      'src/start/index.ts',
      'src/tick/assess.ts',
      'src/wait/wait.ts',
    ],
  ]);
  files.set('src/wait/wait.ts', `${wait}\nimport type { Assessment } from '../run.ts';`);
  assert.deepEqual(cycles(valueGraph(files)), []);
});

test('REFUSED on the source: a value import of the tick from the cap it reads between passes closes a cycle', () => {
  const files = new Map(sourceFiles().map((f) => [f, read(f)]));
  files.set('src/cap/cap.verb.ts', `${files.get('src/cap/cap.verb.ts')}\nimport { tick } from '../tick/tick.verb.ts';`);
  assert.deepEqual(cycles(valueGraph(files)), [
    ['src/cap/cap.verb.ts', 'src/ending/ending.verb.ts', 'src/list/list.verb.ts', 'src/tick/advance.verb.ts', 'src/tick/tick.verb.ts'],
  ]);
});

test('REFUSED on the source: a value import from a part cut out of run.ts back to the assessment closes a cycle; the type is let through', () => {
  const files = new Map(sourceFiles().map((f) => [f, read(f)]));
  const round = files.get('src/round/round.ts')!;
  files.set('src/round/round.ts', `${round}\nimport { assess } from '../tick/assess.ts';`);
  assert.deepEqual(cycles(valueGraph(files)), [
    ['src/retry/index.ts', 'src/retry/retry-refusal.ts', 'src/retry/retry.ts', 'src/round/round.ts', 'src/tick/assess.ts'],
  ]);
  files.set('src/round/round.ts', `${round}\nimport type { Assessment } from '../tick/assess.ts';`);
  assert.deepEqual(cycles(valueGraph(files)), []);
});

test("REFUSED on the source: a value import from the flag reader back to the verbs' table closes a cycle; the type is let through", () => {
  const files = new Map(sourceFiles().map((f) => [f, read(f)]));
  const flags = files.get('src/cli/flags.ts')!;
  files.set('src/cli/flags.ts', `${flags}\nimport { main } from './main.ts';`);
  assert.deepEqual(cycles(valueGraph(files)), [
    ['src/cli/decide/decide.ts', 'src/cli/flags.ts', 'src/cli/main.ts', 'src/cli/runs.ts', 'src/cli/start.ts', 'src/cli/writers.ts'],
  ]);
  files.set('src/cli/flags.ts', `${flags}\nimport type { main } from './main.ts';`);
  assert.deepEqual(cycles(valueGraph(files)), []);
});

test('REFUSED: a source file that imports a test or test support; a barrel that re-exports a whole module', () => {
  assert.deepEqual(testImports('src/check/check.ts', importsIn("import { corpus } from './check.test.ts';")), [
    'src/check/check.ts imports src/check/check.test.ts: nothing but a test imports a test — move what both need into the source',
  ]);
  assert.deepEqual(testImports('src/run.ts', importsIn("import { told } from '../test/told.ts';")), [
    'src/run.ts imports test/told.ts: nothing but a test imports a test — move what both need into the source',
  ]);
  assert.deepEqual(testImports('src/run.ts', importsIn("// import { told } from '../test/told.ts';")), [], 'not refused: prose');
  assert.deepEqual(starExports('src/retry/index.ts', "export { retryable } from './retry.ts';\nexport * from './retry-ask.ts';"), [
    'src/retry/index.ts re-exports all of ./retry-ask.ts: re-export by name',
  ]);
  assert.deepEqual(starExports('src/retry/index.ts', '// export * from "./retry-ask.ts";'), [], 'not refused: prose');
});

test('no source file imports a test, and every barrel re-exports by name', () => {
  assert.deepEqual(
    sourceFiles().flatMap((f) => [...testImports(f, importsIn(read(f))), ...starExports(f, read(f))]),
    [],
  );
});

test('REFUSED: a seventh source file in a folder, and a folder or a file named for no feature', () => {
  const six = ['a.ts', 'b.ts', 'index.ts', 'a.store.ts', 'a.verb.ts', 'b.verb.ts'].map((f) => `src/retry/${f}`);
  assert.deepEqual(folderBreaks([...six, 'src/retry/a.test.ts', 'src/run.ts']), [], 'six, a test beside them, and the root: let through');
  assert.deepEqual(folderBreaks([...six, 'src/retry/c.ts']), [
    'src/retry/ holds 7 source files, past 6: a folder that needs more holds two features — split it along them',
  ]);
  assert.deepEqual(folderBreaks(['src/utils/words.ts', 'src/retry/helpers.ts', 'src/feed/shared.store.ts', 'src/misc.ts']), [
    'src/feed/shared.store.ts is named shared, which says no feature: put each part beside the feature that uses it',
    'src/misc.ts is named misc, which says no feature: put each part beside the feature that uses it',
    'src/retry/helpers.ts is named helpers, which says no feature: put each part beside the feature that uses it',
    'src/utils/words.ts is named utils, which says no feature: put each part beside the feature that uses it',
  ]);
  assert.deepEqual(folderBreaks(['src/common-words/words.ts', 'src/feed/sharedness.ts']), [], 'a name that only starts so: let through');
});

test("REFUSED on the source: a seventh source file in the CLI's folder", () => {
  const files = sourceFiles();
  assert.deepEqual(
    files.filter((f) => f.startsWith('src/cli/') && !f.endsWith('.test.ts')),
    ['exit', 'flags', 'main', 'runs', 'start', 'writers', 'decide/decide'].map((f) => `src/cli/${f}.ts`),
    "the CLI's folder holds its six today, and decide/ one",
  );
  assert.deepEqual(folderBreaks([...files, 'src/cli/extra.ts']), [
    'src/cli/ holds 7 source files, past 6: a folder that needs more holds two features — split it along them',
  ]);
});

test('each feature folder holds at most six source files, and every name says a feature', () => {
  assert.deepEqual(folderBreaks(sourceFiles()), []);
});

test("REFUSED: a file outside a folder importing the folder's pure code past its face", () => {
  const planted: Record<string, string> = {
    'src/retry/index.ts': "export { retryable } from './retry.ts';\nexport { answerOf } from './retry-ask.ts';",
    'src/retry/retry.ts': "import { answerOf } from './retry-ask.ts';",
    'src/retry/retry-ask.ts': '',
    'src/retry/retry.verb.ts': "import { retryable } from './index.ts';",
    'src/meter/meter.ts': '',
    'src/meter/tally.store.ts': "import { costOf } from './meter.ts';",
    'src/brief/brief.ts': '',
    'src/brief/brief-sections.ts': '',
    'src/cli/main.ts': "import { flags } from './flags.ts';",
    'src/cli/flags.ts': '',
    'src/tick/tick.verb.ts': [
      "import { retryable } from '../retry/index.ts';",
      "import { retry } from '../retry/retry.verb.ts';",
      "import { costOf } from '../meter/meter.ts';",
      "import { tally } from '../meter/tally.store.ts';",
      "import { answerOf } from '../retry/retry-ask.ts';",
      "import { composeBrief } from '../brief/brief.ts';",
    ].join('\n'),
    'src/run.ts': "import type { Retry } from './retry/retry.ts';",
    'bin/wf.ts': "import { main } from '../src/cli/main.ts';",
  };
  const files = Object.keys(planted);
  assert.deepEqual(
    faceBreaks(files, (f) => importsIn(planted[f])),
    [
      'src/run.ts imports src/retry/retry.ts: import src/retry/index.ts, the face of src/retry/',
      'src/tick/tick.verb.ts imports src/brief/brief.ts: src/brief/ has 2 pure files and no index.ts — write one that re-exports them by name, and import it',
      'src/tick/tick.verb.ts imports src/retry/retry-ask.ts: import src/retry/index.ts, the face of src/retry/',
    ],
  );
});

test('REFUSED on the source: a file outside keys/ importing its readers past keys/index.ts', () => {
  const files = sourceFiles();
  assert.deepEqual(
    faceBreaks(files, (f) =>
      importsIn(f === 'src/tick/tick.verb.ts' ? `${read(f)}\nimport { toolsOf } from '../keys/tools.ts';` : read(f)),
    ),
    ['src/tick/tick.verb.ts imports src/keys/tools.ts: import src/keys/index.ts, the face of src/keys/'],
  );
});

test('REFUSED on the source: a file outside retry/ or brief/ importing their pure code past the face', () => {
  const files = sourceFiles();
  const planted = `import { retryable } from '../retry/retry.ts';\nimport { composeBrief } from '../brief/brief.ts';`;
  assert.deepEqual(
    faceBreaks(files, (f) => importsIn(f === 'src/cancel/cancel.verb.ts' ? `${read(f)}\n${planted}` : read(f))),
    [
      'src/cancel/cancel.verb.ts imports src/brief/brief.ts: import src/brief/index.ts, the face of src/brief/',
      'src/cancel/cancel.verb.ts imports src/retry/retry.ts: import src/retry/index.ts, the face of src/retry/',
    ],
  );
});

test("a file outside a folder imports the folder's pure code through its face alone", () => {
  const files = sourceFiles();
  assert.deepEqual(
    faceBreaks(files, (f) => importsIn(read(f))),
    [],
  );
});

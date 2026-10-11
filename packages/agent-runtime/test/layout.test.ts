/**
 * The runtime's layout, held by path (`docs/architecture.md`): the core knows of the harnesses only their seam, a harness knows
 * nothing of A2A, of the engine service or of the entries, and the CLI reaches the runtime through its face alone. No two files
 * need each other's values, no source file imports a test, a face re-exports by name, and only the entries sit flat in `src/`.
 *
 * Each rule is made to refuse a planted import first: a rule that reads nothing passes too.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { WORKER } from '../src/harness/detached/detached.ts';

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

const isTest = (file: string) => file.endsWith('.test.ts');

/** The package's source under `src/`, tests beside the code left out, by path from the package. */
const sourceFiles = (): string[] =>
  fs
    .readdirSync(path.join(PKG, 'src'), { recursive: true, encoding: 'utf8' })
    .map((f) => `src/${f.split(path.sep).join('/')}`)
    .filter((f) => f.endsWith('.ts') && !isTest(f));

const read = (file: string) => fs.readFileSync(path.join(PKG, file), 'utf8');

const DOORS = ['src/index.ts'];
/** The runtime's entries: its one face, the pure door to its vocabulary (`agent-runtime/vocabulary`), and what a test is given. */
const ENTRIES = [...DOORS, 'src/vocabulary.ts', 'src/testing.ts'];
const under = (file: string, dir: string) => file.startsWith(`src/${dir}/`);
/** What the core may import of the harnesses: the seam, the arguments a task carries, and their face. */
const SEAM = ['src/harness/seam.ts', 'src/harness/args.ts', 'src/harness/index.ts'];

/** Why each rule refuses, and what to do instead. */
const WHY = {
  core: `the core knows a harness only by ${SEAM.join(', ')} — put what it needs in the seam`,
  below: 'the core and the harnesses sit below A2A, the engine service and the entries — move what both need down',
  cli: `the CLI reaches the runtime through its face, ${DOORS.join(' and ')}, alone — export what it needs there`,
};

/** Where `file` imports what its folder may not: each breach, worded with what to do instead. */
function pathBreaches(file: string, imports: Import[]): string[] {
  const out: string[] = [];
  for (const { spec } of imports) {
    const target = resolved(file, spec);
    if (target === undefined || !target.startsWith('src/')) continue;
    const above = ENTRIES.includes(target) || ['a2a', 'service', 'cli'].some((dir) => under(target, dir));
    if (under(file, 'core') && under(target, 'harness') && !SEAM.includes(target)) {
      out.push(`${file} imports ${target}: ${WHY.core}`);
    } else if ((under(file, 'core') || under(file, 'harness')) && above) {
      out.push(`${file} imports ${target}: ${WHY.below}`);
    } else if (under(file, 'cli') && !DOORS.includes(target) && !under(target, 'cli')) {
      out.push(`${file} imports ${target}: ${WHY.cli}`);
    }
  }
  return out;
}

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

/** Where a source file imports a test: a test beside the code is imported by nothing but the runner. */
const testImports = (file: string, imports: Import[]): string[] =>
  imports
    .map(({ spec }) => resolved(file, spec))
    .filter((target): target is string => target !== undefined && isTest(target))
    .map((target) => `${file} imports ${target}: nothing but node --test loads a test — move what both need into the source`);

/** Where a face or an entry re-exports a whole module: a barrel names what it re-exports, so a name is added on purpose. */
const starExports = (file: string, text: string): string[] =>
  [...withoutComments(text).matchAll(/^\s*export\s*\*[^'"`;]*from\s*['"]([^'"]+)['"]/gm)].map(
    (m) => `${file} re-exports all of ${m[1]}: re-export by name`,
  );

test('REFUSED: the core reaching a driver, A2A, the engine service or an entry; a harness reaching A2A, the service or an entry; the CLI reaching past its face', () => {
  const planted: Array<[string, string, string, string]> = [
    ['src/core/engine/engine.ts', "import { claudeOps } from '../../harness/claude/bg.ts';", 'src/harness/claude/bg.ts', WHY.core],
    [
      'src/core/domain.ts',
      "import type { HarnessSpec } from '../harness/detached/detached.ts';",
      'src/harness/detached/detached.ts',
      WHY.core,
    ],
    ['src/core/domain.ts', "import { nameParts } from '../a2a/map.ts';", 'src/a2a/map.ts', WHY.below],
    ['src/core/engine/filing.ts', "import { Engine } from '../../index.ts';", 'src/index.ts', WHY.below],
    ['src/core/engine/filing.ts', "import { Engine } from '../../service/index.ts';", 'src/service/index.ts', WHY.below],
    ['src/core/lifecycle.ts', "const cli = await import('../cli/main.ts');", 'src/cli/main.ts', WHY.below],
    ['src/harness/claude/code.ts', "import { nameParts } from '../../a2a/map.ts';", 'src/a2a/map.ts', WHY.below],
    ['src/harness/seam.ts', "export { refusalWords } from '../service/refusal.ts';", 'src/service/refusal.ts', WHY.below],
    ['src/harness/sdk.ts', "import type { EngineShape } from '../index.ts';", 'src/index.ts', WHY.below],
    ['src/harness/claude/vocabulary.ts', "import { fenceReach } from '../../vocabulary.ts';", 'src/vocabulary.ts', WHY.below],
    ['src/cli/main.ts', "import { fold } from '../core/domain.ts';", 'src/core/domain.ts', WHY.cli],
    ['src/cli/main.ts', "import { configRefusal } from '../service/options.ts';", 'src/service/options.ts', WHY.cli],
    ['src/cli/main.ts', "import { Engine } from '../service/index.ts';", 'src/service/index.ts', WHY.cli],
  ];
  for (const [file, line, target, why] of planted) {
    assert.deepEqual(
      pathBreaches(file, importsIn(`// a planted import\n${line}\n`)),
      [`${file} imports ${target}: ${why}`],
      `${file}: ${line}`,
    );
  }
  const allowed: Array<[string, string]> = [
    ['src/core/engine/engine.ts', "import { Runner } from '../../harness/seam.ts';"],
    ['src/core/domain.ts', "import type { HarnessArgs } from '../harness/args.ts';"],
    ['src/core/engine/engine.ts', "import { Runner } from '../../harness/index.ts';"],
    ['src/harness/detached/detached.ts', "import { countSpawn } from '../../core/engine/tally.ts';"],
    ['src/a2a/client.ts', "import { claudeOps } from '../harness/claude/bg.ts';"],
    ['src/cli/main.ts', "import { Engine } from '../index.ts';"],
    ['src/cli/main.ts', "import type { Event } from '../index.ts';"],
    ['src/cli/main.ts', "import { BRIEF_KEYS } from './brief.ts';"],
    ['src/core/domain.ts', "// import { nameParts } from '../a2a/map.ts';"],
  ];
  for (const [file, line] of allowed) assert.deepEqual(pathBreaches(file, importsIn(line)), [], `not refused: ${file}: ${line}`);
});

/** The files that sit flat in `src/` and are not one of the entries, each worded with what to do instead. */
const flatBreaches = (files: readonly string[]): string[] =>
  files
    .filter((f) => !f.slice('src/'.length).includes('/') && !ENTRIES.includes(f))
    .map((f) => `${f} sits flat in src/: only the entries ${ENTRIES.join(', ')} do — put it in its feature's folder`);

test('REFUSED: a source file flat in src/ that is not an entry', () => {
  assert.deepEqual(
    flatBreaches(['src/facade.ts', 'src/index.ts', 'src/vocabulary.ts', 'src/testing.ts', 'src/runner.ts', 'src/core/domain.ts', 'src/harness/claude/bg.ts']),
    [
      "src/facade.ts sits flat in src/: only the entries src/index.ts, src/vocabulary.ts, src/testing.ts do — put it in its feature's folder",
      "src/runner.ts sits flat in src/: only the entries src/index.ts, src/vocabulary.ts, src/testing.ts do — put it in its feature's folder",
    ],
  );
});

/** The stand-in's files: the testing entry, the engine's stand-in, and the face that hands the one to the other. */
const STAND_IN = { entry: 'src/testing.ts', made: 'src/service/test-engine.ts', face: 'src/service/index.ts', name: 'testEngine' };

/**
 * Where `file`, a file of `src` or `bin` that runs, takes the engine's stand-in: an import of the testing entry or of the stand-in's
 * file, or its name written in code. The stand-in's own three files are let through.
 */
function standInBreaches(file: string, text: string): string[] {
  if (Object.values(STAND_IN).includes(file) || isTest(file)) return [];
  const why = 'the stand-in is for tests alone — a file that runs asks the `Engine` service, and whoever runs it gives the real one';
  const targets = importsIn(text).map(({ spec }) => resolved(file, spec));
  const out = [STAND_IN.entry, STAND_IN.made].filter((target) => targets.includes(target)).map((target) => `${file} imports ${target}: ${why}`);
  if (new RegExp(`\\b${STAND_IN.name}\\b`).test(withoutComments(text))) out.push(`${file} names ${STAND_IN.name}: ${why}`);
  return out;
}

/** The package's files that run, under `src/` and `bin/`, by path from the package. */
const runFiles = (): string[] => [...sourceFiles(), ...fs.readdirSync(path.join(PKG, 'bin')).map((f) => `bin/${f}`)];

test("REFUSED: a file of src or bin that takes the engine's stand-in, by its entry, its file or its name", () => {
  const why = 'the stand-in is for tests alone — a file that runs asks the `Engine` service, and whoever runs it gives the real one';
  assert.deepEqual(standInBreaches('src/cli/main.ts', "import { testEngine } from '../testing.ts';"), [
    `src/cli/main.ts imports src/testing.ts: ${why}`,
    `src/cli/main.ts names testEngine: ${why}`,
  ]);
  assert.deepEqual(standInBreaches('bin/ae.ts', "const t = await import('../src/service/test-engine.ts');"), [
    `bin/ae.ts imports src/service/test-engine.ts: ${why}`,
  ]);
  assert.deepEqual(standInBreaches('src/index.ts', "export { Engine, testEngine } from './service/index.ts';"), [
    `src/index.ts names testEngine: ${why}`,
  ]);
  for (const own of Object.values(STAND_IN).slice(0, 3)) assert.deepEqual(standInBreaches(own, "export { testEngine } from './x.ts';"), []);
  assert.deepEqual(standInBreaches('src/service/x.test.ts', "import { testEngine } from './test-engine.ts';"), [], 'a test beside the code');
  assert.deepEqual(standInBreaches('src/service/engine.ts', ' * A test takes `testEngine` of `agent-runtime/testing`.'), [], 'prose');
});

test("no file of src or bin takes the engine's stand-in but its own three", () => {
  const files = runFiles();
  assert.ok(files.includes('bin/ae.ts') && files.includes('src/index.ts') && files.includes(STAND_IN.made), 'the scan reads src and bin');
  assert.deepEqual(
    files.flatMap((f) => standInBreaches(f, read(f))),
    [],
  );
});

test('only the entries sit flat in src/', () => {
  const files = sourceFiles();
  assert.ok(files.includes('src/index.ts') && files.includes('src/core/domain.ts'), 'the scan reads the source and its folders');
  assert.deepEqual(flatBreaches(files), []);
});

test('each file imports only what its folder may', () => {
  const files = sourceFiles();
  assert.ok(files.includes('src/index.ts') && files.length > 20, 'the scan reads the source');
  assert.deepEqual(
    files.flatMap((f) => pathBreaches(f, importsIn(read(f)))),
    [],
  );
});

test('REFUSED: a cycle of value imports; a cycle through a type-only import is erased and let through', () => {
  const planted = new Map([
    ['src/core/domain.ts', "import { transition } from './lifecycle.ts';"],
    ['src/core/lifecycle.ts', "import { endOf } from './index.ts';"],
    ['src/core/index.ts', "export { endOf } from './domain.ts';"],
    ['src/core/session.ts', "import type { Event } from './domain.ts';"],
    ['src/core/engine/engine.ts', "import { fold, type Event } from '../domain.ts';\nimport { filingOf } from './filing.ts';"],
    ['src/core/engine/filing.ts', "import type { Step } from './engine.ts';\nimport { type Filing } from './engine.ts';"],
    ['src/harness/seam.ts', "import {\n  type Sighting,\n  type Usage,\n} from '../core/domain.ts';"],
  ]);
  assert.deepEqual(cycles(valueGraph(planted)), [['src/core/domain.ts', 'src/core/index.ts', 'src/core/lifecycle.ts']]);
  planted.set('src/core/engine/filing.ts', "import { stepOn } from './engine.ts';");
  assert.deepEqual(cycles(valueGraph(planted)), [
    ['src/core/domain.ts', 'src/core/index.ts', 'src/core/lifecycle.ts'],
    ['src/core/engine/engine.ts', 'src/core/engine/filing.ts'],
  ]);
});

test('no two source files need each other’s values', () => {
  const files = new Map(sourceFiles().map((f) => [f, read(f)]));
  assert.deepEqual(cycles(valueGraph(files)), []);
});

test('REFUSED: a source file that imports a test; a barrel that re-exports a whole module', () => {
  assert.deepEqual(testImports('src/core/domain.ts', importsIn("import { corpus } from './decide.test.ts';")), [
    'src/core/domain.ts imports src/core/decide.test.ts: nothing but node --test loads a test — move what both need into the source',
  ]);
  assert.deepEqual(starExports('src/core/index.ts', "export { fold } from './domain.ts';\nexport * from './lifecycle.ts';"), [
    'src/core/index.ts re-exports all of ./lifecycle.ts: re-export by name',
  ]);
  assert.deepEqual(starExports('src/core/index.ts', '// export * from "./lifecycle.ts";'), [], 'not refused: prose');
});

test('no source file imports a test, and every barrel re-exports by name', () => {
  assert.deepEqual(
    sourceFiles().flatMap((f) => [...testImports(f, importsIn(read(f))), ...starExports(f, read(f))]),
    [],
  );
});

test("the detached worker's path, built from its caller's place, names a file that is there", () => {
  assert.ok(fs.existsSync(WORKER), `${WORKER} is not there: the path is built from the runner's own folder, so a move changes its \`..\``);
  assert.equal(path.relative(PKG, WORKER), path.join('bin', 'ae-worker.ts'));
});

/**
 * Between packages, only the public contract (`docs/architecture.md`, rule 1).
 *
 * Code outside packages/agent-runtime reaches it through `agent-runtime`, its vocabulary through `agent-runtime/vocabulary`, and,
 * from a test alone, the engine's stand-in through `agent-runtime/testing` (`testingBreaches`). That rules out its src/ by any route:
 * a subpath not in its `exports`, a relative path, `import.meta.resolve`, or a path built with path.join. `decide` is exported by no
 * entry. Spawning its `bin/` is its CLI, not an import, and prose that names a file in src/ — a doc comment, a brief in a test — is
 * not a route to it.
 *
 * The scan reads every file git lists outside this package, tracked or not yet added, so a new folder is scanned the day it is made. Turbo
 * caches this package's pass by this package's files alone: after a change elsewhere, `npx turbo run test --force`, or turbo replays a pass
 * that read none of it. The scanner is a copy of the one in packages/agent-orchestrator/test/contract.test.ts, not an import of it: a
 * package's test reaches into no other package's files, which is the rule it keeps.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');
const PKG = path.join(import.meta.dirname, '..');

/** The package this test guards: its name, its folder from the root, and the specifiers another package may import it by. */
const GUARDED = {
  name: 'agent-runtime',
  dir: 'packages/agent-runtime',
  entries: ['agent-runtime', 'agent-runtime/vocabulary', 'agent-runtime/testing'],
} as const;

const SOURCE = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/;

/** A line of prose — a `//` line, or a line of a block comment — read as nothing, with the line kept so numbers still count. */
const withoutComments = (text: string): string =>
  text
    .split('\n')
    .map((line) => (/^\s*(\/\/|\/\*|\*)/.test(line) ? '' : line))
    .join('\n');

/** Every module a piece of source names: imports and re-exports, type-only included, `import()`, `require()` and the two resolvers. */
function specifiersIn(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/^\s*(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/gm)) found.add(m[1]);
  for (const m of text.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) found.add(m[1]);
  for (const m of text.matchAll(/\b(?:import|require|import\.meta\.resolve|require\.resolve)\s*\(\s*['"`]([^'"`]+)['"`]/g)) found.add(m[1]);
  return [...found].sort();
}

type Guarded = { name: string; dir: string; entries: readonly string[] };

/** What in `file` reaches `guarded` other than by its entries: each breach, worded with what to do instead. */
function breaches(file: string, text: string, guarded: Guarded): string[] {
  const code = withoutComments(text);
  const out: string[] = [];
  const instead = `reach it through ${guarded.entries.join(' or ')}`;
  for (const spec of specifiersIn(code)) {
    if ((spec === guarded.name || spec.startsWith(`${guarded.name}/`)) && !guarded.entries.includes(spec)) {
      out.push(`${file} imports ${spec}, which is not an entry of ${guarded.name}: ${instead}`);
    }
    if (spec.startsWith('.') && `${path.posix.normalize(path.posix.join(path.posix.dirname(file), spec))}/`.startsWith(`${guarded.dir}/`)) {
      out.push(`${file} imports ${spec}, a path into ${guarded.dir}: ${instead}`);
    }
  }
  const resolver = new RegExp(`\\b(?:import\\.meta|require)\\.resolve\\s*\\(\\s*['"\`]${guarded.name}\\b`);
  const src = new RegExp(`${guarded.name}(?:['"\`]\\s*,\\s*['"\`]|/)src\\b`);
  code.split('\n').forEach((line, i) => {
    if (resolver.test(line)) out.push(`${file}:${i + 1} resolves ${guarded.name} to build a path beside its entry: ${instead}`);
    else if (/\b(?:join|resolve|URL)\s*\(|\b(?:import|require)\s*\(\s*[^'"\s]/.test(line) && src.test(line))
      out.push(`${file}:${i + 1} builds a path into ${guarded.dir}/src: ${instead}`);
  });
  return out;
}

/** Every source file git lists outside the guarded package, tracked or not yet added, that is on disk. */
function workspaceFiles(guarded: Guarded): string[] {
  const listed = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return listed.split('\n').filter((f) => SOURCE.test(f) && !f.startsWith(`${guarded.dir}/`) && fs.existsSync(path.join(ROOT, f)));
}

test('the scan reads the packages and apps above this one — or it would pass by reading nothing', () => {
  const files = workspaceFiles(GUARDED);
  for (const dir of [
    'packages/agent-orchestrator/src',
    'packages/agent-orchestrator/test',
    'apps/api/src',
    'apps/api/test',
    'apps/web/src',
    'apps/web/test/e2e',
  ]) {
    assert.ok(
      files.some((f) => f.startsWith(`${dir}/`)),
      `the scan reads ${dir}`,
    );
  }
  assert.ok(
    files.some((f) => specifiersIn(fs.readFileSync(path.join(ROOT, f), 'utf8')).includes('agent-runtime')),
    'and some of it imports agent-runtime',
  );
});

test('code outside packages/agent-runtime reaches it through agent-runtime, agent-runtime/vocabulary and agent-runtime/testing alone', () => {
  const found = workspaceFiles(GUARDED).flatMap((f) => breaches(f, fs.readFileSync(path.join(ROOT, f), 'utf8'), GUARDED));
  assert.deepEqual(found, []);
});

test('REFUSED: a subpath not in its exports, the retired ./effect among them, a relative path, import.meta.resolve, and a path built into src — each route', () => {
  const at = 'packages/agent-orchestrator/test/x.test.ts';
  const refused = (text: string) => breaches(at, text, GUARDED);
  const instead = 'reach it through agent-runtime or agent-runtime/vocabulary or agent-runtime/testing';
  assert.deepEqual(refused("import { decide } from 'agent-runtime/src/domain.ts';"), [
    `${at} imports agent-runtime/src/domain.ts, which is not an entry of agent-runtime: ${instead}`,
  ]);
  assert.deepEqual(refused("import { Engine } from 'agent-runtime/effect';"), [
    `${at} imports agent-runtime/effect, which is not an entry of agent-runtime: ${instead}`,
  ]);
  assert.deepEqual(refused("import type { TaskView } from 'agent-runtime/engine';"), [
    `${at} imports agent-runtime/engine, which is not an entry of agent-runtime: ${instead}`,
  ]);
  assert.deepEqual(refused("import { fenceReach } from 'agent-runtime/vocabulary/x';"), [
    `${at} imports agent-runtime/vocabulary/x, which is not an entry of agent-runtime: ${instead}`,
  ]);
  assert.deepEqual(refused("import { testEngine } from 'agent-runtime/testing/x';"), [
    `${at} imports agent-runtime/testing/x, which is not an entry of agent-runtime: ${instead}`,
  ]);
  assert.deepEqual(refused("import pkg from 'agent-runtime/package.json' with { type: 'json' };"), [
    `${at} imports agent-runtime/package.json, which is not an entry of agent-runtime: ${instead}`,
  ]);
  assert.deepEqual(refused("import { codex } from '../../agent-runtime/src/runner-codex.ts';"), [
    `${at} imports ../../agent-runtime/src/runner-codex.ts, a path into packages/agent-runtime: ${instead}`,
  ]);
  assert.deepEqual(
    breaches('apps/api/test/x.test.ts', "const { fold } = await import('../../../packages/agent-runtime/src/domain.ts');", GUARDED),
    [`apps/api/test/x.test.ts imports ../../../packages/agent-runtime/src/domain.ts, a path into packages/agent-runtime: ${instead}`],
  );
  assert.deepEqual(
    refused("const v = await import(new URL('./runner-claude-vocabulary.ts', import.meta.resolve('agent-runtime')).href);"),
    [`${at}:1 resolves agent-runtime to build a path beside its entry: ${instead}`],
  );
  assert.deepEqual(refused("const d = await import(path.join(ROOT, 'packages', 'agent-runtime', 'src', 'domain.ts'));"), [
    `${at}:1 builds a path into packages/agent-runtime/src: ${instead}`,
  ]);
  assert.deepEqual(refused('const d = require(`${ROOT}/packages/agent-runtime/src/domain.ts`);'), [
    `${at}:1 builds a path into packages/agent-runtime/src: ${instead}`,
  ]);
});

test('and what is not a route is not refused: the entries, the CLI spawned, and prose that names a file in src', () => {
  const text = [
    "import { codex } from 'agent-runtime';",
    "import type { Event } from 'agent-runtime';",
    "const { fold } = await import('agent-runtime');",
    "import { fenceReach } from 'agent-runtime/vocabulary';",
    "import { testEngine } from 'agent-runtime/testing';",
    "execFileSync(process.execPath, [path.join(ROOT, 'packages', 'agent-runtime', 'bin', 'ae.ts'), 'ls']);",
    ' * Mirrors `TranscriptEvent` in packages/agent-runtime/src/runner.ts, as the api passes it on.',
    "// import { decide } from '../../agent-runtime/src/domain.ts';",
    "assert.equal(partsNamed('Read packages/agent-runtime/src/domain.ts.'), 1);",
    "import { run } from '../src/run.ts';",
  ].join('\n');
  assert.deepEqual(breaches('packages/agent-orchestrator/test/x.test.ts', text, GUARDED), []);
});

/** The entry a test alone imports, and the folders whose files are tests' own. */
const TESTING = 'agent-runtime/testing';

/** Whether `file` is a test or a helper of tests: a `.test.` file anywhere, or any file under a `test/` folder. */
const isTestFile = (file: string): boolean => /\.test\.[cm]?[jt]sx?$/.test(file) || file.split('/').includes('test');

/** Where `file`, which is no test's, imports the testing entry: a file that runs is never given a stand-in. */
function testingBreaches(file: string, text: string): string[] {
  if (isTestFile(file) || !specifiersIn(withoutComments(text)).includes(TESTING)) return [];
  return [
    `${file} imports ${TESTING}, which is for tests alone: a file that runs asks the engine it is given, and only a test file ` +
      '(*.test.ts, or under a test/ folder) takes the stand-in',
  ];
}

test('REFUSED: a file of a src or a bin, in any package, that imports the testing entry; a test file may', () => {
  const line = "import { testEngine } from 'agent-runtime/testing';";
  for (const file of [
    'packages/agent-orchestrator/src/runtime-client.ts',
    'packages/agent-orchestrator/src/tick/tick.verb.ts',
    'packages/agent-orchestrator/bin/nemia.ts',
    'apps/api/src/store.ts',
    'apps/web/src/x.ts',
    'tools/observe/render/render.ts',
  ])
    assert.deepEqual(testingBreaches(file, line), [
      `${file} imports agent-runtime/testing, which is for tests alone: a file that runs asks the engine it is given, and only a ` +
        'test file (*.test.ts, or under a test/ folder) takes the stand-in',
    ]);
  assert.equal(testingBreaches('apps/api/src/store.ts', "const t = await import('agent-runtime/testing');").length, 1, 'a dynamic import');
  for (const file of [
    'packages/agent-orchestrator/src/nemia/keep.verb.test.ts',
    'packages/agent-orchestrator/test/x.test.ts',
    'packages/agent-orchestrator/test/placed.ts',
    'apps/api/test/x.test.ts',
  ])
    assert.deepEqual(testingBreaches(file, line), [], `not refused: ${file}`);
  assert.deepEqual(testingBreaches('apps/api/src/store.ts', "import { Engine } from 'agent-runtime';"), [], 'the root entry');
  assert.deepEqual(testingBreaches('apps/api/src/store.ts', ` * ${line}`), [], 'prose');
});

test('no file outside packages/agent-runtime that is no test imports the testing entry, and some test does', () => {
  const files = workspaceFiles(GUARDED).map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')] as const);
  assert.ok(
    files.some(([f, text]) => isTestFile(f) && specifiersIn(text).includes(TESTING)),
    'a test outside the package takes the stand-in, so the scan reads the specifier',
  );
  assert.deepEqual(
    files.flatMap(([f, text]) => testingBreaches(f, text)),
    [],
  );
});

test("agent-runtime's exports are . (index.ts), ./vocabulary (vocabulary.ts) and ./testing (testing.ts), and nothing else but its package.json: the map is pinned, and an entry added is a contract widened, a change to this test and to docs/architecture.md", () => {
  const { exports } = JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf8')) as { exports: Record<string, string> };
  assert.deepEqual(exports, {
    '.': './src/index.ts',
    './vocabulary': './src/vocabulary.ts',
    './testing': './src/testing.ts',
    './package.json': './package.json',
  });
});

/**
 * `decide` is the runtime's judgement, pure and not for a consumer to call (src/index.ts says why); `fold` is exported beside it on
 * purpose.
 */
function exportBreaches(entries: Record<string, readonly string[]>): string[] {
  const out = Object.entries(entries)
    .filter(([, names]) => names.includes('decide'))
    .map(([entry]) => `${entry} exports decide, the runtime's judgement: export what it decided (fold, the events), never the function`);
  out.push(
    ...Object.entries(entries)
      .filter(([entry, names]) => entry !== TESTING && names.includes('testEngine'))
      .map(([entry]) => `${entry} exports testEngine, the engine's stand-in: only ${TESTING} gives it, to tests`),
  );
  if (!entries[TESTING]?.includes('testEngine')) out.push(`${TESTING} does not export testEngine: the stand-in has no entry`);
  if (!Object.values(entries).some((names) => names.includes('fold')))
    out.push('no entry exports fold: the check for decide would pass on entries that export nothing');
  return out;
}

test('decide is exported by no entry, and the stand-in by the testing entry alone', async () => {
  const entries = {
    'agent-runtime': Object.keys(await import('agent-runtime')),
    'agent-runtime/vocabulary': Object.keys(await import('agent-runtime/vocabulary')),
    'agent-runtime/testing': Object.keys(await import('agent-runtime/testing')),
  };
  assert.deepEqual(
    exportBreaches({ ...entries, 'agent-runtime/testing': [...entries['agent-runtime/testing'], 'decide'] }),
    ["agent-runtime/testing exports decide, the runtime's judgement: export what it decided (fold, the events), never the function"],
    'REFUSED: decide exported by the testing entry',
  );
  assert.deepEqual(
    exportBreaches({ ...entries, 'agent-runtime': [...entries['agent-runtime'], 'testEngine'] }),
    ["agent-runtime exports testEngine, the engine's stand-in: only agent-runtime/testing gives it, to tests"],
    'REFUSED: the stand-in exported by the root entry',
  );
  assert.deepEqual(exportBreaches(entries), []);
  assert.deepEqual(
    exportBreaches({ ...entries, 'agent-runtime': [...entries['agent-runtime'], 'decide'] }),
    ["agent-runtime exports decide, the runtime's judgement: export what it decided (fold, the events), never the function"],
    'REFUSED: decide exported',
  );
  assert.deepEqual(
    exportBreaches({ 'agent-runtime': [], 'agent-runtime/vocabulary': [], 'agent-runtime/testing': [] }),
    [
      'agent-runtime/testing does not export testEngine: the stand-in has no entry',
      'no entry exports fold: the check for decide would pass on entries that export nothing',
    ],
    'REFUSED: entries read as empty',
  );
});

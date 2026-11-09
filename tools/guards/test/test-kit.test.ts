/**
 * The test kit's boundary (`tools/test-kit`): the mechanics every workspace's tests share live there once, and only tests take them.
 *
 * - **Only a test imports the kit.** A file of a workspace's `src`, `bin`, `place` or `contracts` that is no test names no
 *   `test-kit` entry: what ships never carries test code.
 * - **A test imports no other workspace's tests.** A helper two workspaces' tests need goes in the kit; a relative path into another
 *   workspace's `test/` is a copy waiting to drift.
 * - **The kit imports only Node's built-ins and TypeScript's compiler API**, so it reaches no layer and every layer may use it.
 * - **The kit is a `devDependencies` entry**, never a `dependencies` one: no shipped package installs it.
 * - **Every temporary root a test makes comes from `scratch`** (`test-kit/scratch`), which takes it away with whatever runs in it: a
 *   call of `os.tmpdir` in any workspace's tests outside the kit is refused, and so is a root made with `mkdtempSync` in
 *   `machineTempDir()`, the directory a test that asserts where a process runs names. A root made inside a scratch root is let
 *   through. `ROOTS_BY_HAND` names the three files that make one by hand, each saying why.
 *
 * Each rule is a function over text, proven on a planted line first, then swept over the workspaces the root `package.json` names.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO, workspaces } from 'test-kit/repo';
import { resolved, specifiersIn, withoutComments } from 'test-kit/imports';

/** The kit's own folder, by path from the root. */
const KIT = 'tools/test-kit';

/** The folders below a workspace that ship: what runs, what a harness is given, and the contracts. */
const SHIPPED = ['src', 'bin', 'place', 'contracts'];

/** A test file: beside the code, or anything under a workspace's `test/`. */
const isTest = (file: string, workspace: string): boolean => /\.test\.tsx?$/.test(file) || file.startsWith(`${workspace}/test/`);

const CODE = /\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/;

/** Every file under `dir` of the root whose name `wanted` accepts, by path from the root; a `node_modules` is never entered. */
const under = (dir: string, wanted: (file: string) => boolean): string[] => {
  const at = path.join(REPO, dir);
  if (!fs.existsSync(at)) return [];
  return fs
    .readdirSync(at, { recursive: true, encoding: 'utf8' })
    .map((f) => `${dir}/${f.split(path.sep).join('/')}`)
    .filter((f) => !f.split('/').includes('node_modules') && wanted(f) && fs.statSync(path.join(REPO, f)).isFile());
};

/** Whether a module names the kit. */
const isKit = (spec: string): boolean => spec === 'test-kit' || spec.startsWith('test-kit/');

/** Where `file`, a shipped file of `workspace` that is no test, imports the kit. */
const shippedKitImports = (file: string, workspace: string, text: string): string[] =>
  isTest(file, workspace)
    ? []
    : specifiersIn(withoutComments(text))
        .filter(isKit)
        .map((spec) => `${file} imports ${spec}: only a test takes the test kit — what ships carries no test code`);

/** Where `file`, a test of `workspace`, imports a file of another workspace's `test/`, each by its path from the root. */
const crossTestImports = (file: string, workspace: string, text: string, all: readonly string[]): string[] =>
  specifiersIn(withoutComments(text)).flatMap((spec) => {
    const target = resolved(file, spec);
    const other = target === undefined ? undefined : all.find((ws) => ws !== workspace && target.startsWith(`${ws}/test/`));
    return other === undefined
      ? []
      : [`${file} imports ${target}, a test file of ${other}: put what both need in tools/test-kit, and import it by its entry`];
  });

/** Where a file of the kit imports anything but a node built-in, TypeScript, its own files or its own entries. */
const kitReaches = (file: string, text: string): string[] =>
  specifiersIn(withoutComments(text))
    .filter((spec) => !spec.startsWith('node:') && spec !== 'typescript' && !spec.startsWith('.') && !isKit(spec))
    .map((spec) => `${file} imports ${spec}: the test kit imports only node: built-ins and typescript, so every layer may use it`);

/** Where a workspace's `package.json` lists the kit under its `dependencies`, which ship. */
const kitDependencies = (manifest: string, text: string): string[] => {
  const { dependencies = {} } = JSON.parse(text) as { dependencies?: Record<string, string> };
  return 'test-kit' in dependencies
    ? [`${manifest} lists test-kit under dependencies: move it to devDependencies, which a package's installs leave out`]
    : [];
};

/** Each line of `text` that calls the temp directory by name, or makes a root with `mkdtempSync` in `machineTempDir()`. */
const tmpdirCalls = (text: string): string[] =>
  text
    .split('\n')
    .flatMap((line, i) => (/\btmpdir\s*\(|\bmkdtemp\w*\s*\(.*\bmachineTempDir\s*\(/.test(line) ? [`${i + 1}: ${line.trim()}`] : []));

/**
 * The files of a workspace's tests that make a root by hand: the fixture that shows the reaper a leak, run alone under a temp
 * directory of its own; and the e2e's runner and the served board's command, each a script and no test file, which `node:test`'s hooks
 * would make a test run of, and each removes its store and stops its servers on its own exit and signals.
 */
const ROOTS_BY_HAND = ['packages/agent-runtime/test/fixtures/leak-unguarded.ts', 'apps/web/test/e2e/run.ts', 'apps/web/test/e2e/serve.ts'];

/** The workspaces whose code and tests the sweeps read: every one the root names but the kit itself. */
const swept = (): string[] => workspaces().filter((ws) => ws !== KIT);

/** Each workspace's test files: under its `test/`, and beside its code. */
const testFilesOf = (workspace: string): string[] => [
  ...under(`${workspace}/test`, (f) => /\.tsx?$/.test(f)),
  ...SHIPPED.flatMap((dir) => under(`${workspace}/${dir}`, (f) => /\.test\.tsx?$/.test(f))),
];

const read = (file: string): string => fs.readFileSync(path.join(REPO, file), 'utf8');

/** The test kit's entry, spelled in parts so no sweep reads this file's plants as its own imports. */
const ENTRY = ['test', 'kit/scratch'].join('-');

test('REFUSED: a shipped file that imports the kit; a test beside the code that does is let through', () => {
  const line = `import { scratch } from '${ENTRY}';\n`;
  assert.equal(shippedKitImports('packages/agent-orchestrator/src/run.ts', 'packages/agent-orchestrator', line).length, 1);
  assert.equal(shippedKitImports('apps/cli/bin/nemia.ts', 'apps/cli', `const k = await import('${ENTRY}');`).length, 1);
  assert.equal(shippedKitImports('packages/agent-orchestrator/src/run.test.ts', 'packages/agent-orchestrator', line).length, 0);
  assert.equal(shippedKitImports('packages/agent-orchestrator/src/run.ts', 'packages/agent-orchestrator', `// ${line}`).length, 0, 'prose');
});

test('REFUSED: a test that imports a test file of another workspace; its own, and the kit, are let through', () => {
  const all = ['apps/api', 'apps/cli', 'tools/guards'];
  const scratchOfApi = ['..', '..', 'api', 'test', 'scratch.ts'].join('/');
  assert.deepEqual(
    crossTestImports('apps/cli/test/reads.test.ts', 'apps/cli', `import { scratch } from '${scratchOfApi}';`, all).map(
      (line) => line.split(',')[0],
    ),
    ['apps/cli/test/reads.test.ts imports apps/api/test/scratch.ts'],
  );
  assert.equal(crossTestImports('apps/cli/test/reads.test.ts', 'apps/cli', "import { served } from './served.ts';", all).length, 0);
  assert.equal(crossTestImports('apps/cli/test/reads.test.ts', 'apps/cli', `import { scratch } from '${ENTRY}';`, all).length, 0);
  assert.equal(crossTestImports('apps/cli/test/reads.test.ts', 'apps/cli', "import { app } from '../../api/src/app.ts';", all).length, 0);
});

test('REFUSED: a file of the kit that imports anything but node built-ins and typescript', () => {
  assert.equal(kitReaches(`${KIT}/layout.ts`, "import { Effect } from 'effect';").length, 1);
  assert.equal(kitReaches(`${KIT}/layout.ts`, "import x from 'agent-orchestrator';").length, 1);
  assert.equal(kitReaches(`${KIT}/layout.ts`, "import fs from 'node:fs';\nimport ts from 'typescript';").length, 0);
  assert.equal(kitReaches(`${KIT}/layout.ts`, "import { importsIn } from './imports.ts';").length, 0);
  assert.equal(kitReaches(`${KIT}/test/layout.test.ts`, `import { scratch } from '${ENTRY}';`).length, 0, 'its own entries');
});

test('REFUSED: the kit under a package.json’s dependencies; under devDependencies it is let through', () => {
  const kit = ['test', 'kit'].join('-');
  assert.equal(kitDependencies('apps/cli/package.json', JSON.stringify({ dependencies: { [kit]: '*' } })).length, 1);
  assert.equal(kitDependencies('apps/cli/package.json', JSON.stringify({ devDependencies: { [kit]: '*' } })).length, 0);
  assert.equal(kitDependencies('apps/cli/package.json', '{}').length, 0);
});

test('REFUSED: a line that makes a root under the temp directory by hand', () => {
  // oxlint-disable-next-line typescript/no-unnecessary-template-expression -- built in two, so this file does not name the call it refuses
  const call = `${'tmp'}dir`;
  assert.equal(tmpdirCalls(`const a = 1;\nconst dir = fs.mkdtempSync(path.join(os.${call}(), 'ae-x-'));\n`).length, 1);
  assert.match(tmpdirCalls(`const a = 1;\nconst dir = fs.mkdtempSync(path.join(os.${call}(), 'ae-x-'));\n`)[0] ?? '', /^2: /);
  assert.equal(tmpdirCalls(`import { ${call} } from 'node:os';\nconst d = ${call} ();`).length, 1);
  assert.equal(tmpdirCalls(`assert.equal(ran.cwd, os.${call}()); // not a root: where the ask runs`).length, 1, 'whatever a comment says');
  assert.deepEqual(tmpdirCalls("const dir = scratch('ae-x-');\nconst repo = fs.mkdtempSync(path.join(dir, 'repo-'));"), []);
  assert.deepEqual(tmpdirCalls('assert.equal(ran.cwd, machineTempDir());'), [], 'the named directory is let through');
  const named = 'machineTempDir';
  assert.equal(tmpdirCalls(`const dir = fs.mkdtempSync(path.join(${named}(), 'ae-x-'));`).length, 1, 'but never made a root in');
});

test('the sweeps read every workspace but the kit, its tests and its shipped files', () => {
  const all = swept();
  assert.ok(all.includes('apps/cli') && all.includes('packages/objects') && all.includes('tools/guards') && !all.includes(KIT));
  assert.ok(workspaces().includes(KIT), 'the kit is a workspace of the root');
  assert.ok(testFilesOf('apps/cli').includes('apps/cli/test/watch.test.ts'), "the cli's tests are read");
  assert.ok(
    testFilesOf('packages/agent-orchestrator').some((f) => f.startsWith('packages/agent-orchestrator/src/')),
    'the tests beside the code are read',
  );
});

test('no shipped file imports the kit, and no test imports another workspace’s tests', () => {
  const all = swept();
  const shipped = all.flatMap((ws) =>
    SHIPPED.flatMap((dir) => under(`${ws}/${dir}`, (f) => CODE.test(f))).flatMap((f) => shippedKitImports(f, ws, read(f))),
  );
  assert.deepEqual(shipped, []);
  const crossed = all.flatMap((ws) => testFilesOf(ws).flatMap((f) => crossTestImports(f, ws, read(f), all)));
  assert.deepEqual(crossed, []);
});

test('the kit imports only node built-ins and typescript', () => {
  const files = under(KIT, (f) => CODE.test(f));
  assert.ok(files.includes(`${KIT}/scratch.ts`) && files.includes(`${KIT}/test/layout.test.ts`), 'the scan reads the kit');
  assert.deepEqual(
    files.flatMap((f) => kitReaches(f, read(f))),
    [],
  );
});

test('no workspace lists the kit under its dependencies', () => {
  assert.deepEqual(
    ['.', ...workspaces()].flatMap((ws) => kitDependencies(`${ws}/package.json`, read(`${ws}/package.json`))),
    [],
  );
});

test('no test makes a root but through scratch, but the files that say why', () => {
  const files = swept().flatMap(testFilesOf);
  assert.ok(files.length > 100, `read ${files.length} test files, far fewer than the workspaces have`);
  for (const file of ROOTS_BY_HAND) assert.ok(files.includes(file), `${file} is read, and let through by name`);
  const byHand = files.filter((f) => !ROOTS_BY_HAND.includes(f)).flatMap((f) => tmpdirCalls(read(f)).map((line) => `${f}:${line}`));
  assert.deepEqual(byHand, [], 'make each root with scratch(prefix) of test-kit/scratch');
});

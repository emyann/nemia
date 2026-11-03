/**
 * Every temporary root a test makes comes from `scratch`, which takes it away with whatever runs in it (`scratch.ts`):
 * a call of `os.tmpdir` anywhere else under `test/`, or in a test beside the code in `src/`, is refused, and the copy of the helper
 * in each workspace the root package.json names, `tools/guards` among them, is the runtime's; and the guards' copies of `repo-files.ts`
 * and `workspaces.ts` are the orchestrator's. A test of where the code under test runs a process names the temp directory with
 * `machineTempDir()`, which the scan refuses only on a line that makes a root with `mkdtempSync`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO, workspaces } from './workspaces.ts';
import { scratch } from './scratch.ts';

const TEST = import.meta.dirname;
/** The one copy the others are held to. */
const RUNTIME = path.join(TEST, '..', '..', '..', 'packages', 'agent-runtime', 'test', 'scratch.ts');
/** The tests beside the code are held as the ones under `test/` are. */
const SRC = path.join(TEST, '..', 'src');
/** The one file that may make a root by hand: the helper. */
const ALLOWED = ['test/scratch.ts'];

/** Each line of `text` that calls the temp directory by name, or makes a root with `mkdtempSync` in `machineTempDir()`. */
const tmpdirCalls = (text: string) =>
  text
    .split('\n')
    .flatMap((line, i) => (/\btmpdir\s*\(|\bmkdtemp\w*\s*\(.*\bmachineTempDir\s*\(/.test(line) ? [`${i + 1}: ${line.trim()}`] : []));

test('REFUSED: a line that makes a root under the temp directory by hand is found', () => {
  // oxlint-disable-next-line typescript/no-unnecessary-template-expression -- built in two, so this file does not name the call it refuses
  const call = `${'tmp'}dir`;
  assert.deepEqual(tmpdirCalls(`const a = 1;\nconst dir = fs.mkdtempSync(path.join(os.${call}(), 'ae-x-'));\n`), [
    `2: const dir = fs.mkdtempSync(path.join(os.${call}(), 'ae-x-'));`,
  ]);
  assert.equal(tmpdirCalls(`import { ${call} } from 'node:os';\nconst d = ${call} ();`).length, 1);
  assert.deepEqual(tmpdirCalls("const dir = scratch('ae-x-');\n// under the machine's temp directory"), []);
  assert.equal(tmpdirCalls(`assert.equal(ran.cwd, os.${call}());`).length, 1, 'refused where it makes no root');
  assert.equal(
    tmpdirCalls(`assert.equal(ran.cwd, os.${call}()); // not a root: where the ask runs`).length,
    1,
    'refused whatever a comment beside it says',
  );
  assert.deepEqual(tmpdirCalls('assert.equal(ran.cwd, machineTempDir());'), [], 'the named directory is let through');
  const named = 'machineTempDir';
  assert.equal(tmpdirCalls(`const dir = fs.mkdtempSync(path.join(${named}(), 'ae-x-'));`).length, 1, 'but never made a root in');
});

test('no test makes a root but through scratch, under test/ or beside the code in src/', () => {
  const files = [
    ...fs
      .readdirSync(TEST, { recursive: true, encoding: 'utf8' })
      .filter((f) => /\.(ts|tsx)$/.test(f) && !f.split(path.sep).includes('node_modules'))
      .map((f) => path.join('test', f)),
    ...fs
      .readdirSync(SRC, { recursive: true, encoding: 'utf8' })
      .filter((f) => /\.test\.tsx?$/.test(f))
      .map((f) => path.join('src', f)),
  ];
  assert.ok(files.length > 1, 'the scan reads the tests');
  const refused = files
    .filter((f) => !ALLOWED.includes(f.split(path.sep).join('/')))
    .flatMap((f) => tmpdirCalls(fs.readFileSync(path.join(TEST, '..', f), 'utf8')).map((l) => `${f}:${l}`));
  assert.deepEqual(refused, [], 'make the root with scratch(prefix) from ./scratch.ts');
});

test("the helper is the runtime's, byte for byte", () => {
  assert.equal(
    fs.readFileSync(path.join(TEST, 'scratch.ts'), 'utf8'),
    fs.readFileSync(RUNTIME, 'utf8'),
    'copy packages/agent-runtime/test/scratch.ts over this one: a change to it is made there and copied to every package',
  );
});

/** Each of `copies`, by path from `root`, whose bytes are not those of `original`: the copies to write over again. */
const apartFrom = (root: string, original: string, copies: readonly string[]): string[] => {
  const bytes = fs.readFileSync(path.join(root, original));
  return copies.filter((file) => !fs.readFileSync(path.join(root, file)).equals(bytes));
};

/** Each workspace's copy of the helper under `root` that is not the runtime's. */
const scratchApart = (root: string): string[] =>
  apartFrom(
    root,
    'packages/agent-runtime/test/scratch.ts',
    workspaces(root)
      .map((dir) => `${dir}/test/scratch.ts`)
      .filter((file) => fs.existsSync(path.join(root, file))),
  );

/** The guards' copies of the repository's files and workspaces under `root`, where one is not the orchestrator's. */
const repoFilesApart = (root: string): string[] =>
  ['repo-files.ts', 'workspaces.ts'].flatMap((name) =>
    apartFrom(root, `packages/agent-orchestrator/test/${name}`, [`tools/guards/test/${name}`]),
  );

/** The copies of the orchestrator's story checkpoints under `root`, in the api, the web and the runtime, where one is not the original. */
const CHECKPOINT_COPIES = ['apps/api/test/checkpoints.ts', 'apps/web/test/checkpoints.ts', 'packages/agent-runtime/test/checkpoints.ts'];
const checkpointsApart = (root: string): string[] => apartFrom(root, 'packages/agent-orchestrator/test/checkpoints.ts', CHECKPOINT_COPIES);

/** A root whose workspaces are the runtime and the guards, each file of `files` written under it. */
const rootOf = (files: Record<string, string>): string => {
  const root = scratch('wf-copies-');
  const all = { 'package.json': JSON.stringify({ workspaces: ['packages/*', 'tools/guards'] }), ...files };
  for (const [file, text] of Object.entries(all)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
  for (const dir of ['packages/agent-runtime', 'tools/guards']) fs.writeFileSync(path.join(root, dir, 'package.json'), '{}');
  return root;
};

test("REFUSED: a copy of the helper, or of the repository's files, one byte apart from the one it copies", () => {
  const root = rootOf({
    'packages/agent-runtime/test/scratch.ts': 'export const a = 1;\n',
    'tools/guards/test/scratch.ts': 'export const a = 2;\n',
    'packages/agent-orchestrator/test/repo-files.ts': 'export const b = 1;\n',
    'tools/guards/test/repo-files.ts': 'export const b = 1;\r\n',
    'packages/agent-orchestrator/test/workspaces.ts': 'export const c = 1;\n',
    'tools/guards/test/workspaces.ts': 'export const c = 1;\n',
    'packages/agent-orchestrator/test/checkpoints.ts': 'export const d = 1;\n',
    'apps/api/test/checkpoints.ts': 'export const d = 1;\n',
    'apps/web/test/checkpoints.ts': 'export const d = 1; \n',
    'packages/agent-runtime/test/checkpoints.ts': 'export const d = 1;\n',
  });
  assert.deepEqual(scratchApart(root), ['tools/guards/test/scratch.ts']);
  assert.deepEqual(repoFilesApart(root), ['tools/guards/test/repo-files.ts']);
  assert.deepEqual(checkpointsApart(root), ['apps/web/test/checkpoints.ts']);
  fs.writeFileSync(path.join(root, 'tools/guards/test/scratch.ts'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(root, 'tools/guards/test/repo-files.ts'), 'export const b = 1;\n');
  fs.writeFileSync(path.join(root, 'apps/web/test/checkpoints.ts'), 'export const d = 1;\n');
  assert.deepEqual([...scratchApart(root), ...repoFilesApart(root), ...checkpointsApart(root)], [], 'an equal copy is let through');
});

test("each workspace's copy of the helper is the runtime's, byte for byte", () => {
  assert.ok(fs.existsSync(path.join(REPO, 'tools/guards/test/scratch.ts')), "the guards' home holds a copy");
  assert.deepEqual(scratchApart(REPO), [], 'copy packages/agent-runtime/test/scratch.ts over each of these');
});

test("the guards' copies of the repository's files and workspaces are the orchestrator's, byte for byte", () => {
  assert.deepEqual(
    repoFilesApart(REPO),
    [],
    'copy packages/agent-orchestrator/test/<file> over tools/guards/test/<file>: a change is made there and copied',
  );
});

test("the api's, the web's and the runtime's copies of the story checkpoints are the orchestrator's, byte for byte", () => {
  assert.deepEqual(
    checkpointsApart(REPO),
    [],
    'copy packages/agent-orchestrator/test/checkpoints.ts over each of these: a change is made there and copied',
  );
});

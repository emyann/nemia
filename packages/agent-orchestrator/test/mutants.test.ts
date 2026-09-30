/**
 * The build workflow's mutant runner (`workflows/build/mutants.ts`), driven as implement's check drives it: `node mutants.ts <closeout>`
 * in a committed scratch repository, a bounded subprocess, its temp directory a scratch root. Each refusal has a fixture that breaks its
 * rule, and after every run the repository is as it was committed and the runner's copy is gone.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from './team.ts';
import { scratch } from './scratch.ts';

const RUNNER = path.join(REPO, 'workflows', 'build', 'mutants.ts');

const MATH = `export const max = (a: number, b: number): number => (a > b ? a : b);
export const min = (a: number, b: number): number => (a < b ? a : b);
`;

const MATH_TEST = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { max } from '../src/math.ts';

test('max picks the larger', () => {
  assert.equal(max(1, 2), 2);
  assert.equal(max(3, 2), 3);
});

test('a sum', () => assert.equal(1 + 1, 2));
`;

const NAMES_TEST = `import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { max, min } from '../src/math.ts';

test('min', () => assert.ok(typeof min === 'function'));

test('min is the smaller', () => assert.equal(min(1, 2), 1));

describe('nested', () => {
  test('max, inside a suite', () => assert.equal(max(1, 2), 2));
});
`;

const BLOCK = 'export const block = false;\n';

const BLOCK_TEST = `import { test } from 'node:test';
import fs from 'node:fs';
import { block } from '../src/flag.ts';

test('does not block', async () => {
  if (!block) return;
  if (process.env.MARKER) fs.writeFileSync(process.env.MARKER, 'mutated');
  await new Promise((resolve) => setTimeout(resolve, 60_000));
});
`;

const FAILING_TEST = `import { test } from 'node:test';
import assert from 'node:assert/strict';

test('always fails', () => assert.equal(1, 2));
`;

/** Run git in `dir`, as nobody in particular. */
const git = (dir: string, ...args: string[]): string =>
  execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

/** A scratch repository holding `files`, committed. */
function repoOf(files: Record<string, string>): string {
  const dir = scratch('wf-mutants-repo-');
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
  git(dir, 'init', '-q');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'fixture');
  return dir;
}

/** The one-package fixture: `max` covered by a test, `min` by none, a flag whose mutant blocks its test, and a test that fails. */
const mathRepo = (): string =>
  repoOf({
    'package.json': '{ "type": "module" }\n',
    'src/math.ts': MATH,
    'test/math.test.ts': MATH_TEST,
    'test/names.test.ts': NAMES_TEST,
    'src/flag.ts': BLOCK,
    'test/block.test.ts': BLOCK_TEST,
    'test/failing.test.ts': FAILING_TEST,
  });

/** A mutant with its test named whole, unless `name` narrows it. */
const mutant = (file: string, from: string, to: string, test: string, name: string | null = null) => ({ file, from, to, test, name });

const MAX = mutant('src/math.ts', 'a > b ? a : b', 'a < b ? a : b', 'test/math.test.ts');
const MIN = mutant('src/math.ts', 'a < b ? a : b', 'a > b ? a : b', 'test/math.test.ts');

/** A closeout as the check is handed it (`WF_CLOSEOUT`), written to a scratch file: its path. */
function closeoutFile(fields: Record<string, unknown>): string {
  const file = path.join(scratch('wf-mutants-closeout-'), 'closeout.json');
  fs.writeFileSync(file, JSON.stringify({ outcome: 'done', summary: 's', artifacts: [], ...fields }));
  return file;
}

/** The environment the runner is given: its temp directory a scratch root, and no test runner's context leaking into it. */
function envOf(tmp: string, more: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, TMPDIR: tmp, ...more };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

/** Every file of `dir` outside `.git`, by path, with its bytes. */
const snapshot = (dir: string): Record<string, string> =>
  Object.fromEntries(
    fs
      .readdirSync(dir, { recursive: true, encoding: 'utf8' })
      .filter((p) => !p.split(path.sep).includes('.git') && fs.statSync(path.join(dir, p)).isFile())
      .sort()
      .map((p) => [p, fs.readFileSync(path.join(dir, p), 'utf8')]),
  );

/**
 * Run the runner on `repo` with the closeout `args` names (none when absent), bounded; its exit and streams, after asserting the repository
 * is byte for byte as it was, clean to git, and the runner's copy removed.
 */
function run(repo: string, args: string[], more: Record<string, string> = {}): { code: number | null; out: string; err: string } {
  const before = snapshot(repo);
  const tmp = scratch('wf-mutants-tmp-');
  const ran = spawnSync(process.execPath, [RUNNER, ...args], { cwd: repo, env: envOf(tmp, more), encoding: 'utf8', timeout: 120_000 });
  assert.deepEqual(snapshot(repo), before, 'the runner never writes into the tree it judges');
  assert.equal(git(repo, 'status', '--porcelain'), '');
  assert.deepEqual(fs.readdirSync(tmp), [], 'and its copy is gone');
  return { code: ran.status, out: ran.stdout, err: ran.stderr };
}

/** Run the runner on `repo` over a closeout naming `mutants`, and `noMutants` when given. */
const runMutants = (repo: string, mutants: unknown[], noMutants: string | null = null, more: Record<string, string> = {}) =>
  run(repo, [closeoutFile({ mutants, noMutants })], more);

test('a mutant its test kills exits 0, and says it was killed', () => {
  const r = runMutants(mathRepo(), [MAX]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /killed #1 src\/math\.ts: "a > b \? a : b" → "a < b \? a : b", by test\/math\.test\.ts/);
  assert.match(r.out, /baseline test\/math\.test\.ts: passed, 2 passed/);
});

test('a mutant that survives refuses the step, naming its file, its text, what it became and its test', () => {
  const r = runMutants(mathRepo(), [MAX, MIN]);
  assert.equal(r.code, 1);
  assert.match(r.out, /SURVIVED #2/);
  assert.ok(
    r.err.includes('#2 src/math.ts: "a < b ? a : b" → "a > b ? a : b", by test/math.test.ts survived'),
    `stderr names the surviving mutant whole:\n${r.err}`,
  );
  assert.doesNotMatch(r.err, /#1 /, 'and not the one its test killed');
});

test('a mutant is run against the one test it names: a test in the file that does not cover it lets it survive', () => {
  const repo = mathRepo();
  assert.equal(runMutants(repo, [{ ...MAX, name: 'max picks the larger' }]).code, 0);
  const r = runMutants(repo, [{ ...MAX, name: 'a sum' }]);
  assert.equal(r.code, 1);
  assert.match(r.err, /by test\/math\.test\.ts › a sum survived/);
});

test('a name runs the one test called exactly that, never another whose name only contains it, nested in a suite or not', () => {
  const repo = mathRepo();
  const r = runMutants(repo, [{ ...MIN, test: 'test/names.test.ts', name: 'min' }]);
  assert.equal(r.code, 1, 'only `min is the smaller` covers min, and it is not the test named');
  assert.match(r.out, /baseline test\/names\.test\.ts › min: passed, 1 passed/);
  assert.match(r.err, /by test\/names\.test\.ts › min survived/);
  const nested = runMutants(repo, [{ ...MAX, test: 'test/names.test.ts', name: 'max, inside a suite' }]);
  assert.equal(nested.code, 0, nested.err);
  assert.match(nested.out, /baseline test\/names\.test\.ts › max, inside a suite: passed, 1 passed/);
});

test('a mutant whose text is not in its file exactly once does not apply, and refuses the step', () => {
  const repo = mathRepo();
  const absent = runMutants(repo, [mutant('src/math.ts', 'a >= b', 'a <= b', 'test/math.test.ts')]);
  assert.equal(absent.code, 1);
  assert.match(
    absent.err,
    /#1 src\/math\.ts: "a >= b" → "a <= b", by test\/math\.test\.ts does not apply: its from is in the file 0 times/,
  );
  const twice = runMutants(repo, [mutant('src/math.ts', '? a : b', '? b : a', 'test/math.test.ts')]);
  assert.equal(twice.code, 1);
  assert.match(twice.err, /does not apply: its from is in the file 2 times, and must be there exactly once/);
  const nofile = runMutants(repo, [mutant('src/gone.ts', 'x', 'y', 'test/math.test.ts')]);
  assert.equal(nofile.code, 1);
  assert.match(nofile.err, /src\/gone\.ts: "x" → "y", by test\/math\.test\.ts does not apply: no such file in the commit/);
});

test('a named test that fails, or runs nothing, without any mutant refuses the step before a mutant is tried', () => {
  const repo = mathRepo();
  const failing = runMutants(repo, [mutant('src/math.ts', 'a > b', 'a < b', 'test/failing.test.ts')]);
  assert.equal(failing.code, 1);
  assert.match(failing.err, /test\/failing\.test\.ts fails without a mutant \(failed\), so it proves nothing/);
  assert.doesNotMatch(failing.out, /killed|SURVIVED/);
  const nothing = runMutants(repo, [{ ...MAX, name: 'no such test' }]);
  assert.equal(nothing.code, 1);
  assert.match(nothing.err, /test\/math\.test\.ts › no such test runs no test: no test in the file matches its name/);
  const gone = runMutants(repo, [{ ...MAX, test: 'test/gone.test.ts' }]);
  assert.equal(gone.code, 1);
  assert.match(gone.err, /test\/gone\.test\.ts: no such test file in the commit/);
});

test('a path that is absolute, climbs out, or sits under node_modules refuses the step without running anything', () => {
  const repo = mathRepo();
  const cases: [Record<string, string>, RegExp][] = [
    [{ file: path.join(repo, 'src/math.ts') }, /mutant #1: its file ".*src\/math\.ts" is not a path inside the tree/],
    [{ file: '../math.ts' }, /its file "\.\.\/math\.ts" is not a path inside the tree/],
    [{ file: 'node_modules/x/index.js' }, /its file "node_modules\/x\/index\.js" is not a path inside the tree/],
    [{ test: 'test/../../t.test.ts' }, /its test "test\/\.\.\/\.\.\/t\.test\.ts" is not a path inside the tree/],
  ];
  for (const [change, said] of cases) {
    const r = runMutants(repo, [{ ...MAX, ...change }]);
    assert.equal(r.code, 1, JSON.stringify(change));
    assert.match(r.err, said);
    assert.equal(r.out, '', 'nothing ran');
  }
});

test('a mutant with a field missing, or one that mutates nothing, refuses the step', () => {
  const repo = mathRepo();
  const missing = runMutants(repo, [{ file: 'src/math.ts', from: '', to: 'x' }]);
  assert.equal(missing.code, 1);
  assert.match(missing.err, /mutant #1: from, test must be text, not empty/);
  const same = runMutants(repo, [mutant('src/math.ts', 'a > b', 'a > b', 'test/math.test.ts')]);
  assert.equal(same.code, 1);
  assert.match(same.err, /mutant #1: from and to are the same text, so nothing is mutated/);
});

test('no mutant is refused unless `noMutants` says why, and a closeout that did not arrive is refused', () => {
  const repo = mathRepo();
  for (const reason of [null, '', '   ']) {
    const r = runMutants(repo, [], reason);
    assert.equal(r.code, 1, JSON.stringify(reason));
    assert.match(r.err, /the closeout names no mutant and says not why/);
  }
  const why = runMutants(repo, [], ' a doc only ');
  assert.equal(why.code, 0, why.err);
  assert.match(why.out, /wf mutants: no mutant named: a doc only\n/);

  const unlisted = run(repo, [closeoutFile({})]);
  assert.equal(unlisted.code, 1);
  assert.match(unlisted.err, /the closeout names no `mutants` list/);
  const none = run(repo, []);
  assert.equal(none.code, 1);
  assert.match(none.err, /no closeout reached the check: WF_CLOSEOUT is empty/);
  const unread = run(repo, [path.join(repo, 'no-such.json')]);
  assert.equal(unread.code, 1);
  assert.match(unread.err, /no closeout reached the check: .*no-such\.json does not read as JSON/);
});

test('a test that outlasts the deadline on its mutant counts as failed: the mutant is killed', () => {
  const r = runMutants(mathRepo(), [mutant('src/flag.ts', 'false', 'true', 'test/block.test.ts')], null, { WF_MUTANT_SECONDS: '10' });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /killed #1 src\/flag\.ts: "false" → "true", by test\/block\.test\.ts \(timeout, /);
});

test('a runner killed while a mutant is in leaves the tree it judges untouched', async () => {
  const repo = mathRepo();
  const before = snapshot(repo);
  const tmp = scratch('wf-mutants-tmp-');
  const marker = path.join(scratch('wf-mutants-marker-'), 'mutated');
  const file = closeoutFile({ mutants: [mutant('src/flag.ts', 'false', 'true', 'test/block.test.ts')], noMutants: null });
  const child = spawn(process.execPath, [RUNNER, file], { cwd: repo, env: envOf(tmp, { MARKER: marker }), stdio: 'ignore' });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  for (let i = 0; i < 600 && !fs.existsSync(marker); i++) await new Promise((resolve) => setTimeout(resolve, 100));
  assert.ok(fs.existsSync(marker), 'the mutated test ran, with the mutant in');
  child.kill('SIGKILL');
  await exited;
  assert.deepEqual(snapshot(repo), before);
  assert.equal(git(repo, 'status', '--porcelain'), '');
});

test("a workspace package's mutant is killed by another package's test through its workspace link, which points into the copy", () => {
  const repo = repoOf({
    '.gitignore': 'node_modules\n',
    'package.json': '{ "type": "module", "private": true, "workspaces": ["packages/*"] }\n',
    'packages/a/package.json': '{ "name": "a", "type": "module", "exports": "./index.ts" }\n',
    'packages/a/index.ts': 'export const twice = (n: number): number => n * 2;\n',
    'packages/b/package.json': '{ "name": "b", "type": "module" }\n',
    'packages/b/test/b.test.ts':
      "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { twice } from 'a';\n\ntest('twice', () => assert.equal(twice(2), 4));\n",
  });
  fs.mkdirSync(path.join(repo, 'node_modules'));
  fs.symlinkSync(path.join('..', 'packages', 'a'), path.join(repo, 'node_modules', 'a'));
  const r = runMutants(repo, [mutant('packages/a/index.ts', 'n * 2', 'n * 3', 'packages/b/test/b.test.ts')]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /killed #1 packages\/a\/index\.ts/);
});

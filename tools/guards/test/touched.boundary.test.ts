/**
 * `tools/touched/touched.ts` planned over a scratch git repository of two workspaces, `packages/a` and `packages/b`, each with a
 * `vitest.config.ts`, a source and its test: the test files a change reaches are given by a fake of Vitest's listing (a source's test
 * is `test/<its name>.test.ts`, a test is its own, the config reaches every test), and the run goes to a stub `vitest` on the PATH
 * that records its folder and its arguments. No real suite runs.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { main, type Listed } from '../../touched/touched.ts';

const GIT_ENV = {
  PATH: process.env.PATH ?? '',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_AUTHOR_NAME: 'guards',
  GIT_AUTHOR_EMAIL: 'guards@example.invalid',
  GIT_COMMITTER_NAME: 'guards',
  GIT_COMMITTER_EMAIL: 'guards@example.invalid',
};

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...GIT_ENV, HOME: cwd } }).trim();

const write = (root: string, file: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), text);
};

/** One call of the stub `vitest`: the folder it ran in and its arguments. */
type Call = { cwd: string; argv: string[] };

/** A repository of two workspaces committed and tagged `base`, the stub `vitest` beside it, and the file its calls are logged to. */
const planted = () => {
  const root = scratch('guards-touched-');
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main');
  write(repo, 'package.json', JSON.stringify({ name: 'r', private: true, workspaces: ['packages/*'] }));
  write(repo, '.gitignore', 'node_modules\n');
  for (const ws of ['a', 'b']) {
    write(repo, `packages/${ws}/package.json`, JSON.stringify({ name: ws, scripts: { test: 'vitest run' } }));
    write(repo, `packages/${ws}/vitest.config.ts`, 'export default {};\n');
    for (const name of ['one', 'two']) {
      write(repo, `packages/${ws}/src/${name}.ts`, `export const ${name} = 1;\n`);
      write(repo, `packages/${ws}/test/${name}.test.ts`, `import '../src/${name}.ts';\n`);
    }
  }
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'base');
  git(repo, 'tag', 'base');
  const log = path.join(root, 'calls.jsonl');
  const bin = path.join(root, 'bin');
  write(
    bin,
    'vitest',
    `#!/usr/bin/env node\nrequire('node:fs').appendFileSync(${JSON.stringify(log)}, JSON.stringify({ cwd: process.cwd(), argv: process.argv.slice(2) }) + '\\n');\n`,
  );
  fs.chmodSync(path.join(bin, 'vitest'), 0o755);
  const listings: string[] = [];
  const list = async (dir: string, files: string[]) => {
    listings.push(dir);
    const total = ['one', 'two'].map((name) => path.join(dir, 'test', `${name}.test.ts`));
    if (files.some((file) => file.endsWith('vitest.config.ts'))) return { due: total, total } satisfies Listed;
    const due = files.map((file) => (file.includes('/test/') ? file : path.join(dir, 'test', `${path.basename(file, '.ts')}.test.ts`)));
    return { due: [...new Set(due)].filter((file) => total.includes(file)), total } satisfies Listed;
  };
  const touched = (...argv: string[]) =>
    main(['--base', 'base', ...argv], { repo, list, env: { PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}` } });
  const calls = () =>
    fs.existsSync(log)
      ? fs
          .readFileSync(log, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line) as Call)
      : [];
  return { repo, touched, calls, listings };
};

/** Every call asks Vitest `related --run` about named files: none is a bare `vitest run`, none names no file. */
const assertNoBareRun = (calls: Call[]) => {
  for (const { argv } of calls) {
    assert.deepEqual(argv.slice(0, 2), ['related', '--run'], `asked related, never a bare run: ${argv.join(' ')}`);
    assert.ok(
      argv.slice(2).some((arg) => !arg.startsWith('--')),
      `names at least one file: ${argv.join(' ')}`,
    );
  }
};

test('a change to one source file asks related for that file, in its workspace alone', async () => {
  const { repo, touched, calls, listings } = planted();
  write(repo, 'packages/a/src/one.ts', 'export const one = 2;\n');
  assert.equal(await touched(), 0);
  assert.deepEqual(listings, [path.join(repo, 'packages/a')], 'only the workspace the change touched is listed');
  const made = calls();
  assert.equal(made.length, 1, 'one run, for the one workspace');
  assert.equal(fs.realpathSync(made[0].cwd), fs.realpathSync(path.join(repo, 'packages/a')), 'run in the workspace, under its config');
  const files = made[0].argv.filter((arg) => !arg.startsWith('--') && arg !== 'related');
  assert.deepEqual(files, [path.join(repo, 'packages/a/src/one.ts')], 'related asked for the changed file alone');
  assertNoBareRun(made);
});

test('a committed change and a new file are both the change, each in its own workspace, one run per workspace', async () => {
  const { repo, touched, calls } = planted();
  write(repo, 'packages/a/src/two.ts', 'export const two = 2;\n');
  git(repo, 'commit', '-q', '-am', 'change a');
  write(repo, 'packages/b/test/three.test.ts', '');
  write(repo, 'packages/b/test/one.test.ts', "import '../src/one.ts';\n// changed\n");
  assert.equal(await touched(), 0);
  const made = calls();
  assert.deepEqual(
    made.map(({ cwd }) => path.basename(cwd)),
    ['a', 'b'],
    'one workspace at a time',
  );
  assertNoBareRun(made);
});

test('no change asks nothing', async () => {
  const { touched, calls, listings } = planted();
  assert.equal(await touched(), 0);
  assert.deepEqual(listings, [], 'nothing listed');
  assert.deepEqual(calls(), [], 'nothing run');
});

test('a named test file of a workspace the change did not touch is refused, and nothing runs', async () => {
  const { repo, touched, calls } = planted();
  write(repo, 'packages/a/src/one.ts', 'export const one = 2;\n');
  assert.equal(await touched(path.join(repo, 'packages/b/test/one.test.ts')), 2);
  assert.deepEqual(calls(), [], 'nothing run');
});

test('a named test file of a touched workspace runs alone', async () => {
  const { repo, touched, calls } = planted();
  write(repo, 'packages/a/src/one.ts', 'export const one = 2;\n');
  write(repo, 'packages/a/src/two.ts', 'export const two = 2;\n');
  const named = path.join(repo, 'packages/a/test/two.test.ts');
  assert.equal(await touched(named), 0);
  const made = calls();
  assert.equal(made.length, 1);
  assert.deepEqual(
    made[0].argv.filter((arg) => !arg.startsWith('--') && arg !== 'related'),
    [named],
  );
  assertNoBareRun(made);
});

test('a change that reaches every test file of its workspace is not run, and dry runs nothing', async () => {
  const { repo, touched, calls } = planted();
  write(repo, 'packages/a/vitest.config.ts', 'export default { test: {} };\n');
  assert.equal(await touched(), 0);
  assert.deepEqual(calls(), [], 'the whole suite of a is never run');
  write(repo, 'packages/b/src/one.ts', 'export const one = 2;\n');
  assert.equal(await touched('--dry'), 0);
  assert.deepEqual(calls(), [], 'dry lists and runs nothing');
});

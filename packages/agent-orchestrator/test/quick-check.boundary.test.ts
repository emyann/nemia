/**
 * The quick workflow's own check script (`workflows/quick/change.ts`), run as the check runs it: `node change.ts <verb>` in a committed
 * scratch repository whose base is `WF_BASE_REF`, a bounded subprocess, with `npx` and `npm` stubs first on the path that record what
 * they are handed. The bound is read from the shipped script's text (`FILES`, `LINES`), so each refusal is at the shipped numbers, and
 * the shipped check of `workflows/quick/implement.md` is run whole, as frozen, so the bound is proven wired and first.
 *
 * Its subject is git and a spawned script: a boundary file.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadWorkflows } from '../src/folder/folder.store.ts';
import { checkArgv } from '../src/check/check.ts';
import { REPO, placesOf } from './team.ts';
import { scratch } from './scratch.ts';

const QUICK = path.join(REPO, 'workflows', 'quick');

const SCRIPT = path.join(QUICK, 'change.ts');

/** The shipped script's text, and the number its constant `name` holds, the slice ending on `GENERATED`, which must be there. */
const TEXT = fs.readFileSync(SCRIPT, 'utf8');
const shippedNumber = (name: 'FILES' | 'LINES'): number => {
  const bounds = TEXT.slice(0, TEXT.indexOf('const GENERATED'));
  const found = new RegExp(`const\\s+${name}\\s*=\\s*(\\d+);`).exec(bounds);
  assert.ok(found, `change.ts declares ${name} before GENERATED`);
  return Number(found[1]);
};
const FILES = shippedNumber('FILES');
const LINES = shippedNumber('LINES');

/** Run git in `dir`, as nobody in particular. */
const git = (dir: string, ...args: string[]): string =>
  execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

/** Write `files` into `dir`, each at its path, and commit them all as `message`. */
const commit = (dir: string, files: Record<string, string>, message: string): void => {
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', message);
};

/** `n` lines, each unlike any other and unlike any line of another `tag`. */
const lines = (n: number, tag = 'line'): string => Array.from({ length: n }, (_, i) => `${tag} ${i}\n`).join('');

/** `n` files of one line each, under `dir`. */
const files = (n: number, dir = 'src'): Record<string, string> =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [`${dir}/f${i}.ts`, `export const f${i} = ${i};\n`]));

/** A scratch repository on `main` holding `base`, with the branch `work` checked out on it, and the base's commit. */
function based(base: Record<string, string> = {}): { repo: string; base: string } {
  const repo = scratch('wf-quick-repo-');
  git(repo, 'init', '-q', '-b', 'main');
  commit(repo, { 'README.md': 'base\n', ...base }, 'base');
  const at = git(repo, 'rev-parse', 'HEAD').trim();
  git(repo, 'checkout', '-q', '-b', 'work');
  return { repo, base: at };
}

/** A scratch repository whose `HEAD`, one commit past its base, adds `work`. */
function workOn(work: Record<string, string>, base: Record<string, string> = {}): { repo: string; base: string } {
  const made = based(base);
  commit(made.repo, work, 'work');
  return made;
}

/** What a stub exits with where it is not 0: `npx` whatever it is handed, `npm` handed the e2e, and `claude`. */
type Failing = { npx?: number; e2e?: number; claude?: number };

/**
 * A folder holding an `npx`, an `npm` and a `claude` that exit 0 but as `failing` says, the first two writing their arguments as a
 * line of `log` first.
 */
function stubs(failing: Failing = {}): { bin: string; said: () => string[] } {
  const bin = scratch('wf-quick-bin-');
  const log = path.join(bin, 'said.log');
  const exits = { npx: `exit ${failing.npx ?? 0}`, npm: `case "$*" in *e2e*) exit ${failing.e2e ?? 0};; esac; exit 0` };
  for (const [name, exit] of Object.entries(exits))
    fs.writeFileSync(path.join(bin, name), `#!/bin/sh\nprintf '%s\\n' "${name} $*" >> '${log}'\n${exit}\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'claude'), `#!/bin/sh\necho "[]"\nexit ${failing.claude ?? 0}\n`, { mode: 0o755 });
  return { bin, said: () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean) : []) };
}

type Ran = { code: number | null; out: string; err: string; said: string[] };

/** The environment a check has in `repo` on `base`: the stubs first on the path, the run's variables, and nothing of this process's. */
const envOf = (repo: string, base: string, bin: string, more: Record<string, string> = {}): Record<string, string> => ({
  PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`,
  HOME: repo,
  TMPDIR: scratch('wf-quick-tmp-'),
  WF_RUN: 'r-1',
  WF_BASE_REF: base,
  ...more,
});

/** Run the script's `verb` in `repo` on `base`, bounded; its exit, its streams, and what the stubs were handed. */
function change(repo: string, base: string, verb: string, ...args: string[]): Ran {
  return changeOver({}, repo, base, verb, ...args);
}

/** `change`, over stubs that exit as `failing` says. */
function changeOver(failing: Failing, repo: string, base: string, verb: string, ...args: string[]): Ran {
  const { bin, said } = stubs(failing);
  const ran = spawnSync(process.execPath, [SCRIPT, verb, ...args], {
    cwd: repo,
    env: envOf(repo, base, bin),
    encoding: 'utf8',
    timeout: 60_000,
  });
  return { code: ran.status, out: ran.stdout, err: ran.stderr, said: said() };
}

/** A closeout as the check is handed it (`WF_CLOSEOUT`), written to a scratch file: its path. */
function closeoutFile(more: Record<string, unknown>): string {
  const file = path.join(scratch('wf-quick-closeout-'), 'closeout.json');
  fs.writeFileSync(file, JSON.stringify({ outcome: 'done', summary: 's', artifacts: [], mutants: [], noMutants: 'a fixture', ...more }));
  return file;
}

/** The scripts a run's base holds, which the shipped check shows from it. */
const SCRIPTS = {
  'workflows/quick/change.ts': TEXT,
  ...Object.fromEntries(
    ['mutants.ts', 'pictures.ts', 'probe.ts'].map((name) => [
      `workflows/build/${name}`,
      fs.readFileSync(path.join(REPO, 'workflows', 'build', name), 'utf8'),
    ]),
  ),
};

/**
 * Run the shipped check of quick's implement in `repo` as a check runs, its argv `checkArgv`'s, over the stubs, which exit as
 * `failing` says; `files` is the step's files directory, one of its own where none is given.
 */
function shipped(
  repo: string,
  base: string,
  closeout: Record<string, unknown> = { plan: 'p', pages: [] },
  failing: Failing = {},
  files = scratch('wf-quick-files-'),
): Ran {
  const check = loadWorkflows(QUICK, placesOf(QUICK)).find((step) => step.name === 'implement')?.check;
  assert.equal(typeof check, 'string', 'workflows/quick has an implement step with a check');
  const { bin, said } = stubs(failing);
  const [cmd, ...args] = checkArgv(check as string);
  const ran = spawnSync(cmd, args, {
    cwd: repo,
    env: envOf(repo, base, bin, { WF_ARTIFACTS: files, WF_CLOSEOUT: closeoutFile(closeout) }),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120_000,
  });
  return { code: ran.status, out: ran.stdout, err: ran.stderr, said: said() };
}

test("REFUSED at shipped defaults: implement's check, as frozen, refuses a change of one file past the bound, first, and names build", () => {
  const over = workOn(files(FILES + 1), SCRIPTS);
  const refused = shipped(over.repo, over.base);
  assert.notEqual(refused.code, 0, refused.out);
  assert.ok(refused.err.includes(`the change is ${FILES + 1} files and ${FILES + 1} lines`), refused.err);
  assert.ok(refused.err.includes(`bound of ${FILES} files and ${LINES} lines`), refused.err);
  assert.ok(refused.err.includes('It is a card for the build workflow'), refused.err);
  assert.ok(refused.err.includes('  nemia cancel r-1\n'), refused.err);
  assert.ok(refused.err.includes('  nemia start "<the card\'s text>" --workflows build --factory nemia\n'), refused.err);
  assert.deepEqual(refused.said, [], 'nothing else of the check ran: the bound is first');

  const within = workOn(files(FILES), SCRIPTS);
  const passed = shipped(within.repo, within.base);
  assert.equal(passed.code, 0, passed.out + passed.err);
  assert.ok(passed.out.includes(`wf size: ${FILES} files, ${FILES} lines of ${FILES} and ${LINES}\n`), passed.out);
  assert.deepEqual(passed.said, ['npm run typecheck', 'npm run lint'], 'the types and the lint, and no test of a package none reads');

  const bare = workOn(files(1));
  const old = shipped(bare.repo, bare.base);
  assert.notEqual(old.code, 0, old.out);
  assert.match(old.err, /has no workflows\/quick\/change\.ts/, 'a base without the script refuses, never skips');
});

const TYPES_AND_LINT = ['npm run typecheck', 'npm run lint'];
const TURBO = 'npx turbo run test --force --continue';
const E2E = 'npm run e2e -- --pages runs';

test("REFUSED at shipped defaults: implement's check, as frozen, runs each of its clauses in order, and refuses on each one's refusal", () => {
  const { repo, base } = workOn({ 'apps/api/src/a.ts': 'x\n', 'apps/web/src/routes/x.tsx': 'export const x = 1;\n' }, SCRIPTS);
  const files = scratch('wf-quick-files-');
  const picture = path.join(files, 'x-dark.png');
  fs.writeFileSync(picture, 'png');
  const signed = { plan: 'p', pages: ['runs'], artifacts: [picture] };
  const run = (closeout: Record<string, unknown>, failing: Failing = {}): Ran => shipped(repo, base, closeout, failing, files);

  const passed = run(signed);
  assert.equal(passed.code, 0, passed.out + passed.err);
  assert.deepEqual(passed.said, [...TYPES_AND_LINT, TURBO, E2E], 'the types, the lint, the tests of what it touched, then its pages');
  for (const line of [
    'wf size: 2 files, 2 lines',
    'wf pictures: 1 picture named',
    'wf scope: tests of every package',
    'wf scope: pages runs',
  ])
    assert.ok(passed.out.includes(line), `the check prints ${line}:\n${passed.out}`);
  assert.match(passed.out, /no live probe of run r-1/);
  assert.match(passed.out, /wf mutants: /);

  const unpictured = run({ ...signed, artifacts: [] });
  assert.notEqual(unpictured.code, 0, unpictured.out);
  assert.match(unpictured.err, /npm run e2e -- --photos --pages/);
  assert.deepEqual(unpictured.said, [], 'the pictures are asked before the types');

  const probing = run(signed, { claude: 1 });
  assert.notEqual(probing.code, 0, probing.out);
  assert.match(probing.err, /cannot tell which probes are live/);
  assert.deepEqual(probing.said, []);

  const unproven = run({ ...signed, noMutants: null });
  assert.notEqual(unproven.code, 0, unproven.out);
  assert.match(unproven.err, /names no mutant and says not why/);
  assert.deepEqual(unproven.said, TYPES_AND_LINT, 'the mutants run after the lint, before the tests');

  const failing = run(signed, { npx: 3 });
  assert.notEqual(failing.code, 0, failing.out);
  assert.deepEqual(failing.said, [...TYPES_AND_LINT, TURBO], 'a failing test of what the change touched refuses, and no page is visited');

  const unnamed = run({ ...signed, pages: [] });
  assert.notEqual(unnamed.code, 0, unnamed.out);
  assert.match(unnamed.err, /Name the e2e pages the change touches/);
  assert.deepEqual(unnamed.said, [...TYPES_AND_LINT, TURBO]);

  const broken = run(signed, { e2e: 4 });
  assert.notEqual(broken.code, 0, broken.out);
  assert.deepEqual(broken.said, [...TYPES_AND_LINT, TURBO, E2E], 'a failing page refuses');
});

test('REFUSED: a change of one line past the bound, added or removed, and none at it', () => {
  const over = workOn({ 'a.ts': lines(LINES + 1) });
  const refused = change(over.repo, over.base, 'size');
  assert.equal(refused.code, 1, refused.out);
  assert.ok(refused.err.includes(`the change is 1 files and ${LINES + 1} lines`), refused.err);
  const at = workOn({ 'a.ts': lines(LINES) });
  assert.equal(change(at.repo, at.base, 'size').code, 0);

  const removes = (n: number): Ran => {
    const made = based({ 'old.ts': lines(n + 5, 'old') });
    fs.rmSync(path.join(made.repo, 'old.ts'));
    commit(made.repo, { 'old.ts': lines(5, 'old'), 'new.ts': lines(LINES - 100, 'new') }, 'work');
    return change(made.repo, made.base, 'size');
  };
  const cut = removes(101);
  assert.equal(cut.code, 1, cut.out);
  assert.ok(cut.err.includes(`the change is 2 files and ${LINES + 1} lines`), `removed lines count:\n${cut.err}`);
  assert.equal(removes(100).code, 0);
});

test('a generated file counts for nothing, and a test or a doc counts as any file: REFUSED with the same lines in one', () => {
  const made = {
    'package-lock.json': lines(5000),
    'apps/web/theme/tokens.css': lines(5000),
    'apps/web/src/routeTree.gen.ts': lines(5000),
  };
  const beside = workOn({ ...made, 'src/a.ts': 'export const a = 1;\n' });
  const passed = change(beside.repo, beside.base, 'size');
  assert.equal(passed.code, 0, passed.err);
  assert.equal(passed.out, `wf size: 1 files, 1 lines of ${FILES} and ${LINES}\n`);
  for (const counted of ['packages/x/test/a.test.ts', 'docs/a.md', 'apps/web/src/routeTree.ts', 'apps/web/themes/a.css']) {
    const { repo, base } = workOn({ [counted]: lines(LINES + 1) });
    assert.equal(change(repo, base, 'size').code, 1, `${counted} counts`);
  }
});

test('the measure is the net change: a line added then removed is none, and a renamed file is one file of no line', () => {
  const undone = workOn({ 'a.ts': lines(LINES + 1) });
  fs.rmSync(path.join(undone.repo, 'a.ts'));
  commit(undone.repo, {}, 'take it back');
  assert.equal(change(undone.repo, undone.base, 'size').out, `wf size: 0 files, 0 lines of ${FILES} and ${LINES}\n`);

  const moved = based({ 'a.ts': lines(LINES + 1) });
  git(moved.repo, 'mv', 'a.ts', 'b.ts');
  commit(moved.repo, {}, 'rename');
  assert.equal(change(moved.repo, moved.base, 'size').out, `wf size: 1 files, 0 lines of ${FILES} and ${LINES}\n`);
});

test('REFUSED otherwise: a branch that merged a newer base is measured on its own change, from the base it merged last', () => {
  const { repo, base } = workOn({ 'mine.ts': 'export const mine = 1;\n' });
  git(repo, 'checkout', '-q', 'main');
  commit(repo, files(4 * FILES, 'theirs'), 'the base moves');
  git(repo, 'checkout', '-q', 'work');
  git(repo, 'merge', '-q', '--no-ff', '-m', 'merge the base', 'main');
  commit(repo, { 'more.ts': 'export const more = 1;\n' }, 'after the merge');
  const measured = change(repo, base, 'size');
  assert.equal(measured.code, 0, measured.err);
  assert.equal(measured.out, `wf size: 2 files, 2 lines of ${FILES} and ${LINES}\n`);
  assert.equal(git(repo, 'diff', '--name-only', base, 'HEAD').trim().split('\n').length, 4 * FILES + 2, 'which the first base would not');
});

test('REFUSED: no base to measure from, and a verb the script has not', () => {
  const { repo, base } = workOn(files(1));
  const { bin } = stubs();
  const { WF_BASE_REF: _unset, ...env } = envOf(repo, base, bin);
  const unbased = spawnSync(process.execPath, [SCRIPT, 'size'], { cwd: repo, env, encoding: 'utf8', timeout: 60_000 });
  assert.equal(unbased.status, 1);
  assert.match(unbased.stderr, /WF_BASE_REF is not set/);
  const gone = change(repo, 'no-such-commit', 'size');
  assert.equal(gone.code, 1);
  assert.match(gone.err, /cannot tell where the work began/);
  const unknown = change(repo, base, 'trim');
  assert.equal(unknown.code, 1);
  assert.match(unknown.err, /usage: node change\.ts <size\|tests\|pages>/);
});

/** What `tests` handed turbo for a change of `paths`: the filters, `[]` for the whole suite, undefined where it started nothing. */
function filtersFor(...paths: string[]): string[] | undefined {
  const { repo, base } = workOn(Object.fromEntries(paths.map((name) => [name, 'x\n'])));
  const ran = change(repo, base, 'tests');
  assert.equal(ran.code, 0, ran.err);
  if (!ran.said.length) return undefined;
  assert.equal(ran.said.length, 1, 'one run of turbo');
  const head = 'npx turbo run test --force --continue';
  assert.ok(ran.said[0].startsWith(head), ran.said[0]);
  return ran.said[0].slice(head.length).split(' ').filter(Boolean);
}

test('tests: turbo is handed a filter for each package that reads the change, with its dependents, and none for a root config file', () => {
  assert.deepEqual(filtersFor('packages/agent-runtime/src/a.ts'), [
    '--filter=...agent-orchestrator',
    '--filter=...agent-runtime',
    '--filter=...docs',
  ]);
  assert.deepEqual(filtersFor('workflows/quick/README.md'), ['--filter=...agent-orchestrator', '--filter=...docs']);
  assert.deepEqual(filtersFor('apps/api/README.md'), ['--filter=...api']);
  assert.deepEqual(filtersFor('apps/web/src/a.tsx', 'apps/api/src/a.ts'), [], 'both apps and the three that read their sources: all five');
  assert.deepEqual(filtersFor('turbo.json'), []);
  assert.deepEqual(filtersFor('package-lock.json'), [], 'a generated file is still read by the tests');
  assert.deepEqual(filtersFor('tools/test-costs/report.ts'), [], 'every package reads the tools');
  assert.equal(filtersFor('.github/workflows/ci.yml'), undefined, 'no package reads it: nothing is run');
  const { repo, base } = workOn({ '.github/a.yml': 'x\n' });
  assert.match(change(repo, base, 'tests').out, /^wf scope: tests of no package/);
  const moved = based({ 'packages/agent-runtime/a.md': lines(20) });
  git(moved.repo, 'mv', 'packages/agent-runtime/a.md', 'a.txt');
  commit(moved.repo, {}, 'move it out');
  assert.equal(change(moved.repo, moved.base, 'tests').said.length, 1, 'a file moved out of a package is a change to that package');
});

test('REFUSED: a failing run of the tests is the exit of the check', () => {
  const { repo, base } = workOn({ 'apps/api/src/a.ts': 'x\n' });
  const failed = changeOver({ npx: 3 }, repo, base, 'tests');
  assert.equal(failed.code, 3);
  assert.equal(failed.said.length, 1, 'turbo ran, and failed');
});

test('REFUSED: a failing page is the exit of the check', () => {
  const { repo, base } = workOn({ 'apps/web/src/routes/x.tsx': 'export const x = 1;\n' });
  const failed = changeOver({ e2e: 4 }, repo, base, 'pages', closeoutFile({ pages: ['runs'] }));
  assert.equal(failed.code, 4);
  assert.deepEqual(failed.said, [E2E]);
});

type Turbo = { tasks: Record<string, { inputs?: string[] }> };

/** A path the turbo input `glob` matches: `web` for a folder's `*`, a file for a name's, a deep file for `**`. */
const sampleOf = (glob: string): string => glob.replace('/**', '/deep/file.txt').replace('*.', 'file.').replaceAll('*', 'web');

test("REFUSED: an input of a package's test task in turbo.json that the script's table does not select the package for", () => {
  const turbo = JSON.parse(fs.readFileSync(path.join(REPO, 'turbo.json'), 'utf8')) as Turbo;
  const ROOT = '$TURBO_ROOT$/';
  const inputs = Object.entries(turbo.tasks).flatMap(([task, { inputs: globs = [] }]) =>
    task.endsWith('#test') ? globs.filter((glob) => glob.startsWith(ROOT)).map((glob) => ({ name: task.slice(0, -5), glob })) : [],
  );
  assert.ok(inputs.length >= 20 && new Set(inputs.map(({ name }) => name)).size === 5, 'turbo.json names the inputs of five test tasks');
  const { repo, base } = based();
  const unselected = inputs.filter(({ name, glob }, i) => {
    git(repo, 'checkout', '-q', '-b', `input-${i}`, base);
    commit(repo, { [sampleOf(glob.slice(ROOT.length))]: 'x\n' }, 'touch it');
    const [said] = change(repo, base, 'tests').said;
    return !said || (said.includes('--filter=') && !said.split(' ').includes(`--filter=...${name}`));
  });
  assert.deepEqual(unselected, []);
  assert.equal(sampleOf('apps/*/*.ts'), 'apps/web/file.ts');
  git(repo, 'checkout', '-q', '-b', 'unread', base);
  commit(repo, { 'unread/deep/file.txt': 'x\n' }, 'touch it');
  assert.deepEqual(change(repo, base, 'tests').said, [], 'a path no input names selects none: the filter above could fail');
});

test('REFUSED: a change under apps/web/src whose closeout names no page; the pages named are the ones the e2e is handed', () => {
  const board = workOn({ 'apps/web/src/routes/x.tsx': 'export const x = 1;\n' });
  const unnamed = change(board.repo, board.base, 'pages', closeoutFile({ pages: [] }));
  assert.equal(unnamed.code, 1, unnamed.out);
  assert.ok(unnamed.err.includes('apps/web/src/routes/x.tsx'), unnamed.err);
  assert.ok(unnamed.err.includes('Name the e2e pages the change touches'), unnamed.err);
  assert.deepEqual(unnamed.said, []);
  assert.equal(change(board.repo, board.base, 'pages', closeoutFile({})).code, 1, 'a closeout with no pages names none');

  const named = change(board.repo, board.base, 'pages', closeoutFile({ pages: ['runs', 'run-detail'] }));
  assert.equal(named.code, 0, named.err);
  assert.deepEqual(named.said, ['npm run e2e -- --pages runs,run-detail']);
  assert.equal(named.out, 'wf scope: pages runs, run-detail\n');

  const elsewhere = workOn({ 'apps/web/test/x.test.ts': 'x\n', 'docs/a.md': 'x\n' });
  const none = change(elsewhere.repo, elsewhere.base, 'pages', closeoutFile({ pages: [] }));
  assert.equal(none.code, 0, none.err);
  assert.deepEqual(none.said, [], 'nothing is started');
  assert.deepEqual(change(elsewhere.repo, elsewhere.base, 'pages', closeoutFile({ pages: ['runs'] })).said, [
    'npm run e2e -- --pages runs',
  ]);

  for (const pages of [['--photos'], 'runs', [7]]) {
    const flag = change(board.repo, board.base, 'pages', closeoutFile({ pages }));
    assert.equal(flag.code, 1, JSON.stringify(pages));
    assert.match(flag.err, /is not a list of page names/);
  }
  const unread = change(board.repo, board.base, 'pages');
  assert.equal(unread.code, 1);
  assert.match(unread.err, /no closeout reached the check/);
});

test("REFUSED: a note or a README that says another bound than the script's", () => {
  const said = (file: string): string => fs.readFileSync(path.join(QUICK, file), 'utf8');
  const note = new RegExp(`at\\s+most\\s+${FILES}\\s+files\\s+and\\s+${LINES}\\s+lines\\s+changed`);
  assert.match(said('implement.md'), note);
  assert.doesNotMatch(said('implement.md').replace(`${LINES} lines`, `${LINES + 1} lines`), note);
  const readme = new RegExp(`at\\s+most\\s+\\*\\*${FILES}\\s+files\\*\\*\\s+and\\s+\\*\\*${LINES}\\s+lines\\*\\*\\s+changed`);
  assert.match(said('README.md'), readme);
  for (const made of /const GENERATED = \[([^\]]*)\];/
    .exec(TEXT)![1]
    .split(',')
    .map((entry) => entry.trim().slice(1, -1)))
    for (const file of ['implement.md', 'README.md']) assert.ok(said(file).includes(`\`${made}\``), `${file} names ${made}`);
});

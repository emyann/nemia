/**
 * The quick workflow's own check script (`workflows/quick/change.ts`), run as the check runs it: `node change.ts <verb>` in a committed
 * scratch repository whose base is `WF_BASE_REF`, a bounded subprocess, with `npx` and `npm` stubs first on the path that record what
 * they are handed. The bound is read from the shipped script's text (`LINES`), so each refusal is at the shipped number, and
 * the shipped check of `workflows/quick/implement.md` is run whole, as frozen, so the bound is proven wired and first.
 *
 * Its `origin` is a bare repository and its `gh` a stub (`test/origin.ts`), for the two clauses that push the branch and read CI.
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
import { type Rule, bareOrigin, ghIn, passing, rollup } from './origin.ts';

const QUICK = path.join(REPO, 'workflows', 'quick');

const SCRIPT = path.join(QUICK, 'change.ts');

/** The shipped script's text, and the number its constant `name` holds, the slice ending on `GENERATED`, which must be there. */
const TEXT = fs.readFileSync(SCRIPT, 'utf8');
const shippedNumber = (name: 'LINES'): number => {
  const bounds = TEXT.slice(0, TEXT.indexOf('const GENERATED'));
  const found = new RegExp(`const\\s+${name}\\s*=\\s*(\\d+);`).exec(bounds);
  assert.ok(found, `change.ts declares ${name} before GENERATED`);
  return Number(found[1]);
};
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

/** The branch a run's work is on, which the pull-request script the shipped check runs requires (`wf/<run>/run` for a run's own line). */
const BRANCH = 'wf/r-1/run';

/** A scratch repository on `main` holding `base`, with the run's branch checked out on it, a bare `origin`, and the base's commit. */
function based(base: Record<string, string> = {}): { repo: string; base: string } {
  const repo = scratch('wf-quick-repo-');
  git(repo, 'init', '-q', '-b', 'main');
  commit(repo, { 'README.md': 'base\n', ...base }, 'base');
  const at = git(repo, 'rev-parse', 'HEAD').trim();
  git(repo, 'checkout', '-q', '-b', BRANCH);
  bareOrigin(repo);
  return { repo, base: at };
}

/** A scratch repository whose `HEAD`, one commit past its base, adds `work`. */
function workOn(work: Record<string, string>, base: Record<string, string> = {}): { repo: string; base: string } {
  const made = based(base);
  commit(made.repo, work, 'work');
  return made;
}

/** What a stub exits with where it is not 0: `npx` whatever it is handed, `npm` handed the e2e or anything else, and `claude`. */
type Failing = { npx?: number; e2e?: number; npm?: number; claude?: number };

/**
 * A folder holding an `npx`, an `npm` and a `claude` that exit 0 but as `failing` says, the first two writing their arguments as a
 * line of `log` first.
 */
function stubs(failing: Failing = {}): { bin: string; said: () => string[] } {
  const bin = scratch('wf-quick-bin-');
  const log = path.join(bin, 'said.log');
  const exits = { npx: `exit ${failing.npx ?? 0}`, npm: `case "$*" in *e2e*) exit ${failing.e2e ?? 0};; esac; exit ${failing.npm ?? 0}` };
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
  const { bin, said } = stubs();
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
  fs.writeFileSync(file, JSON.stringify({ outcome: 'done', summary: 's', artifacts: [], ...more }));
  return file;
}

/** The scripts a run's base holds, which the shipped check shows from it. */
const SCRIPTS = {
  'workflows/quick/change.ts': TEXT,
  ...Object.fromEntries(
    ['landing.ts', 'pictures.ts', 'probe.ts', 'pull-request.ts'].map((name) => [
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
  rules?: readonly Rule[],
): Ran {
  const check = loadWorkflows(QUICK, placesOf(QUICK)).find((step) => step.name === 'implement')?.check;
  assert.equal(typeof check, 'string', 'workflows/quick has an implement step with a check');
  const { bin, said } = stubs(failing);
  const gh = ghIn(bin, rules ?? passing(repo));
  const [cmd, ...args] = checkArgv(check as string);
  const ran = spawnSync(cmd, args, {
    cwd: repo,
    env: envOf(repo, base, bin, { ...gh.env(), WF_ARTIFACTS: files, WF_CLOSEOUT: closeoutFile(closeout) }),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120_000,
  });
  return { code: ran.status, out: ran.stdout, err: ran.stderr, said: said() };
}

test("REFUSED at shipped defaults: implement's check, as frozen, refuses a change of one line past the bound, first, and names build", () => {
  const over = workOn({ 'a.ts': lines(LINES + 1) }, SCRIPTS);
  const refused = shipped(over.repo, over.base);
  assert.notEqual(refused.code, 0, refused.out);
  assert.ok(refused.err.includes(`the change is ${LINES + 1} lines in 1 files`), refused.err);
  assert.ok(refused.err.includes(`bound of ${LINES} lines`), refused.err);
  assert.ok(refused.err.includes('It is a card for the build workflow'), refused.err);
  assert.ok(refused.err.includes('  nemia cancel r-1\n'), refused.err);
  assert.ok(refused.err.includes('  nemia start "<the card\'s text>" '), refused.err);
  assert.ok(refused.err.includes(' --workflows build --factory nemia\n'), refused.err);
  assert.deepEqual(refused.said, [], 'nothing else of the check ran: the bound is first');

  const within = workOn({ 'a.ts': lines(LINES) }, SCRIPTS);
  const passed = shipped(within.repo, within.base);
  assert.equal(passed.code, 0, passed.out + passed.err);
  assert.ok(passed.out.includes(`wf size: 1 files, ${LINES} lines of ${LINES}\n`), passed.out);
  assert.deepEqual(passed.said, [], 'no types, no lint, no test of a package');

  const bare = workOn(files(1));
  const old = shipped(bare.repo, bare.base);
  assert.notEqual(old.code, 0, old.out);
  assert.match(old.err, /has no workflows\/quick\/change\.ts/, 'a base without the script refuses, never skips');
});

/** An `npx` and an `npm` that fail whatever they are handed: a check that passes over them ran no test, no types, no lint, no page. */
const UNRUNNABLE: Failing = { npx: 3, e2e: 4, npm: 5 };

test("REFUSED at shipped defaults: implement's check, as frozen, runs its five clauses in order, refuses on each one's refusal, and runs no npm or npx", () => {
  const { repo, base } = workOn({ 'apps/api/src/a.ts': 'x\n', 'apps/web/src/routes/x.tsx': 'export const x = 1;\n' }, SCRIPTS);
  const files = scratch('wf-quick-files-');
  const picture = path.join(files, 'x-dark.png');
  fs.writeFileSync(picture, 'png');
  const signed = { plan: 'p', pages: [], artifacts: [picture] };
  const run = (closeout: Record<string, unknown>, failing: Failing = {}, rules?: readonly Rule[]): Ran =>
    shipped(repo, base, closeout, { ...UNRUNNABLE, ...failing }, files, rules);
  const PRINTS = [
    /wf size: 2 files, 2 lines/,
    /wf pictures: 1 picture named/,
    /no live probe of run r-1/,
    /wf pr: #7 is at [0-9a-f]{12}, the commit this check judges/,
    /wf ci: `ci` passed on/,
  ];
  const printed = (ran: Ran): number[] => PRINTS.map((line) => ran.out.search(line));

  const passed = run(signed);
  assert.equal(passed.code, 0, passed.out + passed.err);
  assert.deepEqual(passed.said, [], 'a change to both apps that names no page: no types, no lint, no test of a package, no page');
  assert.deepEqual(
    printed(passed),
    [...printed(passed)].sort((a, b) => a - b),
    passed.out,
  );
  assert.ok(
    printed(passed).every((at) => at >= 0),
    `each clause prints its line, in order:\n${passed.out}`,
  );
  assert.doesNotMatch(passed.out, /wf scope:/);

  const unpictured = run({ ...signed, artifacts: [] });
  assert.notEqual(unpictured.code, 0, unpictured.out);
  assert.match(unpictured.err, /npm run e2e -- --photos --pages/);
  assert.deepEqual(
    printed(unpictured).map((at) => at >= 0),
    [true, false, false, false, false],
    'the pictures are asked second',
  );

  const probing = run(signed, { claude: 1 });
  assert.notEqual(probing.code, 0, probing.out);
  assert.match(probing.err, /cannot tell which probes are live/);
  assert.deepEqual(
    printed(probing).map((at) => at >= 0),
    [true, true, false, false, false],
    'the probes are read third',
  );

  const unopened = run(signed, {}, [...passing(repo).filter((rule) => rule.when !== 'pr list'), { when: 'pr list', out: '[]' }]);
  assert.notEqual(unopened.code, 0, unopened.out);
  assert.match(unopened.err, /no open pull request has wf\/r-1\/run as its head/);
  assert.deepEqual(
    printed(unopened).map((at) => at >= 0),
    [true, true, true, false, false],
    'the branch is pushed fourth, after the probes are read',
  );

  const red = run(signed, {}, [
    ...passing(repo).filter((rule) => rule.when !== 'pr view'),
    { when: 'pr view', out: rollup({ status: 'COMPLETED', conclusion: 'FAILURE' }) },
  ]);
  assert.notEqual(red.code, 0, red.out);
  assert.match(red.err, /`ci` for #7 is failure/);
  assert.ok(red.err.includes('nemia retry r-1 implement --recheck'), red.err);
  assert.deepEqual(
    printed(red).map((at) => at >= 0),
    [true, true, true, true, false],
    'CI is waited on last',
  );
  for (const refused of [unpictured, probing, unopened, red]) assert.deepEqual(refused.said, []);
});

test('REFUSED: a change of one line past the bound, added or removed, and none at it', () => {
  const over = workOn({ 'a.ts': lines(LINES + 1) });
  const refused = change(over.repo, over.base, 'size');
  assert.equal(refused.code, 1, refused.out);
  assert.ok(refused.err.includes(`the change is ${LINES + 1} lines in 1 files`), refused.err);
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
  assert.ok(cut.err.includes(`the change is ${LINES + 1} lines in 2 files`), `removed lines count:\n${cut.err}`);
  assert.equal(removes(100).code, 0);
});

test('a change of many files within the line bound passes: the count of files is said, and refuses nothing', () => {
  const many = workOn(files(LINES));
  const passed = change(many.repo, many.base, 'size');
  assert.equal(passed.code, 0, passed.err);
  assert.equal(passed.out, `wf size: ${LINES} files, ${LINES} lines of ${LINES}\n`);
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
  assert.equal(passed.out, `wf size: 1 files, 1 lines of ${LINES}\n`);
  for (const counted of ['packages/x/test/a.test.ts', 'docs/a.md', 'apps/web/src/routeTree.ts', 'apps/web/themes/a.css']) {
    const { repo, base } = workOn({ [counted]: lines(LINES + 1) });
    assert.equal(change(repo, base, 'size').code, 1, `${counted} counts`);
  }
});

test('the measure is the net change: a line added then removed is none, and a renamed file is one file of no line', () => {
  const undone = workOn({ 'a.ts': lines(LINES + 1) });
  fs.rmSync(path.join(undone.repo, 'a.ts'));
  commit(undone.repo, {}, 'take it back');
  assert.equal(change(undone.repo, undone.base, 'size').out, `wf size: 0 files, 0 lines of ${LINES}\n`);

  const moved = based({ 'a.ts': lines(LINES + 1) });
  git(moved.repo, 'mv', 'a.ts', 'b.ts');
  commit(moved.repo, {}, 'rename');
  assert.equal(change(moved.repo, moved.base, 'size').out, `wf size: 1 files, 0 lines of ${LINES}\n`);
});

test('REFUSED otherwise: a branch that merged a newer base is measured on its own change, from the base it merged last', () => {
  const { repo, base } = workOn({ 'mine.ts': 'export const mine = 1;\n' });
  git(repo, 'checkout', '-q', 'main');
  commit(repo, { 'theirs.ts': lines(LINES + 1, 'theirs') }, 'the base moves');
  git(repo, 'checkout', '-q', BRANCH);
  git(repo, 'merge', '-q', '--no-ff', '-m', 'merge the base', 'main');
  commit(repo, { 'more.ts': 'export const more = 1;\n' }, 'after the merge');
  const measured = change(repo, base, 'size');
  assert.equal(measured.code, 0, measured.err);
  assert.equal(measured.out, `wf size: 2 files, 2 lines of ${LINES}\n`);
  assert.equal(git(repo, 'diff', '--numstat', base, 'HEAD').includes(`${LINES + 1}\t0\ttheirs.ts`), true, 'which the first base would not');
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
  for (const verb of ['trim', 'tests', 'pages']) {
    const unknown = change(repo, base, verb, closeoutFile({ pages: ['runs'] }));
    assert.equal(unknown.code, 1, verb);
    assert.equal(unknown.err, `wf change: usage: node change.ts size, not "${verb}"\n`);
    assert.equal(unknown.out, '');
    assert.deepEqual(unknown.said, [], 'nothing is started');
  }
});

test("REFUSED: a note or a README that says another bound than the script's, or other clauses than the check's", () => {
  const said = (file: string): string => fs.readFileSync(path.join(QUICK, file), 'utf8');
  const note = new RegExp(`at\\s+most\\s+${LINES}\\s+lines\\s+changed,\\s+in\\s+any\\s+number\\s+of\\s+files`);
  assert.match(said('implement.md'), note);
  assert.doesNotMatch(said('implement.md').replace(`${LINES} lines`, `${LINES + 1} lines`), note);
  for (const file of ['implement.md', 'review.md']) assert.doesNotMatch(said(file), /at\s+most\s+\d+\s+files/, `${file} bounds no files`);
  const readme = new RegExp(`at\\s+most\\s+\\*\\*${LINES}\\s+lines\\*\\*\\s+changed`);
  assert.match(said('README.md'), readme);
  assert.doesNotMatch(said('README.md'), /\*\*\d+\s+files\*\*/, 'README.md bounds no files');
  for (const file of ['implement.md', 'review.md', 'README.md'])
    assert.doesNotMatch(said(file), /either\s+number/, `${file} says of one bound, not two`);
  const check = loadWorkflows(QUICK, placesOf(QUICK)).find((step) => step.name === 'implement')?.check ?? '';
  const clauses = [...check.matchAll(/node\s+"\$\w+\/([\w-]+\.ts)"\s+(size|tests|pages|push|wait)?/g)].map(([, script, verb]) =>
    verb ? `${script} ${verb}` : script,
  );
  assert.deepEqual(clauses, ['change.ts size', 'pictures.ts', 'probe.ts', 'pull-request.ts push', 'pull-request.ts wait']);
  assert.doesNotMatch(check, /\bnpm\b|\bnpx\b/);
  const ticked = clauses.map((clause) => `\`${clause.replace('.', '\\.').replace(' ', '\\s+')}\``);
  const runs = new RegExp(
    `runs\\s+${ticked.slice(0, -1).join(',\\s+')}\\s+and\\s+${ticked.at(-1)},\\s+in\\s+that\\s+order,\\s+and\\s+nothing\\s+else`,
  );
  for (const file of ['implement.md', 'README.md']) {
    assert.match(said(file), runs, `${file} says what the check runs`);
    assert.doesNotMatch(said(file).replace('`probe.ts`,', '`probe.ts`, `change.ts tests`,'), runs);
  }
  for (const made of /const GENERATED = \[([^\]]*)\];/
    .exec(TEXT)![1]
    .split(',')
    .map((entry) => entry.trim().slice(1, -1)))
    for (const file of ['implement.md', 'README.md']) assert.ok(said(file).includes(`\`${made}\``), `${file} names ${made}`);
});

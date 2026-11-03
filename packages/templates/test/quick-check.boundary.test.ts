/**
 * sdlc's quick workflow's own check script (`sdlc/workflows/quick/change.ts`), run as the check runs it: `node change.ts <verb>` in a
 * committed scratch repository whose base is `WF_BASE_REF`, a bounded subprocess, with `npx` and `npm` stubs first on the path that
 * record what they are handed. The script says the size and refuses none, and quick's implement check, as sdlc renders it for a
 * factory (`nemia factory apply` and the controller on a scratch store), is run whole as the run runs a check (`checkArgv`), so the
 * measure is proven wired and first: from the run's frozen workflow files (`WF_WORKFLOW_FILES`, here the rendered folder) on a base that
 * holds none of the team, and refused, never read from the base, where the variable is unset.
 *
 * Its `origin` is a bare repository and its `gh` a stub (`test/origin.ts`), for the two clauses that push the branch and read CI.
 *
 * Its subject is git and a spawned script: a boundary file.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadWorkflows } from 'agent-orchestrator';
import { checkArgv } from 'agent-orchestrator/run';
import { scratch } from './scratch.ts';
import { BIN } from './template.ts';
import { type Rule, bareOrigin, ghIn, gitIn, passing, rollup } from './origin.ts';

/** The template these scripts ship in. */
const SDLC = path.join(import.meta.dirname, '..', 'sdlc');

const QUICK = path.join(SDLC, 'workflows', 'quick');

const SCRIPT = path.join(QUICK, 'change.ts');

/** The orchestrator's CLI, `nemia`, reached through its package's entry. */

/** sdlc as a factory gets it: the factory's rendered tree, and the scratch store it is in. */
type Rendered = { tree: string; store: string };

/**
 * sdlc rendered as a person's factory gets it: a copy of the template applied by `nemia factory apply` with `sets`, on a scratch store,
 * and rendered by the controller of a `nemia up` on that store, stopped once it has written the factory's status and seeded its tree.
 */
async function rendered(sets: readonly string[] = []): Promise<Rendered> {
  const root = scratch('wf-sdlc-render-');
  const template = path.join(root, 'sdlc');
  fs.cpSync(SDLC, template, { recursive: true });
  const store = path.join(root, 'store');
  const env = {
    ...process.env,
    HOME: root,
    WF_ROOT: store,
    AE_ROOT: path.join(root, 'engine'),
    CLAUDE_CONFIG_DIR: path.join(root, 'claude'),
    OTEL_EXPORTER_OTLP_ENDPOINT: '',
    WF_MAX_CONCURRENT: '1',
    WF_MAX_RUNS: '1',
  };
  const nemia = (...args: string[]) => spawnSync(process.execPath, [BIN, ...args], { cwd: root, env, encoding: 'utf8', timeout: 60_000 });
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  gitIn(repo, 'init', '-q');
  const applied = nemia(
    'factory',
    'apply',
    'sdlc',
    '--template',
    template,
    '--repo',
    repo,
    '--no-trust',
    ...sets.flatMap((s) => ['--set', s]),
  );
  assert.equal(applied.status, 0, applied.stderr);
  const folder = path.join(store, 'factories', 'sdlc');
  const done = () => fs.existsSync(path.join(folder, 'status.json')) && fs.existsSync(path.join(folder, 'tree', 'factory.json'));
  const up = spawn(process.execPath, [BIN, 'up'], { cwd: root, env, stdio: 'ignore' });
  const ended = new Promise((resolve) => up.once('exit', resolve));
  try {
    for (const bound = performance.now() + 60_000; !done(); await new Promise((r) => setTimeout(r, 50)))
      assert.ok(performance.now() < bound && up.exitCode === null, 'the controller renders the tree within 60 s');
  } finally {
    up.kill('SIGTERM');
    const killer = setTimeout(() => up.kill('SIGKILL'), 10_000);
    await ended;
    clearTimeout(killer);
  }
  const status = JSON.parse(fs.readFileSync(path.join(folder, 'status.json'), 'utf8')) as { conditions: { status: string }[] };
  assert.equal(status.conditions[0]?.status, 'True', JSON.stringify(status));
  return { tree: path.join(folder, 'tree'), store };
}

/** The steps of the rendered tree's `workflow`, read as a start of it in the factory reads them: with the factory's hires. */
function stepsOf(at: Rendered, workflow: string) {
  const { hires } = JSON.parse(fs.readFileSync(path.join(at.tree, 'factory.json'), 'utf8')) as { hires: Record<string, string> };
  const agents = Object.fromEntries(
    Object.entries(hires).flatMap(([step, agent]) => (step.startsWith(`${workflow}/`) ? [[step.slice(workflow.length + 1), agent]] : [])),
  );
  return loadWorkflows(path.join(at.tree, 'workflows', workflow), { home: at.store }, { factory: 'sdlc', workflow, agents });
}

/** The shipped script's text. */
const TEXT = fs.readFileSync(SCRIPT, 'utf8');

/** A change larger than any bound quick ever had: 300 lines, then. */
const MANY = 1000;

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

/** The scripts a run's base could hold, which the check never reads from it: quick's `change.ts` and the scripts it carries. */
const SCRIPTS = Object.fromEntries(
  ['change.ts', 'landing.ts', 'probe.ts', 'pull-request.ts'].map((name) => [
    `workflows/quick/${name}`,
    fs.readFileSync(path.join(QUICK, name), 'utf8'),
  ]),
);

/**
 * sdlc rendered for a factory with its parameters at their defaults, and quick's folder in it: what a run freezes as
 * `WF_WORKFLOW_FILES`.
 */
const RENDERED = await rendered();
const FROZEN = path.join(RENDERED.tree, 'workflows', 'quick');

/** Quick's implement check, as the rendered tree gives it to a run. */
const CHECK = stepsOf(RENDERED, 'quick').find((step) => step.name === 'implement')?.check ?? '';

/**
 * Run the rendered check of quick's implement in `repo` as a check runs, its argv `checkArgv`'s, over the stubs, which exit as
 * `failing` says; `files` is the step's files directory, one of its own where none is given, and `more` is the rest of its environment:
 * the run's frozen workflow files, the rendered quick folder, unless it says otherwise.
 */
function shipped(
  repo: string,
  base: string,
  closeout: Record<string, unknown> = { plan: 'p' },
  failing: Failing = {},
  files = scratch('wf-quick-files-'),
  rules?: readonly Rule[],
  more: Record<string, string> = { WF_WORKFLOW_FILES: FROZEN },
): Ran {
  assert.ok(CHECK, "sdlc's quick has an implement step with a check");
  const { bin, said } = stubs(failing);
  const gh = ghIn(bin, rules ?? passing(repo));
  const [cmd, ...args] = checkArgv(CHECK);
  const ran = spawnSync(cmd, args, {
    cwd: repo,
    env: envOf(repo, base, bin, {
      ...gh.env(),
      WF_ARTIFACTS: files,
      WF_CLOSEOUT: closeoutFile(closeout),
      WF_CI_POLL_SECONDS: '0',
      ...more,
    }),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120_000,
  });
  return { code: ran.status, out: ran.stdout, err: ran.stderr, said: said() };
}

test("implement's check, as rendered, reaches its scripts in the run's frozen workflow files on a base that holds none of the team", () => {
  const bare = workOn({ 'a.ts': lines(MANY) });
  assert.equal(fs.existsSync(path.join(bare.repo, 'workflows')), false, 'the base holds none of the team');
  const passed = shipped(bare.repo, bare.base);
  assert.equal(passed.code, 0, passed.out + passed.err);
  assert.ok(passed.out.startsWith(`nemia size: 1 files, ${MANY} lines\n`), passed.out);
  assert.deepEqual(passed.said, [], 'no types, no lint, no test of a package');

  const unset = shipped(bare.repo, bare.base, undefined, {}, undefined, undefined, {});
  assert.notEqual(unset.code, 0, unset.out);
  assert.ok(unset.err.includes('change.ts'), `with no frozen files named it refuses at its first clause:\n${unset.err}`);
  assert.match(unset.err, /WF_WORKFLOW_FILES/, 'naming the variable');
});

test("REFUSED: implement's check, with no frozen workflow files named, reads no script from the run's base, though the base holds them", () => {
  const large = workOn({ 'a.ts': lines(MANY) }, SCRIPTS);
  const refused = shipped(large.repo, large.base, undefined, {}, undefined, undefined, {});
  assert.notEqual(refused.code, 0, refused.out + refused.err);
  assert.equal(refused.out, '', 'no clause ran: not the size, nor any after it');
  assert.deepEqual(
    refused.err
      .trim()
      .split('\n')
      .map((line) => line.includes('change.ts') && line.includes('WF_WORKFLOW_FILES')),
    [true],
    `one line, naming the variable and the script of the first clause:\n${refused.err}`,
  );
  assert.deepEqual(refused.said, [], 'no types, no lint, no test of a package');
});

/** An `npx` and an `npm` that fail whatever they are handed: a check that passes over them ran no test, no types, no lint, no page. */
const UNRUNNABLE: Failing = { npx: 3, e2e: 4, npm: 5 };

test("REFUSED at shipped defaults: implement's check, as rendered, runs its four clauses in order, refuses on each one's refusal, and runs no npm or npx", () => {
  const { repo, base } = workOn({ 'apps/api/src/a.ts': 'x\n', 'apps/web/src/routes/x.tsx': 'export const x = 1;\n' });
  const files = scratch('wf-quick-files-');
  const signed = { plan: 'p' };
  const run = (closeout: Record<string, unknown>, failing: Failing = {}, rules?: readonly Rule[]): Ran =>
    shipped(repo, base, closeout, { ...UNRUNNABLE, ...failing }, files, rules);
  const PRINTS = [
    /nemia size: 2 files, 2 lines/,
    /no live probe of run r-1/,
    /nemia pr: #7 is at [0-9a-f]{12}, the commit this check judges/,
    /nemia ci: `ci` passed on/,
  ];
  const printed = (ran: Ran): number[] => PRINTS.map((line) => ran.out.search(line));

  const passed = run(signed);
  assert.equal(passed.code, 0, passed.out + passed.err);
  assert.deepEqual(passed.said, [], 'a change to two folders: no types, no lint, no test of a package, no page');
  assert.deepEqual(
    printed(passed),
    [...printed(passed)].sort((a, b) => a - b),
    passed.out,
  );
  assert.ok(
    printed(passed).every((at) => at >= 0),
    `each clause prints its line, in order:\n${passed.out}`,
  );
  assert.doesNotMatch(passed.out, /nemia scope:/);

  const probing = run(signed, { claude: 1 });
  assert.notEqual(probing.code, 0, probing.out);
  assert.match(probing.err, /cannot tell which probes are live/);
  assert.deepEqual(
    printed(probing).map((at) => at >= 0),
    [true, false, false, false],
    'the probes are read second, after the size',
  );

  const unopened = run(signed, {}, [...passing(repo).filter((rule) => rule.when !== 'pr list'), { when: 'pr list', out: '[]' }]);
  assert.notEqual(unopened.code, 0, unopened.out);
  assert.match(unopened.err, /no open pull request has wf\/r-1\/run as its head/);
  assert.deepEqual(
    printed(unopened).map((at) => at >= 0),
    [true, true, false, false],
    'the branch is pushed third, after the probes are read',
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
    [true, true, true, false],
    'CI is waited on last',
  );
  for (const refused of [probing, unopened, red]) assert.deepEqual(refused.said, []);
});

test('a change is counted in lines added plus removed, and none of them refuses it', () => {
  const made = based({ 'old.ts': lines(MANY + 5, 'old') });
  fs.rmSync(path.join(made.repo, 'old.ts'));
  commit(made.repo, { 'old.ts': lines(5, 'old'), 'new.ts': lines(MANY, 'new') }, 'work');
  const counted = change(made.repo, made.base, 'size');
  assert.equal(counted.code, 0, counted.err);
  assert.equal(counted.out, `nemia size: 2 files, ${2 * MANY} lines\n`, 'removed lines count');
  assert.equal(counted.err, '');
});

test('a change of many files passes: the count of files is said, and refuses nothing', () => {
  const many = workOn(files(MANY));
  const passed = change(many.repo, many.base, 'size');
  assert.equal(passed.code, 0, passed.err);
  assert.equal(passed.out, `nemia size: ${MANY} files, ${MANY} lines\n`);
});

/** What a repository marks generated, as git reads it: one path set, one true. */
const MARKED = { '.gitattributes': 'apps/web/theme/** linguist-generated\n*.gen.ts linguist-generated=true\n' };

test('a generated file counts for nothing — the lockfile, and what the repository marks linguist-generated — and a test or a doc counts as any file', () => {
  const made = {
    'package-lock.json': lines(5000),
    'apps/web/theme/tokens.css': lines(5000),
    'apps/web/src/routeTree.gen.ts': lines(5000),
  };
  const beside = workOn({ ...made, 'src/a.ts': 'export const a = 1;\n' }, MARKED);
  const passed = change(beside.repo, beside.base, 'size');
  assert.equal(passed.code, 0, passed.err);
  assert.equal(passed.out, `nemia size: 1 files, 1 lines\n`);
  for (const counted of ['packages/x/test/a.test.ts', 'docs/a.md', 'apps/web/src/routeTree.ts', 'apps/web/themes/a.css']) {
    const { repo, base } = workOn({ [counted]: lines(MANY) }, MARKED);
    assert.equal(change(repo, base, 'size').out, `nemia size: 1 files, ${MANY} lines\n`, `${counted} counts`);
  }
});

test('the measure is the net change: a line added then removed is none, and a renamed file is one file of no line', () => {
  const undone = workOn({ 'a.ts': lines(MANY) });
  fs.rmSync(path.join(undone.repo, 'a.ts'));
  commit(undone.repo, {}, 'take it back');
  assert.equal(change(undone.repo, undone.base, 'size').out, 'nemia size: 0 files, 0 lines\n');

  const moved = based({ 'a.ts': lines(MANY) });
  git(moved.repo, 'mv', 'a.ts', 'b.ts');
  commit(moved.repo, {}, 'rename');
  assert.equal(change(moved.repo, moved.base, 'size').out, 'nemia size: 1 files, 0 lines\n');
});

test('REFUSED otherwise: a branch that merged a newer base is measured on its own change, from the base it merged last', () => {
  const { repo, base } = workOn({ 'mine.ts': 'export const mine = 1;\n' });
  git(repo, 'checkout', '-q', 'main');
  commit(repo, { 'theirs.ts': lines(MANY, 'theirs') }, 'the base moves');
  git(repo, 'checkout', '-q', BRANCH);
  git(repo, 'merge', '-q', '--no-ff', '-m', 'merge the base', 'main');
  commit(repo, { 'more.ts': 'export const more = 1;\n' }, 'after the merge');
  const measured = change(repo, base, 'size');
  assert.equal(measured.code, 0, measured.err);
  assert.equal(measured.out, 'nemia size: 2 files, 2 lines\n');
  assert.equal(git(repo, 'diff', '--numstat', base, 'HEAD').includes(`${MANY}\t0\ttheirs.ts`), true, 'which the first base would not');
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
    assert.equal(unknown.err, `nemia change: usage: node change.ts size, not "${verb}"\n`);
    assert.equal(unknown.out, '');
    assert.deepEqual(unknown.said, [], 'nothing is started');
  }
});

/** The wait's flag, which a carried README, never rendered, says as `wait --check <name>`. */
const WAIT_FLAG = '(?:\\s+--check\\s+<name>)?';

test("REFUSED: a note or a README that says a bound on the size, or other clauses than the check's", () => {
  const said = (file: string): string => fs.readFileSync(path.join(QUICK, file), 'utf8');
  const bound = /at\s+most\s+(?:\*\*)?\d+\s+(?:lines|files)/;
  assert.match('a change of at most **300 lines** changed', bound, 'a bound in the words the notes once said is caught');
  for (const file of ['implement.md', 'review.md', 'README.md']) assert.doesNotMatch(said(file), bound, `${file} bounds no size`);
  const check = CHECK;
  const clauses = [...check.matchAll(/node\s+"\$WF_WORKFLOW_FILES\/([\w-]+\.ts)"\s+(size|tests|pages|push|wait)?/g)].map(
    ([, script, verb]) => (verb ? `${script} ${verb}` : script),
  );
  assert.deepEqual(clauses, ['change.ts size', 'probe.ts', 'pull-request.ts push', 'pull-request.ts wait']);
  assert.doesNotMatch(check, /\bnpm\b|\bnpx\b/);
  const ticked = clauses.map(
    (clause, i) => `\`${clause.replace('.', '\\.').replace(' ', '\\s+')}${i === clauses.length - 1 ? WAIT_FLAG : ''}\``,
  );
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
    .map((entry) => entry.trim().slice(1, -1))
    .concat('linguist-generated'))
    for (const file of ['implement.md', 'README.md']) assert.ok(said(file).includes(`\`${made}\``), `${file} names ${made}`);
});

/**
 * sdlc's quick workflow's own check script (`sdlc/workflows/quick/change.ts`), run as the check runs it: `node change.ts <verb>` in a
 * committed scratch repository whose base is `WF_BASE_REF`, a bounded subprocess, with `npx` and `npm` stubs first on the path that
 * record what they are handed. The script says the size and refuses none, and quick's implement check, as sdlc renders it for a
 * factory (`nemia factory apply` and the controller on a scratch store), is run whole as the run runs a check (`checkArgv`), so the
 * measure is proven wired and first: from the run's frozen workflow files (`WF_WORKFLOW_FILES`, here the rendered folder) and carried
 * files (`WF_CARRIED_FILES`, the rendered carried folder) on a base that holds none of the team, and refused, never read from the base,
 * where the variable is unset.
 *
 * Its `origin` is a bare repository and its `gh` a stub (`test/origin.ts`), for the two clauses that push the branch and read CI on
 * GitHub (`github=true`); at sdlc's default, in the checkout, the check runs the local check in their place, and pushes nothing.
 *
 * Its subject is git and a spawned script: a boundary file.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadWorkflows } from 'agent-orchestrator';
import { checkArgv } from 'agent-orchestrator/run';
import { scratch } from 'test-kit/scratch';
import { copyOf, rendered } from './template.ts';
import { type Rule, bareOrigin, ghIn, passing, rollup } from './origin.ts';

/** The template these scripts ship in. */
const SDLC = path.join(import.meta.dirname, '..', 'sdlc');

const QUICK = path.join(SDLC, 'workflows', 'quick');

const SCRIPT = path.join(QUICK, 'change.ts');

/** The carried folder, where the scripts quick runs beside its own are kept once. */
const CARRIED = path.join(SDLC, 'carried');

/** sdlc as a factory gets it: the factory's rendered tree, and the scratch store it is in. */
type Rendered = { tree: string; store: string };

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

/** The scripts a run's base could hold, which the check never reads from it: quick's `change.ts` and the carried scripts, each where
 * the template keeps it and at the base's root. */
const SCRIPTS = Object.fromEntries([
  ['workflows/quick/change.ts', fs.readFileSync(SCRIPT, 'utf8')],
  ['change.ts', fs.readFileSync(SCRIPT, 'utf8')],
  ...fs.readdirSync(CARRIED).flatMap((name) => {
    const text = fs.readFileSync(path.join(CARRIED, name), 'utf8');
    return [
      [`carried/${name}`, text],
      [name, text],
    ];
  }),
]);

/**
 * The four ways the tests render sdlc, applied on one scratch store and rendered by one `nemia up` (`rendered`), each over a repository
 * of its own: `sdlc`, on GitHub, its other parameters at their defaults; `checkout`, at its default way, in the checkout, its local check
 * a stub's name; and `github` and `local`, the two ways again with a check of the factory's own, a stub's name handed the run's id.
 */
const OWN_COMMAND = 'own-check "$WF_RUN"';
const TREES = await (async () => {
  const all = await rendered([
    { name: 'sdlc', template: copyOf(SDLC), sets: ['github=true'] },
    { name: 'checkout', template: copyOf(SDLC), sets: ['localCheck=local-check'] },
    { name: 'github', template: copyOf(SDLC), sets: ['github=true', `implementCheck=${OWN_COMMAND}`] },
    { name: 'local', template: copyOf(SDLC), sets: ['localCheck=local-check', `implementCheck=${OWN_COMMAND}`] },
  ]);
  const treeOf = (name: 'sdlc' | 'checkout' | 'github' | 'local'): Rendered => {
    const at = all[name];
    assert.ok(at?.tree, `${name} was rendered: ${JSON.stringify(at?.conditions)}`);
    return { tree: at.tree, store: at.store };
  };
  return { sdlc: treeOf('sdlc'), checkout: treeOf('checkout'), github: treeOf('github'), local: treeOf('local') };
})();

/** sdlc rendered for a factory on GitHub, and quick's folder and the carried one in it: what a run freezes as its two variables. */
const RENDERED = TREES.sdlc;
const FROZEN = {
  WF_WORKFLOW_FILES: path.join(RENDERED.tree, 'workflows', 'quick'),
  WF_CARRIED_FILES: path.join(RENDERED.tree, 'workflows', 'carried'),
};

/** Quick's implement check, as the rendered tree gives it to a run. */
const CHECK = stepsOf(RENDERED, 'quick').find((step) => step.name === 'implement')?.check ?? '';

/** sdlc rendered at its default way, in the checkout, and quick's folder and implement check in it. */
const LOCAL = TREES.checkout;
const LOCAL_FROZEN = {
  WF_WORKFLOW_FILES: path.join(LOCAL.tree, 'workflows', 'quick'),
  WF_CARRIED_FILES: path.join(LOCAL.tree, 'workflows', 'carried'),
};
const LOCAL_CHECK = stepsOf(LOCAL, 'quick').find((step) => step.name === 'implement')?.check ?? '';

/** sdlc rendered with a check of the factory's own, on GitHub and in the checkout. */
const OWN_RENDERED = { github: TREES.github, local: TREES.local };

/** Where a rendered check `check` branches on its way: what runs before, the GitHub branch, and the local one (`; else …`). */
function waysOf(check: string): { before: string; github: string; local: string } {
  const opens = /if \[ "(?:true|false)" = true \]; then /.exec(check);
  assert.ok(opens, `the check branches on its way:\n${check}`);
  const otherwise = check.lastIndexOf('; else { ');
  assert.ok(otherwise > opens.index, `and has a local branch last:\n${check}`);
  return {
    before: check.slice(0, opens.index),
    github: check.slice(opens.index + opens[0].length, otherwise),
    local: check.slice(otherwise),
  };
}

/**
 * Run the rendered check of quick's implement in `repo` as a check runs, its argv `checkArgv`'s, over the stubs, which exit as
 * `failing` says; `files` is the step's files directory, one of its own where none is given, and `more` is the rest of its environment:
 * the run's frozen workflow and carried files, the rendered quick and carried folders, unless it says otherwise.
 */
function shipped(
  repo: string,
  base: string,
  closeout: Record<string, unknown> = { plan: 'p' },
  failing: Failing = {},
  files = scratch('wf-quick-files-'),
  rules?: readonly Rule[],
  more: Record<string, string> = FROZEN,
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

test("REFUSED at shipped defaults: implement's check, as rendered, runs its five clauses in order, refuses on each one's refusal, and runs no npm or npx", () => {
  const { repo, base } = workOn({ 'apps/api/src/a.ts': 'x\n', 'apps/web/src/routes/x.tsx': 'export const x = 1;\n' });
  const files = scratch('wf-quick-files-');
  const signed = { plan: 'p' };
  const run = (closeout: Record<string, unknown>, failing: Failing = {}, rules?: readonly Rule[]): Ran =>
    shipped(repo, base, closeout, { ...UNRUNNABLE, ...failing }, files, rules);
  const PRINTS = [
    /nemia size: 2 files, 2 lines/,
    /no live probe of run r-1/,
    /nemia parts: run r-1 has no branch but/,
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
    [true, false, false, false, false],
    'the probes are read second, after the size',
  );

  git(repo, 'branch', 'wf/r-1/p1', base);
  git(repo, 'checkout', '-q', 'wf/r-1/p1');
  commit(repo, { 'b.ts': 'an earlier cut\n' }, 'p1: b.ts');
  git(repo, 'checkout', '-q', BRANCH);
  const unsettled = run(signed);
  assert.notEqual(unsettled.code, 0, unsettled.out);
  assert.match(unsettled.err, /nemia parts: `wf\/r-1\/p1`/);
  assert.deepEqual(
    printed(unsettled).map((at) => at >= 0),
    [true, true, false, false, false],
    'the parts are read third, after the probes, and a part left out refuses before anything is pushed',
  );
  git(repo, 'branch', '-D', 'wf/r-1/p1');

  const unopened = run(signed, {}, [...passing(repo).filter((rule) => rule.when !== 'pr list'), { when: 'pr list', out: '[]' }]);
  assert.notEqual(unopened.code, 0, unopened.out);
  assert.match(unopened.err, /no open pull request has wf\/r-1\/run as its head/);
  assert.deepEqual(
    printed(unopened).map((at) => at >= 0),
    [true, true, true, false, false],
    'the branch is pushed fourth, after the parts are read',
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
  for (const refused of [probing, unsettled, unopened, red]) assert.deepEqual(refused.said, []);
});

test("REFUSED at shipped defaults, in the checkout: implement's check runs the size, the probes, the parts and the local check, in that order, pushes nothing and calls no gh", () => {
  const { repo, base } = workOn({ 'src/a.ts': 'x\n' });
  const bareTip = (): string => execFileSync('git', ['-C', repo, 'ls-remote', 'origin'], { encoding: 'utf8' });
  const run = (exit: number): Ran => {
    const { bin, said } = stubs();
    fs.writeFileSync(path.join(bin, 'local-check'), `#!/bin/sh\necho "local check ran"\nexit ${exit}\n`, { mode: 0o755 });
    fs.writeFileSync(path.join(bin, 'gh'), `#!/bin/sh\nprintf '%s\\n' "gh $*" >> '${path.join(bin, 'said.log')}'\nexit 1\n`, {
      mode: 0o755,
    });
    const [cmd, ...args] = checkArgv(LOCAL_CHECK);
    const ran = spawnSync(cmd, args, {
      cwd: repo,
      env: envOf(repo, base, bin, { WF_CLOSEOUT: closeoutFile({ plan: 'p' }), ...LOCAL_FROZEN }),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000,
    });
    return { code: ran.status, out: ran.stdout, err: ran.stderr, said: said() };
  };
  const PRINTS = [/nemia size: 1 files, 1 lines/, /no live probe of run r-1/, /nemia parts: run r-1 has no branch but/, /local check ran/];
  const printed = (ran: Ran): number[] => PRINTS.map((line) => ran.out.search(line));

  const passed = run(0);
  assert.equal(passed.code, 0, passed.out + passed.err);
  assert.ok(
    printed(passed).every((at, i, all) => at >= 0 && (i === 0 || at > (all[i - 1] ?? -1))),
    `each clause prints its line, in order:\n${passed.out}`,
  );
  assert.deepEqual(passed.said, [], 'no gh, no npm, no npx');
  assert.equal(bareTip(), '', 'and nothing is pushed');

  const red = run(3);
  assert.notEqual(red.code, 0, red.out);
  assert.deepEqual(
    printed(red).map((at) => at >= 0),
    [true, true, true, true],
    'a failing local check refuses, after the size, the probes and the parts',
  );
  assert.equal(bareTip(), '');
});

test("the factory's own check, set, runs after the parts and before the push or the local check, either way, and its refusal pushes nothing", () => {
  const bareTip = (repo: string): string => execFileSync('git', ['-C', repo, 'ls-remote', 'origin'], { encoding: 'utf8' });
  const run = ({ repo, base }: { repo: string; base: string }, way: keyof typeof OWN_RENDERED, exit: number): Ran => {
    const { bin, said } = stubs();
    for (const [name, line] of [
      ['own-check', 'own check ran for $1'],
      ['local-check', 'local check ran'],
    ] as const)
      fs.writeFileSync(path.join(bin, name), `#!/bin/sh\necho "${line}"\nexit ${name === 'own-check' ? exit : 0}\n`, { mode: 0o755 });
    const gh = ghIn(bin, passing(repo));
    const check = stepsOf(OWN_RENDERED[way], 'quick').find((step) => step.name === 'implement')?.check ?? '';
    const [cmd, ...args] = checkArgv(check);
    const ran = spawnSync(cmd, args, {
      cwd: repo,
      env: envOf(repo, base, bin, {
        ...gh.env(),
        WF_CLOSEOUT: closeoutFile({ plan: 'p' }),
        WF_CI_POLL_SECONDS: '0',
        WF_WORKFLOW_FILES: path.join(OWN_RENDERED[way].tree, 'workflows', 'quick'),
        WF_CARRIED_FILES: path.join(OWN_RENDERED[way].tree, 'workflows', 'carried'),
      }),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000,
    });
    return { code: ran.status, out: ran.stdout, err: ran.stderr, said: said() };
  };
  const ahead = [
    /nemia size: 1 files, 1 lines/,
    /no live probe of run r-1/,
    /nemia parts: run r-1 has no branch but/,
    /own check ran for r-1/,
  ];
  const PRINTS = {
    github: [...ahead, /nemia pr: #7 is at [0-9a-f]{12}, the commit this check judges/, /nemia ci: `ci` passed on/],
    local: [...ahead, /local check ran/],
  };
  for (const way of ['github', 'local'] as const) {
    const printed = (ran: Ran): number[] => PRINTS[way].map((line) => ran.out.search(line));
    const made = workOn({ 'src/a.ts': 'x\n' });
    const passed = run(made, way, 0);
    assert.equal(passed.code, 0, passed.out + passed.err);
    assert.ok(
      printed(passed).every((at, i, all) => at >= 0 && (i === 0 || at > (all[i - 1] ?? -1))),
      `${way}: each clause prints its line, in order:\n${passed.out}`,
    );
    if (way === 'local') assert.equal(bareTip(made.repo), '', 'in the checkout nothing is pushed');
  }
  for (const way of ['github', 'local'] as const) {
    const made = workOn({ 'src/a.ts': 'x\n' });
    const refused = run(made, way, 3);
    assert.notEqual(refused.code, 0, `${way}: ${refused.out}`);
    assert.deepEqual(
      PRINTS[way].map((line) => refused.out.search(line) >= 0),
      PRINTS[way].map((_, i) => i < ahead.length),
      `${way}: its refusal stops the check after it, before the push or the local check:\n${refused.out}`,
    );
    assert.equal(bareTip(made.repo), '', `${way}: and nothing is pushed`);
  }
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

/** The line each refusal of `change.ts` ends with: none is the work's, so a try retried on its own changes nothing and stops. */
const NOT_THE_WORK = /^nemia change: not the work: /m;

test('REFUSED: no base to measure from, and a verb the script has not', () => {
  const { repo, base } = workOn(files(1));
  const { bin } = stubs();
  const { WF_BASE_REF: _unset, ...env } = envOf(repo, base, bin);
  const unbased = spawnSync(process.execPath, [SCRIPT, 'size'], { cwd: repo, env, encoding: 'utf8', timeout: 60_000 });
  assert.equal(unbased.status, 1);
  assert.match(unbased.stderr, /WF_BASE_REF is not set/);
  assert.match(unbased.stderr, NOT_THE_WORK, "a run's environment is a person's");
  const gone = change(repo, 'no-such-commit', 'size');
  assert.equal(gone.code, 1);
  assert.match(gone.err, /cannot tell where the work began/);
  for (const verb of ['trim', 'tests', 'pages']) {
    const unknown = change(repo, base, verb, closeoutFile({ pages: ['runs'] }));
    assert.equal(unknown.code, 1, verb);
    assert.ok(unknown.err.startsWith('nemia change: ') && unknown.err.includes(JSON.stringify(verb)), `naming the verb:\n${unknown.err}`);
    assert.match(unknown.err, NOT_THE_WORK, `${verb}: the check line is a person's`);
    assert.equal(unknown.out, '');
    assert.deepEqual(unknown.said, [], 'nothing is started');
  }
});

/** The factory's own check as a note or a README names it: by its parameter, and in a note its rendered value. */
const OWN_SAID =
  "the\\s+factory's\\s+own\\s+check,\\s+its\\s+`implementCheck`\\s+parameter(?:\\s+\\(`\\$\\{\\{ parameters\\.implementCheck \\}\\}`;\\s+`true`\\s+checks\\s+nothing\\))?";

/** The wait's flag, which a carried README, never rendered, says as `wait --check <name>`. */
const WAIT_FLAG = '(?:\\s+--check\\s+<name>)?';

test("REFUSED: a note or a README that says a bound on the size, or other clauses than the check's", () => {
  const said = (file: string): string => fs.readFileSync(path.join(QUICK, file), 'utf8');
  const bound = /at\s+most\s+(?:\*\*)?\d+\s+(?:lines|files)/;
  assert.match('a change of at most **300 lines** changed', bound, 'a bound in the words the notes once said is caught');
  for (const file of ['implement.md', 'review.md', 'README.md']) assert.doesNotMatch(said(file), bound, `${file} bounds no size`);
  const { before, github, local } = waysOf(CHECK);
  const check = before + github;
  const clauses = [
    ...check.matchAll(/node\s+"\$\{WF_(?:WORKFLOW|CARRIED)_FILES:\?[^}]*\}\/([\w-]+\.ts)"\s+(size|tests|pages|push|wait)?/g),
  ].map(([, script, verb]) => (verb ? `${script} ${verb}` : script));
  assert.deepEqual(clauses, ['change.ts size', 'probe.ts', 'parts.ts', 'pull-request.ts push', 'pull-request.ts wait']);
  assert.doesNotMatch(check, /\bnpm\b|\bnpx\b/);
  assert.equal(local, '; else { npm run --if-present lint && npm run --if-present typecheck && npm run --if-present test; }; fi');
  const ahead = [...before.matchAll(/node\s+"\$\{WF_(?:WORKFLOW|CARRIED)_FILES:\?[^}]*\}\/([\w-]+\.ts)"\s+(size)?/g)].map(
    ([, script, verb]) => (verb ? `${script} ${verb}` : script),
  );
  assert.deepEqual(
    ahead,
    ['change.ts size', 'probe.ts', 'parts.ts'],
    'in the checkout, the size, the probes and the parts run before the local check',
  );
  assert.ok(before.endsWith('{ true; } && '), `and the factory's own check, \`true\` by default, runs after them:\n${before}`);
  const runsHere = new RegExp(
    `runs\\s+${ahead.map((clause) => `\`${clause.replace('.', '\\.').replace(' ', '\\s+')}\``).join(',\\s+')},\\s+${OWN_SAID},?\\s+and\\s+the\\s+local\\s+check,\\s+in\\s+that\\s+order,\\s+and\\s+nothing\\s+else`,
  );
  const ticked = clauses.map(
    (clause, i) => `\`${clause.replace('.', '\\.').replace(' ', '\\s+')}${i === clauses.length - 1 ? WAIT_FLAG : ''}\``,
  );
  const runs = new RegExp(
    `runs\\s+${ticked.slice(0, ahead.length).join(',\\s+')},\\s+${OWN_SAID},\\s+${ticked.slice(ahead.length, -1).join(',\\s+')}\\s+and\\s+${ticked.at(-1)},\\s+in\\s+that\\s+order,\\s+and\\s+nothing\\s+else`,
  );
  for (const file of ['implement.md', 'README.md']) {
    assert.match(said(file), runs, `${file} says what the check runs`);
    assert.doesNotMatch(said(file).replace(/`probe\.ts`,\s+`parts\.ts`,/g, '`probe.ts`, `parts.ts`, `change.ts tests`,'), runs);
    assert.match(said(file), runsHere, `${file} says what the check runs in the checkout`);
    assert.doesNotMatch(said(file).replace(/`parts\.ts`,/g, '`parts.ts`, `change.ts tests`,'), runsHere);
  }
  for (const made of /const GENERATED = \[([^\]]*)\];/
    .exec(TEXT)![1]
    .split(',')
    .map((entry) => entry.trim().slice(1, -1))
    .concat('linguist-generated'))
    for (const file of ['implement.md', 'README.md']) assert.ok(said(file).includes(`\`${made}\``), `${file} names ${made}`);
});

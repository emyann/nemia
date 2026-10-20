/**
 * The build workflow's probe door (`workflows/build/probe.ts`): a session a step starts to measure something is named for its run, says
 * in its first message whether the person must act, runs in the machinery's trusted folder, reaches the person's phone (Remote Control)
 * only when it asks for an answer, and is refused by implement's check while it is live. Driven as a step and the check drive it, in a
 * scratch repository on a run's branch, with a stub `claude` first on the PATH that records each call and lists the rows it is given,
 * a scratch `HOME` and `WF_ROOT`, each a bounded subprocess; and the shipped check of `workflows/build/implement.md` is run whole, as
 * frozen, with `npm` stubbed and the pull request's world stood up (`test/origin.ts`), so the clause is proven wired and not only
 * written.
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
import { bareOrigin, ghIn, passing } from './origin.ts';

const BUILD = path.join(REPO, 'workflows', 'build');

const SCRIPT = path.join(BUILD, 'probe.ts');

/** A call the stub `claude` was given: its folder and its arguments. */
type Called = { cwd: string; argv: string[] };

/** The stub `claude`: records each call in `STUB_LOG`, prints `STUB_ROWS` for a listing, and exits `STUB_EXIT` (0 by default). */
const STUB = `#!${process.execPath}
const fs = require('node:fs');
const argv = process.argv.slice(2);
fs.appendFileSync(process.env.STUB_LOG, JSON.stringify({ cwd: process.cwd(), argv }) + '\\n');
if (argv[0] === 'agents') process.stdout.write(fs.readFileSync(process.env.STUB_ROWS, 'utf8'));
process.exitCode = Number(process.env.STUB_EXIT ?? 0);
`;

/** Run git in `dir`, as nobody in particular. */
const git = (dir: string, ...args: string[]): string =>
  execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

/** A place to probe from: a scratch repository on `branch`, a home, a store and a stub `claude` listing `rows`; trusted unless not. */
function placed({ branch = 'wf/r-1/implement', rows = [] as unknown[], trust = true } = {}): {
  repo: string;
  home: string;
  probes: string;
  log: string;
  rowsFile: string;
  bin: string;
} {
  const repo = scratch('wf-probe-repo-');
  git(repo, 'init', '-q', '-b', branch);
  const home = scratch('wf-probe-home-');
  const probes = path.join(home, 'store', 'probes');
  if (trust)
    fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ projects: { [probes]: { hasTrustDialogAccepted: true } } }));
  const bin = scratch('wf-probe-bin-');
  fs.writeFileSync(path.join(bin, 'claude'), STUB, { mode: 0o755 });
  const log = path.join(home, 'calls.jsonl');
  const rowsFile = path.join(home, 'rows.json');
  fs.writeFileSync(rowsFile, JSON.stringify(rows));
  return { repo, home, probes, log, rowsFile, bin };
}

/** The environment a probe runs in at `at`, `more` over it. */
const envAt = (at: ReturnType<typeof placed>, more: Record<string, string> = {}): NodeJS.ProcessEnv => ({
  PATH: `${at.bin}${path.delimiter}${process.env.PATH ?? ''}`,
  HOME: at.home,
  WF_ROOT: path.join(at.home, 'store'),
  STUB_LOG: at.log,
  STUB_ROWS: at.rowsFile,
  ...more,
});

/** Run the script at `at` with `args`, bounded; its exit, streams and the calls the stub `claude` was given. */
function probe(
  at: ReturnType<typeof placed>,
  args: string[],
  more: Record<string, string> = {},
): { code: number | null; out: string; err: string; calls: Called[] } {
  const ran = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: at.repo, env: envAt(at, more), encoding: 'utf8', timeout: 60_000 });
  const lines = fs.existsSync(at.log) ? fs.readFileSync(at.log, 'utf8').split('\n').filter(Boolean) : [];
  return { code: ran.status, out: ran.stdout, err: ran.stderr, calls: lines.map((line) => JSON.parse(line) as Called) };
}

/** A listed background session, as `claude agents --all --json` gives one. */
const row = (name: string, state: string, id = 'abcd1234'): Record<string, unknown> => ({
  id,
  name,
  state,
  kind: 'background',
  sessionId: `${id}-0000-0000-0000-000000000000`,
  cwd: '/x',
});

test('a probe is named for its run, runs in the trusted probe folder, says no action is needed, and reaches no phone', () => {
  const at = placed();
  const r = probe(at, ['start', 'waits', '--', 'Run `ls` and say what it printed.']);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.calls.length, 1);
  const [{ cwd, argv }] = r.calls;
  assert.equal(fs.realpathSync(cwd), fs.realpathSync(at.probes), 'it runs in $WF_ROOT/probes');
  assert.deepEqual(argv.slice(0, 3), ['--bg', '--name', 'r-1-probe-waits']);
  assert.ok(!argv.some((arg) => arg.includes('remote-control')), argv.join(' '));
  const prompt = argv.at(-1)!;
  assert.ok(prompt.startsWith('[nemia probe] run r-1: no action needed.'), prompt);
  assert.ok(prompt.endsWith('Run `ls` and say what it printed.'), prompt);
  assert.match(r.out, /r-1-probe-waits started, no Remote Control/);
});

test('a probe that needs an answer says what to press first, uses Remote Control, and prints the needs line the step stops on', () => {
  const at = placed();
  const settings = path.join(at.home, 'probe-settings.json');
  const r = probe(at, ['start', 'asks', '--answer', 'press Yes on the Bash prompt', '--settings', settings, '--', 'Run `probe a`.']);
  assert.equal(r.code, 0, r.err);
  const [{ argv }] = r.calls;
  assert.deepEqual(argv.slice(0, 6), ['--bg', '--remote-control', '--name', 'r-1-probe-asks', '--settings', settings]);
  assert.ok(argv.at(-1)!.startsWith('[nemia probe] run r-1: action needed — press Yes on the Bash prompt.'), argv.at(-1));
  assert.match(r.out, /Stop `blocked` now/);
  assert.match(r.out, /Answer the probe session r-1-probe-asks .*: press Yes on the Bash prompt\. Then retry the step\./);
});

test('REFUSED: a probe from a branch that is no run, with a label that names no probe, or in a folder Claude Code has not trusted; claude never called', () => {
  const off = placed({ branch: 'main' });
  const branch = probe(off, ['start', 'a', '--', 'p']);
  assert.equal(branch.code, 1);
  assert.match(branch.err, /the branch here is `main`, not a run's `wf\/<run>\/<step>`/);
  assert.deepEqual(branch.calls, []);
  const at = placed();
  for (const label of ['A', 'a-b', '']) {
    const bad = probe(at, ['start', label, '--', 'p']);
    assert.equal(bad.code, 1, label);
    assert.match(bad.err, /is not lower-case letters and digits/);
  }
  const unknown = probe(at, ['start', 'a', '--remote-control', 'x', '--', 'p']);
  assert.equal(unknown.code, 1);
  assert.match(unknown.err, /`--remote-control` is not an option of start/);
  assert.deepEqual(probe(at, []).calls, []);
  const untrusted = placed({ trust: false });
  const r = probe(untrusted, ['start', 'a', '--', 'p']);
  assert.equal(r.code, 1);
  assert.ok(r.err.includes(`Claude Code has not trusted ${untrusted.probes}`), r.err);
  assert.ok(r.err.includes(`cd ${untrusted.probes} && claude`), 'names the one command a person runs');
  assert.deepEqual(r.calls, []);
  assert.ok(!fs.existsSync(path.join(untrusted.home, '.claude.json')), 'trust is read, never written');
});

test('the trust is read from CLAUDE_CONFIG_DIR when it is set', () => {
  const at = placed({ trust: false });
  const config = scratch('wf-probe-config-');
  fs.writeFileSync(path.join(config, '.claude.json'), JSON.stringify({ projects: { [at.probes]: { hasTrustDialogAccepted: true } } }));
  assert.equal(probe(at, ['start', 'a', '--', 'p'], { CLAUDE_CONFIG_DIR: config }).code, 0);
});

test('list and stop read and stop only the live probes of this run', () => {
  const rows = [
    row('r-1-probe-a', 'blocked', 'aaaa0001'),
    row('r-1-probe-b', 'stopped', 'aaaa0002'),
    row('r-12-probe-a', 'working', 'aaaa0003'),
    row('r-1-probe-x-y', 'working', 'aaaa0004'),
    row('someone else', 'working', 'aaaa0005'),
  ];
  const at = placed({ rows });
  const listed = probe(at, ['list']);
  assert.equal(listed.code, 0, listed.err);
  assert.deepEqual(listed.out.trim().split('\n'), ['wf probe: r-1-probe-a blocked aaaa0001', 'wf probe: r-1-probe-b stopped aaaa0002']);
  fs.rmSync(at.log);
  const stopped = probe(at, ['stop']);
  assert.equal(stopped.code, 0, stopped.err);
  assert.deepEqual(
    stopped.calls.map((call) => call.argv),
    [
      ['agents', '--all', '--json'],
      ['stop', 'aaaa0001'],
    ],
  );
});

test('stop with a label stops only the live probe it names, and none for a label no live probe has', () => {
  const at = placed({ rows: [row('r-1-probe-a', 'working', 'aaaa0001'), row('r-1-probe-b', 'blocked', 'bbbb0002')] });
  const named = probe(at, ['stop', 'b']);
  assert.equal(named.code, 0, named.err);
  assert.deepEqual(
    named.calls.map((call) => call.argv),
    [
      ['agents', '--all', '--json'],
      ['stop', 'bbbb0002'],
    ],
  );
  assert.deepEqual(named.out.trim().split('\n'), ['wf probe: stopped r-1-probe-b']);
  fs.rmSync(at.log);
  const none = probe(at, ['stop', 'c']);
  assert.equal(none.code, 0, none.err);
  assert.deepEqual(
    none.calls.map((call) => call.argv),
    [['agents', '--all', '--json']],
  );
  assert.deepEqual(none.out.trim().split('\n'), ['wf probe: no live probe of run r-1 named c']);
});

test("REFUSED: the check, while a probe of the run is live, naming stop; it passes when it is stopped, done or failed, and on another run's", () => {
  const live = placed({ rows: [row('r-1-probe-a', 'blocked'), row('r-2-probe-a', 'working')] });
  const refused = probe(live, ['check'], { WF_RUN: 'r-1' });
  assert.equal(refused.code, 1, refused.out);
  assert.match(refused.err, /a probe of run r-1 is still live/);
  assert.match(refused.err, /r-1-probe-a blocked/);
  assert.match(refused.err, /node workflows\/build\/probe\.ts stop/);
  assert.ok(!refused.err.includes('r-2-probe-a'), refused.err);
  for (const state of ['stopped', 'done', 'failed']) {
    const ended = probe(placed({ rows: [row('r-1-probe-a', state), row('r-2-probe-a', 'working')] }), ['check'], { WF_RUN: 'r-1' });
    assert.equal(ended.code, 0, `${state}: ${ended.err}`);
    assert.match(ended.out, /no live probe of run r-1/);
  }
  const other = probe(placed({ rows: [row('r-1-probe-a', 'working')] }), ['check'], { WF_RUN: 'r-12' });
  assert.equal(other.code, 0, other.err);
});

test('REFUSED: the check with no run named, or a listing claude cannot give; no claude on the PATH is no probe', () => {
  const at = placed();
  const unnamed = probe(at, ['check'], { WF_RUN: '' });
  assert.equal(unnamed.code, 1);
  assert.match(unnamed.err, /WF_RUN is not set/);
  const failed = probe(at, ['check'], { WF_RUN: 'r-1', STUB_EXIT: '3' });
  assert.equal(failed.code, 1);
  assert.match(failed.err, /cannot tell which probes are live/);
  const none = spawnSync(process.execPath, [SCRIPT, 'check'], {
    cwd: at.repo,
    env: { PATH: scratch('wf-probe-empty-'), HOME: at.home, WF_RUN: 'r-1' },
    encoding: 'utf8',
    timeout: 60_000,
  });
  assert.equal(none.status, 0, none.stderr);
});

/** The shipped implement step's check, read from the folder as `nemia start` reads and freezes it. */
const implementCheck = (): string => {
  const check = loadWorkflows(BUILD, placesOf(BUILD)).find((step) => step.name === 'implement')?.check;
  assert.equal(typeof check, 'string', 'workflows/build has an implement step with a check');
  return check as string;
};

/** A scratch repository whose base commit holds `files`, one commit on: the repository and the base's commit. */
function based(files: Record<string, string>): { repo: string; base: string } {
  const repo = scratch('wf-probe-check-');
  git(repo, 'init', '-q', '-b', 'wf/r-1/implement');
  for (const [name, text] of Object.entries({ 'README.md': 'base\n', ...files })) {
    fs.mkdirSync(path.dirname(path.join(repo, name)), { recursive: true });
    fs.writeFileSync(path.join(repo, name), text);
  }
  git(repo, 'add', '-A');
  git(repo, 'commit', '-qm', 'base');
  const base = git(repo, 'rev-parse', 'HEAD').trim();
  git(repo, 'commit', '-q', '--allow-empty', '-m', 'work');
  bareOrigin(repo);
  return { repo, base };
}

test("REFUSED at shipped defaults: implement's check, as frozen, refuses a live probe of its run and passes once it is stopped", () => {
  const scripts = Object.fromEntries(
    ['mutants.ts', 'pictures.ts', 'probe.ts', 'pull-request.ts'].map((name) => [
      `workflows/build/${name}`,
      fs.readFileSync(path.join(BUILD, name), 'utf8'),
    ]),
  );
  const { repo, base } = based(scripts);
  const closeout = path.join(scratch('wf-probe-closeout-'), 'closeout.json');
  fs.writeFileSync(closeout, JSON.stringify({ outcome: 'done', summary: 's', artifacts: [], mutants: [], noMutants: 'a fixture' }));
  const at = placed({ rows: [row('r-1-probe-a', 'blocked')] });
  fs.writeFileSync(path.join(at.bin, 'npm'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const gh = ghIn(at.bin, passing(repo));
  const run = (more: Record<string, string>) => {
    const [cmd, ...args] = checkArgv(implementCheck());
    const env = { ...envAt(at), ...gh.env(), TMPDIR: scratch('wf-probe-tmp-'), WF_RUN: 'r-1', WF_CLOSEOUT: closeout, ...more };
    const r = spawnSync(cmd, args, { cwd: repo, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  };
  const refused = run({ WF_BASE_REF: base });
  assert.notEqual(refused.status, 0, refused.out);
  assert.match(refused.out, /a probe of run r-1 is still live/);
  fs.writeFileSync(at.rowsFile, JSON.stringify([row('r-1-probe-a', 'stopped')]));
  const passed = run({ WF_BASE_REF: base });
  assert.equal(passed.status, 0, passed.out);
  const old = based({
    'workflows/build/mutants.ts': scripts['workflows/build/mutants.ts'],
    'workflows/build/pictures.ts': scripts['workflows/build/pictures.ts'],
  });
  const r = spawnSync(checkArgv(implementCheck())[0], checkArgv(implementCheck()).slice(1), {
    cwd: old.repo,
    env: { ...envAt(at), ...gh.env(), TMPDIR: scratch('wf-probe-tmp-'), WF_RUN: 'r-1', WF_CLOSEOUT: closeout, WF_BASE_REF: old.base },
    encoding: 'utf8',
    timeout: 120_000,
  });
  assert.notEqual(r.status, 0, r.stdout);
  assert.match(r.stderr, /has no workflows\/build\/probe\.ts/, 'a base without the script refuses, never skips');
});

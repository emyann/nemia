/**
 * `nemia` run as a process exits with a refusal's code, and 1 on anything else. The package refuses with `exitCode` 2 and a sentence saying
 * what to do next (CLAUDE.md, *Errors say what to do next*); a bin that exits 1 on every error leaves a script unable to tell a
 * refusal from a crash. The verbs' own tests read `exitCode` off what `main` throws; only a process shows what `nemia` exits with.
 * A fake `claude` and `codex` first on PATH, so nothing real is asked.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { scratch } from './scratch.ts';

import { exitCodeOf } from '../src/cli/exit.ts';
import { offLine } from '../src/demand/demand.ts';

const WF = path.join(import.meta.dirname, '..', 'bin', 'nemia.ts');
const BIN = scratch('wf-exit-code-bin-');
for (const name of ['claude', 'codex']) fs.writeFileSync(path.join(BIN, name), '#!/bin/sh\nexit 1\n', { mode: 0o755 });

/** `nemia <argv>` over the store at `root`, with the engine's store beside it, in `cwd`, the directory above the store unless given. */
function wf(root: string, argv: string[], cwd = path.dirname(root)): { status: number | null; stderr: string } {
  const dir = path.dirname(root);
  const { status, stderr } = spawnSync(process.execPath, [WF, ...argv], {
    cwd,
    env: { ...process.env, WF_ROOT: root, AE_ROOT: path.join(dir, 'engine'), PATH: `${BIN}${path.delimiter}${process.env.PATH}` },
    encoding: 'utf8',
  });
  return { status, stderr };
}

test('a refusal exits 2 and prints its sentence: nemia approve of a run that does not exist', () => {
  const root = path.join(scratch('wf-exit-code-refused-'), 'store');
  const { status, stderr } = wf(root, ['approve', 'r-nope', 'implement']);
  assert.equal(status, 2, `nemia approve of no run exits with the refusal's code; it said: ${stderr}`);
  assert.equal(
    stderr,
    `${offLine(root)}\n` +
      'no such run: r-nope. nemia approve takes a run by its id, as nemia ls lists it: nemia approve <runId> <step>.\n',
  );
});

test("REFUSED: nemia retry and nemia say of a run that does not exist exit 2, with the store's sentence naming nemia ls", () => {
  for (const argv of [
    ['retry', 'r-nope', 'implement'],
    ['say', 'r-nope', 'implement', 'the words'],
  ]) {
    const root = path.join(scratch('wf-exit-code-no-run-'), 'store');
    const { status, stderr } = wf(root, argv);
    assert.equal(status, 2, `nemia ${argv[0]} of no run exits with the refusal's code; it said: ${stderr}`);
    const off = argv[0] === 'retry' ? `${offLine(root)}\n` : '';
    assert.equal(stderr, `${off}no such run: r-nope  (try 'nemia ls')\n`, `nemia ${argv[0]}`);
  }
});

test('a refusal of --no-worktree on a workflow that fans out exits 2, as its sibling refusals do, and nothing is written', () => {
  const dir = scratch('wf-exit-code-fan-out-');
  const repo = path.join(dir, 'repo');
  fs.mkdirSync(repo);
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'init', '-q'], { cwd: repo });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'base'], { cwd: repo });
  const team = path.join(dir, 'team');
  fs.mkdirSync(team);
  fs.writeFileSync(path.join(team, 'left.md'), '---\nplace: git\n---\nwrite the left half\n');
  fs.writeFileSync(path.join(team, 'right.md'), '---\nplace: git\n---\nwrite the right half\n');
  const root = path.join(dir, 'store');
  const { status, stderr } = wf(root, ['start', 'two halves', '--workflows', team, '--repo', repo, '--no-worktree']);
  assert.equal(status, 2, `a fan-out refused --no-worktree exits with the refusal's code; it said: ${stderr}`);
  assert.equal(
    stderr,
    `${offLine(root)}\n` +
      'this workflow can run two steps at once, and --no-worktree would put them in the same directory.\nEither drop --no-worktree, or make the steps a chain.\n',
  );
  assert.deepEqual(fs.existsSync(path.join(root, 'runs')) ? fs.readdirSync(path.join(root, 'runs')) : [], [], 'no run written');
});

test('REFUSED at shipped defaults: a WF_ROOT that is not an absolute path, relative or empty, exits 2 as the package loads, with its sentence alone, and nothing is written', () => {
  for (const root of ['relative/store', '']) {
    const cwd = scratch('wf-exit-code-root-');
    const { status, stderr } = wf(root, ['ls'], cwd);
    assert.equal(status, 2, `WF_ROOT=${root} exits with the refusal's code; it said: ${stderr}`);
    assert.equal(
      stderr,
      `WF_ROOT=${root} is not an absolute path. It is the directory where runs and the engine's board live, the same for every process that reads them: WF_ROOT=/srv/wf — or unset, for ~/.agent-workflows.\n`,
    );
    assert.deepEqual(fs.readdirSync(cwd), [], `nothing written under the working directory for WF_ROOT=${root}`);
  }
});

test('a crash exits 1 and prints its message, with no stack: nemia ls over a store that is a file', () => {
  const dir = scratch('wf-exit-code-crash-');
  const root = path.join(dir, 'store');
  fs.writeFileSync(root, 'not a directory');
  const { status, stderr } = wf(root, ['ls']);
  assert.equal(status, 1, `a store nemia cannot read is no refusal; it said: ${stderr}`);
  const last = stderr.trimEnd().split('\n').at(-1)!;
  assert.ok(last.startsWith('ENOTDIR: not a directory'), `the message, as the error has it: ${stderr}`);
  assert.ok(!/^\s+at /m.test(stderr), `no stack: ${stderr}`);
});

test('an error exits with its exitCode only when that is a whole number from 1 to 255, and 1 otherwise', () => {
  assert.equal(exitCodeOf(Object.assign(new Error('refused'), { exitCode: 2 })), 2);
  assert.equal(exitCodeOf(Object.assign(new Error('stopped'), { exitCode: 130 })), 130);
  assert.equal(exitCodeOf(Object.assign(new Error('highest'), { exitCode: 255 })), 255);
  assert.equal(
    exitCodeOf(Object.assign(new Error('odd'), { exitCode: 256 })),
    1,
    'REFUSED: a code whose low byte is 0, which exits as a success',
  );
  assert.equal(exitCodeOf(new Error('crash')), 1, 'no code is a crash');
  assert.equal(exitCodeOf(Object.assign(new Error('odd'), { exitCode: 0 })), 1, 'REFUSED: an error exiting 0, as a success');
  assert.equal(exitCodeOf(Object.assign(new Error('odd'), { exitCode: -2 })), 1, 'REFUSED: a negative code');
  assert.equal(exitCodeOf(Object.assign(new Error('odd'), { exitCode: 2.5 })), 1, 'REFUSED: a code that is no whole number');
  assert.equal(exitCodeOf(Object.assign(new Error('odd'), { exitCode: '2' })), 1, 'REFUSED: a code that is no number');
  assert.equal(exitCodeOf('thrown text'), 1);
  assert.equal(exitCodeOf(undefined), 1);
  assert.equal(exitCodeOf(null), 1);
});

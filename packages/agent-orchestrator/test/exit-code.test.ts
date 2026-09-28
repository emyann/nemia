/**
 * `wf` run as a process exits with a refusal's code, and 1 on anything else. The package refuses with `exitCode` 2 and a sentence saying
 * what to do next (CLAUDE.md, *Errors say what to do next*); a `bin/wf.ts` that exits 1 on every error leaves a script unable to tell a
 * refusal from a crash. The verbs' own tests read `exitCode` off what `main` throws; only a process shows what `wf` exits with.
 * A fake `claude` and `codex` first on PATH, so nothing real is asked. `WF_ROOT` is set before the command line is imported, which reads
 * it as the module loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { scratch } from './scratch.ts';

process.env.WF_ROOT = scratch('wf-exit-code-store-');
const { exitCodeOf } = await import('../src/cli.ts');

const WF = path.join(import.meta.dirname, '..', 'bin', 'wf.ts');
const BIN = scratch('wf-exit-code-bin-');
for (const name of ['claude', 'codex']) fs.writeFileSync(path.join(BIN, name), '#!/bin/sh\nexit 1\n', { mode: 0o755 });

/** `wf <argv>` over the store at `root`, with the engine's store beside it. */
function wf(root: string, argv: string[]): { status: number | null; stderr: string } {
  const dir = path.dirname(root);
  const { status, stderr } = spawnSync(process.execPath, [WF, ...argv], {
    env: { ...process.env, WF_ROOT: root, AE_ROOT: path.join(dir, 'engine'), PATH: `${BIN}${path.delimiter}${process.env.PATH}` },
    encoding: 'utf8',
    timeout: 60_000,
  });
  return { status, stderr };
}

test('a refusal exits 2 and prints its sentence: wf approve of a run that does not exist', () => {
  const { status, stderr } = wf(path.join(scratch('wf-exit-code-refused-'), 'store'), ['approve', 'r-nope', 'implement']);
  assert.equal(status, 2, `wf approve of no run exits with the refusal's code; it said: ${stderr}`);
  assert.equal(stderr, 'no such run: r-nope. wf approve takes a run by its id, as wf ls lists it: wf approve <runId> <step>.\n');
});

test('a refusal of --no-worktree on a workflow that fans out exits 2, as its sibling refusals do, and nothing is written', () => {
  const dir = scratch('wf-exit-code-fan-out-');
  const repo = path.join(dir, 'repo');
  fs.mkdirSync(repo);
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'init', '-q'], { cwd: repo });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'base'], { cwd: repo });
  const team = path.join(dir, 'team');
  fs.mkdirSync(team);
  fs.writeFileSync(path.join(team, 'left.md'), 'write the left half\n');
  fs.writeFileSync(path.join(team, 'right.md'), 'write the right half\n');
  const root = path.join(dir, 'store');
  const { status, stderr } = wf(root, ['start', 'two halves', '--workflows', team, '--repo', repo, '--no-worktree']);
  assert.equal(status, 2, `a fan-out refused --no-worktree exits with the refusal's code; it said: ${stderr}`);
  assert.equal(
    stderr,
    'this workflow can run two steps at once, and --no-worktree would put them in the same directory.\nEither drop --no-worktree, or make the steps a chain.\n',
  );
  assert.deepEqual(fs.existsSync(path.join(root, 'runs')) ? fs.readdirSync(path.join(root, 'runs')) : [], [], 'no run written');
});

test('a crash exits 1 and prints its message, with no stack: wf ls over a store that is a file', () => {
  const dir = scratch('wf-exit-code-crash-');
  const root = path.join(dir, 'store');
  fs.writeFileSync(root, 'not a directory');
  const { status, stderr } = wf(root, ['ls']);
  assert.equal(status, 1, `a store wf cannot read is no refusal; it said: ${stderr}`);
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

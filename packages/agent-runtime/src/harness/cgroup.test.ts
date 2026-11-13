/**
 * The argv a session's process tree is run behind (`scopeArgv`, `harness/cgroup.ts`), golden: a transient scope of systemd's user
 * manager, and under a limit `MemoryMax=`, no swap, and `OOMPolicy=continue`, so the kernel's kill of the largest process leaves the
 * worker that writes the end; in the slice an operator names where one is given. The command goes after its `--`. And what is left in a
 * scope, read and ended (`scopeLeftIn`, `endScopeIn`), on planted folders that list spawned children.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { endScopeIn, scopeArgv, scopeLeftIn, scopeRefusal } from './cgroup.ts';

test('scopeArgv: the scope a limited task runs in, with and without a slice, and the program a test stands in', async (t) => {
  const ROWS: Array<{ name: string; argv: string[]; is: string[] }> = [
    {
      name: 'in the user manager’s own slice',
      argv: scopeArgv(67_108_864),
      is: [
        'systemd-run',
        '--user',
        '--scope',
        '--quiet',
        '--collect',
        '-p',
        'MemoryMax=67108864',
        '-p',
        'MemorySwapMax=0',
        '-p',
        'OOMPolicy=continue',
        '--',
      ],
    },
    {
      name: 'in a slice an operator caps',
      argv: scopeArgv(8_589_934_592, 'sessions.slice'),
      is: [
        'systemd-run',
        '--user',
        '--scope',
        '--quiet',
        '--collect',
        '--slice=sessions.slice',
        '-p',
        'MemoryMax=8589934592',
        '-p',
        'MemorySwapMax=0',
        '-p',
        'OOMPolicy=continue',
        '--',
      ],
    },
    {
      name: 'with no limit, in the user manager’s own slice: no property',
      argv: scopeArgv(undefined),
      is: ['systemd-run', '--user', '--scope', '--quiet', '--collect', '--'],
    },
    {
      name: 'with no limit, in a slice an operator names',
      argv: scopeArgv(undefined, 'sessions.slice'),
      is: ['systemd-run', '--user', '--scope', '--quiet', '--collect', '--slice=sessions.slice', '--'],
    },
    { name: 'by another program', argv: scopeArgv(1024, undefined, 'false').slice(0, 2), is: ['false', '--user'] },
  ];
  for (const row of ROWS) await t.test(row.name, () => assert.deepEqual(row.argv, row.is));
});

test('scopeRefusal: a program that makes no scope is refused with words, asked once', () => {
  const words = scopeRefusal(undefined, 'false');
  assert.equal(typeof words, 'string');
  assert.equal(scopeRefusal(undefined, 'false'), words, 'the same answer, cached');
});

/** A child that runs until it is signalled, killed when the test ends; answers it and how it ended, once it has. */
const child = (t: TestContext) => {
  const c = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  const ended = new Promise<NodeJS.Signals | null>((resolve) => c.once('exit', (_code, signal) => resolve(signal)));
  t.after(() => void c.kill('SIGKILL'));
  const pid = c.pid;
  if (pid === undefined) throw new Error('node did not start: this test spawns `process.execPath`');
  return { pid, ended };
};

/** A planted cgroup folder whose `cgroup.procs` lists `pids`, with a `cgroup.kill` file where `kill` says so. */
const planted = (pids: readonly number[], kill: boolean) => {
  const folder = path.join(scratch('ae-cgroup-'), 'run-r1.scope');
  fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, 'cgroup.procs'), pids.map((p) => `${p}\n`).join(''));
  if (kill) fs.writeFileSync(path.join(folder, 'cgroup.kill'), '');
  return folder;
};

test('scopeLeftIn and endScopeIn: what a scope still holds, read and ended', async (t) => {
  await t.test('a folder gone holds nothing, and nothing is signalled', () => {
    const gone = path.join(scratch('ae-cgroup-'), 'gone.scope');
    assert.deepEqual(scopeLeftIn(gone), []);
    assert.deepEqual(endScopeIn(gone, 'SIGKILL'), []);
  });

  await t.test('the pids its cgroup.procs lists are read', (st) => {
    const a = child(st);
    assert.deepEqual(scopeLeftIn(planted([a.pid], false)), [a.pid]);
  });

  await t.test('SIGTERM goes to each pid listed', async (st) => {
    const a = child(st);
    assert.deepEqual(endScopeIn(planted([a.pid], true), 'SIGTERM'), [a.pid]);
    assert.equal(await a.ended, 'SIGTERM');
  });

  await t.test('a spared pid, a worker that wrote its end, is sent no SIGTERM', async (st) => {
    const a = child(st);
    const b = child(st);
    const folder = planted([a.pid, b.pid], true);
    assert.deepEqual(endScopeIn(folder, 'SIGTERM', a.pid), [a.pid, b.pid]);
    assert.equal(await b.ended, 'SIGTERM');
    process.kill(a.pid, 0);
  });

  await t.test('SIGKILL is one write of 1 to cgroup.kill, which the kernel applies, and no pid is signalled here', (st) => {
    const a = child(st);
    const folder = planted([a.pid], true);
    assert.deepEqual(endScopeIn(folder, 'SIGKILL'), [a.pid]);
    assert.equal(fs.readFileSync(path.join(folder, 'cgroup.kill'), 'utf8'), '1');
    process.kill(a.pid, 0);
  });

  await t.test('SIGKILL goes to each pid where cgroup.kill is missing, and the file is not made', async (st) => {
    const a = child(st);
    const folder = planted([a.pid], false);
    assert.deepEqual(endScopeIn(folder, 'SIGKILL'), [a.pid]);
    assert.equal(await a.ended, 'SIGKILL');
    assert.equal(fs.existsSync(path.join(folder, 'cgroup.kill')), false);
  });
});

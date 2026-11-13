/**
 * The argv a session's process tree is run behind (`scopeArgv`, `harness/cgroup.ts`), golden: a transient scope of systemd's user
 * manager, and under a limit `MemoryMax=`, no swap, and `OOMPolicy=continue`, so the kernel's kill of the largest process leaves the
 * worker that writes the end; in the slice an operator names where one is given. The command goes after its `--`.
 * What is left in a scope, read and ended, is `cgroup.boundary.test.ts`'s.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryEventsOf, scopeArgv, scopeRefusal } from './cgroup.ts';

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

test('memoryEventsOf: the kills of any OOM killer and the times the cgroup’s own limit was reached, read apart', async (t) => {
  const ROWS: Array<{ name: string; text: string; is: { oomKills: number; oom: number } }> = [
    { name: 'a kill at the limit', text: 'low 0\nhigh 0\nmax 3\noom 1\noom_kill 1\noom_group_kill 0\n', is: { oomKills: 1, oom: 1 } },
    { name: 'a kill of the machine’s', text: 'low 0\nhigh 0\nmax 0\noom 0\noom_kill 1\noom_group_kill 0\n', is: { oomKills: 1, oom: 0 } },
    { name: 'no kill', text: 'low 0\nhigh 0\nmax 0\noom 0\noom_kill 0\n', is: { oomKills: 0, oom: 0 } },
    { name: 'oom_group_kill is not read as oom', text: 'oom_group_kill 3\noom_kill 2\n', is: { oomKills: 2, oom: 0 } },
    { name: 'lines missing read as none', text: '', is: { oomKills: 0, oom: 0 } },
  ];
  for (const row of ROWS) await t.test(row.name, () => assert.deepEqual(memoryEventsOf(row.text), row.is));
});

/**
 * `wf`, run as a process, is `nemia` under its old name: the same stdout and the same exit code for the same arguments, and on stderr
 * one line more, first, `WF_HINT`, naming what to type next. `nemia` prints no hint. A script that reads `wf`'s stdout reads what it read.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { scratch } from './scratch.ts';

import { WF_HINT } from '../src/cli/flags.ts';

/** `bin/<bin>.ts <argv>` over a store of its own, as a process: its exit code, both streams, and the store. */
function run(bin: 'nemia' | 'wf', argv: string[]): { status: number | null; stdout: string; stderr: string; store: string } {
  const dir = scratch(`wf-alias-${bin}-`);
  const { status, stdout, stderr } = spawnSync(process.execPath, [path.join(import.meta.dirname, '..', 'bin', `${bin}.ts`), ...argv], {
    cwd: dir,
    env: { ...process.env, WF_ROOT: path.join(dir, 'store'), AE_ROOT: path.join(dir, 'engine') },
    encoding: 'utf8',
  });
  return { status, stdout, stderr, store: path.join(dir, 'store') };
}

test('wf prints what nemia prints on stdout, exits as it does, and says its hint first on stderr, which nemia never does', () => {
  for (const argv of [['help'], ['approve', 'r-nope', 'implement']]) {
    const nemia = run('nemia', argv);
    const wf = run('wf', argv);
    assert.equal(wf.status, nemia.status, `wf ${argv.join(' ')} exits as nemia does`);
    assert.equal(wf.stdout, nemia.stdout, `wf ${argv.join(' ')} prints what nemia prints`);
    const said = nemia.stderr.replaceAll(nemia.store, wf.store);
    assert.equal(wf.stderr, `${WF_HINT}\n${said}`, `wf ${argv.join(' ')}: the hint, then what nemia says, of its own store`);
    assert.ok(!nemia.stderr.includes(WF_HINT), `nemia ${argv.join(' ')} says no hint`);
  }
});

/**
 * The checkout's `nemia`, run as a process, on a store whose `releases/current` names an install: refused with exit 2 before any command
 * but `nemia version` and a help, unless `NEMIA_ON_INSTALLED=1`; on a store with no pointer, a trial store, it runs as ever. Each store a
 * scratch one, with the engine's beside it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { scratch } from './scratch.ts';

const NEMIA = path.join(import.meta.dirname, '..', 'bin', 'nemia.ts');

/** A store, with a release `v1` built under it and pointed at where `installed` says. */
function store(installed: boolean): string {
  const root = path.join(scratch('wf-cli-trial-'), 'store');
  fs.mkdirSync(root);
  if (!installed) return root;
  const release = path.join(root, 'releases', 'v1');
  fs.mkdirSync(release, { recursive: true });
  const file = { tag: 'v1', commit: 'abcdef1234567890', source: '/src', builtAt: '2026-10-06T07:00:00.000Z' };
  fs.writeFileSync(path.join(release, 'release.json'), JSON.stringify(file));
  fs.symlinkSync('v1', path.join(root, 'releases', 'current'));
  return root;
}

/** `nemia <argv>` from this checkout over the store at `root`, with `env` over the test's own. */
function nemia(root: string, argv: string[], env: NodeJS.ProcessEnv = {}): { status: number | null; stdout: string; stderr: string } {
  const { NEMIA_ON_INSTALLED: _set, ...ambient } = process.env;
  const { status, stdout, stderr } = spawnSync(process.execPath, [NEMIA, ...argv], {
    cwd: path.dirname(root),
    env: { ...ambient, WF_ROOT: root, AE_ROOT: path.join(path.dirname(root), 'engine'), ...env },
    encoding: 'utf8',
  });
  return { status, stdout, stderr };
}

test('REFUSED at shipped defaults: the checkout on a store that runs an install exits 2, naming the trial store and the setting', () => {
  const root = store(true);
  for (const argv of [['ls'], ['tick']]) {
    const { status, stderr } = nemia(root, argv);
    assert.equal(status, 2, `nemia ${argv.join(' ')}: ${stderr}`);
    assert.ok(stderr.includes('this is the checkout'), stderr);
    assert.ok(stderr.includes('the installed release v1 (releases/current)'), stderr);
    assert.match(stderr, /WF_ROOT=<a scratch folder> nemia/);
    assert.match(stderr, /NEMIA_ON_INSTALLED=1/);
  }
  assert.equal(fs.existsSync(path.join(root, 'tick.json')), false, 'the refused tick ran no pass');
});

test('the checkout runs on that store told NEMIA_ON_INSTALLED=1, and on a store with no pointer', () => {
  const told = nemia(store(true), ['ls'], { NEMIA_ON_INSTALLED: '1' });
  assert.equal(told.status, 0, told.stderr);
  const trial = nemia(store(false), ['ls']);
  assert.equal(trial.status, 0, trial.stderr);
});

test('nemia version and a help run on a store that runs an install, and version names the pointer', () => {
  const root = store(true);
  const version = nemia(root, ['version']);
  assert.equal(version.status, 0, version.stderr);
  assert.match(version.stdout, /^this nemia: checkout at /m);
  assert.match(version.stdout, /^current: v1 \(abcdef1\) at /m);
  const help = nemia(root, ['decide', '--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.equal(nemia(root, []).status, 0, 'the help for no command');
});

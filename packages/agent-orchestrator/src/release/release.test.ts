/**
 * A release's rules, as data: which tags may name a release folder, when a checkout is refused a store that runs an install, how an
 * upgrade restarts the daemon, the entry a service runs from an install, the lease's record of a release, and what `nemia version` says.
 * The folders on disk are `release.store.test.ts`'s; the upgrade itself is `upgrade.verb.test.ts`'s.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DaemonStanding } from '../daemon/daemon.ts';
import { leaseRelease, pointedEntry, restartPlan, tagRefusal, trialRefusal, versionLines, type Current, type Running } from './release.ts';

const CHECKOUT: Running = { kind: 'checkout', root: '/home/me/nemia' };
const INSTALL: Running = {
  kind: 'install',
  root: '/home/me/.agent-workflows/releases/v1.2.0',
  tag: 'v1.2.0',
  commit: 'abcdef1234567890',
  source: '/home/me/nemia',
  builtAt: '2026-10-06T07:00:00.000Z',
};
const CURRENT: Current = { ...INSTALL, dir: INSTALL.root };
const STORE = '/home/me/.agent-workflows';

/** A lease standing as `kind`, held by `pid`, with the release given. */
const lease = (kind: 'ticking' | 'stopped' | 'gone', pid = 4242, release?: Running): DaemonStanding => ({
  kind,
  file: {
    pid,
    by: 'api',
    startedAt: '2026-10-06T07:00:00.000Z',
    cwd: '/',
    every: 4000,
    passedAt: null,
    ...(release ? { release: leaseRelease(release) } : {}),
  },
  last: 0,
  quiet: 0,
  identity: 'same',
});

test('REFUSED: a tag that climbs out of releases/, hides as a dot folder, holds a space or is the pointer; a plain tag passes', () => {
  for (const tag of ['../x', 'a/b', '.hidden', 'v 1', '', '-v1'])
    assert.match(tagRefusal(tag) ?? '', /is not a tag a release folder can be named by/, JSON.stringify(tag));
  assert.match(tagRefusal('current') ?? '', /current is the pointer's name, not a tag/);
  for (const tag of ['v1.2.0', 'v1', '2026.10.06', 'release_3-rc.1']) assert.equal(tagRefusal(tag), null, tag);
});

test('REFUSED: a checkout on a store whose pointer names an install, naming a trial store, the installed nemia and the setting', () => {
  const refusal = trialRefusal(CHECKOUT, CURRENT, STORE, {});
  assert.ok(refusal !== null);
  for (const said of [
    'this is the checkout /home/me/nemia',
    `the store ${STORE} runs the installed release v1.2.0`,
    'WF_ROOT=<a scratch folder> nemia',
    `${STORE}/releases/current/node_modules/.bin/nemia`,
    'NEMIA_ON_INSTALLED=1',
  ])
    assert.ok(refusal.includes(said), `${said} in ${refusal}`);
  assert.notEqual(trialRefusal(CHECKOUT, CURRENT, STORE, { NEMIA_ON_INSTALLED: '0' }), null, 'only 1 lets it through');
});

test('a checkout passes on a store with no pointer, or told NEMIA_ON_INSTALLED=1; an install passes on any store', () => {
  assert.equal(trialRefusal(CHECKOUT, null, STORE, {}), null);
  assert.equal(trialRefusal(CHECKOUT, CURRENT, STORE, { NEMIA_ON_INSTALLED: '1' }), null);
  assert.equal(trialRefusal(INSTALL, CURRENT, STORE, {}), null);
  assert.equal(trialRefusal(INSTALL, null, STORE, {}), null);
});

test('an upgrade restarts through the service only where it holds the lease on the pointer; any other daemon is left; none, nothing', () => {
  assert.deepEqual(restartPlan(lease('ticking'), 'service', true), { kind: 'service', pid: 4242 });
  assert.deepEqual(restartPlan(lease('ticking'), 'service', false), { kind: 'hand', pid: 4242 }, 'the service runs a checkout');
  assert.deepEqual(restartPlan(lease('ticking'), 'other', true), { kind: 'hand', pid: 4242 }, 'a daemon started by hand');
  assert.deepEqual(restartPlan(lease('stopped'), 'none', true), { kind: 'none' });
  assert.deepEqual(restartPlan({ kind: 'none' }, 'none', false), { kind: 'none' });
});

test("an install's service runs the entry under releases/current, unresolved; a checkout's, unchanged", () => {
  const entry = { checkout: INSTALL.root, entry: `${INSTALL.root}/apps/api/src/main.ts`, cwd: `${INSTALL.root}/apps/api` };
  assert.deepEqual(pointedEntry(entry, INSTALL), {
    checkout: `${STORE}/releases/current`,
    entry: `${STORE}/releases/current/apps/api/src/main.ts`,
    cwd: `${STORE}/releases/current/apps/api`,
  });
  const checkout = { checkout: CHECKOUT.root, entry: `${CHECKOUT.root}/apps/api/src/main.ts`, cwd: `${CHECKOUT.root}/apps/api` };
  assert.deepEqual(pointedEntry(checkout, CHECKOUT), checkout);
});

test("the lease records an install's kind, folder, tag and commit, never its source; a checkout's kind and folder", () => {
  assert.deepEqual(leaseRelease(INSTALL), { kind: 'install', root: INSTALL.root, tag: 'v1.2.0', commit: 'abcdef1234567890' });
  assert.deepEqual(leaseRelease(CHECKOUT), { kind: 'checkout', root: CHECKOUT.root });
});

test("nemia version says this nemia's release, the store's pointer and the daemon's, each as it stands", () => {
  assert.deepEqual(versionLines('1.0.0', CHECKOUT, CURRENT, lease('ticking', 4242, INSTALL)), [
    'nemia 1.0.0',
    'this nemia: checkout at /home/me/nemia',
    `current: v1.2.0 (abcdef1) at ${INSTALL.root}`,
    `daemon: pid 4242, v1.2.0 (install, abcdef1) at ${INSTALL.root}`,
  ]);
  assert.deepEqual(versionLines('1.0.0', INSTALL, null, lease('ticking', 7, undefined)).slice(1), [
    `this nemia: v1.2.0 (install, abcdef1) at ${INSTALL.root}`,
    'current: none — no release is installed for this store',
    'daemon: pid 7, from before releases were recorded',
  ]);
  assert.equal(versionLines('1.0.0', CHECKOUT, null, lease('stopped')).at(-1), 'daemon: no daemon ticks the store');
});

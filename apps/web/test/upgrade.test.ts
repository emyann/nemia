/**
 * What Settings' Server release section reads of the version and the upgrades read (`src/lib/upgrade.ts`): the offers' input
 * (`offersReadOf`), an upgrade at work (`atWork`) and the running release's word (`releaseWord`). The offers themselves are proved by
 * `contracts/upgrade-offers.contract.ts`, never tested here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Upgrade, VersionAnswer } from 'objects';
import { atWork, offersReadOf, releaseWord } from '../src/lib/upgrade.ts';

/** An install of v0.3.0 whose release check read v0.4.0. */
const VERSION: VersionAnswer = {
  version: '0.3.0',
  release: { kind: 'install', root: '/srv/nemia/v0.3.0', tag: 'v0.3.0' },
  latest: { version: '0.4.0', newer: true, tag: 'v0.4.0' },
};

/** An upgrade to v0.4.0 in `phase`. */
const upgrade = (phase: Upgrade['phase']): Upgrade => ({
  id: 'u-1',
  tag: 'v0.4.0',
  from: 'v0.3.0',
  phase,
  output: '',
  startedAt: '2026-11-12T09:41:00.000Z',
});

test('offersReadOf: an upgrades read not answered offers nothing, whatever the version read', () => {
  assert.deepEqual(offersReadOf(VERSION, undefined), { newer: false, previous: null, upgrading: false });
});

test('offersReadOf: a newer release is one to upgrade to only where its tag is read', () => {
  assert.equal(offersReadOf(VERSION, { previous: null, last: null }).newer, true);
  const untagged = { ...VERSION, latest: { version: '0.4.0', newer: true } };
  assert.equal(offersReadOf(untagged, { previous: null, last: null }).newer, false);
  const same = { ...VERSION, latest: { version: '0.3.0', newer: false, tag: 'v0.3.0' } };
  assert.equal(offersReadOf(same, { previous: null, last: null }).newer, false);
  const { latest: _, ...checkout } = VERSION;
  assert.equal(offersReadOf(checkout, { previous: null, last: null }).newer, false);
});

test('offersReadOf: the previous release is refused exactly where the floor says why', () => {
  assert.deepEqual(offersReadOf(VERSION, { previous: { tag: 'v0.2.1' }, last: null }).previous, { refused: false });
  assert.deepEqual(offersReadOf(VERSION, { previous: { tag: 'v0.2.1', refused: 'the floor' }, last: null }).previous, { refused: true });
  assert.equal(offersReadOf(VERSION, { previous: null, last: null }).previous, null);
});

test('atWork: an upgrade pending or running is at work, an ended one or none is not', () => {
  assert.equal(atWork(upgrade('pending')), true);
  assert.equal(atWork(upgrade('running')), true);
  assert.equal(atWork(upgrade('succeeded')), false);
  assert.equal(atWork(upgrade('failed')), false);
  assert.equal(atWork(null), false);
  assert.equal(offersReadOf(VERSION, { previous: null, last: upgrade('running') }).upgrading, true);
  assert.equal(offersReadOf(VERSION, { previous: null, last: upgrade('failed') }).upgrading, false);
});

test("releaseWord: an install's tag, an install with none, a checkout", () => {
  assert.equal(releaseWord(VERSION.release), 'v0.3.0');
  assert.equal(releaseWord({ kind: 'install', root: '/srv/nemia/x' }), 'an install');
  assert.equal(releaseWord({ kind: 'checkout', root: '/code/nemia' }), 'a checkout');
});

/**
 * `nemia ls`'s line on where branches stand (`standingLine`), off the tick's snapshot alone: not read where no pass wrote one, never a
 * verdict on a branch; its age where it is older than a ticking daemon's stale bound, or where nothing ticks; and nothing while the
 * daemon ticks and its reading is fresh.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { staleAfterMs, type DaemonStanding, type Standing } from '../daemon/daemon.ts';
import { standingLine } from './list.ts';

const NOW = Date.parse('2026-10-06T12:00:00Z');
const EVERY = 2_000;

/** A daemon of `kind` passing every `EVERY` ms. */
const daemonOf = (kind: Standing['kind']): DaemonStanding => ({
  kind,
  file: { every: EVERY } as Standing['file'],
  last: NOW,
  quiet: 0,
  identity: 'same',
});

/** A snapshot read `ago` ms before `NOW`. */
const readAgo = (ago: number) => ({ at: new Date(NOW - ago).toISOString() });

test('with no snapshot the line says where branches stand is not read, and names no verdict on a branch', () => {
  const line = standingLine({ none: true }, daemonOf('ticking'), NOW) ?? '';
  assert.match(line, /not read/);
  for (const verdict of ['landed', ' is on ', 'ahead of', 'gone']) assert.ok(!line.includes(verdict), `the line says ${verdict}: ${line}`);
});

test('a snapshot older than the stale bound of a ticking daemon prints its age; a fresh one prints nothing', () => {
  const bound = staleAfterMs(EVERY);
  assert.equal(standingLine(readAgo(bound), daemonOf('ticking'), NOW), undefined);
  assert.match(standingLine(readAgo(bound + 60 * 60_000), daemonOf('ticking'), NOW) ?? '', /^where branches stand: read .+ ago$/);
});

test('a snapshot read while no daemon ticks prints its age, however fresh', () => {
  for (const kind of ['stopped', 'gone', 'stalled'] as const)
    assert.match(standingLine(readAgo(1_000), daemonOf(kind), NOW) ?? '', /^where branches stand: read .+ ago$/, kind);
  assert.match(standingLine(readAgo(1_000), { kind: 'none' }, NOW) ?? '', /^where branches stand: read .+ ago$/);
});

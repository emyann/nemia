/**
 * The Factory's line when nothing ticks the store (src/lib/daemon.ts): nothing while a daemon ticks, and for every other standing, why and how
 * to start one. `npm run e2e` looks at the header itself.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Daemon } from '../src/lib/api.ts';
import { daemonSentence, daemonWords } from '../src/lib/daemon.ts';

const NOW = new Date('2026-09-22T10:00:00.000Z');
const at = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();

const held = (over: Partial<Daemon> = {}): Daemon => ({
  kind: 'ticking',
  ticking: true,
  pid: 4242,
  cwd: '/work/hkb-v2',
  every: 4_000,
  startedAt: at(60),
  passedAt: at(0.1),
  lastHeardAt: at(0.1),
  stoppedAt: null,
  staleAfterMs: 15 * 60_000,
  identity: 'same',
  line: 'wf up: ticking, pid 4242',
  ...over,
});
const free = (kind: 'none' | 'unreadable'): Daemon => ({
  kind,
  ticking: false,
  pid: null,
  cwd: null,
  every: null,
  startedAt: null,
  passedAt: null,
  lastHeardAt: null,
  stoppedAt: null,
  staleAfterMs: null,
  identity: null,
  line: `wf up: ${kind}`,
});
const said = (d: Daemon): string | null => {
  const words = daemonWords(d, NOW);
  return words && daemonSentence(words);
};

test('a daemon ticking says nothing — a long pass included, its last pass minutes old and its beat fresh', () => {
  assert.equal(said(held()), null);
  assert.equal(said(held({ passedAt: at(12), lastHeardAt: at(0.1) })), null);
});

test('no daemon has held the store: nothing ticks, and npx wf up in the repository starts one', () => {
  assert.equal(
    said(free('none')),
    'Nothing ticks this store, so no run moves: no wf up has held it. Start one with npx wf up in the repository.',
  );
});

test('a daemon.json that does not read: nothing is known to tick, and the next wf up takes it over', () => {
  assert.equal(
    said(free('unreadable')),
    'Nothing ticks this store, so no run moves: its daemon.json does not read as a wf up’s. Start one with npx wf up in the repository — it takes the store over.',
  );
});

test('REFUSED: a daemon that stopped is said, with when, and where to start the next', () => {
  assert.equal(
    said(held({ kind: 'stopped', ticking: false, stoppedAt: at(12), lastHeardAt: at(12) })),
    'Nothing ticks this store, so no run moves: the wf up of pid 4242 stopped 12 min ago. Start one with npx wf up in /work/hkb-v2.',
  );
  assert.match(
    said(held({ kind: 'stopped', ticking: false, stoppedAt: at(0.2) }))!,
    /stopped under a minute ago\./,
    'never `just now`, which reads as fine',
  );
});

test('REFUSED: a daemon whose process is gone is said, with when it was last heard from', () => {
  assert.equal(
    said(held({ kind: 'gone', ticking: false, identity: 'gone', lastHeardAt: at(3) })),
    'Nothing ticks this store, so no run moves: the wf up of pid 4242 is gone, last heard from 3 min ago. Start one with npx wf up in /work/hkb-v2.',
  );
});

test('REFUSED: a daemon alive but silent past its stale mark is said as stalled, and the next wf up takes it over', () => {
  assert.equal(
    said(held({ kind: 'stalled', ticking: false, passedAt: at(20), lastHeardAt: at(20) })),
    'Nothing ticks this store, so no run moves: the wf up of pid 4242 is alive but silent, last heard from 20 min ago. Start one with npx wf up in /work/hkb-v2 — it takes the store over.',
  );
});

test('the command is its own part, for the page to set as code', () => {
  const words = daemonWords(free('none'), NOW)!;
  assert.equal(words.command, 'npx wf up');
  assert.ok(words.before.endsWith('Start one with '));
  assert.ok(words.after.startsWith(' in '));
});

/**
 * Who ticks the store, as data: `daemon.json`'s text judged at a fixed `now` with liveness handed in, and the words said of it. The file on
 * disk, `wf up` and `wf tick` taking and refusing the store, are daemon-store.test.ts's.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_EVERY_MS, MAX_EVERY_MS, STALE_FLOOR_MS, daemonLine, everyOf, daemonStanding, holdRefusal, holderAgainst, parseDaemonFile, staleAfterMs, takeoverLine, type DaemonFile } from '../src/daemon.ts';

const NOW = Date.parse('2026-09-22T12:00:00.000Z');
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
const holder = (over: Partial<DaemonFile> = {}): DaemonFile => ({ pid: 4242, startedAt: ago(60), cwd: '/home/me/repo', every: 4000, passedAt: ago(0.05), ...over });
const text = (file: DaemonFile | Record<string, unknown>) => JSON.stringify(file);
const live = { now: NOW, alive: () => true };
const dead = { now: NOW, alive: () => false };
const kindOf = (file: DaemonFile | Record<string, unknown>, how = live) => daemonStanding(text(file), how).kind;

test('stale is ten of the holder\'s own intervals, never under fifteen minutes — the floor decides at the shipped 4000 ms', () => {
  assert.equal(STALE_FLOOR_MS, 15 * 60_000);
  assert.equal(staleAfterMs(4000), 15 * 60_000);
  assert.equal(staleAfterMs(600_000), 100 * 60_000);
});

test('each standing, from the file and the clock: none, unreadable, ticking, stalled, gone and stopped', () => {
  assert.equal(daemonStanding(undefined, live).kind, 'none');
  assert.equal(kindOf(holder()), 'ticking');
  assert.equal(kindOf(holder({ passedAt: null, startedAt: ago(1) })), 'ticking', 'started a minute ago and no pass yet is still ticking');
  // Alive but quiet: stalled on the far side of the threshold, ticking on the near one — deleting the stale comparison fails the first.
  assert.equal(kindOf(holder({ passedAt: ago(16) })), 'stalled');
  assert.equal(kindOf(holder({ passedAt: ago(14) })), 'ticking');
  assert.equal(kindOf(holder({ passedAt: null, startedAt: ago(16) })), 'stalled', 'a start with no pass for sixteen minutes is stalled too');
  // Measured from the holder's own interval, not the reader's.
  assert.equal(kindOf(holder({ every: 600_000, startedAt: ago(300), passedAt: ago(90) })), 'ticking');
  assert.equal(kindOf(holder({ every: 600_000, startedAt: ago(300), passedAt: ago(101) })), 'stalled');
  // A pass that runs long is heard from by its beat: forty minutes since a pass, beating now, is ticking — deleting the beat from `last` fails
  // this — and a beat as silent as the pass is stalled all the same.
  assert.equal(kindOf(holder({ passedAt: ago(40), beatAt: ago(0.05) })), 'ticking');
  assert.equal(kindOf(holder({ passedAt: ago(40), beatAt: ago(16) })), 'stalled');
  assert.equal(kindOf(holder({ passedAt: ago(0.05), beatAt: ago(16) })), 'ticking', 'the latest of pass and beat');
  // Dead but fresh: gone at once — deleting the liveness check fails this.
  assert.equal(kindOf(holder({ passedAt: ago(0) }), dead), 'gone');
  // A stop said frees the store even while its pid answers: reused by another process, it holds nothing.
  assert.equal(kindOf(holder({ stoppedAt: ago(0.01) })), 'stopped');
});

test('a file that does not read as a holder is unreadable, and holds nothing — a pid that would signal a process group included', () => {
  for (const bad of ['', '{', 'null', '[]', '"x"']) assert.equal(daemonStanding(bad, live).kind, 'unreadable', JSON.stringify(bad));
  const { pid: _pid, ...noPid } = holder();
  for (const file of [noPid, holder({ pid: 0 }), holder({ pid: -1 }), holder({ pid: 1.5 }), holder({ every: 0 }), { ...holder(), startedAt: 'yesterday' }, { ...holder(), passedAt: 'soon' }, { ...holder(), cwd: 7 }, { ...holder(), stoppedAt: 3 }, { ...holder(), beatAt: 'now' }, { ...holder(), every: -5 }, { ...holder(), every: null }]) {
    assert.equal(parseDaemonFile(text(file)), undefined, text(file));
    assert.equal(holderAgainst(daemonStanding(text(file), live), 1), undefined);
  }
  assert.deepEqual(parseDaemonFile(text({ ...holder(), passedAt: undefined })), { ...holder(), passedAt: null });
});

test('only a daemon ticking that is not the reader holds the store against it', () => {
  const ticking = daemonStanding(text(holder()), live);
  assert.deepEqual(holderAgainst(ticking, 1), holder());
  assert.equal(holderAgainst(ticking, 4242), undefined, 'its own file holds nothing against itself');
  for (const file of [holder({ passedAt: ago(16) }), holder({ stoppedAt: ago(1) })]) assert.equal(holderAgainst(daemonStanding(text(file), live), 1), undefined);
  assert.equal(holderAgainst(daemonStanding(text(holder()), dead), 1), undefined);
});

test('the refusals name the pid, where and since when it ticks, its last pass, and how to stop it — the node process, not the npm wrapper', () => {
  const up = holdRefusal(holder(), 'up', '/store', NOW);
  assert.match(up, /^wf up: \/store is held by the wf up of pid 4242, started 2026-09-22T11:00:00\.000Z in \/home\/me\/repo, every 4000ms — last pass 3s ago \(2026-09-22T11:59:57\.000Z\)\. /);
  assert.match(up, /stop it with kill 4242 — that pid is the node process that ticks, not an npm exec wrapper around it/);
  assert.match(up, /a holder silent for 15m00s is taken over by the next wf up\.$/);
  const tick = holdRefusal(holder({ passedAt: null, startedAt: ago(0.5) }), 'tick', '/store', NOW);
  assert.match(tick, /^wf tick: \/store is held by the wf up of pid 4242, started \S+ in \/home\/me\/repo, every 4000ms — no pass completed yet, started 30s ago \(\S+\), which runs this same pass within its interval: a pass by hand beside it would be a second writer\. /);
  assert.match(tick, /kill 4242 — that pid is the node process that ticks, not an npm exec wrapper .* and tick by hand then\.$/);
});

test('what wf up says of the store it took: a holder gone, stalled or unreadable is named, and a clean stop or an empty store is not', () => {
  const standing = (file: DaemonFile, how = live) => daemonStanding(text(file), how);
  assert.equal(takeoverLine(standing(holder({ passedAt: ago(125) }), dead), '/store', NOW), 'took /store over from pid 4242, whose process is gone — its last pass 2h05m ago (2026-09-22T09:55:00.000Z)');
  assert.match(takeoverLine(standing(holder({ passedAt: ago(16) })), '/store', NOW)!, /^took \/store over from pid 4242, alive but silent for 16m00s, over the 15m00s that is stale at every 4000ms — it stops at its next pass/);
  assert.equal(takeoverLine(daemonStanding('{', live), '/store', NOW), 'took /store over from a daemon.json that did not read as a holder');
  assert.equal(takeoverLine(standing(holder({ stoppedAt: ago(1) })), '/store', NOW), undefined);
  assert.equal(takeoverLine(daemonStanding(undefined, live), '/store', NOW), undefined);
});

test("wf ls's line: whether a daemon ticks the store, and when its last pass was", () => {
  const line = (file: DaemonFile | undefined, how = live) => daemonLine(daemonStanding(file && text(file), how), NOW);
  assert.equal(line(undefined), 'wf up: none has held this store — nothing ticks it; start one with wf up');
  assert.equal(daemonLine(daemonStanding('nope', live), NOW), 'wf up: none known — daemon.json does not read as a holder, so nothing is known to tick this store; wf up takes it over');
  assert.equal(line(holder()), 'wf up: ticking, pid 4242, every 4000ms — last pass 3s ago (2026-09-22T11:59:57.000Z)');
  assert.equal(line(holder({ passedAt: ago(20) })), 'wf up: stalled, pid 4242, every 4000ms — alive, but silent for 20m00s: last pass 20m00s ago (2026-09-22T11:40:00.000Z); the next wf up takes the store over, and kill 4242 stops it');
  // A pass under way: its beat more than two intervals past its last pass is said, so a pass that runs long, or never ends, reads as one.
  assert.equal(line(holder({ passedAt: ago(40), beatAt: ago(0.05) })), 'wf up: ticking, pid 4242, every 4000ms — last pass 40m00s ago (2026-09-22T11:20:00.000Z), a pass under way since — alive 3s ago (2026-09-22T11:59:57.000Z)');
  assert.equal(line(holder({ passedAt: ago(0.05), beatAt: ago(0.02) })), 'wf up: ticking, pid 4242, every 4000ms — last pass 3s ago (2026-09-22T11:59:57.000Z)', 'a beat between passes is not a pass under way');
  assert.equal(line(holder(), dead), 'wf up: none ticking — pid 4242 is gone, its last pass 3s ago (2026-09-22T11:59:57.000Z); start one with wf up');
  assert.equal(line(holder({ passedAt: ago(6), stoppedAt: ago(5) })), 'wf up: none ticking — pid 4242 stopped 5m00s ago (2026-09-22T11:55:00.000Z), its last pass 6m00s ago (2026-09-22T11:54:00.000Z); start one with wf up');
});

test('REFUSED: an interval the file cannot hold — negative, zero, fractional, not a number, or longer than a timer keeps', () => {
  for (const arg of ['-5', '0', '1.5', '1e400', 'Infinity', 'NaN', 'abc', '', ' ', String(MAX_EVERY_MS + 1)]) {
    const asked = everyOf(arg);
    assert.ok('refusal' in asked, JSON.stringify(arg));
    assert.equal(asked.refusal, `wf up takes its pass interval in whole milliseconds, from 1 to 2147483647, and ${JSON.stringify(arg)} is not one: wf up [ms], 4000 when none is given. The interval is written into daemon.json, and a holder whose interval does not read there holds nothing: a second wf up would take the store from it while it ticks.`);
  }
  assert.deepEqual(everyOf(undefined), { every: DEFAULT_EVERY_MS });
  for (const [arg, every] of [['1', 1], ['10', 10], ['4000', 4000], [String(MAX_EVERY_MS), MAX_EVERY_MS]] as const) {
    assert.deepEqual(everyOf(arg), { every }, arg);
    // Every interval taken is one the file reads back: the guard and the parser agree.
    assert.equal(parseDaemonFile(text(holder({ every })))?.every, every);
  }
});

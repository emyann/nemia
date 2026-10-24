/**
 * Who ticks the store, as data: `daemon.json`'s text judged at a fixed `now` with liveness handed in, and the words said of it. The file on
 * disk, `nemia up` and `nemia tick` taking and refusing the store, are daemon.store.test.ts's.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_EVERY_MS,
  MAX_EVERY_MS,
  STALE_FLOOR_MS,
  daemonLine,
  elapsedMs,
  everyOf,
  daemonStanding as standingOf,
  holdRefusal,
  holderAgainst,
  staleAfterMs,
  takeoverLine,
  type DaemonFile,
  type Identity,
  type Instant,
} from './daemon.ts';
import { parseDaemonFile } from './daemon.store.ts';

const NOW = Date.parse('2026-09-22T12:00:00.000Z');
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
const holder = (over: Partial<DaemonFile> = {}): DaemonFile => ({
  pid: 4242,
  by: 'up',
  startedAt: ago(60),
  cwd: '/home/me/repo',
  every: 4000,
  passedAt: ago(0.05),
  ...over,
});
const text = (file: DaemonFile | Record<string, unknown>) => JSON.stringify(file);
const as = (identity: Identity, now: Instant = { at: NOW }) => ({ now, identify: () => identity });
const live = as('same');
const dead = as('gone');
/** The pure judgement of the file's text as `daemon.store.ts` reads it: undefined for no file, else the text and what it holds. */
const judged = (text: string | undefined, how: { now: Instant; identify: () => Identity }) =>
  standingOf(text === undefined ? undefined : { text, file: parseDaemonFile(text) }, how);
const kindOf = (file: DaemonFile | Record<string, unknown>, how = live) => judged(text(file), how).kind;

test("stale is ten of the holder's own intervals, never under fifteen minutes — the floor decides at the shipped 4000 ms", () => {
  assert.equal(STALE_FLOOR_MS, 15 * 60_000);
  assert.equal(staleAfterMs(4000), 15 * 60_000);
  assert.equal(staleAfterMs(600_000), 100 * 60_000);
});

test('each standing, from the file and the clock: none, unreadable, ticking, stalled, gone and stopped', () => {
  assert.equal(judged(undefined, live).kind, 'none');
  assert.equal(kindOf(holder()), 'ticking');
  assert.equal(kindOf(holder({ passedAt: null, startedAt: ago(1) })), 'ticking', 'started a minute ago and no pass yet is still ticking');
  assert.equal(
    kindOf(holder({ passedAt: ago(16) })),
    'stalled',
    'alive but quiet: stalled on the far side of the threshold, which fails without the stale comparison',
  );
  assert.equal(kindOf(holder({ passedAt: ago(14) })), 'ticking', 'and ticking on the near one');
  assert.equal(
    kindOf(holder({ passedAt: null, startedAt: ago(16) })),
    'stalled',
    'a start with no pass for sixteen minutes is stalled too',
  );
  assert.equal(
    kindOf(holder({ every: 600_000, startedAt: ago(300), passedAt: ago(90) })),
    'ticking',
    "measured from the holder's own interval, not the reader's",
  );
  assert.equal(kindOf(holder({ every: 600_000, startedAt: ago(300), passedAt: ago(101) })), 'stalled');
  assert.equal(
    kindOf(holder({ passedAt: ago(40), beatAt: ago(0.05) })),
    'ticking',
    'a pass that runs long is heard from by its beat: forty minutes since a pass, beating now, is ticking, which fails without the beat in `last`',
  );
  assert.equal(kindOf(holder({ passedAt: ago(40), beatAt: ago(16) })), 'stalled', 'a beat as silent as the pass is stalled all the same');
  assert.equal(kindOf(holder({ passedAt: ago(0.05), beatAt: ago(16) })), 'ticking', 'the latest of pass and beat');
  assert.equal(kindOf(holder({ passedAt: ago(0) }), dead), 'gone', 'dead but fresh: gone at once, which fails without the liveness check');
  assert.equal(
    kindOf(holder({ stoppedAt: ago(0.01) })),
    'stopped',
    'a stop said frees the store even while its pid answers: reused by another process, it holds nothing',
  );
  assert.equal(
    kindOf(holder({ passedAt: ago(0) }), as('other')),
    'gone',
    "a pid alive but another process's, reused after a kill -9, is gone however fresh the file, which fails without the identity check",
  );
  assert.equal(kindOf(holder(), as('unknown')), 'ticking', 'a live pid that cannot be compared holds: two writers are the worse mistake');
  assert.equal(kindOf(holder({ passedAt: ago(16) }), as('unknown')), 'stalled');
});

test('elapsed time is monotonic within a boot, and wall-clock across one or without a reading on either side', () => {
  const mono = (boot: string, ms: number) => ({ boot, ms });
  assert.equal(
    elapsedMs({ at: 0, mono: mono('a', 100) }, { at: 50_000, mono: mono('a', 1100) }),
    1000,
    'one boot: the monotonic difference',
  );
  assert.equal(elapsedMs({ at: 0, mono: mono('a', 100) }, { at: 50_000, mono: mono('b', 1100) }), 50_000, 'two boots: the wall clock');
  assert.equal(elapsedMs({ at: 0 }, { at: 50_000, mono: mono('a', 1100) }), 50_000, 'no reading at the start: the wall clock');
  assert.equal(elapsedMs({ at: 0, mono: mono('a', 100) }, { at: 50_000 }), 50_000, 'no reading now: the wall clock');
});

test('silence is measured on the monotonic clock within a boot: a stepped wall clock neither stalls a live daemon nor revives a silent one', () => {
  const BOOT = 'boot-1';
  const NOW_MS = 10 * 3_600_000;
  const now = { at: NOW, mono: { boot: BOOT, ms: NOW_MS } };
  const monoAgo = (minutes: number, boot = BOOT) => ({ boot, ms: NOW_MS - minutes * 60_000 });
  const fresh = { startedMono: monoAgo(30), passedMono: monoAgo(1 / 60), beatMono: monoAgo(1 / 60) };
  const forward = holder({ startedAt: ago(50), passedAt: ago(20), beatAt: ago(20), ...fresh });
  const judgedForward = judged(text(forward), as('same', now));
  assert.equal(judgedForward.kind, 'ticking', 'wall stamps twenty minutes old, monotonic ones a second: the wall clock stepped forward');
  assert.equal(judgedForward.kind === 'ticking' && judgedForward.quiet, 1000);
  assert.equal(
    kindOf(
      holder({ passedAt: ago(0.05), beatAt: ago(0.05), startedMono: monoAgo(46), passedMono: monoAgo(16), beatMono: monoAgo(16) }),
      as('same', now),
    ),
    'stalled',
    'wall stamps fresh, monotonic ones sixteen minutes old: the wall clock stepped back, and the silence is still stale',
  );
  assert.equal(
    kindOf(
      holder({ passedAt: ago(20), beatAt: ago(20), startedMono: monoAgo(30), passedMono: monoAgo(16), beatMono: monoAgo(1 / 60) }),
      as('same', now),
    ),
    'ticking',
    'the least silence over the stamps: a beat a second old keeps a holder whose last pass was sixteen minutes ago',
  );
  const otherBoot = { startedMono: monoAgo(30, 'boot-0'), passedMono: monoAgo(0.05, 'boot-0') };
  assert.equal(
    kindOf(holder({ passedAt: ago(20), ...otherBoot }), as('same', now)),
    'stalled',
    'a reading of another boot: the wall clock',
  );
  assert.equal(kindOf(holder({ passedAt: ago(20), passedMono: monoAgo(0.05) }), as('same', { at: NOW })), 'stalled', 'no reading now');
  assert.equal(kindOf(holder({ passedAt: ago(14) }), as('same', now)), 'ticking', 'a file with no reading: the wall clock, as before');
  assert.equal(kindOf(holder({ passedAt: ago(16) }), as('same', now)), 'stalled');
  assert.equal(
    judgedForward.kind === 'ticking' && judgedForward.last,
    Date.parse(ago(20)),
    '`last` stays the latest wall stamp, for display',
  );
});

test('a file that does not read as a holder is unreadable, and holds nothing — a pid that would signal a process group included', () => {
  for (const bad of ['', '{', 'null', '[]', '"x"']) assert.equal(judged(bad, live).kind, 'unreadable', JSON.stringify(bad));
  const { pid: _pid, ...noPid } = holder();
  for (const file of [
    noPid,
    holder({ pid: 0 }),
    holder({ pid: -1 }),
    holder({ pid: 1.5 }),
    holder({ every: 0 }),
    { ...holder(), startedAt: 'yesterday' },
    { ...holder(), passedAt: 'soon' },
    { ...holder(), cwd: 7 },
    { ...holder(), stoppedAt: 3 },
    { ...holder(), beatAt: 'now' },
    { ...holder(), every: -5 },
    { ...holder(), every: null },
    holder({ procStart: -1 }),
    { ...holder(), beatAt: ago(0), beatMono: { boot: '', ms: 1 } },
    { ...holder(), passedMono: { boot: 'b', ms: 'soon' } },
    { ...holder(), startedMono: 7 },
    holder({ procStart: 1.5 }),
    { ...holder(), procStart: '12' },
  ]) {
    assert.equal(parseDaemonFile(text(file)), undefined, text(file));
    assert.equal(holderAgainst(judged(text(file), live), 1), undefined);
  }
  assert.deepEqual(parseDaemonFile(text({ ...holder(), passedAt: undefined })), { ...holder(), passedAt: null });
  assert.deepEqual(parseDaemonFile(text(holder({ procStart: 1627402 }))), holder({ procStart: 1627402 }));
  const monotonic = holder({
    beatAt: ago(0),
    startedMono: { boot: 'b', ms: 1 },
    passedMono: { boot: 'b', ms: 2 },
    beatMono: { boot: 'b', ms: 3 },
  });
  assert.deepEqual(parseDaemonFile(text(monotonic)), monotonic, 'each monotonic reading read back beside its stamp');
});

test('only a daemon ticking that is not the reader holds the store against it', () => {
  const ticking = judged(text(holder()), live);
  assert.deepEqual(holderAgainst(ticking, 1)?.file, holder());
  assert.equal(holderAgainst(ticking, 4242), undefined, 'its own file holds nothing against itself');
  for (const file of [holder({ passedAt: ago(16) }), holder({ stoppedAt: ago(1) })])
    assert.equal(holderAgainst(judged(text(file), live), 1), undefined);
  assert.equal(holderAgainst(judged(text(holder()), dead), 1), undefined);
  assert.equal(holderAgainst(judged(text(holder()), as('other')), 1), undefined, 'a reused pid holds nothing');
  assert.equal(holderAgainst(judged(text(holder()), as('unknown')), 1)?.file.pid, 4242, 'a pid not compared holds');
});

test('the refusals name the pid, where and since when it ticks, its last pass, and how to stop it — the node process, not the npm wrapper', () => {
  const held = (file: DaemonFile, how = live) => holderAgainst(judged(text(file), how), 1)!;
  const up = holdRefusal(held(holder()), 'up', '/store', NOW);
  assert.match(
    up,
    /^nemia up: \/store is held by the nemia up of pid 4242, started 2026-09-22T11:00:00\.000Z in \/home\/me\/repo, every 4000ms — last pass 3s ago \(2026-09-22T11:59:57\.000Z\)\. /,
  );
  assert.match(up, /stop it with kill 4242 — that pid is the node process that ticks, not an npm wrapper around it/);
  assert.match(up, /a holder silent for 15m00s is taken over by the next daemon\.$/);
  const tick = holdRefusal(held(holder({ passedAt: null, startedAt: ago(0.5) })), 'tick', '/store', NOW);
  assert.match(
    tick,
    /^nemia tick: \/store is held by the nemia up of pid 4242, started \S+ in \/home\/me\/repo, every 4000ms — no pass completed yet, started 30s ago \(\S+\), which runs this same pass within its interval: a pass by hand beside it would be a second writer\. /,
  );
  assert.match(tick, /kill 4242 — that pid is the node process that ticks, not an npm wrapper .* and tick by hand then\.$/);
  for (const [file, why] of [
    [holder({ procStart: 99 }), 'no /proc/4242/stat to compare its start with'],
    [holder(), 'the file names no process start'],
  ] as const) {
    const refusal = holdRefusal(held(file, as('unknown')), 'up', '/store', NOW);
    assert.doesNotMatch(refusal, /kill 4242 —/, 'an unconfirmed pid is never handed over to kill');
    assert.ok(
      refusal.includes(
        `stop it with its pid, once checked: 4242 could not be confirmed here as the process that wrote daemon.json (${why}), `,
      ),
      refusal,
    );
    const check = refusal.indexOf('ps -p 4242 -o lstart=,args=');
    assert.ok(check >= 0, refusal);
    assert.ok(refusal.includes('2026-09-22T11:00:00.000Z, kill 4242; '), refusal);
    assert.ok(check < refusal.indexOf('kill 4242; '), 'how to check it comes before the kill');
  }
});

test('REFUSED both ways round: an api holding the store refuses a nemia up, naming its url and pid, and a nemia up holding it refuses an api', () => {
  const held = (file: DaemonFile) => holderAgainst(judged(text(file), live), 1)!;
  const api = holder({ by: 'api', url: 'http://127.0.0.1:8787' });
  assert.match(
    holdRefusal(held(api), 'up', '/store', NOW),
    /^nemia up: \/store is held by the api of pid 4242 at http:\/\/127\.0\.0\.1:8787, started .* One store takes one daemon, the api or a nemia up: .* stop it with kill 4242 — /,
  );
  const second = holdRefusal(held(api), 'api', '/store', NOW);
  assert.match(second, /^api: \/store is held by the api of pid 4242 at http:\/\/127\.0\.0\.1:8787, /);
  assert.match(second, /serve a board beside it with --no-tick, or start this api again once it has stopped: stop it with kill 4242 — /);
  assert.match(holdRefusal(held(holder()), 'api', '/store', NOW), /^api: \/store is held by the nemia up of pid 4242, started /);
  assert.match(holdRefusal(held(api), 'tick', '/store', NOW), /^nemia tick: \/store is held by the api of pid 4242 at http:/);
  assert.equal(
    daemonLine(judged(text(api), live), NOW),
    'api: ticking, pid 4242 at http://127.0.0.1:8787, every 4000ms — last pass 3s ago (2026-09-22T11:59:57.000Z)',
  );
});

test('what nemia up says of the store it took: a holder gone, stalled or unreadable is named, and a clean stop or an empty store is not', () => {
  const standing = (file: DaemonFile, how = live) => judged(text(file), how);
  assert.equal(
    takeoverLine(standing(holder({ passedAt: ago(125) }), dead), '/store', NOW),
    'took /store over from pid 4242, whose process is gone — its last pass 2h05m ago (2026-09-22T09:55:00.000Z)',
  );
  assert.match(
    takeoverLine(standing(holder({ passedAt: ago(16) })), '/store', NOW)!,
    /^took \/store over from pid 4242, alive but silent for 16m00s, over the 15m00s that is stale at every 4000ms — it stops at its next pass/,
  );
  assert.equal(takeoverLine(judged('{', live), '/store', NOW), 'took /store over from a daemon.json that did not read as a holder');
  assert.equal(
    takeoverLine(standing(holder(), as('other')), '/store', NOW),
    "took /store over from pid 4242, whose process is gone — that pid is another process's now, started after the nemia up that wrote daemon.json — its last pass 3s ago (2026-09-22T11:59:57.000Z)",
  );
  const unsure = takeoverLine(standing(holder({ passedAt: ago(16) }), as('unknown')), '/store', NOW)!;
  assert.doesNotMatch(unsure, /kill 4242 —/);
  assert.match(unsure, /to stop it now, its pid, once checked: 4242 could not be confirmed here/);
  assert.equal(takeoverLine(standing(holder({ stoppedAt: ago(1) })), '/store', NOW), undefined);
  assert.equal(takeoverLine(judged(undefined, live), '/store', NOW), undefined);
});

test("nemia ls's line: whether a daemon ticks the store, and when its last pass was", () => {
  const line = (file: DaemonFile | undefined, how = live) => daemonLine(judged(file && text(file), how), NOW);
  assert.equal(
    line(undefined),
    'daemon: none has held this store — nothing ticks it; start one with npm start in apps/api, or nemia up where no board is served — or any nemia command that files work starts one',
  );
  assert.equal(
    daemonLine(judged('nope', live), NOW),
    'daemon: none known — daemon.json does not read as a holder, so nothing is known to tick this store; the next daemon takes it over',
  );
  assert.equal(line(holder()), 'nemia up: ticking, pid 4242, every 4000ms — last pass 3s ago (2026-09-22T11:59:57.000Z)');
  assert.equal(
    line(holder({ passedAt: ago(20) })),
    'nemia up: stalled, pid 4242, every 4000ms — alive, but silent for 20m00s: last pass 20m00s ago (2026-09-22T11:40:00.000Z); the next daemon takes the store over, and kill 4242 stops it',
  );
  assert.equal(
    line(holder({ passedAt: ago(40), beatAt: ago(0.05) })),
    'nemia up: ticking, pid 4242, every 4000ms — last pass 40m00s ago (2026-09-22T11:20:00.000Z), a pass under way since — alive 3s ago (2026-09-22T11:59:57.000Z)',
    'a beat more than two intervals past the last pass is said, so a pass that runs long, or never ends, reads as one under way',
  );
  assert.equal(
    line(holder({ passedAt: ago(0.05), beatAt: ago(0.02) })),
    'nemia up: ticking, pid 4242, every 4000ms — last pass 3s ago (2026-09-22T11:59:57.000Z)',
    'a beat between passes is not a pass under way',
  );
  assert.equal(
    line(holder(), dead),
    'nemia up: none ticking — pid 4242 is gone, its last pass 3s ago (2026-09-22T11:59:57.000Z); start one with npm start in apps/api, or nemia up where no board is served — or any nemia command that files work starts one',
  );
  assert.equal(
    line(holder(), as('other')),
    "nemia up: none ticking — the nemia up of pid 4242 is gone, that pid another process's now; its last pass 3s ago (2026-09-22T11:59:57.000Z); start one with npm start in apps/api, or nemia up where no board is served — or any nemia command that files work starts one",
  );
  assert.equal(
    line(holder(), as('unknown')),
    'nemia up: ticking, pid 4242, every 4000ms — last pass 3s ago (2026-09-22T11:59:57.000Z) (pid 4242 not confirmed here as the process that wrote daemon.json)',
  );
  assert.doesNotMatch(line(holder({ passedAt: ago(20) }), as('unknown')), /kill 4242 stops it/);
  assert.equal(
    line(holder({ passedAt: ago(6), stoppedAt: ago(5) })),
    'nemia up: none ticking — pid 4242 stopped 5m00s ago (2026-09-22T11:55:00.000Z), its last pass 6m00s ago (2026-09-22T11:54:00.000Z); start one with npm start in apps/api, or nemia up where no board is served — or any nemia command that files work starts one',
  );
});

test('REFUSED: an interval the file cannot hold — negative, zero, fractional, not a number, or longer than a timer keeps', () => {
  for (const arg of ['-5', '0', '1.5', '1e400', 'Infinity', 'NaN', 'abc', '', ' ', String(MAX_EVERY_MS + 1)]) {
    const asked = everyOf(arg);
    assert.ok('refusal' in asked, JSON.stringify(arg));
    assert.equal(
      asked.refusal,
      `nemia up takes its pass interval in whole milliseconds, from 1 to 2147483647, and ${JSON.stringify(arg)} is not one: nemia up [ms], 4000 when none is given. The interval is written into daemon.json, and a holder whose interval does not read there holds nothing: a second nemia up would take the store from it while it ticks.`,
    );
  }
  assert.deepEqual(everyOf(undefined), { every: DEFAULT_EVERY_MS });
  for (const [arg, every] of [
    ['1', 1],
    ['10', 10],
    ['4000', 4000],
    [String(MAX_EVERY_MS), MAX_EVERY_MS],
  ] as const) {
    assert.deepEqual(everyOf(arg), { every }, arg);
    assert.equal(parseDaemonFile(text(holder({ every })))?.every, every, 'every interval taken is one the file reads back');
  }
});

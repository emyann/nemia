/**
 * GET /api/daemon (app.ts, daemon.ts): whether a `nemia up` ticks the store, judged by the package off `daemon.json` and the process table
 * as `nemia ls` judges it, and never written by the api — and the pure `daemonOf` under it. In the harness's scratch store
 * (`root`).
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { app } from '../app.ts';
import { daemonOf } from './daemon.ts';
import { daemonLine, PHASES, procStartOf, staleAfterMs, STALE_FLOOR_MS } from 'agent-orchestrator';
const FILE = path.join(root, 'daemon.json');
const STATS = path.join(root, 'tick-stats.json');

type Daemon = import('./daemon.ts').Daemon;
type DaemonFile = import('agent-orchestrator').DaemonFile;
type PassCostRead = import('agent-orchestrator').PassCostRead;

/** A pid no process has: above any `pid_max` Linux allows (2^22). */
const NO_PID = 2 ** 30;
const MIN = 60_000;
const ago = (ms: number, now = Date.now()) => new Date(now - ms).toISOString();

/**
 * A file as `nemia up` writes it: this test's own process, confirmed by its start, every 4 s, passed and beating `quiet` ago — each stamp
 * off one reading of the clock, so a step between two readings cannot set the pass after the beat.
 */
const written = (quiet: number, over: Partial<DaemonFile> = {}): DaemonFile => {
  const procStart = procStartOf(process.pid);
  const now = Date.now();
  return {
    pid: process.pid,
    startedAt: ago(quiet + 40 * MIN, now),
    cwd: '/work/repo',
    every: 4_000,
    passedAt: ago(quiet, now),
    beatAt: ago(quiet, now),
    ...(procStart !== undefined ? { procStart } : {}),
    ...over,
  };
};

const put = (file: DaemonFile | string) => fs.writeFileSync(FILE, typeof file === 'string' ? file : `${JSON.stringify(file, null, 2)}\n`);

/** GET /api/daemon, and the file as it stood before and after: the api writes nothing, whatever it reads. */
async function get(): Promise<Daemon> {
  const before = fs.existsSync(FILE) ? { text: fs.readFileSync(FILE, 'utf8'), mtimeMs: fs.statSync(FILE).mtimeMs } : undefined;
  const res = await app.request('/api/daemon');
  assert.equal(res.status, 200, await res.clone().text());
  const after = fs.existsSync(FILE) ? { text: fs.readFileSync(FILE, 'utf8'), mtimeMs: fs.statSync(FILE).mtimeMs } : undefined;
  assert.deepEqual(after, before, 'the api reads daemon.json and never writes it');
  return (await res.json()) as Daemon;
}

/** What a pass cost as the tick writes it (`recordPassCost`), at `at`, with what it could not read of a harness. */
const passAt = (at: string, unobserved?: string[]): PassCostRead => ({
  at,
  ms: 212,
  records: 12,
  bytes: 0,
  spawned: 1,
  overheadMs: 0.4,
  rested: 0,
  phases: Object.fromEntries(PHASES.map((p) => [p, { ms: 10, calls: 1, bytes: 0, reads: 1, spawned: 0 }])) as PassCostRead['phases'],
  harnesses: { claude: { calls: 1, ms: 30, listed: 3, spawned: 1, unread: 1 } },
  ...(unobserved ? { unobserved } : {}),
});

const UNREAD = ['harness `claude`: claude agents: timed out'];

test('GET /api/daemon: the standing of each daemon.json, as `nemia ls` judges it, and the file never written', async (t) => {
  t.afterEach(() => {
    fs.rmSync(FILE, { recursive: true, force: true });
    fs.rmSync(STATS, { force: true });
  });
  await t.test('with no daemon.json, nothing ticks the store, and the api makes none', async () => {
    const d = await get();
    assert.equal(d.kind, 'none');
    assert.equal(d.ticking, false);
    assert.equal(d.pid, null);
    assert.equal(
      d.line,
      'daemon: none has held this store — nothing ticks it; start one with npm start in apps/api, or nemia up where no board is served — or any nemia command that files work starts one',
    );
    assert.deepEqual([d.by, d.url, d.start], [null, null, 'npm start in apps/api']);
    assert.equal(fs.existsSync(FILE), false);
  });
  await t.test('a live nemia up heard from recently is ticking: its pid, where, since when, and its last pass', async () => {
    const file = written(3_000);
    put(file);
    const d = await get();
    assert.equal(d.kind, 'ticking');
    assert.equal(d.ticking, true);
    assert.equal(d.pid, process.pid);
    assert.equal(d.cwd, '/work/repo');
    assert.equal(d.every, 4_000);
    assert.equal(d.startedAt, file.startedAt);
    assert.equal(d.passedAt, file.passedAt);
    assert.equal(d.lastHeardAt, file.beatAt);
    assert.equal(d.stoppedAt, null);
    assert.equal(d.staleAfterMs, STALE_FLOOR_MS);
    assert.equal(d.identity, procStartOf(process.pid) === undefined ? 'unknown' : 'same');
    assert.match(d.line, new RegExp(`^nemia up: ticking, pid ${process.pid}, every 4000ms — last pass `));
    assert.deepEqual([d.by, d.url], ['wf up', null], 'a file that names no holder is a wf up, as it was written');
  });
  await t.test('a live api holding the store is ticking as the api, at the url it serves the board on', async () => {
    put(written(3_000, { by: 'api', url: 'http://127.0.0.1:8787' }));
    const d = await get();
    assert.equal(d.ticking, true);
    assert.deepEqual([d.by, d.url, d.start], ['api', 'http://127.0.0.1:8787', 'npm start in apps/api']);
    assert.match(d.line, new RegExp(`^api: ticking, pid ${process.pid} at http://127\\.0\\.0\\.1:8787, every 4000ms — `));
  });
  await t.test('a pass that runs long is still ticking: silence is measured from the beat, not from the last pass', async () => {
    put(written(3_000, { passedAt: ago(30 * MIN) }));
    const d = await get();
    assert.equal(d.kind, 'ticking');
    assert.equal(d.ticking, true);
  });
  await t.test(
    'a live nemia up is judged on the monotonic clock: wall stamps a stepped clock left twenty minutes behind are still ticking',
    async () => {
      const boot = fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
      const mono = { boot, ms: Number(process.hrtime.bigint() / 1_000_000n) };
      put(written(20 * MIN, { startedMono: mono, passedMono: mono, beatMono: mono }));
      const d = await get();
      assert.equal(d.kind, 'ticking', d.line);
    },
  );
  await t.test('REFUSED: a live nemia up silent past the stale mark is stalled, not ticking', async () => {
    const at = ago(20 * MIN);
    const file = written(20 * MIN, { passedAt: at, beatAt: at });
    put(file);
    const d = await get();
    assert.equal(d.kind, 'stalled');
    assert.equal(d.ticking, false);
    const [, pid, silent, lastPass, passedAt] =
      /^nemia up: stalled, pid (\d+), every 4000ms — alive, but silent for (\d+m\d{2}s): last pass (\d+m\d{2}s) ago \(([^)]+)\); /.exec(
        d.line,
      ) ?? [];
    assert.equal(Number(pid), process.pid, d.line);
    assert.equal(silent, lastPass, 'beat and pass at the same instant, judged at the same now: the same silence');
    assert.equal(passedAt, file.passedAt, "the file's last pass, as written");
  });
  await t.test('REFUSED: a nemia up that said it stopped is stopped, though its process lives', async () => {
    const stoppedAt = ago(5 * MIN);
    put(written(5 * MIN, { stoppedAt }));
    const d = await get();
    assert.equal(d.kind, 'stopped');
    assert.equal(d.ticking, false);
    assert.equal(d.stoppedAt, stoppedAt);
  });
  await t.test('REFUSED: a nemia up whose process is gone is gone, however recently it passed', async () => {
    put(written(1_000, { pid: NO_PID }));
    const d = await get();
    assert.equal(d.kind, 'gone');
    assert.equal(d.ticking, false);
    assert.equal(d.pid, NO_PID);
    assert.equal(d.identity, 'gone');
  });
  await t.test("REFUSED: a daemon.json that does not read as a nemia up's is unreadable, and the api leaves it as it is", async () => {
    put('{"pid": "not a pid"}\n');
    const d = await get();
    assert.equal(d.kind, 'unreadable');
    assert.equal(d.ticking, false);
    assert.equal(d.pid, null);
  });
  await t.test('REFUSED: a daemon.json that cannot be read is a 500 that says why, and not a store called free', async () => {
    fs.mkdirSync(FILE);
    const res = await app.request('/api/daemon');
    assert.equal(res.status, 500);
    const { error } = (await res.json()) as { error: string };
    assert.match(error, /EISDIR/);
    assert.equal(fs.statSync(FILE).isDirectory(), true);
  });
  await t.test(
    'a ticking daemon whose last pass could not read a harness says why; nobody else says it, nor a pass from before it started',
    async () => {
      put(written(0));
      fs.writeFileSync(STATS, JSON.stringify(passAt(new Date().toISOString(), UNREAD)));
      assert.deepEqual((await get()).unobserved, UNREAD);
      fs.writeFileSync(STATS, JSON.stringify(passAt(new Date().toISOString())));
      assert.deepEqual((await get()).unobserved, [], 'a pass that read every harness says nothing');
      fs.writeFileSync(STATS, JSON.stringify(passAt(ago(41 * MIN), UNREAD)));
      assert.deepEqual((await get()).unobserved, [], 'REFUSED: the last pass of a daemon before this one');
      fs.writeFileSync(STATS, JSON.stringify(passAt(new Date().toISOString(), UNREAD)));
      put(written(0, { stoppedAt: new Date().toISOString() }));
      assert.equal((await get()).kind, 'stopped');
      assert.deepEqual((await get()).unobserved, [], 'REFUSED: a daemon that stopped reads nothing now');
      fs.rmSync(FILE);
      assert.deepEqual((await get()).unobserved, [], 'nor where none ever ran');
    },
  );
});

test("daemonOf: the standing as facts, nemia ls's line with them, and what the last pass could not read", async (t) => {
  await t.test("daemonOf: the standing as facts, and nemia ls's line with them", () => {
    const now = Date.parse('2026-09-22T10:00:00.000Z');
    const file: DaemonFile = {
      pid: 42,
      startedAt: '2026-09-22T09:00:00.000Z',
      cwd: '/r',
      every: 120_000,
      passedAt: '2026-09-22T09:30:00.000Z',
      beatAt: '2026-09-22T09:35:00.000Z',
    };
    const standing = { kind: 'stalled' as const, file, last: Date.parse(file.beatAt!), quiet: 25 * MIN, identity: 'unknown' as const };
    assert.deepEqual(daemonOf(standing, now), {
      kind: 'stalled',
      by: 'wf up',
      url: null,
      start: 'npm start in apps/api',
      ticking: false,
      pid: 42,
      cwd: '/r',
      every: 120_000,
      startedAt: file.startedAt,
      passedAt: file.passedAt,
      lastHeardAt: file.beatAt,
      stoppedAt: null,
      staleAfterMs: staleAfterMs(120_000),
      identity: 'unknown',
      line: daemonLine(standing, now),
      unobserved: [],
    });
    assert.equal(staleAfterMs(120_000), 20 * MIN, 'ten of its intervals, over the floor');
    assert.equal(daemonOf({ kind: 'ticking', file, last: Date.parse(file.beatAt!), quiet: 0, identity: 'same' }, now).ticking, true);
    for (const standing of [{ kind: 'none' as const }, { kind: 'unreadable' as const, text: '{' }]) {
      const d = daemonOf(standing, now);
      assert.equal(d.ticking, false);
      assert.deepEqual(
        [d.pid, d.cwd, d.every, d.startedAt, d.passedAt, d.lastHeardAt, d.stoppedAt, d.staleAfterMs, d.identity],
        Array(9).fill(null),
      );
    }
  });
  await t.test('daemonOf: what the last pass could not read is said only of a ticking daemon, by a pass since its start', () => {
    const now = Date.parse('2026-09-22T10:00:00.000Z');
    const file: DaemonFile = {
      pid: 42,
      startedAt: '2026-09-22T09:00:00.000Z',
      cwd: '/r',
      every: 4_000,
      passedAt: '2026-09-22T09:59:58.000Z',
      beatAt: '2026-09-22T09:59:58.000Z',
    };
    const at = (kind: 'ticking' | 'stalled') => ({ kind, file, last: Date.parse(file.beatAt!), quiet: 2_000, identity: 'same' as const });
    assert.deepEqual(daemonOf(at('ticking'), now, passAt(file.startedAt, UNREAD)).unobserved, UNREAD, 'a pass at its start is its own');
    assert.deepEqual(daemonOf(at('ticking'), now, passAt('2026-09-22T08:59:59.999Z', UNREAD)).unobserved, []);
    assert.deepEqual(daemonOf(at('stalled'), now, passAt(file.passedAt!, UNREAD)).unobserved, []);
    assert.deepEqual(daemonOf(at('ticking'), now, null).unobserved, []);
  });
});

/**
 * GET /api/daemon (app.ts, daemon.ts): whether a `wf up` ticks the store, judged by the package off `daemon.json` and the process table as
 * `wf ls` judges it, and never written by the api — and the pure `daemonOf` under it. In the harness's scratch store
 * (`root`).
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { app } from '../app.ts';
import { daemonOf } from './daemon.ts';
import { daemonLine, procStartOf, staleAfterMs, STALE_FLOOR_MS } from 'agent-orchestrator';
const FILE = path.join(root, 'daemon.json');

type Daemon = import('./daemon.ts').Daemon;
type DaemonFile = import('agent-orchestrator').DaemonFile;

/** A pid no process has: above any `pid_max` Linux allows (2^22). */
const NO_PID = 2 ** 30;
const MIN = 60_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

/** A file as `wf up` writes it: this test's own process, confirmed by its start, every 4 s, passed and beating `quiet` ago. */
const written = (quiet: number, over: Partial<DaemonFile> = {}): DaemonFile => {
  const procStart = procStartOf(process.pid);
  return {
    pid: process.pid,
    startedAt: ago(quiet + 40 * MIN),
    cwd: '/work/repo',
    every: 4_000,
    passedAt: ago(quiet),
    beatAt: ago(quiet),
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

test.afterEach(() => fs.rmSync(FILE, { recursive: true, force: true }));

test('with no daemon.json, nothing ticks the store, and the api makes none', async () => {
  const d = await get();
  assert.equal(d.kind, 'none');
  assert.equal(d.ticking, false);
  assert.equal(d.pid, null);
  assert.equal(d.line, 'wf up: none has held this store — nothing ticks it; start one with wf up');
  assert.equal(fs.existsSync(FILE), false);
});

test('a live wf up heard from recently is ticking: its pid, where, since when, and its last pass', async () => {
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
  assert.match(d.line, new RegExp(`^wf up: ticking, pid ${process.pid}, every 4000ms — last pass `));
});

test('a pass that runs long is still ticking: silence is measured from the beat, not from the last pass', async () => {
  put(written(3_000, { passedAt: ago(30 * MIN) }));
  const d = await get();
  assert.equal(d.kind, 'ticking');
  assert.equal(d.ticking, true);
});

test('REFUSED: a live wf up silent past the stale mark is stalled, not ticking', async () => {
  const at = ago(20 * MIN);
  const file = written(20 * MIN, { passedAt: at, beatAt: at });
  put(file);
  const d = await get();
  assert.equal(d.kind, 'stalled');
  assert.equal(d.ticking, false);
  const [, pid, silent, lastPass, passedAt] =
    /^wf up: stalled, pid (\d+), every 4000ms — alive, but silent for (\d+m\d{2}s): last pass (\d+m\d{2}s) ago \(([^)]+)\); /.exec(
      d.line,
    ) ?? [];
  assert.equal(Number(pid), process.pid, d.line);
  assert.equal(silent, lastPass, 'beat and pass at the same instant, judged at the same now: the same silence');
  assert.equal(passedAt, file.passedAt, "the file's last pass, as written");
});

test('REFUSED: a wf up that said it stopped is stopped, though its process lives', async () => {
  const stoppedAt = ago(5 * MIN);
  put(written(5 * MIN, { stoppedAt }));
  const d = await get();
  assert.equal(d.kind, 'stopped');
  assert.equal(d.ticking, false);
  assert.equal(d.stoppedAt, stoppedAt);
});

test('REFUSED: a wf up whose process is gone is gone, however recently it passed', async () => {
  put(written(1_000, { pid: NO_PID }));
  const d = await get();
  assert.equal(d.kind, 'gone');
  assert.equal(d.ticking, false);
  assert.equal(d.pid, NO_PID);
  assert.equal(d.identity, 'gone');
});

test("REFUSED: a daemon.json that does not read as a wf up's is unreadable, and the api leaves it as it is", async () => {
  put('{"pid": "not a pid"}\n');
  const d = await get();
  assert.equal(d.kind, 'unreadable');
  assert.equal(d.ticking, false);
  assert.equal(d.pid, null);
});

test('REFUSED: a daemon.json that cannot be read is a 500 that says why, and not a store called free', async () => {
  fs.mkdirSync(FILE);
  const res = await app.request('/api/daemon');
  assert.equal(res.status, 500);
  const { error } = (await res.json()) as { error: string };
  assert.match(error, /EISDIR/);
  assert.equal(fs.statSync(FILE).isDirectory(), true);
});

test("daemonOf: the standing as facts, and wf ls's line with them", () => {
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

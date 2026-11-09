/**
 * What Claude Code's runner reads off a job's hold file into its sighting (`heldSighting`, `harness/claude/code.ts`): the call it is
 * in and the call it holds back while it works, its end under the sessions' drain once it has ended, and — for a job whose worker died
 * with no end written (a stale lease) — whether it is read `parked`, to be continued, or failed, as an ordinary crash is.
 *
 * Over the files a worker and a job's process leave: a run file, the hold file beside it and the store's sessions' drain, each written
 * here, read through the runner's own look (`observe`). No process runs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { scratch } from 'test-kit/scratch';
import { claudeCodeOps } from '../src/harness/claude/code.ts';
import { writeJobHold, type JobHold } from '../src/harness/claude/job-hold.ts';
import { putSessionDrain } from '../src/core/engine/drain.ts';
import { STALE_MS } from '../src/harness/detached/detached.ts';
import type { Sighting } from '../src/core/index.ts';

const JOB_ID = '5e551011-0000-4000-8000-0000000000d1';

const CALL = { tool: 'Bash', since: '2026-11-03T10:00:00.000Z' };

/**
 * The runner's sighting of one job whose worker wrote `run` (its state, its heartbeat's age, its session id), with `hold` beside it
 * and the sessions' drain put where `drained`.
 */
const sightingOf = async (run: { state: string; staleMs?: number; nativeId?: string }, hold?: JobHold, drained = false) => {
  const root = scratch('ae-hold-look-');
  const dir = path.join(root, 'runs', 'claude');
  fs.mkdirSync(dir, { recursive: true });
  const name = 'ae/h1/1';
  const at = new Date(Date.now() - (run.staleMs ?? 0)).toISOString();
  fs.writeFileSync(
    path.join(dir, 'ae_h1_1.json'),
    JSON.stringify({
      name,
      state: run.state,
      pid: 999_999,
      logFile: '/dev/null',
      heartbeatAt: at,
      startedAt: at,
      ...(run.nativeId ? { nativeId: run.nativeId } : {}),
      ...(run.state === 'working' ? {} : { exitCode: 1 }),
    }),
  );
  if (hold) writeJobHold(path.join(dir, 'ae_h1_1.hold'), hold);
  if (drained) putSessionDrain(root, { graceMs: 60_000 });
  const seen = await Effect.runPromise(claudeCodeOps({ root }).observe);
  const s = seen.get(name);
  assert.ok(s, `the job is seen: ${JSON.stringify([...seen.keys()])}`);
  return s;
};

/** A run file whose worker stopped beating long ago, `working` still: a worker killed, or a machine gone. */
const LOST = { state: 'working', staleMs: STALE_MS + 10 * 60_000, nativeId: JOB_ID };

/** What of a sighting this test reads: its state and the hold's facts. */
const factsOf = (s: Sighting) => ({ state: s.state, calling: s.calling, heldBack: s.heldBack, parked: s.parked });

test('a job’s hold file, read into its sighting, and which lost job reads parked', async (t) => {
  await t.test('while it works: the call it is in and the call it holds back', async () => {
    const s = await sightingOf({ state: 'working', nativeId: JOB_ID }, { calling: CALL, heldBack: { since: CALL.since } });
    assert.deepEqual(factsOf(s), { state: 'working', calling: CALL, heldBack: { since: CALL.since }, parked: undefined });
  });
  await t.test('held after a call: the call it stopped after, carried on `heldBack.after`', async () => {
    const heldBack = { since: CALL.since, after: { tool: 'Read' } };
    const s = await sightingOf({ state: 'working', nativeId: JOB_ID }, { heldBack });
    assert.deepEqual(s.heldBack, heldBack);
  });
  await t.test('ended parked: `parked` with the call it cut, read failed', async () => {
    const s = await sightingOf({ state: 'failed', nativeId: JOB_ID }, { parked: { at: CALL.since, calling: CALL } });
    assert.deepEqual(factsOf(s), { state: 'failed', calling: undefined, heldBack: undefined, parked: { calling: CALL } });
  });
  await t.test('a lost job held back: parked, with its last call', async () => {
    const s = await sightingOf(LOST, { calling: CALL, heldBack: { since: CALL.since } });
    assert.deepEqual([s.state, s.parked], ['failed', { calling: CALL }]);
  });
  await t.test('a lost job draining: parked, with its last call', async () => {
    const s = await sightingOf(LOST, { calling: CALL, draining: { since: CALL.since } });
    assert.deepEqual([s.state, s.parked], ['failed', { calling: CALL }]);
  });
  await t.test('a lost job with no hold fact while a sessions’ drain stands: parked', async () => {
    const s = await sightingOf(LOST, undefined, true);
    assert.deepEqual([s.state, s.parked], ['failed', {}]);
  });
  await t.test('REFUSED: a lost job with no hold fact and no drain is failed, as an ordinary crash, and not parked', async () => {
    const s = await sightingOf(LOST, { calling: CALL });
    assert.deepEqual([s.state, s.parked], ['failed', undefined]);
  });
  await t.test('REFUSED: a lost job with no session id is failed whatever its hold file says: there is nothing to resume', async () => {
    const s = await sightingOf({ ...LOST, nativeId: undefined }, { calling: CALL, heldBack: { since: CALL.since } }, true);
    assert.deepEqual([s.state, s.parked], ['failed', undefined]);
  });
  await t.test('REFUSED: a job whose worker wrote its failure, not lost, is not parked by a drain standing', async () => {
    const s = await sightingOf({ state: 'failed', nativeId: JOB_ID }, { draining: { since: CALL.since } }, true);
    assert.deepEqual([s.state, s.parked], ['failed', undefined]);
  });
});

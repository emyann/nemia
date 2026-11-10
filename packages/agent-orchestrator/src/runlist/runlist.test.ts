/**
 * The version a watch compares a run at (`runWatchVersion`, `runlist.ts`): its frame's time left out exactly where it is measured to the
 * read. Pure: hand-built objects, no store.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { WatchedObject } from 'objects';
import { runWatchVersion } from './runlist.ts';

/** An instant `h` hours and `m` minutes into the fixtures' day. */
const at = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 4, h, m)).toISOString();

/** A Run as a watch reads it, its status `status`. */
const watched = (status: unknown): WatchedObject => ({
  apiVersion: 'nemia/v1',
  kind: 'Run',
  metadata: { name: 'r-1', namespace: 'default', creationTimestamp: at(10), resourceVersion: '1' },
  status,
});

/** A by-state Run's status in `state`, its frame's time measured to `wallMs`, and `more` over it. */
const framed = (state: string, wallMs: number, more: Record<string, unknown> = {}) => ({
  state,
  phase: 'running',
  wallMs,
  clock: { wallMs, sessionsMs: wallMs, checksMs: 0, personMs: 0, slotMs: 0, restMs: 0 },
  waitingSince: at(10),
  steps: [{ name: 'plan', phase: 'running' }],
  stepCosts: { plan: 0.1 },
  ...more,
});

test("a watch compares a run leaving out its frame's time exactly where it is measured to the read", async (t) => {
  const rows: { name: string; a: WatchedObject; b: WatchedObject; same: boolean }[] = [
    {
      name: 'two waiting runs apart only in their time',
      a: watched(framed('waiting', 1000)),
      b: watched(framed('waiting', 9000)),
      same: true,
    },
    {
      name: 'two runs in flight apart only in their time',
      a: watched(framed('inFlight', 1000)),
      b: watched(framed('inFlight', 9000)),
      same: true,
    },
    {
      name: "two waiting runs apart in a step's status",
      a: watched(framed('waiting', 1000)),
      b: watched(framed('waiting', 1000, { steps: [{ name: 'plan', phase: 'succeeded' }] })),
      same: false,
    },
    {
      name: 'two waiting runs apart in when they began to wait',
      a: watched(framed('waiting', 1000)),
      b: watched(framed('waiting', 1000, { waitingSince: at(11) })),
      same: false,
    },
    {
      name: "two waiting runs apart in a step's cost",
      a: watched(framed('waiting', 1000)),
      b: watched(framed('waiting', 1000, { stepCosts: { plan: 0.2 } })),
      same: false,
    },
    {
      name: 'a run that moved from waiting to in flight',
      a: watched(framed('waiting', 1000)),
      b: watched(framed('inFlight', 1000)),
      same: false,
    },
    {
      name: 'two finished runs apart in their frozen time',
      a: watched(framed('finished', 1000)),
      b: watched(framed('finished', 9000)),
      same: false,
    },
    {
      name: 'two runs with no state, of a plain list, apart in their wall time',
      a: watched({ phase: 'running', wallMs: 1000 }),
      b: watched({ phase: 'running', wallMs: 9000 }),
      same: false,
    },
    { name: 'two runs whose state is no run state', a: watched(framed('later', 1000)), b: watched(framed('later', 9000)), same: false },
    { name: 'an object whose status is no object', a: watched('waiting'), b: watched('inFlight'), same: false },
  ];
  for (const row of rows) await t.test(row.name, () => assert.equal(runWatchVersion(row.a) === runWatchVersion(row.b), row.same));
  await t.test('an object with no status, or a status that is no object, is compared as its JSON', () => {
    const bare: WatchedObject = {
      apiVersion: 'nemia/v1',
      kind: 'Run',
      metadata: { name: 'r-1', creationTimestamp: at(10), resourceVersion: '1' },
    };
    assert.equal(runWatchVersion(bare), JSON.stringify(bare));
    assert.equal(runWatchVersion(watched('waiting')), JSON.stringify(watched('waiting')));
  });
  await t.test('a finished run is compared as its JSON', () => {
    const done = watched(framed('finished', 1000));
    assert.equal(runWatchVersion(done), JSON.stringify(done));
  });
});

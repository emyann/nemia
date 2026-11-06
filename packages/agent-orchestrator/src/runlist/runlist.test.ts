/**
 * The rules of a run's state in the board's list (`runlist.ts`): the state of each run the bell and the floor name, when a finished run
 * finished, its outcome, a run's wall time and the instant its clock is read at, and the factory kept. Pure: hand-built summaries, no
 * store. The order of the finished runs and their page are run-list.ts's (`finishedBefore`, `finishedPageOf`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { WatchedObject } from 'objects';
import { clockUntilOf, finishedAtOf, inFactory, kindOf, type Listed, outcomeOf, runWatchVersion, wallMsOf } from './runlist.ts';

/** An instant `h` hours and `m` minutes into the fixtures' day. */
const at = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 4, h, m)).toISOString();

/** A run that succeeded, created at 10:00, its work ended at 10:30, and `more` over it. */
const listed = (more: Partial<Listed> = {}): Listed => ({
  id: 'r-1',
  factory: null,
  createdAt: at(10),
  cancelledAt: null,
  status: 'succeeded',
  moving: false,
  waitingOnYou: [],
  waiting: null,
  holding: null,
  atWork: { endedAt: at(10, 30) },
  toDecide: null,
  ...more,
});

test('a run is waiting where the bell counts it, though it still moves; in flight where it moves or runs; finished otherwise', () => {
  assert.equal(kindOf(listed({ status: 'failed', waitingOnYou: ['plan'] })), 'waiting', 'a step at its gate');
  assert.equal(kindOf(listed({ status: 'failed', moving: true, waitingOnYou: ['plan'] })), 'waiting', 'it moves and waits: waiting, once');
  assert.equal(kindOf(listed({ status: 'running', waiting: { waitingOnYou: true } })), 'waiting', 'a run it waits on never lands');
  assert.equal(kindOf(listed({ status: 'running', holding: { waitingOnYou: true } })), 'waiting', 'a hold only a person lifts');
  assert.equal(kindOf(listed({ status: 'running' })), 'inFlight');
  assert.equal(kindOf(listed({ status: 'failed', moving: true })), 'inFlight', 'a fan-out read failed while a sibling works');
  assert.equal(
    kindOf(listed({ status: 'running', moving: true, waiting: { waitingOnYou: false } })),
    'inFlight',
    'runs that may still land',
  );
  assert.equal(kindOf(listed({ status: 'running', moving: true, holding: { waitingOnYou: false } })), 'inFlight', 'a hold that may lift');
  assert.equal(kindOf(listed()), 'finished');
  assert.equal(kindOf(listed({ status: 'failed' })), 'finished');
});

test('REFUSED as waiting: a cancelled run whose step waited, and a finished run whose result nobody decided', () => {
  assert.equal(kindOf(listed({ status: 'cancelled', cancelledAt: at(11), waitingOnYou: ['plan'] })), 'finished');
  const undecided = listed({ toDecide: { kind: 'result' } });
  assert.equal(kindOf(undecided), 'finished');
  assert.equal(outcomeOf(undecided), 'undecided');
});

test('a finished run ended cancelled, undecided, succeeded or failed, asked in that order', () => {
  assert.equal(outcomeOf(listed({ cancelledAt: at(11), toDecide: { kind: 'result' } })), 'cancelled');
  assert.equal(outcomeOf(listed({ toDecide: { kind: 'result' } })), 'undecided');
  assert.equal(outcomeOf(listed()), 'succeeded');
  assert.equal(outcomeOf(listed({ status: 'failed' })), 'failed');
  assert.equal(outcomeOf(listed({ status: 'running' })), 'failed', 'a run that stopped moving without an end');
});

test("a finished run finished at the later of its work's end and its cancellation, and at its creation where it has neither", () => {
  assert.equal(finishedAtOf(listed()), at(10, 30));
  assert.equal(finishedAtOf(listed({ cancelledAt: at(11) })), at(11), 'cancelled after its last session ended');
  assert.equal(finishedAtOf(listed({ cancelledAt: at(10, 15) })), at(10, 30), 'its session ended after the cancellation');
  assert.equal(finishedAtOf(listed({ atWork: null, cancelledAt: at(10, 5) })), at(10, 5));
  assert.equal(finishedAtOf(listed({ atWork: { endedAt: null } })), at(10));
});

test("a run's wall time runs from its creation until its work stopped, or until now for one not finished, and is never negative", () => {
  const now = Date.parse(at(12));
  assert.equal(wallMsOf(listed(), now), 30 * 60_000);
  assert.equal(wallMsOf(listed({ status: 'running', atWork: { endedAt: null } }), now), 120 * 60_000);
  assert.equal(wallMsOf(listed({ status: 'failed', waitingOnYou: ['plan'] }), now), 120 * 60_000, 'a run that waits is not finished');
  assert.equal(wallMsOf(listed({ status: 'running' }), Date.parse(at(9))), 0);
});

test("a run's clock is read at its finish for a finished run, and at now for one still going, whatever now is handed in", () => {
  const done = listed();
  assert.equal(clockUntilOf(done, Date.parse(at(12))), Date.parse(at(10, 30)));
  assert.equal(clockUntilOf(done, Date.parse(at(23))), Date.parse(at(10, 30)), 'frozen where its work ended, however late it is read');
  assert.equal(clockUntilOf(listed({ status: 'running', atWork: { endedAt: null } }), Date.parse(at(12))), Date.parse(at(12)));
  assert.equal(
    clockUntilOf(listed({ status: 'failed', waitingOnYou: ['plan'] }), Date.parse(at(12))),
    Date.parse(at(12)),
    'a run that waits is not finished, so its clock counts on',
  );
  assert.equal(clockUntilOf(listed({ atWork: { endedAt: null } }), Date.parse(at(12))), Date.parse(at(10)), 'no finish time: its creation');
  for (const run of [done, listed({ status: 'running' }), listed({ atWork: null, cancelledAt: at(10, 5) })])
    assert.equal(
      wallMsOf(run, Date.parse(at(12))),
      Math.max(0, clockUntilOf(run, Date.parse(at(12))) - Date.parse(run.createdAt)),
      "a row's wall time is measured to the same instant its clock is read at",
    );
});

test('a read keeps the runs of one factory, a run that names none being of the default one, and every run where none is asked', () => {
  const runs = [listed({ id: 'a', factory: 'nemia' }), listed({ id: 'b' }), listed({ id: 'c', factory: 'pipao' })];
  const kept = (factory: string | undefined) => runs.filter(inFactory(factory)).map((run) => run.id);
  assert.deepEqual(kept(undefined), ['a', 'b', 'c']);
  assert.deepEqual(kept('nemia'), ['a']);
  assert.deepEqual(kept('default'), ['b']);
  assert.deepEqual(kept('no-such'), []);
});

/** A Run as a watch reads it, its status `status`. */
const watched = (status: unknown): WatchedObject => ({
  apiVersion: 'nemia/v1',
  kind: 'Run',
  metadata: { name: 'r-1', namespace: 'default' },
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
    { name: 'two waiting runs apart only in their time', a: watched(framed('waiting', 1000)), b: watched(framed('waiting', 9000)), same: true },
    { name: 'two runs in flight apart only in their time', a: watched(framed('inFlight', 1000)), b: watched(framed('inFlight', 9000)), same: true },
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
    { name: 'two finished runs apart in their frozen time', a: watched(framed('finished', 1000)), b: watched(framed('finished', 9000)), same: false },
    {
      name: 'two runs with no state, of a plain list, apart in their wall time',
      a: watched({ phase: 'running', wallMs: 1000 }),
      b: watched({ phase: 'running', wallMs: 9000 }),
      same: false,
    },
    { name: 'two runs whose state is no run state', a: watched(framed('later', 1000)), b: watched(framed('later', 9000)), same: false },
    { name: 'an object whose status is no object', a: watched('waiting'), b: watched('inFlight'), same: false },
  ];
  for (const row of rows)
    await t.test(row.name, () => assert.equal(runWatchVersion(row.a) === runWatchVersion(row.b), row.same));
  await t.test('an object with no status, or a status that is no object, is compared as its JSON', () => {
    const bare: WatchedObject = { apiVersion: 'nemia/v1', kind: 'Run', metadata: { name: 'r-1' } };
    assert.equal(runWatchVersion(bare), JSON.stringify(bare));
    assert.equal(runWatchVersion(watched('waiting')), JSON.stringify(watched('waiting')));
  });
  await t.test('a finished run is compared as its JSON', () => {
    const done = watched(framed('finished', 1000));
    assert.equal(runWatchVersion(done), JSON.stringify(done));
  });
});

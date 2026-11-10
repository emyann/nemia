/**
 * The rules of a run's state in the board's list (`run-state.ts`): the state of each run the bell and the floor name, when a finished run
 * finished, its outcome, a run's wall time and the instant its clock is read at, and the factory kept. Pure: hand-built summaries, no
 * store. The order of the finished runs and their page are run-list.ts's (`finishedBefore`, `finishedPageOf`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clockUntilOf, finishedAtOf, runInFactory, kindOf, type Listed, outcomeOf, wallMsOf } from './run-state.ts';

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
  const runs = [listed({ id: 'a', factory: 'acme' }), listed({ id: 'b' }), listed({ id: 'c', factory: 'other' })];
  const kept = (factory: string | undefined) => runs.filter(runInFactory(factory)).map((run) => run.id);
  assert.deepEqual(kept(undefined), ['a', 'b', 'c']);
  assert.deepEqual(kept('acme'), ['a']);
  assert.deepEqual(kept('default'), ['b']);
  assert.deepEqual(kept('no-such'), []);
});

/**
 * The rules of the two reads of the runs (`runlist.ts`): the kind of each run the bell and the floor name, when a finished run finished
 * and in what order, its outcome, a run's wall time, the factory kept, and a page with each refusal of one asked wrongly. Pure: hand-built
 * summaries, no store.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  byFinished,
  clockUntilOf,
  finishedAtOf,
  inFactory,
  kindOf,
  type Listed,
  outcomeOf,
  pageAsked,
  pageOf,
  wallMsOf,
} from './runlist.ts';

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
  assert.equal(kindOf(listed({ status: 'running', waiting: { onYou: true } })), 'waiting', 'a run it waits on never lands');
  assert.equal(kindOf(listed({ status: 'running', holding: { onYou: true } })), 'waiting', 'a hold only a person lifts');
  assert.equal(kindOf(listed({ status: 'running' })), 'inFlight');
  assert.equal(kindOf(listed({ status: 'failed', moving: true })), 'inFlight', 'a fan-out read failed while a sibling works');
  assert.equal(kindOf(listed({ status: 'running', moving: true, waiting: { onYou: false } })), 'inFlight', 'runs that may still land');
  assert.equal(kindOf(listed({ status: 'running', moving: true, holding: { onYou: false } })), 'inFlight', 'a hold that may lift');
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

test('the finished runs come by when their work stopped, newest first, not by when they were created; two together by id', () => {
  const a = listed({ id: 'a', createdAt: at(8), atWork: { endedAt: at(12) } });
  const b = listed({ id: 'b', createdAt: at(9), atWork: { endedAt: at(10) } });
  const c = listed({ id: 'c', createdAt: at(9, 30), atWork: { endedAt: at(10, 30) }, cancelledAt: at(11) });
  const d = listed({ id: 'd', createdAt: at(7), atWork: { endedAt: at(11) }, status: 'failed' });
  const ordered = [d, c, b, a].sort(byFinished).map((run) => run.id);
  assert.deepEqual(ordered, ['a', 'c', 'd', 'b']);
  const byCreation = [d, c, b, a].sort((x, y) => y.createdAt.localeCompare(x.createdAt)).map((run) => run.id);
  assert.notDeepEqual(ordered, byCreation, 'the fixture finishes in another order than it was created');
});

test('a read keeps the runs of one factory, a run that names none being of the default one, and every run where none is asked', () => {
  const runs = [listed({ id: 'a', factory: 'nemia' }), listed({ id: 'b' }), listed({ id: 'c', factory: 'pipao' })];
  const kept = (factory: string | undefined) => runs.filter(inFactory(factory)).map((run) => run.id);
  assert.deepEqual(kept(undefined), ['a', 'b', 'c']);
  assert.deepEqual(kept('nemia'), ['a']);
  assert.deepEqual(kept('default'), ['b']);
  assert.deepEqual(kept('no-such'), []);
});

test('a page asked without a page or a size is page 1 of nine; each is read off its digits', () => {
  assert.deepEqual(pageAsked({}), { page: 1, size: 9 });
  assert.deepEqual(pageAsked({ page: '3', size: '100' }), { page: 3, size: 100 });
});

test('REFUSED: a page that is no whole number from 1, and a size that is none from 1 to 100, each naming its key', () => {
  for (const page of ['0', '-1', '1.5', 'abc', '', ' 2', '1e2']) {
    const asked = pageAsked({ page });
    assert.ok('refused' in asked, `page ${JSON.stringify(page)}`);
    assert.equal(asked.refused, `page takes a whole number from 1, as in page=2, and \`${page}\` is none.`);
  }
  for (const size of ['0', '101', 'abc', '', '2.5']) {
    const asked = pageAsked({ size });
    assert.ok('refused' in asked, `size ${JSON.stringify(size)}`);
    assert.equal(asked.refused, `size takes a whole number from 1 to 100, as in size=9, and \`${size}\` is none.`);
  }
});

test('a page is its slice of the rows, with the total and the pages there are; a page past the last is empty', () => {
  const rows = ['a', 'b', 'c', 'd', 'e'];
  assert.deepEqual(pageOf(rows, 1, 2), { total: 5, page: 1, size: 2, pages: 3, runs: ['a', 'b'] });
  assert.deepEqual(pageOf(rows, 3, 2), { total: 5, page: 3, size: 2, pages: 3, runs: ['e'] });
  assert.deepEqual(pageOf(rows, 4, 2), { total: 5, page: 4, size: 2, pages: 3, runs: [] });
  assert.deepEqual(pageOf([], 1, 9), { total: 0, page: 1, size: 9, pages: 1, runs: [] });
});

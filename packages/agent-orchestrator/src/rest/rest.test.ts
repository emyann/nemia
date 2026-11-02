/**
 * What makes a run at rest (`atRest`), and which runs the engine's feed takes out of the tick's memo (`evictedBy`): pure, so each guard is
 * made to refuse on data. What the memo saves a pass, and that every input moves it, is
 * proven on a store in rest-store.test.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { atRest, evictedBy, restBlockers, type RestFacts } from './rest.ts';

/** A run at rest: succeeded, frozen, every task settled, nothing due, nothing done, nothing said, nothing of another run read. */
const RESTING: RestFacts = {
  run: { workflow: [] },
  status: 'succeeded',
  due: { ready: [], check: [], retry: [], round: [], waitingOnCheckout: [] },
  settled: true,
  acted: false,
  notes: [],
  handOffDue: [],
  landingOwed: false,
  checkoutAsked: false,
  waiting: [],
  inFlight: false,
  held: false,
};

const PRUNED = { at: '2026-09-25T10:00:00.000Z', worktrees: [] };
const HOLD = { at: '2026-09-25T10:00:00.000Z', until: ['other'] };

/**
 * Each row a run's facts and the clauses that hold it out of the memo (`restBlockers`), none for a run at rest; `atRest` agrees with
 * each. Why each clause holds a run out is its row's name.
 */
const CLAUSES: Array<[string, Partial<RestFacts>, string[]]> = [
  ['a finished run, frozen, settled, nothing due, done, said or read of another run, is at rest', {}, []],
  ['failed rests', { status: 'failed' }, []],
  ['a gate waiting on a person is a run that stopped', { status: 'awaiting approval' }, []],
  ['and so is a step waiting on an answer', { status: 'waiting' }, []],
  ['cancelled rests', { status: 'cancelled' }, []],
  [
    'a pruned run rests, whatever its steps say: nothing more is filed for it',
    { status: 'running', run: { workflow: [], pruned: PRUNED } },
    [],
  ],
  ['REFUSED: a run still running', { status: 'running' }, ['status']],
  ['REFUSED: a record whose workflow is not frozen on it reads its folder, which the memo does not watch', { run: {} }, ['workflow']],
  ['REFUSED: held: whether the runs it names landed is theirs', { run: { workflow: [], hold: HOLD } }, ['hold']],
  ['REFUSED: a task not settled — at work, waiting for a word, unknown to the engine — moves on its own', { settled: false }, ['settled']],
  ['REFUSED: anything the pass did is a pass the next must repeat', { acted: true }, ['acted']],
  ['REFUSED: a step ready', { due: { ...RESTING.due, ready: ['work'] } }, ['due.ready']],
  ['REFUSED: a check due', { due: { ...RESTING.due, check: ['work'] } }, ['due.check']],
  ['REFUSED: a retry due', { due: { ...RESTING.due, retry: [{ step: 'work', try: 2, by: 'ask', mode: 'continue' }] } }, ['due.retry']],
  ['REFUSED: a round due', { due: { ...RESTING.due, round: [{ step: 'review', target: 'work', round: 2, by: 'again' }] } }, ['due.round']],
  ['REFUSED: a step waiting on the checkout', { due: { ...RESTING.due, waitingOnCheckout: ['work'] } }, ['due.waitingOnCheckout']],
  ['REFUSED: notes are said on every pass', { notes: ['work: an ask that cannot be read'] }, ['notes']],
  ['REFUSED: a hand-off git refused is tried on every pass', { handOffDue: ['work'] }, ['handOffDue']],
  ['REFUSED: an ending that has not landed', { landingOwed: true }, ['landingOwed']],
  ['REFUSED: a claim on the checkout moves with another run', { checkoutAsked: true }, ['checkoutAsked']],
  ['REFUSED: a run waited on moves with that run', { waiting: [{ run: 'other' }] }, ['waiting']],
  ['REFUSED: in flight', { inFlight: true }, ['inFlight']],
  ['REFUSED: held by the cap: a slot moves with another run', { held: true }, ['held']],
  ['REFUSED: every clause, in order', { settled: false, notes: ['said'], inFlight: true }, ['settled', 'notes', 'inFlight']],
];

test('the rest clauses: restBlockers names each clause that holds a run out, and none of a run at rest, and atRest agrees', async (t) => {
  for (const [name, change, clauses] of CLAUSES)
    await t.test(name, () => {
      const facts = { ...RESTING, ...change };
      assert.deepEqual(restBlockers(facts), clauses);
      assert.equal(atRest(facts), clauses.length === 0);
    });
});

test('a task on the feed takes out the run whose id and a dash begin it — a step, a try, a check — and nothing else', () => {
  const ids = new Set(['fix-a', 'fix-a-b', 'other']);
  assert.deepEqual([...evictedBy(['fix-a-work'], ids)].sort(), ['fix-a'], 'a step');
  assert.deepEqual([...evictedBy(['fix-a-work-try2-check'], ids)].sort(), ['fix-a'], "a try's check");
  assert.deepEqual(
    [...evictedBy(['fix-a-b-work'], ids)].sort(),
    ['fix-a', 'fix-a-b'],
    "a run whose id begins another's goes with it: more work, never less",
  );
  assert.deepEqual(
    [...evictedBy(['fix-ab-work', 'otherwise-work', 'fix', 'other'], ids)],
    [],
    "an id that only begins with the run's letters, or is the run's own, is none of its tasks",
  );
  assert.deepEqual([...evictedBy([], ids)], []);
});

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

test('a finished run, frozen, settled, with nothing due, done, said or read of another run, is at rest — failed and cancelled too', () => {
  assert.equal(atRest(RESTING), true);
  assert.equal(atRest({ ...RESTING, status: 'failed' }), true);
  assert.equal(atRest({ ...RESTING, status: 'awaiting approval' }), true, 'a gate waiting on a person is a run that stopped');
  assert.equal(atRest({ ...RESTING, status: 'waiting' }), true, 'and so is a step waiting on an answer');
  assert.deepEqual(
    (['awaiting approval', 'waiting', 'running'] as const).map((status) => restBlockers({ ...RESTING, status })),
    [[], [], ['status']],
    'only a run still running is kept out by its status',
  );
  assert.equal(atRest({ ...RESTING, status: 'cancelled' }), true);
  assert.equal(
    atRest({ ...RESTING, status: 'running', run: { workflow: [], pruned: { at: '2026-09-25T10:00:00.000Z', worktrees: [] } } }),
    true,
    'a pruned run rests, whatever its steps say: nothing more is filed for it',
  );
});

test('REFUSED: a run still running, or held, rests nowhere', () => {
  assert.equal(atRest({ ...RESTING, status: 'running' }), false, 'running');
  assert.equal(
    atRest({ ...RESTING, run: { workflow: [], hold: { at: '2026-09-25T10:00:00.000Z', until: ['other'] } } }),
    false,
    'held: whether the runs it names landed is theirs',
  );
});

test('REFUSED: a record whose workflow is not frozen on it reads its folder, which the memo does not watch', () => {
  assert.equal(atRest({ ...RESTING, run: {} }), false);
});

test('REFUSED: a task not settled — at work, waiting for a word, unknown to the engine — moves on its own', () => {
  assert.equal(atRest({ ...RESTING, settled: false }), false);
});

test('REFUSED: anything due, and anything the pass did, is a pass the next must repeat', () => {
  for (const key of ['ready', 'check', 'waitingOnCheckout'] as const)
    assert.equal(atRest({ ...RESTING, due: { ...RESTING.due, [key]: ['work'] } }), false, key);
  assert.equal(
    atRest({ ...RESTING, due: { ...RESTING.due, retry: [{ step: 'work', try: 2, by: 'ask', mode: 'continue' }] } }),
    false,
    'retry',
  );
  assert.equal(
    atRest({ ...RESTING, due: { ...RESTING.due, round: [{ step: 'review', target: 'work', round: 2, by: 'again' }] } }),
    false,
    'round',
  );
  assert.equal(atRest({ ...RESTING, acted: true }), false, 'acted');
});

test('REFUSED: notes, a hand-off git refused, and an ending that has not landed are said or tried on every pass', () => {
  assert.equal(atRest({ ...RESTING, notes: ['work: an ask that cannot be read'] }), false, 'notes');
  assert.equal(atRest({ ...RESTING, handOffDue: ['work'] }), false, 'a hand-off still due');
  assert.equal(atRest({ ...RESTING, landingOwed: true }), false, 'a landing owed');
});

test('REFUSED: what another run says — a claim on the checkout, a run waited on, a slot — moves with that run', () => {
  assert.equal(atRest({ ...RESTING, checkoutAsked: true }), false, 'the checkout');
  assert.equal(atRest({ ...RESTING, waiting: [{ run: 'other' }] }), false, 'waiting');
  assert.equal(atRest({ ...RESTING, inFlight: true }), false, 'in flight');
  assert.equal(atRest({ ...RESTING, held: true }), false, 'held by the cap');
});

test("restBlockers names each clause that holds a run out, and none of a run at rest: what the memo's check and a count by clause read", () => {
  assert.deepEqual(restBlockers(RESTING), []);
  const cases: Array<[string, Partial<RestFacts>]> = [
    ['status', { status: 'running' }],
    ['workflow', { run: {} }],
    ['hold', { run: { workflow: [], hold: { at: '2026-09-25T10:00:00.000Z', until: ['other'] } } }],
    ['settled', { settled: false }],
    ['acted', { acted: true }],
    ['due.ready', { due: { ...RESTING.due, ready: ['work'] } }],
    ['due.check', { due: { ...RESTING.due, check: ['work'] } }],
    ['due.retry', { due: { ...RESTING.due, retry: [{ step: 'work', try: 2, by: 'ask', mode: 'continue' }] } }],
    ['due.round', { due: { ...RESTING.due, round: [{ step: 'review', target: 'work', round: 2, by: 'again' }] } }],
    ['due.waitingOnCheckout', { due: { ...RESTING.due, waitingOnCheckout: ['work'] } }],
    ['notes', { notes: ['work: said'] }],
    ['handOffDue', { handOffDue: ['work'] }],
    ['landingOwed', { landingOwed: true }],
    ['checkoutAsked', { checkoutAsked: true }],
    ['waiting', { waiting: [{ run: 'other' }] }],
    ['inFlight', { inFlight: true }],
    ['held', { held: true }],
  ];
  for (const [clause, change] of cases) {
    const f = { ...RESTING, ...change };
    assert.deepEqual(restBlockers(f), [clause], clause);
    assert.equal(atRest(f), false, `${clause}: atRest agrees`);
  }
  assert.deepEqual(
    restBlockers({ ...RESTING, settled: false, notes: ['said'], inFlight: true }),
    ['settled', 'notes', 'inFlight'],
    'every clause, in order',
  );
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

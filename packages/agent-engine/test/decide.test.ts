/**
 * `decide` is the engine. It is pure, so this file is the one that has to be exhaustive —
 * and it needs no database, no harness and no clock it did not bring.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, fold, nameFor, type Event, type Observed, type Sighting } from '../src/domain.ts';

const T0 = new Date('2026-01-01T00:00:00Z');
const at = (ms: number) => new Date(T0.getTime() + ms).toISOString();
const now = (ms = 0, graceMs = 30_000, used = 0, max = Infinity) => ({ at: new Date(T0.getTime() + ms), graceMs, used, max });
const TASK = 't-1';
const N1 = nameFor(TASK, 1);
const N2 = nameFor(TASK, 2);
/** Sightings are keyed by the name WE chose, which is what makes adoption exact. */
const seen = (...pairs: Array<[string, Observed]>): Map<string, Sighting> =>
  new Map(pairs.map(([name, state], i) => [name, { sessionId: `s${i}`, state }]));

const filed = (maxAttempts = 1): Event =>
  ({ kind: 'filed', at: at(0), brief: 'do the thing', cwd: '/repo', maxAttempts });

test('a filed task starts its first attempt', () => {
  const s = fold(TASK, [filed()]);
  assert.deepEqual(decide(s, seen(), now()), { do: 'start', attempt: 1, resumeFrom: undefined });
});

test('an intent with no spawn behind it gets spawned — the crash window', () => {
  const s = fold(TASK, [filed(), { kind: 'starting', at: at(1), attempt: 1 }]);
  assert.deepEqual(decide(s, seen(), now()), { do: 'spawn', attempt: 1, name: N1 });
});

test('spawning is idempotent: deciding twice in a row says the same thing', () => {
  const s = fold(TASK, [filed(), { kind: 'starting', at: at(1), attempt: 1 }]);
  assert.deepEqual(decide(s, seen(), now()), decide(s, seen(), now()));
});

test('a running session is left alone', () => {
  const s = fold(TASK, [filed(), { kind: 'starting', at: at(1), attempt: 1 }, { kind: 'spawned', at: at(2), attempt: 1 }]);
  assert.equal(decide(s, seen([N1, 'working']), now(5)).do, 'nothing');
});

test('a QUIESCENT session is still left alone — being between steps is legitimate', () => {
  // `working` + not busy means the session believes it has work and is computing nothing. That is
  // what a stall looks like, and also what a legitimate wait between self-driven steps looks like.
  // `decide` cannot tell them apart, so it reports and waits; only the deadline ends the ambiguity.
  const s = fold(TASK, [filed(), { kind: 'starting', at: at(1), attempt: 1 }, { kind: 'spawned', at: at(2), attempt: 1 }]);
  const quiescent = new Map([[N1, { sessionId: 's0', state: 'working' as const, busy: false }]]);
  assert.equal(decide(s, quiescent, now(5)).do, 'nothing');

  // ...but with a deadline, it ends.
  const bounded = fold(TASK, [
    { kind: 'filed', at: at(0), brief: 'b', cwd: '/r', maxAttempts: 1, deadlineSeconds: 10 },
    { kind: 'starting', at: at(1_000), attempt: 1 }, { kind: 'spawned', at: at(1_100), attempt: 1 },
  ]);
  assert.deepEqual(decide(bounded, quiescent, now(30_000)), { do: 'stop', sessionId: 's0', why: 'deadline' });
});

test('a blocked session is running, and says why', () => {
  const s = fold(TASK, [filed(), { kind: 'starting', at: at(1), attempt: 1 }, { kind: 'spawned', at: at(2), attempt: 1 }]);
  const a = decide(s, seen([N1, 'blocked']), now(5));
  assert.equal(a.do, 'nothing');
  assert.match(a.why, /needs a person/);
});

test('a spawned session the harness has not registered yet is given a grace window', () => {
  const s = fold(TASK, [filed(), { kind: 'starting', at: at(1), attempt: 1 }, { kind: 'spawned', at: at(2), attempt: 1 }]);
  assert.equal(decide(s, seen(), now(1_000)).do, 'nothing');
  assert.deepEqual(decide(s, seen(), now(60_000)), { do: 'record-end', attempt: 1, sessionId: '(never seen)', observed: 'failed', reason: 'lost' });
});

const ran = (outcome: Observed, maxAttempts = 1): Event[] => [
  filed(maxAttempts),
  { kind: 'starting', at: at(1), attempt: 1 },
  { kind: 'spawned', at: at(2), attempt: 1 },
  { kind: 'ended', at: at(3), attempt: 1, sessionId: 's0', observed: outcome, reason: 'harness', nativeId: 'n1' },
];

test('done settles as succeeded', () => {
  assert.deepEqual(decide(fold(TASK, ran('done')), seen([N1, 'done']), now(9)), { do: 'settle', outcome: 'succeeded' });
});

test('failed with no attempts left settles as failed', () => {
  const a = decide(fold(TASK, ran('failed')), seen([N1, 'failed']), now(9));
  assert.equal(a.do, 'settle');
  assert.equal(a.do === 'settle' && a.outcome, 'failed');
});

test('failed with an attempt left starts the next one', () => {
  assert.deepEqual(decide(fold(TASK, ran('failed', 2)), seen([N1, 'failed']), now(9)), { do: 'start', attempt: 2, resumeFrom: undefined });
});

test('a session stopped by hand settles as stopped, and costs no retry', () => {
  const a = decide(fold(TASK, ran('stopped', 3)), seen([N1, 'stopped']), now(9));
  assert.equal(a.do === 'settle' && a.outcome, 'stopped');
});

test('a stop request stops a live session, then settles', () => {
  const live: Event[] = [filed(), { kind: 'starting', at: at(1), attempt: 1 }, { kind: 'spawned', at: at(2), attempt: 1 }, { kind: 'stop-requested', at: at(3) }];
  assert.deepEqual(decide(fold(TASK, live), seen([N1, 'working']), now(9)), { do: 'stop', sessionId: 's0', why: 'operator' });
  assert.equal(decide(fold(TASK, live), seen([N1, 'stopped']), now(9)).do, 'settle');
});

test('a stop request on a task that never started settles it immediately', () => {
  const a = decide(fold(TASK, [filed(), { kind: 'stop-requested', at: at(1) }]), seen(), now(9));
  assert.equal(a.do === 'settle' && a.outcome, 'stopped');
});

test('settled is terminal — nothing moves after it, whatever the machine says', () => {
  const s = fold(TASK, [...ran('done'), { kind: 'settled', at: at(4), outcome: 'succeeded' }]);
  assert.equal(decide(s, seen([N1, 'failed']), now(99)).do, 'nothing');
});

test('the fold re-derives the same state from a replayed journal — restart safety', () => {
  const events = ran('failed', 2);
  assert.deepEqual(fold(TASK, events), fold(TASK, [...events].map((e) => JSON.parse(JSON.stringify(e)) as Event)));
});

test('ADOPTION: a session running under our name is adopted, never started twice', () => {
  // The crash that matters: the spawn happened, the journal entry that records it did not.
  const s = fold(TASK, [filed(), { kind: 'starting', at: at(1), attempt: 1 }]);
  assert.equal(decide(s, seen(), now(5)).do, 'spawn', 'nothing out there: spawn it');
  assert.deepEqual(decide(s, seen([N1, 'working']), now(5)).do, 'nothing', 'already out there: adopt it');
});

test('a second attempt gets its own name, so the first cannot be mistaken for it', () => {
  const s = fold(TASK, ran('failed', 2));
  assert.deepEqual(decide(s, seen([N1, 'failed']), now(9)), { do: 'start', attempt: 2, resumeFrom: undefined });
  assert.notEqual(N1, N2);
});


// ─── the deadline ───────────────────────────────────────────────────────────

const withDeadline = (seconds: number): Event =>
  ({ kind: 'filed', at: at(0), brief: 'b', cwd: '/repo', maxAttempts: 1, deadlineSeconds: seconds });

const started = (extra: Event[] = []): Event[] =>
  [{ kind: 'starting', at: at(1_000), attempt: 1 }, { kind: 'spawned', at: at(1_100), attempt: 1 }, ...extra];

test('a live session past its deadline is stopped', () => {
  const s = fold(TASK, [withDeadline(10), ...started()]);
  assert.equal(decide(s, seen([N1, 'working']), now(5_000)).do, 'nothing', 'inside the deadline');
  assert.deepEqual(decide(s, seen([N1, 'working']), now(20_000)), { do: 'stop', sessionId: 's0', why: 'deadline' });
});

test('a BLOCKED session past its deadline is stopped too — the only thing that frees that slot', () => {
  const s = fold(TASK, [withDeadline(10), ...started()]);
  assert.equal(decide(s, seen([N1, 'blocked']), now(5_000)).do, 'nothing');
  assert.deepEqual(decide(s, seen([N1, 'blocked']), now(20_000)), { do: 'stop', sessionId: 's0', why: 'deadline' });
});

test('once the session is gone, the deadline settles the task as failed', () => {
  const s = fold(TASK, [withDeadline(10), ...started()]);
  const a = decide(s, seen([N1, 'stopped']), now(20_000));
  assert.equal(a.do, 'settle');
  assert.equal(a.do === 'settle' && a.outcome, 'failed');
  assert.match(a.do === 'settle' ? a.note ?? '' : '', /deadline exceeded/);
});

test('the deadline runs from the first ATTEMPT, not from filing — a queued task burns nothing', () => {
  // Filed at t0, started at t+1s. At t+10.5s it has run 9.5s, which is inside a 10s deadline.
  const s = fold(TASK, [withDeadline(10), ...started()]);
  assert.equal(decide(s, seen([N1, 'working']), now(10_500)).do, 'nothing');
});

test('no deadline means no limit', () => {
  const s = fold(TASK, [filed(), ...started()]);
  assert.equal(decide(s, seen([N1, 'working']), now(999_999_999)).do, 'nothing');
});

// ─── resume ─────────────────────────────────────────────────────────────────

const endedWith = (observed: Observed, reason: 'harness' | 'lost', policy?: 'interrupted' | 'always' | 'never'): Event[] => [
  { kind: 'filed', at: at(0), brief: 'b', cwd: '/repo', maxAttempts: 2, resume: policy },
  { kind: 'starting', at: at(1), attempt: 1 },
  { kind: 'spawned', at: at(2), attempt: 1 },
  { kind: 'ended', at: at(3), attempt: 1, sessionId: 's0', observed, reason, nativeId: 'native-1' },
];

test('default policy: a LOST attempt is resumed', () => {
  const a = decide(fold(TASK, endedWith('failed', 'lost')), seen(), now(9));
  assert.deepEqual(a, { do: 'start', attempt: 2, resumeFrom: 'native-1' });
});

test('default policy: a HARNESS failure starts clean', () => {
  const a = decide(fold(TASK, endedWith('failed', 'harness')), seen(), now(9));
  assert.deepEqual(a, { do: 'start', attempt: 2, resumeFrom: undefined });
});

test("resume: 'always' continues a harness failure too", () => {
  const a = decide(fold(TASK, endedWith('failed', 'harness', 'always')), seen(), now(9));
  assert.equal(a.do === 'start' && a.resumeFrom, 'native-1');
});

test("resume: 'never' starts clean even after a lost attempt", () => {
  const a = decide(fold(TASK, endedWith('failed', 'lost', 'never')), seen(), now(9));
  assert.equal(a.do === 'start' && a.resumeFrom, undefined);
});

test('nothing is resumed when the harness never gave us an id', () => {
  const events = endedWith('failed', 'lost');
  const noId = events.map((e) => (e.kind === 'ended' ? { ...e, nativeId: undefined } : e));
  assert.equal(decide(fold(TASK, noId), seen(), now(9)).do === 'start' ? undefined : 'x', undefined);
  const a = decide(fold(TASK, noId), seen(), now(9));
  assert.equal(a.do === 'start' && a.resumeFrom, undefined);
});

// ─── the ceiling, in the pure layer ─────────────────────────────────────────

test('a task at the ceiling waits, and says which pool is full', () => {
  const s = fold(TASK, [filed()]);
  const a = decide(s, seen(), now(0, 30_000, 3, 3));
  assert.equal(a.do, 'nothing');
  assert.match(a.why, /ceiling \(3\/3\)/);
});

test('a finished task settles even when the board is full', () => {
  const a = decide(fold(TASK, ran('done')), seen([N1, 'done']), now(9, 30_000, 9, 3));
  assert.deepEqual(a, { do: 'settle', outcome: 'succeeded' });
});

test('a task filed AGAINST a session continues it on the first attempt', () => {
  const s = fold(TASK, [{ kind: 'filed', at: at(0), brief: 'b', cwd: '/r', maxAttempts: 1, resumeFrom: 'sess-1' }]);
  assert.deepEqual(decide(s, seen(), now()), { do: 'start', attempt: 1, resumeFrom: 'sess-1' });
});

test("...and `resume: never` does not override that — they are different statements", () => {
  // "do not resume a FAILURE" is a retry policy. "this task IS a continuation" is what the work is.
  const s = fold(TASK, [{ kind: 'filed', at: at(0), brief: 'b', cwd: '/r', maxAttempts: 1, resume: 'never', resumeFrom: 'sess-1' }]);
  assert.equal(decide(s, seen(), now()).do === 'start' ? decide(s, seen(), now()).resumeFrom : null, 'sess-1');
});

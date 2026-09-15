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

test('a session its harness ended at its spend cap ends failed, reason budget — and is not continued, whatever the policy', () => {
  for (const resume of ['interrupted', 'always'] as const) {
    const events: Event[] = [
      { kind: 'filed', at: at(0), brief: 'b', cwd: '/r', maxAttempts: 2, resume, budgetUsd: 0.01 },
      { kind: 'starting', at: at(1), attempt: 1 },
      { kind: 'spawned', at: at(2), attempt: 1 },
    ];
    const spent = new Map([[N1, { sessionId: 's0', state: 'failed' as const, nativeId: 'native-1', budgetSpent: true as const }]]);
    assert.deepEqual(decide(fold(TASK, events), spent, now(5)),
      { do: 'record-end', attempt: 1, sessionId: 's0', observed: 'failed', reason: 'budget', nativeId: 'native-1', closeout: undefined }, resume);
    const ended = fold(TASK, [...events, { kind: 'ended', at: at(6), attempt: 1, sessionId: 's0', observed: 'failed', reason: 'budget', nativeId: 'native-1' }]);
    assert.deepEqual(decide(ended, new Map(), now(7)), { do: 'start', attempt: 2, resumeFrom: undefined }, `${resume}: a clean start — a nudge would spend past the cap`);
  }
  // The control: the same failure with no word from the harness about a budget is its verdict, and `always` continues it.
  const always = fold(TASK, [
    { kind: 'filed', at: at(0), brief: 'b', cwd: '/r', maxAttempts: 2, resume: 'always', budgetUsd: 0.01 },
    { kind: 'starting', at: at(1), attempt: 1 },
    { kind: 'spawned', at: at(2), attempt: 1 },
  ]);
  assert.equal((decide(always, new Map([[N1, { sessionId: 's0', state: 'failed' as const, nativeId: 'native-1' }]]), now(5)) as { reason?: string }).reason, 'harness');
  const failed = fold(TASK, [
    { kind: 'filed', at: at(0), brief: 'b', cwd: '/r', maxAttempts: 2, resume: 'always', budgetUsd: 0.01 },
    { kind: 'starting', at: at(1), attempt: 1 },
    { kind: 'spawned', at: at(2), attempt: 1 },
    { kind: 'ended', at: at(6), attempt: 1, sessionId: 's0', observed: 'failed', reason: 'harness', nativeId: 'native-1' },
  ]);
  assert.deepEqual(decide(failed, new Map(), now(7)), { do: 'start', attempt: 2, resumeFrom: 'native-1' });
});

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

// ─── quiet: stopped, and whether it said it had finished ───────────────────

/** Attempt 1 in flight, and the task filed with a closing statement asked for, or not. */
const inFlight = (schema: boolean, maxAttempts = 1, resume?: 'interrupted' | 'always' | 'never'): Event[] => [
  { kind: 'filed', at: at(0), brief: 'b', cwd: '/r', maxAttempts, resume, ...(schema ? { closeoutSchema: { type: 'object' } } : {}) },
  { kind: 'starting', at: at(1), attempt: 1 }, { kind: 'spawned', at: at(2), attempt: 1 },
];
const quiet = (extra: Partial<Sighting> = {}): Map<string, Sighting> =>
  new Map([[N1, { sessionId: 's0', nativeId: 'n1', state: 'working' as const, busy: false, quietMs: 120_000, ...extra }]]);

test('a QUIET session that was asked for no statement is done — quiet is all such a task has', () => {
  assert.deepEqual(decide(fold(TASK, inFlight(false)), quiet(), now(5)),
    { do: 'record-end', attempt: 1, sessionId: 's0', observed: 'done', reason: 'harness', nativeId: 'n1', closeout: undefined });
});

test('a QUIET session asked for a statement that gave none ends UNSIGNED: failed, not done', () => {
  assert.deepEqual(decide(fold(TASK, inFlight(true)), quiet(), now(5)),
    { do: 'record-end', attempt: 1, sessionId: 's0', observed: 'failed', reason: 'unsigned', nativeId: 'n1', closeout: undefined });
  const said = decide(fold(TASK, inFlight(true)), quiet({ closeout: { payload: { ok: true }, at: 3 } }), now(5));
  assert.equal(said.do === 'record-end' && said.observed, 'done', 'with a statement, done');
});

test('quiet ends only a WORKING session: not a blocked one, and no session its runner has not called quiet', () => {
  assert.equal(decide(fold(TASK, inFlight(true)), quiet({ state: 'blocked' }), now(5)).do, 'nothing', 'blocked waits on a person, however quiet');
  assert.equal(decide(fold(TASK, inFlight(true)), quiet({ quietMs: undefined }), now(5)).do, 'nothing', 'idle, but not quiet for long enough');
});

const unsigned = (maxAttempts: number, resume?: 'interrupted' | 'always' | 'never'): Event[] => [
  ...inFlight(true, maxAttempts, resume),
  { kind: 'ended', at: at(3), attempt: 1, sessionId: 's0', observed: 'failed', reason: 'unsigned', nativeId: 'n1' },
];

test('UNSIGNED with an attempt left: its session is stopped while it still runs, then continued with a nudge', () => {
  const s = fold(TASK, unsigned(2));
  assert.deepEqual(decide(s, quiet(), now(9)), { do: 'stop', sessionId: 's0', why: 'to continue it' }, 'still running, quiet: stopped first');
  const a = decide(s, seen(), now(9));
  assert.equal(a.do, 'start');
  assert.equal(a.do === 'start' && a.resumeFrom, 'n1', 'continues the session: nobody judged that work, the session included');
  assert.match(a.do === 'start' ? a.nudge ?? '' : '', /stopped without giving your closing statement/);
  assert.deepEqual(decide(s, seen([N1, 'stopped']), now(9)), a, 'a stopped session is let go enough');
});

test("UNSIGNED under `resume: never` starts clean, and a clean start is told the brief, not a nudge", () => {
  assert.deepEqual(decide(fold(TASK, unsigned(2, 'never')), seen(), now(9)), { do: 'start', attempt: 2, resumeFrom: undefined });
});

test('UNSIGNED with no attempt left settles failed, and says why', () => {
  assert.deepEqual(decide(fold(TASK, unsigned(1)), quiet(), now(9)),
    { do: 'settle', outcome: 'failed', note: '1 attempt(s), none succeeded: the last went quiet without the closing statement it was asked for' });
});

test('a nudge is on the attempt it started, from the journal', () => {
  const s = fold(TASK, [...unsigned(2), { kind: 'starting', at: at(4), attempt: 2, resumeFrom: 'n1', nudge: 'finish' }]);
  assert.deepEqual(s.attempts.map((a) => a.nudge), [undefined, 'finish']);
  assert.equal('nudge' in s.attempts[0]!, false, 'and no key on one that had none');
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
  const action = decide(s, seen(), now());
  assert.equal(action.do === 'start' ? action.resumeFrom : null, 'sess-1');
});

// ─── when an attempt ended ──────────────────────────────────────────────────

test('an ended attempt keeps the time it ended: the `at` of its `ended` entry', () => {
  const [a] = fold(TASK, ran('failed')).attempts;
  assert.equal(a!.startedAt, at(1));
  assert.equal(a!.endedAt, at(3));
});

test('an attempt in flight has no end time, and does not borrow the one before it', () => {
  const s = fold(TASK, [...ran('failed', 2), { kind: 'starting', at: at(4), attempt: 2 }, { kind: 'spawned', at: at(5), attempt: 2 }]);
  assert.deepEqual(s.attempts.map((a) => [a.ended, a.endedAt]), [['failed', at(3)], [null, null]]);
});

// ─── what a person said ─────────────────────────────────────────────────────

/** The same journal with words said to attempt 1 just after it spawned. */
const told = (events: Event[], text = 'widen the scope to the api'): Event[] => {
  const i = events.findIndex((e) => e.kind === 'spawned');
  return [...events.slice(0, i + 1), { kind: 'said', at: at(1_500), attempt: 1, text }, ...events.slice(i + 1)];
};

test('a `said` event changes no decision: running, blocked, ended done, failed with an attempt left, past the deadline, lost', () => {
  const cases: Array<[string, Event[], Map<string, Sighting>, ReturnType<typeof now>]> = [
    ['running', [filed(), ...started()], seen([N1, 'working']), now(5_000)],
    ['blocked', [filed(), ...started()], seen([N1, 'blocked']), now(5_000)],
    ['ended done', ran('done'), seen([N1, 'done']), now(9)],
    ['failed with an attempt left', ran('failed', 2), seen([N1, 'failed']), now(9)],
    ['past the deadline', [withDeadline(10), ...started()], seen([N1, 'working']), now(20_000)],
    ['never registered', [filed(), ...started()], seen(), now(60_000)],
  ];
  for (const [label, events, observed, when] of cases) {
    const said = fold(TASK, told(events));
    assert.equal(said.said.length, 1, `${label}: the words are on the state`);
    assert.deepEqual(decide(said, observed, when), decide(fold(TASK, events), observed, when), label);
  }
});

test('a journal with no `said` in it — every journal written before `say` — folds to `said: []` and otherwise the same state', () => {
  const { said: none, ...legacy } = fold(TASK, ran('failed', 2));
  assert.deepEqual(none, []);
  const { said, ...rest } = fold(TASK, told(ran('failed', 2)));
  assert.deepEqual(said, [{ at: at(1_500), attempt: 1, text: 'widen the scope to the api' }]);
  assert.deepEqual(rest, legacy, 'nothing else on the state moved');
});

test('the fold keeps every `said` in order, each with the attempt it was said to', () => {
  const s = fold(TASK, [
    ...told(ran('failed', 2), 'first'),
    { kind: 'starting', at: at(4), attempt: 2 }, { kind: 'spawned', at: at(5), attempt: 2 },
    { kind: 'said', at: at(6), attempt: 2, text: 'second' },
  ]);
  assert.deepEqual(s.said.map((x) => [x.attempt, x.text]), [[1, 'first'], [2, 'second']]);
});

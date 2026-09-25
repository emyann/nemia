/**
 * `decide` is the engine. It is pure, so this file is the one that has to be exhaustive —
 * and it needs no database, no harness and no clock it did not bring.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, fold, nameFor, turnOf, waitsForInput, type Event, type Observed, type Sighting } from '../src/domain.ts';

const T0 = new Date('2026-01-01T00:00:00Z');
const at = (ms: number) => new Date(T0.getTime() + ms).toISOString();
const now = (ms = 0, graceMs = 30_000, used = 0, max = Infinity) => ({ at: new Date(T0.getTime() + ms), graceMs, used, max });
const TASK = 't-1';
const N1 = nameFor(TASK, 1);
const N2 = nameFor(TASK, 2);
/** Sightings are keyed by the name WE chose, which is what makes adoption exact. */
const seen = (...pairs: Array<[string, Observed]>): Map<string, Sighting> =>
  new Map(pairs.map(([name, state], i) => [name, { sessionId: `s${i}`, state }]));

const filed = (): Event =>
  ({ kind: 'filed', at: at(0), brief: 'do the thing', cwd: '/repo' });

/**
 * A `filed` entry as a journal written before stage 4a part 2 has it: with `maxAttempts` and a `resume` policy, which
 * the type no longer names and `fold` reads past.
 */
const legacyFiled = (extra: object = {}): Event =>
  ({ kind: 'filed', at: at(0), brief: 'do the thing', cwd: '/repo', maxAttempts: 3, resume: 'always', ...extra }) as Event;

test('a session its harness ended at its spend cap ends failed, reason budget — and the task settles failed saying so, a journal that allowed more attempts included', () => {
  for (const first of [{ kind: 'filed', at: at(0), brief: 'b', cwd: '/r', budgetUsd: 0.01 } as Event, legacyFiled({ budgetUsd: 0.01 })]) {
    const events: Event[] = [first, { kind: 'starting', at: at(1), attempt: 1 }, { kind: 'spawned', at: at(2), attempt: 1 }];
    const label = 'maxAttempts' in first ? 'legacy' : 'filed';
    const spent = new Map([[N1, { sessionId: 's0', state: 'failed' as const, nativeId: 'native-1', budgetSpent: true as const }]]);
    assert.deepEqual(decide(fold(TASK, events), spent, now(5)),
      { do: 'record-end', attempt: 1, sessionId: 's0', observed: 'failed', reason: 'budget', nativeId: 'native-1', closeout: undefined }, label);
    const ended = fold(TASK, [...events, { kind: 'ended', at: at(6), attempt: 1, sessionId: 's0', observed: 'failed', reason: 'budget', nativeId: 'native-1' }]);
    const settled = { do: 'settle', outcome: 'failed', note: 'attempt 1 spent its budget. File the task again with a larger one to run it again' };
    assert.deepEqual(decide(ended, new Map(), now(7)), settled, `${label}: a budget spent is spent`);
    assert.deepEqual(decide(ended, new Map(), now(7, 30_000, 3, 3)), settled, `${label}: a terminal answer, so a full board does not hold it`);
  }
  // The control: the same failure with no word from the harness about a budget is its verdict, and settles failed with the count.
  const events: Event[] = [legacyFiled({ budgetUsd: 0.01 }), { kind: 'starting', at: at(1), attempt: 1 }, { kind: 'spawned', at: at(2), attempt: 1 }];
  assert.equal((decide(fold(TASK, events), new Map([[N1, { sessionId: 's0', state: 'failed' as const, nativeId: 'native-1' }]]), now(5)) as { reason?: string }).reason, 'harness');
  const failed = fold(TASK, [...events, { kind: 'ended', at: at(6), attempt: 1, sessionId: 's0', observed: 'failed', reason: 'harness', nativeId: 'native-1' }]);
  assert.deepEqual(decide(failed, new Map(), now(7)), { do: 'settle', outcome: 'failed', note: '1 attempt(s), none succeeded' });
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
    { kind: 'filed', at: at(0), brief: 'b', cwd: '/r', deadlineSeconds: 10 },
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
const inFlight = (schema: boolean, legacy = false): Event[] => [
  { kind: 'filed', at: at(0), brief: 'b', cwd: '/r', ...(legacy ? { maxAttempts: 3, resume: 'always' } : {}), ...(schema ? { closeoutSchema: { type: 'object' } } : {}) } as Event,
  { kind: 'starting', at: at(1), attempt: 1 }, { kind: 'spawned', at: at(2), attempt: 1 },
];
const quiet = (extra: Partial<Sighting> = {}): Map<string, Sighting> =>
  new Map([[N1, { sessionId: 's0', nativeId: 'n1', state: 'working' as const, busy: false, quietMs: 120_000, ...extra }]]);

test('a QUIET session that was asked for no statement is done — quiet is all such a task has', () => {
  assert.deepEqual(decide(fold(TASK, inFlight(false)), quiet(), now(5)),
    { do: 'record-end', attempt: 1, sessionId: 's0', observed: 'done', reason: 'harness', nativeId: 'n1', closeout: undefined });
});

test('a QUIET session asked for a statement that gave none ends `done`, and says it gave none — `stated: false`, a fact the engine does not judge', () => {
  // Stage 4a: `unsigned` is the orchestrator's word, read off `stated`. The engine recorded it `failed` before.
  assert.deepEqual(decide(fold(TASK, inFlight(true)), quiet(), now(5)),
    { do: 'record-end', attempt: 1, sessionId: 's0', observed: 'done', reason: 'harness', nativeId: 'n1', closeout: undefined, stated: false });
  assert.deepEqual(decide(fold(TASK, inFlight(true)), quiet({ closeout: { payload: { ok: true }, at: 3 } }), now(5)),
    { do: 'record-end', attempt: 1, sessionId: 's0', observed: 'done', reason: 'harness', nativeId: 'n1', closeout: { ok: true }, stated: true });
});

test("the HARNESS'S `done` without a statement is recorded as the harness said it, with `stated: false` — for a task that asked for one, and only for one", () => {
  const done = (extra: Partial<Sighting> = {}): Map<string, Sighting> => new Map([[N1, { sessionId: 's0', nativeId: 'n1', state: 'done' as const, ...extra }]]);
  assert.deepEqual(decide(fold(TASK, inFlight(true)), done(), now(5)),
    { do: 'record-end', attempt: 1, sessionId: 's0', observed: 'done', reason: 'harness', nativeId: 'n1', closeout: undefined, stated: false });
  assert.deepEqual(decide(fold(TASK, inFlight(true)), done({ closeout: { payload: { ok: true }, at: 3 } }), now(5)),
    { do: 'record-end', attempt: 1, sessionId: 's0', observed: 'done', reason: 'harness', nativeId: 'n1', closeout: { ok: true }, stated: true });
  // A task that asked for nothing is told of nothing: no `stated` key.
  assert.deepEqual(decide(fold(TASK, inFlight(false)), done(), now(5)),
    { do: 'record-end', attempt: 1, sessionId: 's0', observed: 'done', reason: 'harness', nativeId: 'n1', closeout: undefined });
  // A harness's `failed` is its verdict, statement or not, and a budget spent keeps its own reason.
  assert.deepEqual(decide(fold(TASK, inFlight(true)), done({ state: 'failed' }), now(5)),
    { do: 'record-end', attempt: 1, sessionId: 's0', observed: 'failed', reason: 'harness', nativeId: 'n1', closeout: undefined, stated: false });
  assert.equal((decide(fold(TASK, inFlight(true)), done({ budgetSpent: true }), now(5)) as { reason?: string }).reason, 'budget');
});

test('an end with `stated: false` settles SUCCEEDED, a journal that allowed more attempts included: the engine neither nudges nor retries it', () => {
  for (const legacy of [false, true]) {
    const s = fold(TASK, [...inFlight(true, legacy),
      { kind: 'ended', at: at(3), attempt: 1, sessionId: 's0', observed: 'done', reason: 'harness', nativeId: 'n1', stated: false }]);
    assert.equal(s.attempts[0]?.stated, false);
    assert.deepEqual(decide(s, quiet(), now(9)), { do: 'settle', outcome: 'succeeded' }, `legacy ${legacy}: quiet, and not stopped to be continued`);
    assert.deepEqual(decide(s, seen(), now(9)), { do: 'settle', outcome: 'succeeded' }, `legacy ${legacy}`);
  }
});

test('an old journal that recorded a `done` end with no statement on a schema task folds, and settles, as it did', () => {
  // Written before the rule: `fold` reads the end as recorded and never re-derives it.
  const old = fold(TASK, [...inFlight(true), { kind: 'ended', at: at(3), attempt: 1, sessionId: 's0', observed: 'done', reason: 'harness', nativeId: 'n1' }]);
  assert.deepEqual(old.attempts.map((a) => [a.ended, a.reason, a.closeout]), [['done', 'harness', undefined]]);
  assert.deepEqual(decide(old, seen(), now(9)), { do: 'settle', outcome: 'succeeded' });
});

test('quiet ends only a WORKING session: not a blocked one, and no session its runner has not called quiet', () => {
  assert.equal(decide(fold(TASK, inFlight(true)), quiet({ state: 'blocked' }), now(5)).do, 'nothing', 'blocked waits on a person, however quiet');
  assert.equal(decide(fold(TASK, inFlight(true)), quiet({ quietMs: undefined }), now(5)).do, 'nothing', 'idle, but not quiet for long enough');
});

/** A journal from before stage 4a, whose engine judged attempt 1 `unsigned`. */
const unsigned = (legacy = false): Event[] => [
  ...inFlight(true, legacy),
  { kind: 'ended', at: at(3), attempt: 1, sessionId: 's0', observed: 'failed', reason: 'unsigned', nativeId: 'n1' },
];

test('an old UNSIGNED end settles failed and says why, a journal that allowed more attempts included — never continued, never nudged: the nudge is the orchestrator\'s now', () => {
  for (const legacy of [false, true]) {
    const note = { do: 'settle', outcome: 'failed', note: '1 attempt(s), none succeeded: the last ended without the closing statement it was asked for' };
    assert.deepEqual(decide(fold(TASK, unsigned(legacy)), seen(), now(9)), note, `legacy ${legacy}`);
    assert.deepEqual(decide(fold(TASK, unsigned(legacy)), quiet(), now(9)), note, `legacy ${legacy}: still quiet, not stopped to be continued`);
  }
});

test('a nudge is on the attempt it started, from the journal', () => {
  const s = fold(TASK, [...unsigned(true), { kind: 'starting', at: at(4), attempt: 2, resumeFrom: 'n1', nudge: 'finish' }]);
  assert.deepEqual(s.attempts.map((a) => a.nudge), [undefined, 'finish']);
  assert.equal('nudge' in s.attempts[0]!, false, 'and no key on one that had none');
});

test('a spawned session the harness has not registered yet is given a grace window', () => {
  const s = fold(TASK, [filed(), { kind: 'starting', at: at(1), attempt: 1 }, { kind: 'spawned', at: at(2), attempt: 1 }]);
  assert.equal(decide(s, seen(), now(1_000)).do, 'nothing');
  assert.deepEqual(decide(s, seen(), now(60_000)), { do: 'record-end', attempt: 1, sessionId: '(never seen)', observed: 'failed', reason: 'lost' });
});

const ran = (outcome: Observed, first: Event = filed()): Event[] => [
  first,
  { kind: 'starting', at: at(1), attempt: 1 },
  { kind: 'spawned', at: at(2), attempt: 1 },
  { kind: 'ended', at: at(3), attempt: 1, sessionId: 's0', observed: outcome, reason: 'harness', nativeId: 'n1' },
];

test('done settles as succeeded', () => {
  assert.deepEqual(decide(fold(TASK, ran('done')), seen([N1, 'done']), now(9)), { do: 'settle', outcome: 'succeeded' });
});

test('failed settles as failed: one attempt per start', () => {
  assert.deepEqual(decide(fold(TASK, ran('failed')), seen([N1, 'failed']), now(9)), { do: 'settle', outcome: 'failed', note: '1 attempt(s), none succeeded' });
});

test('a session stopped by hand settles as stopped', () => {
  const a = decide(fold(TASK, ran('stopped')), seen([N1, 'stopped']), now(9));
  assert.equal(a.do === 'settle' && a.outcome, 'stopped');
});

test('a stop request stops a live session, ends its attempt OPERATOR, then settles', () => {
  const live: Event[] = [filed(), { kind: 'starting', at: at(1), attempt: 1 }, { kind: 'spawned', at: at(2), attempt: 1 }, { kind: 'stop-requested', at: at(3) }];
  assert.deepEqual(decide(fold(TASK, live), seen([N1, 'working']), now(9)), { do: 'stop', sessionId: 's0', why: 'operator' });
  assert.deepEqual(decide(fold(TASK, live), seen([N1, 'stopped']), now(9)),
    { do: 'record-end', attempt: 1, sessionId: 's0', observed: 'stopped', reason: 'operator', nativeId: undefined, closeout: undefined });
  const ended = fold(TASK, [...live, { kind: 'ended', at: at(10), attempt: 1, sessionId: 's0', observed: 'stopped', reason: 'operator' }]);
  assert.deepEqual(decide(ended, seen([N1, 'stopped']), now(11)), { do: 'settle', outcome: 'stopped', note: 'operator' });
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
  const events = ran('failed');
  assert.deepEqual(fold(TASK, events), fold(TASK, [...events].map((e) => JSON.parse(JSON.stringify(e)) as Event)));
});

test('ADOPTION: a session running under our name is adopted, never started twice', () => {
  // The crash that matters: the spawn happened, the journal entry that records it did not.
  const s = fold(TASK, [filed(), { kind: 'starting', at: at(1), attempt: 1 }]);
  assert.equal(decide(s, seen(), now(5)).do, 'spawn', 'nothing out there: spawn it');
  assert.deepEqual(decide(s, seen([N1, 'working']), now(5)).do, 'nothing', 'already out there: adopt it');
});

test('a journal from before stage 4a part 2 caught between two attempts runs its second to its end: each has its own name, so the first cannot be mistaken for it', () => {
  const s = fold(TASK, [...ran('failed', legacyFiled()), { kind: 'starting', at: at(4), attempt: 2 }, { kind: 'spawned', at: at(5), attempt: 2 }]);
  assert.notEqual(N1, N2);
  assert.equal(decide(s, seen([N1, 'failed'], [N2, 'working']), now(9)).do, 'nothing', 'its second attempt runs');
  assert.deepEqual(decide(s, new Map([[N1, { sessionId: 's0', state: 'failed' }], [N2, { sessionId: 's1', state: 'done', nativeId: 'n2' }]]), now(9)),
    { do: 'record-end', attempt: 2, sessionId: 's1', observed: 'done', reason: 'harness', nativeId: 'n2', closeout: undefined }, 'and is ended off its own sighting');
});


// ─── the deadline ───────────────────────────────────────────────────────────

const withDeadline = (seconds: number): Event =>
  ({ kind: 'filed', at: at(0), brief: 'b', cwd: '/repo', deadlineSeconds: seconds });

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

test('once the session is gone, the deadline ends its attempt DEADLINE, then settles the task as failed', () => {
  const s = fold(TASK, [withDeadline(10), ...started()]);
  assert.deepEqual(decide(s, seen([N1, 'stopped']), now(20_000)),
    { do: 'record-end', attempt: 1, sessionId: 's0', observed: 'failed', reason: 'deadline', nativeId: undefined, closeout: undefined });
  const ended = fold(TASK, [withDeadline(10), ...started([{ kind: 'ended', at: at(20_001), attempt: 1, sessionId: 's0', observed: 'failed', reason: 'deadline' }])]);
  const a = decide(ended, seen([N1, 'stopped']), now(20_002));
  assert.equal(a.do, 'settle');
  assert.equal(a.do === 'settle' && a.outcome, 'failed');
  assert.match(a.do === 'settle' ? a.note ?? '' : '', /deadline exceeded/);
});

test('a session that ended DONE is judged by that end, even read past the deadline — the deadline stops, it never overrules', () => {
  // 2026-09-24: a check exited 0 at 607 s against 600. One pass recorded its end, then — stepping the task until nothing
  // moves — read that end past the deadline and settled it `failed, deadline exceeded after 607s`.
  const done = { kind: 'ended', at: at(20_001), attempt: 1, sessionId: 's0', observed: 'done', reason: 'harness', exitCode: 0 } as const;
  const walked = decide(fold(TASK, [withDeadline(10), ...started()]), new Map([[N1, { sessionId: 's0', state: 'done', exitCode: 0 }]]), now(20_000));
  assert.equal(walked.do, 'record-end');
  assert.deepEqual(walked.do === 'record-end' && [walked.observed, walked.reason], ['done', 'harness'], 'its harness ended it before the cut');
  const ended = fold(TASK, [withDeadline(10), ...started([done])]);
  assert.deepEqual(decide(ended, seen(), now(20_001)), { do: 'settle', outcome: 'succeeded' }, 'in the same pass as its end');
  assert.deepEqual(decide(ended, seen([N1, 'done']), now(20_001)), { do: 'settle', outcome: 'succeeded' });
  assert.deepEqual(decide(ended, seen(), now(20_001, 30_000, 3, 3)), { do: 'settle', outcome: 'succeeded' }, 'a full pool holds no terminal answer');
  // Stopped by its harness, it settles stopped, as it would inside the deadline.
  const stopped = fold(TASK, [withDeadline(10), ...started([{ ...done, observed: 'stopped', exitCode: undefined }])]);
  assert.deepEqual(decide(stopped, seen(), now(20_001)), { do: 'settle', outcome: 'stopped', note: 'session stopped' });
});

test('an attempt that FAILED past the deadline is judged by its end, never followed by another, and never waits on a full pool', () => {
  // Its harness ended it, so the deadline cut nothing: the note is the end's, as it is inside the deadline.
  const events: Event[] = [withDeadline(10),
    ...started([{ kind: 'ended', at: at(20_001), attempt: 1, sessionId: 's0', observed: 'failed', reason: 'harness', exitCode: 1 }])];
  for (const n of [now(20_001), now(20_001, 30_000, 3, 3), now(5_000), now(5_000, 30_000, 3, 3)]) {
    assert.deepEqual(decide(fold(TASK, events), seen(), n), { do: 'settle', outcome: 'failed', note: '1 attempt(s), none succeeded' },
      `${n.at.getTime() - T0.getTime()} ms, ${n.used}/${n.max}: never start, never wait`);
  }
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

// ─── one attempt per start ──────────────────────────────────────────────────

const endedWith = (observed: Observed, reason: 'harness' | 'lost' | 'unstartable', first: Event = filed()): Event[] => [
  first,
  { kind: 'starting', at: at(1), attempt: 1 },
  ...(reason === 'unstartable' ? [] : [{ kind: 'spawned', at: at(2), attempt: 1 } as Event]),
  { kind: 'ended', at: at(3), attempt: 1, ...(reason === 'unstartable' ? { sessionId: '(never started)', error: 'refused' } : { sessionId: 's0', nativeId: 'native-1' }), observed, reason },
];

test('an attempt that ended LOST, UNSTARTABLE or on its harness\'s failure settles the task failed: trying again is the layer above\'s', () => {
  for (const reason of ['lost', 'unstartable', 'harness'] as const) {
    assert.deepEqual(decide(fold(TASK, endedWith('failed', reason)), seen(), now(9)), { do: 'settle', outcome: 'failed', note: '1 attempt(s), none succeeded' }, reason);
    assert.deepEqual(decide(fold(TASK, endedWith('failed', reason)), seen(), now(9, 30_000, 3, 3)).do, 'settle', `${reason}: a terminal answer, so a full board does not hold it`);
  }
});

test('a journal from before stage 4a part 2, filed with attempts to spare and `resume: always`, settles on its first failed attempt all the same', () => {
  for (const reason of ['lost', 'unstartable', 'harness'] as const) {
    const s = fold(TASK, endedWith('failed', reason, legacyFiled()));
    assert.equal('maxAttempts' in s || 'resume' in s, false, `${reason}: the retired keys are folded unread`);
    assert.deepEqual(decide(s, seen(), now(9)), { do: 'settle', outcome: 'failed', note: '1 attempt(s), none succeeded' }, reason);
  }
  // And it folds to the state the same filing without them does.
  assert.deepEqual(fold(TASK, [legacyFiled()]), fold(TASK, [filed()]));
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
  const s = fold(TASK, [{ kind: 'filed', at: at(0), brief: 'b', cwd: '/r', resumeFrom: 'sess-1' }]);
  assert.deepEqual(decide(s, seen(), now()), { do: 'start', attempt: 1, resumeFrom: 'sess-1' });
});

test('...a journal from before stage 4a part 2 that said `resume: never` included: that was a retry policy, and this is what the work is', () => {
  const s = fold(TASK, [legacyFiled({ resume: 'never', resumeFrom: 'sess-1' })]);
  assert.deepEqual(decide(s, seen(), now()), { do: 'start', attempt: 1, resumeFrom: 'sess-1' });
});

/** A continuation of `sess-1` whose first attempt ended as `then` says: `unstartable` with no spawn, or after one. */
const continuation = (then: Event[], first: Event = { kind: 'filed', at: at(0), brief: 'b', cwd: '/r', resumeFrom: 'sess-1' }): Event[] => [
  first,
  { kind: 'starting', at: at(1), attempt: 1, resumeFrom: 'sess-1' },
  ...then,
];

test('a continuation whose spawn was REFUSED settles failed, and its attempt keeps what it was to continue — which the layer above reads to try again (issue 5)', () => {
  const refused: Event = { kind: 'ended', at: at(2), attempt: 1, sessionId: '(never started)', observed: 'failed', reason: 'unstartable', error: 'refused' };
  for (const first of [undefined, legacyFiled({ resumeFrom: 'sess-1' })]) {
    const s = fold(TASK, continuation([refused], first));
    assert.deepEqual(decide(s, seen(), now(9)), { do: 'settle', outcome: 'failed', note: '1 attempt(s), none succeeded' });
    assert.deepEqual(s.attempts.map((a) => [a.resumeFrom, a.nativeId, a.reason]), [['sess-1', null, 'unstartable']]);
  }
});

test('a continuation whose attempt ran and was lost settles failed too, its own session on the record', () => {
  const s = fold(TASK, continuation([
    { kind: 'spawned', at: at(2), attempt: 1 },
    { kind: 'ended', at: at(3), attempt: 1, sessionId: 's0', observed: 'failed', reason: 'lost', nativeId: 'native-1' },
  ]));
  assert.deepEqual(decide(s, seen(), now(9)), { do: 'settle', outcome: 'failed', note: '1 attempt(s), none succeeded' });
  assert.equal(s.attempts[0]!.nativeId, 'native-1');
});

// ─── when an attempt ended ──────────────────────────────────────────────────

test('an ended attempt keeps the time it ended: the `at` of its `ended` entry', () => {
  const [a] = fold(TASK, ran('failed')).attempts;
  assert.equal(a!.startedAt, at(1));
  assert.equal(a!.endedAt, at(3));
});

test('an attempt in flight has no end time, and does not borrow the one before it', () => {
  const s = fold(TASK, [...ran('failed', legacyFiled()), { kind: 'starting', at: at(4), attempt: 2 }, { kind: 'spawned', at: at(5), attempt: 2 }]);
  assert.deepEqual(s.attempts.map((a) => [a.ended, a.endedAt]), [['failed', at(3)], [null, null]]);
});

// ─── what a person said ─────────────────────────────────────────────────────

/** The same journal with words said to attempt 1 just after it spawned. */
const told = (events: Event[], text = 'widen the scope to the api'): Event[] => {
  const i = events.findIndex((e) => e.kind === 'spawned');
  return [...events.slice(0, i + 1), { kind: 'said', at: at(1_500), attempt: 1, text }, ...events.slice(i + 1)];
};

test('a `said` event changes no decision: running, blocked, ended done, failed, past the deadline, lost', () => {
  const cases: Array<[string, Event[], Map<string, Sighting>, ReturnType<typeof now>]> = [
    ['running', [filed(), ...started()], seen([N1, 'working']), now(5_000)],
    ['blocked', [filed(), ...started()], seen([N1, 'blocked']), now(5_000)],
    ['ended done', ran('done'), seen([N1, 'done']), now(9)],
    ['failed', ran('failed'), seen([N1, 'failed']), now(9)],
    ['past the deadline', [withDeadline(10), ...started()], seen([N1, 'working']), now(20_000)],
    ['never registered', [filed(), ...started()], seen(), now(60_000)],
  ];
  for (const [label, events, observed, when] of cases) {
    const said = fold(TASK, told(events));
    assert.equal(said.said.length, 1, `${label}: the words are on the state`);
    assert.deepEqual(decide(said, observed, when), decide(fold(TASK, events), observed, when), label);
  }
});

test('`waitingFor` changes no decision: it is the harness\'s word for a person to read, and `decide` does not read it', () => {
  // A container's `state.waiting.reason`, carried and never judged. If this ever fails, something turned a word a
  // future Claude Code may change into a condition the engine acts on.
  const cases: Array<[string, Event[], Observed, ReturnType<typeof now>]> = [
    ['blocked', [filed(), ...started()], 'blocked', now(5_000)],
    ['blocked, no attempts left', [filed(), ...started()], 'blocked', now(5_000, 30_000, 3, 3)],
    ['working', [filed(), ...started()], 'working', now(5_000)],
    ['past the deadline', [withDeadline(10), ...started()], 'working', now(20_000)],
  ];
  for (const [label, events, state, when] of cases) {
    const state0 = fold(TASK, events);
    const bare = new Map<string, Sighting>([[N1, { sessionId: 's0', state }]]);
    for (const word of ['permission prompt', 'workspace trust dialog']) {
      const carried = new Map<string, Sighting>([[N1, { sessionId: 's0', state, waitingFor: word }]]);
      assert.deepEqual(decide(state0, carried, when), decide(state0, bare, when), `${label}: ${word}`);
    }
  }
});

test('a journal with no `said` in it — every journal written before `say` — folds to `said: []` and otherwise the same state', () => {
  const { said: none, ...legacy } = fold(TASK, ran('failed'));
  assert.deepEqual(none, []);
  const { said, ...rest } = fold(TASK, told(ran('failed')));
  assert.deepEqual(said, [{ at: at(1_500), attempt: 1, text: 'widen the scope to the api' }]);
  assert.deepEqual(rest, legacy, 'nothing else on the state moved');
});

test('the fold keeps every `said` in order, each with the attempt it was said to', () => {
  const s = fold(TASK, [
    ...told(ran('failed', legacyFiled()), 'first'),
    { kind: 'starting', at: at(4), attempt: 2 }, { kind: 'spawned', at: at(5), attempt: 2 },
    { kind: 'said', at: at(6), attempt: 2, text: 'second' },
  ]);
  assert.deepEqual(s.said.map((x) => [x.attempt, x.text]), [[1, 'first'], [2, 'second']]);
});

// ─── the contract: every ended attempt carries its statement or the reason it has none ──────────

test('CONTRACT: every attempt a task settles over is ended — with the statement its session gave, untouched, or the reason it has none', () => {
  // Every sighting, with and without a statement, a schema, a spent budget, and a cut — a person's stop, or the
  // deadline — walked to its settle. Before 2026-09-19 a cut settled the task over an open attempt: neither.
  const STATEMENT = { summary: 'the agent\'s words' };
  const states = [undefined, 'quiet', 'working', 'blocked', 'done', 'failed', 'stopped'] as const;
  let walked = 0;
  for (const state of states) for (const schema of [false, true]) for (const said of [false, true])
  for (const budgetSpent of [false, true]) for (const cut of ['none', 'operator', 'deadline'] as const) {
    const at_ = `${state} schema=${schema} said=${said} budget=${budgetSpent} cut=${cut}`;
    const events: Event[] = [
      { kind: 'filed', at: at(0), brief: 'b', cwd: '/r', ...(schema ? { closeoutSchema: { type: 'object' } } : {}), ...(cut === 'deadline' ? { deadlineSeconds: 10 } : {}) },
      { kind: 'starting', at: at(1), attempt: 1 }, { kind: 'spawned', at: at(2), attempt: 1 },
      ...(cut === 'operator' ? [{ kind: 'stop-requested', at: at(3) } as Event] : []),
    ];
    let sighting: Sighting | undefined = state === undefined ? undefined : {
      sessionId: 's0', nativeId: 'native-1', state: state === 'quiet' ? 'working' : state, ...(state === 'quiet' ? { quietMs: 60_000 } : {}),
      ...(said ? { closeout: { payload: STATEMENT, at: T0.getTime() + 30_000 } } : {}), ...(budgetSpent ? { budgetSpent: true as const } : {}),
    };
    let settled: string | undefined;
    for (let step = 0; step < 6 && !settled; step++) {
      const a = decide(fold(TASK, events), new Map(sighting ? [[N1, sighting]] : []), now(60_000));
      if (a.do === 'settle') settled = a.outcome;
      else if (a.do === 'stop') sighting = { ...sighting!, state: 'stopped' };
      else if (a.do === 'record-end') events.push({ kind: 'ended', at: at(4 + step), attempt: a.attempt, sessionId: a.sessionId, observed: a.observed, reason: a.reason, nativeId: a.nativeId, closeout: a.closeout, ...(a.stated !== undefined ? { stated: a.stated } : {}) });
      else break;
    }
    if (!settled) {
      assert.ok(cut === 'none' && (state === 'working' || state === 'blocked'), `${at_}: only a live, uncut session stays unsettled`);
      continue;
    }
    walked++;
    const [attempt] = fold(TASK, events).attempts;
    assert.notEqual(attempt!.ended, null, `${at_}: settled over an open attempt — neither statement nor reason`);
    assert.equal(attempt!.closeout, sighting?.closeout?.payload, `${at_}: the statement is the session's, untouched, or none`);
    if (state === 'done' || state === 'failed') assert.ok(!['operator', 'deadline'].includes(attempt!.reason!), `${at_}: its harness ended it before the cut, and that end is recorded`);
    if (budgetSpent && state !== undefined) assert.deepEqual([attempt!.ended, attempt!.reason], ['failed', 'budget'], `${at_}: a spent budget is failed, never done`);
    // An end on record is judged by that end: a deadline read in the same pass does not overrule it (2026-09-24).
    if (attempt!.ended === 'done' && cut !== 'operator') assert.equal(settled, 'succeeded', `${at_}: ended done, and settled ${settled}`);
    // Whether the statement came is on every end read off a sighting of a task that asked for one, and on no other.
    if (!schema) assert.equal('stated' in attempt!, false, `${at_}: nothing asked, nothing reported`);
    else if (attempt!.reason === 'harness' || attempt!.reason === 'budget') assert.equal(attempt!.stated, attempt!.closeout !== undefined, `${at_}: stated is whether a statement came`);
  }
  assert.ok(walked > 100, `walked ${walked}`);
});

// ─── a task held open (R1): a signed end waits on a person, an answer is a turn, a close settles ──────────

const N3 = nameFor(TASK, 3);
/** A task held open whose first attempt signed at 3 s; `extra` on the filing. */
const held = (extra: Partial<Extract<Event, { kind: 'filed' }>> = {}): Event[] => [
  { kind: 'filed', at: at(0), brief: 'draft the plan', cwd: '/r', closeoutSchema: { type: 'object' }, holdOpen: true, ...extra },
  { kind: 'starting', at: at(1_000), attempt: 1 }, { kind: 'spawned', at: at(1_100), attempt: 1 },
  { kind: 'ended', at: at(3_000), attempt: 1, sessionId: 's0', observed: 'done', reason: 'harness', nativeId: 'native-1', closeout: { plan: 'v1' } },
];
const answer = (ms: number, text = 'make it smaller', budgetUsd?: number): Event =>
  ({ kind: 'input', at: at(ms), text, ...(budgetUsd !== undefined ? { budgetUsd } : {}) });
/** Turn 1's first attempt, started at `ms`, and its end if given. */
const turn1 = (ms: number, ended?: { observed: Observed; reason?: 'harness' | 'unsigned' | 'lost' | 'budget'; nativeId?: string; stated?: boolean }): Event[] => [
  { kind: 'starting', at: at(ms), attempt: 2, resumeFrom: 'native-1', nudge: 'make it smaller' }, { kind: 'spawned', at: at(ms + 100), attempt: 2 },
  ...(ended ? [{ kind: 'ended', at: at(ms + 2_000), attempt: 2, sessionId: 's1', observed: ended.observed, reason: ended.reason ?? 'harness', nativeId: ended.nativeId ?? 'native-1', ...(ended.stated !== undefined ? { stated: ended.stated } : {}) } as Event] : []),
];

test('HELD OPEN: a signed end waits as input-required, not settled — and past its deadline too, since the deadline times work, not a person reading it', () => {
  assert.deepEqual(decide(fold(TASK, held()), seen(), now(9_000)), { do: 'nothing', why: 'input-required' });
  assert.deepEqual(decide(fold(TASK, held({ deadlineSeconds: 10 })), seen(), now(3_600_000)), { do: 'nothing', why: 'input-required' }, 'an hour past a 10 s deadline');
  assert.deepEqual(decide(fold(TASK, held()), seen(), now(9_000, 30_000, 3, 3)), { do: 'nothing', why: 'input-required' }, 'a full board changes nothing');
  // The control: the same journal without `holdOpen` settles on the signed end, as every task filed before did.
  const plain = held().map((e) => (e.kind === 'filed' ? (({ holdOpen: _, ...rest }) => rest)(e) : e)) as Event[];
  assert.deepEqual(decide(fold(TASK, plain), seen(), now(9_000)), { do: 'settle', outcome: 'succeeded' });
  assert.equal(fold(TASK, plain).holdOpen, undefined);
});

test('HELD OPEN: an answer is a turn — an attempt continuing the session that signed, told the words instead of the brief', () => {
  const s = fold(TASK, [...held(), answer(60_000)]);
  assert.deepEqual(decide(s, seen(), now(61_000)), { do: 'start', attempt: 2, resumeFrom: 'native-1', nudge: 'make it smaller' });
  assert.deepEqual(decide(s, seen(), now(61_000, 30_000, 3, 3)).do, 'nothing', 'a new turn waits for a slot like any start');
  // A journal from before stage 4a part 2 that said `resume: never` too: the answer continues a conversation, which no retry policy was a word about.
  assert.deepEqual(decide(fold(TASK, [...held({ resume: 'never' } as object), answer(60_000)]), seen(), now(61_000)),
    { do: 'start', attempt: 2, resumeFrom: 'native-1', nudge: 'make it smaller' });
  // The turn's attempt carries its turn; the first does not, as none before holding open did.
  const t = fold(TASK, [...held(), answer(60_000), ...turn1(61_000)]);
  assert.deepEqual(t.attempts.map((a) => a.turn), [undefined, 1]);
  assert.equal('turn' in t.attempts[0]!, false);
  assert.deepEqual(decide(t, seen([N2, 'working']), now(62_000)).do, 'nothing', 'running');
  // It signs, and waits again.
  const signed = fold(TASK, [...held(), answer(60_000), ...turn1(61_000, { observed: 'done' })]);
  assert.deepEqual(decide(signed, seen(), now(70_000)), { do: 'nothing', why: 'input-required' });
});

test('HELD OPEN: the turn follows the journal order — an answer journalled before a start is that attempt\'s turn, after it is the next', () => {
  const start2: Event[] = [{ kind: 'starting', at: at(61_000), attempt: 2 }, { kind: 'spawned', at: at(61_100), attempt: 2 }];
  const before = fold(TASK, [...held(), answer(60_000), ...start2]);
  const after = fold(TASK, [...held(), ...start2, answer(62_000)]);
  assert.deepEqual(before.attempts.map((a) => a.turn ?? 0), [0, 1]);
  assert.deepEqual(after.attempts.map((a) => a.turn ?? 0), [0, 0]);
});

test('HELD OPEN: two answers journalled before the turn started are both told, in order, and the last budget given is the turn\'s', () => {
  const s = fold(TASK, [...held({ budgetUsd: 1 }), answer(60_000, 'first', 2), answer(60_500, 'second')]);
  assert.deepEqual(decide(s, seen(), now(61_000)), { do: 'start', attempt: 2, resumeFrom: 'native-1', nudge: 'first\n\nsecond' });
  assert.equal(turnOf(s).budgetUsd, 2, 'the budget given with the words');
  assert.equal(turnOf(fold(TASK, [...held({ budgetUsd: 1 }), answer(60_000)])).budgetUsd, 1, 'none given: the filing\'s');
  assert.equal(turnOf(fold(TASK, held({ budgetUsd: 1 }))).budgetUsd, 1, 'turn 0: the filing\'s');
  assert.equal(turnOf(fold(TASK, [...held({ budgetUsd: 1 }), answer(60_000, 'w', 3)]), 0).budgetUsd, 1, 'an earlier turn keeps its own');
});

test('HELD OPEN: the deadline runs from the current turn\'s first attempt, not the task\'s', () => {
  const s = fold(TASK, [...held({ deadlineSeconds: 10 }), answer(3_600_000), ...turn1(3_601_000)]);
  assert.equal(decide(s, seen([N2, 'working']), now(3_605_000)).do, 'nothing', 'four seconds into the turn, an hour into the task');
  assert.deepEqual(decide(s, seen([N2, 'working']), now(3_612_000)), { do: 'stop', sessionId: 's0', why: 'deadline' });
  assert.equal(decide(fold(TASK, [...held({ deadlineSeconds: 10 }), answer(3_600_000)]), seen(), now(3_600_500)).do, 'start',
    'an answer waiting for its turn is not past a deadline');
});

test('HELD OPEN: a turn is one attempt — one that fails, is lost or cannot start settles the task failed, and trying again is the layer above\'s', () => {
  const settled = { do: 'settle', outcome: 'failed', note: '1 attempt(s) of turn 1, none succeeded' };
  const failed = fold(TASK, [...held(), answer(60_000), ...turn1(61_000, { observed: 'failed', nativeId: 'native-1' })]);
  assert.deepEqual(decide(failed, seen(), now(70_000)), settled, 'failed on its harness');
  const lost = fold(TASK, [...held(), answer(60_000), ...turn1(61_000, { observed: 'failed', reason: 'lost', nativeId: 'native-2' })]);
  assert.deepEqual(decide(lost, seen(), now(70_000)), settled, 'lost');
  const unstartable = fold(TASK, [...held(), answer(60_000),
    { kind: 'starting', at: at(61_000), attempt: 2, resumeFrom: 'native-1', nudge: 'make it smaller' },
    { kind: 'ended', at: at(61_100), attempt: 2, sessionId: '(never started)', observed: 'failed', reason: 'unstartable', error: 'refused' }]);
  assert.deepEqual(decide(unstartable, seen(), now(70_000)), settled, 'unstartable');
  // A journal from before stage 4a part 2 that allowed a turn more attempts settles the same.
  const legacy = fold(TASK, [...held({ maxAttempts: 3, resume: 'always' } as object), answer(60_000), ...turn1(61_000, { observed: 'failed', reason: 'lost', nativeId: 'native-2' })]);
  assert.deepEqual(decide(legacy, seen(), now(70_000)), settled, 'legacy');
  // A turn that ended `done` without its statement waits on a person like any other: the engine does not nudge it.
  const unstated = fold(TASK, [...held(), answer(60_000), ...turn1(61_000, { observed: 'done', nativeId: 'native-2', stated: false })]);
  assert.deepEqual(decide(unstated, seen(), now(70_000)), { do: 'nothing', why: 'input-required' });
  // And an old one the engine judged `unsigned` settles failed, as a task not held open does.
  const unsigned = fold(TASK, [...held(), answer(60_000), ...turn1(61_000, { observed: 'failed', reason: 'unsigned', nativeId: 'native-2' })]);
  assert.deepEqual(decide(unsigned, seen(), now(70_000)),
    { do: 'settle', outcome: 'failed', note: '1 attempt(s) of turn 1, none succeeded: the last ended without the closing statement it was asked for' });
  // A journal caught with two attempts in a turn counts both.
  const twice = fold(TASK, [...held(), answer(60_000), ...turn1(61_000, { observed: 'failed' }),
    { kind: 'starting', at: at(70_000), attempt: 3 }, { kind: 'spawned', at: at(70_100), attempt: 3 },
    { kind: 'ended', at: at(72_000), attempt: 3, sessionId: 's2', observed: 'failed', reason: 'harness', nativeId: 'native-1' }]);
  assert.deepEqual(decide(twice, seen(), now(73_000)), { do: 'settle', outcome: 'failed', note: '2 attempt(s) of turn 1, none succeeded' });
  // A spent budget in a later turn is spent, as in the first.
  const spent = fold(TASK, [...held(), answer(60_000, 'w', 0.5), ...turn1(61_000, { observed: 'failed', reason: 'budget' })]);
  assert.deepEqual(decide(spent, seen(), now(70_000)),
    { do: 'settle', outcome: 'failed', note: 'attempt 2 spent its budget. File the task again with a larger one to run it again' });
});

test('HELD OPEN: a later turn continues only the session that signed the turn before — none recorded, it settles failed rather than start cold', () => {
  const unrecorded = (extra: Partial<Extract<Event, { kind: 'filed' }>> = {}) =>
    held(extra).map((e) => (e.kind === 'ended' ? (({ nativeId: _, ...rest }) => rest)(e) : e)) as Event[];
  assert.deepEqual(decide(fold(TASK, unrecorded()), seen(), now(9_000)), { do: 'nothing', why: 'input-required' }, 'it signed: it waits, and a close settles it');
  const settled = { do: 'settle', outcome: 'failed', note: 'turn 1 has no session to continue: its harness recorded none for the attempt that signed' };
  assert.deepEqual(decide(fold(TASK, [...unrecorded(), answer(60_000)]), seen(), now(61_000)), settled);
  // Not the session the task was filed against, which never heard the plan; nor an earlier attempt that failed.
  assert.deepEqual(decide(fold(TASK, [...unrecorded({ resumeFrom: 'before-the-task' }), answer(60_000)]), seen(), now(61_000)), settled);
  const failedFirst: Event[] = [held()[0]!,
    { kind: 'starting', at: at(500), attempt: 1 }, { kind: 'ended', at: at(900), attempt: 1, sessionId: 's0', observed: 'failed', reason: 'harness', nativeId: 'failed-one' },
    ...unrecorded().slice(1).map((e) => ('attempt' in e ? { ...e, attempt: 2 } : e)) as Event[], answer(60_000)];
  assert.deepEqual(decide(fold(TASK, failedFirst), seen(), now(61_000)), settled);
  assert.equal(turnOf(fold(TASK, [...unrecorded({ resumeFrom: 'before-the-task' })])).continues, 'before-the-task', 'turn 0 continues what it was filed against');
});

test('HELD OPEN: a close settles it — succeeded on a signed turn, failed after one that did not sign, and never over an attempt in flight', () => {
  const closed: Event = { kind: 'closed', at: at(90_000) };
  assert.deepEqual(decide(fold(TASK, [...held(), closed]), seen(), now(91_000)), { do: 'settle', outcome: 'succeeded', note: 'closed' });
  assert.deepEqual(decide(fold(TASK, [...held({ deadlineSeconds: 10 }), closed]), seen(), now(3_600_000)), { do: 'settle', outcome: 'succeeded', note: 'closed' },
    'past the deadline: the close, not the deadline');
  const mid = fold(TASK, [...held(), answer(60_000), ...turn1(61_000), closed]);
  assert.equal(decide(mid, seen([N2, 'working']), now(91_000)).do, 'nothing', 'a close that raced an answer lets its attempt run');
  assert.deepEqual(decide(fold(TASK, [...held(), answer(60_000), ...turn1(61_000, { observed: 'failed' }), closed]), seen(), now(91_000)),
    { do: 'settle', outcome: 'failed', note: 'closed: attempt 2 ended failed' }, 'closed: said as closed');
  assert.deepEqual(decide(fold(TASK, [...held(), answer(60_000), ...turn1(61_000, { observed: 'done' }), closed]), seen(), now(91_000)),
    { do: 'settle', outcome: 'succeeded', note: 'closed' });
  // The control: `closed` on a task not held open is no word decide reads — it settles as it would have.
  const plain = held().map((e) => (e.kind === 'filed' ? (({ holdOpen: _, ...rest }) => rest)(e) : e)) as Event[];
  assert.deepEqual(decide(fold(TASK, [...plain.slice(0, 3), closed]), seen([N1, 'working']), now(91_000)).do, 'nothing');
});

test('HELD OPEN: a stop outranks the wait — a task waiting settles stopped, and one mid-turn stops its session first', () => {
  const stop: Event = { kind: 'stop-requested', at: at(90_000) };
  assert.deepEqual(decide(fold(TASK, [...held(), stop]), seen(), now(91_000)), { do: 'settle', outcome: 'stopped', note: 'operator' });
  assert.deepEqual(decide(fold(TASK, [...held(), answer(60_000), ...turn1(61_000), stop]), seen([N2, 'working']), now(91_000)),
    { do: 'stop', sessionId: 's0', why: 'operator' });
});

test('HELD OPEN: waitsForInput is the signed current turn of a task held open, and nothing else', () => {
  assert.equal(waitsForInput(fold(TASK, held())), true);
  assert.equal(waitsForInput(fold(TASK, [...held(), answer(60_000)])), false, 'answered');
  assert.equal(waitsForInput(fold(TASK, [...held(), { kind: 'closed', at: at(9) }])), false, 'closed');
  assert.equal(waitsForInput(fold(TASK, [...held(), { kind: 'settled', at: at(9), outcome: 'stopped' }])), false, 'settled');
  assert.equal(waitsForInput(fold(TASK, held().slice(0, 3))), false, 'in flight');
  const plain = held().map((e) => (e.kind === 'filed' ? (({ holdOpen: _, ...rest }) => rest)(e) : e)) as Event[];
  assert.equal(waitsForInput(fold(TASK, plain)), false, 'not held open');
  assert.equal(N3, 'ae/t-1/3');
});

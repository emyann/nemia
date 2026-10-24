/**
 * `decide` is the engine. It is pure, so this file is the one that has to be exhaustive —
 * and it needs no database, no harness and no clock it did not bring.
 *
 * A job walked entry by entry and a task held open across its turns are stories; how a job starts and settles, what a closing
 * statement records, the grace window, the deadline, a journal an older runtime wrote and the words that change no decision are
 * tables, one row per case. The crash window, settled-is-final, the replayed fold and the CONTRACT walk are kept focused: each is
 * an invariant whose failure must not hide behind a skip.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, fold, nameFor, turnOf, waitsForInput, type Event, type Sighting } from './domain.ts';
import type { Outcome, SessionState } from './session.ts';
import type { HarnessArgs } from '../harness/args.ts';
import { story } from '../../test/checkpoints.ts';

const T0 = new Date('2026-01-01T00:00:00Z');
const at = (ms: number) => new Date(T0.getTime() + ms).toISOString();
const now = (ms = 0, graceMs = 30_000) => ({ at: new Date(T0.getTime() + ms), graceMs });
const TASK = 't-1';
const N1 = nameFor(TASK, 1);
const N2 = nameFor(TASK, 2);
/** Sightings are keyed by the name WE chose, which is what makes adoption exact. */
const seen = (...pairs: Array<[string, SessionState]>): Map<string, Sighting> =>
  new Map(pairs.map(([name, state], i) => [name, { sessionId: `s${i}`, state }]));

/** A filing as `file` writes one: not queued, so the pass starts it with no word from above. */
const filed = (): Event => ({ kind: 'filed', at: at(0), brief: 'do the thing', cwd: '/repo', queued: false });

/** The same filing as a journal an older runtime wrote has it: no `queued` key, which reads as queued (`admit.test.ts`). */
const keyless = (): Event => ({ kind: 'filed', at: at(0), brief: 'do the thing', cwd: '/repo' });

/** The layer above's word that a queued task may start: what a filing with no `queued` key needs before it starts. */
const admitted = (ms = 0): Event => ({ kind: 'admitted', at: at(ms) });

/**
 * A `filed` entry as a journal an older runtime wrote may carry it: with `maxAttempts` and a `resume` policy, which the type
 * does not name and `fold` reads past.
 */
const legacyFiled = (extra: object = {}): Event =>
  ({ kind: 'filed', at: at(0), brief: 'do the thing', cwd: '/repo', maxAttempts: 3, resume: 'always', ...extra }) as Event;

/** Attempt 1 in flight, and the task filed with a closing statement asked for, or not. */
const inFlight = (schema: boolean, legacy = false): Event[] => [
  {
    kind: 'filed',
    at: at(0),
    brief: 'b',
    cwd: '/r',
    ...(legacy ? { maxAttempts: 3, resume: 'always' } : {}),
    ...(schema ? { closeoutSchema: { type: 'object' } } : {}),
  },
  { kind: 'starting', at: at(1), attempt: 1 },
  { kind: 'spawned', at: at(2), attempt: 1 },
];
const quiet = (extra: Partial<Sighting> = {}): Map<string, Sighting> =>
  new Map([[N1, { sessionId: 's0', nativeId: 'n1', state: 'working' as const, busy: false, quietMs: 120_000, ...extra }]]);

/**
 * A journal an older runtime wrote, whose engine judged attempt 1 by a reason of its own, as `upgrade` reads it: the harness's
 * end with no statement, the reason kept as `former`, which `decide` never records.
 */
const formerEnd = (legacy = false): Event[] => [
  ...inFlight(true, legacy),
  {
    kind: 'ended',
    at: at(3),
    attempt: 1,
    sessionId: 's0',
    observed: 'failed',
    reason: 'harness',
    closedOut: false,
    former: 'unsigned',
    nativeId: 'n1',
  },
];

/** A reading of the monotonic clock `ms` into boot `boot`, as the engine stamps one. */
const mono = (ms: number, boot = 'b-1') => ({ boot, ms });

/** A spawn journalled at `at(2)`, its intent at `at(1)`, each stamped on the monotonic clock of `boot` when given one. */
const spawnedIn = (boot?: string): Event[] => [
  filed(),
  { kind: 'starting', at: at(1), attempt: 1, ...(boot ? { mono: mono(1, boot) } : {}) },
  { kind: 'spawned', at: at(2), attempt: 1, ...(boot ? { mono: mono(2, boot) } : {}) },
];

const ran = (outcome: Outcome, first: Event = filed()): Event[] => [
  first,
  { kind: 'starting', at: at(1), attempt: 1 },
  { kind: 'spawned', at: at(2), attempt: 1 },
  { kind: 'ended', at: at(3), attempt: 1, sessionId: 's0', observed: outcome, reason: 'harness', nativeId: 'n1' },
];

const withDeadline = (seconds: number): Event => ({ kind: 'filed', at: at(0), brief: 'b', cwd: '/repo', deadlineSeconds: seconds });

const started = (extra: Event[] = []): Event[] => [
  { kind: 'starting', at: at(1_000), attempt: 1 },
  { kind: 'spawned', at: at(1_100), attempt: 1 },
  ...extra,
];

/** An attempt started at `at(1_000)` and spawned at `at(1_100)`, both stamped on the monotonic clock of `boot`. */
const startedIn = (boot: string): Event[] => [
  { kind: 'starting', at: at(1_000), attempt: 1, mono: mono(1_000, boot) },
  { kind: 'spawned', at: at(1_100), attempt: 1, mono: mono(1_100, boot) },
];

const endedWith = (observed: Outcome, reason: 'harness' | 'lost' | 'unstartable', first: Event = filed()): Event[] => [
  first,
  { kind: 'starting', at: at(1), attempt: 1 },
  ...(reason === 'unstartable' ? [] : [{ kind: 'spawned', at: at(2), attempt: 1 } as Event]),
  {
    kind: 'ended',
    at: at(3),
    attempt: 1,
    ...(reason === 'unstartable' ? { sessionId: '(never started)', error: 'refused' } : { sessionId: 's0', nativeId: 'native-1' }),
    observed,
    reason,
  },
];

/** The note a task settles failed with after one attempt ended for `reason`: a refused spawn says its words and the fix. */
const noteOf = (reason: 'lost' | 'unstartable' | 'harness') =>
  reason === 'unstartable'
    ? '1 attempt(s), none succeeded: the last could not start: refused; fix what it names and file the task again'
    : '1 attempt(s), none succeeded';

/** A continuation of `sess-1` whose first attempt ended as `then` says: `unstartable` with no spawn, or after one. */
const continuation = (then: Event[], first: Event = { kind: 'filed', at: at(0), brief: 'b', cwd: '/r', resumeFrom: 'sess-1' }): Event[] => [
  first,
  { kind: 'starting', at: at(1), attempt: 1, resumeFrom: 'sess-1' },
  ...then,
];

/** The same journal with words said to attempt 1 just after it spawned. */
const told = (events: Event[], text = 'widen the scope to the api'): Event[] => {
  const i = events.findIndex((e) => e.kind === 'spawned');
  return [...events.slice(0, i + 1), { kind: 'said', at: at(1_500), attempt: 1, text }, ...events.slice(i + 1)];
};

test('A JOB, walked entry by entry as a pass meets it: filed, started, spawned, seen at work each way a harness says, ended and settled', async (t) => {
  const s = story(t);
  const events: Event[] = [filed()];

  await s.test(
    'a filed task starts its first attempt, and `decide` is handed nothing to hold it back with: no count of sessions at work and no ceiling',
    () => {
      const state = fold(TASK, events);
      assert.deepEqual(decide(state, seen(), now()), { do: 'start', attempt: 1, resumeFrom: undefined });
      assert.deepEqual(
        decide(state, seen(), now()),
        { do: 'start', attempt: 1, resumeFrom: undefined },
        "it starts whatever else runs: how many run at once is the layer above's (`agent-orchestrator/src/cap/cap.test.ts`)",
      );
      assert.deepEqual(Object.keys(now()).sort(), ['at', 'graceMs'], 'the clock and the grace window, and no count');
    },
  );

  await s.test('a running session is left alone', () => {
    events.push({ kind: 'starting', at: at(1), attempt: 1 }, { kind: 'spawned', at: at(2), attempt: 1 });
    assert.equal(decide(fold(TASK, events), seen([N1, 'working']), now(5)).do, 'nothing');
  });

  await s.test('a QUIESCENT session is still left alone — being between steps is legitimate', () => {
    const quiescent = new Map([[N1, { sessionId: 's0', state: 'working' as const, busy: false }]]);
    assert.equal(
      decide(fold(TASK, events), quiescent, now(5)).do,
      'nothing',
      '`working` and not busy is a stall and a wait between self-driven steps alike: `decide` cannot tell them apart, so it reports and waits',
    );
    const bounded = fold(TASK, [
      { kind: 'filed', at: at(0), brief: 'b', cwd: '/r', deadlineSeconds: 10 },
      { kind: 'starting', at: at(1_000), attempt: 1 },
      { kind: 'spawned', at: at(1_100), attempt: 1 },
    ]);
    assert.deepEqual(decide(bounded, quiescent, now(30_000)), { do: 'stop', sessionId: 's0', why: 'deadline' }, 'with a deadline, it ends');
  });

  await s.test('a blocked session is running, and says why', () => {
    const a = decide(fold(TASK, events), seen([N1, 'input-required']), now(5));
    assert.equal(a.do, 'nothing');
    assert.match(a.why, /needs a person/);
  });

  await s.test('done settles as succeeded, and the ended attempt keeps the time it ended: the `at` of its `ended` entry', () => {
    events.push({ kind: 'ended', at: at(3), attempt: 1, sessionId: 's0', observed: 'succeeded', reason: 'harness', nativeId: 'n1' });
    const state = fold(TASK, events);
    assert.deepEqual(decide(state, seen([N1, 'completed']), now(9)), { do: 'settle', outcome: 'succeeded' });
    const [a] = state.attempts;
    assert.equal(a.startedAt, at(1));
    assert.equal(a.endedAt, at(3));
  });
});

test('ADOPTION, the crash window: an intent with no spawn behind it is spawned, the same on every pass, and a session running under our name is adopted, never started twice', () => {
  const s = fold(TASK, [filed(), { kind: 'starting', at: at(1), attempt: 1 }]);
  assert.deepEqual(decide(s, seen(), now()), { do: 'spawn', attempt: 1, name: N1 });
  assert.deepEqual(decide(s, seen(), now()), decide(s, seen(), now()), 'spawning is idempotent: deciding twice says the same');
  assert.equal(decide(s, seen(), now(5)).do, 'spawn', 'nothing out there: spawn it');
  assert.deepEqual(decide(s, seen([N1, 'working']), now(5)).do, 'nothing', 'already out there: adopt it');
});

test('settled is terminal — nothing moves after it, whatever the machine says', () => {
  const s = fold(TASK, [...ran('succeeded'), { kind: 'settled', at: at(4), outcome: 'succeeded' }]);
  assert.equal(decide(s, seen([N1, 'failed']), now(99)).do, 'nothing');
});

test('the fold re-derives the same state from a replayed journal — restart safety', () => {
  const events = ran('failed');
  assert.deepEqual(
    fold(TASK, events),
    fold(
      TASK,
      [...events].map((e) => JSON.parse(JSON.stringify(e)) as Event),
    ),
  );
});

test('decide: how a job starts and settles — each end its harness, a person or the runtime gives it, and a continuation', async (t) => {
  await t.test('failed settles as failed: one attempt per start', () => {
    assert.deepEqual(decide(fold(TASK, ran('failed')), seen([N1, 'failed']), now(9)), {
      do: 'settle',
      outcome: 'failed',
      note: '1 attempt(s), none succeeded',
    });
  });

  await t.test('a session stopped by hand settles as stopped', () => {
    const a = decide(fold(TASK, ran('stopped')), seen([N1, 'canceled']), now(9));
    assert.equal(a.do === 'settle' && a.outcome, 'stopped');
  });

  await t.test('a stop request stops a live session, ends its attempt OPERATOR, then settles', () => {
    const live: Event[] = [
      filed(),
      { kind: 'starting', at: at(1), attempt: 1 },
      { kind: 'spawned', at: at(2), attempt: 1 },
      { kind: 'stop-requested', at: at(3) },
    ];
    assert.deepEqual(decide(fold(TASK, live), seen([N1, 'working']), now(9)), { do: 'stop', sessionId: 's0', why: 'operator' });
    assert.deepEqual(decide(fold(TASK, live), seen([N1, 'canceled']), now(9)), {
      do: 'record-end',
      attempt: 1,
      sessionId: 's0',
      observed: 'stopped',
      reason: 'operator',
      nativeId: undefined,
      closeout: undefined,
    });
    const ended = fold(TASK, [
      ...live,
      { kind: 'ended', at: at(10), attempt: 1, sessionId: 's0', observed: 'stopped', reason: 'operator' },
    ]);
    assert.deepEqual(decide(ended, seen([N1, 'canceled']), now(11)), { do: 'settle', outcome: 'stopped', note: 'operator' });
  });

  await t.test('a stop request on a task that never started settles it immediately', () => {
    const a = decide(fold(TASK, [filed(), { kind: 'stop-requested', at: at(1) }]), seen(), now(9));
    assert.equal(a.do === 'settle' && a.outcome, 'stopped');
  });

  for (const reason of ['lost', 'unstartable', 'harness'] as const)
    await t.test(`an attempt that ended ${reason} settles the task failed: trying again is the layer above's`, () => {
      assert.deepEqual(
        decide(fold(TASK, endedWith('failed', reason)), seen(), now(9)),
        { do: 'settle', outcome: 'failed', note: noteOf(reason) },
        reason,
      );
    });

  await t.test('a task filed AGAINST a session continues it on the first attempt', () => {
    const s = fold(TASK, [{ kind: 'filed', at: at(0), brief: 'b', cwd: '/r', resumeFrom: 'sess-1', queued: false }]);
    assert.deepEqual(decide(s, seen(), now()), { do: 'start', attempt: 1, resumeFrom: 'sess-1' });
  });

  await t.test(
    'a continuation whose spawn was REFUSED settles failed, and its attempt keeps what it was to continue — which the layer above reads to try again',
    () => {
      const refused: Event = {
        kind: 'ended',
        at: at(2),
        attempt: 1,
        sessionId: '(never started)',
        observed: 'failed',
        reason: 'unstartable',
        error: 'refused',
      };
      for (const first of [undefined, legacyFiled({ resumeFrom: 'sess-1' })]) {
        const s = fold(TASK, continuation([refused], first));
        assert.deepEqual(decide(s, seen(), now(9)), { do: 'settle', outcome: 'failed', note: noteOf('unstartable') });
        assert.deepEqual(
          s.attempts.map((a) => [a.resumeFrom, a.nativeId, a.reason]),
          [['sess-1', null, 'unstartable']],
        );
      }
    },
  );

  await t.test('a continuation whose attempt ran and was lost settles failed too, its own session on the record', () => {
    const s = fold(
      TASK,
      continuation([
        { kind: 'spawned', at: at(2), attempt: 1 },
        { kind: 'ended', at: at(3), attempt: 1, sessionId: 's0', observed: 'failed', reason: 'lost', nativeId: 'native-1' },
      ]),
    );
    assert.deepEqual(decide(s, seen(), now(9)), { do: 'settle', outcome: 'failed', note: '1 attempt(s), none succeeded' });
    assert.equal(s.attempts[0].nativeId, 'native-1');
  });
});

test('decide: what a closing statement records — a quiet session, the harness’s own end, `closedOut`, and a limit nobody here judges', async (t) => {
  await t.test(
    'a session its harness ended at a limit its configuration set ends as its harness said: the limit is carried on the attempt, and judged by nobody here',
    () => {
      const events: Event[] = [
        { kind: 'filed', at: at(0), brief: 'b', cwd: '/r', config: { budgetUsd: 0.01 } },
        { kind: 'starting', at: at(1), attempt: 1 },
        { kind: 'spawned', at: at(2), attempt: 1 },
      ];
      for (const [state, end] of [
        ['failed', 'failed'],
        ['completed', 'succeeded'],
      ] as const) {
        const at_ = `${state} at its cap`;
        const capped = new Map([[N1, { sessionId: 's0', state, nativeId: 'native-1', limit: 'budget' }]]);
        const plain = new Map([[N1, { sessionId: 's0', state, nativeId: 'native-1' }]]);
        assert.deepEqual(decide(fold(TASK, events), capped, now(5)), decide(fold(TASK, events), plain, now(5)), at_);
        assert.deepEqual(
          decide(fold(TASK, events), capped, now(5)),
          { do: 'record-end', attempt: 1, sessionId: 's0', observed: end, reason: 'harness', nativeId: 'native-1', closeout: undefined },
          at_,
        );
        const ended = fold(TASK, [
          ...events,
          {
            kind: 'ended',
            at: at(6),
            attempt: 1,
            sessionId: 's0',
            observed: end,
            reason: 'harness',
            nativeId: 'native-1',
            limit: 'budget',
          },
        ]);
        assert.equal(ended.attempts[0].limit, 'budget', `${at_}: the fact is on the attempt, for the layer above`);
        const settled =
          end === 'succeeded'
            ? { do: 'settle', outcome: 'succeeded' }
            : { do: 'settle', outcome: 'failed', note: '1 attempt(s), none succeeded' };
        assert.deepEqual(decide(ended, new Map(), now(7)), settled, `${at_}: settled as any such end is`);
      }
      const none = fold(TASK, [
        ...events,
        { kind: 'ended', at: at(6), attempt: 1, sessionId: 's0', observed: 'failed', reason: 'harness', nativeId: 'native-1' },
      ]);
      assert.equal('limit' in none.attempts[0], false, 'a task filed with no cap: no limit, and nothing on the attempt');
    },
  );

  await t.test('a QUIET session that was asked for no statement is done — quiet is all such a task has', () => {
    assert.deepEqual(decide(fold(TASK, inFlight(false)), quiet(), now(5)), {
      do: 'record-end',
      attempt: 1,
      sessionId: 's0',
      observed: 'succeeded',
      reason: 'harness',
      nativeId: 'n1',
      closeout: undefined,
    });
  });

  await t.test(
    'a QUIET session asked for a statement that gave none ends `done`, and says it gave none — `closedOut: false`, a fact the engine does not judge',
    () => {
      assert.deepEqual(
        decide(fold(TASK, inFlight(true)), quiet(), now(5)),
        {
          do: 'record-end',
          attempt: 1,
          sessionId: 's0',
          observed: 'succeeded',
          reason: 'harness',
          nativeId: 'n1',
          closeout: undefined,
          closedOut: false,
        },
        "what a missing statement means is the layer above's to say, read off `closedOut`",
      );
      assert.deepEqual(decide(fold(TASK, inFlight(true)), quiet({ closeout: { payload: { ok: true }, at: 3 } }), now(5)), {
        do: 'record-end',
        attempt: 1,
        sessionId: 's0',
        observed: 'succeeded',
        reason: 'harness',
        nativeId: 'n1',
        closeout: { ok: true },
        closedOut: true,
      });
    },
  );

  await t.test(
    "the HARNESS'S `done` without a statement is recorded as the harness said it, with `closedOut: false` — for a task that asked for one, and only for one",
    () => {
      const done = (extra: Partial<Sighting> = {}): Map<string, Sighting> =>
        new Map([[N1, { sessionId: 's0', nativeId: 'n1', state: 'completed' as const, ...extra }]]);
      assert.deepEqual(decide(fold(TASK, inFlight(true)), done(), now(5)), {
        do: 'record-end',
        attempt: 1,
        sessionId: 's0',
        observed: 'succeeded',
        reason: 'harness',
        nativeId: 'n1',
        closeout: undefined,
        closedOut: false,
      });
      assert.deepEqual(decide(fold(TASK, inFlight(true)), done({ closeout: { payload: { ok: true }, at: 3 } }), now(5)), {
        do: 'record-end',
        attempt: 1,
        sessionId: 's0',
        observed: 'succeeded',
        reason: 'harness',
        nativeId: 'n1',
        closeout: { ok: true },
        closedOut: true,
      });
      assert.deepEqual(
        decide(fold(TASK, inFlight(false)), done(), now(5)),
        {
          do: 'record-end',
          attempt: 1,
          sessionId: 's0',
          observed: 'succeeded',
          reason: 'harness',
          nativeId: 'n1',
          closeout: undefined,
        },
        'a task that asked for nothing is told of nothing: no `closedOut` key',
      );
      assert.deepEqual(
        decide(fold(TASK, inFlight(true)), done({ state: 'failed' }), now(5)),
        {
          do: 'record-end',
          attempt: 1,
          sessionId: 's0',
          observed: 'failed',
          reason: 'harness',
          nativeId: 'n1',
          closeout: undefined,
          closedOut: false,
        },
        "a harness's `failed` is its verdict, statement or not",
      );
      assert.deepEqual(
        decide(fold(TASK, inFlight(true)), done({ limit: 'budget' }), now(5)),
        {
          do: 'record-end',
          attempt: 1,
          sessionId: 's0',
          observed: 'succeeded',
          reason: 'harness',
          nativeId: 'n1',
          closeout: undefined,
          closedOut: false,
        },
        "a limit the harness names is no reason of the engine's",
      );
    },
  );

  await t.test(
    'an end with `closedOut: false` settles SUCCEEDED, a journal that allowed more attempts included: the engine neither nudges nor retries it',
    () => {
      for (const legacy of [false, true]) {
        const s = fold(TASK, [
          ...inFlight(true, legacy),
          {
            kind: 'ended',
            at: at(3),
            attempt: 1,
            sessionId: 's0',
            observed: 'succeeded',
            reason: 'harness',
            nativeId: 'n1',
            closedOut: false,
          },
        ]);
        assert.equal(s.attempts[0]?.closedOut, false);
        assert.deepEqual(
          decide(s, quiet(), now(9)),
          { do: 'settle', outcome: 'succeeded' },
          `legacy ${legacy}: quiet, and not stopped to be continued`,
        );
        assert.deepEqual(decide(s, seen(), now(9)), { do: 'settle', outcome: 'succeeded' }, `legacy ${legacy}`);
      }
    },
  );

  await t.test('quiet ends only a WORKING session: not a blocked one, and no session its runner has not called quiet', () => {
    assert.equal(
      decide(fold(TASK, inFlight(true)), quiet({ state: 'input-required' }), now(5)).do,
      'nothing',
      'blocked waits on a person, however quiet',
    );
    assert.equal(
      decide(fold(TASK, inFlight(true)), quiet({ quietMs: undefined }), now(5)).do,
      'nothing',
      'idle, but not quiet for long enough',
    );
  });
});

test('decide: the grace window a spawn the harness has not registered is given, on the monotonic clock within a boot and the wall clock across one', async (t) => {
  await t.test('a spawned session the harness has not registered yet is given a grace window', () => {
    const s = fold(TASK, [filed(), { kind: 'starting', at: at(1), attempt: 1 }, { kind: 'spawned', at: at(2), attempt: 1 }]);
    assert.equal(decide(s, seen(), now(1_000)).do, 'nothing');
    assert.deepEqual(decide(s, seen(), now(60_000)), {
      do: 'record-end',
      attempt: 1,
      sessionId: '(never seen)',
      observed: 'failed',
      reason: 'lost',
    });
  });

  await t.test('the grace window runs on the monotonic clock within a boot: a wall clock stepped forward ends no grace early', () => {
    const s = fold(TASK, spawnedIn('b-1'));
    assert.equal(decide(s, seen(), { ...now(60_000), mono: mono(5_000) }).do, 'nothing', 'five seconds in, whatever the wall clock says');
  });

  await t.test(
    'the grace window refused on the monotonic clock: past it in this boot, the spawn is lost however little the wall clock moved',
    () => {
      const s = fold(TASK, spawnedIn('b-1'));
      const decided = decide(s, seen(), { ...now(2), mono: mono(31_002) });
      assert.equal(decided.do === 'record-end' && decided.reason, 'lost');
    },
  );

  for (const boot of [undefined, 'b-0'])
    await t.test(`the grace window of a spawn stamped in ${boot ?? 'no boot'} runs on the wall clock`, () => {
      const decided = decide(fold(TASK, spawnedIn(boot)), seen(), { ...now(60_000), mono: mono(5_000) });
      assert.equal(decided.do === 'record-end' && decided.reason, 'lost', `spawned in ${boot ?? 'no boot'}`);
    });
});

test('decide: the deadline — on which clock, from when, what it stops, and the end it never overrules', async (t) => {
  await t.test(
    'the deadline runs on the monotonic clock within a boot: a wall clock stepped forward stops nothing before it is due',
    () => {
      const s = fold(TASK, [withDeadline(600), ...startedIn('b-1')]);
      assert.equal(decide(s, seen([N1, 'working']), { ...now(20 * 60_000), mono: mono(5 * 60_000) }).do, 'nothing', 'five minutes in');
    },
  );

  await t.test(
    'the deadline refused on the monotonic clock: past it in this boot, the session is stopped however little the wall clock moved',
    () => {
      const s = fold(TASK, [withDeadline(600), ...startedIn('b-1')]);
      assert.deepEqual(decide(s, seen([N1, 'working']), { ...now(1_000), mono: mono(12 * 60_000) }), {
        do: 'stop',
        sessionId: 's0',
        why: 'deadline',
      });
    },
  );

  await t.test('the deadline of an attempt started in another boot runs on the wall clock', () => {
    const s = fold(TASK, [withDeadline(600), ...startedIn('b-0')]);
    assert.deepEqual(decide(s, seen([N1, 'working']), { ...now(20 * 60_000), mono: mono(5 * 60_000) }), {
      do: 'stop',
      sessionId: 's0',
      why: 'deadline',
    });
  });

  await t.test('a live session past its deadline is stopped', () => {
    const s = fold(TASK, [withDeadline(10), ...started()]);
    assert.equal(decide(s, seen([N1, 'working']), now(5_000)).do, 'nothing', 'inside the deadline');
    assert.deepEqual(decide(s, seen([N1, 'working']), now(20_000)), { do: 'stop', sessionId: 's0', why: 'deadline' });
  });

  await t.test('a BLOCKED session past its deadline is stopped too — the only thing that ends its wait on a person', () => {
    const s = fold(TASK, [withDeadline(10), ...started()]);
    assert.equal(decide(s, seen([N1, 'input-required']), now(5_000)).do, 'nothing');
    assert.deepEqual(decide(s, seen([N1, 'input-required']), now(20_000)), { do: 'stop', sessionId: 's0', why: 'deadline' });
  });

  await t.test('once the session is gone, the deadline ends its attempt DEADLINE, then settles the task as failed', () => {
    const s = fold(TASK, [withDeadline(10), ...started()]);
    assert.deepEqual(decide(s, seen([N1, 'canceled']), now(20_000)), {
      do: 'record-end',
      attempt: 1,
      sessionId: 's0',
      observed: 'failed',
      reason: 'deadline',
      nativeId: undefined,
      closeout: undefined,
    });
    const ended = fold(TASK, [
      withDeadline(10),
      ...started([{ kind: 'ended', at: at(20_001), attempt: 1, sessionId: 's0', observed: 'failed', reason: 'deadline' }]),
    ]);
    const a = decide(ended, seen([N1, 'canceled']), now(20_002));
    assert.equal(a.do, 'settle');
    assert.equal(a.do === 'settle' && a.outcome, 'failed');
    assert.match(a.do === 'settle' ? (a.note ?? '') : '', /deadline exceeded/);
  });

  await t.test(
    'a session that ended DONE is judged by that end, even read past the deadline — the deadline stops, it never overrules',
    () => {
      const done = {
        kind: 'ended',
        at: at(20_001),
        attempt: 1,
        sessionId: 's0',
        observed: 'succeeded',
        reason: 'harness',
        exitCode: 0,
      } as const;
      const walked = decide(
        fold(TASK, [withDeadline(10), ...started()]),
        new Map([[N1, { sessionId: 's0', state: 'completed', exitCode: 0 }]]),
        now(20_000),
      );
      assert.equal(
        walked.do,
        'record-end',
        'a pass records the end, then steps the task until nothing moves: the next step reads that end past the deadline',
      );
      assert.deepEqual(
        walked.do === 'record-end' && [walked.observed, walked.reason],
        ['succeeded', 'harness'],
        'its harness ended it before the cut',
      );
      const ended = fold(TASK, [withDeadline(10), ...started([done])]);
      assert.deepEqual(decide(ended, seen(), now(20_001)), { do: 'settle', outcome: 'succeeded' }, 'in the same pass as its end');
      assert.deepEqual(decide(ended, seen([N1, 'completed']), now(20_001)), { do: 'settle', outcome: 'succeeded' });
      const stopped = fold(TASK, [withDeadline(10), ...started([{ ...done, observed: 'stopped', exitCode: undefined }])]);
      assert.deepEqual(
        decide(stopped, seen(), now(20_001)),
        { do: 'settle', outcome: 'stopped', note: 'session stopped' },
        'stopped by its harness, it settles stopped, as it would inside the deadline',
      );
    },
  );

  await t.test(
    "an attempt that FAILED past the deadline is judged by its end, and never followed by another: its harness ended it, so the deadline cut nothing, and the note is the end's",
    () => {
      const events: Event[] = [
        withDeadline(10),
        ...started([{ kind: 'ended', at: at(20_001), attempt: 1, sessionId: 's0', observed: 'failed', reason: 'harness', exitCode: 1 }]),
      ];
      for (const n of [now(20_001), now(5_000)]) {
        assert.deepEqual(
          decide(fold(TASK, events), seen(), n),
          { do: 'settle', outcome: 'failed', note: '1 attempt(s), none succeeded' },
          `${n.at.getTime() - T0.getTime()} ms: never start, never wait`,
        );
      }
    },
  );

  await t.test('the deadline runs from the first ATTEMPT, not from filing — a queued task burns nothing', () => {
    const s = fold(TASK, [withDeadline(10), ...started()]);
    assert.equal(
      decide(s, seen([N1, 'working']), now(10_500)).do,
      'nothing',
      'filed at 0 s and started at 1 s: at 10.5 s it has run 9.5 s, inside a 10 s deadline',
    );
  });

  await t.test('no deadline means no limit', () => {
    const s = fold(TASK, [filed(), ...started()]);
    assert.equal(decide(s, seen([N1, 'working']), now(999_999_999)).do, 'nothing');
  });
});

test('decide: a journal an older runtime wrote — its retired keys, the ends it judged by a reason of its own, its nudges, no `said` — folds and settles as it did', async (t) => {
  await t.test('an old journal that recorded a `done` end with no statement on a schema task folds, and settles, as it did', () => {
    const old = fold(TASK, [
      ...inFlight(true),
      { kind: 'ended', at: at(3), attempt: 1, sessionId: 's0', observed: 'succeeded', reason: 'harness', nativeId: 'n1' },
    ]);
    assert.deepEqual(
      old.attempts.map((a) => [a.ended, a.reason, a.closeout]),
      [['succeeded', 'harness', undefined]],
      '`fold` reads the end as recorded and never re-derives it',
    );
    assert.deepEqual(decide(old, seen(), now(9)), { do: 'settle', outcome: 'succeeded' });
  });

  await t.test(
    "an old end its engine judged by a reason of its own (`former`) settles failed and says why, a journal that allowed more attempts included — never continued, never nudged: the nudge is the orchestrator's",
    () => {
      for (const legacy of [false, true]) {
        const note = {
          do: 'settle',
          outcome: 'failed',
          note: '1 attempt(s), none succeeded: the last ended without the closing statement it was asked for',
        };
        assert.deepEqual(decide(fold(TASK, formerEnd(legacy)), seen(), now(9)), note, `legacy ${legacy}`);
        assert.deepEqual(decide(fold(TASK, formerEnd(legacy)), quiet(), now(9)), note, `legacy ${legacy}: still quiet`);
      }
    },
  );

  await t.test('a nudge is on the attempt it started, from the journal', () => {
    const s = fold(TASK, [...formerEnd(true), { kind: 'starting', at: at(4), attempt: 2, resumeFrom: 'n1', nudge: 'finish' }]);
    assert.deepEqual(
      s.attempts.map((a) => a.nudge),
      [undefined, 'finish'],
    );
    assert.equal('nudge' in s.attempts[0], false, 'and no key on one that had none');
  });

  await t.test(
    'a journal an older runtime wrote with `maxAttempts`, caught between two attempts, runs its second to its end: each has its own name, so the first cannot be mistaken for it',
    () => {
      const s = fold(TASK, [
        ...ran('failed', legacyFiled()),
        { kind: 'starting', at: at(4), attempt: 2 },
        { kind: 'spawned', at: at(5), attempt: 2 },
      ]);
      assert.notEqual(N1, N2);
      assert.equal(decide(s, seen([N1, 'failed'], [N2, 'working']), now(9)).do, 'nothing', 'its second attempt runs');
      assert.deepEqual(
        decide(
          s,
          new Map([
            [N1, { sessionId: 's0', state: 'failed' }],
            [N2, { sessionId: 's1', state: 'completed', nativeId: 'n2' }],
          ]),
          now(9),
        ),
        { do: 'record-end', attempt: 2, sessionId: 's1', observed: 'succeeded', reason: 'harness', nativeId: 'n2', closeout: undefined },
        'and is ended off its own sighting',
      );
    },
  );

  await t.test('an attempt in flight has no end time, and does not borrow the one before it', () => {
    const s = fold(TASK, [
      ...ran('failed', legacyFiled()),
      { kind: 'starting', at: at(4), attempt: 2 },
      { kind: 'spawned', at: at(5), attempt: 2 },
    ]);
    assert.deepEqual(
      s.attempts.map((a) => [a.ended, a.endedAt]),
      [
        ['failed', at(3)],
        [null, null],
      ],
    );
  });

  await t.test(
    'a journal an older runtime wrote, filed with attempts to spare and `resume: always`, settles on its first failed attempt all the same',
    () => {
      for (const reason of ['lost', 'unstartable', 'harness'] as const) {
        const s = fold(TASK, endedWith('failed', reason, legacyFiled()));
        assert.equal('maxAttempts' in s || 'resume' in s, false, `${reason}: the retired keys are folded unread`);
        assert.deepEqual(decide(s, seen(), now(9)), { do: 'settle', outcome: 'failed', note: noteOf(reason) }, reason);
      }
      assert.deepEqual(
        fold(TASK, [legacyFiled()]),
        fold(TASK, [keyless()]),
        'it folds to the state the same filing without them does, with no `queued` key either',
      );
    },
  );

  await t.test(
    '...a journal an older runtime wrote that said `resume: never` included: that is a retry policy, and this is what the work is',
    () => {
      assert.equal(
        decide(fold(TASK, [legacyFiled({ resume: 'never', resumeFrom: 'sess-1' })]), seen(), now()).do,
        'nothing',
        'with no `queued` key either, it waits to be admitted, and starts once it is',
      );
      const s = fold(TASK, [legacyFiled({ resume: 'never', resumeFrom: 'sess-1' }), admitted()]);
      assert.deepEqual(decide(s, seen(), now()), { do: 'start', attempt: 1, resumeFrom: 'sess-1' });
    },
  );

  await t.test(
    'a journal with no `said` in it — every journal written before `say` — folds to `said: []` and otherwise the same state',
    () => {
      const { said: none, ...legacy } = fold(TASK, ran('failed'));
      assert.deepEqual(none, []);
      const { said, ...rest } = fold(TASK, told(ran('failed')));
      assert.deepEqual(said, [{ at: at(1_500), attempt: 1, text: 'widen the scope to the api', after: null }]);
      assert.deepEqual(rest, legacy, 'nothing else on the state moved');
    },
  );
});

test('decide: words said to a session, and the wait its harness names, change no decision — and the fold keeps what was said', async (t) => {
  await t.test('a `said` event changes no decision: running, blocked, ended done, failed, past the deadline, lost', () => {
    const cases: Array<[string, Event[], Map<string, Sighting>, ReturnType<typeof now>]> = [
      ['running', [filed(), ...started()], seen([N1, 'working']), now(5_000)],
      ['blocked', [filed(), ...started()], seen([N1, 'input-required']), now(5_000)],
      ['ended done', ran('succeeded'), seen([N1, 'completed']), now(9)],
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

  await t.test(
    "`waitingFor` changes no decision: it is the harness's word for a person to read (Claude Code's `state.waiting.reason`, a word it may change), carried, and `decide` does not read it",
    () => {
      const cases: Array<[string, Event[], SessionState, ReturnType<typeof now>]> = [
        ['blocked', [filed(), ...started()], 'input-required', now(5_000)],
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
    },
  );

  await t.test('the fold keeps every `said` in order, each with the attempt it was said to', () => {
    const s = fold(TASK, [
      ...told(ran('failed', legacyFiled()), 'first'),
      { kind: 'starting', at: at(4), attempt: 2 },
      { kind: 'spawned', at: at(5), attempt: 2 },
      { kind: 'said', at: at(6), attempt: 2, text: 'second' },
    ]);
    assert.deepEqual(
      s.said.map((x) => [x.attempt, x.text]),
      [
        [1, 'first'],
        [2, 'second'],
      ],
    );
  });
});

test("CONTRACT: every attempt a task settles over is ended — with the statement its session gave, untouched, or the reason it has none — under every sighting, with and without a statement, a schema, a limit its harness names (which changes no decision), and a cut (a person's stop, or the deadline), walked to its settle", () => {
  const STATEMENT = { summary: "the agent's words" };
  const states = [
    undefined,
    'quiet',
    'submitted',
    'working',
    'input-required',
    'auth-required',
    'completed',
    'failed',
    'rejected',
    'canceled',
  ] as const;
  let walked = 0;
  for (const state of states)
    for (const schema of [false, true])
      for (const said of [false, true])
        for (const limit of [false, true])
          for (const cut of ['none', 'operator', 'deadline'] as const) {
            const at_ = `${state} schema=${schema} said=${said} limit=${limit} cut=${cut}`;
            const events: Event[] = [
              {
                kind: 'filed',
                at: at(0),
                brief: 'b',
                cwd: '/r',
                ...(schema ? { closeoutSchema: { type: 'object' } } : {}),
                ...(cut === 'deadline' ? { deadlineSeconds: 10 } : {}),
              },
              { kind: 'starting', at: at(1), attempt: 1 },
              { kind: 'spawned', at: at(2), attempt: 1 },
              ...(cut === 'operator' ? [{ kind: 'stop-requested', at: at(3) } as Event] : []),
            ];
            let sighting: Sighting | undefined =
              state === undefined
                ? undefined
                : {
                    sessionId: 's0',
                    nativeId: 'native-1',
                    state: state === 'quiet' ? 'working' : state,
                    ...(state === 'quiet' ? { quietMs: 60_000 } : {}),
                    ...(said ? { closeout: { payload: STATEMENT, at: T0.getTime() + 30_000 } } : {}),
                    ...(limit ? { limit: 'budget' } : {}),
                  };
            let settled: string | undefined;
            for (let step = 0; step < 6 && !settled; step++) {
              const a = decide(fold(TASK, events), new Map(sighting ? [[N1, sighting]] : []), now(60_000));
              const unlimited = sighting && (({ limit: _, ...rest }) => rest)(sighting);
              assert.deepEqual(
                a,
                decide(fold(TASK, events), new Map(unlimited ? [[N1, unlimited]] : []), now(60_000)),
                `${at_}: step ${step}`,
              );
              if (a.do === 'settle') settled = a.outcome;
              else if (a.do === 'stop') sighting = { ...sighting!, state: 'canceled' };
              else if (a.do === 'record-end')
                events.push({
                  kind: 'ended',
                  at: at(4 + step),
                  attempt: a.attempt,
                  sessionId: a.sessionId,
                  observed: a.observed,
                  reason: a.reason,
                  nativeId: a.nativeId,
                  closeout: a.closeout,
                  ...(a.closedOut !== undefined ? { closedOut: a.closedOut } : {}),
                });
              else break;
            }
            if (!settled) {
              assert.ok(
                cut === 'none' && ['submitted', 'working', 'input-required', 'auth-required'].includes(state!),
                `${at_}: only a live, uncut session stays unsettled`,
              );
              continue;
            }
            walked++;
            const [attempt] = fold(TASK, events).attempts;
            assert.notEqual(attempt.ended, null, `${at_}: settled over an open attempt — neither statement nor reason`);
            assert.equal(attempt.closeout, sighting?.closeout?.payload, `${at_}: the statement is the session's, untouched, or none`);
            if (state === 'completed' || state === 'failed' || state === 'rejected')
              assert.ok(
                !['operator', 'deadline'].includes(attempt.reason!),
                `${at_}: its harness ended it before the cut, and that end is recorded`,
              );
            if (attempt.ended === 'succeeded' && cut !== 'operator')
              assert.equal(settled, 'succeeded', `${at_}: ended done, and settled ${settled}`);
            if (!schema) assert.equal('closedOut' in attempt, false, `${at_}: nothing asked, nothing reported`);
            else if (attempt.reason === 'harness')
              assert.equal(attempt.closedOut, attempt.closeout !== undefined, `${at_}: closedOut is whether a statement came`);
          }
  assert.ok(walked > 100, `walked ${walked}`);
});

const N3 = nameFor(TASK, 3);
/**
 * A task held open whose first attempt signed at 3 s, `extra` on the filing: held open, a signed end waits on a person, an answer is a
 * turn, and a close settles.
 */
const held = (extra: Partial<Extract<Event, { kind: 'filed' }>> = {}): Event[] => [
  {
    kind: 'filed',
    at: at(0),
    brief: 'draft the plan',
    cwd: '/r',
    closeoutSchema: { type: 'object' },
    holdOpen: true,
    queued: false,
    ...extra,
  },
  { kind: 'starting', at: at(1_000), attempt: 1 },
  { kind: 'spawned', at: at(1_100), attempt: 1 },
  {
    kind: 'ended',
    at: at(3_000),
    attempt: 1,
    sessionId: 's0',
    observed: 'succeeded',
    reason: 'harness',
    nativeId: 'native-1',
    closeout: { plan: 'v1' },
  },
];
const answer = (ms: number, text = 'make it smaller', config?: HarnessArgs): Event => ({
  kind: 'input',
  at: at(ms),
  text,
  ...(config ? { config } : {}),
});
/** Turn 1's first attempt, started at `ms`, and its end if given. */
const turn1 = (
  ms: number,
  ended?: {
    observed: Outcome;
    reason?: 'harness' | 'lost';
    nativeId?: string;
    closedOut?: boolean;
    former?: 'unsigned';
    limit?: string;
  },
): Event[] => [
  { kind: 'starting', at: at(ms), attempt: 2, resumeFrom: 'native-1', nudge: 'make it smaller' },
  { kind: 'spawned', at: at(ms + 100), attempt: 2 },
  ...(ended
    ? [
        {
          kind: 'ended',
          at: at(ms + 2_000),
          attempt: 2,
          sessionId: 's1',
          observed: ended.observed,
          reason: ended.reason ?? 'harness',
          nativeId: ended.nativeId ?? 'native-1',
          ...(ended.closedOut !== undefined ? { closedOut: ended.closedOut } : {}),
          ...(ended.former ? { former: ended.former } : {}),
          ...(ended.limit ? { limit: ended.limit } : {}),
        } as Event,
      ]
    : []),
];
/** The same journal filed without `holdOpen`: the control every rule of a task held open is held beside. */
const notHeld = (events: Event[]): Event[] => events.map((e) => (e.kind === 'filed' ? (({ holdOpen: _, ...rest }) => rest)(e) : e));

test('HELD OPEN: a task held open signs and waits on a person, is answered into turns that continue its session, and is closed or stopped', async (t) => {
  const s = story(t);
  const journal: Event[] = held();

  await s.test(
    'HELD OPEN: a signed end waits as input-required, not settled — and past its deadline too, since the deadline times work, not a person reading it',
    () => {
      assert.deepEqual(decide(fold(TASK, journal), seen(), now(9_000)), { do: 'nothing', why: 'input-required' });
      assert.deepEqual(
        decide(fold(TASK, held({ deadlineSeconds: 10 })), seen(), now(3_600_000)),
        { do: 'nothing', why: 'input-required' },
        'an hour past a 10 s deadline',
      );
      const plain = notHeld(journal);
      assert.deepEqual(
        decide(fold(TASK, plain), seen(), now(9_000)),
        { do: 'settle', outcome: 'succeeded' },
        'the control: the same journal without `holdOpen` settles on the signed end',
      );
      assert.equal(fold(TASK, plain).holdOpen, undefined);
    },
  );

  await s.test('HELD OPEN: waitsForInput is the signed current turn of a task held open, and nothing else', () => {
    assert.equal(waitsForInput(fold(TASK, journal)), true);
    assert.equal(waitsForInput(fold(TASK, [...journal, answer(60_000)])), false, 'answered');
    assert.equal(waitsForInput(fold(TASK, [...journal, { kind: 'closed', at: at(9) }])), false, 'closed');
    assert.equal(waitsForInput(fold(TASK, [...journal, { kind: 'settled', at: at(9), outcome: 'stopped' }])), false, 'settled');
    assert.equal(waitsForInput(fold(TASK, journal.slice(0, 3))), false, 'in flight');
    assert.equal(waitsForInput(fold(TASK, notHeld(journal))), false, 'not held open');
    assert.equal(N3, 'ae/t-1/3');
  });

  await s.test(
    'HELD OPEN: an answer is a turn — an attempt continuing the session that signed, told the words instead of the brief',
    () => {
      journal.push(answer(60_000));
      assert.deepEqual(decide(fold(TASK, journal), seen(), now(61_000)), {
        do: 'start',
        attempt: 2,
        resumeFrom: 'native-1',
        nudge: 'make it smaller',
      });
      assert.deepEqual(
        decide(fold(TASK, [...held({ resume: 'never' } as object), answer(60_000)]), seen(), now(61_000)),
        {
          do: 'start',
          attempt: 2,
          resumeFrom: 'native-1',
          nudge: 'make it smaller',
        },
        'a journal an older runtime wrote with `resume: never` too: the answer continues a conversation, which no retry policy is a word about',
      );
      journal.push(...turn1(61_000));
      const t1 = fold(TASK, journal);
      assert.deepEqual(
        t1.attempts.map((a) => a.turn),
        [undefined, 1],
        "the turn's attempt carries its turn; the first does not",
      );
      assert.equal('turn' in t1.attempts[0], false);
      assert.deepEqual(decide(t1, seen([N2, 'working']), now(62_000)).do, 'nothing', 'running');
      const signed = fold(TASK, [...held(), answer(60_000), ...turn1(61_000, { observed: 'succeeded' })]);
      assert.deepEqual(decide(signed, seen(), now(70_000)), { do: 'nothing', why: 'input-required' }, 'it signs, and waits again');
    },
  );

  await s.test(
    "HELD OPEN: the turn follows the journal order — an answer journalled before a start is that attempt's turn, after it is the next",
    () => {
      const start2: Event[] = [
        { kind: 'starting', at: at(61_000), attempt: 2 },
        { kind: 'spawned', at: at(61_100), attempt: 2 },
      ];
      const before = fold(TASK, [...held(), answer(60_000), ...start2]);
      const after = fold(TASK, [...held(), ...start2, answer(62_000)]);
      assert.deepEqual(
        before.attempts.map((a) => a.turn ?? 0),
        [0, 1],
      );
      assert.deepEqual(
        after.attempts.map((a) => a.turn ?? 0),
        [0, 0],
      );
    },
  );

  await s.test(
    "HELD OPEN: two answers journalled before the turn started are both told, in order, and the last configuration given is the turn's own, which the engine lays over the filing's (`configForTurn`)",
    () => {
      const own = { config: { budgetUsd: 1 } };
      const two = fold(TASK, [...held(own), answer(60_000, 'first', { budgetUsd: 2 }), answer(60_500, 'second')]);
      assert.deepEqual(decide(two, seen(), now(61_000)), { do: 'start', attempt: 2, resumeFrom: 'native-1', nudge: 'first\n\nsecond' });
      assert.deepEqual(turnOf(two).config, { budgetUsd: 2 }, 'the configuration given with the words, whole');
      assert.equal(turnOf(fold(TASK, [...held(own), answer(60_000)])).config, undefined, 'none given: nothing of its own');
      assert.equal(turnOf(fold(TASK, held(own))).config, undefined, 'turn 0: nothing of its own');
      assert.equal(
        turnOf(fold(TASK, [...held(own), answer(60_000, 'w', { budgetUsd: 3 })]), 0).config,
        undefined,
        'an earlier turn keeps its own',
      );
    },
  );

  await s.test("HELD OPEN: the deadline runs from the current turn's first attempt, not the task's", () => {
    const timed = fold(TASK, [...held({ deadlineSeconds: 10 }), answer(3_600_000), ...turn1(3_601_000)]);
    assert.equal(decide(timed, seen([N2, 'working']), now(3_605_000)).do, 'nothing', 'four seconds into the turn, an hour into the task');
    assert.deepEqual(decide(timed, seen([N2, 'working']), now(3_612_000)), { do: 'stop', sessionId: 's0', why: 'deadline' });
    assert.equal(
      decide(fold(TASK, [...held({ deadlineSeconds: 10 }), answer(3_600_000)]), seen(), now(3_600_500)).do,
      'start',
      'an answer waiting for its turn is not past a deadline',
    );
  });

  await s.test(
    "HELD OPEN: a turn is one attempt — one that fails, is lost or cannot start settles the task failed, and trying again is the layer above's",
    () => {
      const settled = { do: 'settle', outcome: 'failed', note: '1 attempt(s) of turn 1, none succeeded' };
      const failed = fold(TASK, [...held(), answer(60_000), ...turn1(61_000, { observed: 'failed', nativeId: 'native-1' })]);
      assert.deepEqual(decide(failed, seen(), now(70_000)), settled, 'failed on its harness');
      const lost = fold(TASK, [...held(), answer(60_000), ...turn1(61_000, { observed: 'failed', reason: 'lost', nativeId: 'native-2' })]);
      assert.deepEqual(decide(lost, seen(), now(70_000)), settled, 'lost');
      const unstartable = fold(TASK, [
        ...held(),
        answer(60_000),
        { kind: 'starting', at: at(61_000), attempt: 2, resumeFrom: 'native-1', nudge: 'make it smaller' },
        {
          kind: 'ended',
          at: at(61_100),
          attempt: 2,
          sessionId: '(never started)',
          observed: 'failed',
          reason: 'unstartable',
          error: 'refused',
        },
      ]);
      assert.deepEqual(
        decide(unstartable, seen(), now(70_000)),
        { ...settled, note: `${settled.note}: the last could not start: refused; fix what it names and file the task again` },
        'unstartable, in its words and the fix',
      );
      const legacy = fold(TASK, [
        ...held({ maxAttempts: 3, resume: 'always' } as object),
        answer(60_000),
        ...turn1(61_000, { observed: 'failed', reason: 'lost', nativeId: 'native-2' }),
      ]);
      assert.deepEqual(decide(legacy, seen(), now(70_000)), settled, 'legacy');
      const unsaid = fold(TASK, [
        ...held(),
        answer(60_000),
        ...turn1(61_000, { observed: 'succeeded', nativeId: 'native-2', closedOut: false }),
      ]);
      assert.deepEqual(
        decide(unsaid, seen(), now(70_000)),
        { do: 'nothing', why: 'input-required' },
        'a turn ended `succeeded` with no statement waits as any other',
      );
      const formerTurn = fold(TASK, [
        ...held(),
        answer(60_000),
        ...turn1(61_000, { observed: 'failed', closedOut: false, former: 'unsigned', nativeId: 'native-2' }),
      ]);
      assert.deepEqual(
        decide(formerTurn, seen(), now(70_000)),
        {
          do: 'settle',
          outcome: 'failed',
          note: '1 attempt(s) of turn 1, none succeeded: the last ended without the closing statement it was asked for',
        },
        'an older end its engine judged by a reason of its own settles failed, as a task not held open does',
      );
      const twice = fold(TASK, [
        ...held(),
        answer(60_000),
        ...turn1(61_000, { observed: 'failed' }),
        { kind: 'starting', at: at(70_000), attempt: 3 },
        { kind: 'spawned', at: at(70_100), attempt: 3 },
        { kind: 'ended', at: at(72_000), attempt: 3, sessionId: 's2', observed: 'failed', reason: 'harness', nativeId: 'native-1' },
      ]);
      assert.deepEqual(
        decide(twice, seen(), now(73_000)),
        { do: 'settle', outcome: 'failed', note: '2 attempt(s) of turn 1, none succeeded' },
        'a journal caught with two attempts in a turn counts both',
      );
      const capped = fold(TASK, [
        ...held(),
        answer(60_000, 'w', { budgetUsd: 0.5 }),
        ...turn1(61_000, { observed: 'failed', limit: 'budget' }),
      ]);
      assert.deepEqual(decide(capped, seen(), now(70_000)), settled, 'at its cap');
      assert.equal(
        capped.attempts.at(-1)!.limit,
        'budget',
        'a turn its harness ended at its cap settles as any failed turn: the limit is on the attempt, for the layer above',
      );
    },
  );

  await s.test(
    'HELD OPEN: a later turn continues only the session that signed the turn before — none recorded, it settles failed rather than start cold',
    () => {
      const unrecorded = (extra: Partial<Extract<Event, { kind: 'filed' }>> = {}) =>
        held(extra).map((e) => (e.kind === 'ended' ? (({ nativeId: _, ...rest }) => rest)(e) : e)) as Event[];
      assert.deepEqual(
        decide(fold(TASK, unrecorded()), seen(), now(9_000)),
        { do: 'nothing', why: 'input-required' },
        'it signed: it waits, and a close settles it',
      );
      const settled = {
        do: 'settle',
        outcome: 'failed',
        note: 'turn 1 has no session to continue: its harness recorded none for the attempt that ended',
      };
      assert.deepEqual(decide(fold(TASK, [...unrecorded(), answer(60_000)]), seen(), now(61_000)), settled);
      assert.deepEqual(
        decide(fold(TASK, [...unrecorded({ resumeFrom: 'before-the-task' }), answer(60_000)]), seen(), now(61_000)),
        settled,
        'not the session the task was filed against, which never heard the plan',
      );
      const failedFirst: Event[] = [
        held()[0],
        { kind: 'starting', at: at(500), attempt: 1 },
        { kind: 'ended', at: at(900), attempt: 1, sessionId: 's0', observed: 'failed', reason: 'harness', nativeId: 'failed-one' },
        ...(unrecorded()
          .slice(1)
          .map((e) => ('attempt' in e ? { ...e, attempt: 2 } : e)) as Event[]),
        answer(60_000),
      ];
      assert.deepEqual(decide(fold(TASK, failedFirst), seen(), now(61_000)), settled, 'nor an earlier attempt that failed');
      assert.equal(
        turnOf(fold(TASK, [...unrecorded({ resumeFrom: 'before-the-task' })])).continues,
        'before-the-task',
        'turn 0 continues what it was filed against',
      );
    },
  );

  await s.test(
    'HELD OPEN: a close settles it — succeeded on a signed turn, failed after one that did not sign, and never over an attempt in flight',
    () => {
      const closed: Event = { kind: 'closed', at: at(90_000) };
      assert.deepEqual(decide(fold(TASK, [...held(), closed]), seen(), now(91_000)), {
        do: 'settle',
        outcome: 'succeeded',
        note: 'closed',
      });
      assert.deepEqual(
        decide(fold(TASK, [...held({ deadlineSeconds: 10 }), closed]), seen(), now(3_600_000)),
        { do: 'settle', outcome: 'succeeded', note: 'closed' },
        'past the deadline: the close, not the deadline',
      );
      assert.equal(
        decide(fold(TASK, [...journal, closed]), seen([N2, 'working']), now(91_000)).do,
        'nothing',
        'a close that raced an answer',
      );
      assert.deepEqual(
        decide(fold(TASK, [...held(), answer(60_000), ...turn1(61_000, { observed: 'failed' }), closed]), seen(), now(91_000)),
        { do: 'settle', outcome: 'failed', note: 'closed: attempt 2 ended failed' },
        'closed: said as closed',
      );
      assert.deepEqual(
        decide(fold(TASK, [...held(), answer(60_000), ...turn1(61_000, { observed: 'succeeded' }), closed]), seen(), now(91_000)),
        {
          do: 'settle',
          outcome: 'succeeded',
          note: 'closed',
        },
      );
      assert.deepEqual(
        decide(fold(TASK, [...notHeld(held()).slice(0, 3), closed]), seen([N1, 'working']), now(91_000)).do,
        'nothing',
        'the control: `closed` on a task not held open is no word decide reads',
      );
    },
  );

  await s.test('HELD OPEN: a stop outranks the wait — a task waiting settles stopped, and one mid-turn stops its session first', () => {
    const stop: Event = { kind: 'stop-requested', at: at(90_000) };
    assert.deepEqual(decide(fold(TASK, [...held(), stop]), seen(), now(91_000)), { do: 'settle', outcome: 'stopped', note: 'operator' });
    assert.deepEqual(decide(fold(TASK, [...journal, stop]), seen([N2, 'working']), now(91_000)), {
      do: 'stop',
      sessionId: 's0',
      why: 'operator',
    });
  });
});

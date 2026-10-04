/**
 * A long-lived task, `restartPolicy: 'Always'`: its session stays open between turns, and only a stop from outside ends it.
 * Each rule is held beside its control, the same journal filed as a job, which the same sighting ends or hands to a person.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  backoffOf,
  decide,
  fold,
  nameFor,
  needsHuman,
  observe,
  RESPAWN_GAP_MS,
  RESTART_BACKOFF,
  RESTART_WORDS,
  sightingFacts,
  type Event,
  type Sighting,
} from './domain.ts';
import { viewOfState } from './engine/engine.ts';
import { TRANSIENT_ERRNOS } from '../harness/error.ts';

const T0 = new Date('2026-01-01T00:00:00Z');
const at = (ms: number) => new Date(T0.getTime() + ms).toISOString();
const now = (ms: number) => ({ at: new Date(T0.getTime() + ms), graceMs: 30_000 });
const TASK = 't-1';
const N1 = nameFor(TASK, 1);
const HOUR = 3_600_000;

const filed = (longLived: boolean): Event => ({
  kind: 'filed',
  at: at(0),
  brief: 'b',
  cwd: '/r',
  queued: false,
  ...(longLived ? { restartPolicy: 'Always' as const } : {}),
});
const inFlight = (longLived: boolean): Event[] => [
  filed(longLived),
  { kind: 'starting', at: at(1), attempt: 1 },
  { kind: 'spawned', at: at(2), attempt: 1 },
];
const seen = (s: Omit<Sighting, 'sessionId'>) => new Map([[N1, { sessionId: 's1', ...s }]]);

/** The sightings of a session open between turns: a held process doing nothing, which a job would end or hand to a person. */
const IDLE: Record<string, Omit<Sighting, 'sessionId'>> = {
  'listed waiting on nothing': { state: 'input-required', busy: false, held: true },
  'listed done, its process still held': { state: 'completed', busy: false, held: true, nativeId: 'native-1' },
  'quiet for 90 s': { state: 'working', busy: false, held: true, quietMs: 90_000 },
};

test('LONG-LIVED: a session open between turns is idle, and left alone an hour on, where the same sighting ends a job or waits on a person', () => {
  const control: Record<string, string> = {
    'listed waiting on nothing': 'SESSION_BLOCKED',
    'listed done, its process still held': 'SESSION_ENDED',
    'quiet for 90 s': 'SESSION_QUIET',
  };
  for (const [name, sighting] of Object.entries(IDLE)) {
    const state = fold(TASK, inFlight(true));
    assert.equal(observe(state, seen(sighting), now(HOUR)).type, 'SESSION_IDLE', name);
    assert.equal(decide(state, seen(sighting), now(HOUR)).do, 'nothing', name);
    assert.equal(needsHuman(state, seen(sighting)), false, `${name}: nobody is asked anything`);
    assert.equal(viewOfState(state, seen(sighting)).phase, 'idle', name);

    const job = fold(TASK, inFlight(false));
    assert.equal(observe(job, seen(sighting), now(HOUR)).type, control[name], `${name}, as a job`);
    assert.notEqual(viewOfState(job, seen(sighting)).phase, 'idle', `${name}, as a job`);
  }
  assert.equal(decide(fold(TASK, inFlight(false)), seen(IDLE['listed done, its process still held']), now(HOUR)).do, 'record-end');
});

test('LONG-LIVED: idle only while its process is held and at rest — a wait on a person, a busy turn and a session gone are what they are for a job', () => {
  const state = fold(TASK, inFlight(true));
  const cases: [string, Omit<Sighting, 'sessionId'>, string][] = [
    [
      'waiting on a permission prompt',
      { state: 'input-required', busy: false, held: true, waitingFor: 'permission prompt' },
      'SESSION_BLOCKED',
    ],
    ['at work on a turn', { state: 'working', busy: true, held: true }, 'SESSION_LIVE'],
    ['quiet, but busy', { state: 'working', busy: true, held: true, quietMs: 90_000 }, 'SESSION_QUIET'],
    ['listed done with no process', { state: 'completed', busy: false, held: false }, 'SESSION_ENDED'],
    ['listed waiting with no process: a respawn', { state: 'input-required', busy: false, held: false }, 'SESSION_RESPAWNING'],
    ['listed done, held unknown', { state: 'completed', busy: false }, 'SESSION_ENDED'],
    ['stopped, no process', { state: 'canceled', busy: false, held: false }, 'SESSION_STOPPED'],
  ];
  for (const [name, sighting, event] of cases) assert.equal(observe(state, seen(sighting), now(HOUR)).type, event, name);
  assert.equal(needsHuman(state, seen(cases[0][1])), true, 'a prompt is still for a person');
});

test('LONG-LIVED: only a stop ends it — asked of an idle session, it stops it, records the end OPERATOR, and settles stopped', () => {
  const asked: Event[] = [...inFlight(true), { kind: 'stop-requested', at: at(HOUR) }];
  for (const [name, sighting] of Object.entries(IDLE))
    assert.deepEqual(decide(fold(TASK, asked), seen(sighting), now(HOUR + 1)), { do: 'stop', sessionId: 's1', why: 'operator' }, name);
  const end = decide(fold(TASK, asked), seen({ state: 'canceled', held: false }), now(HOUR + 2));
  assert.equal(end.do === 'record-end' && `${end.observed} ${end.reason}`, 'stopped operator');
  const ended = fold(TASK, [
    ...asked,
    { kind: 'ended', at: at(HOUR + 3), attempt: 1, sessionId: 's1', observed: 'stopped', reason: 'operator' },
  ]);
  assert.deepEqual(decide(ended, seen({ state: 'canceled', held: false }), now(HOUR + 4)), {
    do: 'settle',
    outcome: 'stopped',
    note: 'operator',
  });
});

test('LONG-LIVED: the filing is read back off the journal, and a journal with no `restartPolicy` folds to a job', () => {
  assert.equal(fold(TASK, [filed(true)]).restartPolicy, 'Always');
  assert.equal(fold(TASK, [filed(false)]).restartPolicy, undefined);
});

const GAP = 10_000;
/** A session held under pid 100, then seen with no process from `GAP` on: a gap Claude Code's own respawn closes, or not. */
const inGap = (longLived: boolean): Event[] => [
  ...inFlight(longLived),
  { kind: 'process', at: at(3), attempt: 1, pid: 100 },
  { kind: 'gap', at: at(GAP), attempt: 1 },
];
/** Claude Code's listing of a session it is respawning: blocked, no pid. */
const RESPAWNING: Omit<Sighting, 'sessionId'> = { state: 'input-required', busy: false, held: false, nativeId: 'native-1' };

test('LONG-LIVED: a gap no respawn closes is waited out for 120 s, nobody asked, then its attempt is ended lost — where a job listed the same waits on a person', () => {
  assert.equal(RESPAWN_GAP_MS, 120_000, 'the shipped bound');
  const state = fold(TASK, inGap(true));
  const before = now(GAP + RESPAWN_GAP_MS - 1);
  assert.equal(observe(state, seen(RESPAWNING), before).type, 'SESSION_RESPAWNING');
  assert.equal(decide(state, seen(RESPAWNING), before).do, 'nothing');
  assert.equal(needsHuman(state, seen(RESPAWNING)), false, 'Claude Code is restarting it, nobody is asked');
  assert.equal(viewOfState(state, seen(RESPAWNING)).phase, 'restarting');
  assert.equal(observe(state, seen(RESPAWNING), now(GAP + RESPAWN_GAP_MS)).type, 'RESPAWN_OVERDUE');
  assert.deepEqual(decide(state, seen(RESPAWNING), now(GAP + RESPAWN_GAP_MS)), {
    do: 'record-end',
    attempt: 1,
    sessionId: 's1',
    observed: 'failed',
    reason: 'lost',
    nativeId: 'native-1',
  });

  const job = fold(TASK, inGap(false));
  assert.equal(observe(job, seen(RESPAWNING), now(GAP + HOUR)).type, 'SESSION_BLOCKED', 'a job is unchanged');
  assert.equal(needsHuman(job, seen(RESPAWNING)), true);
});

test('LONG-LIVED: a gap a respawn closed is over — the session is open again an age later, its attempt never ended', () => {
  const events: Event[] = [...inGap(true), { kind: 'process', at: at(GAP + 11_000), attempt: 1, pid: 200 }];
  const state = fold(TASK, events);
  assert.equal(state.attempts[0].gapSince, undefined, 'the respawn closes the gap');
  assert.deepEqual(state.attempts[0].processes, [100, 200]);
  const back = seen({ state: 'input-required', busy: false, held: true, pid: 200 });
  assert.equal(observe(state, back, now(GAP + 300_000)).type, 'SESSION_IDLE');
  assert.equal(decide(state, back, now(GAP + 300_000)).do, 'nothing');
  assert.equal(viewOfState(state, back).phase, 'idle');
});

const END = 200_000;
const lostEnd: Event = {
  kind: 'ended',
  at: at(END),
  attempt: 1,
  sessionId: 's1',
  observed: 'failed',
  reason: 'lost',
  nativeId: 'native-1',
};

test('LONG-LIVED: an attempt ended lost is restarted after the backoff, its old job stopped first while listed, resumed and told RESTART_WORDS', () => {
  const state = fold(TASK, [...inGap(true), lostEnd]);
  assert.deepEqual(decide(state, seen(RESPAWNING), now(END + 1)), { do: 'stop', sessionId: 's1', why: 'to restart it' });
  assert.deepEqual(
    decide(state, seen({ state: 'completed', busy: false, held: true, nativeId: 'native-1' }), now(END + HOUR)),
    { do: 'stop', sessionId: 's1', why: 'to restart it' },
    'a session listed done whose process its harness still holds is stopped first too',
  );
  assert.equal(observe(state, new Map(), now(END + RESTART_BACKOFF.initialMs - 1)).type, 'BACKING_OFF');
  assert.equal(decide(state, new Map(), now(END + RESTART_BACKOFF.initialMs - 1)).do, 'nothing');
  assert.equal(viewOfState(state, new Map()).phase, 'between attempts');
  assert.deepEqual(decide(state, new Map(), now(END + RESTART_BACKOFF.initialMs)), {
    do: 'start',
    attempt: 2,
    resumeFrom: 'native-1',
    nudge: RESTART_WORDS,
  });
  assert.equal(
    decide(state, new Map(), { ...now(END + HOUR), unread: new Set([N1]) }).do,
    'nothing',
    'an old job its harness could not read may still run: no restart beside it',
  );
});

test('LONG-LIVED: a harness-side stop, or any end no stop asked for, is restarted after the backoff — where a job settles on its end', () => {
  const ends: [string, Event][] = [
    [
      'stopped at its harness',
      { kind: 'ended', at: at(END), attempt: 1, sessionId: 's1', observed: 'stopped', reason: 'harness', nativeId: 'n1' },
    ],
    ['done', { kind: 'ended', at: at(END), attempt: 1, sessionId: 's1', observed: 'done', reason: 'harness', nativeId: 'n1' }],
    ['failed', { kind: 'ended', at: at(END), attempt: 1, sessionId: 's1', observed: 'failed', reason: 'harness', nativeId: 'n1' }],
  ];
  const job: Record<string, string> = { 'stopped at its harness': 'stopped', done: 'succeeded', failed: 'failed' };
  for (const [name, end] of ends) {
    const state = fold(TASK, [...inFlight(true), end]);
    assert.equal(decide(state, new Map(), now(END + 9_999)).do, 'nothing', name);
    assert.deepEqual(
      decide(state, new Map(), now(END + 10_000)),
      { do: 'start', attempt: 2, resumeFrom: 'n1', nudge: RESTART_WORDS },
      name,
    );
    const a = decide(fold(TASK, [...inFlight(false), end]), new Map(), now(END + 10_000));
    assert.equal(a.do === 'settle' && a.outcome, job[name], `${name}, as a job`);
  }
});

const REFUSAL = "claude --bg: error: option '--permission-mode <mode>' argument 'yolo' is invalid.";
/** Attempt `n`'s spawn its harness refused at `END`: nothing started, in the harness's words. */
const refusedEnd = (n: number): Event => ({
  kind: 'ended',
  at: at(END),
  attempt: n,
  sessionId: '(never started)',
  observed: 'failed',
  reason: 'unstartable',
  error: REFUSAL,
});

test("LONG-LIVED: a spawn its harness refused is not restarted — the task settles failed in the refusal's words and the fix, where a death is restarted after the backoff", () => {
  const death: Event = {
    kind: 'ended',
    at: at(END - 50_000),
    attempt: 1,
    sessionId: 's1',
    observed: 'failed',
    reason: 'harness',
    nativeId: 'n1',
  };
  const refusals: [string, Event[], string][] = [
    ['on its first attempt', [...inFlight(true).slice(0, 2), refusedEnd(1)], '1 attempt(s)'],
    [
      "on a restart's attempt after a death",
      [...inFlight(true), death, { kind: 'starting', at: at(END - 40_000), attempt: 2 }, refusedEnd(2)],
      '2 attempt(s)',
    ],
  ];
  for (const [name, events, count] of refusals) {
    const state = fold(TASK, events);
    for (const later of [1, 10_000, HOUR]) {
      assert.equal(observe(state, new Map(), now(END + later)).type, 'ATTEMPT_ENDED', `${name}, ${later} ms on`);
      assert.deepEqual(
        decide(state, new Map(), now(END + later)),
        {
          do: 'settle',
          outcome: 'failed',
          note: `${count}, none succeeded: the last could not start: ${REFUSAL}; fix what it names and file the task again`,
        },
        `${name}, ${later} ms on`,
      );
    }
  }

  const died = fold(TASK, [...inFlight(true), { ...death, at: at(END) }]);
  assert.equal(observe(died, new Map(), now(END + 9_999)).type, 'BACKING_OFF', 'the control: a death waits out the backoff');
  assert.deepEqual(decide(died, new Map(), now(END + 10_000)), { do: 'start', attempt: 2, resumeFrom: 'n1', nudge: RESTART_WORDS });
});

/** A spawn that failed on the short-lived OS error `code`, recorded as spawned with its words, and nothing seen since. */
const spawnedWith = (code: string): Event[] => [
  { kind: 'starting', at: at(1), attempt: 1 },
  { kind: 'spawned', at: at(2), attempt: 1, error: `claude --bg: spawn claude ${code}` },
];
const neverSeen: Event = { kind: 'ended', at: at(END), attempt: 1, sessionId: '(never seen)', observed: 'failed', reason: 'lost' };

test('LONG-LIVED: a spawn that failed on a short-lived OS error is restarted after the backoff — where a job settles lost, its spawn words not in its note', () => {
  for (const code of TRANSIENT_ERRNOS) {
    const inGrace = fold(TASK, [filed(true), ...spawnedWith(code)]);
    assert.equal(observe(inGrace, new Map(), now(29_999)).type, 'UNSEEN_IN_GRACE', code);
    assert.deepEqual(
      decide(inGrace, new Map(), now(END)),
      { do: 'record-end', attempt: 1, sessionId: '(never seen)', observed: 'failed', reason: 'lost' },
      code,
    );
    const lost = fold(TASK, [filed(true), ...spawnedWith(code), neverSeen]);
    assert.equal(observe(lost, new Map(), now(END + 9_999)).type, 'BACKING_OFF', code);
    assert.deepEqual(decide(lost, new Map(), now(END + 10_000)), { do: 'start', attempt: 2 }, code);
    assert.deepEqual(
      decide(fold(TASK, [filed(false), ...spawnedWith(code), neverSeen]), new Map(), now(END + 10_000)),
      { do: 'settle', outcome: 'failed', note: '1 attempt(s), none succeeded' },
      `${code}, as a job`,
    );
  }
});

test("LONG-LIVED: the runtime's own stop ends it, and nothing restarts it however long after", () => {
  const stopped: Event[] = [
    ...inFlight(true),
    { kind: 'stop-requested', at: at(HOUR) },
    { kind: 'ended', at: at(HOUR + 1), attempt: 1, sessionId: 's1', observed: 'stopped', reason: 'operator', nativeId: 'n1' },
  ];
  for (const later of [10_000, HOUR, 24 * HOUR])
    assert.deepEqual(decide(fold(TASK, stopped), new Map(), now(HOUR + later)), { do: 'settle', outcome: 'stopped', note: 'operator' });
  const gapThenStop: Event[] = [...inGap(true), { kind: 'stop-requested', at: at(GAP + 1) }];
  assert.deepEqual(
    decide(fold(TASK, gapThenStop), seen(RESPAWNING), now(GAP + HOUR)),
    { do: 'stop', sessionId: 's1', why: 'operator' },
    'a stop asked during a gap stops it, and is never read as a respawn',
  );
});

test('LONG-LIVED: a cold restart — no session recorded on any attempt — is told the brief, continuing what the task was filed against', () => {
  const cold: Event = { kind: 'ended', at: at(END), attempt: 1, sessionId: '(never seen)', observed: 'failed', reason: 'lost' };
  assert.deepEqual(decide(fold(TASK, [...inFlight(true), cold]), new Map(), now(END + 10_000)), { do: 'start', attempt: 2 });
  const against: Event[] = [{ ...filed(true), resumeFrom: 'native-0' } as Event, ...inFlight(true).slice(1), cold];
  assert.deepEqual(decide(fold(TASK, against), new Map(), now(END + 10_000)), { do: 'start', attempt: 2, resumeFrom: 'native-0' });
});

/** `k` attempts in a row, each ended `ran` ms after it started, the last ending at `END`. */
const endedRuns = (...ran: number[]): Event[] => {
  const events: Event[] = [filed(true)];
  let t = END - ran.reduce((sum, r) => sum + r + 1_000, 0);
  ran.forEach((r, i) => {
    t += 1_000;
    events.push({ kind: 'starting', at: at(t), attempt: i + 1 }, { kind: 'spawned', at: at(t), attempt: i + 1 });
    t += r;
    events.push({
      kind: 'ended',
      at: at(t),
      attempt: i + 1,
      sessionId: `s${i + 1}`,
      observed: 'failed',
      reason: 'harness',
      nativeId: `n${i + 1}`,
    });
  });
  return events;
};

test("LONG-LIVED: the backoff is a kubelet's — 10 s, doubled for each end in a row, capped at 300 s, and counted again after a run of 10 min", () => {
  assert.deepEqual(RESTART_BACKOFF, { initialMs: 10_000, factor: 2, maxMs: 300_000, resetAfterMs: 600_000 }, 'the shipped numbers');
  const short = 5_000;
  const cases: [string, number[], number][] = [
    ['one end', [short], 10_000],
    ['two in a row', [short, short], 20_000],
    ['five in a row', Array(5).fill(short), 160_000],
    ['six in a row, capped', Array(6).fill(short), 300_000],
    ['nine in a row, capped', Array(9).fill(short), 300_000],
    ['three, the last after 599 s: no reset', [short, short, 599_000], 40_000],
    ['three, the last after 600 s: reset', [short, short, 600_000], 10_000],
    ['a run of 600 s, then two short ones', [600_000, short, short], 20_000],
  ];
  for (const [name, ran, ms] of cases) {
    const state = fold(TASK, endedRuns(...ran));
    assert.equal(backoffOf(state.attempts), ms, name);
    assert.equal(decide(state, new Map(), now(END + ms - 1)).do, 'nothing', `${name}: backing off`);
    assert.equal(decide(state, new Map(), now(END + ms)).do, 'start', `${name}: due`);
  }
});

/** A moment `ms` into the boot `boot` on the monotonic clock. */
const mono = (ms: number, boot = 'b-1') => ({ boot, ms });
/** Now at `wallMs` on the wall clock and `monoMs` on the monotonic clock of `boot`. */
const nowOn = (wallMs: number, monoMs: number, boot = 'b-1') => ({ ...now(wallMs), mono: mono(monoMs, boot) });
/** Two attempts that ended on their own: the first ran `firstWall` on the wall clock and `firstMono` on the monotonic one. */
const twoRuns = (firstWall: number, firstMono: number): Event[] => {
  const ran = (n: number, wall: number, ms: number, wallEnd: number, msEnd: number): Event[] => [
    { kind: 'starting', at: at(wall), attempt: n, mono: mono(ms) },
    { kind: 'spawned', at: at(wall), attempt: n, mono: mono(ms) },
    { kind: 'ended', at: at(wallEnd), attempt: n, sessionId: `s${n}`, observed: 'failed', reason: 'harness', mono: mono(msEnd) },
  ];
  return [
    filed(true),
    ...ran(1, 0, 0, firstWall, firstMono),
    ...ran(2, firstWall + 1_000, firstMono + 1_000, firstWall + 6_000, firstMono + 6_000),
  ];
};

test('LONG-LIVED: a gap runs on the monotonic clock within a boot — a wall clock stepped forward ends none early, nor one stepped back holds it past its bound — and on the wall clock across one', () => {
  const opened = [...inFlight(true), { kind: 'process', at: at(3), attempt: 1, pid: 100 } as Event];
  assert.deepEqual(
    sightingFacts(fold(TASK, opened), seen(RESPAWNING).get(N1), at(GAP), mono(GAP)),
    [{ kind: 'gap', at: at(GAP), attempt: 1, mono: mono(GAP) }],
    'the gap is journalled on both clocks',
  );
  const state = fold(TASK, [...opened, { kind: 'gap', at: at(GAP), attempt: 1, mono: mono(GAP) }]);
  const type = (n: ReturnType<typeof nowOn>) => observe(state, seen(RESPAWNING), n).type;
  assert.equal(type(nowOn(GAP + HOUR, GAP + RESPAWN_GAP_MS - 1)), 'SESSION_RESPAWNING', 'the wall clock an hour on');
  assert.equal(type(nowOn(GAP, GAP + RESPAWN_GAP_MS)), 'RESPAWN_OVERDUE', 'past its bound in this boot, the wall clock unmoved');
  assert.equal(type(nowOn(GAP + RESPAWN_GAP_MS, 0, 'b-2')), 'RESPAWN_OVERDUE', 'another boot: the wall clock');
  assert.equal(type(nowOn(GAP + RESPAWN_GAP_MS - 1, HOUR, 'b-2')), 'SESSION_RESPAWNING', 'another boot: the wall clock');
});

test('LONG-LIVED: the backoff runs on the monotonic clock within a boot — a wall clock stepped forward restarts nothing early, nor one stepped back holds a restart due — and on the wall clock across one', () => {
  const state = fold(TASK, [
    filed(true),
    { kind: 'starting', at: at(1), attempt: 1, mono: mono(1) },
    { kind: 'spawned', at: at(2), attempt: 1, mono: mono(2) },
    { ...lostEnd, mono: mono(END) },
  ]);
  const due = RESTART_BACKOFF.initialMs;
  assert.equal(decide(state, new Map(), nowOn(END + HOUR, END + due - 1)).do, 'nothing', 'the wall clock an hour on');
  assert.equal(decide(state, new Map(), nowOn(END, END + due)).do, 'start', 'due in this boot, the wall clock unmoved');
  assert.equal(decide(state, new Map(), nowOn(END + due, 0, 'b-2')).do, 'start', 'another boot: the wall clock');
  assert.equal(decide(state, new Map(), nowOn(END + due - 1, HOUR, 'b-2')).do, 'nothing', 'another boot: the wall clock');
});

test("LONG-LIVED: the backoff's reset after a run of 10 min is measured on the monotonic clock of the run's boot, whatever the wall clock stepped while it ran", () => {
  const { resetAfterMs, initialMs, factor } = RESTART_BACKOFF;
  assert.equal(
    backoffOf(fold(TASK, twoRuns(5_000, resetAfterMs)).attempts),
    initialMs,
    'a run of 10 min the wall clock read as 5 s resets',
  );
  assert.equal(
    backoffOf(fold(TASK, twoRuns(resetAfterMs, 5_000)).attempts),
    initialMs * factor,
    'a run of 5 s the wall clock read as 10 min does not',
  );
});

test('LONG-LIVED: what a sighting journals — the first gap once, a process at each new pid or the end of a gap — and nothing for a job, an ended attempt or a session not seen', () => {
  const held = (pid: number): Sighting => ({ sessionId: 's1', state: 'input-required', busy: false, held: true, pid });
  const gone: Sighting = { sessionId: 's1', ...RESPAWNING };
  const T = at(HOUR);
  const open = fold(TASK, inFlight(true));
  const holding = fold(TASK, [...inFlight(true), { kind: 'process', at: at(3), attempt: 1, pid: 100 }]);
  const gapped = fold(TASK, inGap(true));
  assert.deepEqual(sightingFacts(open, held(100), T), [{ kind: 'process', at: T, attempt: 1, pid: 100 }], 'its first process');
  assert.deepEqual(sightingFacts(holding, held(100), T), [], 'the same pid, no gap: nothing new');
  assert.deepEqual(sightingFacts(holding, held(200), T), [{ kind: 'process', at: T, attempt: 1, pid: 200 }], 'a new pid with no gap seen');
  assert.deepEqual(sightingFacts(holding, gone, T), [{ kind: 'gap', at: T, attempt: 1 }], 'the first sighting of no process');
  assert.deepEqual(sightingFacts(gapped, gone, T), [], 'a gap already open is not opened twice');
  assert.deepEqual(
    sightingFacts(gapped, held(100), T),
    [{ kind: 'process', at: T, attempt: 1, pid: 100 }],
    'a held process closes a gap, its pid the same',
  );
  assert.deepEqual(sightingFacts(holding, { ...gone, state: 'canceled' }, T), [], 'a stopped listing is an end, not a gap');
  assert.deepEqual(sightingFacts(holding, { ...gone, held: undefined }, T), [], 'a harness that cannot say is no gap');
  assert.deepEqual(sightingFacts(holding, undefined, T), [], 'a session not seen, or not read this pass');
  assert.deepEqual(sightingFacts(fold(TASK, inFlight(false)), held(100), T), [], 'a job held with a process');
  assert.deepEqual(sightingFacts(fold(TASK, inFlight(false)), gone, T), [], 'a job listed with none');
  const settled = fold(TASK, [...inFlight(true), { kind: 'settled', at: at(5), outcome: 'failed' }]);
  assert.equal(settled.attempts.at(-1)?.ended, null, 'settled with its attempt left open');
  assert.deepEqual(sightingFacts(settled, held(100), T), [], 'a settled task held with a process');
  assert.deepEqual(sightingFacts(fold(TASK, [...inGap(true), lostEnd]), held(300), T), [], 'an ended attempt');
});

test("LONG-LIVED: Claude Code's own crash loop is reported only — each death and respawn journalled, shown restarting, no end, no action, no backoff", () => {
  let events: Event[] = [...inFlight(true), { kind: 'process', at: at(3), attempt: 1, pid: 100 }];
  const pass = (ms: number, sighting: Sighting) => {
    const facts = sightingFacts(fold(TASK, events), sighting, at(ms));
    events = [...events, ...facts];
    const state = fold(TASK, events);
    const observed = new Map([[N1, sighting]]);
    return { facts: facts.length, action: decide(state, observed, now(ms)).do, phase: viewOfState(state, observed).phase };
  };
  let written = 0;
  for (let cycle = 0; cycle < 3; cycle++) {
    const t = HOUR + cycle * 60_000;
    const died = pass(t, { sessionId: 's1', ...RESPAWNING });
    const still = pass(t + 5_000, { sessionId: 's1', ...RESPAWNING });
    const back = pass(t + 11_000, { sessionId: 's1', state: 'input-required', busy: false, held: true, pid: 200 + cycle });
    assert.deepEqual([died.action, still.action, back.action], ['nothing', 'nothing', 'nothing'], `cycle ${cycle}`);
    assert.deepEqual([died.phase, still.phase, back.phase], ['restarting', 'restarting', 'idle'], `cycle ${cycle}`);
    written += died.facts + still.facts + back.facts;
  }
  assert.equal(written, 6, 'a gap and a process for each respawn');
  const state = fold(TASK, events);
  assert.deepEqual([state.attempts.length, state.attempts[0].ended], [1, null], 'one attempt, never ended');
  assert.equal(events.filter((e) => e.kind === 'ended').length, 0);
});

/**
 * A long-lived task, `restartPolicy: 'Always'`: its session stays open between turns, and only a stop from outside ends it.
 * Each rule is held beside its control, the same journal filed as a job, which the same sighting ends or hands to a person.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, fold, nameFor, needsHuman, observe, type Event, type Sighting } from './domain.ts';
import { viewOfState } from './engine/engine.ts';

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
    ['listed waiting with no process', { state: 'input-required', busy: false, held: false }, 'SESSION_BLOCKED'],
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

test('LONG-LIVED: a session that ended with no stop asked settles failed and says so, however it ended — where a job settles on its end', () => {
  const ends: [string, Event][] = [
    ['done', { kind: 'ended', at: at(9), attempt: 1, sessionId: 's1', observed: 'done', reason: 'harness', nativeId: 'n1' }],
    ['stopped', { kind: 'ended', at: at(9), attempt: 1, sessionId: 's1', observed: 'stopped', reason: 'harness' }],
    ['failed', { kind: 'ended', at: at(9), attempt: 1, sessionId: 's1', observed: 'failed', reason: 'harness' }],
    ['lost', { kind: 'ended', at: at(9), attempt: 1, sessionId: 's1', observed: 'failed', reason: 'lost' }],
  ];
  const job: Record<string, string> = { done: 'succeeded', stopped: 'stopped', failed: 'failed', lost: 'failed' };
  for (const [name, end] of ends) {
    assert.deepEqual(
      decide(fold(TASK, [...inFlight(true), end]), new Map(), now(10)),
      { do: 'settle', outcome: 'failed', note: 'the long-lived session ended without a stop' },
      name,
    );
    const a = decide(fold(TASK, [...inFlight(false), end]), new Map(), now(10));
    assert.equal(a.do === 'settle' && a.outcome, job[name], `${name}, as a job`);
  }
});

test('LONG-LIVED: the filing is read back off the journal, and a journal with no `restartPolicy` folds to a job', () => {
  assert.equal(fold(TASK, [filed(true)]).restartPolicy, 'Always');
  assert.equal(fold(TASK, [filed(false)]).restartPolicy, undefined);
});

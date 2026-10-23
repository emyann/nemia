/**
 * What the harness denied an attempt in flight, journalled as it reports it (`deniedFacts`), and what the fold makes of it: the
 * attempt's denials grown by each `denied` entry, and replaced by an end that names its own.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fold, type Denial, type Event, type Sighting } from '../domain.ts';
import type { SessionState } from '../session.ts';
import { deniedFacts } from './denied.ts';

const T0 = Date.parse('2026-01-01T00:00:00Z');
const at = (ms: number) => new Date(T0 + ms).toISOString();
const TASK = 't-1';

const inFlight = (...more: Event[]): Event[] => [
  { kind: 'filed', at: at(0), brief: 'b', cwd: '/r', queued: false },
  { kind: 'starting', at: at(1), attempt: 1 },
  { kind: 'spawned', at: at(2), attempt: 1 },
  ...more,
];
const LS: Denial = { tool: 'Bash', what: 'ls' };
const GLOB: Denial = { tool: 'Glob' };
const WRITE: Denial = { tool: 'Write', what: '/x' };
const denied = (d: Denial, n = 1): Event => ({ kind: 'denied', at: at(10), attempt: n, ...d });
const seen = (denials?: Denial[], state: SessionState = 'working'): Sighting => ({
  sessionId: 's1',
  state,
  ...(denials ? { denials } : {}),
});
const ended = (denials?: Denial[]): Event => ({
  kind: 'ended',
  at: at(30),
  attempt: 1,
  sessionId: 's1',
  observed: 'done',
  reason: 'harness',
  ...(denials ? { denials } : {}),
});

test("deniedFacts: what the harness denied an attempt in flight, journalled once as it reports it, and nothing where it is not this attempt's to say", async (t) => {
  await t.test(
    'DENIED: a working attempt whose sighting names two denials the record has not is written one denied entry for each, in order',
    () => {
      assert.deepEqual(deniedFacts(fold(TASK, inFlight()), seen([LS, GLOB]), at(20)), [
        { kind: 'denied', at: at(20), attempt: 1, tool: 'Bash', what: 'ls' },
        { kind: 'denied', at: at(20), attempt: 1, tool: 'Glob' },
      ]);
    },
  );

  await t.test('DENIED: a denial the record already holds is not written again — only the ones past it', () => {
    const state = fold(TASK, inFlight(denied(LS)));
    assert.deepEqual(deniedFacts(state, seen([LS, GLOB]), at(20)), [{ kind: 'denied', at: at(20), attempt: 1, tool: 'Glob' }]);
    assert.deepEqual(deniedFacts(state, seen([LS]), at(20)), [], 'the same reading again writes nothing');
  });

  await t.test('DENIED: the same call denied twice is two denials, each written', () => {
    const state = fold(TASK, inFlight(denied(LS)));
    assert.deepEqual(deniedFacts(state, seen([LS, LS]), at(20)), [{ kind: 'denied', at: at(20), attempt: 1, tool: 'Bash', what: 'ls' }]);
  });

  await t.test('DENIED: nothing is written for a settled task', () => {
    const settled = fold(TASK, inFlight({ kind: 'settled', at: at(15), outcome: 'stopped' }));
    assert.deepEqual(deniedFacts(settled, seen([LS]), at(20)), []);
  });

  await t.test('DENIED: nothing is written for an ended attempt, whose end said what it was denied', () => {
    assert.deepEqual(deniedFacts(fold(TASK, inFlight(ended())), seen([LS]), at(40)), []);
  });

  await t.test('DENIED: nothing is written off a sighting of a session that is over: its end carries the denials', () => {
    for (const state of ['failed', 'completed', 'canceled'] as const)
      assert.deepEqual(deniedFacts(fold(TASK, inFlight()), seen([LS], state), at(20)), [], state);
  });

  await t.test('DENIED: nothing is written off a sighting with no denials, or no sighting', () => {
    const state = fold(TASK, inFlight());
    assert.deepEqual(deniedFacts(state, seen(), at(20)), [], 'none denied');
    assert.deepEqual(deniedFacts(state, undefined, at(20)), [], 'not seen');
  });

  await t.test('DENIED: a sighting whose denials do not begin with the record is another reading, and nothing is written off it', () => {
    const state = fold(TASK, inFlight(denied(LS)));
    assert.deepEqual(deniedFacts(state, seen([GLOB, LS]), at(20)), []);
    assert.deepEqual(deniedFacts(fold(TASK, inFlight(denied(LS), denied(GLOB))), seen([LS]), at(20)), [], 'one shorter than the record');
  });
});

test('fold: an attempt denials grown by each denied entry, and replaced by an end that names its own', async (t) => {
  const live = inFlight(denied(LS), denied(GLOB));
  await t.test('FOLD: each denied entry joins its attempt denials', () => {
    assert.deepEqual(fold(TASK, live).attempts[0]?.denials, [LS, GLOB]);
  });
  await t.test('FOLD: an end that names its own denials replaces them: the list of the end stands', () => {
    assert.deepEqual(fold(TASK, [...live, ended([LS, LS, GLOB])]).attempts[0]?.denials, [LS, LS, GLOB]);
  });
  await t.test('FOLD: an end that names none keeps what was seen', () => {
    assert.deepEqual(fold(TASK, [...live, ended()]).attempts[0]?.denials, [LS, GLOB]);
  });
  await t.test('FOLD: a denial of another attempt is not this one', () => {
    assert.equal(fold(TASK, inFlight(denied(WRITE, 2))).attempts[0]?.denials, undefined);
  });
});

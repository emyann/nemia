/**
 * A task's path through its lifecycle, replayed off hand-built journals: one step per entry, the state the journal says once the entry
 * is on it, the entry's kind and its `at`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathOf } from '../src/core/path.ts';
import type { Event } from '../src/core/domain.ts';
import { at, ended, filed, S, signed, spawned, starting, TASK } from './lifecycle-corpus.ts';

/** The path of `events` as `state <- event` words, to compare in one line. */
const words = (events: Event[]) => pathOf(TASK, events).map((s) => `${s.state} <- ${s.event}`);

test('pathOf: a journal replayed into its path through the lifecycle, one step per entry, its state, its kind and its time', async (t) => {
  await t.test('an empty journal is an empty path', () => {
    assert.deepEqual(pathOf(TASK, []), []);
  });

  await t.test('a task run to its end: submitted, starting, working, ending, completed, each at its entry', () => {
    const events: Event[] = [
      filed(),
      starting(1, 0),
      spawned(1),
      signed(1),
      { kind: 'settled', at: at(3 * S), outcome: 'succeeded', nativeId: 'native-1' },
    ];
    assert.deepEqual(pathOf(TASK, events), [
      { state: 'submitted', event: 'filed', at: at(0) },
      { state: 'starting', event: 'starting', at: at(0) },
      { state: 'working', event: 'spawned', at: at(S) },
      { state: 'ending', event: 'ended', at: at(2 * S) },
      { state: 'completed', event: 'settled', at: at(3 * S) },
    ]);
  });

  await t.test('a measured entry keeps the state it finds', () => {
    const measured: Event = { kind: 'measured', at: at(S + 1), attempt: 1, usage: { responses: 2 } };
    assert.deepEqual(words([filed(), starting(1), spawned(1), measured]), [
      'submitted <- filed',
      'starting <- starting',
      'working <- spawned',
      'working <- measured',
    ]);
  });

  await t.test("a person's stop moves a running task to stopping, and its settling to canceled", () => {
    const events: Event[] = [
      filed(),
      starting(1),
      spawned(1),
      { kind: 'stop-requested', at: at(S + 1) },
      ended(1, 'stopped', 'operator'),
      { kind: 'settled', at: at(3 * S), outcome: 'stopped' },
    ];
    assert.deepEqual(words(events), [
      'submitted <- filed',
      'starting <- starting',
      'working <- spawned',
      'stopping <- stop-requested',
      'stopping <- ended',
      'canceled <- settled',
    ]);
  });

  await t.test('a task held open waits on a person, is answered into its next turn, and is closed to ending', () => {
    const events: Event[] = [
      filed({ holdOpen: true, queued: true }),
      { kind: 'admitted', at: at(0) },
      starting(1),
      spawned(1),
      signed(1),
      { kind: 'input', at: at(3 * S), text: 'go on' },
      starting(2, 4 * S),
      spawned(2, 5 * S),
      { ...signed(2), at: at(6 * S) },
      { kind: 'closed', at: at(7 * S) },
      { kind: 'settled', at: at(8 * S), outcome: 'succeeded', note: 'closed' },
    ];
    assert.deepEqual(words(events), [
      'submitted <- filed',
      'submitted <- admitted',
      'starting <- starting',
      'working <- spawned',
      'input-required <- ended',
      'submitted <- input',
      'starting <- starting',
      'working <- spawned',
      'input-required <- ended',
      'ending <- closed',
      'completed <- settled',
    ]);
  });

  await t.test('a spawn that failed ends at ending, and settles failed', () => {
    const events: Event[] = [
      filed(),
      starting(1),
      { kind: 'spawned', at: at(S), attempt: 1, error: 'no such binary' },
      ended(1, 'failed', 'unstartable'),
      { kind: 'settled', at: at(3 * S), outcome: 'failed' },
    ];
    assert.deepEqual(words(events), [
      'submitted <- filed',
      'starting <- starting',
      'working <- spawned',
      'ending <- ended',
      'failed <- settled',
    ]);
  });
});

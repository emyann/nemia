/**
 * What the contracts (`contracts/`) assume of code the verifier does not read holds of the real code: the lifecycle's table, every
 * state against every kind of event, keeps each law `decide.contract.ts` declares of it, and the restart's wait keeps within its cap
 * however many ends come in a row, as `decide.contract.ts` and `observe.contract.ts` declare. `npm run contracts` proves each contract
 * given these; this file is what makes them more than a claim.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brokenOn } from '@emyann/tsverify';
import { backoff, edges } from '../contracts/decide.contract.ts';
import { backoff as observedBackoff } from '../contracts/observe.contract.ts';
import type { Attempt, Sighting } from '../src/core/domain.ts';
import { type LifecycleEvent, STATES } from '../src/core/lifecycle.ts';

/** Every kind of event the table takes: a kind added to `LifecycleEvent` fails the typecheck here until the events below hold one. */
const KINDS: Record<LifecycleEvent['type'], true> = {
  QUEUED: true,
  NOTHING_OPEN: true,
  AWAITING_INPUT: true,
  CLOSED: true,
  READY: true,
  RESTART_DUE: true,
  PREVIOUS_LIVE: true,
  NO_SESSION_TO_CONTINUE: true,
  SESSION_LIVE: true,
  SESSION_IDLE: true,
  SESSION_BLOCKED: true,
  SESSION_QUIET: true,
  SESSION_ENDED: true,
  SESSION_STOPPED: true,
  SESSION_RESPAWNING: true,
  RESPAWN_OVERDUE: true,
  UNSPAWNED: true,
  UNSEEN_IN_GRACE: true,
  LOST: true,
  UNREAD: true,
  DEADLINE_PASSED: true,
  SPAWN_REFUSED: true,
  DEADLINE_SPENT: true,
  ATTEMPT_ENDED: true,
  BACKING_OFF: true,
  SETTLED: true,
};

/** Each kind of event, in each shape its fields can take that the laws tell apart. */
const events = (): LifecycleEvent[] => {
  const sighting: Sighting = { sessionId: 's', state: 'working' };
  const all: LifecycleEvent[] = [{ type: 'QUEUED' }, { type: 'NOTHING_OPEN' }, { type: 'AWAITING_INPUT' }, { type: 'CLOSED' }];
  for (const type of ['READY', 'RESTART_DUE'] as const) all.push({ type, attempt: 2 }, { type, attempt: 2, resumeFrom: 'x', nudge: 'n' });
  all.push({ type: 'PREVIOUS_LIVE', sessionId: 's' }, { type: 'NO_SESSION_TO_CONTINUE', turn: 1 });
  const sessioned = [
    'SESSION_LIVE',
    'SESSION_IDLE',
    'SESSION_BLOCKED',
    'SESSION_QUIET',
    'SESSION_ENDED',
    'SESSION_STOPPED',
    'SESSION_RESPAWNING',
    'RESPAWN_OVERDUE',
  ] as const;
  for (const type of sessioned)
    for (const holds of [false, true]) for (const asked of [false, true]) all.push({ type, attempt: 1, sighting, asked, holds });
  all.push({ type: 'UNSPAWNED', attempt: 1, name: 'n' }, { type: 'UNSEEN_IN_GRACE', attempt: 1 }, { type: 'LOST', attempt: 1 });
  for (const overdue of [false, true]) all.push({ type: 'UNREAD', attempt: 1, overdue });
  all.push({ type: 'DEADLINE_PASSED', attempt: 1, live: false }, { type: 'DEADLINE_PASSED', attempt: 1, live: true, sighting });
  all.push({ type: 'SPAWN_REFUSED', attempt: 1, error: 'e' }, { type: 'DEADLINE_SPENT', seconds: 1 });
  for (const ended of [null, 'succeeded', 'failed', 'stopped'] as const) {
    all.push({ type: 'CLOSED', last: { n: 1, ended } });
    for (const reason of [null, 'harness', 'deadline', 'operator', 'lost', 'unstartable'] as const)
      all.push({ type: 'ATTEMPT_ENDED', ended, reason, attempts: 1, turn: 0 });
  }
  all.push({ type: 'BACKING_OFF', attempt: 1, backoffMs: 10 }, { type: 'SETTLED', outcome: 'succeeded' });
  return all;
};

test("the lifecycle's table keeps every law decide's contract declares of it, on every state and every kind of event", () => {
  const all = events();
  assert.deepEqual([...new Set(all.map((e) => e.type))].sort(), Object.keys(KINDS).sort());
  const inputs = STATES.flatMap((from) => all.map((event): [(typeof STATES)[number], LifecycleEvent] => [from, event]));
  assert.deepEqual(
    brokenOn(edges, inputs).map((b) => [b.law, b.input[0], b.input[1].type]),
    [],
  );
});

/** A moment `s` seconds into the hour the attempts below began. */
const at = (s: number): string => new Date(Date.UTC(2026, 9, 30, 12, 0, s)).toISOString();
const attempt = (o: Partial<Attempt> = {}): Attempt => ({
  n: 1,
  startedAt: at(0),
  spawnedAt: at(1),
  ended: null,
  endedAt: null,
  reason: null,
  nativeId: null,
  usage: null,
  exitCode: null,
  ...o,
});

test("the restart's wait keeps within its cap, however many ends come in a row", () => {
  const quick = (n: number): Attempt => attempt({ n, ended: 'failed', endedAt: at(2), reason: 'harness' });
  const runs: Array<readonly [ReadonlyArray<Attempt>]> = [[[]], [[attempt()]]];
  for (const n of [1, 2, 3, 5, 10, 40, 60, 1200]) runs.push([Array.from({ length: n }, (_, k) => quick(k + 1))]);
  runs.push([[attempt({ ended: 'failed', endedAt: new Date(Date.UTC(2026, 9, 30, 13)).toISOString(), reason: 'harness' })]]);
  assert.deepEqual(brokenOn(backoff, runs as never), []);
  assert.deepEqual(brokenOn(observedBackoff, runs as never), []);
});

/**
 * What the contracts (`contracts/`) assume of code the verifier does not read holds of the real code: the lifecycle's table, every
 * state against every kind of event, keeps each law `decide.contract.ts` declares of it, and the restart's wait keeps within its cap
 * however many ends come in a row, as `decide.contract.ts` and `observe.contract.ts` declare, and a permission's command is a Bash
 * call's alone, as `permission.contract.ts` declares. `npm run contracts` proves each contract
 * given these; this file is what makes them more than a claim.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brokenOn } from '@emyann/tsverify';
import { deadlineOf } from '../src/core/deadline.ts';
import { backoff, edges } from '../contracts/decide.contract.ts';
import { deadline, backoff as observedBackoff } from '../contracts/observe.contract.ts';
import { shellCommand } from '../contracts/permission.contract.ts';
import { commandOf } from '../src/harness/claude/permission.ts';
import { fold, type Attempt, type Event, type Sighting } from '../src/core/domain.ts';
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
  PARK_HELD: true,
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
  all.push(
    { type: 'BACKING_OFF', attempt: 1, backoffMs: 10 },
    { type: 'PARK_HELD', attempt: 1 },
    { type: 'SETTLED', outcome: 'succeeded' },
  );
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

test('a deadline is past only where one was set and its turn has started, in whole milliseconds', () => {
  const mono = (ms: number) => ({ boot: 'b1', ms });
  const journal = (deadlineSeconds: number | undefined, ...more: Event[]): Event[] => [
    { kind: 'filed', at: at(0), brief: 'b', cwd: '/r', queued: false, ...(deadlineSeconds === undefined ? {} : { deadlineSeconds }) },
    { kind: 'starting', at: at(1), attempt: 1, mono: mono(1_000) },
    ...more,
  ];
  const parked: Event[] = [
    { kind: 'ended', at: at(10), attempt: 1, sessionId: 's', observed: 'failed', reason: 'harness', parked: {} },
    { kind: 'starting', at: at(20), attempt: 2, mono: mono(20_000) },
    { kind: 'held', at: at(25), attempt: 2 },
    { kind: 'released', at: at(30), attempt: 2, mono: mono(30_000) },
  ];
  const states = [
    fold('t', [{ kind: 'filed', at: at(0), brief: 'b', cwd: '/r', deadlineSeconds: 1 }]),
    fold('t', [
      { kind: 'filed', at: at(0), brief: 'b', cwd: '/r', deadlineSeconds: 1, holdOpen: true },
      ...journal(undefined).slice(1),
      { kind: 'ended', at: at(5), attempt: 1, sessionId: 's', observed: 'succeeded', reason: 'harness', nativeId: 'n' },
      { kind: 'input', at: at(6), text: 'go on' },
    ]),
    fold('t', journal(undefined)),
    fold('t', journal(1)),
    fold('t', journal(1, { kind: 'held', at: at(5), attempt: 1, mono: mono(5_000) }, { kind: 'released', at: at(9), attempt: 1 })),
    fold('t', journal(1, ...parked)),
  ];
  const nows = [
    { at: new Date(at(40)), graceMs: 0 },
    { at: new Date(at(3_600)), graceMs: 0, mono: mono(3_600_000) },
  ];
  const runs = states.flatMap((s) => nows.map((n) => [s, n] as const));
  assert.deepEqual(brokenOn(deadline, runs as never), []);
  assert.ok(
    runs.some(([s, n]) => deadlineOf(s, n).overdue),
    'some of the runs are past their deadline',
  );
});

test("a permission's command is a shell call's alone, read off its input as typed", () => {
  const inputs: Record<string, unknown>[] = [{}, { command: 'ls -la' }, { command: 3 }, { command: '' }, { file_path: '/etc/hosts' }];
  const runs = ['Bash', 'Read', 'Write', 'mcp__x__y'].flatMap((tool) => inputs.map((input) => [tool, input] as const));
  assert.deepEqual(brokenOn(shellCommand, runs as never), []);
  assert.equal(commandOf('Bash', { command: 'ls -la' }), 'ls -la', 'the command as typed');
  assert.equal(commandOf('Bash', { command: 3 }), undefined, 'and nothing where the input holds no command string');
});

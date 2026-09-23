/**
 * The A2A seam beneath the engine's harnesses (thin runtime, stage 1 part 2): the mappings, round-tripped, and a
 * harness driven through the SDK's `Client`, whose words reach the engine unchanged.
 *
 * Strings are compared exactly, never by pattern: a word the seam changed on its way from a harness fails here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Role, TaskState } from '@a2a-js/sdk';
import {
  failedSpawnTask, messageOf, messageRefusal, nameParts, observedOf, sightingOf, spawnOf, startedTask, stateOf, taskOfAttempt,
  taskOfSighting, wordsOf,
} from '../src/a2a-map.ts';
import type { Attempt, Observed, Sighting } from '../src/domain.ts';
import type { SpawnRequest } from '../src/runner.ts';

/** JSON's round trip, as a transport that serialises would carry a value. */
const overTheWire = (v: unknown) => JSON.parse(JSON.stringify(structuredClone(v)));

test('each session state is its A2A state, exactly, and back', () => {
  // The table itself, not only its round trip: two states swapped would still round-trip.
  const expected: Record<Observed, TaskState> = {
    working: TaskState.TASK_STATE_WORKING,
    blocked: TaskState.TASK_STATE_INPUT_REQUIRED,
    done: TaskState.TASK_STATE_COMPLETED,
    failed: TaskState.TASK_STATE_FAILED,
    stopped: TaskState.TASK_STATE_CANCELED,
  };
  for (const [observed, state] of Object.entries(expected) as Array<[Observed, TaskState]>) {
    assert.equal(stateOf(observed), state, observed);
    assert.equal(observedOf(state), observed, observed);
  }
  for (const state of [TaskState.TASK_STATE_SUBMITTED, TaskState.TASK_STATE_REJECTED, TaskState.TASK_STATE_AUTH_REQUIRED, TaskState.TASK_STATE_UNSPECIFIED]) {
    assert.equal(observedOf(state), undefined, `${TaskState[state]} is no session's state`);
  }
});

test('a session name is its task and attempt, and nothing else is', () => {
  assert.deepEqual(nameParts('ae/t-1/2'), { taskId: 't-1', n: 2 });
  assert.deepEqual(nameParts('ae/a/b/13'), { taskId: 'a/b', n: 13 });
  for (const name of ['ae/t/0', 'ae/t/01', 'ae/t/x', 'ae//1', 'ae/t/', 'x/t/1', 'fake-1', '']) {
    assert.equal(nameParts(name), undefined, name);
  }
});

/** A sighting with every optional field set. */
const full: Sighting = {
  sessionId: 's-7', state: 'blocked', busy: true, nativeId: 'native-7',
  usage: {
    turns: 4, toolCalls: 9, inputTokens: 1200, cacheReadTokens: 900, cacheWriteTokens: 200, uncachedTokens: 100,
    peakContextTokens: 1100, firstContextTokens: 400, firstCacheWriteTokens: 50, compactions: 1, outputTokens: 300,
    costUsd: 0.42, apiMs: 5000, toolMs: 700, unpricedModel: true,
  },
  exitCode: 0, closeout: { payload: { outcome: 'done', notes: ['a', 'b'] }, at: 1790000000000 }, quietMs: 95_000,
  waitingFor: 'permission prompt', budgetSpent: true,
};

test('a sighting rides whole in its Task, and survives a transport that serialises', () => {
  const t = taskOfSighting('ae/t-1/3', full);
  assert.equal(t.id, 'ae/t-1/3');
  assert.equal(t.contextId, 't-1');
  assert.equal(t.status!.state, TaskState.TASK_STATE_INPUT_REQUIRED);
  assert.deepEqual(sightingOf(t), full);
  assert.deepEqual(overTheWire(t.metadata), t.metadata, 'nothing in a sighting changes shape as JSON');
  assert.deepEqual(sightingOf({ ...t, metadata: overTheWire(t.metadata) }), full);
  for (const state of ['working', 'done', 'failed', 'stopped'] as const) {
    assert.deepEqual(sightingOf(taskOfSighting('ae/t-1/3', { sessionId: 's', state })), { sessionId: 's', state });
  }
});

test('a Task whose state is not its sighting\'s carries no sighting', () => {
  const t = taskOfSighting('ae/t-1/3', full);
  assert.equal(sightingOf({ ...t, status: { ...t.status!, state: TaskState.TASK_STATE_WORKING } }), undefined);
  assert.equal(sightingOf(startedTask('ae/t-1/3', messageOf({ name: 'ae/t-1/3', brief: 'b', cwd: '/r' }, 'm'))), undefined);
});

const request: SpawnRequest = {
  name: 'ae/t-1/2', brief: 'write the words down\n\nand then stop.', cwd: '/repo', harness: 'fake',
  config: { model: 'opus', permissionMode: 'dontAsk', tools: ['Read', 'Edit'], mcp: { web: { command: 'npx', args: ['web'] } } },
  resumeFrom: 'native-1', closeoutSchema: { type: 'object', required: ['outcome'] }, budgetUsd: 2.5,
};

test('a spawn is a user Message: the name its task, the brief its one text part, the rest its metadata', () => {
  const m = messageOf(request, 'm-1');
  assert.deepEqual(m, {
    messageId: 'm-1', contextId: 't-1', taskId: 'ae/t-1/2', role: Role.ROLE_USER,
    parts: [{ content: { $case: 'text', value: 'write the words down\n\nand then stop.' }, metadata: undefined, filename: '', mediaType: '' }],
    metadata: {
      cwd: '/repo', harness: 'fake', config: request.config, resumeFrom: 'native-1', closeoutSchema: request.closeoutSchema, budgetUsd: 2.5,
    },
    extensions: [], referenceTaskIds: [],
  });
  assert.equal(m.metadata!.config, request.config, 'config is carried whole, never opened');
  assert.equal(messageRefusal(m), undefined);
  assert.deepEqual(spawnOf(m), request);
  assert.deepEqual(spawnOf(overTheWire(m)), request);
});

test('a spawn with its optional keys unset comes back with every key, as the engine asks for one', () => {
  const m = messageOf({ name: 'ae/t-1/1', brief: 'b', cwd: '/r' }, 'm-2');
  assert.deepEqual(m.metadata, { cwd: '/r' }, 'no undefined in metadata');
  assert.deepEqual(spawnOf(overTheWire(m)), {
    name: 'ae/t-1/1', brief: 'b', cwd: '/r', harness: undefined, config: undefined, closeoutSchema: undefined, budgetUsd: undefined,
    resumeFrom: undefined,
  });
});

test("a failed spawn's words ride in its Task's status: REJECTED when nothing started, SUBMITTED when something may have", () => {
  const asked = messageOf(request, 'm-1');
  const refused = failedSpawnTask('ae/t-1/2', asked, 'fake: no binary called `fake` on PATH', true, 'm-2');
  assert.equal(refused.status!.state, TaskState.TASK_STATE_REJECTED);
  assert.equal(wordsOf(refused), 'fake: no binary called `fake` on PATH');
  assert.equal(refused.status!.message!.role, Role.ROLE_AGENT);
  const ambiguous = failedSpawnTask('ae/t-1/2', asked, 'fake: the launcher lost its acknowledgement', false, 'm-3');
  assert.equal(ambiguous.status!.state, TaskState.TASK_STATE_SUBMITTED);
  assert.equal(wordsOf(ambiguous), 'fake: the launcher lost its acknowledgement');
  const started = startedTask('ae/t-1/2', asked);
  assert.equal(started.status!.state, TaskState.TASK_STATE_WORKING);
  assert.deepEqual(started.history, [asked]);
  assert.equal(wordsOf(started), undefined);
});

test('an attempt the harness no longer lists is answered from the journal', () => {
  const attempt: Attempt = {
    n: 1, startedAt: '2026-09-23T10:00:00.000Z', spawnedAt: null, ended: null, endedAt: null, reason: null, nativeId: null,
    usage: null, exitCode: null,
  };
  const cases: Array<[Partial<Attempt>, TaskState]> = [
    [{}, TaskState.TASK_STATE_SUBMITTED],
    [{ spawnedAt: '2026-09-23T10:00:01.000Z' }, TaskState.TASK_STATE_SUBMITTED],
    [{ ended: 'failed', reason: 'unstartable', error: 'fake: no binary' }, TaskState.TASK_STATE_REJECTED],
    [{ ended: 'done', reason: 'harness' }, TaskState.TASK_STATE_COMPLETED],
    [{ ended: 'stopped', reason: 'operator' }, TaskState.TASK_STATE_CANCELED],
    [{ ended: 'failed', reason: 'harness' }, TaskState.TASK_STATE_FAILED],
    [{ ended: 'working', reason: 'lost' }, TaskState.TASK_STATE_FAILED],
    [{ ended: 'stopped', reason: 'deadline' }, TaskState.TASK_STATE_CANCELED],
  ];
  for (const [change, state] of cases) {
    const t = taskOfAttempt('ae/t-1/1', { ...attempt, ...change }, 'm');
    assert.equal(t.status!.state, state, JSON.stringify(change));
    assert.equal((t.metadata!.attempt as Attempt).reason, change.reason ?? null);
    assert.deepEqual(overTheWire(t.metadata), t.metadata);
  }
  assert.equal(wordsOf(taskOfAttempt('ae/t-1/1', { ...attempt, ...cases[2]![0] }, 'm')), 'fake: no binary');
});

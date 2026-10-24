/**
 * The runtime's model: TaskId checked on create and nominal on read, AttemptNumber a whole number from 1, the task's attempts
 * numbered from 1 with no gap, the entities held to the fold's own types, and the diagram drawn from them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Option, Schema } from 'effect';
import type { Attempt as FoldedAttempt, State } from './domain.ts';
import type { Mount as HarnessMount } from '../harness/mounts.ts';
import * as Model from './model.ts';

/** Whether `A` and `B` hold the same keys. */
type SameKeys<A, B> = [keyof A] extends [keyof B] ? ([keyof B] extends [keyof A] ? true : false) : false;
/** Whether each of `A` and `B` is assignable to the other. */
type Agree<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

const attempt = (n: number) => ({
  n,
  startedAt: '2026-10-24T00:00:00.000Z',
  spawnedAt: null,
  ended: null,
  endedAt: null,
  reason: null,
  nativeId: null,
  usage: null,
  exitCode: null,
});
const task = (numbers: number[]) => ({
  taskId: 't-1',
  brief: 'b',
  cwd: '/w',
  attempts: numbers.map(attempt),
  said: [],
  inputs: [],
  closed: false,
  stopRequested: false,
  settled: null,
});

test('TaskId on create takes what a journal file can be named, and every id a writer mints', async (t) => {
  await t.test('it accepts the runtime’s, the orchestrator’s, and a name of 255 bytes', () => {
    const minted = `t-${Date.now().toString(36)}-0123abcd`;
    for (const id of [minted, 'nemia-run-1-implement', 'nemia-run-1-review, again!-try2', 'r-x-step-try3-check', 'a'.repeat(255)]) {
      assert.ok(Option.isSome(Model.TaskId.create.option(id)), id);
      assert.ok(Schema.is(Model.TaskId.OnCreate)(id), id);
    }
  });
  await t.test('it refuses what no journal file is named', () => {
    for (const id of ['', '.', '..', 'a/b', 'a\u0000b', 'a\nb', 'a\u007fb', 'a'.repeat(256), 'é'.repeat(128)]) {
      assert.ok(Option.isNone(Model.TaskId.create.option(id)), JSON.stringify(id));
      assert.ok(!Schema.is(Model.TaskId.OnCreate)(id), JSON.stringify(id));
      assert.equal(typeof Model.taskIdRefusal(id), 'string', JSON.stringify(id));
    }
  });
});

test('TaskId on read takes any string, so no journal already written becomes unreadable', () => {
  for (const id of ['', 'a/b', 'x'.repeat(300)]) assert.equal(Schema.decodeUnknownSync(Model.TaskId.OnRead)(id), id);
});

test('AttemptNumber is a whole number from 1', () => {
  assert.ok(Option.isSome(Model.AttemptNumber.create.option(1)));
  for (const n of [0, 1.5, -1]) assert.ok(Option.isNone(Model.AttemptNumber.create.option(n)), String(n));
});

test('a task’s attempts number from 1 with no gap', () => {
  const ok = Schema.is(Model.Task);
  assert.ok(ok(task([])));
  assert.ok(ok(task([1, 2, 3])));
  assert.ok(!ok(task([1, 3])), 'a gap');
  assert.ok(!ok(task([2])), 'not from 1');
  assert.ok(!ok(task([1, 1])), 'a number twice');
});

test('the entities hold the keys the fold holds, and a mount the harness’s shape', () => {
  const task: SameKeys<Model.Task, State> = true;
  const attempt: SameKeys<Model.Attempt, FoldedAttempt> = true;
  const mount: Agree<Model.Mount, HarnessMount> = true;
  assert.deepEqual([task, attempt, mount], [true, true, true]);
});

test('a journal entry is a task’s id and an event as the journal holds it', () => {
  const decode = Schema.decodeUnknownResult(Model.JournalEntry);
  const entry = { taskId: 't-1', event: { kind: 'admitted', at: '2026-10-24T00:00:00.000Z' } };
  assert.equal(decode(entry)._tag, 'Success');
  assert.equal(decode({ taskId: 't-1', event: { kind: 'no-such-kind', at: 'x' } })._tag, 'Failure');
});

test('the diagram names every entity, and the place a session runs as the host', () => {
  const lines = Model.runtimeModelDiagram().split('\n');
  for (const name of ['Task', 'Attempt', 'Session', 'JournalEntry', 'HarnessArgs', 'Mount', 'ExecutionPlace']) {
    assert.ok(lines.includes(`  ${name} {`), name);
  }
  assert.ok(lines.includes('    host place'));
  assert.ok(lines.includes('  Task ||--o{ Attempt : attempts'));
  assert.ok(lines.includes('  Task ||--o{ JournalEntry : taskId'));
});

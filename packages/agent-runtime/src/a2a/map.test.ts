/**
 * A remote agent's Task in the runtime's words, and a spawn in A2A's (`sightingOfTask`, `remoteMessageOf` in
 * `a2a/map.ts`): pure, so each A2A state and each place a closing statement can be is one case here, with no agent behind
 * it. The agent itself is `remote-agent.test.ts`'s.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Role, TaskState, type Artifact, type Part, type Task } from '@a2a-js/sdk';
import { logsOfTask, messageRefusal, remoteFollowUpOf, remoteMessageOf, RUNTIME_EXTENSION, sightingOfTask } from './map.ts';
import type { SessionState } from '../core/session.ts';

const text = (value: string): Part => ({ content: { $case: 'text', value }, metadata: undefined, filename: '', mediaType: '' });
const data = (value: Record<string, unknown>): Part => ({
  content: { $case: 'data', value },
  metadata: undefined,
  filename: '',
  mediaType: '',
});
const artifact = (...parts: Part[]): Artifact => ({
  artifactId: `a${parts.length}`,
  name: '',
  description: '',
  parts,
  metadata: undefined,
  extensions: [],
});

const taskIn = (state: TaskState, artifacts: Artifact[] = []): Task => ({
  id: 't-1',
  contextId: 'c-1',
  status: { state, message: undefined, timestamp: undefined },
  artifacts,
  history: [],
  metadata: undefined,
});

test("the map: a remote agent's Task in the runtime's words, and a spawn, words and logs in A2A's", async (t) => {
  await t.test(
    'each A2A state is passed through as its own name, an interrupted one says what it waits for, and no state or one no version of A2A this runtime knows is working, which the deadline bounds',
    () => {
      const cases: Array<[TaskState, SessionState, string | undefined]> = [
        [TaskState.TASK_STATE_SUBMITTED, 'submitted', undefined],
        [TaskState.TASK_STATE_WORKING, 'working', undefined],
        [TaskState.TASK_STATE_INPUT_REQUIRED, 'input-required', 'input'],
        [TaskState.TASK_STATE_AUTH_REQUIRED, 'auth-required', 'authentication'],
        [TaskState.TASK_STATE_COMPLETED, 'completed', undefined],
        [TaskState.TASK_STATE_FAILED, 'failed', undefined],
        [TaskState.TASK_STATE_REJECTED, 'rejected', undefined],
        [TaskState.TASK_STATE_CANCELED, 'canceled', undefined],
        [TaskState.TASK_STATE_UNSPECIFIED, 'working', undefined],
        [99 as TaskState, 'working', undefined],
      ];
      for (const [state, observed, waiting] of cases) {
        const s = sightingOfTask(taskIn(state));
        assert.equal(s.state, observed, TaskState[state] ?? String(state));
        assert.equal(s.waitingFor, waiting, TaskState[state] ?? String(state));
        assert.equal(s.sessionId, 't-1');
        assert.equal(s.nativeId, 'c-1', 'the context is the conversation a later turn continues');
        assert.equal(s.closeout, undefined, 'no artifact, no statement');
      }
      assert.equal(sightingOfTask({ ...taskIn(TaskState.TASK_STATE_WORKING), status: undefined }).state, 'working');
      assert.equal(sightingOfTask({ ...taskIn(TaskState.TASK_STATE_WORKING), contextId: '' }).nativeId, undefined);
    },
  );

  await t.test(
    "the closing statement is the data part of the last artifact that has one, with no time: the Task is this attempt's own",
    () => {
      const done = (...artifacts: Artifact[]) => sightingOfTask(taskIn(TaskState.TASK_STATE_COMPLETED, artifacts)).closeout;
      assert.deepEqual(done(artifact(data({ n: 1 })), artifact(data({ n: 2 }))), { payload: { n: 2 } }, 'in the last artifact');
      assert.deepEqual(done(artifact(data({ n: 1 })), artifact(text('words, no data'))), { payload: { n: 1 } }, 'in an earlier one');
      assert.deepEqual(
        done(artifact(data({ n: 1 }), text('and a line'), data({ n: 3 }))),
        { payload: { n: 3 } },
        'the last data part of it',
      );
      assert.equal(done(artifact(text('only words'))), undefined, 'none: the end is recorded `stated: false`');
      assert.equal(done(), undefined);
    },
  );

  await t.test('a statement published while the Task is not complete is not read: it would end the attempt early', () => {
    for (const state of [
      TaskState.TASK_STATE_WORKING,
      TaskState.TASK_STATE_INPUT_REQUIRED,
      TaskState.TASK_STATE_FAILED,
      TaskState.TASK_STATE_CANCELED,
    ]) {
      assert.equal(sightingOfTask(taskIn(state, [artifact(data({ early: true }))])).closeout, undefined, TaskState[state]);
    }
  });

  await t.test('a spawn is a plain user message: the brief, the context it continues, the schema under the extension, and no mark', () => {
    const m = remoteMessageOf(
      { name: 'ae/t/1', brief: 'do it', cwd: '/w', config: { model: 'x' }, resumeFrom: 'c-9', closeoutSchema: { type: 'object' } },
      'm-1',
    );
    assert.equal(m.messageId, 'm-1');
    assert.equal(m.role, Role.ROLE_USER);
    assert.equal(m.contextId, 'c-9');
    assert.equal(m.taskId, '', 'the agent names the Task');
    assert.deepEqual(
      m.parts.map((p) => p.content),
      [{ $case: 'text', value: 'do it' }],
    );
    assert.deepEqual(m.metadata, { [RUNTIME_EXTENSION]: { closeoutSchema: { type: 'object' } } });
    assert.deepEqual(m.extensions, [], "not marked: a remote agent is not asked to start a session by the runtime's name");
    assert.ok(!JSON.stringify(m).includes('/w') && !JSON.stringify(m).includes('model'), 'nothing of the local harnesses rides along');
    const cold = remoteMessageOf({ name: 'ae/t/1', brief: 'b', cwd: '/w' }, 'm-2');
    assert.equal(cold.contextId, '');
    assert.equal(cold.metadata, undefined);
    assert.match(
      messageRefusal(cold) ?? '',
      /./,
      "handed to the runtime's own agent as a spawn, it is refused: it names no session to start",
    );
  });

  await t.test('words for a waiting Task are a user message on that Task, in its context', () => {
    const m = remoteFollowUpOf('t-1', 'c-1', 'blue', 'm-3');
    assert.deepEqual([m.taskId, m.contextId, m.messageId, m.role], ['t-1', 'c-1', 'm-3', Role.ROLE_USER]);
    assert.deepEqual(
      m.parts.map((p) => p.content),
      [{ $case: 'text', value: 'blue' }],
    );
  });

  await t.test("a Task's logs are its messages, its state and its artifacts, as text", () => {
    const t: Task = {
      ...taskIn(TaskState.TASK_STATE_COMPLETED, [artifact(data({ ok: true }))]),
      status: {
        state: TaskState.TASK_STATE_COMPLETED,
        timestamp: undefined,
        message: {
          messageId: 'm',
          contextId: 'c-1',
          taskId: 't-1',
          role: Role.ROLE_AGENT,
          parts: [text('finished')],
          metadata: undefined,
          extensions: [],
          referenceTaskIds: [],
        },
      },
      history: [
        {
          messageId: 'u',
          contextId: 'c-1',
          taskId: 't-1',
          role: Role.ROLE_USER,
          parts: [text('do it')],
          metadata: undefined,
          extensions: [],
          referenceTaskIds: [],
        },
      ],
    };
    assert.equal(logsOfTask(t), 'user: do it\nCOMPLETED — finished\nartifact a1: {"ok":true}');
  });
});

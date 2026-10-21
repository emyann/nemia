/**
 * The A2A seam beneath the engine's harnesses: the mappings, round-tripped, and a harness driven through the SDK's
 * `Client`, whose words reach the engine unchanged.
 *
 * Strings are compared exactly, never by pattern: a word the seam changed on its way from a harness fails here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect, Layer } from 'effect';
import { A2A_PROTOCOL_VERSION, Role, TaskState } from '@a2a-js/sdk';
import { ExtendedAgentCardNotConfiguredError, PushNotificationNotSupportedError, UnsupportedOperationError } from '@a2a-js/sdk/errors';
import { a2aOps, a2aRunner, InProcessTransport } from '../src/a2a/client.ts';
import { file, requestStop } from '../src/core/engine/filing.ts';
import { tick } from '../src/core/engine/engine.ts';
import { Journal } from '../src/core/engine/journal.ts';
import { HarnessHandler } from '../src/a2a/handler.ts';
import { ServerCallContext } from '@a2a-js/sdk/server';
import {
  closeoutArtifact,
  closeoutOf,
  contextRefusal,
  failedSpawnTask,
  followUpOf,
  followUpRefusal,
  followUpText,
  messageOf,
  messageRefusal,
  RUNTIME_EXTENSION,
  nameOf,
  sightingOf,
  spawnOf,
  startedTask,
  stateOf,
  taskOfAttempt,
  taskOfSighting,
  wordsOf,
} from '../src/a2a/map.ts';
import { nameParts } from '../src/core/domain.ts';
import { SESSION_STATES, type Ended, type SessionState } from '../src/core/session.ts';
import type { Attempt, Sighting } from '../src/core/domain.ts';
import { Runner, RunnerError, testOps, type ExpectedSession, type RunnerOps, type SpawnRequest } from '../src/harness/seam.ts';

/** JSON's round trip, as a transport that serialises would carry a value. */
const overTheWire = (v: unknown) => JSON.parse(JSON.stringify(structuredClone(v)));

test('each session state is its A2A state, exactly, and back: the table itself, since two states swapped would still round-trip', () => {
  const expected: Record<SessionState, TaskState> = {
    submitted: TaskState.TASK_STATE_SUBMITTED,
    working: TaskState.TASK_STATE_WORKING,
    'input-required': TaskState.TASK_STATE_INPUT_REQUIRED,
    'auth-required': TaskState.TASK_STATE_AUTH_REQUIRED,
    completed: TaskState.TASK_STATE_COMPLETED,
    failed: TaskState.TASK_STATE_FAILED,
    canceled: TaskState.TASK_STATE_CANCELED,
    rejected: TaskState.TASK_STATE_REJECTED,
  };
  assert.deepEqual(Object.keys(expected).sort(), [...SESSION_STATES].sort(), 'every name a sighting speaks, and no other');
  for (const [name, state] of Object.entries(expected) as Array<[SessionState, TaskState]>) {
    assert.equal(stateOf(name), state, name);
    assert.equal(nameOf(state), name, name);
  }
  for (const state of [TaskState.TASK_STATE_UNSPECIFIED, 99 as TaskState]) {
    assert.equal(nameOf(state), undefined, `${TaskState[state] ?? state} is no session's state`);
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
  sessionId: 's-7',
  state: 'input-required',
  busy: true,
  nativeId: 'native-7',
  usage: {
    turns: 4,
    toolCalls: 9,
    inputTokens: 1200,
    cacheReadTokens: 900,
    cacheWriteTokens: 200,
    uncachedTokens: 100,
    peakContextTokens: 1100,
    firstContextTokens: 400,
    firstCacheWriteTokens: 50,
    compactions: 1,
    outputTokens: 300,
    costUsd: 0.42,
    apiMs: 5000,
    toolMs: 700,
    unpricedModel: true,
  },
  exitCode: 0,
  closeout: { payload: { outcome: 'done', notes: ['a', 'b'] }, at: 1790000000000 },
  quietMs: 95_000,
  waitingFor: 'permission prompt',
  limit: 'budget',
  denials: [{ tool: 'Skill', what: 'look' }, { tool: 'WebFetch' }],
  skills: ['write-a-spec', 'look'],
};

test('a sighting rides whole in its Task, and survives a transport that serialises', () => {
  const t = taskOfSighting('ae/t-1/3', full);
  assert.equal(t.id, 'ae/t-1/3');
  assert.equal(t.contextId, 'native-7', "its context is the harness's id for the conversation");
  assert.equal(t.status!.state, TaskState.TASK_STATE_INPUT_REQUIRED);
  assert.deepEqual(sightingOf(t), full);
  assert.deepEqual(t.artifacts, [closeoutArtifact(full.closeout!.payload, full.closeout!.at)], 'what it closed with is its Artifact');
  assert.deepEqual(closeoutOf(overTheWire(t)), full.closeout!.payload);
  assert.deepEqual(overTheWire(t.metadata), t.metadata, 'nothing in a sighting changes shape as JSON');
  assert.deepEqual(sightingOf({ ...t, metadata: overTheWire(t.metadata) }), full);
  const none: Sighting = { ...full, skills: [] };
  assert.deepEqual(
    sightingOf({ ...t, metadata: overTheWire(taskOfSighting('ae/t-1/3', none).metadata) }),
    none,
    'no skill loaded is said too',
  );
  for (const state of SESSION_STATES) {
    const bare = taskOfSighting('ae/t-1/3', { sessionId: 's', state });
    assert.deepEqual(sightingOf(bare), { sessionId: 's', state });
    assert.deepEqual([bare.contextId, bare.artifacts], ['', []], 'no id seen yet is no context, and no closeout no Artifact');
  }
});

test("attempts that continued one conversation share a context: the harness's id, not the runtime's task", () => {
  const first = taskOfSighting('ae/t-1/1', { sessionId: 'job-1', state: 'completed', nativeId: 'conv-a' });
  const again = taskOfSighting('ae/t-1/2', { sessionId: 'job-2', state: 'working', nativeId: 'conv-a' });
  const other = taskOfSighting('ae/t-1/3', { sessionId: 'job-3', state: 'working', nativeId: 'conv-b' });
  assert.deepEqual(
    [first.contextId, again.contextId, other.contextId],
    ['conv-a', 'conv-a', 'conv-b'],
    "a job resumed keeps its session's id: two attempts, one context; another task's session another",
  );
});

test('a closeout is an Artifact of one part: data for a value, text/plain for prose, its time in metadata when known', () => {
  const said = { outcome: 'done', notes: ['a', 'b'] };
  assert.deepEqual(closeoutArtifact(said, 1790000000000), {
    artifactId: 'closeout',
    name: 'closeout',
    description: '',
    parts: [{ content: { $case: 'data', value: said }, metadata: undefined, filename: '', mediaType: '' }],
    metadata: { at: 1790000000000 },
    extensions: [],
  });
  assert.deepEqual(closeoutArtifact('Done: the tests pass.').parts, [
    { content: { $case: 'text', value: 'Done: the tests pass.' }, metadata: undefined, filename: '', mediaType: 'text/plain' },
  ]);
  assert.equal(closeoutArtifact('x').metadata, undefined, 'no time given, none said');
  for (const payload of [said, 'prose', 7, ['a', 1], true, null, '']) {
    const t = taskOfAttempt('ae/t-1/1', { ...ended, closeout: payload }, 'm');
    assert.equal(t.artifacts.length, 1, JSON.stringify(payload));
    assert.deepEqual(closeoutOf(overTheWire(t)), payload, JSON.stringify(payload));
  }
  assert.deepEqual(taskOfAttempt('ae/t-1/1', ended, 'm').artifacts, [], 'an attempt that said nothing has no Artifact');
  assert.equal(closeoutOf(taskOfAttempt('ae/t-1/1', ended, 'm')), undefined);
  const unstated = overTheWire(taskOfAttempt('ae/t-1/1', { ...ended, stated: false }, 'm'));
  assert.deepEqual(
    [unstated.status!.state, unstated.artifacts, (unstated.metadata as { attempt: Attempt }).attempt.stated],
    [TaskState.TASK_STATE_COMPLETED, [], false],
    "an end without the statement its task asked for is the harness's end, and says so beside it: COMPLETED, no Artifact, and `stated: false` on the attempt it carries, for the layer above to judge",
  );
});

test("a Task whose state is not its sighting's carries no sighting", () => {
  const t = taskOfSighting('ae/t-1/3', full);
  assert.equal(sightingOf({ ...t, status: { ...t.status!, state: TaskState.TASK_STATE_WORKING } }), undefined);
  assert.equal(sightingOf(startedTask('ae/t-1/3', messageOf({ name: 'ae/t-1/3', brief: 'b', cwd: '/r' }, 'm'))), undefined);
});

/** An attempt that ended done, signed by nothing, its session's id recorded. */
const ended: Attempt = {
  n: 1,
  startedAt: '2026-09-23T10:00:00.000Z',
  spawnedAt: '2026-09-23T10:00:01.000Z',
  ended: 'done',
  endedAt: '2026-09-23T10:05:00.000Z',
  reason: 'harness',
  nativeId: 'conv-a',
  usage: null,
  exitCode: 0,
};

const request: SpawnRequest = {
  name: 'ae/t-1/2',
  brief: 'write the words down\n\nand then stop.',
  cwd: '/repo',
  harness: 'fake',
  config: {
    model: 'opus',
    permissionMode: 'dontAsk',
    tools: ['Read', 'Edit'],
    mcp: { web: { command: 'npx', args: ['web'] } },
    budgetUsd: 2.5,
  },
  resumeFrom: 'native-1',
  restartPolicy: 'Always',
  closeoutSchema: { type: 'object', required: ['outcome'] },
  resource: { team: 'a', task: 't-1' },
  traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
};

test('a spawn is a user Message: the name its task, the brief its one text part, the session it continues its context, the rest its metadata', () => {
  const m = messageOf(request, 'm-1');
  assert.deepEqual(m, {
    messageId: 'm-1',
    contextId: 'native-1',
    taskId: 'ae/t-1/2',
    role: Role.ROLE_USER,
    parts: [
      { content: { $case: 'text', value: 'write the words down\n\nand then stop.' }, metadata: undefined, filename: '', mediaType: '' },
    ],
    metadata: {
      cwd: '/repo',
      harness: 'fake',
      config: request.config,
      restartPolicy: 'Always',
      closeoutSchema: request.closeoutSchema,
      resource: request.resource,
      traceparent: request.traceparent,
    },
    extensions: [RUNTIME_EXTENSION],
    referenceTaskIds: [],
  });
  assert.equal(m.metadata.config, request.config, 'config is carried whole, never opened');
  assert.equal(messageRefusal(m), undefined);
  assert.deepEqual(spawnOf(m), request);
  assert.deepEqual(spawnOf(overTheWire(m)), request);
});

test('words said to a session are a user Message on its Task: one text part, no mark, nothing else', () => {
  const m = followUpOf('ae/t-1/2', 'look again\n\nat the tests', 'm-2');
  assert.deepEqual(m, {
    messageId: 'm-2',
    contextId: '',
    taskId: 'ae/t-1/2',
    role: Role.ROLE_USER,
    parts: [{ content: { $case: 'text', value: 'look again\n\nat the tests' }, metadata: undefined, filename: '', mediaType: '' }],
    metadata: undefined,
    extensions: [],
    referenceTaskIds: [],
  });
  assert.equal(followUpRefusal(m), undefined);
  assert.equal(followUpText(m), 'look again\n\nat the tests');
  assert.equal(followUpText(overTheWire(m)), 'look again\n\nat the tests');
  assert.equal(
    messageRefusal(m),
    "the message's metadata has no `cwd`: say where the session works.",
    'not a spawn: no cwd, and no mark to be read as one',
  );
});

test('a spawn with its optional keys unset comes back with every key, as the engine asks for one', () => {
  const m = messageOf({ name: 'ae/t-1/1', brief: 'b', cwd: '/r' }, 'm-2');
  assert.deepEqual(m.metadata, { cwd: '/r' }, 'no undefined in metadata');
  assert.equal(m.contextId, '', 'a spawn that starts cold continues no context');
  assert.deepEqual(spawnOf(overTheWire(m)), {
    name: 'ae/t-1/1',
    brief: 'b',
    cwd: '/r',
    harness: undefined,
    config: undefined,
    restartPolicy: undefined,
    closeoutSchema: undefined,
    resumeFrom: undefined,
    resource: undefined,
    traceparent: undefined,
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

test('an attempt the harness no longer lists is answered from the journal; an end word no runtime records, as an older journal may carry, is an end, not a success', () => {
  const attempt: Attempt = {
    n: 1,
    startedAt: '2026-09-23T10:00:00.000Z',
    spawnedAt: null,
    ended: null,
    endedAt: null,
    reason: null,
    nativeId: null,
    usage: null,
    exitCode: null,
  };
  const cases: Array<[Partial<Attempt>, TaskState]> = [
    [{}, TaskState.TASK_STATE_SUBMITTED],
    [{ spawnedAt: '2026-09-23T10:00:01.000Z' }, TaskState.TASK_STATE_SUBMITTED],
    [{ ended: 'failed', reason: 'unstartable', error: 'fake: no binary' }, TaskState.TASK_STATE_REJECTED],
    [{ ended: 'done', reason: 'harness' }, TaskState.TASK_STATE_COMPLETED],
    [{ ended: 'stopped', reason: 'operator' }, TaskState.TASK_STATE_CANCELED],
    [{ ended: 'failed', reason: 'harness' }, TaskState.TASK_STATE_FAILED],
    [{ ended: 'working' as Ended, reason: 'lost' }, TaskState.TASK_STATE_FAILED],
    [{ ended: 'stopped', reason: 'deadline' }, TaskState.TASK_STATE_CANCELED],
  ];
  for (const [change, state] of cases) {
    const t = taskOfAttempt('ae/t-1/1', { ...attempt, ...change }, 'm');
    assert.equal(t.status!.state, state, JSON.stringify(change));
    assert.equal((t.metadata!.attempt as Attempt).reason, change.reason ?? null);
    assert.deepEqual(overTheWire(t.metadata), t.metadata);
  }
  assert.equal(wordsOf(taskOfAttempt('ae/t-1/1', { ...attempt, ...cases[2][0] }, 'm')), 'fake: no binary');
  assert.equal(taskOfAttempt('ae/t-1/1', attempt, 'm').contextId, '', 'no id recorded is no context');
  assert.equal(taskOfAttempt('ae/t-1/1', ended, 'm').contextId, 'conv-a');
});

test('an attempt that signed while its task waits on a person is INPUT_REQUIRED, its closeout still its Artifact; only a done one is', () => {
  const signed = { ...ended, closeout: { outcome: 'done' } };
  const waiting = taskOfAttempt('ae/t-1/1', signed, 'm', true);
  assert.equal(waiting.status!.state, TaskState.TASK_STATE_INPUT_REQUIRED);
  assert.deepEqual(closeoutOf(waiting), { outcome: 'done' });
  assert.equal(taskOfAttempt('ae/t-1/1', signed, 'm').status!.state, TaskState.TASK_STATE_COMPLETED);
  assert.equal(taskOfAttempt('ae/t-1/1', { ...signed, ended: 'failed' }, 'm', true).status!.state, TaskState.TASK_STATE_FAILED);
});

test("REFUSED: words sent in a context that is not their session's", () => {
  const s: Sighting = { sessionId: 's-1', state: 'working', nativeId: 'conv-a' };
  assert.equal(contextRefusal('ae/t-1/1', '', s), undefined);
  assert.equal(contextRefusal('ae/t-1/1', 'conv-a', s), undefined);
  assert.equal(
    contextRefusal('ae/t-1/1', 'conv-b', s),
    "the message's contextId `conv-b` is not the context of session `ae/t-1/1`, `conv-a`: send that, or none.",
  );
  assert.equal(
    contextRefusal('ae/t-1/1', 't-1', { sessionId: 's-1', state: 'working' }),
    "the message's contextId `t-1` is not the context of session `ae/t-1/1`, which has none known yet: send none.",
  );
});

/**
 * A driver a test moves by hand, what it was asked, and the same driver behind the A2A client. Each verb answers its value,
 * or fails as `o.fails` says: a `RunnerError` in its words, anything else a defect.
 */
const driven = (o: { spawnFails?: unknown; stopFails?: string; observeFails?: string; fails?: unknown; bare?: boolean } = {}) => {
  const sessions = new Map<string, Sighting>();
  const unread = new Set<string>();
  const asked: Array<[string, unknown]> = [];
  let n = 0;
  const ops: RunnerOps = {
    spawn: (r: SpawnRequest) =>
      Effect.suspend(() => {
        asked.push(['spawn', r]);
        if (o.spawnFails instanceof RunnerError) return Effect.fail(o.spawnFails);
        if (o.spawnFails) return Effect.die(o.spawnFails);
        sessions.set(r.name, { sessionId: `s-${++n}`, state: 'working', busy: true });
        return Effect.void;
      }),
    observe: Effect.suspend(() => {
      asked.push(['observe', undefined]);
      return o.observeFails
        ? Effect.fail(new RunnerError({ verb: 'observe', message: o.observeFails }))
        : Effect.succeed(new Map(sessions));
    }),
    stop: (id) =>
      Effect.suspend(() => {
        asked.push(['stop', id]);
        if (o.stopFails) return Effect.fail(new RunnerError({ verb: 'stop', message: o.stopFails }));
        for (const [name, s] of sessions) if (s.sessionId === id) sessions.set(name, { ...s, state: 'canceled', busy: false });
        return Effect.void;
      }),
    logs: (id) => answer('logs', id, `logs of ${id}`),
    transcript: (id, after) => answer('transcript', [id, after], { events: [conversed(id)], cursor: `${id}@${after ?? 0}+1` }),
    refuses: () => undefined,
    ...(o.bare
      ? {}
      : {
          find: (name: string) => answer('find', name, sessions.get(name) && { sessionId: sessions.get(name)!.sessionId }),
          release: (session: Sighting, task: { worktree?: string | boolean }) =>
            answer('release', [session, task], session.state === 'completed' ? { turns: 2, costUsd: 0.5 } : undefined),
          say: (session: { name: string; sessionId: string }, text: string) => answer('say', [session, text], undefined),
          quota: answer('quota', undefined, { kind: 'unanswered' as const, subscription: 'max' }),
          /** Told what is expected, the sessions it names alone. */
          observeFor: (expected: readonly ExpectedSession[]) =>
            answer('observeFor', expected, {
              seen: new Map([...sessions].filter(([name]) => expected.some((e) => e.name === name))),
              /** A name it was told to leave unread, as a driver whose registry could not be read leaves one. */
              unread: new Set(expected.map((e) => e.name).filter((name) => unread.has(name))),
            }),
        }),
  };
  function answer<A>(verb: string, args: unknown, value: A): Effect.Effect<A, RunnerError> {
    return Effect.suspend(() => {
      asked.push([verb, args]);
      if (o.fails instanceof RunnerError) return Effect.fail(o.fails);
      if (o.fails) return Effect.die(o.fails);
      return Effect.succeed(value);
    });
  }
  const runner = a2aOps('fake', ops, async () => []);
  return { ops, runner, sessions, unread, asked, acted: () => asked.filter(([verb]) => verb !== 'observe') };
};

/** A line of a session's conversation, as a driver reads it. */
const conversed = (sessionId: string) => ({
  id: `${sessionId}-e1`,
  at: '2026-09-23T10:00:00.000Z',
  role: 'assistant' as const,
  kind: 'tool_use' as const,
  tool: { name: 'Read', input: { file_path: '/repo/a.ts' } },
});

/** The error an effect failed with, or a failure of the test when it succeeded. */
const failure = <A>(e: Effect.Effect<A, RunnerError>) => Effect.runPromise(Effect.flip(e));

test('a spawn through the client reaches the driver as the engine asked for it, every key, config whole', async () => {
  const d = driven();
  await Effect.runPromise(d.runner.spawn(request));
  assert.deepEqual(d.acted(), [['spawn', request]]);
  const bare: SpawnRequest = {
    name: 'ae/t-2/1',
    brief: 'b',
    cwd: '/r',
    harness: undefined,
    config: undefined,
    restartPolicy: undefined,
    closeoutSchema: undefined,
    resumeFrom: undefined,
    resource: undefined,
    traceparent: undefined,
  };
  await Effect.runPromise(d.runner.spawn(bare));
  assert.deepEqual(d.acted()[1], ['spawn', bare]);
  assert.deepEqual(
    Object.keys(d.acted()[1][1] as object).sort(),
    Object.keys(bare).sort(),
    "the engine's spawn has every key, some undefined: the driver is handed the same keys back",
  );
});

test("a refused spawn is the harness's refusal, in its words, `refused`", async () => {
  const d = driven({ spawnFails: new RunnerError({ verb: 'spawn', message: 'fake: no binary called `fake` on PATH', refused: true }) });
  const e = await failure(d.runner.spawn(request));
  assert.ok(e instanceof RunnerError);
  assert.deepEqual(
    { verb: e.verb, message: e.message, refused: e.refused },
    {
      verb: 'spawn',
      message: 'fake: no binary called `fake` on PATH',
      refused: true,
    },
  );
});

test('a spawn that may have started is not `refused`, and keeps its words', async () => {
  const d = driven({ spawnFails: new RunnerError({ verb: 'spawn', message: 'fake: the launcher lost its acknowledgement' }) });
  const e = await failure(d.runner.spawn(request));
  assert.deepEqual(
    { verb: e.verb, message: e.message, refused: e.refused },
    {
      verb: 'spawn',
      message: 'fake: the launcher lost its acknowledgement',
      refused: undefined,
    },
  );
  assert.equal('refused' in e && e.refused !== undefined, false, 'an ambiguous spawn carries no `refused` at all');
});

test("a driver's defect passes through the client as the same defect", async () => {
  const boom = new TypeError('the driver fell over');
  const d = driven({ spawnFails: boom });
  await assert.rejects(Effect.runPromise(d.runner.spawn(request)), (e) => e === boom);
});

test("a spawn the seam refuses reaches no driver, and says why in A2A's words", async () => {
  const d = driven();
  const e = await failure(d.runner.spawn({ ...request, name: 'not-a-session' }));
  assert.deepEqual(
    { verb: e.verb, message: e.message, refused: e.refused },
    {
      verb: 'spawn',
      message: '`not-a-session` is not a session name: a session is named `ae/<task>/<n>`, n from 1.',
      refused: undefined,
    },
  );
  assert.deepEqual(d.acted(), []);
});

test("observe through the client is the driver's map, every page of it, from one observe", async () => {
  const d = driven();
  for (let i = 1; i <= 250; i++) {
    d.sessions.set(`ae/t-${String(i).padStart(3, '0')}/1`, {
      sessionId: `s-${i}`,
      state: i % 5 === 0 ? 'completed' : 'working',
      busy: i % 2 === 0,
    });
  }
  d.sessions.set('ae/t-001/2', full);
  const seen = await Effect.runPromise(d.runner.observe);
  assert.deepEqual(seen, d.sessions);
  assert.equal(d.asked.filter(([verb]) => verb === 'observe').length, 1, 'the pages after the first are served from its listing');
});

test('two observes at once over more than a page each read the whole map: a listing made since does not end one being paged', async () => {
  const d = driven();
  for (let i = 1; i <= 250; i++) d.sessions.set(`ae/t-${String(i).padStart(3, '0')}/1`, { sessionId: `s-${i}`, state: 'working' });
  let release!: () => void;
  const both = new Promise<void>((r) => {
    release = r;
  });
  let pending = 0;
  const gated = a2aOps(
    'fake',
    {
      ...d.ops,
      observe: Effect.promise(async () => {
        if (++pending === 2) release();
        await both;
        return new Map(d.sessions);
      }),
    },
    async () => [],
  );
  const [one, two] = await Effect.runPromise(Effect.all([gated.observe, gated.observe], { concurrency: 'unbounded' }));
  assert.equal(pending, 2, 'the driver was observed once a listing');
  assert.deepEqual(one, d.sessions);
  assert.deepEqual(two, d.sessions);
});

test("an observe that failed is the harness's words", async () => {
  const d = driven({ observeFails: 'fake: `fake ls` exited 3' });
  const e = await failure(d.runner.observe);
  assert.deepEqual({ verb: e.verb, message: e.message }, { verb: 'observe', message: 'fake: `fake ls` exited 3' });
});

test('a stop through the client reaches the driver by session id', async () => {
  const d = driven();
  await Effect.runPromise(d.runner.spawn(request));
  await Effect.runPromise(d.runner.observe);
  await Effect.runPromise(d.runner.stop('s-1'));
  assert.deepEqual(d.acted().at(-1), ['stop', 's-1']);
  assert.equal(d.sessions.get(request.name)!.state, 'canceled');
});

test('a stop with no listing yet lists first, and stops', async () => {
  const d = driven();
  d.sessions.set('ae/t-1/1', { sessionId: 's-9', state: 'input-required' });
  await Effect.runPromise(d.runner.stop('s-9'));
  assert.deepEqual(d.acted(), [['stop', 's-9']]);
});

test("a stop the driver failed is the driver's words", async () => {
  const d = driven({ stopFails: 'fake: `fake stop s-1` exited 1' });
  await Effect.runPromise(d.runner.spawn(request));
  const e = await failure(d.runner.stop('s-1'));
  assert.deepEqual({ verb: e.verb, message: e.message }, { verb: 'stop', message: 'fake: `fake stop s-1` exited 1' });
});

test('a stop of a session no harness lists is refused in words, and the driver is asked nothing', async () => {
  const d = driven();
  const e = await failure(d.runner.stop('s-404'));
  assert.deepEqual(
    { verb: e.verb, message: e.message },
    {
      verb: 'stop',
      message: 'the `fake` harness lists no session `s-404`: there is nothing to stop.',
    },
  );
  assert.deepEqual(d.acted(), []);
});

test('a stop of a session that ended since the listing does nothing, as a driver did', async () => {
  const d = driven();
  await Effect.runPromise(d.runner.spawn(request));
  await Effect.runPromise(d.runner.observe);
  d.sessions.set(request.name, { sessionId: 's-1', state: 'completed' });
  await Effect.runPromise(d.runner.stop('s-1'));
  assert.deepEqual(d.acted(), [['spawn', request]]);
});

test('every verb goes through the seam, the transcript by name too; refuses alone reaches the driver directly', () => {
  const d = driven();
  for (const verb of ['spawn', 'observe', 'stop', 'find', 'logs', 'release', 'say', 'transcript', 'observeFor', 'quota'] as const) {
    assert.ok(d.runner[verb], `${verb} is offered`);
    assert.notEqual(d.runner[verb], d.ops[verb], `${verb} is the seam's, not the driver's`);
  }
  assert.ok(d.runner.transcriptOf, 'the transcript is offered by name too');
  assert.equal(d.runner.refuses, d.ops.refuses, 'refuses judges a task before any session: no call to make');
  assert.deepEqual(
    Object.keys(d.runner).sort(),
    [...Object.keys(d.ops), 'transcriptOf'].sort(),
    "none of the driver's verbs dropped, and one added: the transcript by name",
  );
});

test('REFUSED: a verb the driver lacks is not offered through the seam, since the card does not list it', () => {
  const d = driven({ bare: true });
  assert.deepEqual(Object.keys(d.runner).sort(), ['logs', 'observe', 'refuses', 'spawn', 'stop', 'transcript', 'transcriptOf']);
  const none = a2aOps('fake', { spawn: d.ops.spawn, observe: d.ops.observe, stop: d.ops.stop, logs: d.ops.logs }, async () => []);
  assert.deepEqual(Object.keys(none).sort(), ['logs', 'observe', 'spawn', 'stop']);
});

test("the quota through the seam is the driver's answer, verbatim, and the driver is asked once", async () => {
  const d = driven();
  assert.deepEqual(await Effect.runPromise(d.runner.quota!), { kind: 'unanswered', subscription: 'max' });
  assert.deepEqual(d.acted(), [['quota', undefined]]);
});

test("observeFor through the seam is the driver's, told what the engine expects, and stop learns its sessions from it", async () => {
  const d = driven();
  d.sessions.set('ae/t-1/1', { sessionId: 's-1', state: 'working', busy: true });
  d.sessions.set('ae/t-2/1', full);
  const expected = [{ name: 'ae/t-2/1', harness: 'fake' }];
  const seen = await Effect.runPromise(d.runner.observeFor!(expected));
  assert.deepEqual(seen, { seen: new Map([['ae/t-2/1', full]]), unread: new Set() }, 'every key of the sighting, over the wire');
  assert.deepEqual(d.asked, [['observeFor', expected]], 'the driver told, and never asked to list in full');
  await Effect.runPromise(d.runner.stop(full.sessionId));
  assert.deepEqual(d.acted().at(-1), ['stop', full.sessionId], 'a session it listed is stopped with no listing first');
});

test('observeFor through the seam carries the names the driver could not read', async () => {
  const d = driven();
  d.sessions.set('ae/t-1/1', { sessionId: 's-1', state: 'working', busy: true });
  d.unread.add('ae/t-2/1');
  const expected = [
    { name: 'ae/t-1/1', harness: 'fake' },
    { name: 'ae/t-2/1', harness: 'fake' },
  ];
  const o = await Effect.runPromise(d.runner.observeFor!(expected));
  assert.deepEqual([...o.seen.keys()], ['ae/t-1/1']);
  assert.deepEqual(o.unread, new Set(['ae/t-2/1']), 'an unread name crosses the seam as unread, not as a session gone');
});

test("find, logs and release through the seam answer as the driver does, and the driver is asked with the engine's keys", async () => {
  const d = driven();
  await Effect.runPromise(d.runner.spawn(request));
  assert.deepEqual(await Effect.runPromise(d.runner.find!(request.name)), { sessionId: 's-1' });
  assert.equal(await Effect.runPromise(d.runner.find!('ae/t-9/1')), undefined, 'none found is undefined, as a driver says it');
  assert.equal(await Effect.runPromise(d.runner.logs('s-1')), 'logs of s-1');
  const done: Sighting = { ...full, state: 'completed' };
  assert.deepEqual(await Effect.runPromise(d.runner.release!(done, { worktree: '/w/t-1' })), { turns: 2, costUsd: 0.5 });
  assert.equal(await Effect.runPromise(d.runner.release!({ sessionId: 's-2', state: 'canceled' }, {})), undefined);
  assert.deepEqual(d.acted().slice(1), [
    ['find', request.name],
    ['find', 'ae/t-9/1'],
    ['logs', 's-1'],
    ['release', [done, { worktree: '/w/t-1' }]],
    ['release', [{ sessionId: 's-2', state: 'canceled' }, {}]],
  ]);
  assert.equal(d.asked.filter(([v]) => v === 'observe').length, 0, 'none of them lists the harness');
});

test("a transcript through the seam is the driver's read, verbatim: the session found by its name, the cursor handed on", async () => {
  const d = driven();
  d.sessions.set('ae/t-1/1', { sessionId: 's-7', state: 'working' });
  assert.deepEqual(await Effect.runPromise(d.runner.transcriptOf!('ae/t-1/1', 's-7@4+1')), {
    events: [conversed('s-7')],
    cursor: 's-7@s-7@4+1+1',
  });
  assert.deepEqual(await Effect.runPromise(d.runner.transcriptOf!('ae/t-1/1')), { events: [conversed('s-7')], cursor: 's-7@0+1' });
  assert.deepEqual(d.acted(), [
    ['find', 'ae/t-1/1'],
    ['transcript', ['s-7', 's-7@4+1']],
    ['find', 'ae/t-1/1'],
    ['transcript', ['s-7', undefined]],
  ]);
  assert.equal(d.asked.filter(([v]) => v === 'observe').length, 0, 'found by name, so no listing');
  assert.equal(await Effect.runPromise(d.runner.transcriptOf!('ae/t-9/1')), null, 'no session under the name yet: none');
  assert.equal(d.acted().filter(([v]) => v === 'transcript').length, 2, 'and nothing read');
});

test('REFUSED: a transcript through the seam of a name that is no session is refused in words, and the driver is not asked', async () => {
  const d = driven();
  const e = await failure(d.runner.transcriptOf!('t-1'));
  assert.deepEqual(
    { verb: e.verb, message: e.message },
    {
      verb: 'transcript',
      message: '`t-1` is not a session name: a session is named `ae/<task>/<n>`, n from 1.',
    },
  );
  assert.deepEqual(d.asked, []);
});

test("a transcript by id through the seam is the driver's read of that session, verbatim, with nothing looked up", async () => {
  const d = driven();
  d.sessions.set('ae/t-1/1', { sessionId: 's-7', state: 'working' });
  assert.deepEqual(await Effect.runPromise(d.runner.transcript!('s-3', 'c-2')), { events: [conversed('s-3')], cursor: 's-3@c-2+1' });
  assert.deepEqual(d.asked, [['transcript', ['s-3', 'c-2']]], 'no find, no listing: the caller named the session');
});

test('REFUSED: a transcript through the seam by an empty id is refused in words, and the driver is not asked', async () => {
  const d = driven();
  const e = await failure(d.runner.transcript!(''));
  assert.deepEqual(
    { verb: e.verb, message: e.message },
    {
      verb: 'transcript',
      message: 'the request names no session: send the id its harness lists it under as `sessionId`, or its name as `name`.',
    },
  );
  assert.deepEqual(d.asked, []);
});

test('say through the seam reaches the driver with the name and the id its harness lists, once', async () => {
  const d = driven();
  await Effect.runPromise(d.runner.spawn(request));
  await Effect.runPromise(d.runner.say!({ name: request.name, sessionId: 's-1' }, 'look again'));
  d.sessions.set(request.name, { sessionId: 's-1', state: 'input-required', waitingFor: 'permission prompt' });
  await Effect.runPromise(d.runner.say!({ name: request.name, sessionId: 's-1' }, 'and again'));
  assert.deepEqual(d.acted().slice(1), [
    ['say', [{ name: request.name, sessionId: 's-1' }, 'look again']],
    ['say', [{ name: request.name, sessionId: 's-1' }, 'and again']],
  ]);
});

test("a driver's words through find, logs, release, say and transcript come back verbatim, under the verb that failed", async () => {
  const words = 'fake: registry unreachable (exit 7)';
  const d = driven({ fails: new RunnerError({ verb: 'whatever', message: words }) });
  d.sessions.set(request.name, { sessionId: 's-1', state: 'working' });
  const cases: Array<[string, Effect.Effect<unknown, RunnerError>]> = [
    ['find', d.runner.find!(request.name)],
    ['logs', d.runner.logs('s-1')],
    ['release', d.runner.release!({ sessionId: 's-1', state: 'completed' }, {})],
    ['say', d.runner.say!({ name: request.name, sessionId: 's-1' }, 'hi')],
    ['transcript', d.runner.transcriptOf!(request.name)],
    ['transcript', d.runner.transcript!('s-1')],
  ];
  for (const [verb, e] of cases) {
    const f = await failure(e);
    assert.ok(f instanceof RunnerError);
    assert.deepEqual({ verb: f.verb, message: f.message, refused: f.refused }, { verb, message: words, refused: undefined }, verb);
  }
});

test("a driver's defect through find, logs, release, say and transcript is the same defect", async () => {
  const boom = new TypeError('the driver fell over');
  const d = driven({ fails: boom });
  d.sessions.set(request.name, { sessionId: 's-1', state: 'working' });
  for (const e of [
    d.runner.find!(request.name),
    d.runner.logs('s-1'),
    d.runner.release!({ sessionId: 's-1', state: 'completed' }, {}),
    d.runner.say!({ name: request.name, sessionId: 's-1' }, 'hi'),
    d.runner.transcriptOf!(request.name),
    d.runner.transcript!('s-1'),
  ]) {
    await assert.rejects(Effect.runPromise(e), (x) => x === boom);
  }
});

test('REFUSED: say through the seam to a session that has ended is refused in words, and the driver is not asked', async () => {
  const d = driven();
  d.sessions.set(request.name, { sessionId: 's-1', state: 'completed' });
  const e = await failure(d.runner.say!({ name: request.name, sessionId: 's-1' }, 'hi'));
  assert.deepEqual(
    { verb: e.verb, message: e.message },
    { verb: 'say', message: 'session `ae/t-1/2` has ended (done): it takes no more words.' },
  );
  const gone = await failure(d.runner.say!({ name: 'ae/t-9/1', sessionId: 's-9' }, 'hi'));
  assert.deepEqual(
    { verb: gone.verb, message: gone.message },
    { verb: 'say', message: 'no session `ae/t-9/1` for the `fake` harness to hear anything: it lists none.' },
  );
  assert.deepEqual(d.acted(), []);
});

test('the in-process transport maps the three names the handler spells otherwise, and refuses what the agent does not do', async () => {
  const d = driven();
  const t = new InProcessTransport(new HarnessHandler('fake', d.ops, async () => []));
  assert.equal(t.protocolName, 'in-process');
  assert.equal(t.protocolVersion, A2A_PROTOCOL_VERSION);
  await assert.rejects(
    t.getExtendedAgentCard({ tenant: '' }),
    (e) =>
      e instanceof ExtendedAgentCardNotConfiguredError &&
      e.message === 'the `fake` harness has no extended card: its card is the whole of it.',
  );
  await assert.rejects(
    t.listTaskPushNotificationConfig({ tenant: '', taskId: 'ae/t-1/1', pageSize: 0, pageToken: '' }),
    (e) => e instanceof PushNotificationNotSupportedError && e.message === 'the `fake` harness sends no notifications: poll getTask.',
  );
  const drain = async (g: AsyncGenerator) => {
    for await (const _ of g) {
    }
  };
  await assert.rejects(
    drain(t.resubscribeTask({ tenant: '', id: 'ae/t-1/1' })),
    (e) => e instanceof UnsupportedOperationError && e.message === 'this agent does not stream: poll getTask.',
  );
  await assert.rejects(
    drain(t.sendMessageStream({ tenant: '', message: undefined, configuration: undefined, metadata: undefined })),
    (e) =>
      e instanceof UnsupportedOperationError &&
      e.message === 'this agent does not stream: send the message with returnImmediately and poll getTask.',
  );
  assert.deepEqual(d.asked, []);
});

test('the Effect door takes the same seam: a2aRunner spawns, stops and settles through the client, off the Journal it is given', async () => {
  const sessions = new Map<string, Sighting>();
  const spawned: SpawnRequest[] = [];
  const layer = a2aRunner(testOps({ sessions, spawned }), 'fake').pipe(Layer.provideMerge(Journal.test()));
  const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.runPromise(e.pipe(Effect.provide(layer)));

  const id = await run(file({ brief: 'do the thing', cwd: '/repo' }));
  await run(tick());
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].name, `ae/${id}/1`);
  assert.equal(sessions.get(`ae/${id}/1`)!.state, 'working');

  await run(requestStop(id));
  await run(tick());
  assert.equal(sessions.get(`ae/${id}/1`)!.state, 'canceled', 'the stop reached the driver through cancelTask');

  const e = await run(Effect.flatMap(Runner, (r) => Effect.flip(r.stop('fake-404'))));
  assert.equal(
    e.message,
    'the `fake` harness lists no session `fake-404`: there is nothing to stop.',
    'only the seam answers this: a driver reached directly is handed any id, and testOps does nothing with one it lacks',
  );

  const refusal = await run(
    Effect.flatMap(Runner, (r) => Effect.sync(() => r.refuses?.({ brief: 'b', cwd: '/r', config: { model: '' } }))),
  );
  assert.equal(
    refusal,
    "`model` is empty. Leave it out for the harness's default.",
    'what no harness could use is refused beneath it, as through `Runner.layer`',
  );
});

test("the Effect door keeps the transcript: a2aRunner's Runner reads it through the seam, and a driver without one has none", async () => {
  const d = driven();
  const run = <A, E>(ops: RunnerOps, e: Effect.Effect<A, E, Runner>) =>
    Effect.runPromise(e.pipe(Effect.provide(a2aRunner(ops, 'fake').pipe(Layer.provideMerge(Journal.test())))));
  const read = await run(
    d.ops,
    Effect.flatMap(Runner, (r) => (r.transcript ? r.transcript('s-4', 'c-1') : Effect.succeed<unknown>('dropped'))),
  );
  assert.deepEqual(read, { events: [conversed('s-4')], cursor: 's-4@c-1+1' }, "Runner.transcript is the driver's read");
  assert.deepEqual(d.asked, [['transcript', ['s-4', 'c-1']]]);
  const e = await run(
    d.ops,
    Effect.flatMap(Runner, (r) => Effect.flip(r.transcript!(''))),
  );
  assert.equal(
    e.message,
    'the request names no session: send the id its harness lists it under as `sessionId`, or its name as `name`.',
    'only the seam answers this: a driver reached directly would be handed the empty id',
  );
  assert.equal(d.asked.length, 1);
  const bare = { spawn: d.ops.spawn, observe: d.ops.observe, stop: d.ops.stop, logs: d.ops.logs };
  assert.equal(
    await run(
      bare,
      Effect.map(Runner, (r) => r.transcript),
    ),
    undefined,
    'a driver that keeps no conversation: its card lists no sessionTranscript, and Runner has no transcript',
  );
});

test("observeFor through the seam carries what a failed part of the driver's look said, and says nothing once every part reads", async () => {
  let why: string[] = ['the registry is busy'];
  const ops: RunnerOps = {
    ...testOps({ sessions: new Map() }),
    observeFor: (expected) =>
      Effect.sync(() => ({ seen: new Map(), unread: new Set(expected.map((e) => e.name)), ...(why.length ? { why } : {}) })),
  };
  const runner = a2aOps('fake', ops, async () => []);
  const expected = [{ name: 'ae/t-1/1', harness: 'fake' }];
  const failed = await Effect.runPromise(runner.observeFor!(expected));
  assert.deepEqual(failed.why, ['the registry is busy']);
  assert.deepEqual(failed.unread, new Set(['ae/t-1/1']));
  why = [];
  assert.equal(Object.hasOwn(await Effect.runPromise(runner.observeFor!(expected)), 'why'), false);
});

test('observeFor through the seam carries why the driver left one session alone unread, by its name, and none once the driver reads it', async () => {
  let unreadWhy: Map<string, string> | undefined = new Map([['ae/t-1/1', "claude --bg: `ae/t-1/1`'s transcript cannot be read"]]);
  const ops: RunnerOps = {
    ...testOps({ sessions: new Map() }),
    observeFor: (expected) =>
      Effect.sync(() => ({
        seen: new Map(),
        unread: new Set(unreadWhy ? expected.map((e) => e.name) : []),
        ...(unreadWhy ? { unreadWhy } : {}),
      })),
  };
  const handler = new HarnessHandler('fake', ops, async () => []);
  const expected = [
    { name: 'ae/t-1/1', harness: 'fake' },
    { name: 'ae/t-2/1', harness: 'fake' },
  ];
  const answered = await handler.observeSessions({ expected }, new ServerCallContext());
  assert.deepEqual(answered.unreadWhy, { 'ae/t-1/1': "claude --bg: `ae/t-1/1`'s transcript cannot be read" }, 'answered as an object');

  const runner = a2aOps('fake', ops, async () => []);
  const unread = await Effect.runPromise(runner.observeFor!(expected));
  assert.deepEqual(unread.unreadWhy, new Map([['ae/t-1/1', "claude --bg: `ae/t-1/1`'s transcript cannot be read"]]), 'and a Map again');
  unreadWhy = undefined;
  assert.equal(Object.hasOwn(await Effect.runPromise(runner.observeFor!(expected)), 'unreadWhy'), false, 'read: no words');
});

test('REFUSED: observeFor through the seam keeps only words that are a string, for a name the driver left unread, and an answer without them is none', async (t) => {
  const ops: RunnerOps = {
    ...testOps({ sessions: new Map() }),
    observeFor: (expected) => Effect.sync(() => ({ seen: new Map(), unread: new Set(expected.map((e) => e.name)) })),
  };
  const expected = [
    { name: 'ae/t-1/1', harness: 'fake' },
    { name: 'ae/t-2/1', harness: 'fake' },
  ];
  let answer: Record<string, unknown> | undefined = { 'ae/t-1/1': 'its output cannot be read', 'ae/t-2/1': 7, 'ae/t-3/1': 'not expected' };
  const unread = expected.map((e) => e.name);
  t.mock.method(HarnessHandler.prototype, 'observeSessions', async () =>
    answer === undefined ? { tasks: [], unread, why: [] } : { tasks: [], unread, why: [], unreadWhy: answer },
  );
  const runner = a2aOps('fake', ops, async () => []);
  const kept = await Effect.runPromise(runner.observeFor!(expected));
  assert.deepEqual(kept.unreadWhy, new Map([['ae/t-1/1', 'its output cannot be read']]), 'a number, and a name not unread, dropped');
  answer = undefined;
  assert.equal(Object.hasOwn(await Effect.runPromise(runner.observeFor!(expected)), 'unreadWhy'), false, "an older driver's answer");
});

/**
 * The A2A seam beneath the engine's harnesses (thin runtime, stage 1 part 2): the mappings, round-tripped, and a
 * harness driven through the SDK's `Client`, whose words reach the engine unchanged.
 *
 * Strings are compared exactly, never by pattern: a word the seam changed on its way from a harness fails here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect, Layer } from 'effect';
import { A2A_PROTOCOL_VERSION, Role, TaskState } from '@a2a-js/sdk';
import {
  ExtendedAgentCardNotConfiguredError, PushNotificationNotSupportedError, UnsupportedOperationError,
} from '@a2a-js/sdk/errors';
import { a2aOps, a2aRunner, InProcessTransport } from '../src/a2a-client.ts';
import { file, requestStop, tick } from '../src/engine.ts';
import { Journal } from '../src/journal.ts';
import { HarnessHandler } from '../src/a2a-handler.ts';
import {
  failedSpawnTask, messageOf, messageRefusal, nameParts, observedOf, sightingOf, spawnOf, startedTask, stateOf, taskOfAttempt,
  taskOfSighting, wordsOf,
} from '../src/a2a-map.ts';
import type { Attempt, Observed, Sighting } from '../src/domain.ts';
import { Runner, RunnerError, testOps, type RunnerOps, type SpawnRequest } from '../src/runner.ts';

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

// ─── through the client ─────────────────────────────────────────────────────

/** A driver a test moves by hand, what it was asked, and the same driver behind the A2A client. */
const driven = (o: { spawnFails?: unknown; stopFails?: string; observeFails?: string } = {}) => {
  const sessions = new Map<string, Sighting>();
  const asked: Array<[string, unknown]> = [];
  let n = 0;
  const ops: RunnerOps = {
    spawn: (r: SpawnRequest) => Effect.suspend(() => {
      asked.push(['spawn', r]);
      if (o.spawnFails instanceof RunnerError) return Effect.fail(o.spawnFails);
      if (o.spawnFails) return Effect.die(o.spawnFails);
      sessions.set(r.name, { sessionId: `s-${++n}`, state: 'working', busy: true });
      return Effect.void;
    }),
    observe: Effect.suspend(() => {
      asked.push(['observe', undefined]);
      return o.observeFails ? Effect.fail(new RunnerError({ verb: 'observe', message: o.observeFails })) : Effect.succeed(new Map(sessions));
    }),
    stop: (id) => Effect.suspend(() => {
      asked.push(['stop', id]);
      if (o.stopFails) return Effect.fail(new RunnerError({ verb: 'stop', message: o.stopFails }));
      for (const [name, s] of sessions) if (s.sessionId === id) sessions.set(name, { ...s, state: 'stopped', busy: false });
      return Effect.void;
    }),
    logs: (id) => Effect.succeed(`logs of ${id}`),
    find: (name) => Effect.succeed(sessions.get(name)),
  };
  const runner = a2aOps('fake', ops, async () => []);
  return { ops, runner, sessions, asked, acted: () => asked.filter(([verb]) => verb !== 'observe') };
};

/** The error an effect failed with, or a failure of the test when it succeeded. */
const failure = <A>(e: Effect.Effect<A, RunnerError>) => Effect.runPromise(Effect.flip(e));

test('a spawn through the client reaches the driver as the engine asked for it, every key, config whole', async () => {
  const d = driven();
  await Effect.runPromise(d.runner.spawn(request));
  assert.deepEqual(d.acted(), [['spawn', request]]);
  // The engine's spawn has every key, some undefined: the driver is handed the same keys back.
  const bare: SpawnRequest = {
    name: 'ae/t-2/1', brief: 'b', cwd: '/r', harness: undefined, config: undefined, closeoutSchema: undefined, budgetUsd: undefined,
    resumeFrom: undefined,
  };
  await Effect.runPromise(d.runner.spawn(bare));
  assert.deepEqual(d.acted()[1], ['spawn', bare]);
  assert.deepEqual(Object.keys(d.acted()[1]![1] as object).sort(), Object.keys(bare).sort());
});

test("a refused spawn is the harness's refusal, in its words, `refused`", async () => {
  const d = driven({ spawnFails: new RunnerError({ verb: 'spawn', message: 'fake: no binary called `fake` on PATH', refused: true }) });
  const e = await failure(d.runner.spawn(request));
  assert.ok(e instanceof RunnerError);
  assert.deepEqual({ verb: e.verb, message: e.message, refused: e.refused }, {
    verb: 'spawn', message: 'fake: no binary called `fake` on PATH', refused: true,
  });
});

test('a spawn that may have started is not `refused`, and keeps its words', async () => {
  const d = driven({ spawnFails: new RunnerError({ verb: 'spawn', message: 'fake: the launcher lost its acknowledgement' }) });
  const e = await failure(d.runner.spawn(request));
  assert.deepEqual({ verb: e.verb, message: e.message, refused: e.refused }, {
    verb: 'spawn', message: 'fake: the launcher lost its acknowledgement', refused: undefined,
  });
  assert.equal('refused' in e && e.refused !== undefined, false, 'an ambiguous spawn carries no `refused` at all');
});

test("a driver's defect passes through the client as the same defect", async () => {
  const boom = new TypeError('the driver fell over');
  const d = driven({ spawnFails: boom });
  await assert.rejects(Effect.runPromise(d.runner.spawn(request)), (e) => e === boom);
});

test('a spawn the seam refuses reaches no driver, and says why in A2A\'s words', async () => {
  const d = driven();
  const e = await failure(d.runner.spawn({ ...request, name: 'not-a-session' }));
  assert.deepEqual({ verb: e.verb, message: e.message, refused: e.refused }, {
    verb: 'spawn', message: '`not-a-session` is not a session name: a session is named `ae/<task>/<n>`, n from 1.', refused: undefined,
  });
  assert.deepEqual(d.acted(), []);
});

test("observe through the client is the driver's map, every page of it, from one observe", async () => {
  const d = driven();
  for (let i = 1; i <= 250; i++) {
    d.sessions.set(`ae/t-${String(i).padStart(3, '0')}/1`, { sessionId: `s-${i}`, state: i % 5 === 0 ? 'done' : 'working', busy: i % 2 === 0 });
  }
  d.sessions.set('ae/t-001/2', full);
  const seen = await Effect.runPromise(d.runner.observe);
  assert.deepEqual(seen, d.sessions);
  assert.equal(d.asked.filter(([verb]) => verb === 'observe').length, 1, 'the pages after the first are served from its listing');
});

test('two observes at once over more than a page each read the whole map: a listing made since does not end one being paged', async () => {
  const d = driven();
  for (let i = 1; i <= 250; i++) d.sessions.set(`ae/t-${String(i).padStart(3, '0')}/1`, { sessionId: `s-${i}`, state: 'working' });
  // The driver answers neither first page until both are asked, so both listings are made before either asks its second.
  let release!: () => void;
  const both = new Promise<void>((r) => { release = r; });
  let pending = 0;
  const gated = a2aOps('fake', {
    ...d.ops,
    observe: Effect.promise(async () => {
      if (++pending === 2) release();
      await both;
      return new Map(d.sessions);
    }),
  }, async () => []);
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
  assert.equal(d.sessions.get(request.name)!.state, 'stopped');
});

test('a stop with no listing yet lists first, and stops', async () => {
  const d = driven();
  d.sessions.set('ae/t-1/1', { sessionId: 's-9', state: 'blocked' });
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
  assert.deepEqual({ verb: e.verb, message: e.message }, {
    verb: 'stop', message: 'the `fake` harness lists no session `s-404`: there is nothing to stop.',
  });
  assert.deepEqual(d.acted(), []);
});

test('a stop of a session that ended since the listing does nothing, as a driver did', async () => {
  const d = driven();
  await Effect.runPromise(d.runner.spawn(request));
  await Effect.runPromise(d.runner.observe);
  d.sessions.set(request.name, { sessionId: 's-1', state: 'done' });
  await Effect.runPromise(d.runner.stop('s-1'));
  assert.deepEqual(d.acted(), [['spawn', request]]);
});

test("what part 3 moves still reaches the driver directly", () => {
  const d = driven();
  assert.equal(d.runner.logs, d.ops.logs);
  assert.equal(d.runner.find, d.ops.find);
});

test('the in-process transport maps the three names the handler spells otherwise, and refuses what the agent does not do', async () => {
  const d = driven();
  const t = new InProcessTransport(new HarnessHandler('fake', d.ops, async () => []));
  assert.equal(t.protocolName, 'in-process');
  assert.equal(t.protocolVersion, A2A_PROTOCOL_VERSION);
  await assert.rejects(t.getExtendedAgentCard({ tenant: '' }), (e) => e instanceof ExtendedAgentCardNotConfiguredError
    && e.message === 'the `fake` harness has no extended card: its card is the whole of it.');
  await assert.rejects(t.listTaskPushNotificationConfig({ tenant: '', taskId: 'ae/t-1/1', pageSize: 0, pageToken: '' }),
    (e) => e instanceof PushNotificationNotSupportedError && e.message === 'the `fake` harness sends no notifications: poll getTask.');
  const drain = async (g: AsyncGenerator<unknown>) => { for await (const _ of g) { /* nothing is yielded */ } };
  await assert.rejects(drain(t.resubscribeTask({ tenant: '', id: 'ae/t-1/1' })),
    (e) => e instanceof UnsupportedOperationError && e.message === 'this agent does not stream: poll getTask.');
  await assert.rejects(drain(t.sendMessageStream({ tenant: '', message: undefined, configuration: undefined, metadata: undefined })),
    (e) => e instanceof UnsupportedOperationError
      && e.message === 'this agent does not stream: send the message with returnImmediately and poll getTask.');
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
  assert.equal(spawned[0]!.name, `ae/${id}/1`);
  assert.equal(sessions.get(`ae/${id}/1`)!.state, 'working');

  await run(requestStop(id));
  await run(tick());
  assert.equal(sessions.get(`ae/${id}/1`)!.state, 'stopped', 'the stop reached the driver through cancelTask');

  // Only the seam answers this: a driver reached directly is handed any id, and testOps does nothing with one it lacks.
  const e = await run(Effect.flatMap(Runner, (r) => Effect.flip(r.stop('fake-404'))));
  assert.equal(e.message, 'the `fake` harness lists no session `fake-404`: there is nothing to stop.');

  // What no harness could use is refused beneath it, as through `Runner.layer`.
  const refusal = await run(Effect.flatMap(Runner, (r) => Effect.sync(() => r.refuses?.({ brief: 'b', cwd: '/r', config: { model: '' } }))));
  assert.equal(refusal, "`model` is empty. Leave it out for the harness's default.");
});

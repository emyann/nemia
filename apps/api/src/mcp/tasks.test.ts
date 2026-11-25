/**
 * The MCP port's tasks (tasks.ts), spoken to as raw JSON-RPC on the modern era with the extension declared in each request's
 * capabilities: `server/discover` declares the extension beside the files', `initialize` does not; a declared call of `upgrade` is
 * answered as a task the port follows through the upgrade's read, working until the engine settles it, then completed with the read as
 * its result (an error of it where it failed), and a cancel acknowledged with the upgrade going on; a declared call of `wait` is held,
 * asked again until a line is taken or its bound comes, then completed and stable, cancelled by `tasks/cancel`, and past the most held
 * answered as before; a call that declares nothing, and one of the legacy era, answered as before. Refusals are asserted by their code,
 * never their words.
 *
 * On the stand-ins: the runtime's test engine, which runs no command — the upgrade's task is settled by the test — and the test place for
 * the upgrades; the app's own module for the waits, its feed written by the package's own writer on the app's runtime, as
 * `server.test.ts` writes it; a second token minted through the package's `TokenDoor` under the harness's store.
 */
import { root } from '../../test/harness.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { Effect, Layer, Logger } from 'effect';
import { Hono } from 'hono';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { emitFeed, feedSize, freshFeedMemo, RunningCode, TokenDoor, tokenDoorFiles } from 'agent-orchestrator';
import { app as served, runtime } from '../app.ts';
import { appOver, eachTest } from '../../test/placed.ts';
import { until, WAITED } from '../../test/waits.ts';
import { mcpPort } from './port.ts';
import { FOLLOW_POLL_MS, HELD_POLL_MS } from './tasks.ts';

/** The install the server runs, so an upgrade has one to start from: `v1.3.0`, from an archive. */
const install = Layer.succeed(RunningCode, () => ({
  kind: 'install' as const,
  root: '/r/v1.3.0',
  tag: 'v1.3.0',
  commit: 'c0ffee',
  source: 'file:///base',
  builtAt: '',
}));

const stand = eachTest(testPlace);
const engine = eachTest(testEngine);
const app = eachTest(() => appOver(engine(), stand(), install));

/** The token door's shape, as the package's `TokenDoor` gives it. */
type TokenDoorShape = typeof TokenDoor extends { readonly defaultValue: () => infer S } ? S : never;

/** A standing token the person minted for the agent `operator`, which the port takes beside the person's. */
const agentToken = Effect.runSync(
  Effect.gen(function* () {
    const door: TokenDoorShape = yield* TokenDoor;
    return yield* door.persons.mint('tasks-ops', { kind: 'agent', agent: 'operator', factory: null, narrowed: null });
  }).pipe(Effect.provide(tokenDoorFiles(root))),
);

/** What answers `/mcp`: an app, or the port mounted alone. */
type Answering = { readonly request: (input: string, init?: RequestInit) => Response | Promise<Response> };

/** A JSON-RPC answer: its result, or its error's code. */
type Rpc = { readonly result?: Record<string, unknown>; readonly error?: { readonly code: number } };

/** The JSON-RPC answer of a response's text, as JSON or as the last `data:` line of a stream. */
const answerOf = (text: string, contentType: string) => {
  const json = contentType.includes('text/event-stream')
    ? (text
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .at(-1)
        ?.slice('data:'.length) ?? '{}')
    : text;
  return JSON.parse(json) as Rpc;
};

/** The modern envelope of a request: its version, its client and its capabilities, the tasks extension among them where `declared`. */
const envelope = (declared: boolean) => ({
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientInfo': { name: 'tasks-test', version: '0.0.0' },
  'io.modelcontextprotocol/clientCapabilities': declared ? { extensions: { 'io.modelcontextprotocol/tasks': {} } } : {},
});

/**
 * A modern request of `method` with `params` to `/mcp` of `on`, declaring the extension unless told not, with `token` where given: its
 * headers say its version, its method and what it names (a tool, or a task), as the era asks.
 */
async function rpc(on: Answering, method: string, params: Record<string, unknown>, { declared = true, token = '' } = {}) {
  const named = params.name ?? params.taskId;
  const res = await on.request('/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2026-07-28',
      'mcp-method': method,
      ...(typeof named === 'string' ? { 'mcp-name': named } : {}),
      ...(token === '' ? {} : { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: { ...params, _meta: envelope(declared) } }),
  });
  assert.equal(res.status, 200, `${method} is answered in band`);
  return answerOf(await res.text(), res.headers.get('content-type') ?? '');
}

/** A call of `name` with `args`, as `rpc` sends it. */
const call = (on: Answering, name: string, args: Record<string, unknown>, options?: { declared?: boolean; token?: string }) =>
  rpc(on, 'tools/call', { name, arguments: args }, options);

/** The task `taskId` as `tasks/get` answers it. */
const got = async (on: Answering, taskId: string, token?: string) => {
  const answer = await rpc(on, 'tasks/get', { taskId }, { token });
  assert.ok(answer.result, `tasks/get answers ${taskId}`);
  return answer.result;
};

/** The task id of an answer that is a task, asserted to be one. */
const taskIdOf = (answer: Rpc) => {
  assert.equal(answer.result?.resultType, 'task', 'the call is answered as a task');
  const id = answer.result.taskId;
  assert.equal(typeof id, 'string');
  return String(id);
};

/** The `structuredContent` of a completed task's result. */
const structuredOf = (task: Record<string, unknown>) =>
  (task.result as { structuredContent?: Record<string, unknown> } | undefined)?.structuredContent;

test('server/discover declares the tasks extension beside the files one; initialize, of the legacy era, the files one alone', async () => {
  const discovered = await rpc(app(), 'server/discover', {});
  const modern = (discovered.result?.capabilities as { extensions?: Record<string, unknown> } | undefined)?.extensions ?? {};
  assert.deepEqual(Object.keys(modern).sort(), ['io.modelcontextprotocol/files', 'io.modelcontextprotocol/tasks']);
  const res = await app().request('/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'tasks-test', version: '0.0.0' } },
    }),
  });
  const legacy = answerOf(await res.text(), res.headers.get('content-type') ?? '');
  const extensions = (legacy.result?.capabilities as { extensions?: Record<string, unknown> } | undefined)?.extensions ?? {};
  assert.deepEqual(Object.keys(extensions), ['io.modelcontextprotocol/files']);
});

test('a declared upgrade is a task followed through its read: working, then completed with the upgrade; a cancel lets it go on', async () => {
  const answer = await call(app(), 'upgrade', { tag: 'v1.4.0' });
  const taskId = taskIdOf(answer);
  assert.ok(taskId.startsWith('upgrade:'), 'the task is named by its tool and the upgrade it follows');
  assert.equal(answer.result?.status, 'working');
  assert.equal(answer.result?.ttlMs, null);
  assert.equal(answer.result?.pollIntervalMs, FOLLOW_POLL_MS);
  const id = taskId.slice('upgrade:'.length);
  assert.ok(engine().tasks.get(id), 'the upgrade is filed on the engine before the task is answered');
  assert.equal((await got(app(), taskId)).status, 'working');

  assert.deepEqual((await rpc(app(), 'tasks/cancel', { taskId })).result ?? {}, {}, 'a cancel is acknowledged, empty');
  assert.equal((await got(app(), taskId)).status, 'working', 'the upgrade goes on');

  engine().settle(id, 'succeeded', { exitCode: 0 });
  const ended = await got(app(), taskId);
  assert.equal(ended.status, 'completed');
  assert.equal(structuredOf(ended)?.phase, 'succeeded');
  assert.notEqual((ended.result as { isError?: boolean }).isError, true);
});

test('a declared upgrade that fails completes with its read as the tool error', async () => {
  const taskId = taskIdOf(await call(app(), 'upgrade', { tag: 'v1.4.0' }));
  engine().settle(taskId.slice('upgrade:'.length), 'failed', { exitCode: 1 });
  const ended = await got(app(), taskId);
  assert.equal(ended.status, 'completed', 'a tool error is a completed task, failed being a JSON-RPC error');
  assert.equal((ended.result as { isError?: boolean }).isError, true);
  assert.equal(structuredOf(ended)?.phase, 'failed');
});

test('an upgrade that declares nothing, and one of the legacy era, are answered the Upgrade as before', async () => {
  const plain = await call(app(), 'upgrade', { tag: 'v1.4.0' }, { declared: false });
  assert.equal(plain.result?.taskId, undefined);
  assert.equal(plain.result?.resultType === 'task', false);
  const upgrade = plain.result?.structuredContent as { id: string; phase: string };
  assert.equal(upgrade.phase, 'pending');
  engine().settle(upgrade.id, 'succeeded', { exitCode: 0 });

  const client = new Client({ name: 'tasks-test', version: '0.0.0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL('http://127.0.0.1:8787/mcp'), {
      fetch: async (url: string | URL, init?: RequestInit) => app().request(String(url), init),
    }),
  );
  assert.equal(client.getProtocolEra(), 'legacy');
  const legacy = await client.callTool({ name: 'upgrade', arguments: { tag: 'v1.4.0' } });
  assert.equal((legacy as { taskId?: unknown }).taskId, undefined);
  assert.equal((legacy.structuredContent as { phase?: string } | undefined)?.phase, 'pending');
  await client.close();
});

test('REFUSED -32602: an unknown id to get, cancel and update; an upgrade that is not; and on the legacy era tasks/get is no method', async () => {
  for (const method of ['tasks/get', 'tasks/cancel', 'tasks/update'])
    assert.equal((await rpc(app(), method, { taskId: 'no-such-task' })).error?.code, -32602, method);
  assert.equal((await rpc(app(), 'tasks/get', { taskId: 'upgrade:upgrade-none' })).error?.code, -32602, 'an upgrade not filed');
  assert.equal((await rpc(app(), 'tasks/get', { taskId: 'ls:x' })).error?.code, -32602, 'a tool that follows nothing');
  const res = await app().request('/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tasks/get', params: { taskId: 'no-such-task' } }),
  });
  assert.equal(answerOf(await res.text(), res.headers.get('content-type') ?? '').error?.code, -32601);
});

/** A pass of the tick written on the app's runtime: each run of `runs` at its word, as `server.test.ts` writes the feed. */
const memo = freshFeedMemo();
const written = (runs: Record<string, string>) =>
  runtime.runPromise(
    emitFeed(new Map(Object.entries(runs).map(([id, word]) => [id, { run: { word }, steps: [] }])), { memo }).pipe(
      Effect.provide(Logger.layer([])),
    ),
  );

/** The port mounted on the app's own module, with the held tasks' knobs given. */
const heldPort = (options: { heldMost?: number; heldBoundMs?: number }) => {
  const port = mcpPort(() => served, options);
  return { on: new Hono().all('/mcp', port), port };
};

test(
  'a declared wait is held and asked again until a line is taken: completed with the line, and the same when read again',
  WAITED,
  async (t) => {
    const { on, port } = heldPort({});
    const answer = await call(on, 'wait', { labelSelector: 'run=tasks-wait-1', from: String(feedSize(root)), for: '300ms' });
    const taskId = taskIdOf(answer);
    assert.equal(answer.result?.status, 'working');
    assert.equal(answer.result?.pollIntervalMs, HELD_POLL_MS);
    assert.equal(port.liveTasks(), 1);
    await written({ 'tasks-wait-1': 'running' });
    await until(t, async () => (await got(on, taskId)).status === 'completed', 'the wait takes the line', { everyMs: 20 });
    const ended = await got(on, taskId);
    const said = structuredOf(ended);
    assert.equal(said?.ended, 'matched');
    assert.equal(Array.isArray(said?.lines) ? said.lines.length : 0, 1);
    assert.equal(typeof said?.cursor, 'string');
    assert.deepEqual((await got(on, taskId)).result, ended.result, 'an ended task reads the same again');
    assert.equal(port.liveTasks(), 0);
  },
);

test('a held wait with no line before its bound completes with the bound answer', WAITED, async (t) => {
  const { on } = heldPort({ heldBoundMs: 400 });
  const taskId = taskIdOf(await call(on, 'wait', { labelSelector: 'run=tasks-wait-never', for: '200ms' }));
  await until(t, async () => (await got(on, taskId)).status === 'completed', 'the bound comes', { everyMs: 20 });
  assert.equal(structuredOf(await got(on, taskId))?.ended, 'bound');
});

test('tasks/cancel of a held wait is acknowledged and cancels it; another token reads it not', WAITED, async (t) => {
  const { on, port } = heldPort({});
  const taskId = taskIdOf(await call(on, 'wait', { labelSelector: 'run=tasks-wait-cancel', for: '60s' }));
  assert.equal((await rpc(on, 'tasks/get', { taskId }, { token: agentToken })).error?.code, -32602, "another token's read");
  assert.equal((await rpc(on, 'tasks/cancel', { taskId }, { token: agentToken })).error?.code, -32602, "another token's cancel");
  assert.deepEqual((await rpc(on, 'tasks/cancel', { taskId })).result ?? {}, {});
  assert.equal((await got(on, taskId)).status, 'cancelled');
  await until(t, () => port.liveTasks() === 0, 'the held wait is let go');
});

test('past the most held, a declared wait is answered as before', WAITED, async (t) => {
  const { on, port } = heldPort({ heldMost: 1 });
  const first = taskIdOf(await call(on, 'wait', { labelSelector: 'run=tasks-wait-most', for: '60s' }));
  const second = await call(on, 'wait', { labelSelector: 'run=tasks-wait-most', for: '100ms' });
  assert.equal(second.result?.taskId, undefined);
  assert.equal((second.result?.structuredContent as { ended?: string } | undefined)?.ended, 'bound');
  await rpc(on, 'tasks/cancel', { taskId: first });
  await until(t, () => port.liveTasks() === 0, 'the held wait is let go');
});

/**
 * The MCP port at `/mcp` (`mcpPort`), spoken to by the SDK's own `Client` over a transport whose fetch goes into the app: with a person's
 * token it lists the generated tools and serves a call by the endpoint the tool is linked to, a refusal of that endpoint answered as a
 * tool's error; the gate in front of it refuses no token, a session's token and a token never minted, each 401 by its word; and a call
 * still pending is told to its caller as progress, every interval, where the caller gave a progress token. Statuses, refusal words and
 * whether an error carries words are asserted, never a sentence.
 *
 * On the stand-ins: the runtime's test engine and the test place; a run planted as its record alone, nothing of it filed; the tokens
 * minted through the package's `TokenDoor` under the harness's store.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { Hono } from 'hono';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { CLI_VERBS, storeConfigLayer, TABLE, TokenDoor, tokenDoorFiles } from 'agent-orchestrator';
import { appOver, eachTest, engineFor } from '../../test/placed.ts';
import { Api, RUN_STATES } from 'objects';
import { INSTRUCTIONS_BOUND } from './instructions.ts';
import { mcpPort, PORT_LIST_TTL_MS } from './port.ts';
import { portTools } from './tools.ts';

const stand = eachTest(testPlace);
const standIn = eachTest(testEngine);
const app = eachTest(() => appOver(standIn(), stand()));

/** A program over the token door of the harness's store, run. */
const door = <A, E>(use: (d: TokenDoorShape) => Effect.Effect<A, E>): A =>
  Effect.runSync(
    Effect.gen(function* () {
      return yield* use(yield* TokenDoor);
    }).pipe(Effect.provide(tokenDoorFiles(root))),
  );

/** The token door's shape, as the package's `TokenDoor` gives it. */
type TokenDoorShape = typeof TokenDoor extends { readonly defaultValue: () => infer S } ? S : never;

/** A token of the person's, minted for this file. */
const personToken = door((d) => d.persons.mint('port-laptop'));

/** A run planted as its record alone: one step, nothing of it filed yet. */
const planted = (id: string) => {
  const file = path.join(root, 'runs', `${id}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({
      id,
      repo: '/code/app',
      workspace: '/code/app',
      baseRef: 'abc123',
      branch: 'main',
      isolate: true,
      brief: 'Hold me',
      workflowDir: path.join(root, 'no-such-workflow'),
      createdAt: '2026-11-11T09:00:00.000Z',
      workflow: [{ name: 'implement', after: [], body: 'Implement it.' }],
      steps: { implement: { taskId: null } },
    }),
  );
};

/** A fetch of `on`, as a client off this machine's loopback sends it. */
const fetchInto =
  (on: () => { request: (input: string | URL, init?: RequestInit) => Response | Promise<Response> }) =>
  async (url: string | URL, init?: RequestInit): Promise<Response> =>
    on().request(url, init);

/** The two eras a host speaks to the port in: 2025-11-25 by `initialize`, and 2026-07-28 by `server/discover`. */
const ERAS = ['legacy', 'modern'] as const;
type Era = (typeof ERAS)[number];

/**
 * The SDK's client connected to `/mcp` of `on` in `era` (the client's default for `legacy`, pinned to 2026-07-28 for `modern`),
 * presenting `token`, through `fetch` where given (a recording one), and checked to have landed in that era.
 */
async function connected(
  on: Parameters<typeof fetchInto>[0],
  era: Era = 'legacy',
  token = personToken,
  fetch: (url: string | URL, init?: RequestInit) => Promise<Response> = fetchInto(on),
): Promise<Client> {
  const client = new Client(
    { name: 'port-test', version: '0.0.0' },
    era === 'modern' ? { versionNegotiation: { mode: { pin: '2026-07-28' } } } : {},
  );
  await client.connect(
    new StreamableHTTPClientTransport(new URL('http://127.0.0.1:8787/mcp'), {
      fetch,
      requestInit: { headers: { authorization: `Bearer ${token}` } },
    }),
  );
  assert.equal(client.getProtocolEra(), era, `the client connected in the ${era} era`);
  return client;
}

/** A JSON-RPC message the port answered, read off a response as JSON or as the `data:` lines of a stream. */
type Answered = { id?: unknown; method?: string; result?: Record<string, unknown> };

/** Each message of a response's text, whether it is JSON or a stream of `data:` lines. */
const messagesOf = (text: string, contentType: string): Answered[] =>
  contentType.includes('text/event-stream')
    ? text
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => JSON.parse(line.slice('data:'.length)) as Answered)
        .filter((m) => typeof m === 'object' && m !== null)
    : text.trim() === ''
      ? []
      : [JSON.parse(text) as Answered];

/** A fetch into `on` that keeps, for each request, the JSON-RPC method sent, the response's content type and the messages it answered. */
function recording(on: Parameters<typeof fetchInto>[0]) {
  const seen: { method: string | undefined; contentType: string; messages: Answered[] }[] = [];
  const into = fetchInto(on);
  const fetch = async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const res = await into(url, init);
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as { method?: string }) : {};
    const contentType = res.headers.get('content-type') ?? '';
    const text = await res.clone().text();
    seen.push({ method: body.method, contentType, messages: messagesOf(text, contentType) });
    return res;
  };
  return { fetch, seen, resultOf: (method: string) => seen.find((s) => s.method === method)?.messages.find((m) => m.result)?.result };
}

/** The first text a tool's result carries. */
const textOf = (result: object): string => {
  const content = 'content' in result && Array.isArray(result.content) ? (result.content as { type: string; text?: string }[]) : [];
  return content.find((c) => c.type === 'text')?.text ?? '';
};

for (const era of ERAS)
  test(`${era}: with a person's token, tools/list lists the generated tools, wait, hold, cancel and decide among them`, async () => {
    const client = await connected(app, era);
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    for (const name of ['wait', 'hold', 'cancel', 'decide']) assert.ok(names.includes(name), name);
    const hold = tools.find((t) => t.name === 'hold');
    assert.equal(hold?.annotations?.readOnlyHint, false);
    assert.equal(hold?.inputSchema.type, 'object');
    await client.close();
  });

for (const era of ERAS)
  test(`${era}: tools/call hold on a planted run holds it, through the endpoint the tool is linked to`, async () => {
    const id = `r-port-held-${era}`;
    planted(id);
    const client = await connected(app, era);
    const result = await client.callTool({ name: 'hold', arguments: { namespace: 'default', name: id, why: 'by the port' } });
    assert.notEqual(result.isError, true, textOf(result));
    assert.equal((result.structuredContent as { id?: string } | undefined)?.id, id);
    assert.ok(fs.existsSync(path.join(root, 'runs', `${id}.hold`)), 'the hold is written');
    await client.close();
  });

for (const era of ERAS)
  test(`${era}: initialize or server/discover answers instructions under the bound a host keeps whole, every tool they name one tools/list lists`, async () => {
    const client = await connected(app, era);
    const instructions = client.getInstructions() ?? '';
    const { tools } = await client.listTools();
    const names = new Set(tools.map((t) => t.name));
    assert.ok(instructions.length > 0, 'the port sends instructions');
    assert.ok(instructions.length <= INSTRUCTIONS_BOUND, `${instructions.length} characters, at most ${INSTRUCTIONS_BOUND}`);
    const named = [...instructions.matchAll(/`([a-z][a-z_-]*)`/g)].map((m) => m[1]);
    for (const name of ['ls', 'show', 'decide', 'approve', 'retry', 'inbox_add', 'inbox_start', 'say', 'closeout', 'try'])
      assert.ok(named.includes(name), `the instructions name ${name}`);
    for (const name of named) assert.ok(names.has(name), `${name}, named by the instructions, is a tool the port lists`);
    const ls = tools.find((t) => t.name === 'ls');
    assert.ok(
      ls !== undefined && 'fieldSelector' in (ls.inputSchema.properties ?? {}),
      'ls takes the fieldSelector the instructions give it',
    );
    assert.ok(instructions.includes('fieldSelector: "status.state!=finished"'), 'the instructions select the runs in play');
    for (const state of RUN_STATES) assert.ok(instructions.includes(state), `the instructions say the state ${state}`);
    await client.close();
  });

test("every listed tool's description opens with its one-line summary, never a flag", async () => {
  const client = await connected(app);
  const { tools } = await client.listTools();
  for (const t of tools) {
    const first = (t.description ?? '').split('\n')[0] ?? '';
    assert.ok(first.trim().length > 0, `${t.name}'s description opens with a line`);
    assert.ok(!first.trimStart().startsWith('-'), `${t.name}'s description opens with a summary, not a flag: ${first}`);
  }
  await client.close();
});

for (const era of ERAS)
  test(`${era}: REFUSED as a tool's error: hold on a run the store has not, answered isError with the api's words`, async () => {
    const client = await connected(app, era);
    const result = await client.callTool({ name: 'hold', arguments: { namespace: 'default', name: 'r-port-nothing' } });
    assert.equal(result.isError, true);
    assert.ok(textOf(result).length > 0, 'the refusal carries words');
    assert.equal(fs.existsSync(path.join(root, 'runs', 'r-port-nothing.hold')), false, 'nothing written');
    await client.close();
  });

test("REFUSED 401 at the port: no token, a session's token, a token never minted, and one revoked", async () => {
  const sessionToken = door((d) =>
    d.tokens.mint({ agent: 'nemia', factory: null, run: null, step: null, attempt: 1, task: 't-port-session' }),
  );
  Effect.runSync(engineFor(standIn()).file({ id: 't-port-session', brief: 'Be on.', cwd: root, harness: 'claude' }));
  standIn().settle('t-port-session', 'working');
  const revoked = door((d) => d.persons.mint('port-revoked'));
  door((d) => d.persons.revoke('port-revoked'));
  const initialize = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'port-test', version: '0.0.0' } },
  });
  const discover = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'server/discover',
    params: {
      _meta: {
        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
        'io.modelcontextprotocol/clientInfo': { name: 'port-test', version: '0.0.0' },
        'io.modelcontextprotocol/clientCapabilities': {},
      },
    },
  });
  for (const body of [initialize, discover])
    for (const [bearer, reason] of [
      [undefined, 'token-required'],
      [sessionToken, 'person-token-required'],
      ['never-minted', 'unknown-token'],
      [revoked, 'unknown-token'],
    ] as const) {
      const res = await app().request('/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          ...(bearer === undefined ? {} : { authorization: `Bearer ${bearer}` }),
        },
        body,
      });
      assert.equal(res.status, 401, reason);
      assert.equal(((await res.json()) as { reason?: string }).reason, reason);
    }
});

for (const era of ERAS)
  test(`${era}: a pending wait given a progress token is told progress every interval, the interval injected short`, async () => {
    const port = new Hono().all('/mcp', mcpPort(app, { progressEveryMs: 20 }));
    const client = await connected(() => port, era);
    const told: number[] = [];
    const result = await client.callTool({ name: 'wait', arguments: { for: '300ms' } }, {
      onprogress: (progress) => told.push(progress.progress),
    });
    assert.notEqual(result.isError, true, textOf(result));
    assert.equal((result.structuredContent as { ended?: string } | undefined)?.ended, 'bound');
    assert.ok(told.length >= 1, `progress told ${told.length} times`);
    assert.deepEqual(
      told,
      [...told].sort((a, b) => a - b),
      'progress only grows',
    );
    await client.close();
  });

test('on 2026-07-28 tools/list carries resultType complete, ttlMs PORT_LIST_TTL_MS and cacheScope private, and server/discover names 2026-07-28', async () => {
  const wire = recording(app);
  const client = await connected(app, 'modern', personToken, wire.fetch);
  await client.listTools();
  const listed = wire.resultOf('tools/list');
  assert.equal(listed?.resultType, 'complete');
  assert.equal(listed?.ttlMs, PORT_LIST_TTL_MS);
  assert.equal(listed?.cacheScope, 'private');
  const discovered = wire.resultOf('server/discover');
  assert.ok(
    Array.isArray(discovered?.supportedVersions) && discovered.supportedVersions.includes('2026-07-28'),
    'server/discover offers 2026-07-28',
  );
  assert.equal(discovered?.resultType, 'complete');
  await client.close();
});

test('tools/list answers the same tools in the same order on every request and in both eras, the order of the command table', async () => {
  const table = portTools(TABLE, CLI_VERBS, Api).map((t) => t.name);
  for (const era of ERAS) {
    const client = await connected(app, era);
    for (let i = 0; i < 2; i++)
      assert.deepEqual(
        (await client.listTools()).tools.map((t) => t.name),
        table,
        `${era}, list ${i + 1}`,
      );
    await client.close();
  }
});

test("in an exposed store a person's call reaches its endpoint with their token, in both eras", async () => {
  const exposed = appOver(standIn(), stand(), storeConfigLayer({ ...process.env, WF_ROOT: root, WF_EXPOSED: '1' }));
  for (const era of ERAS) {
    const client = await connected(() => exposed, era);
    const result = await client.callTool({ name: 'ls', arguments: {} });
    assert.notEqual(result.isError, true, textOf(result));
    await client.close();
  }
});

test('a call given a progress token answers text/event-stream from its start; on 2026-07-28 one given none answers application/json', async () => {
  for (const era of ERAS) {
    const wire = recording(app);
    const client = await connected(app, era, personToken, wire.fetch);
    await client.callTool({ name: 'ls', arguments: {} });
    await client.callTool({ name: 'ls', arguments: {} }, { onprogress: () => {} });
    const calls = wire.seen.filter((s) => s.method === 'tools/call');
    assert.equal(calls.length, 2, era);
    if (era === 'modern') assert.ok(calls[0]?.contentType.includes('application/json'), `${era}, no token: ${calls[0]?.contentType}`);
    assert.ok(calls[1]?.contentType.includes('text/event-stream'), `${era}, a token: ${calls[1]?.contentType}`);
    assert.ok(
      calls[1]?.messages.some((m) => m.method === 'notifications/progress'),
      `${era}: the call is told progress at once`,
    );
    await client.close();
  }
});

test("GET /mcp with a person's token answers 405: the port keeps no stream", async () => {
  const res = await app().request('/mcp', {
    method: 'GET',
    headers: { accept: 'text/event-stream', authorization: `Bearer ${personToken}` },
  });
  assert.equal(res.status, 405);
});

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
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { TokenDoor, tokenDoorFiles } from 'agent-orchestrator';
import { appOver, eachTest, engineFor } from '../../test/placed.ts';
import { mcpPort } from './port.ts';

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

/** The SDK's client connected to `/mcp` of `on`, presenting `token`. */
async function connected(on: Parameters<typeof fetchInto>[0], token = personToken): Promise<Client> {
  const client = new Client({ name: 'port-test', version: '0.0.0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL('http://127.0.0.1:8787/mcp'), {
      fetch: fetchInto(on),
      requestInit: { headers: { authorization: `Bearer ${token}` } },
    }),
  );
  return client;
}

/** The first text a tool's result carries. */
const textOf = (result: object): string => {
  const content = 'content' in result && Array.isArray(result.content) ? (result.content as { type: string; text?: string }[]) : [];
  return content.find((c) => c.type === 'text')?.text ?? '';
};

test("with a person's token, tools/list lists the generated tools, wait, hold, cancel and decide among them", async () => {
  const client = await connected(app);
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  for (const name of ['wait', 'hold', 'cancel', 'decide']) assert.ok(names.includes(name), name);
  const hold = tools.find((t) => t.name === 'hold');
  assert.equal(hold?.annotations?.readOnlyHint, false);
  assert.equal(hold?.inputSchema.type, 'object');
  await client.close();
});

test('tools/call hold on a planted run holds it, through the endpoint the tool is linked to', async () => {
  planted('r-port-held');
  const client = await connected(app);
  const result = await client.callTool({ name: 'hold', arguments: { namespace: 'default', name: 'r-port-held', why: 'by the port' } });
  assert.notEqual(result.isError, true, textOf(result));
  assert.equal((result.structuredContent as { id?: string } | undefined)?.id, 'r-port-held');
  assert.ok(fs.existsSync(path.join(root, 'runs', 'r-port-held.hold')), 'the hold is written');
  await client.close();
});

test("REFUSED as a tool's error: hold on a run the store has not, answered isError with the api's words", async () => {
  const client = await connected(app);
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
      body: initialize,
    });
    assert.equal(res.status, 401, reason);
    assert.equal(((await res.json()) as { reason?: string }).reason, reason);
  }
});

test('a pending wait given a progress token is told progress every interval, the interval injected short', async () => {
  const port = new Hono().all('/mcp', mcpPort(app, { progressEveryMs: 20 }));
  const client = await connected(() => port);
  const told: number[] = [];
  const result = await client.callTool({ name: 'wait', arguments: { for: '300ms' } }, undefined, {
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

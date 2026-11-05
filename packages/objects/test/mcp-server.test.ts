/**
 * The McpServer (`src/mcp-server.ts`): a server and a page of them decoded from JSON and encoded back equal, its headers masked as the
 * api serves them; a builtin server, with no namespace and no status; its transport and state closed words; the write body and the
 * sign-in's answers decoded as the api is sent and answers them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { API_VERSION, HEADER_MASK, McpServer, McpServerList, McpServerWrite, SignInStarted, SignInState, SignedOut } from 'objects';

const github = {
  apiVersion: API_VERSION,
  kind: 'McpServer',
  metadata: { name: 'github', namespace: 'mill', creationTimestamp: '2026-11-04T00:00:00.000Z', resourceVersion: 's1' },
  spec: {
    type: 'http',
    url: 'https://api.githubcopilot.com/mcp/',
    headers: { 'X-MCP-Toolsets': HEADER_MASK },
    oauth: { clientId: 'abc', callbackPort: 8765 },
  },
  status: { state: 'needs-auth', tools: 12, error: 'sign in first' },
} as const;

/** A builtin server: spec only, no namespace, no status, no optional key. */
const builtin = {
  apiVersion: API_VERSION,
  kind: 'McpServer',
  metadata: { name: 'docs', creationTimestamp: '2026-11-04T00:00:00.000Z', resourceVersion: 'b1' },
  spec: { type: 'sse', url: 'https://docs.example/mcp' },
} as const;

const roundTrip = <S extends Schema.Codec<unknown, unknown>>(schema: S, value: unknown): unknown =>
  JSON.parse(JSON.stringify(Schema.encodeSync(schema)(Schema.decodeUnknownSync(schema)(JSON.parse(JSON.stringify(value))))));

test('a server and a page of them decode from JSON and encode back the same, a builtin one with spec alone', () => {
  assert.deepEqual(roundTrip(McpServer, github), github);
  assert.deepEqual(roundTrip(McpServer, builtin), builtin);
  assert.deepEqual(roundTrip(McpServer, { ...github, status: {} }), { ...github, status: {} });
  const page = { apiVersion: API_VERSION, kind: 'McpServerList', metadata: {}, items: [builtin] };
  assert.deepEqual(roundTrip(McpServerList, page), page);
});

test("the header mask is no value a header is sent with, and the write takes the old route's server and a server read back", () => {
  assert.equal(HEADER_MASK, '********');
  const read = { type: 'http', url: 'https://api.githubcopilot.com/mcp/', headers: { 'X-MCP-Toolsets': HEADER_MASK } };
  assert.deepEqual(roundTrip(McpServerWrite, read), read);
  assert.deepEqual(roundTrip(McpServerWrite, { url: 'https://x.example/mcp' }), { url: 'https://x.example/mcp' });
  const signedIn = { url: 'https://x.example/mcp', oauth: { clientId: 'abc' } };
  assert.deepEqual(roundTrip(McpServerWrite, signedIn), signedIn);
});

test("the sign-in's answers decode as the api answers them", () => {
  const started = { authUrl: 'https://github.com/login/oauth/authorize?x=1', until: '2026-11-04T00:05:00.000Z' };
  assert.deepEqual(roundTrip(SignInStarted, started), started);
  assert.deepEqual(roundTrip(SignInState, { state: 'none' }), { state: 'none' });
  const failed = { state: 'failed', until: '2026-11-04T00:05:00.000Z', why: 'denied' };
  assert.deepEqual(roundTrip(SignInState, failed), failed);
  assert.deepEqual(roundTrip(SignedOut, { signedOut: true }), { signedOut: true });
});

test('REFUSED: a transport, a state or a sign-in state off its words, a write with no url, and another kind', () => {
  const decode = Schema.decodeUnknownSync(McpServer);
  assert.throws(() => decode({ ...github, spec: { ...github.spec, type: 'stdio' } }));
  assert.throws(() => decode({ ...github, status: { state: 'up' } }));
  assert.throws(() => decode({ ...github, kind: 'Server' }));
  assert.throws(() => Schema.decodeUnknownSync(SignInState)({ state: 'signed' }));
  assert.throws(() => Schema.decodeUnknownSync(McpServerWrite)({ type: 'http' }));
  assert.throws(() => Schema.decodeUnknownSync(McpServerWrite)({ url: 'https://x.example/mcp', type: 'ws' }));
});

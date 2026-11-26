/**
 * The McpServer (`src/mcp-server.ts`): a server and a page of them as the Api's endpoints answer them, every key kept, its headers
 * masked as the api serves them; a builtin server, with no namespace and no status; its transport and state closed words; the write body
 * and the sign-in's answers as the Api's endpoints take and answer them.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { API_VERSION, HEADER_MASK, McpServer, McpServerWrite, SignInState } from 'objects';
import { answered, taken } from './served.ts';

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

test("the Api's get answers a server, its list and the builtin list a page of them, a builtin one with spec alone", () => {
  assert.deepEqual(answered('mcpservers', 'get', github), github);
  assert.deepEqual(answered('mcpservers', 'get', builtin), builtin);
  assert.deepEqual(answered('mcpservers', 'get', { ...github, status: {} }), { ...github, status: {} });
  const page = { apiVersion: API_VERSION, kind: 'McpServerList', metadata: {}, items: [builtin] };
  assert.deepEqual(answered('mcpservers', 'list', page), page);
  assert.deepEqual(answered('mcpservers', 'listLibrary', page), page);
  assert.equal(answered('mcpservers', 'get', { ...github, kind: 'Server' }), undefined);
  assert.equal(answered('mcpservers', 'listLibrary', { ...page, kind: 'ServerList' }), undefined);
});

test("the header mask is no value a header is sent with, and the write takes the old route's server and a server read back", () => {
  assert.equal(HEADER_MASK, '********');
  const read = { type: 'http', url: 'https://api.githubcopilot.com/mcp/', headers: { 'X-MCP-Toolsets': HEADER_MASK } };
  assert.deepEqual(taken('mcpservers', 'put', read), read);
  assert.deepEqual(taken('mcpservers', 'put', { url: 'https://x.example/mcp' }), { url: 'https://x.example/mcp' });
  const signedIn = { url: 'https://x.example/mcp', oauth: { clientId: 'abc' } };
  assert.deepEqual(taken('mcpservers', 'put', signedIn), signedIn);
  assert.equal(taken('mcpservers', 'put', { type: 'http' }), undefined);
});

test("the sign-in's answers are the Api's endpoints', both roads decode, and one endpoint's answer is not another's", () => {
  const byCode = {
    route: 'device',
    userCode: 'WDJB-MJHT',
    verificationUri: 'https://github.com/login/device',
    until: '2026-11-04T00:15:00.000Z',
  };
  const byBrowser = { route: 'browser', authUrl: 'https://github.com/login/oauth/authorize?x=1', until: '2026-11-04T00:05:00.000Z' };
  assert.deepEqual(answered('mcpservers', 'signIn', byCode), byCode);
  assert.deepEqual(answered('mcpservers', 'signIn', byBrowser), byBrowser);
  assert.deepEqual(answered('mcpservers', 'signInState', { state: 'none' }), { state: 'none' });
  const waiting = { state: 'waiting', until: byCode.until, started: byCode };
  assert.deepEqual(answered('mcpservers', 'signInState', waiting), waiting, 'a page opened later reads what the sign-in answered');
  const failed = { state: 'failed', until: '2026-11-04T00:05:00.000Z', why: 'denied' };
  assert.deepEqual(answered('mcpservers', 'signInState', failed), failed);
  assert.deepEqual(answered('mcpservers', 'signOut', { ended: 'cancelled' }), { ended: 'cancelled' });
  assert.equal(answered('mcpservers', 'signOut', byCode), undefined);
  assert.equal(answered('mcpservers', 'signIn', { ended: 'signed-out' }), undefined);
});

test('REFUSED: a sign-in by a code with no code, a road off its words, and an ending off its words', () => {
  assert.equal(
    answered('mcpservers', 'signIn', { route: 'device', verificationUri: 'https://github.com/login/device', until: 'x' }),
    undefined,
  );
  assert.equal(answered('mcpservers', 'signIn', { route: 'telepathy', authUrl: 'https://x.example', until: 'x' }), undefined);
  assert.equal(answered('mcpservers', 'signOut', { ended: 'vanished' }), undefined);
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

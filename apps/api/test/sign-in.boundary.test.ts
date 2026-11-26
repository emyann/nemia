/**
 * A factory's server signed in to and out of from the board (src/factory/parts/mcp-servers.ts), over the runtime's stand-in for the four
 * sign-in verbs: the real ones poll a provider or spawn Claude Code and wait on a browser, which no api test does.
 *
 * The rules: the builtin github server signs in by a code, one that names a callback port by the browser; a later read answers what a
 * waiting sign-in answered, so a reload draws it again; a sign-out of a waiting one cancels it; and no body of the routes carries a
 * secret, a token or a device code.
 */
import { root } from './harness.ts';
import { beforeAll, describe, test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Layer } from 'effect';
import { BUILTIN_SERVERS, engine } from 'agent-orchestrator';
import { addFactory } from 'agent-orchestrator/testing';
import { Engine as RuntimeEngine } from 'agent-runtime';
import { testEngine } from 'agent-runtime/testing';
import { appOf, liveOf } from '../src/app.ts';
import { Engine } from '../src/store.ts';
import { scratch } from 'test-kit/scratch';

addFactory({ name: 'signmill', volumes: [scratch('nemia-api-sign-in-')].map((r) => `${r}:rw`) });
fs.mkdirSync(path.join(root, 'factories', 'signmill'), { recursive: true });

const GITHUB = JSON.parse(fs.readFileSync(path.join(BUILTIN_SERVERS, 'github.json'), 'utf8')) as Record<string, unknown>;

const BOARD = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' };
const URL = '/api/namespaces/signmill/mcpservers';

/** The same client, signing in by the browser: its app is registered on a callback port. */
const BROWSER = { ...GITHUB, oauth: { clientId: 'Iv23liQBfm9prqhvXkuY', callbackPort: 8791 } };

const SECRETS = /client_secret|access_token|refresh_token|device_code/i;

/**
 * An app whose engine answers the four sign-in verbs from the runtime's stand-in, and everything else from the package's engine: the
 * api has no door that hands its app the stand-in whole, which is why this file is a boundary test.
 */
const appWith = () => {
  const stand = testEngine();
  const signing = Effect.runSync(Effect.provide(Effect.service(RuntimeEngine), stand.layer));
  const e = {
    ...engine(process.env),
    mcpSignIn: signing.mcpSignIn,
    mcpSignInState: signing.mcpSignInState,
    mcpSignInCallback: signing.mcpSignInCallback,
    mcpSignOut: signing.mcpSignOut,
  };
  return { app: appOf(Layer.merge(liveOf(), Layer.succeed(Engine)(e as never))).app, stand };
};

/** The answer to `method` on `url`, as the board sends it: its status, and its body as text, so a search reads every byte. */
async function asked(
  app: ReturnType<typeof appWith>['app'],
  method: string,
  url: string,
  headers: Record<string, string> = BOARD,
  body = '{}',
) {
  const res = await app.request(url, { method, headers, ...(method === 'GET' ? {} : { body }) });
  return { status: res.status, text: await res.text() };
}

/** A server recorded for the factory, as the board's add form records the builtin one. */
async function recorded(app: ReturnType<typeof appWith>['app'], name: string, server: Record<string, unknown>) {
  const oauth = server.oauth as { clientId: string; callbackPort?: number } | undefined;
  const body = {
    url: server.url,
    ...(server.headers === undefined ? {} : { headers: server.headers }),
    ...(oauth ? { oauth } : {}),
  };
  const res = await app.request(`${URL}/${name}`, { method: 'PUT', headers: BOARD, body: JSON.stringify(body) });
  assert.equal(res.status, 200, await res.text());
}

test('the builtin github file holds the hosted server, its toolsets and its client, and no secret', () => {
  assert.deepEqual(GITHUB, {
    type: 'http',
    url: 'https://api.githubcopilot.com/mcp/',
    headers: { 'X-MCP-Toolsets': 'context,repos,issues,pull_requests,users,actions' },
    oauth: { clientId: 'Iv23liQBfm9prqhvXkuY' },
  });
  assert.equal(
    Object.keys(GITHUB.oauth as object).some((k) => /secret/i.test(k)),
    false,
    'the oauth part names no secret',
  );
});

test('a sign-in answers a code to type, a later read answers it again, and a sign-out cancels it — and no body carries a secret', async () => {
  const { app, stand } = appWith();
  await recorded(app, 'github', GITHUB);
  const started = await asked(app, 'POST', `${URL}/github/sign-in`);
  assert.equal(started.status, 200, started.text);
  const answer = JSON.parse(started.text) as { route: string; userCode: string; verificationUri: string; until: string };
  assert.equal(answer.route, 'device');
  assert.match(answer.userCode, /^[A-Z0-9-]+$/);
  assert.match(answer.verificationUri, /^https:\/\/github\.com\/login\/device/);
  assert.deepEqual(stand.signIns, [{ name: 'github', route: 'device' }]);
  const waiting = await asked(app, 'GET', `${URL}/github/sign-in`);
  assert.deepEqual(JSON.parse(waiting.text), { state: 'waiting', until: answer.until, started: answer }, 'a reload draws the code again');
  const cancelled = await asked(app, 'DELETE', `${URL}/github/sign-in`);
  assert.deepEqual([cancelled.status, JSON.parse(cancelled.text)], [200, { ended: 'cancelled' }]);
  assert.deepEqual(JSON.parse((await asked(app, 'GET', `${URL}/github/sign-in`)).text), { state: 'none' });
  assert.equal((await asked(app, 'POST', `${URL}/github/sign-in`)).status, 200, 'and the person may start again');
  stand.settleSignIn('github', { state: 'connected' });
  const connected = await asked(app, 'GET', `${URL}/github/sign-in`);
  assert.deepEqual(JSON.parse(connected.text), { state: 'connected' });
  const out = await asked(app, 'DELETE', `${URL}/github/sign-in`);
  assert.deepEqual([out.status, JSON.parse(out.text)], [200, { ended: 'signed-out' }]);
  const read = await asked(app, 'GET', '/api/mcpservers');
  const builtin = (JSON.parse(read.text) as { items: Array<{ metadata: { name: string }; spec: Record<string, unknown> }> }).items.map(
    (s) => ({ name: s.metadata.name, ...s.spec }),
  );
  assert.deepEqual(
    builtin.map((s) => s.name),
    ['github'],
    'the add form offers the builtin server',
  );
  for (const body of [started, waiting, cancelled, connected, out, read]) {
    assert.equal(SECRETS.test(body.text), false, `no answer carries a secret: ${body.text.slice(0, 80)}`);
  }
});

test('FIXTURE: a body that held a secret would be caught by the same search', () => {
  assert.equal(SECRETS.test(JSON.stringify({ builtin: [{ ...GITHUB, client_secret: 'x' }] })), true);
});

test('REFUSED: a server the factory does not record (404), a port another sign-in waits on (409), a bad name (422)', async () => {
  const { app } = appWith();
  await recorded(app, 'github', BROWSER);
  await recorded(app, 'twin', { ...BROWSER, url: 'https://twin.example/mcp' });
  assert.equal((await asked(app, 'POST', `${URL}/gitlab/sign-in`)).status, 404);
  assert.equal((await asked(app, 'POST', `${URL}/github/sign-in`)).status, 200);
  const held = await asked(app, 'POST', `${URL}/twin/sign-in`);
  assert.equal(held.status, 409, held.text);
  assert.match(held.text, /a sign-in to `github` already waits on port 8791/);
  assert.equal((await asked(app, 'POST', `${URL}/bad%20name/sign-in`)).status, 422);
  await recorded(app, 'docs', { type: 'http', url: 'https://docs.example/mcp' });
  assert.equal((await asked(app, 'POST', `${URL}/docs/sign-in`)).status, 422, 'a server with no OAuth client signs in to nothing');
});

describe('a pasted callback completes a waiting sign-in: answered its state, refused by kind, the address in no answer', () => {
  let app!: import('hono').Hono<import('../src/layer.ts').ApiEnv, import('hono/types').BlankSchema, '/'>;
  let stand!: import('agent-runtime/testing').TestEngine;
  beforeAll(async () => {
    ({ app, stand } = appWith());
    await recorded(app, 'github', BROWSER);
  });
  const CALLBACK = `${URL}/github/sign-in/callback`;
  const PASTED = 'http://localhost:8791/callback?code=a-code-of-the-sign-in&state=a-state';
  const paste = (url: unknown, at = CALLBACK) => asked(app, 'POST', at, BOARD, JSON.stringify({ url }));
  test('REFUSED: a callback where no sign-in waits is a 409, a server the factory does not record a 404', async () => {
    const none = await paste(PASTED);
    assert.equal(none.status, 409, none.text);
    assert.equal(none.text.includes('a-code-of-the-sign-in'), false, 'the pasted address is in no answer');
    assert.equal((await paste(PASTED, `${URL}/gitlab/sign-in/callback`)).status, 404);
  });
  test('REFUSED: a body with no url, or not a string, is a 400 naming the field', async () => {
    for (const body of ['{}', JSON.stringify({ url: 3 })]) {
      const res = await asked(app, 'POST', CALLBACK, BOARD, body);
      assert.equal(res.status, 400, res.text);
      assert.match((JSON.parse(res.text) as { field?: string }).field ?? '', /url/, res.text);
    }
  });
  test("REFUSED: an address that is not the sign-in's redirect is a 422, and nothing is handed on", async () => {
    assert.equal((await asked(app, 'POST', `${URL}/github/sign-in`)).status, 200);
    const wrong = await paste('http://localhost:9999/callback?code=a-code-of-the-sign-in&state=a-state');
    assert.equal(wrong.status, 422, wrong.text);
    assert.equal(wrong.text.includes('a-code-of-the-sign-in'), false, 'the pasted address is in no answer');
    assert.deepEqual(stand.callbacks, []);
  });
  test('the redirect with a code and a state is handed on and answers the SignInState, which reads connected once it settles', async () => {
    const handed = await paste(PASTED);
    assert.equal(handed.status, 200, handed.text);
    assert.equal((JSON.parse(handed.text) as { state: string }).state, 'waiting');
    assert.equal(handed.text.includes('a-code-of-the-sign-in'), false, 'the answer carries no part of the address');
    assert.deepEqual(stand.callbacks, [{ name: 'github', url: PASTED }]);
    stand.settleSignIn('github', { state: 'connected' });
    assert.deepEqual(JSON.parse((await asked(app, 'GET', `${URL}/github/sign-in`)).text), { state: 'connected' });
  });
});

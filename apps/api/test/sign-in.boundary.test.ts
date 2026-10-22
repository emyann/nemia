/**
 * A factory's server signed in to and out of from the board (src/servers/sign-in.ts), over the runtime's stand-in for the three
 * sign-in verbs: the real ones spawn Claude Code and wait on a browser, which no api test does.
 *
 * The rule the card rests on is that no answer carries the shipped secret: every body of the three routes, and the servers' read with
 * its shipped list, is searched for its value — and the fixture that breaks the search is a body that holds it.
 */
import { root } from './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Layer } from 'effect';
import { addFactory, engine } from 'agent-orchestrator';
import { Engine as RuntimeEngine } from 'agent-runtime';
import { testEngine } from 'agent-runtime/testing';
import { appOf, liveOf } from '../src/app.ts';
import { Engine } from '../src/store.ts';
import { scratch } from './scratch.ts';

addFactory({ name: 'signmill', repos: [scratch('nemia-api-sign-in-')] });
fs.mkdirSync(path.join(root, 'factories', 'signmill'), { recursive: true });

const SERVERS = path.join(import.meta.dirname, '..', '..', '..', 'workflows', 'servers');
const GITHUB = JSON.parse(fs.readFileSync(path.join(SERVERS, 'github.json'), 'utf8')) as Record<string, unknown>;

const BOARD = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' };
const URL = '/api/factories/signmill/servers';

/**
 * An app whose engine answers the three sign-in verbs from the runtime's stand-in, and everything else from the package's engine: the
 * api has no door that hands its app the stand-in whole, which is why this file is a boundary test. Every secret the package hands the
 * engine is caught in `handed`, so the search below looks for the very value the package holds, read off no file of its source.
 */
const appWith = () => {
  const stand = testEngine();
  const signing = Effect.runSync(Effect.provide(Effect.service(RuntimeEngine), stand.layer));
  const handed: string[] = [];
  const e = {
    ...engine(),
    mcpSignIn: (name: string, server: Parameters<typeof signing.mcpSignIn>[1], secret?: string) => {
      if (secret !== undefined) handed.push(secret);
      return signing.mcpSignIn(name, server, secret);
    },
    mcpSignInState: signing.mcpSignInState,
    mcpSignOut: signing.mcpSignOut,
  };
  return { app: appOf(Layer.merge(liveOf(), Layer.succeed(Engine)(e as never))).app, stand, handed };
};

/** The answer to `method` on `url`, as the board sends it: its status, and its body as text, so a search reads every byte. */
async function asked(app: ReturnType<typeof appWith>['app'], method: string, url: string, headers: Record<string, string> = BOARD) {
  const res = await app.request(url, { method, headers, ...(method === 'GET' ? {} : { body: '{}' }) });
  return { status: res.status, text: await res.text() };
}

/** A server recorded for the factory, as the board's add form records the shipped one. */
async function recorded(app: ReturnType<typeof appWith>['app'], name: string, server: Record<string, unknown>) {
  const oauth = server.oauth as { clientId: string; callbackPort: number } | undefined;
  const body = {
    url: server.url,
    header: Object.entries((server.headers ?? {}) as Record<string, string>).map(([k, v]) => `${k}=${v}`),
    ...(oauth ? { clientId: oauth.clientId, callbackPort: String(oauth.callbackPort) } : {}),
  };
  const res = await app.request(`${URL}/${name}`, { method: 'PUT', headers: BOARD, body: JSON.stringify(body) });
  assert.equal(res.status, 200, await res.text());
}

test('the shipped github file holds the hosted server, its toolsets and its client, and no secret', () => {
  assert.deepEqual(GITHUB, {
    type: 'http',
    url: 'https://api.githubcopilot.com/mcp/',
    headers: { 'X-MCP-Toolsets': 'context,repos,issues,pull_requests,users,actions' },
    oauth: { clientId: 'Iv23liQBfm9prqhvXkuY', callbackPort: 8791 },
  });
  assert.equal(
    Object.keys(GITHUB.oauth as object).some((k) => /secret/i.test(k)),
    false,
    'the oauth part names no secret',
  );
});

test('a sign-in answers the address to open, then its state; a sign-out answers that it signed out — and no body carries the secret', async () => {
  const { app, stand, handed } = appWith();
  await recorded(app, 'github', GITHUB);
  const started = await asked(app, 'POST', `${URL}/github/sign-in`);
  assert.equal(started.status, 200, started.text);
  const { authUrl, until } = JSON.parse(started.text) as { authUrl: string; until: string };
  assert.match(authUrl, /^https:\/\/github\.com\/login\/oauth\/authorize\?client_id=Iv23liQBfm9prqhvXkuY/);
  assert.equal(typeof until, 'string');
  assert.deepEqual(stand.signIns, [{ name: 'github', secret: true }], 'the shipped client was handed its secret, inside the package');
  const [SECRET] = handed;
  assert.ok(SECRET && SECRET.length >= 20, 'the secret the package handed the engine, which every answer is searched for');
  assert.equal(JSON.stringify(GITHUB).includes(SECRET), false, 'and the shipped file does not hold it');
  const waiting = await asked(app, 'GET', `${URL}/github/sign-in`);
  assert.equal(JSON.parse(waiting.text).state, 'waiting');
  const early = await asked(app, 'DELETE', `${URL}/github/sign-in`);
  assert.equal(early.status, 409, 'nothing to sign out of while the sign-in waits');
  stand.settleSignIn('github', { state: 'connected' });
  const connected = await asked(app, 'GET', `${URL}/github/sign-in`);
  assert.deepEqual(JSON.parse(connected.text), { state: 'connected' });
  const out = await asked(app, 'DELETE', `${URL}/github/sign-in`);
  assert.deepEqual([out.status, JSON.parse(out.text)], [200, { signedOut: true }]);
  const read = await asked(app, 'GET', URL);
  const shipped = (JSON.parse(read.text) as { shipped: Array<Record<string, unknown>> }).shipped;
  assert.deepEqual(
    shipped.map((s) => s.name),
    ['github'],
    'the add form offers the shipped server',
  );
  for (const body of [started, waiting, early, connected, out, read]) {
    assert.equal(body.text.includes(SECRET), false, `no answer carries the shipped secret: ${body.text.slice(0, 80)}`);
  }
  for (const s of shipped)
    assert.deepEqual(
      Object.keys(s).filter((k) => /secret/i.test(k)),
      [],
      'no key of a shipped server names a secret',
    );
});

test('FIXTURE: a body that held the secret would be caught by the same search', () => {
  const secret = 'a-secret-the-search-must-find';
  assert.equal(JSON.stringify({ shipped: [{ ...GITHUB, clientSecret: secret }] }).includes(secret), true);
});

test('REFUSED: a server the factory does not record (404), a port another sign-in waits on (409), a bad name (400), another site (403)', async () => {
  const { app } = appWith();
  await recorded(app, 'github', GITHUB);
  await recorded(app, 'twin', { ...GITHUB, url: 'https://twin.example/mcp' });
  assert.equal((await asked(app, 'POST', `${URL}/gitlab/sign-in`)).status, 404);
  assert.equal((await asked(app, 'POST', `${URL}/github/sign-in`)).status, 200);
  const held = await asked(app, 'POST', `${URL}/twin/sign-in`);
  assert.equal(held.status, 409, held.text);
  assert.match(held.text, /a sign-in to `github` already waits on port 8791/);
  assert.equal((await asked(app, 'POST', `${URL}/bad%20name/sign-in`)).status, 400);
  const foreign = await asked(app, 'POST', `${URL}/twin/sign-in`, { ...BOARD, 'sec-fetch-site': 'cross-site' });
  assert.equal(foreign.status, 403, 'a page on another site cannot start a sign-in');
  await recorded(app, 'docs', { type: 'http', url: 'https://docs.example/mcp' });
  assert.equal((await asked(app, 'POST', `${URL}/docs/sign-in`)).status, 422, 'a server with no OAuth client signs in to nothing');
});

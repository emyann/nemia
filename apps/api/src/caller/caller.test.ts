/**
 * What a request's route needs of a token (`callerGate`): a store not marked exposed takes a request with none as the person; one marked
 * exposed (`WF_EXPOSED=1` in the environment record its settings are read from) refuses it 401 `token-required` on every route, and
 * takes a token of the person's as the person and a live session's as its agent; and the MCP port refuses no token and a session's,
 * saying `WWW-Authenticate: Bearer`. Statuses and refusal words are asserted, never a sentence.
 *
 * On the stand-ins: the runtime's test engine, a session's task filed on it and left working (its token live), and the test place; the
 * tokens minted through the package's `TokenDoor` under the harness's store.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { storeConfigLayer, TokenDoor, tokenDoorFiles } from 'agent-orchestrator';
import { TOKEN_COOKIE } from 'objects';
import { appOver, eachTest, engineFor } from '../../test/placed.ts';
import { needOf } from './caller.ts';

const stand = eachTest(testPlace);
const standIn = eachTest(testEngine);
const engine = () => engineFor(standIn());
/** The app over a store not marked exposed. */
const app = eachTest(() => appOver(standIn(), stand()));
/** The app over the same store, marked exposed. */
const exposed = eachTest(() => appOver(standIn(), stand(), storeConfigLayer({ ...process.env, WF_ROOT: root, WF_EXPOSED: '1' })));

const TASK = 't-caller-session';

/** A token of the person's, named `caller-laptop`, minted through the token door over the harness's store. */
const personToken = Effect.runSync(
  Effect.gen(function* () {
    return yield* (yield* TokenDoor).persons.mint('caller-laptop');
  }).pipe(Effect.provide(tokenDoorFiles(root))),
);

/** A session's token, of no run, live while `TASK` is filed and unsettled. */
const sessionToken = Effect.runSync(
  Effect.gen(function* () {
    return yield* (yield* TokenDoor).tokens.mint({ agent: 'nemia', factory: null, run: null, step: null, attempt: 1, task: TASK });
  }).pipe(Effect.provide(tokenDoorFiles(root))),
);

/** The session's task filed on the stand-in and left working: its token is live. */
const sessionRunning = () => {
  Effect.runSync(engine().file({ id: TASK, brief: 'Be on.', cwd: root, harness: 'claude' }));
  standIn().settle(TASK, 'working');
};

/** A GET of `url` on `on`, presenting `bearer` where given. */
const get = (on: () => ReturnType<typeof appOver>, url: string, bearer?: string) =>
  on().request(url, bearer === undefined ? {} : { headers: { authorization: `Bearer ${bearer}` } });

/** The refusal word a 401 answers. */
const reasonOf = async (res: Response): Promise<string | undefined> => ((await res.json()) as { reason?: string }).reason;

test('a store not marked exposed: a request with no token is the person', async () => {
  assert.equal((await get(app, '/api/runs')).status, 200);
});

test('REFUSED 401 token-required: a store marked exposed refuses a request with no token, on any route', async () => {
  for (const url of ['/api/runs', '/api/health']) {
    const res = await get(exposed, url);
    assert.equal(res.status, 401, url);
    assert.equal(await reasonOf(res), 'token-required', url);
  }
});

test("a store marked exposed: a token of the person's is the person, and a live session's is its agent", async () => {
  assert.equal((await get(exposed, '/api/runs', personToken)).status, 200, "the person's token");
  sessionRunning();
  assert.equal((await get(exposed, '/api/runs', sessionToken)).status, 200, "a live session's token");
  standIn().settle(TASK, 'succeeded', { exitCode: 0, closeout: { outcome: 'done', summary: 'Done.', needs: null, artifacts: [] } });
  const ended = await get(exposed, '/api/runs', sessionToken);
  assert.equal(ended.status, 401, 'once the session ended');
  assert.equal(await reasonOf(ended), 'session-ended');
});

test("REFUSED 401 on the MCP port, exposed or not: no token, and a session's, each saying WWW-Authenticate: Bearer", async () => {
  sessionRunning();
  for (const [bearer, reason] of [
    [undefined, 'token-required'],
    [sessionToken, 'person-token-required'],
    ['never-minted', 'unknown-token'],
  ] as const) {
    const res = await get(app, '/mcp', bearer);
    assert.equal(res.status, 401, reason);
    assert.equal(await reasonOf(res), reason);
    assert.equal(res.headers.get('www-authenticate'), 'Bearer', reason);
  }
  const passed = await get(app, '/mcp', personToken);
  assert.notEqual(passed.status, 401, "the person's token passes the gate");
  assert.equal(passed.headers.get('www-authenticate'), null);
});

test('needOf: the MCP port needs the person, the api’s routes a token where exposed, and the board’s pages none', () => {
  for (const path of ['/mcp', '/mcp/x']) {
    assert.equal(needOf(path, false), 'person', path);
    assert.equal(needOf(path, true), 'person', path);
  }
  for (const path of ['/api', '/api/runs', '/openapi', '/openapi/v3/nemia/v1']) {
    assert.equal(needOf(path, true), 'token', path);
    assert.equal(needOf(path, false), 'none', path);
  }
  for (const path of ['/', '/assets/x.js', '/runs/x', '/apifoo', '/mcpx']) {
    assert.equal(needOf(path, true), 'none', path);
    assert.equal(needOf(path, false), 'none', path);
  }
});

/** A GET of `url` on `on`, presenting `token` by the board's cookie alone. */
const byCookie = (on: () => ReturnType<typeof appOver>, url: string, token: string) =>
  on().request(url, { headers: { cookie: `other=1; ${TOKEN_COOKIE}=${token}` } });

test("a store marked exposed: the board's cookie holding a token of the person's reads its runs, with no Authorization", async () => {
  assert.equal((await byCookie(exposed, '/api/runs', personToken)).status, 200);
});

test('REFUSED 401 unknown-token: a forged cookie is judged as a forged bearer is, exposed or not', async () => {
  for (const on of [exposed, app]) {
    const res = await byCookie(on, '/api/runs', 'never-minted');
    assert.equal(res.status, 401);
    assert.equal(await reasonOf(res), 'unknown-token');
  }
});

test('a bearer is judged before the cookie: a live bearer passes beside a forged cookie', async () => {
  const res = await exposed().request('/api/runs', {
    headers: { authorization: `Bearer ${personToken}`, cookie: `${TOKEN_COOKIE}=never-minted` },
  });
  assert.equal(res.status, 200);
});

/** The `Set-Cookie` of `res`'s answer, split into its attributes, each in lower case but the first. */
const setCookieOf = (res: Response): string[] =>
  (res.headers.get('set-cookie') ?? '').split(';').map((part, i) => (i === 0 ? part.trim() : part.trim().toLowerCase()));

/** A session request of `method` on `on`, as the board sends one: JSON, from its own page, presenting `bearer` where given. */
const session = (
  on: () => ReturnType<typeof appOver>,
  method: 'POST' | 'DELETE',
  bearer?: string,
  url = 'http://127.0.0.1:8787/api/session',
) =>
  on().request(url, {
    method,
    headers: {
      'content-type': 'application/json',
      'sec-fetch-site': 'same-origin',
      ...(bearer === undefined ? {} : { authorization: `Bearer ${bearer}` }),
    },
    body: method === 'POST' ? '{}' : undefined,
  });

test("POST /api/session sets the person's token as the board's HttpOnly, SameSite=Strict cookie, Secure over https alone", async () => {
  const res = await session(exposed, 'POST', personToken);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { cookie: 'set' });
  const cookie = setCookieOf(res);
  assert.equal(cookie[0], `${TOKEN_COOKIE}=${personToken}`);
  for (const part of ['httponly', 'samesite=strict', 'path=/', 'max-age=2592000']) assert.ok(cookie.includes(part), part);
  assert.ok(!cookie.includes('secure'), 'no Secure on plain http, which a browser would drop');
  const https = setCookieOf(await session(exposed, 'POST', personToken, 'https://nemia.example/api/session'));
  assert.ok(https.includes('secure'), 'Secure over https');
  const proxied = setCookieOf(
    await exposed().request('/api/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${personToken}`, 'x-forwarded-proto': 'https' },
      body: '{}',
    }),
  );
  assert.ok(proxied.includes('secure'), 'Secure behind a proxy that says https');
});

test('REFUSED: POST /api/session with no bearer, 400 where the store is not exposed, the gate’s 401 where it is', async () => {
  const plain = await session(app, 'POST');
  assert.equal(plain.status, 400);
  assert.equal(plain.headers.get('set-cookie'), null);
  const gated = await session(exposed, 'POST');
  assert.equal(gated.status, 401);
  assert.equal(await reasonOf(gated), 'token-required');
  const forged = await session(exposed, 'POST', 'never-minted');
  assert.equal(forged.status, 401);
  assert.equal(await reasonOf(forged), 'unknown-token');
  assert.equal(forged.headers.get('set-cookie'), null, 'a forged token sets no cookie');
});

test("DELETE /api/session clears the board's cookie, sent by the cookie alone from the board at a private network's address", async () => {
  const res = await exposed().request('http://100.64.0.1:8787/api/session', {
    method: 'DELETE',
    headers: {
      host: '100.64.0.1:8787',
      'content-type': 'application/json',
      'sec-fetch-site': 'same-origin',
      cookie: `${TOKEN_COOKIE}=${personToken}`,
    },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { cookie: 'cleared' });
  const cookie = setCookieOf(res);
  assert.equal(cookie[0], `${TOKEN_COOKIE}=`);
  for (const part of ['httponly', 'samesite=strict', 'path=/', 'max-age=0']) assert.ok(cookie.includes(part), part);
});

test("REFUSED 403 site: a write by the board's cookie alone from a page on another port of the same host", async () => {
  const res = await exposed().request('http://100.64.0.1:8787/api/session', {
    method: 'DELETE',
    headers: {
      host: '100.64.0.1:8787',
      'content-type': 'application/json',
      'sec-fetch-site': 'same-site',
      cookie: `${TOKEN_COOKIE}=${personToken}`,
    },
  });
  assert.equal(res.status, 403);
  assert.equal(await reasonOf(res), 'site');
});

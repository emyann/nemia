/**
 * What a request's route needs of a token (`callerGate`): every route the api answers takes one, on a store marked exposed
 * (`WF_EXPOSED=1` in the environment record its settings are read from) or not, loopback included, so a request with none is refused
 * 401 `token-required` and never the person; a token the person holds is the person under its name, by the bearer or the board's cookie,
 * one minted before tokens said their holder included; a live session's is its agent; and the MCP port takes a standing token, the
 * person's or an agent's, and refuses none and a session's, saying `WWW-Authenticate: Bearer`. Statuses and refusal words are asserted,
 * never a sentence.
 *
 * On the stand-ins: the runtime's test engine, a session's task filed on it and left working (its token live), and the test place; the
 * tokens minted through the package's `TokenDoor` under the harness's store. Who the gate made a request out to be is read off a route
 * of the test's own behind the gate (`whoIs`), over the app's runtime.
 */
import { NO_TOKEN, root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Layer } from 'effect';
import { Hono } from 'hono';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { storeConfigLayer, tokenDigest, TokenDoor, tokenDoorFiles, type ProposalCaller, type TokenHolder } from 'agent-orchestrator';
import { Api, TOKEN_COOKIE } from 'objects';
import { answerError, appOf, liveOf } from '../app.ts';
import { Engine } from '../store.ts';
import type { ApiEnv } from '../layer.ts';
import { appOver, eachTest, engineFor } from '../../test/placed.ts';
import { callerGate, needOf } from './caller.ts';

const stand = eachTest(testPlace);
const standIn = eachTest(testEngine);
const engine = () => engineFor(standIn());
/** The app over a store not marked exposed. */
const app = eachTest(() => appOver(standIn(), stand()));
/** The app over the same store, marked exposed. */
const exposed = eachTest(() => appOver(standIn(), stand(), storeConfigLayer({ ...process.env, WF_ROOT: root, WF_EXPOSED: '1' })));

/** A token minted through the token door over the harness's store, under `name`, held by `holder` (the person where left out). */
const minted = (name: string, holder?: TokenHolder): string =>
  Effect.runSync(
    Effect.gen(function* () {
      return yield* (yield* TokenDoor).persons.mint(name, holder);
    }).pipe(Effect.provide(tokenDoorFiles(root))),
  );

/** A token of the person's, named `caller-laptop`. */
const personToken = minted('caller-laptop');

/** A token the person minted for the agent `operator`, store-wide and not narrowed, named `caller-ops`. */
const agentToken = minted('caller-ops', { kind: 'agent', agent: 'operator', factory: null, narrowed: null });

/**
 * A standing token kept as one minted before tokens said who holds them: its record a name and a time, and no `holder`, as the store
 * kept every standing token then.
 */
const formerToken = 'caller-former-0123456789abcdefghijklmnopqrstuvw';
fs.writeFileSync(
  path.join(root, 'person-tokens', `${tokenDigest(formerToken)}.json`),
  `${JSON.stringify({ name: 'caller-former', createdAt: '2026-01-01T00:00:00.000Z' })}\n`,
  { mode: 0o600 },
);

const TASK = 't-caller-session';

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

/** A GET of `url` on `on`, presenting `bearer` where given, and no token at all where not. */
const get = (on: () => ReturnType<typeof appOver>, url: string, bearer?: string) =>
  on().request(url, { headers: bearer === undefined ? NO_TOKEN : { authorization: `Bearer ${bearer}` } });

/**
 * Who the gate makes a request presenting `headers` out to be, on an app over the stand-ins: a route of the test's own behind
 * `callerGate`, at a path the api answers (`needOf` says `token`), answering the caller the gate put on the request; a refusal answered by
 * the api's one map (`answerError`).
 */
const whoIs = async (headers: Record<string, string>): Promise<ProposalCaller> => {
  const { runtime } = appOf(Layer.mergeAll(liveOf(), Engine.over(standIn().layer), stand().layer));
  const gated = new Hono<ApiEnv>()
    .use(async (c, next) => {
      c.set('runtime', runtime);
      await next();
    })
    .use(callerGate)
    .get('/api/caller', (c) => c.json(c.var.caller))
    .onError(answerError);
  const res = await gated.request('/api/caller', { headers });
  assert.equal(res.status, 200, `the gate passes ${JSON.stringify(headers)}`);
  return (await res.json()) as ProposalCaller;
};

/** The refusal word a 401 answers. */
const reasonOf = async (res: Response): Promise<string | undefined> => ((await res.json()) as { reason?: string }).reason;

/** The refusal word a 401 answers and whether it says the store is exposed, the board's token page reading both. */
const refusalOf = async (res: Response): Promise<{ reason?: string; exposed?: boolean }> => {
  const { reason, exposed } = (await res.json()) as { reason?: string; exposed?: boolean };
  return { reason, exposed };
};

test('REFUSED 401 token-required: a store not marked exposed, on loopback, refuses a request with no token: no request is the person for presenting none', async () => {
  for (const url of ['/api/runs', '/api/health', '/openapi/v3/nemia/v1']) {
    const res = await get(app, url);
    assert.equal(res.status, 401, url);
    assert.deepEqual(await refusalOf(res), { reason: 'token-required', exposed: false }, url);
  }
  const local = await app().request('http://127.0.0.1:8787/api/runs', { headers: { ...NO_TOKEN, host: '127.0.0.1:8787' } });
  assert.equal(local.status, 401, 'addressed to loopback by name');
  assert.deepEqual(await refusalOf(local), { reason: 'token-required', exposed: false });
  const unknown = await get(app, '/api/runs', 'never-minted');
  assert.deepEqual(await refusalOf(unknown), { reason: 'unknown-token', exposed: false }, 'a token the store never minted');
});

test('REFUSED 401 token-required: a store marked exposed refuses a request with no token, on any route', async () => {
  for (const url of ['/api/runs', '/api/health']) {
    const res = await get(exposed, url);
    assert.equal(res.status, 401, url);
    assert.deepEqual(await refusalOf(res), { reason: 'token-required', exposed: true }, url);
  }
  const unknown = await get(exposed, '/api/runs', 'never-minted');
  assert.deepEqual(await refusalOf(unknown), { reason: 'unknown-token', exposed: true }, 'a token the store never minted');
});

test("a store not marked exposed: a token of the person's is the person under the token's name, by the bearer or the board's cookie", async () => {
  assert.equal((await get(app, '/api/runs', personToken)).status, 200);
  assert.deepEqual(await whoIs({ authorization: `Bearer ${personToken}` }), { kind: 'person', token: 'caller-laptop' });
  assert.deepEqual(await whoIs({ cookie: `${TOKEN_COOKIE}=${personToken}` }), { kind: 'person', token: 'caller-laptop' });
});

test('a standing token minted before tokens said their holder, its record naming none, is the person under its name', async () => {
  assert.equal((await get(app, '/api/runs', formerToken)).status, 200);
  assert.deepEqual(await whoIs({ authorization: `Bearer ${formerToken}` }), { kind: 'person', token: 'caller-former' });
});

test("an agent's standing token is that agent under the token's name, store-wide and not narrowed, of no run", async () => {
  assert.deepEqual(await whoIs({ authorization: `Bearer ${agentToken}` }), {
    kind: 'agent',
    agent: 'operator',
    factory: null,
    run: null,
    step: null,
    token: 'caller-ops',
    narrowed: null,
  });
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
  for (const [token, holder] of [
    [personToken, "the person's"],
    [agentToken, "an agent's"],
    [formerToken, 'one minted before tokens said their holder'],
  ] as const) {
    const passed = await get(app, '/mcp', token);
    assert.notEqual(passed.status, 401, `${holder} standing token passes the gate`);
    assert.equal(passed.headers.get('www-authenticate'), null, holder);
  }
});

/** The routes a client with no token yet reaches, each by its method and path: a pairing asked, a pairing claimed, a link claimed. */
const OPEN_ROUTES = ['POST /api/pairings', 'POST /api/pairings/:id/claim', 'POST /api/links/claim'];

/** Every endpoint of the `Api`, as `<method> <path>`. */
const ROUTES = Object.values(Api.groups).flatMap((group) => Object.values(group.endpoints).map((e) => `${e.method} ${e.path}`));

/** `path` with every name filled in by one no object has. */
const filled = (path: string): string => path.replace(/:[A-Za-z]+/g, 'nothing-here');

test('needOf: exactly three routes of the Api need no token, each named by its method and path; every other one needs a token', () => {
  const none = ROUTES.filter((route) => {
    const [method = '', path = ''] = route.split(' ');
    return needOf(method, filled(path)) !== 'token';
  });
  assert.deepEqual([...none].sort(), [...OPEN_ROUTES].sort());
});

test('needOf: the MCP port needs a standing token, every api route a token on any store but the three open ones, the board’s pages none', () => {
  for (const path of ['/mcp', '/mcp/x']) assert.equal(needOf('GET', path), 'standing', path);
  for (const [method, path] of [
    ['GET', '/api'],
    ['GET', '/api/runs'],
    ['GET', '/openapi'],
    ['GET', '/openapi/v3/nemia/v1'],
    ['GET', '/api/pairings'],
    ['POST', '/api/pairings/approve'],
    ['POST', '/api/pairings/approve/'],
    ['GET', '/api/pairings/abc/claim'],
    ['POST', '/api/pairings/'],
    ['POST', '/api/pairings/claim'],
    ['POST', '/api/pairings//claim'],
    ['POST', '/api/pairings/a/b/claim'],
    ['POST', '/api/links'],
    ['GET', '/api/links/claim'],
    ['POST', '/api/links/claim/x'],
    ['POST', '/api/pair'],
    ['POST', '/api/pair/link'],
  ])
    assert.equal(needOf(method, path), 'token', `${method} ${path}: no request to the api is the person for presenting none`);
  for (const [method, path] of [
    ['POST', '/api/pairings'],
    ['POST', '/api/pairings/abc/claim'],
    ['POST', '/api/links/claim'],
  ])
    assert.equal(needOf(method, path), 'none', `${method} ${path}: it judges its own secret`);
  for (const path of ['/', '/assets/x.js', '/runs/x', '/apifoo', '/mcpx']) assert.equal(needOf('GET', path), 'none', path);
});

test('REFUSED 401 token-required: the pairings listed and a pairing approved, with no token, on a store marked exposed or not', async () => {
  for (const on of [app, exposed]) {
    const list = await get(on, '/api/pairings');
    assert.equal(list.status, 401, 'GET /api/pairings');
    assert.equal(await reasonOf(list), 'token-required');
    const approve = await on().request('/api/pairings/approve', {
      method: 'POST',
      headers: { ...NO_TOKEN, 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'ABCD-EFGH' }),
    });
    assert.equal(approve.status, 401, 'POST /api/pairings/approve');
    assert.equal(await reasonOf(approve), 'token-required');
  }
});

/** A GET of `url` on `on`, presenting `token` by the board's cookie alone. */
const byCookie = (on: () => ReturnType<typeof appOver>, url: string, token: string) =>
  on().request(url, { headers: { cookie: `other=1; ${TOKEN_COOKIE}=${token}` } });

test("a store marked exposed: the board's cookie holding a token of the person's reads its runs, with no Authorization", async () => {
  assert.equal((await byCookie(exposed, '/api/runs', personToken)).status, 200);
});

test('REFUSED 401 unknown-token: a forged cookie is judged as a forged bearer is, exposed or not, and the refusal clears it', async () => {
  for (const on of [exposed, app]) {
    const res = await byCookie(on, '/api/runs', 'never-minted');
    assert.equal(res.status, 401);
    assert.equal(await reasonOf(res), 'unknown-token');
    const cleared = setCookieOf(res);
    assert.equal(cleared[0], `${TOKEN_COOKIE}=`);
    assert.ok(cleared.includes('max-age=0'), 'the stale cookie is cleared');
  }
  const byBearer = await exposed().request('/api/runs', { headers: { authorization: 'Bearer never-minted' } });
  assert.equal(byBearer.headers.get('set-cookie'), null, 'a refused bearer clears nothing');
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

test("the board's sign-in renews itself: a GET the person's cookie alone signed in sets the same cookie again, kept thirty days", async () => {
  for (const on of [app, exposed]) {
    const res = await byCookie(on, '/api/runs', personToken);
    assert.equal(res.status, 200);
    const cookie = setCookieOf(res);
    assert.equal(cookie[0], `${TOKEN_COOKIE}=${personToken}`);
    for (const part of ['httponly', 'samesite=strict', 'path=/', 'max-age=2592000']) assert.ok(cookie.includes(part), part);
    assert.ok(!cookie.includes('secure'), 'no Secure on plain http');
  }
  const proxied = await exposed().request('/api/runs', {
    headers: { cookie: `${TOKEN_COOKIE}=${personToken}`, 'x-forwarded-proto': 'https' },
  });
  assert.ok(setCookieOf(proxied).includes('secure'), 'Secure behind a proxy that says https');
  const https = await exposed().request('https://nemia.example/api/runs', { headers: { cookie: `${TOKEN_COOKIE}=${personToken}` } });
  assert.ok(setCookieOf(https).includes('secure'), 'Secure over https');
});

test("REFUSED a renewal: a bearer, an agent's token or a session's in the cookie, and a write by the person's cookie set no cookie", async () => {
  sessionRunning();
  const bearer = await get(exposed, '/api/runs', personToken);
  assert.equal(bearer.status, 200);
  assert.equal(bearer.headers.get('set-cookie'), null, "the person's token as a bearer");
  for (const [token, who] of [
    [agentToken, "an agent's standing token"],
    [sessionToken, "a session's token"],
  ] as const) {
    const res = await byCookie(exposed, '/api/runs', token);
    assert.equal(res.status, 200, who);
    assert.equal(res.headers.get('set-cookie'), null, who);
  }
  const write = await exposed().request('http://127.0.0.1:8787/api/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', cookie: `${TOKEN_COOKIE}=${personToken}` },
    body: '{}',
  });
  assert.equal(write.status, 400);
  assert.equal(write.headers.get('set-cookie'), null, "a write by the person's cookie");
});

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
      ...(bearer === undefined ? NO_TOKEN : { authorization: `Bearer ${bearer}` }),
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

test('REFUSED: POST /api/session with no token, the gate’s 401 on every store; by the board’s cookie and no bearer, 400', async () => {
  for (const on of [app, exposed]) {
    const gated = await session(on, 'POST');
    assert.equal(gated.status, 401);
    assert.equal(await reasonOf(gated), 'token-required');
    assert.equal(gated.headers.get('set-cookie'), null);
  }
  const plain = await app().request('http://127.0.0.1:8787/api/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', cookie: `${TOKEN_COOKIE}=${personToken}` },
    body: '{}',
  });
  assert.equal(plain.status, 400, 'the cookie passes the gate, and the route takes the token to keep as the bearer alone');
  assert.equal(plain.headers.get('set-cookie'), null);
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

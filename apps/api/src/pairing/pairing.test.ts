/**
 * The pairing routes on a store marked exposed (`WF_EXPOSED=1`): a client with no token asks for a pairing and claims it, the person lists
 * and approves it, and the token the claim answers is one the api then takes; a first-visit link sets the board's HttpOnly cookie once.
 * The person's side refuses no token (401) and a session's (403 `person-only`). Statuses, phases and cookie attributes are asserted,
 * never a sentence. A pairing and a link's claim, the writes with no token, are taken from another device at a name the store is served at
 * (`WF_SERVED_NAMES`, the address it binds), and refused for their host at any other, and at every name but the loopback on a store not
 * marked exposed.
 *
 * On the stand-ins: the runtime's test engine, a session's task filed on it and left working (its token live), and the test place; the
 * tokens minted through the package's `TokenDoor` under the harness's store.
 */
import { NO_TOKEN, root } from '../../test/harness.ts';
import { beforeAll, describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { boardBase, storeConfigLayer, TokenDoor, tokenDoorAt } from 'agent-orchestrator';
import { TOKEN_COOKIE, type LinkClaimed, type Pairing, type PairingAsked, type PairingClaimed, type PairingList } from 'objects';
import { appOver, eachTest, engineFor } from '../../test/placed.ts';
import { ApiConfig } from '../layer.ts';

const stand = eachTest(testPlace);
const standIn = eachTest(testEngine);
/** The app over the harness's store, marked exposed. */
const exposed = eachTest(() => appOver(standIn(), stand(), storeConfigLayer({ ...process.env, WF_ROOT: root, WF_EXPOSED: '1' })));

const TASK = 't-pairing-session';

/** A token of the person's, minted through the token door over the harness's store. */
const personToken = Effect.runSync(
  Effect.gen(function* () {
    return yield* (yield* TokenDoor).persons.mint('pairing-laptop');
  }).pipe(Effect.provide(tokenDoorAt(root))),
);

/** A session's token, of no run, live while `TASK` is filed and unsettled. */
const sessionToken = Effect.runSync(
  Effect.gen(function* () {
    return yield* (yield* TokenDoor).tokens.mint({ agent: 'nemia', factory: null, run: null, step: null, attempt: 1, task: TASK });
  }).pipe(Effect.provide(tokenDoorAt(root))),
);

/** The session's task filed on the stand-in and left working: its token is live. */
const sessionRunning = () => {
  Effect.runSync(engineFor(standIn()).file({ id: TASK, brief: 'Be on.', cwd: root, harness: 'claude' }));
  standIn().settle(TASK, 'working');
};

/**
 * A request of `method` to `url` on the exposed app, as a client sends one: JSON, presenting `bearer` where given, and no token where
 * not.
 */
const send = (method: 'GET' | 'POST', url: string, body?: unknown, bearer?: string) =>
  exposed().request(url, {
    method,
    headers: {
      'content-type': 'application/json',
      'sec-fetch-site': 'same-origin',
      ...(bearer === undefined ? NO_TOKEN : { authorization: `Bearer ${bearer}` }),
    },
    ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
  });

/** A pairing asked for `client`, with no token. */
const asked = async (client: string) => {
  const res = await send('POST', '/api/pairings', { client });
  assert.equal(res.status, 200, await res.clone().text());
  return (await res.json()) as PairingAsked;
};

/** The `Set-Cookie` of `res`'s answer, split into its attributes, each in lower case but the first. */
const setCookieOf = (res: Response) =>
  (res.headers.get('set-cookie') ?? '').split(';').map((part, i) => (i === 0 ? part.trim() : part.trim().toLowerCase()));

test('an exposed store: a pairing is asked with no token, and the pairings are listed with one alone', async () => {
  const pairing = await asked('laptop');
  assert.match(pairing.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/, 'a short code shown with its dash');
  assert.equal((await send('GET', '/api/pairings')).status, 401, 'no token: the list is refused');
  const listed = (await (await send('GET', '/api/pairings', undefined, personToken)).json()) as PairingList;
  const mine = listed.pairings.find((p) => p.id === pairing.id);
  assert.equal(mine?.phase, 'waiting');
  assert.ok(!JSON.stringify(listed).includes(pairing.secret), 'the list carries no secret');
});

test('a full pairing: asked, waiting, approved by the person, claimed once, and its token taken by the api', async () => {
  const pairing = await asked('desk');
  const claim = (secret = pairing.secret) => send('POST', `/api/pairings/${pairing.id}/claim`, { secret });
  assert.deepEqual((await (await claim()).json()) as PairingClaimed, { phase: 'waiting' }, 'waiting until the person approves');
  assert.equal((await claim('not-the-secret')).status, 404, 'a wrong secret');

  const approve = (bearer?: string) => send('POST', '/api/pairings/approve', { code: pairing.code.toLowerCase() }, bearer);
  assert.equal((await approve()).status, 401, 'no token: refused at the gate');
  sessionRunning();
  const bySession = await approve(sessionToken);
  assert.equal(bySession.status, 403, "a session's token approves no pairing");
  assert.equal(((await bySession.json()) as { reason?: string }).reason, 'person-only');
  const approved = await approve(personToken);
  assert.equal(approved.status, 200, await approved.clone().text());
  assert.equal(((await approved.json()) as Pairing).phase, 'claimable');

  const claimed = (await (await claim()).json()) as PairingClaimed;
  assert.equal(claimed.phase, 'claimed');
  assert.ok(claimed.token, 'the token is answered once, at the claim');
  assert.equal((await claim()).status, 409, 'a second claim is refused');
  assert.equal((await send('GET', '/api/runs', undefined, claimed.token)).status, 200, 'the api takes the token the claim minted');
});

test('a first-visit link: made by the person alone, claimed with no token into the HttpOnly cookie, once', async () => {
  sessionRunning();
  assert.equal((await send('POST', '/api/links', { base: 'http://127.0.0.1:8787' }, sessionToken)).status, 403, "a session's token");
  assert.equal((await send('POST', '/api/links', { base: 'ftp://nowhere' }, personToken)).status, 422, 'a base that is no http url');
  const made = await send('POST', '/api/links', { base: 'http://127.0.0.1:8787' }, personToken);
  assert.equal(made.status, 200, await made.clone().text());
  const secret = new URL(((await made.json()) as { url: string }).url).searchParams.get('link');
  assert.ok(secret);

  const res = await send('POST', '/api/links/claim', { secret });
  assert.equal(res.status, 200, await res.clone().text());
  const body = (await res.json()) as LinkClaimed;
  assert.equal(body.cookie, 'set');
  assert.ok(!('token' in body), 'the answer never carries the token');
  const cookie = setCookieOf(res);
  const token = cookie[0]?.slice(`${TOKEN_COOKIE}=`.length);
  assert.ok(token && cookie[0]?.startsWith(`${TOKEN_COOKIE}=`), "the board's cookie is set");
  for (const part of ['httponly', 'samesite=strict', 'path=/']) assert.ok(cookie.includes(part), part);
  const byCookie = await exposed().request('/api/runs', { headers: { cookie: `${TOKEN_COOKIE}=${token}` } });
  assert.equal(byCookie.status, 200, 'the cookie reads the store');
  assert.equal((await send('POST', '/api/links/claim', { secret })).status, 409, 'a second claim is refused');
});

test("a first-visit link made with no base is printed under the board's own address, no api ticking the store", async () => {
  const res = await send('POST', '/api/links', {}, personToken);
  assert.equal(res.status, 200, await res.clone().text());
  const url = new URL(((await res.json()) as { url: string }).url);
  assert.equal(url.origin, new URL(boardBase(undefined, process.env)).origin);
  assert.ok(url.searchParams.get('link'));
});

const SERVED = 'nemia.taile26745.ts.net';
const BOUND = '100.64.0.7';
/** The app over the harness's store, declaring `SERVED` and bound on `BOUND`, marked exposed where `exposedStore` is. */
const servedApp = (exposedStore: boolean) => {
  const env = { ...process.env, WF_ROOT: root, NEMIA_BIND: BOUND, WF_SERVED_NAMES: SERVED, ...(exposedStore ? { WF_EXPOSED: '1' } : {}) };
  return appOver(standIn(), stand(), storeConfigLayer(env), ApiConfig.layer(env));
};

/** A write with no token of `body` to `url` on `app`, addressed to `host` as a browser on another device names it. */
const sentTo = (app: ReturnType<typeof servedApp>, host: string, url: string, body: unknown) =>
  app.request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', host, ...NO_TOKEN },
    body: JSON.stringify(body),
  });

/** A first-visit link made by the person under `base`, its secret. */
const linkUnder = async (base: string) => {
  const made = await send('POST', '/api/links', { base }, personToken);
  assert.equal(made.status, 200, await made.clone().text());
  const secret = new URL(((await made.json()) as { url: string }).url).searchParams.get('link');
  assert.ok(secret);
  return secret;
};

/** The status of `res` and the reason its answer gives, where it gives one. */
const statusOf = async (res: Response) => [res.status, res.status === 200 ? undefined : ((await res.json()) as { reason?: string }).reason];

describe('an exposed store takes a pairing and a link claim at a name it is served at, and refuses them at any other name', () => {
  let app!: import('hono').Hono<import('../layer.ts').ApiEnv, import('hono/types').BlankSchema, '/'>;
  beforeAll(() => {
    app = servedApp(true);
  });
  test('a pairing asked at the declared name, on any port and in any case, is taken, and claimed there', async () => {
    for (const host of [`${SERVED}:8787`, 'Nemia.Taile26745.ts.net']) {
      const res = await sentTo(app, host, '/api/pairings', { client: 'phone' });
      assert.equal(res.status, 200, `${host}: ${await res.clone().text()}`);
      const pairing = (await res.json()) as PairingAsked;
      const claimed = await sentTo(app, host, `/api/pairings/${pairing.id}/claim`, { secret: pairing.secret });
      assert.equal(((await claimed.json()) as PairingClaimed).phase, 'waiting', host);
    }
  });
  test('a pairing asked at the address the store binds is taken', async () =>
    assert.deepEqual(await statusOf(await sentTo(app, `${BOUND}:8787`, '/api/pairings', { client: 'phone' })), [200, undefined]));
  test('a pairing asked at the loopback is taken as on every store', async () => {
    for (const host of ['127.0.0.1:8787', 'localhost:8787', '[::1]:8787'])
      assert.deepEqual(await statusOf(await sentTo(app, host, '/api/pairings', { client: 'desk' })), [200, undefined], host);
  });
  test('REFUSED 403 host: a pairing asked at any other name — a site whose name points here, a name beside the declared one', async () => {
    for (const host of ['evil.example:8787', `evil.${SERVED}:8787`, `${SERVED}.evil.example`, '100.64.0.70:8787'])
      assert.deepEqual(await statusOf(await sentTo(app, host, '/api/pairings', { client: 'phone' })), [403, 'host'], host);
  });
  test("a first-visit link printed under the declared name is claimed there, into the board's cookie", async () => {
    const secret = await linkUnder(`http://${SERVED}:8787`);
    const res = await sentTo(app, `${SERVED}:8787`, '/api/links/claim', { secret });
    assert.equal(res.status, 200, await res.clone().text());
    assert.equal(((await res.json()) as LinkClaimed).cookie, 'set');
  });
  test('REFUSED 403 host: a link printed under a name not declared is not claimed at that name, its base no name the store takes', async () => {
    const secret = await linkUnder('http://elsewhere.example:8787');
    assert.deepEqual(await statusOf(await sentTo(app, 'elsewhere.example:8787', '/api/links/claim', { secret })), [403, 'host']);
    assert.deepEqual(
      await statusOf(await sentTo(app, `${SERVED}:8787`, '/api/links/claim', { secret })),
      [200, undefined],
      'claimed at a declared name',
    );
  });
});

test('REFUSED 403 host: a store not marked exposed takes a pairing at the loopback alone, its declared names and bind none', async () => {
  const app = servedApp(false);
  for (const host of [`${SERVED}:8787`, `${BOUND}:8787`])
    assert.deepEqual(await statusOf(await sentTo(app, host, '/api/pairings', { client: 'phone' })), [403, 'host'], host);
  assert.deepEqual(await statusOf(await sentTo(app, '127.0.0.1:8787', '/api/pairings', { client: 'desk' })), [200, undefined]);
});

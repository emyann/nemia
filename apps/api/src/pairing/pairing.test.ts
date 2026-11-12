/**
 * The pairing routes on a store marked exposed (`WF_EXPOSED=1`): a client with no token asks for a pairing and claims it, the person lists
 * and approves it, and the token the claim answers is one the api then takes; a first-visit link sets the board's HttpOnly cookie once.
 * The person's side refuses no token (401) and a session's (403). Statuses, phases and cookie attributes are asserted, never a sentence.
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
import { boardBase, storeConfigLayer, TokenDoor, tokenDoorFiles } from 'agent-orchestrator';
import { TOKEN_COOKIE, type LinkClaimed, type Pairing, type PairingAsked, type PairingClaimed, type PairingList } from 'objects';
import { appOver, eachTest, engineFor } from '../../test/placed.ts';

const stand = eachTest(testPlace);
const standIn = eachTest(testEngine);
/** The app over the harness's store, marked exposed. */
const exposed = eachTest(() => appOver(standIn(), stand(), storeConfigLayer({ ...process.env, WF_ROOT: root, WF_EXPOSED: '1' })));

const TASK = 't-pairing-session';

/** A token of the person's, minted through the token door over the harness's store. */
const personToken = Effect.runSync(
  Effect.gen(function* () {
    return yield* (yield* TokenDoor).persons.mint('pairing-laptop');
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
  Effect.runSync(engineFor(standIn()).file({ id: TASK, brief: 'Be on.', cwd: root, harness: 'claude' }));
  standIn().settle(TASK, 'working');
};

/** A request of `method` to `url` on the exposed app, as a client sends one: JSON, presenting `bearer` where given. */
const send = (method: 'GET' | 'POST', url: string, body?: unknown, bearer?: string) =>
  exposed().request(url, {
    method,
    headers: {
      'content-type': 'application/json',
      'sec-fetch-site': 'same-origin',
      ...(bearer === undefined ? {} : { authorization: `Bearer ${bearer}` }),
    },
    ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
  });

/** A pairing asked for `client`, with no token. */
const asked = async (client: string): Promise<PairingAsked> => {
  const res = await send('POST', '/api/pair', { client });
  assert.equal(res.status, 200, await res.clone().text());
  return (await res.json()) as PairingAsked;
};

/** The `Set-Cookie` of `res`'s answer, split into its attributes, each in lower case but the first. */
const setCookieOf = (res: Response): string[] =>
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
  const claim = (secret = pairing.secret) => send('POST', `/api/pair/${pairing.id}/claim`, { secret });
  assert.deepEqual((await (await claim()).json()) as PairingClaimed, { phase: 'waiting' }, 'waiting until the person approves');
  assert.equal((await claim('not-the-secret')).status, 404, 'a wrong secret');

  const approve = (bearer?: string) => send('POST', `/api/pairings/${pairing.code.toLowerCase()}/approve`, {}, bearer);
  assert.equal((await approve()).status, 401, 'no token: refused at the gate');
  sessionRunning();
  assert.equal((await approve(sessionToken)).status, 403, "a session's token approves no pairing");
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
  assert.equal((await send('POST', '/api/links', { base: 'ftp://nowhere' }, personToken)).status, 400, 'a base that is no http url');
  const made = await send('POST', '/api/links', { base: 'http://127.0.0.1:8787' }, personToken);
  assert.equal(made.status, 200, await made.clone().text());
  const secret = new URL(((await made.json()) as { url: string }).url).searchParams.get('link');
  assert.ok(secret);

  const res = await send('POST', '/api/pair/link', { secret });
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
  assert.equal((await send('POST', '/api/pair/link', { secret })).status, 409, 'a second claim is refused');
});

test("a first-visit link made with no base is printed under the board's own address, no api ticking the store", async () => {
  const res = await send('POST', '/api/links', {}, personToken);
  assert.equal(res.status, 200, await res.clone().text());
  const url = new URL(((await res.json()) as { url: string }).url);
  assert.equal(url.origin, new URL(boardBase(undefined, process.env)).origin);
  assert.ok(url.searchParams.get('link'));
});

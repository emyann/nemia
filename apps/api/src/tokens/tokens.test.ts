/**
 * The tokens group (`objects`' `TokensGroup`, tokens.ts), the person's alone: a token of the person's mints a token for themselves and
 * one for an agent, bound to a factory and narrowed; lists them by name and holder, never a token or its digest; and retires one, which
 * the gate then refuses. A token an agent holds and a session's are refused 403 `person-only` on each route, a request with none 401
 * `token-required`, and a factory with no agent 422. Statuses, refusal words and the answers' keys are asserted, never a sentence.
 *
 * On the stand-ins: the runtime's test engine, a session's task filed on it and left working (its token live), and the test place; the
 * tokens the test presents minted through the package's `TokenDoor` under the harness's store.
 */
import { NO_TOKEN, root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { TokenDoor, tokenDoorFiles, type TokenHolder } from 'agent-orchestrator';
import type { Token, TokenList, TokenMinted } from 'objects';
import { appOver, eachTest, engineFor } from '../../test/placed.ts';

const stand = eachTest(testPlace);
const standIn = eachTest(testEngine);
const app = eachTest(() => appOver(standIn(), stand()));

/** A standing token minted through the token door over the harness's store, under `name`, held by `holder` (the person where left out). */
const minted = (name: string, holder?: TokenHolder): string =>
  Effect.runSync(
    Effect.gen(function* () {
      return yield* (yield* TokenDoor).persons.mint(name, holder);
    }).pipe(Effect.provide(tokenDoorFiles(root))),
  );

/** A token of the person's. */
const personToken = minted('tokens-laptop');

/** A standing token the person minted for the agent `operator`, store-wide and not narrowed. */
const agentToken = minted('tokens-ops', { kind: 'agent', agent: 'operator', factory: null, narrowed: null });

const TASK = 't-tokens-session';

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

/** A request of `method` to `url`, as a client sends one: JSON, presenting `bearer`, or no token at all where it is `null`. */
const send = (method: 'GET' | 'POST' | 'DELETE', url: string, bearer: string | null, body?: unknown) =>
  app().request(url, {
    method,
    headers: { 'content-type': 'application/json', ...(bearer === null ? NO_TOKEN : { authorization: `Bearer ${bearer}` }) },
    ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
  });

/** The refusal word an answer carries. */
const reasonOf = async (res: Response): Promise<string | undefined> => ((await res.json()) as { reason?: string }).reason;

test("a person's token mints a token of the person's, and one for an agent bound to a factory and narrowed, each answered once", async () => {
  const mine = await send('POST', '/api/tokens', personToken, { name: 'tokens-phone' });
  assert.equal(mine.status, 201);
  const phone = (await mine.json()) as TokenMinted;
  assert.equal(phone.name, 'tokens-phone');
  assert.equal(phone.holder, 'person');
  assert.equal(typeof phone.token, 'string');
  assert.ok(phone.token.length > 0, 'the token itself, this once');
  assert.equal((await send('GET', '/api/runs', phone.token)).status, 200, 'the api takes the token it minted');

  const theirs = await send('POST', '/api/tokens', personToken, {
    name: 'tokens-mill-review',
    agent: 'review',
    factory: 'mill',
    narrowed: 'read',
  });
  assert.equal(theirs.status, 201);
  const { token, createdAt, ...held } = (await theirs.json()) as TokenMinted;
  assert.deepEqual(held, { name: 'tokens-mill-review', holder: 'agent', agent: 'review', factory: 'mill', narrowed: 'read' });
  assert.equal(typeof token, 'string');
  assert.equal(typeof createdAt, 'string');
});

test('the list names each standing token by its holder, never a token nor its digest', async () => {
  const listed = await send('GET', '/api/tokens', personToken);
  assert.equal(listed.status, 200);
  const text = await listed.clone().text();
  const { tokens } = (await listed.json()) as TokenList;
  const byName = new Map<string, Token>(tokens.map((t) => [t.name, t]));
  assert.equal(byName.get('tokens-laptop')?.holder, 'person');
  assert.equal(byName.get('tokens-ops')?.holder, 'agent');
  assert.equal(byName.get('tokens-ops')?.agent, 'operator');
  for (const t of tokens) assert.ok(!('token' in t), `${t.name}: no token in the list`);
  const digests = fs.readdirSync(path.join(root, 'person-tokens')).map((file) => file.replace(/\.json$/, ''));
  assert.ok(digests.length > 0, 'the store keeps records to read');
  for (const secret of [personToken, agentToken, ...digests]) assert.ok(!text.includes(secret), 'no token, no digest');
});

test('a token retired is refused by the gate from then on, and gone from the list; one never kept is 404', async () => {
  const doomed = minted('tokens-doomed');
  assert.equal((await send('GET', '/api/runs', doomed)).status, 200, 'live before it is retired');
  const retired = await send('DELETE', '/api/tokens/tokens-doomed', personToken);
  assert.equal(retired.status, 200);
  assert.equal(((await retired.json()) as Token).name, 'tokens-doomed');
  const refused = await send('GET', '/api/runs', doomed);
  assert.equal(refused.status, 401);
  assert.equal(await reasonOf(refused), 'unknown-token');
  const { tokens } = (await (await send('GET', '/api/tokens', personToken)).json()) as TokenList;
  assert.ok(!tokens.some((t) => t.name === 'tokens-doomed'), 'gone from the list');
  assert.equal((await send('DELETE', '/api/tokens/tokens-never-kept', personToken)).status, 404);
});

test("REFUSED 403: an agent's standing token held at its floor on a write (class none: out of reach) and person-only on the list, a read; a session's person-only, on each route of the group, nothing minted or retired", async () => {
  sessionRunning();
  for (const [bearer, whose, writes] of [
    [agentToken, "an agent's standing token", 'out-of-reach'],
    [sessionToken, "a session's token", 'person-only'],
  ] as const) {
    for (const [method, url, body, reason] of [
      ['GET', '/api/tokens', undefined, 'person-only'],
      ['POST', '/api/tokens', { name: 'tokens-by-an-agent' }, writes],
      ['DELETE', '/api/tokens/tokens-laptop', undefined, writes],
    ] as const) {
      const res = await send(method, url, bearer, body);
      assert.equal(res.status, 403, `${whose}: ${method} ${url}`);
      assert.equal(await reasonOf(res), reason, `${whose}: ${method} ${url}`);
    }
  }
  const { tokens } = (await (await send('GET', '/api/tokens', personToken)).json()) as TokenList;
  assert.ok(!tokens.some((t) => t.name === 'tokens-by-an-agent'), 'nothing minted');
  assert.ok(
    tokens.some((t) => t.name === 'tokens-laptop'),
    'nothing retired',
  );
});

test('REFUSED 401 token-required: each route of the group asked with no token', async () => {
  for (const [method, url] of [
    ['GET', '/api/tokens'],
    ['POST', '/api/tokens'],
    ['DELETE', '/api/tokens/tokens-laptop'],
  ] as const) {
    const res = await send(method, url, null, { name: 'tokens-by-nobody' });
    assert.equal(res.status, 401, `${method} ${url}`);
    assert.equal(await reasonOf(res), 'token-required', `${method} ${url}`);
  }
});

test('REFUSED 422: a mint with a factory or a narrowing and no agent, nothing minted', async () => {
  for (const body of [
    { name: 'tokens-factory-alone', factory: 'mill' },
    { name: 'tokens-narrowed-alone', narrowed: 'read' },
  ]) {
    const res = await send('POST', '/api/tokens', personToken, body);
    assert.equal(res.status, 422, JSON.stringify(body));
  }
  const { tokens } = (await (await send('GET', '/api/tokens', personToken)).json()) as TokenList;
  assert.ok(!tokens.some((t) => t.name.endsWith('-alone')), 'nothing minted');
});

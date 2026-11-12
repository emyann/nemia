/**
 * The board's token (src/lib/api/read.ts, session.ts, src/lib/token.ts): a read or a write the api answers 401 with a refusal a pasted
 * token answers (`token-required`, `unknown-token`) asks this page for a token, whichever read it was, and the token page is drawn in
 * place of every page (`main.tsx`); no other status or reason asks. The pasted token goes to `POST /api/session` as its bearer, and
 * `DELETE /api/session` forgets it; the board never writes the cookie. `npm run e2e` presses the page on a store marked exposed
 * (`650-token.ts`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askToken, onTokenAsked, ReadRefusal, tokenAsked, tokenAskOf, WriteRefusal } from '../src/lib/api/read.ts';
import { versionQuery } from '../src/lib/api/version.ts';
import { signIn, signOut } from '../src/lib/api/session.ts';

/** What a request was sent as: its method, its path, and its headers. */
type Sent = { method: string; path: string; headers: Headers };

/** Every request answered `body` as JSON with `status`, for the length of the test; what each was sent as is kept in the list returned. */
function answering(t: { after: (fn: () => void) => void }, body: unknown, status = 200): Sent[] {
  const before = globalThis.fetch;
  const sent: Sent[] = [];
  globalThis.fetch = async (input, init) => {
    sent.push({ method: init?.method ?? 'GET', path: String(input), headers: new Headers(init?.headers) });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
  t.after(() => {
    globalThis.fetch = before;
  });
  return sent;
}

test('tokenAskOf: a 401 whose reason is token-required or unknown-token asks for a token; no other answer does', () => {
  assert.deepEqual(tokenAskOf(401, { error: 'x', reason: 'token-required' }), { reason: 'token-required', message: 'x' });
  assert.deepEqual(tokenAskOf(401, { error: 'y', reason: 'unknown-token' }), { reason: 'unknown-token', message: 'y' });
  assert.deepEqual(tokenAskOf(401, { reason: 'unknown-token' }), { reason: 'unknown-token', message: '' }, 'no words: none said');
  for (const [status, answer] of [
    [401, { error: 'x', reason: 'session-ended' }],
    [401, { error: 'x', reason: 'person-token-required' }],
    [401, { error: 'x' }],
    [401, undefined],
    [403, { error: 'x', reason: 'token-required' }],
    [200, { reason: 'token-required' }],
  ] as const)
    assert.equal(tokenAskOf(status, answer), null, `${status} ${JSON.stringify(answer)}`);
});

test('askToken: every listener is told once a refusal asks, the ask is read back, and a listener let go hears nothing', () => {
  let told = 0;
  const stop = onTokenAsked(() => (told += 1));
  askToken({ reason: 'token-required', message: 'first' });
  askToken({ reason: 'token-required', message: 'second' });
  assert.deepEqual(tokenAsked(), { reason: 'token-required', message: 'first' }, 'the first words of a reason are kept');
  assert.equal(told, 1, 'the same reason again tells no one');
  stop();
  askToken({ reason: 'unknown-token', message: '' });
  assert.equal(tokenAsked()?.reason, 'unknown-token');
  assert.equal(told, 1, 'a listener let go is not told');
});

test('a read the api refuses 401 token-required asks for a token, and still rejects as the refusal it is', async (t) => {
  answering(t, { error: 'this store is marked exposed', reason: 'token-required' }, 401);
  let told = 0;
  const stop = onTokenAsked(() => (told += 1));
  t.after(stop);
  askToken({ reason: 'unknown-token', message: '' });
  told = 0;
  await assert.rejects(
    async () => versionQuery.queryFn!({} as never),
    (err: unknown) => err instanceof ReadRefusal && err.status === 401,
  );
  assert.deepEqual(tokenAsked(), { reason: 'token-required', message: 'this store is marked exposed' }, "with the api's words");
  assert.equal(told, 1);
});

test('signIn sends the pasted token as the bearer of POST /api/session, and no cookie of its own', async (t) => {
  const sent = answering(t, { cookie: 'set' });
  assert.deepEqual(await signIn('tok-123'), { cookie: 'set' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].method, 'POST');
  assert.equal(sent[0].path, '/api/session');
  assert.equal(sent[0].headers.get('authorization'), 'Bearer tok-123');
  assert.equal(sent[0].headers.get('cookie'), null);
  assert.equal(sent[0].headers.get('content-type'), 'application/json');
});

test('signOut sends DELETE /api/session, with no bearer', async (t) => {
  const sent = answering(t, { cookie: 'cleared' });
  assert.deepEqual(await signOut(), { cookie: 'cleared' });
  assert.equal(sent[0].method, 'DELETE');
  assert.equal(sent[0].path, '/api/session');
  assert.equal(sent[0].headers.get('authorization'), null);
});

test('signIn of a token the api does not keep rejects with its 401, so the token page says it was refused', async (t) => {
  answering(t, { error: 'no token the store keeps is this one', reason: 'unknown-token' }, 401);
  await assert.rejects(signIn('never-minted'), (err: unknown) => err instanceof WriteRefusal && err.status === 401);
});

test("a refused signIn asks nothing more of the page: its 401 is the pasted token's, not the browser's", async (t) => {
  askToken({ reason: 'token-required', message: 'asked' });
  answering(t, { error: 'no token the store keeps is this one', reason: 'unknown-token' }, 401);
  await assert.rejects(signIn('never-minted'));
  assert.equal(tokenAsked()?.reason, 'token-required');
});

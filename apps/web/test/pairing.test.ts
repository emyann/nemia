/**
 * The board's side of a pairing and of a first-visit link (src/lib/api/pairing.ts): each call goes to its group's route, a pairing asked
 * and claimed under `/api/pairings`, approved by the code in the body of `POST /api/pairings/approve`, and a link claimed at `POST
 * /api/links/claim`. `npm run e2e` presses them on a store (`660-setup.ts`).
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { approvePairing, askPairing, claimLink, claimPairing } from '../src/lib/api/pairing.ts';

/** What a request was sent as: its method, its path, and its body read as JSON. */
type Sent = { method: string; path: string; body: unknown };

/** Every request answered `body` as JSON, for the length of the test; what each was sent as is kept in the list returned. */
function answering(t: { onTestFinished: (fn: () => void) => void }, body: unknown) {
  const before = globalThis.fetch;
  const sent: Sent[] = [];
  globalThis.fetch = async (input, init) => {
    const text = init?.body == null ? '' : await new Response(init.body).text();
    sent.push({ method: init?.method ?? 'GET', path: String(input), body: text === '' ? undefined : JSON.parse(text) });
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  t.onTestFinished(() => {
    globalThis.fetch = before;
  });
  return sent;
}

const PAIRING = {
  id: 'p-1',
  client: 'laptop',
  phase: 'claimable',
  createdAt: '2026-11-15T00:00:00.000Z',
  expiresAt: '2026-11-15T00:10:00.000Z',
};

test('askPairing sends POST /api/pairings with the client it names', async (t) => {
  const sent = answering(t, { id: 'p-1', code: 'ABCD-EFGH', secret: 's', expiresAt: PAIRING.expiresAt });
  assert.equal((await askPairing('laptop')).id, 'p-1');
  assert.deepEqual(sent, [{ method: 'POST', path: '/api/pairings', body: { client: 'laptop' } }]);
});

test('claimPairing sends POST /api/pairings/:id/claim with its secret', async (t) => {
  const sent = answering(t, { phase: 'waiting' });
  assert.deepEqual(await claimPairing('p-1', 's'), { phase: 'waiting' });
  assert.deepEqual(sent, [{ method: 'POST', path: '/api/pairings/p-1/claim', body: { secret: 's' } }]);
});

test('approvePairing sends POST /api/pairings/approve with the code in its body, never in its path', async (t) => {
  const sent = answering(t, PAIRING);
  assert.equal((await approvePairing('abcd-efgh')).phase, 'claimable');
  assert.deepEqual(sent, [{ method: 'POST', path: '/api/pairings/approve', body: { code: 'abcd-efgh' } }]);
});

test('claimLink sends POST /api/links/claim with the secret the link carries', async (t) => {
  const sent = answering(t, { cookie: 'set', name: 'board-2026-11-15' });
  assert.deepEqual(await claimLink('link-secret'), { cookie: 'set', name: 'board-2026-11-15' });
  assert.deepEqual(sent, [{ method: 'POST', path: '/api/links/claim', body: { secret: 'link-secret' } }]);
});

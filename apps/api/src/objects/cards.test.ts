/**
 * The cards group served (src/objects): a page walked by `continue` answers each card once, in name order, its `remainingItemCount`
 * counting down, and refuses a limit or a token that is not one; the namespaces are the cards' factories, `default` those that name none;
 * `labelSelector` and its retired spelling select alike; and every write is guarded before its body is read.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Card, CardList } from 'objects';
import { app } from '../app.ts';

const inbox = path.join(root, 'inbox');

/** A card filed by hand, as `nemia inbox add` writes one: its factory and its labels in its front matter where given. */
const card = (name: string, keys: { factory?: string; team?: string } = {}) => {
  fs.mkdirSync(inbox, { recursive: true });
  const front = [...(keys.factory ? [`factory: ${keys.factory}`] : []), ...(keys.team ? [`labels: { team: ${keys.team} }`] : [])];
  fs.writeFileSync(path.join(inbox, `${name}.md`), front.length ? `---\n${front.join('\n')}\n---\nDo ${name}.\n` : `Do ${name}.\n`);
};

for (const name of ['c-1', 'c-2', 'c-3', 'c-4', 'c-5']) card(name, { team: name === 'c-2' || name === 'c-4' ? 'core' : 'infra' });
card('f-a', { factory: 'a' });

const list = async (url: string) => {
  const res = await app.request(url);
  return { status: res.status, body: (await res.json()) as typeof CardList.Type };
};

test('?limit=2 walked by continue answers each card once in name order, remainingItemCount 3, 1, 0, no continue on the last', async () => {
  const seen: string[] = [];
  const remaining: Array<number | undefined> = [];
  let next: string | undefined;
  let pages = 0;
  do {
    const { status, body } = await list(`/api/namespaces/default/cards?limit=2${next ? `&continue=${encodeURIComponent(next)}` : ''}`);
    assert.equal(status, 200);
    assert.equal(body.kind, 'CardList');
    seen.push(...body.items.map((c) => c.metadata.name));
    remaining.push(body.metadata.remainingItemCount);
    next = body.metadata.continue;
    pages++;
  } while (next && pages < 10);
  assert.deepEqual(seen, ['c-1', 'c-2', 'c-3', 'c-4', 'c-5']);
  assert.deepEqual(remaining, [3, 1, 0]);
});

test('a limit that is no whole number from 1, and a continue that is no token, are 422', async () => {
  for (const query of ['limit=0', 'limit=x', 'continue=not-a-token']) {
    const res = await app.request(`/api/cards?${query}`);
    assert.equal(res.status, 422, query);
    assert.equal(typeof ((await res.json()) as { error: unknown }).error, 'string', `${query} says why in \`error\``);
  }
});

test("/api/cards lists every card, /api/namespaces/default/cards those of no factory, and a card read in another's namespace is 404", async () => {
  assert.deepEqual(
    (await list('/api/cards')).body.items.map((c) => c.metadata.name),
    ['c-1', 'c-2', 'c-3', 'c-4', 'c-5', 'f-a'],
  );
  assert.ok(!(await list('/api/namespaces/default/cards')).body.items.some((c) => c.metadata.name === 'f-a'));
  const got = await app.request('/api/namespaces/a/cards/f-a');
  assert.equal(got.status, 200);
  const object = (await got.json()) as typeof Card.Type;
  assert.equal(object.kind, 'Card');
  assert.equal(object.metadata.namespace, 'a');
  assert.equal((await app.request('/api/namespaces/b/cards/f-a')).status, 404);
  assert.equal((await app.request('/api/namespaces/default/cards/no-such-card')).status, 404);
});

test('?labelSelector= and the retired ?selector= select the same cards, and a malformed one is 422', async () => {
  const by = (await list('/api/cards?labelSelector=team%3Dcore')).body.items.map((c) => c.metadata.name);
  assert.deepEqual(by, ['c-2', 'c-4']);
  assert.deepEqual(
    (await list('/api/cards?selector=team%3Dcore')).body.items.map((c) => c.metadata.name),
    by,
  );
  assert.equal((await app.request('/api/cards?labelSelector=team%20in%20(core')).status, 422);
});

/** Each write of the cards group, by its method and path. */
const WRITES = [
  ['POST', '/api/namespaces/default/cards'],
  ['DELETE', '/api/namespaces/default/cards/c-1'],
  ['POST', '/api/namespaces/default/cards/c-1/start'],
  ['POST', '/api/namespaces/default/cards/c-1/queue'],
  ['POST', '/api/namespaces/default/cards/c-1/unqueue'],
  ['POST', '/api/namespaces/default/cards/c-1/labels'],
] as const;

test('each write of the cards group is 403 for another site and 415 for a body that is not JSON, the card left as it was', async () => {
  for (const [method, url] of WRITES) {
    const site = await app.request(url, {
      method,
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' },
      body: '{}',
    });
    assert.equal(site.status, 403, `${method} ${url} from another site`);
    const form = await app.request(url, { method, headers: { 'content-type': 'text/plain' }, body: 'labels=team-' });
    assert.equal(form.status, 415, `${method} ${url} sent as text`);
  }
  assert.ok(fs.existsSync(path.join(inbox, 'c-1.md')), 'the card is there still');
});

test('a card filed, labelled, queued, taken off and dropped through the verbs is the object read after each', async () => {
  const headers = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' };
  const filed = await app.request('/api/namespaces/default/cards', {
    method: 'POST',
    headers,
    body: JSON.stringify({ body: 'A new one' }),
  });
  assert.equal(filed.status, 201);
  const made = (await filed.json()) as typeof Card.Type;
  assert.equal(made.kind, 'Card');
  const at = `/api/namespaces/default/cards/${made.metadata.name}`;
  const labelled = await app.request(`${at}/labels`, { method: 'POST', headers, body: JSON.stringify({ labels: ['team=core'] }) });
  assert.equal(labelled.status, 200);
  assert.equal(((await labelled.json()) as { kind: string }).kind, 'Card');
  const unqueued = await app.request(`${at}/unqueue`, { method: 'POST', headers, body: '{}' });
  assert.equal(unqueued.status, 200);
  const dropped = await app.request(at, { method: 'DELETE', headers, body: '{}' });
  assert.equal(dropped.status, 200);
  assert.equal((await app.request(at)).status, 404, 'gone once dropped');
});

test('a stray file of the same name as a card is passed over: the card is read and pressed by its verbs, never answered 404', async (t) => {
  card('z-notes');
  fs.writeFileSync(path.join(inbox, 'z-notes'), 'a stray file, no card\n');
  t.after(() => {
    fs.rmSync(path.join(inbox, 'z-notes'), { force: true });
    fs.rmSync(path.join(inbox, 'z-notes.md'), { force: true });
  });
  const at = '/api/namespaces/default/cards/z-notes';
  const read = await app.request(at);
  assert.equal(read.status, 200);
  assert.equal(((await read.json()) as typeof Card.Type).metadata.name, 'z-notes');
  const headers = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' };
  const labelled = await app.request(`${at}/labels`, { method: 'POST', headers, body: JSON.stringify({ labels: ['team=core'] }) });
  assert.equal(labelled.status, 200);
});

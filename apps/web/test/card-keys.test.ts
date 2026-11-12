/**
 * A card's page draws each key a card may set, a row each, made of the Card in one place (`cardKeysOf`): the rows the api's retired
 * `GET /api/inbox/:name` answered, in `CARD_KEYS`' order, each value as it wrote it and each meaning `CARD_KEY_MEANINGS`' — and none for
 * an entry that does not read as a card. A card's `from:` is the Card written whole (`setCardFrom`): read, then sent back with its spec but
 * `from`, its labels and the `resourceVersion` it was read at.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARD_KEYS, CARD_KEY_MEANINGS } from 'objects';
import { cardKeysOf, setCardFrom } from '../src/lib/api/inbox.ts';
import { cardObject } from './factory-fixtures.ts';

test("cardKeysOf: a Card's keys as the card page's rows, in order, each with its meaning", async (t) => {
  await t.test(
    'every key set: queued its time, models and from comma-joined, labels as a=b,c=d in key order, factory its namespace',
    () => {
      const card = cardObject({
        metadata: { namespace: 'mill', labels: { team: 'web', area: 'board' } },
        spec: { gate: 'design', model: { implement: 'fable', review: 'opus' }, from: ['r-1', 'r-2'], queued: '2026-09-30T05:01:00.000Z' },
      });
      assert.deepEqual(cardKeysOf(card), [
        { key: 'workflow', value: 'build', meaning: CARD_KEY_MEANINGS.workflow },
        { key: 'repo', value: '/work/repo', meaning: CARD_KEY_MEANINGS.repo },
        { key: 'queued', value: '2026-09-30T05:01:00.000Z', meaning: CARD_KEY_MEANINGS.queued },
        { key: 'gate', value: 'design', meaning: CARD_KEY_MEANINGS.gate },
        { key: 'model', value: 'implement=fable, review=opus', meaning: CARD_KEY_MEANINGS.model },
        { key: 'factory', value: 'mill', meaning: CARD_KEY_MEANINGS.factory },
        { key: 'from', value: 'r-1, r-2', meaning: CARD_KEY_MEANINGS.from },
        { key: 'labels', value: 'area=board,team=web', meaning: CARD_KEY_MEANINGS.labels },
      ]);
    },
  );
  await t.test('a key the card does not set is null; the default namespace is no factory', () => {
    const card = cardObject({ metadata: { namespace: 'default' } });
    const { workflow: _, repo: __, queued: ___, ...bare } = card.spec;
    const rows = cardKeysOf({ ...card, spec: bare });
    assert.deepEqual(
      rows?.map((row) => row.key),
      [...CARD_KEYS],
    );
    assert.deepEqual(
      rows?.map((row) => row.value),
      [null, null, null, null, null, null, null, null],
    );
  });
  await t.test('an entry that does not read as a card has no keys', () => {
    assert.equal(cardKeysOf(cardObject({ status: { error: 'no frontmatter' } })), null);
  });
});

/** Every request answered with `card` as JSON, for the length of the test: what was sent, each as its method, path and body. */
function answering(t: { after: (fn: () => void) => void }, card: unknown) {
  const before = globalThis.fetch;
  const sent: Array<{ method: string; path: string; body: unknown }> = [];
  globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const body = init?.body === undefined || init.body === null ? undefined : new TextDecoder().decode(init.body as Uint8Array);
    sent.push({ method: init?.method ?? 'GET', path: new URL(String(url), 'http://board').pathname, body: body && JSON.parse(body) });
    return new Response(JSON.stringify(card), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  t.after(() => {
    globalThis.fetch = before;
  });
  return sent;
}

test('setCardFrom: the card read, then written whole with its from replaced, queued as read, its labels and the version it was read at', async (t) => {
  await t.test('runs set: from replaced, every other key of the spec kept', async (t) => {
    const card = cardObject({ metadata: { namespace: 'mill', labels: { team: 'web' } }, spec: { from: ['r-9'], gate: 'design' } });
    const sent = answering(t, card);
    await setCardFrom({ name: card.metadata.name, factory: 'mill' }, ['r-1', 'r-2']);
    const path = `/api/namespaces/mill/cards/${card.metadata.name}`;
    assert.deepEqual(
      sent.map(({ method, path }) => `${method} ${path}`),
      [`GET ${path}`, `PUT ${path}`],
    );
    assert.deepEqual(sent[1]?.body, {
      metadata: { resourceVersion: card.metadata.resourceVersion, labels: { team: 'web' } },
      spec: { ...card.spec, from: ['r-1', 'r-2'] },
    });
  });
  await t.test('no runs: from taken off, a card of no factory written in default', async (t) => {
    const card = cardObject({ metadata: { namespace: 'default' }, spec: { from: ['r-9'] } });
    const sent = answering(t, card);
    await setCardFrom({ name: card.metadata.name, factory: null }, []);
    const { from: _, ...kept } = card.spec;
    assert.equal(sent[1]?.path, `/api/namespaces/default/cards/${card.metadata.name}`);
    assert.deepEqual(sent[1]?.body, { metadata: { resourceVersion: card.metadata.resourceVersion, labels: {} }, spec: kept });
  });
});

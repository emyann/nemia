/**
 * Every list the Api serves of a kind the keyspace watches (`isWatchedKind`) says its position as the keyspace head it was read at, and
 * each object of it the revision it stands at: a decimal, never past the list's. One table, every kind, so a kind added to the table of
 * `WATCHED_KINDS` and not served at a revision fails here; a kind the keyspace does not watch (the events) is left alone.
 */
import { root } from '../../test/harness.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { isWatchedKind } from 'agent-orchestrator';
import { plantCard } from 'agent-orchestrator/testing';
import { appOf, liveOf } from '../app.ts';
import { ENDPOINTS } from './endpoints.ts';

const { app } = appOf(liveOf());

/** The paths of the lists the Api serves, a namespace and a name filled in as the store holds them. */
const collections = ENDPOINTS.filter((e) => e.method === 'GET' && e.path !== '/api' && e.kinds.some((k) => k.endsWith('List'))).map((e) =>
  e.path.replace(':namespace', 'default').replace(':name', 'sdlc'),
);

test('every list of a watched kind is read at the keyspace head and each of its objects at a revision no later', async () => {
  plantCard(root, 'rev-1', 'Do rev-1.\n');
  assert.ok(collections.length >= 15, `${collections.length} lists found`);
  let watched = 0;
  for (const url of collections) {
    const res = await app.request(url);
    assert.equal(res.status, 200, url);
    const list = (await res.json()) as {
      kind: string;
      metadata: { resourceVersion?: string };
      items: { metadata: { resourceVersion: string } }[];
    };
    if (!isWatchedKind(list.kind.replace(/List$/, ''))) continue;
    watched += 1;
    assert.match(list.metadata.resourceVersion ?? '', /^(0|[1-9][0-9]*)$/, `${url}: the list says the head it was read at`);
    for (const item of list.items)
      assert.match(item.metadata.resourceVersion, /^(0|[1-9][0-9]*)$/, `${url}: an object's resourceVersion is a revision`);
    const head = Number(list.metadata.resourceVersion);
    assert.ok(
      list.items.every((o) => Number(o.metadata.resourceVersion) <= head),
      `${url}: no object is past the list`,
    );
  }
  assert.ok(watched >= 10, `${watched} lists of a watched kind`);
});

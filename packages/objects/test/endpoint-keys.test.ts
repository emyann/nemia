/**
 * Where a call's input goes on an endpoint (`src/endpoint-keys.ts`, `endpointKeysOf`): its path's keys, its query's but `watch`, its
 * payload's, and whether it answers a stream, read off objects' `Api`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Api, endpointKeysOf } from 'objects';

test('an action says its path keys and its payload keys, and answers once', () => {
  const keys = endpointKeysOf(Api, 'mcpservers.signInCallback');
  assert.equal(keys.method, 'POST');
  assert.deepEqual(keys.pathKeys, ['namespace', 'name']);
  assert.deepEqual(keys.payloadKeys, ['url']);
  assert.equal(keys.streams, false);
});

test('a list says its query keys, and never watch, which turns its answer into a stream', () => {
  const keys = endpointKeysOf(Api, 'runs.listAll');
  assert.ok(keys.queryKeys.includes('limit'), 'a page is asked by limit');
  assert.ok(!keys.queryKeys.includes('watch'), 'watch is no key a call takes');
});

test('the feed is said to stream', () => {
  assert.equal(endpointKeysOf(Api, 'server.feed').streams, true);
});

test('a name the Api does not declare is refused', () => {
  assert.throws(() => endpointKeysOf(Api, 'runs.nothing'), Error);
});

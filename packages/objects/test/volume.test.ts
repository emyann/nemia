/**
 * The Volume (`src/volume.ts`): a factory's volume, by its stored name, and a page of them, as the Api's endpoints answer them, every key
 * kept, one missing every optional key read, a gone folder read as not present with why, and one of another kind refused.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { API_VERSION, Volume } from 'objects';
import { answered } from './served.ts';

const mounted = {
  apiVersion: API_VERSION,
  kind: 'Volume',
  metadata: { name: 'data', namespace: 'mill', creationTimestamp: '2026-11-04T00:00:00.000Z', resourceVersion: 'v1' },
  spec: { path: '/a/data', readOnly: true },
  status: { present: true, runs: ['build-x1'] },
} as const;

const gone = {
  ...mounted,
  metadata: { ...mounted.metadata, name: 'data-2' },
  spec: { path: '/b/data', readOnly: false },
  status: { present: false, refused: '/b/data is gone: nemia factory volume rm mill /b/data', runs: [] },
} as const;

test("the Api's get answers a volume and its list a page of them, every key kept, absent keys left absent; another kind refused", () => {
  assert.deepEqual(answered('volumes', 'get', mounted), mounted);
  assert.deepEqual(answered('volumes', 'get', gone), gone);
  assert.equal(answered('volumes', 'get', { ...mounted, kind: 'Card' }), undefined);
  const page = { apiVersion: API_VERSION, kind: 'VolumeList', metadata: {}, items: [mounted, gone] };
  assert.deepEqual(answered('volumes', 'list', page), page);
  assert.equal(answered('volumes', 'list', { ...page, kind: 'CardList' }), undefined);
});

test('REFUSED: a volume with no mark, a status with no runs, and another kind', () => {
  const decode = Schema.decodeUnknownSync(Volume);
  assert.throws(() => decode({ ...mounted, spec: { path: '/a/data' } }));
  assert.throws(() => decode({ ...mounted, status: { present: true } }));
  assert.throws(() => decode({ ...mounted, kind: 'Card' }));
});

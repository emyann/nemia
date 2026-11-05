/**
 * The Volume (`src/volume.ts`): a factory's volume, by its stored name, and a page of them decoded from JSON and encoded back equal, one
 * missing every optional key read, a gone folder read as not present with why.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { API_VERSION, Volume, VolumeList } from 'objects';

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

const roundTrip = <S extends Schema.Codec<unknown, unknown>>(schema: S, value: unknown): unknown =>
  JSON.parse(JSON.stringify(Schema.encodeSync(schema)(Schema.decodeUnknownSync(schema)(JSON.parse(JSON.stringify(value))))));

test('a volume and a page of them decode from JSON and encode back the same, absent keys left absent', () => {
  assert.deepEqual(roundTrip(Volume, mounted), mounted);
  assert.deepEqual(roundTrip(Volume, gone), gone);
  const page = { apiVersion: API_VERSION, kind: 'VolumeList', metadata: {}, items: [mounted, gone] };
  assert.deepEqual(roundTrip(VolumeList, page), page);
});

test('REFUSED: a volume with no mark, a status with no runs, and another kind', () => {
  const decode = Schema.decodeUnknownSync(Volume);
  assert.throws(() => decode({ ...mounted, spec: { path: '/a/data' } }));
  assert.throws(() => decode({ ...mounted, status: { present: true } }));
  assert.throws(() => decode({ ...mounted, kind: 'Card' }));
});

/**
 * The place model: MountKind is the closed set of kinds the run records hold today — every kind the store reads decodes, and no other.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { MountKind, placeModel } from './place.model.ts';
import { placeOf, type PlaceKind, type Run } from '../record/record.ts';

/** Each kind a record says, as the store reads it: a record with no `place` is a repository run's. */
const RECORDS: Record<PlaceKind, Pick<Run, 'place'>> = { repository: {}, folder: { place: { kind: 'folder' } } };

test('every kind of place a run record holds decodes as a MountKind, and no other', async (t) => {
  for (const [kind, record] of Object.entries(RECORDS)) await t.test(kind, () => assert.equal(Schema.is(MountKind)(placeOf(record)), true));
  await t.test('the same set as the type the records hold', () => {
    const asRecorded: readonly PlaceKind[] = [] as MountKind[];
    const asModelled: readonly MountKind[] = [] as PlaceKind[];
    assert.deepEqual([asRecorded, asModelled], [[], []]);
  });
  await t.test('REFUSED: a kind no record holds', () => assert.equal(Schema.is(MountKind)('remote'), false));
  await t.test('names no entity: a kind is an attribute', () => assert.deepEqual(placeModel, { entities: [], ids: {} }));
});

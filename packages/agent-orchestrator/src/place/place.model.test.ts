/**
 * The place model: PlaceKind is the closed set of kinds the run records hold — every kind the store reads decodes, and no other.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { PlaceKind, placeModel } from './place.model.ts';
import { placeOf, type Run } from '../record/record.ts';

/** Each kind a record says, as the store reads it: a record with no `place` is a git run's. */
const RECORDS: Record<PlaceKind, Pick<Run, 'place'>> = { git: {}, folder: { place: { kind: 'folder' } } };

test('every kind of place a run record holds decodes as a PlaceKind, and no other', async (t) => {
  for (const [kind, record] of Object.entries(RECORDS)) await t.test(kind, () => assert.equal(Schema.is(PlaceKind)(placeOf(record)), true));
  await t.test('a record with no place reads git', () => assert.equal(placeOf({}), 'git'));
  await t.test('a folder record reads folder', () => assert.equal(placeOf({ place: { kind: 'folder' } }), 'folder'));
  await t.test('REFUSED: the former spelling repository', () => assert.equal(Schema.is(PlaceKind)('repository'), false));
  await t.test('REFUSED: a kind no record holds', () => assert.equal(Schema.is(PlaceKind)('remote'), false));
  await t.test('names no entity: a kind is an attribute', () => assert.deepEqual(placeModel, { entities: [], ids: {} }));
});

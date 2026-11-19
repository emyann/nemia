/**
 * The place model: PlaceKind is the closed set of kinds the run records hold — every kind the store reads decodes, and no other.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { PlaceKind } from './place.model.ts';
import { placeOf, type Run } from '../record/record.ts';

/** Each kind a record says, as the store reads it: a record with no `place` is a git run's. */
const RECORDS: Record<PlaceKind, Pick<Run, 'place'>> = { git: {}, folder: { place: { kind: 'folder' } } };

describe('every kind of place a run record holds decodes as a PlaceKind, and no other', () => {
  for (const [kind, record] of Object.entries(RECORDS)) test(kind, () => assert.equal(Schema.is(PlaceKind)(placeOf(record)), true));
  test('a record with no place reads git', () => assert.equal(placeOf({}), 'git'));
  test('a folder record reads folder', () => assert.equal(placeOf({ place: { kind: 'folder' } }), 'folder'));
  test('REFUSED: the former spelling repository', () => assert.equal(Schema.is(PlaceKind)('repository'), false));
  test('REFUSED: a kind no record holds', () => assert.equal(Schema.is(PlaceKind)('remote'), false));
});

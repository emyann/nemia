/**
 * Whether a proposal read an object at a version a write still follows (`readFresh`): the version served now, or one between the revision
 * of its spec's records and that version, never one past it.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFresh } from './current.verb.ts';

const now = { version: '9', specVersion: 4 };

test('the version served now is fresh, and so is one at or after the spec’s records where only its status moved since', () => {
  assert.equal(readFresh(now, '9'), true);
  assert.equal(readFresh(now, '4'), true);
  assert.equal(readFresh(now, '7'), true);
});

test('REFUSED: a version before the spec’s records, one past the version served, none, and one that is no number', () => {
  assert.equal(readFresh(now, '3'), false);
  assert.equal(readFresh(now, '10'), false);
  assert.equal(readFresh(now, '99999999'), false);
  assert.equal(readFresh(now, undefined), false);
  assert.equal(readFresh(now, 'abc'), false);
  assert.equal(readFresh({ version: null }, '4'), false);
});

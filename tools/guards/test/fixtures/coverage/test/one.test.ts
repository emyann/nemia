import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sign } from '../src/one.ts';

test('a positive number', () => {
  assert.equal(sign(1), 'positive');
});

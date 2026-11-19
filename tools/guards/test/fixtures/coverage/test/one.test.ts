/// <reference types="vitest/globals" />
import assert from 'node:assert/strict';
import { sign } from '../src/one.ts';

test('a positive number', () => {
  assert.equal(sign(1), 'positive');
});

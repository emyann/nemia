import { test } from 'node:test';
import assert from 'node:assert/strict';

test('fails on purpose', () => {
  assert.fail('on purpose');
});

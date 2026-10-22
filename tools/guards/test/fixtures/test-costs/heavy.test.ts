import { test } from 'node:test';
import assert from 'node:assert/strict';

test('fills 64 MiB', () => {
  const filled = Buffer.alloc(64 * 1024 * 1024, 1);
  assert.equal(filled[filled.length - 1], 1);
});

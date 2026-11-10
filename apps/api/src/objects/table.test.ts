import '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TABLE_ACCEPT } from 'objects';
import { acceptsTable } from './table.ts';

test('a list is asked for as a Table by the Accept value Kubernetes clients send, among others and spaced or not', () => {
  assert.equal(acceptsTable(TABLE_ACCEPT), true);
  assert.equal(acceptsTable(`application/json; as=Table; g=meta.k8s.io; v=v1, application/json`), true);
  assert.equal(acceptsTable('application/json'), false, 'plain JSON is the list itself');
  assert.equal(acceptsTable(undefined), false, 'no Accept header is the list itself');
});

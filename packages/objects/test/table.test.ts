/**
 * The server's `Table` as a client prints it (`tableLines`), kubectl's way: the columns of priority 0 under their names in capitals,
 * every column when asked wide, the `Labels` column with its labels, a column per label key off each row's object's labels, a cell with
 * nothing in it `<none>`. The client and the api's MCP port print with it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { type Table, tableLines } from 'objects';

const table: Table = {
  kind: 'Table',
  apiVersion: 'meta.k8s.io/v1',
  metadata: {},
  columnDefinitions: [
    { name: 'Name', type: 'string', format: 'name', description: 'its name', priority: 0 },
    { name: 'Queued', type: 'integer', format: '', description: 'its place', priority: 0 },
    { name: 'Gate', type: 'string', format: '', description: 'its gate', priority: 1 },
    { name: 'Labels', type: 'string', format: '', description: 'its labels', priority: 1 },
  ],
  rows: [
    { cells: ['cache-the-views', 2, 'plan', 'team=core'], object: { metadata: { name: 'cache-the-views', labels: { team: 'core' } } } },
    { cells: ['notes', null, '', ''] },
  ],
};

const plain = { wide: false, showLabels: false, columns: [] };

test('the columns of priority 0, each name in capitals over its cells, padded three spaces apart; nothing as <none>', () => {
  assert.deepEqual(tableLines(table, plain), ['NAME              QUEUED', 'cache-the-views   2', 'notes             <none>']);
});

test('-o wide shows every column; --show-labels the Labels column alone; -L a column of that label off each row’s object', () => {
  assert.deepEqual(tableLines(table, { ...plain, wide: true })[0], 'NAME              QUEUED   GATE   LABELS');
  assert.deepEqual(tableLines(table, { ...plain, showLabels: true })[1], 'cache-the-views   2        team=core');
  assert.deepEqual(tableLines(table, { ...plain, columns: ['team'] }), [
    'NAME              QUEUED   TEAM',
    'cache-the-views   2        core',
    'notes             <none>',
  ]);
});

test('a table with no row prints no line, so the read says why itself', () => {
  assert.deepEqual(tableLines({ ...table, rows: [] }, plain), []);
});

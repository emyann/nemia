/**
 * The server's `Table` as the client prints it (`tableLines`), kubectl's way: the columns of priority 0 under their names in capitals,
 * every column with `-o wide`, the `Labels` column with `--show-labels`, a column per `-L <key>` off each row's object's labels, a cell
 * with nothing in it `<none>`; and the words that ask for each (`tableAsked`), and a list answered where its table was asked (`tableOf`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Table } from 'objects';
import { Refused } from '../src/refused.ts';
import { tableAsked, tableLines, tableOf } from '../src/reads/table.ts';

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

test('tableAsked reads -l, -L, --show-labels and -o wide, and leaves the rest; a flag with no word, or another output, is the old path’s', () => {
  assert.deepEqual(tableAsked(['-l', 'team=core', '-l', 'team', '--show-labels', '-L', 'x', '-o', 'wide', 'r-1']), {
    rest: ['r-1'],
    selector: ['team=core', 'team'],
    asked: { wide: true, showLabels: true, columns: ['x'] },
  });
  assert.equal(tableAsked(['-l']), null);
  assert.equal(tableAsked(['-o', 'yaml']), null);
});

test('REFUSED: a list answered where its table was asked is an api older than this client, exit 2, naming the restart', () => {
  assert.throws(
    () => tableOf('ls', { kind: 'RunList', items: [] }),
    (err: unknown) => err instanceof Refused && err.code === 2 && /nemia service restart/.test(err.message),
  );
  assert.equal(tableOf('ls', table), table);
});

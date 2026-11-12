/**
 * How the client asks for the server's `Table`: the parsed words that ask for it wide, with labels or a column per label
 * (`tableAsked`), and a list answered where its table was asked (`tableOf`). The lines it prints are `objects`' `tableLines`, held in its
 * own tests.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Table } from 'objects';
import { Refused } from '../src/refused.ts';
import { tableAsked, tableOf } from '../src/reads/table.ts';

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

test('tableAsked reads the parsed -l, -L, --show-labels and -o wide: the label queries to send, and how the table prints', () => {
  assert.deepEqual(tableAsked({ selector: ['team=core', 'team'], showLabels: true, labelColumns: ['x'], output: 'wide', runId: 'r-1' }), {
    selector: ['team=core', 'team'],
    asked: { wide: true, showLabels: true, columns: ['x'] },
  });
  assert.deepEqual(tableAsked({}), { selector: [], asked: { wide: false, showLabels: false, columns: [] } });
});

test('REFUSED: a list answered where its table was asked is an api older than this client, exit 2, naming the restart', () => {
  assert.throws(
    () => tableOf('ls', { kind: 'RunList', items: [] }),
    (err: unknown) => err instanceof Refused && err.code === 2 && /nemia service restart/.test(err.message),
  );
  assert.equal(tableOf('ls', table), table);
});

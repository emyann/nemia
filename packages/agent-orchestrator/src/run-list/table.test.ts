/**
 * A page of the runs as a table (`runTable`, table.ts): its columns, a row per run in their order with the run's metadata beside it, the
 * brief's first line cut, a run called off noted, its labels by key, and a run that could not be judged a row whose note says so. Cells
 * are asserted as the values a run gives them, never as sentences.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Run, RunList } from 'objects';
import { RUN_COLUMNS, runCells, runTable } from './table.ts';

/** A run object with what a row reads of it: its name and labels, its brief, its cost, and whether it was called off. */
const runOf = (
  name: string,
  {
    brief = 'Do it.',
    labels = {},
    said,
    cancelledAt,
    pruned,
  }: Partial<Record<'brief' | 'said' | 'cancelledAt', string>> & {
    labels?: Record<string, string>;
    pruned?: boolean;
  } = {},
): Run =>
  ({
    apiVersion: 'nemia/v1',
    kind: 'Run',
    metadata: { name, labels },
    spec: { brief },
    status: { ...(said === undefined ? {} : { cost: { said } }), ...(cancelledAt ? { cancelledAt } : {}), ...(pruned ? { pruned } : {}) },
  }) as unknown as Run;

test("a run's row is its cells in the columns' order: its name, its brief's first line cut at 56, its cost, its note, its labels by key", () => {
  assert.deepEqual(
    RUN_COLUMNS.map((c) => c.name),
    ['Name', 'Brief', 'Cost', 'Note', 'Labels'],
  );
  const brief = `${'x'.repeat(70)}\nthe rest`;
  const cells = runCells(runOf('r-1', { brief, labels: { team: 'core', area: 'api' }, said: '$1.20', cancelledAt: 'then', pruned: true }));
  assert.equal(cells.length, RUN_COLUMNS.length, 'a cell per column');
  assert.deepEqual(cells, ['r-1', 'x'.repeat(56), '$1.20', 'cancelled, pruned', 'area=api,team=core']);
  assert.deepEqual(runCells(runOf('r-2')), ['r-2', 'Do it.', '', '', ''], 'a run with no cost, not called off and with no labels');
});

test('a page is a Table: its place kept, a row per judged run with its metadata, then a row per run that could not be judged', () => {
  const list = {
    apiVersion: 'nemia/v1',
    kind: 'RunList',
    metadata: { continue: 'r-2' },
    items: [runOf('r-1'), runOf('r-2')],
    unjudged: [{ name: 'r-3', error: 'its journal does not read' }],
  } as unknown as RunList;
  const table = runTable(list);
  assert.equal(table.kind, 'Table');
  assert.equal(table.metadata.continue, 'r-2', "the page's place");
  assert.deepEqual(table.columnDefinitions, RUN_COLUMNS);
  assert.deepEqual(
    table.rows.map((row) => row.cells[0]),
    ['r-1', 'r-2', 'r-3'],
  );
  assert.deepEqual(table.rows[0]?.object, {
    kind: 'PartialObjectMetadata',
    apiVersion: 'meta.k8s.io/v1',
    metadata: list.items[0]?.metadata,
  });
  assert.equal(table.rows[2]?.object, undefined, 'a run not judged has no object');
  assert.ok(String(table.rows[2]?.cells[3]).includes('its journal does not read'), 'its note says why');
  assert.equal(Object.hasOwn(runTable({ ...list, metadata: {} }).metadata, 'continue'), false, 'a last page has no place');
});

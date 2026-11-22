/**
 * A page of workflows or templates as a table (definition-table.ts): a row per item with as many cells as columns, each one line, the
 * item's metadata alone beside them, read off what a list serves of each and never a file's content. Cells are asserted as the values a
 * planted object gives them.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import type { TemplateListed, WorkflowListed } from 'objects';
import { templateTable, workflowTable } from './definition-table.ts';

const meta = (name: string) => ({ name, namespace: 'default', creationTimestamp: '2026-11-01T00:00:00Z', resourceVersion: '1' });

const page = <K extends string, I>(kind: K, items: readonly I[]) => ({ apiVersion: 'nemia/v1' as const, kind, metadata: {}, items });

const workflowOf = (name: string, status: Partial<WorkflowListed['status']> = {}) =>
  ({
    apiVersion: 'nemia/v1',
    kind: 'Workflow',
    metadata: meta(name),
    spec: {
      steps: [
        { name: 'design', keys: {} },
        { name: 'implement', keys: {} },
      ],
    },
    status: {
      origin: 'repo',
      dir: `/repo/workflows/${name}`,
      description: 'Builds a card.\nIn three steps.',
      needs: [],
      graph: { roots: [], nodes: [], edges: [] },
      steps: [],
      schemas: ['design.schema.json'],
      folderTeam: false,
      error: null,
      unfilled: null,
      ...status,
    },
  }) satisfies WorkflowListed;

test('a workflow prints its origin, its steps counted, its description cut at its first line, and a note of what stops it', () => {
  const table = workflowTable(
    page('WorkflowList', [
      workflowOf('build'),
      workflowOf('broken', { error: 'no step\nat all', shadowedBy: 'factory', unfilled: 'no agent' }),
    ]),
  );
  assert.deepEqual(
    table.rows.map((row) => row.cells),
    [
      ['build', 'repo', 2, 'Builds a card.', '', false, 'design.schema.json'],
      [
        'broken',
        'repo',
        2,
        'Builds a card.',
        'does not read: no step; shadowed by factory; cannot start: no agent',
        false,
        'design.schema.json',
      ],
    ],
  );
  for (const row of table.rows) {
    assert.equal(row.cells.length, table.columnDefinitions.length);
    assert.equal((row.object as { kind: string }).kind, 'PartialObjectMetadata');
  }
});

test('a template prints its version and description, and its first problem with how many more', () => {
  const template = {
    apiVersion: 'nemia/v1',
    kind: 'Template',
    metadata: meta('sdlc'),
    spec: { version: '3.11.0', description: 'The team that builds Nemia.', parameters: {}, hires: {} },
    status: { source: '/t/sdlc', workflows: ['build', 'quick'], agents: ['grace'], skills: [], problems: ['a\nb', 'c'] },
  } satisfies TemplateListed;
  const table = templateTable(page('TemplateList', [template]));
  assert.deepEqual(table.rows[0]?.cells, ['sdlc', '3.11.0', 'The team that builds Nemia.', 'a (and 1 more)', 'build, quick', 'grace', '']);
  assert.equal(table.rows[0]?.cells.length, table.columnDefinitions.length);
});

/**
 * The board reads a factory's proposals as the rows of their list's Table (`src/lib/api/proposals.ts`): asked with `TABLE_ACCEPT`, every
 * page, each row's cells read by their column's name with its object's time, never a proposal's objects; a row whose phase is no phase,
 * and a list answered whole where a Table was asked, are each an `UnreadAnswer`. Each read on a stand-in `fetch`.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';
import { TABLE_ACCEPT } from 'objects';
import { proposalsQuery, waitingProposalsQuery } from '../src/lib/api/proposals.ts';
import { UnreadAnswer } from '../src/lib/api/read.ts';
import { apiAnswers } from './network.ts';

const COLUMNS = ['Name', 'Phase', 'Widens', 'Why', 'Proposed by', 'Changes'].map((name, i) => ({
  name,
  type: name === 'Widens' ? 'boolean' : name === 'Changes' ? 'integer' : 'string',
  format: name === 'Name' ? 'name' : '',
  description: `The ${name}.`,
  priority: i < 4 ? 0 : 1,
}));

/** A row of the proposal `name` in `phase`, made at `at`. */
const row = (name: string, phase: string, at: string, widens = false, why = '') => ({
  cells: [name, phase, widens, why, 'person', 1],
  object: { kind: 'PartialObjectMetadata', apiVersion: 'meta.k8s.io/v1', metadata: { name, namespace: 'acme', creationTimestamp: at } },
});

/** A page of the Table holding `rows`, saying `next` is the page after it where there is one. */
const tableOf = (rows: readonly unknown[], next?: string) => ({
  kind: 'Table',
  apiVersion: 'meta.k8s.io/v1',
  metadata: next === undefined ? {} : { continue: next },
  columnDefinitions: COLUMNS,
  rows,
});

const json = (value: unknown) => Response.json(value, { status: 200 });

test("a factory's proposals are read as their Table's rows, asked as a Table, every page", async () => {
  const accepts: (string | null)[] = [];
  const asked: string[] = [];
  apiAnswers((url, sent) => {
    accepts.push(sent.headers.get('accept'));
    asked.push(url);
    return json(
      url.includes('continue=')
        ? tableOf([row('p2', 'applied', '2026-11-02T00:00:00Z')])
        : tableOf([row('p1', 'waiting', '2026-11-01T00:00:00Z', true, 'Hire a reviewer.')], 'next'),
    );
  });
  const rows = await new QueryClient().fetchQuery(proposalsQuery('acme'));
  assert.deepEqual(rows, [
    { name: 'p1', phase: 'waiting', widens: true, why: 'Hire a reviewer.', creationTimestamp: '2026-11-01T00:00:00Z' },
    { name: 'p2', phase: 'applied', widens: false, why: '', creationTimestamp: '2026-11-02T00:00:00Z' },
  ]);
  assert.equal(asked.length, 2);
  for (const accept of accepts) assert.equal(accept, TABLE_ACCEPT);
});

test('the waiting proposals are asked by phase, as rows', async () => {
  const asked: string[] = [];
  apiAnswers((url) => {
    asked.push(url);
    return json(tableOf([row('p1', 'waiting', '2026-11-01T00:00:00Z')]));
  });
  const rows = await new QueryClient().fetchQuery(waitingProposalsQuery('acme'));
  assert.deepEqual(
    rows.map((r) => r.name),
    ['p1'],
  );
  assert.ok(asked.every((url) => new URL(url, 'http://board.invalid').searchParams.get('fieldSelector') === 'status.phase=waiting'));
});

test('REFUSED: a row whose phase is no phase, and a list answered whole, are each an UnreadAnswer', async () => {
  apiAnswers(() => json(tableOf([row('p1', 'pending', '2026-11-01T00:00:00Z')])));
  await assert.rejects(new QueryClient().fetchQuery({ ...proposalsQuery('acme'), retry: false }), UnreadAnswer);
  apiAnswers(() => json({ apiVersion: 'nemia/v1', kind: 'ProposalList', metadata: {}, items: [] }));
  await assert.rejects(new QueryClient().fetchQuery({ ...proposalsQuery('acme'), retry: false }), UnreadAnswer);
});

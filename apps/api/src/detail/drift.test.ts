/**
 * The drift the run page shows: the kinds a run is behind the revisions ledger on (`kindsOf`), and how the workflow folder has moved away
 * from the steps it started with (`driftOf`).
 *
 * At shipped defaults, over the scratch store the harness makes (test/harness.ts), whose `revisions/` this file writes by hand: the
 * subject is what a person is shown of the pins and the ledger, and the path from an edit to a pin is the package's.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Pin, Revision } from 'agent-orchestrator';
import type { Run } from 'agent-orchestrator/run';
import type { Workflow } from 'agent-orchestrator/workflow';
import { driftOf, kindsOf } from './tries.ts';

/** `entries` written as the ledger of `kind` and `name`, as the store keeps it. */
function ledger(kind: string, name: string, entries: readonly Revision[]): void {
  const file = path.join(root, 'revisions', kind, `${encodeURIComponent(name)}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(entries)}\n`);
}

/** Revisions 1..`n` of one content each, so a kind can be put at any number. */
const upTo = (n: number): Revision[] =>
  Array.from({ length: n }, (_, i) => ({ n: i + 1, hash: `h${i + 1}`, at: '2026-10-15T00:00:00.000Z' }));

const pin = (kind: Pin['kind'], name: string, n: number): Pin => ({ kind, name, n, hash: `h${n}` });

/** A run with the pins given, and one step `build` with the pins given for it. */
const runWith = (pinned?: readonly Pin[], step?: readonly Pin[]): Run => ({
  id: 'r-1',
  workspace: '/w',
  brief: 'do it',
  workflowDir: '/w/workflows/team',
  createdAt: '2026-10-15T00:00:00.000Z',
  place: { kind: 'folder' },
  steps: { build: { taskId: 'r-1-build', ...(step ? { pinned: step } : {}) } },
  ...(pinned ? { pinned } : {}),
});

test('a run whose pins are the ledger’s newest is behind on nothing', () => {
  ledger('agent', 'quiet', upTo(3));
  assert.deepEqual(kindsOf(runWith([pin('agent', 'quiet', 3)])), []);
});

test('a run two revisions behind on one agent gives one entry, with what it pinned and what the ledger holds now', () => {
  ledger('agent', 'behind', upTo(6));
  ledger('skill', 'kept', upTo(1));
  assert.deepEqual(kindsOf(runWith([pin('agent', 'behind', 4), pin('skill', 'kept', 1)])), [
    { kind: 'agent', name: 'behind', pinned: 4, now: 6 },
  ]);
});

test('a record written before revisions pinned nothing, drifts on nothing, and does not throw', () => {
  assert.deepEqual(kindsOf(runWith()), []);
});

test('a kind the ledger has no entry for drifts on nothing: nothing has resolved that content but this run', () => {
  assert.deepEqual(kindsOf(runWith([pin('workflow', 'never-in-the-ledger', 1)])), []);
});

test('a step that already ran says which revision it ran on, once the run has moved past it; one on the run’s own pin says nothing of its own', () => {
  ledger('agent', 'moved', upTo(6));
  assert.deepEqual(
    kindsOf(runWith([pin('agent', 'moved', 6)], [pin('agent', 'moved', 5)])),
    [{ kind: 'agent', name: 'moved', pinned: 5, now: 6, step: 'build' }],
    'the run is on the newest, and the step that ran is one behind: the line names the step',
  );
  assert.deepEqual(
    kindsOf(runWith([pin('agent', 'moved', 5)], [pin('agent', 'moved', 5)])),
    [{ kind: 'agent', name: 'moved', pinned: 5, now: 6 }],
    "the step's pin is the run's, so the run's one line says it",
  );
});

test('the folder’s own drift is a name-level warning, and none where the names agree', () => {
  const steps = (...names: string[]): Workflow[] => names.map((name) => ({ name, after: [], body: '' }));
  assert.equal(driftOf(runWith(), steps('build')), null);
  const added = driftOf(runWith(), steps('build', 'review'));
  assert.match(added!, /it has review, which the run did not start with/);
  const removed = driftOf(runWith(), steps('review'));
  assert.match(removed!, /it no longer has build/);
});

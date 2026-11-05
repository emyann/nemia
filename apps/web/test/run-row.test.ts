/**
 * A run of the RunList as the row the board's floor and strips read (`src/lib/api/runRow.ts`): each field from where the Run
 * carries it, the default factory said null, a step's agent from its frozen step and its `since` from its timeline, a prune in
 * words, and a run the list could not judge kept as a row that says why.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prunedSaid, runRowOf, runRowsOf, stepSinceOf, unjudgedRowOf } from '../src/lib/api/runRow.ts';
import { run, span, stepStatus, timed } from './run-object-fixtures.ts';

test('a run is the row its fields say: its name, spec and status under the row names', () => {
  const row = runRowOf(run('acme'));
  assert.equal(row.id, 'r-1');
  assert.equal(row.createdAt, '2026-11-02T10:00:00.000Z');
  assert.deepEqual(row.labels, { workflow: 'quick', factory: 'acme', team: 'blue' });
  assert.equal(row.factory, 'acme');
  assert.equal(row.repo, '/repo');
  assert.equal(row.place, 'git');
  assert.equal(row.work, null);
  assert.equal(row.brief, 'a brief');
  assert.equal(row.workflowDir, '/team/quick');
  assert.deepEqual(row.try, { agent: 'grace' });
  assert.deepEqual(row.after, ['r-0']);
  assert.deepEqual(row.context, ['r-c']);
  assert.equal(row.status, 'running');
  assert.equal(row.phase, 'running');
  assert.equal(row.reason, 'Running');
  assert.equal(row.moving, true);
  assert.equal(row.cost?.said, '$1.50');
  assert.equal(row.atWork?.since, '2026-11-02T10:05:00.000Z');
  assert.equal(row.startedAt, '2026-11-02T10:00:01.000Z');
  assert.deepEqual(row.holdUntil, ['r-h']);
  assert.deepEqual(row.waitingOnYou, ['review']);
  assert.deepEqual(row.waitingOnYouWords, ['approve review']);
  assert.equal(row.pruned, null);
  assert.equal(row.unreadable, null);
  assert.equal(row.workflowPage, null);
});

test("a row's graph leaves out what a step is handed, as every page draws it", () => {
  assert.deepEqual(runRowOf(run('acme')).graph, {
    roots: ['implement'],
    edges: [{ from: 'implement', to: 'review', kind: 'after' }],
  });
});

test('the default factory is said null, as rows have always said it', () => {
  assert.equal(runRowOf(run('default')).factory, null);
  const named = run('default');
  const { factory: _factory, ...labels } = named.metadata.labels;
  const { namespace: _namespace, ...metadata } = named.metadata;
  assert.equal(runRowOf({ ...named, metadata: { ...metadata, labels } }).factory, null);
});

test('a step carries its codes and needs, its agent from its frozen step, and since when its task still at work started', () => {
  const [implement, review] = runRowOf(run('acme')).steps;
  assert.equal(implement?.name, 'implement');
  assert.equal(implement?.phase, 'running');
  assert.equal(implement?.taskId, 'r-1-implement-2');
  assert.equal(implement?.branch, 'wf/r-1/implement');
  assert.equal(implement?.note, 'try 2');
  assert.equal(implement?.agent, 'grace');
  assert.equal(implement?.since, '2026-11-02T10:05:00.000Z');
  assert.equal(review?.agent, null);
  assert.equal(review?.since, null);
  assert.equal(review?.needs, 'a word');
  assert.equal(review?.approve, 'approve review');
});

test("a step's since is the earliest task of it still running, and null once every one ended", () => {
  const ended = stepStatus('s', { timeline: [timed(1, span('t-1', '2026-11-02T10:01:00.000Z', '2026-11-02T10:02:00.000Z'))] });
  assert.equal(stepSinceOf(ended), null);
  const unspawned = stepStatus('s', { timeline: [timed(1, span('t-1', null, null))] });
  assert.equal(stepSinceOf(unspawned), null);
  const resumed = stepStatus('s', {
    timeline: [
      {
        ...timed(1, span('t-1', '2026-11-02T10:01:00.000Z', '2026-11-02T10:02:00.000Z')),
        turn: { asked: true, heldFrom: null, spawnedAt: '2026-11-02T10:03:00.000Z', endedAt: null },
      },
    ],
  });
  assert.equal(stepSinceOf(resumed), '2026-11-02T10:03:00.000Z');
});

test('a prune is said in words: its worktrees, its files where they went too, and what is kept', () => {
  const worktrees = { at: '2026-11-03T09:00:00.000Z', worktrees: [{ path: '/w', bytes: 10 }], artifacts: null };
  assert.match(prunedSaid(worktrees), /worktrees/);
  const both = { ...worktrees, artifacts: { at: '2026-11-03T09:01:00.000Z', bytes: 5 } };
  assert.notEqual(prunedSaid(both), prunedSaid(worktrees), 'a prune that took its files too says so');
  const files = { ...both, worktrees: [] };
  assert.doesNotMatch(prunedSaid(files), /worktrees/);
  assert.equal(runRowOf(run('acme', { pruned: worktrees })).pruned?.said, prunedSaid(worktrees));
  const worded = { ...worktrees, said: 'the words the api answered' };
  assert.equal(runRowOf(run('acme', { pruned: worded })).pruned?.said, worded.said, "the api's words, where the Run carries them");
});

test("a run the list could not judge is a row that says why, on its namespace's floor (none for default) and moving nothing it can say", () => {
  const unjudged = { name: 'r-bad', error: 'the journal of r-bad-implement-1 does not read' };
  const row = unjudgedRowOf(unjudged);
  assert.equal(row.id, 'r-bad');
  assert.equal(row.unreadable, unjudged.error, 'the row says why, as the list said it');
  assert.equal(row.factory, null);
  assert.equal(unjudgedRowOf({ name: 'r-bad', namespace: 'foo', error: 'unread' }).factory, 'foo');
  assert.deepEqual(row.steps, []);
});

test('a list is its judged runs, then a row for each it could not judge', () => {
  const rows = runRowsOf({
    apiVersion: 'nemia/v1',
    kind: 'RunList',
    metadata: {},
    items: [run('acme')],
    unjudged: [{ name: 'r-bad', error: 'unreadable' }],
  });
  assert.deepEqual(
    rows.map((r) => [r.id, r.unreadable]),
    [
      ['r-1', null],
      ['r-bad', 'unreadable'],
    ],
  );
});

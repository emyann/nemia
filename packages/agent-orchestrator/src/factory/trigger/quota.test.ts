/**
 * Whether a trigger can spend quota, read off what its target reaches (`quota.ts`): a step classed by what it runs (`stepReach`), the walk
 * from the target through its card nodes, each workflow once (`reachedWorkflows`), and the verdict over it (`triggerQuota`) with the
 * workflow that settles it (`quotaSettledBy`) — on fixture workflows, never on what the trigger queues.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { quotaSettledBy, reachedWorkflows, stepReach, triggerQuota, type ReachStep } from './quota.ts';

const SCRIPT: ReachStep = { route: { kind: 'script', script: 'pick.ts' } };
const TABLE: ReachStep = { route: { kind: 'table', from: 'a.b', table: { x: 'x' } } };
const JUDGE: ReachStep = { route: { kind: 'judge' } };
const SESSION: ReachStep = {};
/** A card node that files a card, as given, for `workflow`. */
const node = (workflow: string) => ({ workflow, card: 'given' }) satisfies ReachStep;
const BACKLOG: ReachStep = { card: 'backlog' };

/** The quota of a trigger to `target` over the workflows `offered`, and the workflow that settles it. */
const quotaOf = (target: string, offered: Readonly<Record<string, readonly ReachStep[]>>) => {
  const reached = reachedWorkflows(target, (name) => (Object.hasOwn(offered, name) ? offered[name] : undefined));
  return [triggerQuota(reached), quotaSettledBy(reached)];
};

describe('a step is classed by what it runs', () => {
  const rows: Array<[string, ReachStep, string]> = [
    ['a workflow node', { workflow: 'w' }, 'node'],
    ['a card node that files a given card', node('w'), 'node'],
    ['a backlog node', BACKLOG, 'node'],
    ['a table condition', TABLE, 'table'],
    ['a script condition', SCRIPT, 'script'],
    ['a judge', JUDGE, 'judge'],
    ['any other step, a session', SESSION, 'session'],
  ];
  for (const [name, step, kind] of rows) test(name, () => assert.equal(stepReach(step), kind));
});

describe('what a trigger reaches decides whether it can spend quota', () => {
  test('a script condition and card nodes to script-only workflows are free, however many cards the trigger queues', () => {
    assert.deepEqual(quotaOf('sort', { sort: [SCRIPT, node('tidy'), BACKLOG], tidy: [SCRIPT] }), ['free', undefined]);
  });
  test('a table condition routing to a node whose workflow has an agent step spends, by that workflow', () => {
    assert.deepEqual(quotaOf('sort', { sort: [TABLE, node('make')], make: [SESSION] }), ['spends', 'make']);
  });
  test('a judge spends', () => {
    assert.deepEqual(quotaOf('door', { door: [JUDGE, BACKLOG] }), ['spends', 'door']);
  });
  test('a node to a workflow not offered, with no agent elsewhere, is unknown; with an agent step in the target it spends', () => {
    assert.deepEqual(quotaOf('sort', { sort: [SCRIPT, node('gone')] }), ['unknown', 'gone']);
    assert.deepEqual(quotaOf('sort', { sort: [SESSION, node('gone')] }), ['spends', 'sort']);
  });
  test('two workflows whose nodes file for each other are each walked once, and the walk ends', () => {
    const ring: Record<string, readonly ReachStep[]> = { a: [node('b')], b: [node('a'), SCRIPT] };
    const reached = reachedWorkflows('a', (name) => ring[name]);
    assert.deepEqual(
      reached.map((w) => w.name),
      ['a', 'b'],
    );
    assert.equal(triggerQuota(reached), 'free');
  });
  test('a backlog node reaches no workflow', () => {
    assert.deepEqual(
      reachedWorkflows('sort', (name) => (name === 'sort' ? [SCRIPT, BACKLOG] : undefined)).map((w) => w.name),
      ['sort'],
    );
  });
});

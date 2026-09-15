import './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ROUNDS, parseWorkflow, validate, type Workflow } from 'agent-workflows/workflow';
import { graphOf } from '../src/graph.ts';

/** Steps as `wf start` freezes them: parsed and validated, so the graph is read off what the run is judged by. */
const workflow = (files: Record<string, string>, schemas: Record<string, string> = {}): Workflow[] => {
  const steps = Object.entries(files).map(([name, text]) => parseWorkflow(name, text, (file) => schemas[file]));
  validate(steps);
  return steps;
};

const again = JSON.stringify({ type: 'object', properties: { again: { type: 'boolean' } }, required: ['again'], additionalProperties: false });

test('a two-step loop: the card leads to the target only, an `after` edge forward and a `loop` edge back', () => {
  const steps = workflow({
    implement: 'Implement it.\n',
    review: '---\nafter: implement\nloop: implement\noutput: review.json\n---\nReview it.\n',
  }, { 'review.json': again });
  assert.deepEqual(graphOf(steps), {
    roots: ['implement'],
    edges: [
      { from: 'implement', to: 'review', kind: 'after' },
      // From the looping step back to its target, with the rounds the parser set for a loop that does not say.
      { from: 'review', to: 'implement', kind: 'loop', rounds: DEFAULT_ROUNDS },
    ],
  });

  const capped = workflow({
    implement: 'Implement it.\n',
    review: '---\nafter: implement\nloop: implement\nrounds: 5\noutput: review.json\n---\nReview it.\n',
  }, { 'review.json': again });
  assert.deepEqual(graphOf(capped).edges.at(-1), { from: 'review', to: 'implement', kind: 'loop', rounds: 5 });
});

test('a chain with a fan-out: one root, an edge per `after`, and a fan-in reached from each of its parents', () => {
  const steps = workflow({
    plan: 'Plan it.\n',
    api: '---\nafter: plan\n---\nBuild the api.\n',
    web: '---\nafter: plan\n---\nBuild the web app.\n',
    ship: '---\nafter: api, web\n---\nShip it.\n',
  });
  assert.deepEqual(graphOf(steps), {
    roots: ['plan'],
    edges: [
      { from: 'plan', to: 'api', kind: 'after' },
      { from: 'plan', to: 'web', kind: 'after' },
      { from: 'api', to: 'ship', kind: 'after' },
      { from: 'web', to: 'ship', kind: 'after' },
    ],
  });
});

test('a workflow with no loop has no `loop` edge, and every step that waits on none is a root', () => {
  const steps = workflow({
    implement: 'Implement it.\n',
    // `resume:` implies `after:`: a step that continues another waits on it.
    respond: '---\nafter: review\nresume: implement\n---\nAnswer the review.\n',
    review: '---\nafter: implement\n---\nReview it.\n',
    tokens: 'Pick the colour tokens.\n',
  });
  const graph = graphOf(steps);
  assert.deepEqual(graph.roots, ['implement', 'tokens']);
  assert.deepEqual(graph.edges.map((e) => `${e.from} ${e.kind} ${e.to}`), [
    'review after respond',
    'implement after respond',
    'implement after review',
  ]);
  assert.equal(graph.edges.some((e) => e.kind === 'loop'), false);
});

test('an edge naming a step not in the graph is not drawn, and does not make its step unreachable', () => {
  // Only a record edited by hand has one: `validate` refuses a workflow that names a step it does not have.
  assert.deepEqual(graphOf([
    { name: 'review', after: ['gone', 'gone'], loop: 'gone', rounds: 2 },
    { name: 'self', after: ['self'] },
  ]), { roots: ['review', 'self'], edges: [] });
  assert.deepEqual(graphOf([]), { roots: [], edges: [] });
});

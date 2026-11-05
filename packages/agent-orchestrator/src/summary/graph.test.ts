import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ROUNDS, parseWorkflow, validate, type Workflow } from '../workflow.ts';
import path from 'node:path';
import { loadWorkflows } from '../workflows/workflows.store.ts';
import { graphOf, inputGraphOf, routedDiagram, runGraph, TRIAGE } from './graph.ts';

/**
 * Steps as `nemia start` freezes them, each file given `place: git`: parsed and validated, so the graph is read off what the run is judged
 * by.
 */
const workflow = (files: Record<string, string>, schemas: Record<string, string> = {}): Workflow[] => {
  const placed = (text: string) => `---\nplace: git\n${text.startsWith('---\n') ? text.slice(4) : `---\n${text}`}`;
  const steps = Object.entries(files).map(([name, text]) => parseWorkflow(name, placed(text), (file) => schemas[file]));
  validate(steps);
  return steps;
};

const again = JSON.stringify({
  type: 'object',
  properties: { again: { type: 'boolean' } },
  required: ['again'],
  additionalProperties: false,
});

test('a two-step loop: the card leads to the target only, an `after` edge forward and a `loop` edge back', () => {
  const steps = workflow(
    {
      implement: 'Implement it.\n',
      review: '---\nafter: implement\nloop: implement\noutput: review.json\n---\nReview it.\n',
    },
    { 'review.json': again },
  );
  assert.deepEqual(
    graphOf(steps),
    {
      roots: ['implement'],
      edges: [
        { from: 'implement', to: 'review', kind: 'after' },
        { from: 'review', to: 'implement', kind: 'loop', rounds: DEFAULT_ROUNDS },
      ],
    },
    'the loop edge runs from the looping step back to its target, with the rounds the parser set for a loop that does not say',
  );

  const capped = workflow(
    {
      implement: 'Implement it.\n',
      review: '---\nafter: implement\nloop: implement\nrounds: 5\noutput: review.json\n---\nReview it.\n',
    },
    { 'review.json': again },
  );
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
    /** `resume:` implies `after:`: a step that continues another waits on it. */
    respond: '---\nafter: review\nresume: implement\n---\nAnswer the review.\n',
    review: '---\nafter: implement\n---\nReview it.\n',
    tokens: 'Pick the colour tokens.\n',
  });
  const graph = graphOf(steps);
  assert.deepEqual(graph.roots, ['implement', 'tokens']);
  assert.deepEqual(
    graph.edges.map((e) => `${e.from} ${e.kind} ${e.to}`),
    ['review after respond', 'implement after respond', 'implement after review'],
  );
  assert.equal(
    graph.edges.some((e) => e.kind === 'loop'),
    false,
  );
});

test('an edge naming a step not in the graph is not drawn, and does not make its step unreachable', () => {
  assert.deepEqual(
    graphOf([
      { name: 'review', after: ['gone', 'gone'], loop: 'gone', rounds: 2 },
      { name: 'self', after: ['self'] },
    ]),
    { roots: ['review', 'self'], edges: [] },
    'a record edited by hand, the one place such an edge is: `validate` refuses a workflow that names a step it does not have',
  );
  assert.deepEqual(graphOf([]), { roots: [], edges: [] });
});

test("a run's graph: the judged steps' edges, and a root for each step the run shows that they do not have, in the run's order", () => {
  const steps = workflow({ implement: 'Implement it.\n', review: '---\nafter: implement\n---\nReview it.\n' });
  assert.deepEqual(runGraph(steps, ['implement', 'review', 'docs']), {
    roots: ['implement', 'docs'],
    edges: [{ from: 'implement', to: 'review', kind: 'after' }],
  });
  assert.deepEqual(
    runGraph(steps, ['review', 'implement']),
    graphOf(steps),
    "a name the steps have adds nothing: the run's order of them is not the graph's",
  );
});

test('an `input` edge per step a step reads the output of, drawn after its `after` edges and before its `loop` edge', async (t) => {
  await t.test('a step reading a step it waits on draws one `input` edge beside its `after` edge', () => {
    assert.deepEqual(
      inputGraphOf([
        { name: 'design', after: [] },
        { name: 'implement', after: ['design'], input: ['design', 'design'], loop: 'design', rounds: 2 },
      ]).edges,
      [
        { from: 'design', to: 'implement', kind: 'after' },
        { from: 'design', to: 'implement', kind: 'input' },
        { from: 'implement', to: 'design', kind: 'loop', rounds: 2 },
      ],
    );
  });
  await t.test('an `input` naming a step not given, or the step itself, draws nothing', () => {
    assert.deepEqual(inputGraphOf([{ name: 'review', after: [], input: ['gone', 'review'] }]), {
      roots: ['review'],
      edges: [],
    });
  });
  await t.test('the page and the list draw no `input` edge', () => {
    assert.deepEqual(
      graphOf([
        { name: 'design', after: [] },
        { name: 'implement', after: [], input: ['design'] },
      ]).edges,
      [],
    );
  });
  await t.test('a workflow read from its files draws the edge its `input:` says', () => {
    const steps = workflow(
      {
        design: '---\noutput: plan.json\n---\nDesign it.\n',
        implement: '---\nafter: design\ninput: design\n---\nImplement it.\n',
      },
      { 'plan.json': again },
    );
    assert.deepEqual(
      inputGraphOf(steps).edges.map((e) => `${e.from} ${e.kind} ${e.to}`),
      ['design after implement', 'design input implement'],
    );
  });
});

/** The tests' `triage` workflow, as `nemia start` would freeze it. */
const triage = (): Workflow[] => loadWorkflows(path.join(import.meta.dirname, '..', '..', 'test', 'fixtures', 'team', 'triage'));

test('a condition: a route edge per route of a `when:` in place of the after edge, and every node with its kind', () => {
  assert.deepEqual(graphOf(triage()), {
    roots: ['plan'],
    edges: [
      { from: 'plan', to: 'triage', kind: 'after' },
      { from: 'triage', to: 'build-backend', kind: 'route', route: 'backend' },
      { from: 'triage', to: 'build-web', kind: 'route', route: 'web' },
      { from: 'triage', to: 'handoff', kind: 'route', route: 'web' },
      { from: 'build-web', to: 'notes', kind: 'after' },
      { from: 'build-backend', to: 'notes', kind: 'after' },
    ],
    nodes: [
      { name: 'plan', kind: 'step' },
      { name: 'triage', kind: 'condition', ends: ['docs'] },
      { name: 'build-backend', kind: 'step' },
      { name: 'build-web', kind: 'step' },
      { name: 'handoff', kind: 'workflow', workflow: 'dev' },
      { name: 'notes', kind: 'step' },
    ],
  });
});

test('a `when:` naming two routes draws two route edges; a node after a condition with no `when:` keeps its after edge', () => {
  const graph = graphOf([
    { name: 'pick', after: [], routes: ['a', 'b'] },
    { name: 'both', after: ['pick'], when: ['a', 'b'] },
    { name: 'every', after: ['pick'] },
  ]);
  assert.deepEqual(graph.edges, [
    { from: 'pick', to: 'both', kind: 'route', route: 'a' },
    { from: 'pick', to: 'both', kind: 'route', route: 'b' },
    { from: 'pick', to: 'every', kind: 'after' },
  ]);
});

test('a workflow with no condition and no workflow node carries no nodes: its graph is the one it was', () => {
  assert.ok(
    !(
      'nodes' in
      graphOf([
        { name: 'a', after: [] },
        { name: 'b', after: ['a'] },
      ])
    ),
  );
  assert.ok(!('nodes' in inputGraphOf([{ name: 'a', after: [] }])));
});

test("the drawing's workflow is the folder's: `TRIAGE` reads as the tests' triage, and the diagram prints from it", () => {
  assert.deepEqual(graphOf(TRIAGE), graphOf(triage()));
  assert.equal(routedDiagram(), routedDiagram(graphOf(triage())));
  const lines = routedDiagram().split('\n');
  for (const line of ['  triage --> build_web: web', '  triage --> [*]: docs (ends)', '  handoff --> [*]: sent', '  notes --> [*]'])
    assert.ok(lines.includes(line), line);
});

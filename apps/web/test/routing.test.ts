/**
 * What the canvases read of a routed run (src/lib/routing.ts): a step's sentence read for its route or its card, the route each condition
 * took, the graph's conditions and workflow nodes, and a condition's routes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nodeKinds, routedOf, routesOf, takenRoutes } from '../src/lib/routing.ts';
import type { RunGraph } from '../src/lib/api/graph.ts';

test('routedOf reads the words the listing writes of a routed step, and nothing else', () => {
  assert.deepEqual(routedOf('routed: web'), { kind: 'routed', route: 'web' });
  assert.deepEqual(routedOf('skipped (triage: web)'), { kind: 'skipped', condition: 'triage', route: 'web' });
  assert.deepEqual(routedOf('sent → r-1-handoff'), { kind: 'sent', card: 'r-1-handoff' });
  assert.deepEqual(routedOf('awaiting approval · proposes docs'), { kind: 'proposes', route: 'docs' });
  assert.equal(routedOf('skipped'), null, 'a skipped node whose condition is not said names no route');
  assert.equal(routedOf('unverified · done'), null);
});

test("takenRoutes: a condition's own word first, else the route a node it passed by names", () => {
  const taken = takenRoutes([
    { name: 'triage', message: 'routed: web' },
    { name: 'judge', message: 'unverified' },
    { name: 'docs', message: 'skipped (judge: backend)' },
    { name: 'backend', message: 'skipped (triage: elsewhere)' },
  ]);
  assert.deepEqual(
    [...taken],
    [
      ['triage', 'web'],
      ['judge', 'backend'],
    ],
  );
});

test("nodeKinds and routesOf: a graph's conditions and workflow nodes, a condition's routes and its ends", () => {
  const graph: RunGraph = {
    roots: ['plan'],
    edges: [
      { from: 'plan', to: 'triage', kind: 'after' },
      { from: 'triage', to: 'web', kind: 'route', route: 'web' },
      { from: 'triage', to: 'handoff', kind: 'route', route: 'web' },
      { from: 'triage', to: 'api', kind: 'route', route: 'backend' },
    ],
    nodes: [
      { name: 'plan', kind: 'step' },
      { name: 'triage', kind: 'condition', ends: ['docs'] },
      { name: 'handoff', kind: 'workflow', workflow: 'dev' },
    ],
  };
  assert.deepEqual([...nodeKinds(graph).keys()], ['triage', 'handoff'], 'a plain step is none of them');
  assert.deepEqual(routesOf(graph, 'triage'), ['web', 'backend', 'docs']);
  assert.deepEqual(routesOf({ roots: [], edges: [] }, 'triage'), [], 'a plain graph has no routes');
});

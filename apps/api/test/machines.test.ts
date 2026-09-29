/**
 * GET /api/machines (machines/machines.ts): the state machines the board draws, listed, and each one's graph, read off its code through
 * the orchestrator's `lifecycleGraph`. `WF_ROOT` is set to a scratch store before app.ts is imported: agent-orchestrator locates its
 * store when the module loads.
 */
import './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scratch } from './scratch.ts';

process.env.WF_ROOT = scratch('nemia-api-machines-');
const { app } = await import('../src/app.ts');
const { lifecycleGraph } = await import('agent-orchestrator');
type MachineGraph = import('../src/machines/machines.ts').MachineGraph;
type MachineListing = import('../src/machines/machines.ts').MachineListing;

test('the list names each machine, its title and the file it is drawn from', async () => {
  const res = await app.request('/api/machines');
  assert.equal(res.status, 200);
  assert.deepEqual(((await res.json()) as { machines: MachineListing[] }).machines, [
    { name: 'lifecycle', title: "A task's lifecycle", source: 'packages/agent-runtime/src/core/lifecycle.ts' },
  ]);
});

test("the lifecycle's graph is the runtime's, whole: its states, its first and final states, and every edge with its guard", async () => {
  const res = await app.request('/api/machines/lifecycle');
  assert.equal(res.status, 200);
  const graph = (await res.json()) as MachineGraph;
  assert.equal(graph.name, 'lifecycle');
  assert.equal(graph.initial, 'submitted');
  assert.equal(graph.states.length, 9);
  assert.deepEqual(graph.final, ['completed', 'failed', 'canceled']);
  assert.deepEqual(graph.edges, lifecycleGraph().edges, 'every edge, as the runtime reads it');
  assert.ok(
    graph.edges.some(
      (e) => e.from === 'ending' && e.event === 'CLOSED' && e.guard === 'lastDone' && e.to === 'completed' && e.action === 'settle',
    ),
    'a guarded edge keeps its guard and its action',
  );
});

test('REFUSED: a machine there is not, with the names there are', async () => {
  for (const name of ['step', 'toString', '__proto__']) {
    const res = await app.request(`/api/machines/${name}`);
    assert.equal(res.status, 404, name);
    const { error } = (await res.json()) as { error: string };
    assert.equal(error, `no machine is named ${name}: the machines are lifecycle (GET /api/machines)`);
  }
});

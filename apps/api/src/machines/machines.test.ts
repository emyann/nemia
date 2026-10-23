/**
 * GET /api/machines (machines/machines.ts): the state machines the board draws, listed, and each one's graph, read off its code through
 * the orchestrator's `lifecycleGraph`, over the harness's scratch store (`root`).
 */
import '../../test/harness.ts';
import { test } from 'node:test';
import { story } from '../../test/checkpoints.ts';
import assert from 'node:assert/strict';
import { lifecycleGraph } from 'agent-orchestrator';
import { app } from '../app.ts';
import type { MachineGraph, MachineListing } from './machines.ts';

test('The board reads the state machines: the list, the lifecycle drawn whole off its code, and a machine there is not refused', async (t) => {
  const s = story(t);
  await s.test('the list names each machine, its title and the file it is drawn from', async () => {
    const res = await app.request('/api/machines');
    assert.equal(res.status, 200);
    assert.deepEqual(((await res.json()) as { machines: MachineListing[] }).machines, [
      { name: 'lifecycle', title: "A task's lifecycle", source: 'packages/agent-runtime/src/core/lifecycle.ts' },
    ]);
  });
  await s.test(
    "the lifecycle's graph is the runtime's, whole: its states, its first and final states, every edge with its guard, and its verbs",
    async () => {
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
      assert.deepEqual(graph.verbs, lifecycleGraph().verbs, 'every verb written from outside it, as the runtime declares it');
      assert.deepEqual(
        graph.verbs.find((v) => v.verb === 'close'),
        { verb: 'close', entry: 'closed', by: 'person', from: ['input-required'], to: 'ending', guard: 'awaitsWord' },
        "a person's close, from where it is taken to where it leads, under its guard",
      );
    },
  );
  await s.test('REFUSED: a machine there is not, with the names there are', async () => {
    for (const name of ['step', 'toString', '__proto__']) {
      const res = await app.request(`/api/machines/${name}`);
      assert.equal(res.status, 404, name);
      const { error } = (await res.json()) as { error: string };
      assert.equal(error, `no machine is named ${name}: the machines are lifecycle (GET /api/machines)`);
    }
  });
});

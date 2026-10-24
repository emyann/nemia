/**
 * The orchestrator's whole diagram: a block for each context's entity, and the runtime's task a node known by its id alone.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orchestratorModelDiagram } from './diagram.model.ts';

test("the orchestrator's diagram draws every context's entities, and the runtime's TaskId as an id-only node", () => {
  const lines = orchestratorModelDiagram().split('\n');
  const heads = lines.filter((l) => /^ {2}\w+ \{$/.test(l)).map((l) => l.trim().split(' ')[0]);
  for (const entity of ['Run', 'Step', 'Try', 'Round', 'Landing']) assert.ok(heads.includes(entity), `${entity} has a block`);
  assert.ok(!heads.includes('TaskId'), 'TaskId has no block: it is the runtime’s');
  assert.ok(lines.includes('  Try }o--|| TaskId : taskId'), lines.join('\n'));
});

/**
 * The Proposal phases as a machine (`machine.ts`): every phase reached from the one a proposal is made in, each move a pass makes of an
 * approved proposal (`proposalApply`'s actions) an edge of it, and the diagram drawing each edge once. That the README's
 * `diagram:proposal` block is what `proposalDiagram` prints is `tools/guards/test/diagrams.test.ts`'s.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROPOSAL_PHASES } from 'objects';
import { PHASE_OF_ACTION, PROPOSAL_EDGES, PROPOSAL_INITIAL, PROPOSAL_STATES, proposalDiagram, proposalFinal } from './machine.ts';

test('every phase is a state, reached from waiting, and the phases no move leaves are the ends', () => {
  assert.deepEqual(Object.keys(PROPOSAL_STATES).sort(), [...PROPOSAL_PHASES].sort());
  const reached = new Set([PROPOSAL_INITIAL]);
  for (let grew = true; grew;) {
    grew = false;
    for (const e of PROPOSAL_EDGES)
      if (reached.has(e.from) && !reached.has(e.to)) {
        reached.add(e.to);
        grew = true;
      }
  }
  assert.deepEqual([...reached].sort(), [...PROPOSAL_PHASES].sort());
  assert.deepEqual(proposalFinal().sort(), ['applied', 'declined', 'dropped', 'failed', 'stale']);
});

test("each move of a pass's action is an edge from approved", () => {
  for (const [action, to] of Object.entries(PHASE_OF_ACTION))
    if (to !== null)
      assert.ok(
        PROPOSAL_EDGES.some((e) => e.from === 'approved' && e.to === to),
        `${action} → ${to}`,
      );
});

test('the diagram draws each edge once, from waiting', () => {
  const lines = proposalDiagram().split('\n');
  assert.equal(lines[0], 'stateDiagram-v2');
  assert.ok(lines.includes(`  [*] --> ${PROPOSAL_INITIAL}: proposed`));
  for (const e of PROPOSAL_EDGES) assert.equal(lines.filter((l) => l === `  ${e.from} --> ${e.to}: ${e.event}`).length, 1);
});

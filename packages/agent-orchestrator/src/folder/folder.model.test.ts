/**
 * A definition's model (`folder.model.ts`): a workflow's invariants, each refusing its planted breach, the rules `validate` reads too.
 * That a `WorkflowDir` is what `workflowFolder` resolves is `contracts/workflow-dir.contract.ts`'s. Refusals are asserted by the fact,
 * never by their words.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { Workflow, WorkflowDir } from './folder.model.ts';

const step = (name: string, after: string[] = []) => ({ name, after });
const workflow = (steps: unknown[], dir = '/store/workflows/dev', name = 'dev') => ({ dir, name, steps });

test("a workflow's invariants: each refuses its planted breach, and lets through a folder its writer writes", async (t) => {
  const rows: Array<[string, unknown, boolean]> = [
    ['two steps, one waiting on the other', workflow([step('plan'), step('build', ['plan'])]), true],
    ['REFUSED: no step', workflow([]), false],
    ['REFUSED: two steps of one name', workflow([step('plan'), step('plan')]), false],
    ['REFUSED: a folder not named as the workflow', workflow([step('plan')], '/store/workflows/other'), false],
    ['REFUSED: a step waiting on one not there', workflow([step('build', ['plan'])]), false],
    ['REFUSED: steps waiting on each other', workflow([step('plan', ['build']), step('build', ['plan'])]), false],
  ];
  for (const [what, value, ok] of rows) await t.test(what, () => assert.equal(Schema.is(Workflow)(value), ok));
});

test('a stored folder reads as a WorkflowDir whatever it is, and only a resolved one is minted', () => {
  assert.equal(Schema.is(WorkflowDir.OnRead)('workflows/dev'), true);
  assert.equal(Schema.is(WorkflowDir.OnCreate)('workflows/dev'), false);
  assert.equal(Schema.is(WorkflowDir.OnCreate)('/store/workflows/dev'), true);
});

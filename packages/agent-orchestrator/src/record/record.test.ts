/**
 * The tables of a run record's own words (`record.ts`, `record.store.ts`): the order its steps are named in (`namesInOrder`) and the id
 * a run is given (`runId`). Pure: no disk, no engine. What a record reads back from disk is `record.store.test.ts`'s; the order a
 * started run is listed and decided in, on disk, is told in `test/lifecycle.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { namesInOrder } from './record.ts';
import { runId } from './record.store.ts';
import { run, step } from '../../test/assessed.ts';

test("namesInOrder: a record's steps in the order they run, then any the workflow does not have", async (t) => {
  const planned = [step('plan'), step('implement', ['plan']), step('review', ['implement'])];
  await t.test("a record keyed in the folder's order reads in the steps' order, a step the workflow lost last", () => {
    const legacy = run({ implement: 't2', plan: 't1', review: null, 'gone-step': 't0' });
    assert.deepEqual(Object.keys(legacy.steps), ['implement', 'plan', 'review', 'gone-step']);
    assert.deepEqual(namesInOrder(legacy, planned), ['plan', 'implement', 'review', 'gone-step']);
  });
  await t.test('a step the record does not have is not named', () => {
    assert.deepEqual(namesInOrder(run({ implement: 't1' }), planned), ['implement']);
  });
});

test('runId: a run id is readable, and step ids share its prefix', async (t) => {
  await t.test('the brief, slugged and cut, then a drawn tail: what a person sees in `claude agents`', () => {
    const id = runId('Add a `split` example workflow to this repository: a step whose job is...');
    assert.match(id, /^add-a-split-example-workflow-[a-z0-9]{4}$/);
    assert.equal(`${id}-implement`.startsWith(id), true, 'a step id carries its run');
  });
  await t.test('a brief with nothing sluggable still gets an id', () => {
    assert.match(runId('!!!'), /^run-[a-z0-9]{4}$/);
  });
  await t.test('two runs of one request stay apart', () => {
    assert.notEqual(runId('same brief'), runId('same brief'));
  });
});

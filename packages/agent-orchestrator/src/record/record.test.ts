/**
 * The tables of a run record's own words (`record.ts`, `record.store.ts`): the order its steps are named in (`namesInOrder`) and the id
 * a run is given (`runId`). Pure: no disk, no engine. What a record reads back from disk is `record.store.test.ts`'s; the order a
 * started run is listed and decided in, on disk, is told in `test/lifecycle.test.ts`.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { namesInOrder } from './record.ts';
import { runId } from './record.store.ts';
import { run, step } from '../../test/assessed.ts';

describe("namesInOrder: a record's steps in the order they run, then any the workflow does not have", () => {
  const planned = [step('plan'), step('implement', ['plan']), step('review', ['implement'])];
  test("a record keyed in the folder's order reads in the steps' order, a step the workflow lost last", () => {
    const legacy = run({ implement: 't2', plan: 't1', review: null, 'gone-step': 't0' });
    assert.deepEqual(Object.keys(legacy.steps), ['implement', 'plan', 'review', 'gone-step']);
    assert.deepEqual(namesInOrder(legacy, planned), ['plan', 'implement', 'review', 'gone-step']);
  });
  test('a step the record does not have is not named', () => {
    assert.deepEqual(namesInOrder(run({ implement: 't1' }), planned), ['implement']);
  });
});

describe('runId: a run id is readable', () => {
  test('the brief, slugged and cut, then a drawn tail: what a person sees in `claude agents`', () => {
    const id = runId('Add a `split` example workflow to this repository: a step whose job is...');
    assert.match(id, /^add-a-split-example-workflow-[a-z0-9]{4}$/);
  });
  test('a brief with nothing sluggable still gets an id', () => {
    assert.match(runId('!!!'), /^run-[a-z0-9]{4}$/);
  });
  test('two runs of one request stay apart', () => {
    assert.notEqual(runId('same brief'), runId('same brief'));
  });
});

/**
 * Run-core's model (`record.model.ts`): each id checked on create by its writer's own rule and nominal on read, each invariant of a
 * run refused on its planted breach. That every record the run's writers make decodes is the Run door's write check, on every write of
 * every test (`src/runs/runs.store.ts`, the invariant rows of `test/run-walks.ts`).
 * Refusals are asserted by the fact, never by their words.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Option, Schema } from 'effect';
import { Landing, Run, RunId, StepName } from './record.model.ts';
import { runId } from './record.store.ts';
import { run } from '../../test/assessed.ts';

const decodes = (value: unknown): boolean => Schema.is(Run)(value);

test("each id is checked on create by its writer's rule, and any string reads", async (t) => {
  const minted = runId('Add a flag to nemia ls');
  const rows: Array<[string, boolean, boolean]> = [
    [minted, true, true],
    ['Bad Id', false, true],
    ['r-1', true, true],
  ];
  for (const [id, created, read] of rows)
    await t.test(`RunId ${JSON.stringify(id)}: create ${created ? 'takes' : 'refuses'} it, read takes it`, () => {
      assert.equal(Option.isSome(RunId.create.option(id)), created);
      assert.equal(Schema.is(RunId.OnCreate)(id), created);
      assert.equal(Schema.is(RunId.OnRead)(id), read);
      assert.equal(RunId.read(id), id);
    });
  const names: Array<[string, boolean]> = [
    ['implement', true],
    ['wf/implement', false],
    ['plan,review', false],
    ['implement.md', false],
  ];
  for (const [name, created] of names)
    await t.test(`StepName ${JSON.stringify(name)}: create ${created ? 'takes' : 'refuses'} it, read takes it`, () => {
      assert.equal(Option.isSome(StepName.create.option(name)), created);
      assert.equal(Schema.is(StepName.OnCreate)(name), created);
      assert.equal(Schema.is(StepName.OnRead)(name), true);
    });
});

test("a run's invariants: each refuses its planted breach, and lets through what its writer writes", async (t) => {
  const implement = (record: object) =>
    run({ review: null }, { steps: { implement: { taskId: null, ...record }, review: { taskId: null } } });
  const rows: Array<[string, unknown, boolean]> = [
    ['a step filed on its first try under <run>-<step>', implement({ taskId: 'r-1-implement' }), true],
    ['a step not yet filed', implement({}), true],
    [
      'a second try under <run>-<step>-try2, the first behind it',
      implement({ taskId: 'r-1-implement-try2', tries: [{ taskId: 'r-1-implement', cause: 'retries' }] }),
      true,
    ],
    [
      'a recheck, which keeps the task of the try before it',
      implement({ taskId: 'r-1-implement', tries: [{ taskId: 'r-1-implement', cause: 'recheck' }] }),
      true,
    ],
    [
      'a step sent back, its try behind it and none in its place',
      implement({ taskId: null, tries: [{ taskId: 'r-1-implement', cause: 'back' }] }),
      true,
    ],
    ['REFUSED: a task that is not stepTaskId of its try', implement({ taskId: 'r-1-review' }), false],
    [
      'REFUSED: a gap — the third try behind one, the second missing',
      implement({ taskId: 'r-1-implement-try3', tries: [{ taskId: 'r-1-implement', cause: 'retries' }] }),
      false,
    ],
    [
      'REFUSED: an earlier try under another try’s id',
      implement({ taskId: 'r-1-implement-try2', tries: [{ taskId: 'r-1-implement-try2', cause: 'retries' }] }),
      false,
    ],
    ['REFUSED: a run waiting on itself', run({ implement: null }, { after: ['r-0', 'r-1'] }), false],
    ['a run waiting on another', run({ implement: null }, { after: ['r-0'] }), true],
  ];
  for (const [what, value, ok] of rows) await t.test(what, () => assert.equal(decodes(value), ok));
});

test('a landing is one of a commit, an abort or nothing touched', async (t) => {
  const rows: Array<[unknown, boolean]> = [
    [{ commit: 'fed789' }, true],
    [{ aborted: 'the check refused', refusedOn: 'abc123' }, true],
    [{ untouched: 'it stopped blocked' }, true],
    [{}, false],
    [{ commit: 'fed789', untouched: 'both' }, false],
  ];
  for (const [value, ok] of rows) await t.test(JSON.stringify(value), () => assert.equal(Schema.is(Landing)(value), ok));
});

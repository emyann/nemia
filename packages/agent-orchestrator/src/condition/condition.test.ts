/**
 * What is written for a step's condition and how it is kept and read: the file a write is kept in (`conditionAsk`), a run's record with
 * the conditions laid on it for the try the step is on (`withConditions`) and without them (`unconditioned`), what a step says while it
 * waits (`conditionWaitWords`). Where a check stands and who may write are the laws of `contracts/condition-standing.contract.ts` and
 * `contracts/condition-write.contract.ts`.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { conditionAsk, conditionWaitWords, personConditions, unconditioned, withConditions, writtenFor } from './condition.ts';
import type { ConditionWritten, Run } from '../record/record.ts';

const written = (over: Partial<ConditionWritten> = {}) =>
  ({
    step: 'merge',
    name: 'ci',
    try: 1,
    status: 'True',
    message: 'green',
    at: '2026-11-26T10:00:00.000Z',
    transitionedAt: '2026-11-26T10:00:00.000Z',
    by: null,
    ...over,
  }) satisfies ConditionWritten;

const run = (tries: number) =>
  ({ steps: { merge: { tries: Array.from({ length: tries }, () => ({})) } } }) as unknown as Pick<Run, 'steps'>;

describe('the file a condition is kept in', () => {
  test('is read back by personConditions, and a file that is no condition written conditions nothing', () => {
    const files: Record<string, unknown> = {
      [conditionAsk('merge', 1, 'ci')]: written(),
      'condition-merge~1~broken': { step: 'merge' },
      'route-merge': { step: 'merge' },
    };
    const got = personConditions(Object.keys(files), (name) => ({ read: files[name] }));
    assert.deepEqual(got, [written()]);
  });
});

describe('a run with its conditions', () => {
  test('lays what was written for the try the step is on, and nothing written for another', () => {
    assert.equal(writtenFor(withConditions(run(0), [written()]), 'merge', 'ci')?.status, 'True');
    assert.equal(writtenFor(withConditions(run(1), [written()]), 'merge', 'ci'), null);
  });

  test('leaves none in the record a rewrite writes', () => {
    const laid = withConditions(run(0), [written()]);
    assert.equal('conditions' in (unconditioned(laid).steps.merge ?? {}), false);
  });
});

describe('conditionWaitWords', () => {
  test('names a condition not written, and one written Unknown with its words, and says what to type', () => {
    const none = conditionWaitWords(run(0), 'run-1', 'merge', ['ci']);
    assert.match(none, /ci/);
    assert.match(none, /nemia condition run-1 merge ci/);
    const unknown = conditionWaitWords(withConditions(run(0), [written({ status: 'Unknown', message: 'queued' })]), 'run-1', 'merge', [
      'ci',
    ]);
    assert.match(unknown, /queued/);
  });

  test('says nothing of a condition that is decided', () => {
    assert.equal(conditionWaitWords(withConditions(run(0), [written()]), 'run-1', 'merge', ['ci']), '');
  });
});

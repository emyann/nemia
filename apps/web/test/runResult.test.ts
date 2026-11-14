/**
 * The run's result box (src/lib/runResult.ts): the steps it reads off the run's view, final where nothing comes after them on the graph,
 * and the law of `resultOf` its contract holds out (what is drawn as given is exactly the final steps the run will run: a filter's result,
 * which tsverify 0.9.0 does not prove whole), held here on runs longer than its search side's four steps.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resultOf, resultStepsOf, runEndOf, standsOf } from '../src/lib/runResult.ts';
import { coded, detail, step } from './run-fixtures.ts';

test('resultStepsOf: final where no after or route edge leaves the step, a loop back aside; where it stands; whether its try gave', () => {
  const view = detail({
    holding: null,
    graph: {
      roots: ['implement'],
      edges: [
        { from: 'implement', to: 'review', kind: 'after' },
        { from: 'review', to: 'implement', kind: 'loop', rounds: 3 },
      ],
    },
    steps: [step(), step({ name: 'review', ...coded('awaiting approval'), closeout: null })],
  });
  assert.deepEqual(resultStepsOf(view), [
    { name: 'implement', final: false, stands: 'failed', gave: true },
    { name: 'review', final: true, stands: 'yours', gave: false },
  ]);
  assert.deepEqual(resultOf(resultStepsOf(view)), { kind: 'stands', why: 'yours', step: 'review' });
});

test('standsOf: done, skipped, waiting on you, failed, at work, else to come', () => {
  assert.deepEqual((['verified', 'skipped', 'awaiting-approval', 'failed', 'working', 'checking', 'waiting'] as const).map(standsOf), [
    'done',
    'skipped',
    'yours',
    'failed',
    'working',
    'working',
    'toCome',
  ]);
});

test('what the box draws as given is exactly the final steps the run will run, in its order, past four steps', () => {
  const steps = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((name, i) => ({
    name,
    final: i % 2 === 0,
    stands: i === 2 ? ('skipped' as const) : ('done' as const),
    gave: true,
  }));
  assert.deepEqual(resultOf(steps), { kind: 'gave', steps: ['a', 'e', 'g'] });
});

test('resultStepsOf: a done final step whose closeout said only its summary gave, so the box draws it', () => {
  const view = detail({
    holding: null,
    graph: { roots: ['land'], edges: [] },
    steps: [
      step({
        name: 'land',
        ...coded('verified ✓'),
        closeout: { ...step().closeout!, summary: 'Merged as 1a2b3c.', output: {}, artifacts: [], values: [] },
      }),
    ],
  });
  assert.deepEqual(
    resultStepsOf(view).map((s) => [s.stands, s.gave]),
    [['done', true]],
  );
  assert.deepEqual(resultOf(resultStepsOf(view)), { kind: 'gave', steps: ['land'] });
});

test('runEndOf: called off by its status or its moment, ended once its status ends a run, else none', () => {
  assert.deepEqual(
    [
      runEndOf({ status: 'cancelled', cancelledAt: null }),
      runEndOf({ status: 'running', cancelledAt: '2026-09-30T06:00:00.000Z' }),
      runEndOf({ status: 'succeeded', cancelledAt: null }),
      runEndOf({ status: 'failed', cancelledAt: null }),
      runEndOf({ status: 'running', cancelledAt: null }),
      runEndOf({ status: 'awaiting approval', cancelledAt: null }),
    ],
    ['calledOff', 'calledOff', 'ended', 'ended', null, null],
  );
});

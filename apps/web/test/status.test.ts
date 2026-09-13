import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepState } from '../src/lib/status.ts';

test('each word wf ls prints reads as the state a person acts on', () => {
  const cases: Array<[string, string]> = [
    ['running (working)', 'working'],
    ['working (quiescent)', 'working'],
    ['starting', 'working'],
    ['between attempts', 'working'],
    ['needs-human', 'needs-human'],
    ['succeeded', 'done'],
    ['succeeded · done', 'done'],
    ['succeeded · closeout unreadable', 'done'],
    ['succeeded · BLOCKED', 'blocked'],
    ['failed', 'failed'],
    ['failed · done', 'failed'],
    ['stopped', 'cancelled'],
    ['waiting', 'waiting'],
    ['pending', 'waiting'],
    ['unknown', 'unknown'],
  ];
  for (const [status, state] of cases) assert.equal(stepState(status, false), state, status);
});

test('a step that signed off blocked is not shown as done, though its session succeeded', () => {
  assert.equal(stepState('succeeded · BLOCKED', false), 'blocked');
  assert.equal(stepState('succeeded · BLOCKED', true), 'blocked');
});

test('a step yet to start on a cancelled run reads cancelled, not waiting', () => {
  assert.equal(stepState('waiting', true), 'cancelled');
  assert.equal(stepState('pending', true), 'cancelled');
  // A step still running when the run was called off is running until the stop lands.
  assert.equal(stepState('running (working)', true), 'working');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { satisfiesAfter, stepState, type StepState } from '../src/lib/status.ts';

test('each word wf ls prints reads as the state a person acts on', () => {
  const cases: Array<[string, StepState]> = [
    ['running (working)', 'working'],
    ['working (quiescent)', 'working'],
    ['starting', 'working'],
    ['between attempts', 'working'],
    ['needs-human', 'needs-human'],
    ['checking', 'checking'],
    ['verified ✓', 'verified'],
    ['unverified · done', 'unverified'],
    ['unverified · closeout unreadable', 'unverified'],
    ['unverified', 'unverified'],
    ['failed ✗ check (exit 1)', 'failed-check'],
    ['failed ✗ check (unfinished)', 'failed-check'],
    ['unsigned', 'unsigned'],
    ['unsigned · done', 'unsigned'],
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

test('a session that ended is not work that was done: the engine\'s `succeeded` alone is never verified', () => {
  assert.equal(stepState('succeeded', false), 'unverified');
  assert.equal(stepState('succeeded · done', false), 'unverified');
});

test('only verified and unverified are work done; a refused check, a failed session and an unsigned step are not', () => {
  const notDone = ['failed ✗ check (exit 1)', 'failed · done', 'unsigned', 'succeeded · BLOCKED', 'checking', 'running (working)', 'waiting', 'unknown'];
  for (const status of notDone) assert.equal(satisfiesAfter(stepState(status, false)), false, status);
  for (const status of ['verified ✓', 'unverified · done']) assert.equal(satisfiesAfter(stepState(status, false)), true, status);
  // A refused check is its own state, not a session that failed: the colour says which to read, the check's output or the log.
  assert.notEqual(stepState('failed ✗ check (exit 1)', false), stepState('failed', false));
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

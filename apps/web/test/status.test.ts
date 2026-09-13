import { test } from 'node:test';
import assert from 'node:assert/strict';
import { satisfiesAfter, stateClass, stateMeaning, stepState, type StepState } from '../src/lib/status.ts';

test('each word wf ls prints reads as the state a person acts on', () => {
  // Every word `listing` in agent-workflows can say: `waiting`, `rounds exhausted`, the run's verdicts, and the engine's
  // own word for the step's task with how it signed off beside it.
  const cases: Array<[string, StepState]> = [
    ['running (working)', 'working'],
    ['working (quiescent)', 'working'],
    ['starting', 'working'],
    ['between attempts', 'working'],
    ['needs-human', 'needs-human'],
    ['checking', 'checking'],
    ['verified ✓', 'verified'],
    ['rounds exhausted', 'exhausted'],
    ['unverified · done', 'unverified'],
    ['unverified · closeout unreadable', 'unverified'],
    ['unverified', 'unverified'],
    ['failed ✗ check (exit 1)', 'failed-check'],
    ['failed ✗ check (unfinished)', 'failed-check'],
    ['unsigned', 'unsigned'],
    ['unsigned · done', 'unsigned'],
    ['succeeded · BLOCKED', 'blocked'],
    ['stopped · BLOCKED', 'blocked'],
    ['failed', 'failed'],
    ['failed · done', 'failed'],
    ['failed · closeout unreadable', 'failed'],
    ['stopped', 'cancelled'],
    ['stopped · done', 'cancelled'],
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
  const notDone = ['failed ✗ check (exit 1)', 'failed · done', 'unsigned', 'succeeded · BLOCKED', 'rounds exhausted', 'checking', 'running (working)', 'waiting', 'unknown'];
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

test('a loop out of rounds waits on a person, in amber like a step that signed off blocked, and says so on hover', () => {
  assert.equal(stepState('rounds exhausted', false), 'exhausted');
  // Its own state, not `blocked`: nothing was left unfinished, the loop asked for more than its workflow allows.
  assert.notEqual(stepState('rounds exhausted', false), stepState('succeeded · BLOCKED', false));
  assert.equal(stateClass.exhausted, stateClass.blocked);
  assert.match(stateClass.exhausted, /\bbg-amber-100\b/);
  assert.equal(
    stateMeaning.exhausted,
    'rounds exhausted: the reviewer asked for another round on the last one rounds: allows; a person decides — wf round',
  );
  // Final, so a run somebody called off does not make it read as a step that never started.
  assert.equal(stepState('rounds exhausted', true), 'exhausted');
});

test('a word the board does not know reads as working, on purpose: never as done, and never as waiting on you', () => {
  // What `rounds exhausted` read as before the board knew it. A word `wf ls` gains after this was written is shown
  // as still going until the board is taught it, rather than as a verdict the run never gave.
  for (const status of ['a word wf ls has gained since', 'rounds exhausted, and more', 'exhausted']) {
    assert.equal(stepState(status, false), 'working', status);
    assert.equal(satisfiesAfter(stepState(status, false)), false, status);
  }
});

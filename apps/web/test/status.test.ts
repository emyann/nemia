import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isGate, satisfiesAfter, stateClass, stateMeaning, stepState, type StepState } from '../src/lib/status.ts';

test('each word wf ls prints reads as the state a person acts on', () => {
  // Every word `listing` in agent-orchestrator can say: `waiting`, `rounds exhausted`, the run's verdicts, and the engine's
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
    ['awaiting approval', 'awaiting-approval'],
    ['over budget $4.20 of $3', 'over-budget'],
    ['over budget ≥$4.20 of $3', 'over-budget'],
    ['over budget — implement $4.25 of $3', 'over-budget'],
    ['budget exhausted $3.02 of $3', 'budget-exhausted'],
    ['budget exhausted at $3', 'budget-exhausted'],
    ['budget exhausted', 'budget-exhausted'],
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
    'rounds exhausted: the reviewer asked for another round on the last one rounds: allows; a person decides — wf round for another, or wf accept to go on with what is there',
  );
  // Final, so a run somebody called off does not make it read as a step that never started.
  assert.equal(stepState('rounds exhausted', true), 'exhausted');
});

test('a word the board does not know reads as working, on purpose: never as done, and never as waiting on you', () => {
  // What `rounds exhausted` read as before the board knew it. A word `wf ls` gains after this was written is shown
  // as still going until the board is taught it, rather than as a verdict the run never gave.
  for (const status of ['a word wf ls has gained since', 'rounds exhausted, and more', 'exhausted', 'over budgetary', 'budget', 'budget exhaustedness', 'over budget']) {
    assert.equal(stepState(status, false), 'working', status);
    assert.equal(satisfiesAfter(stepState(status, false)), false, status);
  }
});

test('a step past its budget waits on a person in amber, as a loop out of rounds does, and says on hover what raises its cap', () => {
  for (const state of ['over-budget', 'budget-exhausted'] as const) {
    assert.equal(stateClass[state], stateClass.exhausted, state);
    assert.equal(satisfiesAfter(state), false, `${state} is not work done`);
    assert.match(stateMeaning[state], /until a person raises the cap — wf retry --budget/);
  }
  assert.match(stateMeaning['over-budget'], /^over budget: its tries have cost its budget: or more/);
  assert.match(stateMeaning['budget-exhausted'], /^budget exhausted: its harness ended its session at its budget:/);
  // Final, so a run somebody called off does not make it read as a step that never started.
  assert.equal(stepState('over budget $4.20 of $3', true), 'over-budget');
});

test('a human gate is a step a person decides: signed off blocked, a loop out of rounds, or a step past its budget — and on a cancelled run, none', () => {
  for (const status of ['succeeded · BLOCKED', 'rounds exhausted', 'over budget $4.20 of $3', 'over budget — implement $4.25 of $3', 'budget exhausted $3.02 of $3']) {
    assert.equal(isGate(stepState(status, false), false), true, status);
    // Nobody waits for the answer on a run somebody called off.
    assert.equal(isGate(stepState(status, true), true), false, `${status}, on a cancelled run`);
  }
  // Waiting on you too, but work to try again, not a decision; and every state that waits on nobody.
  const notGates = ['failed ✗ check (exit 1)', 'failed ✗ check (unfinished)', 'unsigned', 'verified ✓', 'unverified · done', 'checking', 'running (working)', 'needs-human', 'failed', 'stopped', 'waiting', 'unknown'];
  for (const status of notGates) assert.equal(isGate(stepState(status, false), false), false, status);
});

test('a step waiting at its gate waits on a person in amber, as a step signed off blocked does — a human gate, not work done — and says on hover how to approve it or send it back', () => {
  assert.equal(stepState('awaiting approval', false), 'awaiting-approval');
  // Final, so a run somebody called off does not make it read as a step that never started.
  assert.equal(stepState('awaiting approval', true), 'awaiting-approval');
  // Its work is signed off, and nothing after it may be filed on it until a person says so: `satisfiesAfter` in the package says no too.
  assert.equal(satisfiesAfter('awaiting-approval'), false);
  assert.equal(stateClass['awaiting-approval'], stateClass.blocked);
  assert.equal(isGate('awaiting-approval', false), true);
  assert.equal(isGate('awaiting-approval', true), false, 'nobody waits for an approval on a run called off');
  assert.match(stateMeaning['awaiting-approval'], /^awaiting approval: it signed off at its gate, and nothing after it is filed until a person approves it — wf approve — or sends it back — wf retry --message$/);
  // Not a word that merely starts like it: before the board knew the word, it read as working, and a spinner drew on a step nobody runs.
  assert.equal(stepState('awaiting approvals', false), 'working');
});

test('a root of a run waiting on runs reads `waiting on <run>`, which is waiting — whatever runs it names, and why — and cancelled on a run called off', () => {
  for (const word of ['waiting on a-1x2y', 'waiting on a-1x2y (cancelled), b-3z4w', 'waiting on a-1x2y (no such run)', 'waiting on a-1x2y (wf/a-1x2y/implement gone)']) {
    assert.equal(stepState(word, false), 'waiting', word);
    assert.equal(stepState(word, true), 'cancelled', word);
  }
  // Not a word that merely starts like one.
  assert.equal(stepState('waitingroom', false), 'working');
});

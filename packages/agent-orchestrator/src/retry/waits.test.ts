import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WAITS_ON_PERSON, waitsOnPerson } from './waits.ts';

test('what waits on the person is a gate, a question, an unsigned step, a refused check, a loop out of rounds, a cap and a denial, and no other status', () => {
  assert.deepEqual(
    Object.entries(WAITS_ON_PERSON)
      .filter(([, waits]) => waits)
      .map(([status]) => status),
    ['blocked', 'unsigned', 'awaiting approval', 'exhausted', 'over budget', 'budget exhausted', 'denied', 'failed (check)'],
    'nothing moves a step in these on until someone acts; the engine ending a task on its own (`failed`, `stopped`) asks no one',
  );
});

test('a step that waits on the person says why; a recheck of its refused or unfinished check waits on no one', () => {
  const free = { status: 'failed (check)', modes: ['recheck'], blockedByHarness: false } as const;
  assert.equal(waitsOnPerson({ ...free, modes: [...free.modes] }, true), undefined, 'a recheck files no session and spends nothing');
  assert.equal(waitsOnPerson({ ...free, modes: [...free.modes] }), 'it is failed (check)', "another session of the step is the person's");
  assert.equal(waitsOnPerson({ ...free, modes: [], status: 'awaiting approval' }, true), 'it is awaiting approval');
  assert.equal(waitsOnPerson({ ...free, modes: [], status: 'verified', sendsBack: true }), 'a try of it sends the work back from a gate');
  assert.equal(waitsOnPerson({ ...free, modes: [], status: 'running', blockedByHarness: true }), 'its session waits on you');
  assert.equal(waitsOnPerson({ ...free, modes: [], status: 'failed', raise: { above: 1 } as never }), 'a try of it runs past its cap');
});

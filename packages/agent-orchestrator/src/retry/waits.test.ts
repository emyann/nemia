import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WAITS_ON_PERSON, waitsOnPerson } from './waits.ts';

test('what waits on the person is a gate, a question, a loop out of rounds and a cap, and no other status', () => {
  assert.deepEqual(
    Object.entries(WAITS_ON_PERSON)
      .filter(([, waits]) => waits)
      .map(([status]) => status),
    ['blocked', 'awaiting approval', 'exhausted', 'over budget', 'budget exhausted'],
  );
});

test('a step that waits on the person says why; one whose check did not finish waits on no one', () => {
  const free = { status: 'failed (check)', modes: ['recheck'], blockedByHarness: false } as const;
  assert.equal(waitsOnPerson({ ...free, modes: [...free.modes] }), undefined);
  assert.equal(waitsOnPerson({ ...free, modes: [], status: 'awaiting approval' }), 'it is awaiting approval');
  assert.equal(waitsOnPerson({ ...free, modes: [], status: 'verified', sendsBack: true }), 'a try of it sends the work back from a gate');
  assert.equal(waitsOnPerson({ ...free, modes: [], status: 'running', blockedByHarness: true }), 'its session waits on you');
  assert.equal(waitsOnPerson({ ...free, modes: [], status: 'failed', raise: { above: 1 } as never }), 'a try of it runs past its cap');
});

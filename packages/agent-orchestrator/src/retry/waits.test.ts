/**
 * What waits on the person (`waits.ts`): a table of the words `waitsOnPerson` says of a step's standing. Which reasons wait is the
 * table's type (`Record<StepReason, boolean>`) and `nemia-shipped.test.ts`'s sections of `bring-what-waits`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waitsOnPerson } from './waits.ts';

/** A step's standing whose check did not finish: free of the person, unless a row says otherwise. */
const FREE = { status: 'failed (check)', reason: 'CheckFailed', modes: ['recheck'] } as const;

/** Each standing, what it says, and why. */
const SAYS: Array<[row: string, standing: Parameters<typeof waitsOnPerson>[0], expected: string | undefined]> = [
  ['a step whose check did not finish waits on no one', { ...FREE, modes: [...FREE.modes] }, undefined],
  [
    'a step at its gate is awaiting approval',
    { ...FREE, modes: [], status: 'awaiting approval', reason: 'AwaitingApproval' },
    'it is awaiting approval',
  ],
  [
    'a try that sends the work back from a gate',
    { ...FREE, modes: [], status: 'verified', reason: 'CheckPassed', sendsBack: true },
    'a try of it sends the work back from a gate',
  ],
  [
    'a session its harness blocked waits on you',
    { ...FREE, modes: [], status: 'running', reason: 'AwaitingAnswer', via: 'session' },
    'its session waits on you',
  ],
  [
    'a try past its cap',
    { ...FREE, modes: [], status: 'failed', reason: 'Failed', raise: { above: 1 } as never },
    'a try of it runs past its cap',
  ],
];

test('waitsOnPerson', async (t) => {
  for (const [row, standing, expected] of SAYS) {
    await t.test(row, () => {
      assert.equal(waitsOnPerson(standing), expected);
    });
  }
});

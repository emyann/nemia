/**
 * What waits on the person and what holds a run (`waits.ts`): a table of each status the two records class, and of the words
 * `waitsOnPerson` says of a step's standing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOLDS_THE_RUN, WAITS_ON_PERSON, waitsOnPerson } from './waits.ts';

/** The statuses `record` marks true, in its order. */
const marked = (record: Record<string, boolean>) =>
  Object.entries(record)
    .filter(([, on]) => on)
    .map(([status]) => status);

/** A step's standing whose check did not finish: free of the person, unless a row says otherwise. */
const FREE = { status: 'failed (check)', modes: ['recheck'], blockedByHarness: false } as const;

/** Each standing, what it says, and why. */
const SAYS: Array<[row: string, standing: Parameters<typeof waitsOnPerson>[0], expected: string | undefined]> = [
  ['a step whose check did not finish waits on no one', { ...FREE, modes: [...FREE.modes] }, undefined],
  ['a step at its gate is awaiting approval', { ...FREE, modes: [], status: 'awaiting approval' }, 'it is awaiting approval'],
  [
    'a try that sends the work back from a gate',
    { ...FREE, modes: [], status: 'verified', sendsBack: true },
    'a try of it sends the work back from a gate',
  ],
  [
    'a session its harness blocked waits on you',
    { ...FREE, modes: [], status: 'running', blockedByHarness: true },
    'its session waits on you',
  ],
  ['a try past its cap', { ...FREE, modes: [], status: 'failed', raise: { above: 1 } as never }, 'a try of it runs past its cap'],
];

test('waitsOnPerson', async (t) => {
  await t.test('what waits on the person is a gate, a question, a loop out of rounds and a cap, and no other status', () => {
    assert.deepEqual(marked(WAITS_ON_PERSON), ['blocked', 'awaiting approval', 'exhausted', 'over budget', 'budget exhausted']);
  });
  await t.test('what holds a run is what waits on the person and a step stopped on what it was asked', () => {
    assert.deepEqual(marked(HOLDS_THE_RUN), [
      'blocked',
      'unsigned',
      'awaiting approval',
      'exhausted',
      'over budget',
      'budget exhausted',
      'denied',
      'failed (check)',
    ]);
  });
  await t.test('a step the engine ended on its own holds no run: failed, stopped', () => {
    assert.deepEqual([HOLDS_THE_RUN.failed, HOLDS_THE_RUN.stopped], [false, false]);
  });
  for (const [row, standing, expected] of SAYS) {
    await t.test(row, () => {
      assert.equal(waitsOnPerson(standing), expected);
    });
  }
});

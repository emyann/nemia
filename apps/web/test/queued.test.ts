/**
 * Why a task filed to start has not, as the board says it (lib/queued.ts): one sentence per wait the api serves, memory with what is kept
 * for a person's turn, a slot, or the server paused, and the step's which task waits.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { memoryWord, queuedSaid, stepQueuedSaid } from '../src/lib/queued.ts';

const GI = 2 ** 30;

describe('queuedSaid: each wait says its own words and its numbers', () => {
  const rows: Array<[string, Parameters<typeof queuedSaid>[0], readonly string[]]> = [
    ['memory, none kept', { for: 'memory', needBytes: 2 * GI, roomBytes: GI, keptBytes: null }, ['memory', '2Gi', '1Gi']],
    [
      'memory, some kept',
      { for: 'memory', needBytes: 2 * GI, roomBytes: 1.5 * GI, keptBytes: 2.5 * GI },
      ['memory', '2Gi', '1.5Gi', '2.5Gi', 'person'],
    ],
    ['a slot', { for: 'slot', pool: 'claude', ceiling: 4 }, ['slot', 'claude', '4']],
    ['paused', { for: 'paused' }, ['paused', 'resumes']],
  ];
  for (const [name, wait, facts] of rows)
    test(name, () => {
      const said = queuedSaid(wait);
      for (const fact of facts) assert.ok(said.includes(fact), `${fact} in ${said}`);
    });
  test('memory with none kept names no person', () =>
    assert.ok(!queuedSaid({ for: 'memory', needBytes: GI, roomBytes: 0, keptBytes: null }).includes('person')));
});

describe('stepQueuedSaid and memoryWord', () => {
  test('a check that waits is said as the check', () =>
    assert.ok(stepQueuedSaid({ task: 'check', wait: { for: 'paused' } }).startsWith('Its check')));
  test('memory as the settings write it', () =>
    assert.deepEqual([memoryWord(4 * GI), memoryWord(2.5 * GI), memoryWord(512 * 2 ** 20)], ['4Gi', '2.5Gi', '512Mi']));
});

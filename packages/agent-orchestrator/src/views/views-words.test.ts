/**
 * What a session's memory record says in the orchestrator's words: which attempt of a task's current turn was killed at its limit
 * (`killedMemoryOf`), a byte count as a quantity a person types back into `memory:` (`memoryBytesWord`), and the words a step's note
 * carries (`outOfMemoryWords`), checked by the facts they name, never their sentence.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { killedMemoryOf, type AttemptMemory, type WordAttempt, type WordView } from './views-words.ts';
import { memoryBytesWord, outOfMemory, outOfMemoryWords } from '../out-of-memory/out-of-memory.ts';

const GI = 1024 ** 3;
const KILLED: AttemptMemory = { limitBytes: 4 * GI, peakBytes: 4 * GI, oomKills: 1 };

/** An ended attempt of turn `turn`, carrying `memory` where given. */
const attempt = (memory?: AttemptMemory, turn = 0): WordAttempt =>
  ({
    spawnedAt: '2026-01-01T00:00:00Z',
    endedAt: '2026-01-01T00:01:00Z',
    ended: 'failed',
    turn,
    ...(memory ? { memory } : {}),
  }) as WordAttempt;

/** A task's view over `attempts`, held open with `inputs` answers where given. */
const view = (attempts: WordAttempt[], inputs?: number): WordView =>
  ({
    phase: 'failed',
    state: {
      brief: 'b',
      settled: 'failed',
      attempts,
      ...(inputs === undefined ? {} : { holdOpen: true, inputs: Array.from({ length: inputs }, () => 'answer') }),
    },
  }) as unknown as WordView;

test('killedMemoryOf reads the kill off the current turn’s attempts', async (t) => {
  await t.test('no view: none', () => assert.equal(killedMemoryOf(undefined), undefined));
  await t.test('attempts with no record, a former journal: none', () => assert.equal(killedMemoryOf(view([attempt()])), undefined));
  await t.test('a record with no kill: none', () =>
    assert.equal(killedMemoryOf(view([attempt({ limitBytes: GI, peakBytes: GI / 2, oomKills: 0 })])), undefined),
  );
  await t.test('killed, then a clean continuation in the same turn: the killed record', () =>
    assert.deepEqual(killedMemoryOf(view([attempt(KILLED), attempt({ limitBytes: 4 * GI, oomKills: 0 })])), KILLED),
  );
  await t.test('a held task killed in an earlier turn, clean in the one it is on: none', () =>
    assert.equal(killedMemoryOf(view([attempt(KILLED, 0), attempt({ limitBytes: 4 * GI, oomKills: 0 }, 1)], 1)), undefined),
  );
});

test('memoryBytesWord prints a quantity memory: takes back', async (t) => {
  await t.test('a whole number of Gi', () => assert.equal(memoryBytesWord(4 * GI), '4Gi'));
  await t.test('4G as memory.max reads it, one decimal of Gi', () => assert.equal(memoryBytesWord(3999997952), '3.7Gi'));
  await t.test('whole Mi below 1Gi', () => assert.equal(memoryBytesWord(512 * 1024 ** 2), '512Mi'));
  await t.test('whole Ki below 1Mi, rounded up', () => assert.equal(memoryBytesWord(1000), '1Ki'));
});

test('outOfMemoryWords says the kill, the limit, the peak and what to raise', async (t) => {
  const said = (m: AttemptMemory, own: string | undefined, of?: 'session' | 'check'): string => {
    const k = outOfMemory(m, own);
    assert.ok(k, 'a kill is said');
    return outOfMemoryWords(k, own, of);
  };
  await t.test('a step naming its own memory: is told to raise it, not the default', () => {
    const words = said(KILLED, '4Gi', 'session');
    for (const fact of ['out of memory', '4Gi', 'peak', 'memory:', '1 process ']) assert.ok(words.includes(fact), fact);
    assert.ok(!words.includes('WF_MEMORY_LIMIT'));
  });
  await t.test('a step naming none is told of memory: and WF_MEMORY_LIMIT', () => {
    const words = said(KILLED, undefined);
    for (const fact of ['memory:', 'WF_MEMORY_LIMIT']) assert.ok(words.includes(fact), fact);
  });
  await t.test('no peak kept: no peak said; two kills: processes', () => {
    const words = said({ limitBytes: 4 * GI, oomKills: 2 }, undefined);
    assert.ok(!words.includes('peak'));
    assert.ok(words.includes('2 processes'));
  });
  await t.test('a check names WF_MEMORY_LIMIT alone, and says it is the check', () => {
    const words = said(KILLED, undefined, 'check');
    for (const fact of ['check', 'WF_MEMORY_LIMIT']) assert.ok(words.includes(fact), fact);
    assert.ok(!words.includes('step'));
  });
});

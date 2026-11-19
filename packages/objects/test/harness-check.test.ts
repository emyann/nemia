/**
 * A harness's checks and the store's milestones (`src/harness-check.ts`, `src/milestones.ts`): a check turn, an install piece carrying its
 * two checks and the four milestones each decoded as the api answers them, a check state or a milestone word outside its words refused.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { HarnessTurn, Milestones, ReadinessPiece } from 'objects';

const version = { name: 'version', state: 'passed', message: '2.1.325, at the pin', fixes: [], found: '2.1.325', pin: '2.1.325' };
const turn = {
  name: 'turn',
  state: 'failed',
  message: 'Invalid API key',
  fixes: [{ message: 'sign in', command: 'claude auth login', startable: false, kind: 'typed' }],
  failure: 'unanswered',
  capUsd: 0.05,
  turn: 'turn-1',
  at: '2026-11-18T00:00:00.000Z',
};

test('a check turn, an install piece with its two checks and the milestones decode as the api answers them', () => {
  const started = { id: 'turn-1', harness: 'claude', check: turn };
  assert.deepEqual(Schema.decodeUnknownSync(HarnessTurn)(started), started);
  const piece = {
    name: 'claude',
    area: 'harness',
    state: 'met',
    message: 'installed',
    fixes: [],
    harness: { name: 'claude', part: 'install' },
    checks: [version, turn],
  };
  assert.deepEqual(Schema.decodeUnknownSync(ReadinessPiece)(piece), piece);
  const read = {
    milestones: [
      { name: 'harness', state: 'done', message: 'a harness is signed in' },
      { name: 'factory', state: 'next', message: 'file a factory' },
      { name: 'volume', state: 'later', message: 'mount a volume' },
      { name: 'landed', state: 'later', message: 'merge a first change into its base branch' },
    ],
  };
  assert.deepEqual(Schema.decodeUnknownSync(Milestones)(read), read);
});

test('REFUSED: a check state, a turn failure, a milestone or its state outside their words', () => {
  assert.throws(() => Schema.decodeUnknownSync(HarnessTurn)({ id: 't', harness: 'claude', check: { ...turn, state: 'green' } }));
  assert.throws(() => Schema.decodeUnknownSync(HarnessTurn)({ id: 't', harness: 'claude', check: { ...turn, failure: 'quota' } }));
  assert.throws(() => Schema.decodeUnknownSync(Milestones)({ milestones: [{ name: 'card', state: 'done', message: '' }] }));
  assert.throws(() => Schema.decodeUnknownSync(Milestones)({ milestones: [{ name: 'harness', state: 'skipped', message: '' }] }));
});

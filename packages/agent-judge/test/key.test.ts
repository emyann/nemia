/** A key is what a judgment is the judgment of: a changed word, option, state or model is a new key, never a re-use. */
import './hermetic.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choice, noul, score } from '@typesafe-ai/sdk';
import { keyOf, pinnedModel, stateHash } from '../src/key.ts';
import { MODEL, QUESTIONS, REPOSITORY } from '../src/card.ts';

const q = noul('Is `card` about the web app?', { true: 'yes', false: 'no' });
const state = { card: 'Sort the inbox by date.', repository: { a: 'x', b: 'y' } };
const base = keyOf('jev-1.13.0', q, state);

test('the key moves with the model, the words, the options, their order and the state', () => {
  assert.match(base, /^[0-9a-f]{64}$/);
  assert.equal(keyOf('jev-1.13.0', noul('Is `card` about the web app?', { true: 'yes', false: 'no' }), { card: 'Sort the inbox by date.', repository: { a: 'x', b: 'y' } }), base, 'the same words are the same key');
  const moved = [
    keyOf('jev-1.14.0', q, state),
    keyOf('jev-1.13.0', noul('Is `card` about the web app ?', { true: 'yes', false: 'no' }), state),
    keyOf('jev-1.13.0', noul('Is `card` about the web app?', { true: 'yes.', false: 'no' }), state),
    keyOf('jev-1.13.0', noul('Is `card` about the web app?', { false: 'no', true: 'yes' }), state),
    keyOf('jev-1.13.0', q, { card: 'Sort the inbox by date!', repository: { a: 'x', b: 'y' } }),
    keyOf('jev-1.13.0', q, { repository: { a: 'x', b: 'y' }, card: 'Sort the inbox by date.' }),
    keyOf('jev-1.13.0', { ...q, type: 'noul' as const, criteria: null }, state),
  ];
  assert.equal(new Set([base, ...moved]).size, moved.length + 1);
  assert.notEqual(keyOf('jev-1.13.0', choice('Which?', { a: 'A', b: 'B' }), state), keyOf('jev-1.13.0', choice('Which?', { b: 'B', a: 'A' }), state));
  assert.notEqual(keyOf('jev-1.13.0', score('How?', ['low', 'high']), state), keyOf('jev-1.13.0', score('How?', ['high', 'low']), state));
});

test("the question's id is not in the key, nor the order a question object was built in", () => {
  const built = { criteria: { true: 'yes', false: 'no' }, instructions: 'Is `card` about the web app?', type: 'noul' as const };
  assert.equal(keyOf('jev-1.13.0', built, state), base);
});

test('REFUSED: a model that is an alias, not one version', () => {
  for (const alias of ['jev-latest', 'jev-preview', 'jev', 'jev-1', '', undefined, 'JEV-1.13.0']) {
    assert.throws(() => pinnedModel(alias), (e: any) => e.exitCode === 2 && /^judge: the model must be pinned to one version/.test(e.message), String(alias));
  }
  assert.equal(pinnedModel('jev-1.13.0'), 'jev-1.13.0');
});

test('REFUSED: a state that is not JSON, or none', () => {
  const cycle: any = {};
  cycle.self = cycle;
  assert.throws(() => stateHash(cycle), (e: any) => e.exitCode === 2 && /^judge: the state is not JSON/.test(e.message));
  assert.throws(() => stateHash(undefined as any), (e: any) => /^judge: the state is empty/.test(e.message));
  assert.throws(() => stateHash(null as any), (e: any) => /^judge: the state is empty/.test(e.message));
  assert.match(stateHash('text'), /^sha256:[0-9a-f]{64}$/);
});

test("the card's questions are pinned: a change of words fails here, and says the thresholds were measured on the old ones", () => {
  // If this fails, the words of a question in src/card.ts changed. Every answer on record for them is now unread, and the
  // thresholds in THRESHOLDS were measured on the old words (dispatch2, 2026-09-19). Update these keys in a commit that says so.
  const keys = Object.fromEntries(Object.entries(QUESTIONS).map(([id, question]) => [id, keyOf(MODEL, question, { card: 'x', repository: REPOSITORY }).slice(0, 16)]));
  assert.deepEqual(keys, PINNED);
});

// Keyed afresh on 2026-09-23: the questions' words are as measured, and `REPOSITORY` names the renamed packages.
const PINNED = { web: '052e54e65eea0eed', plan: '1cd148750dcb0206', clear: 'acb88142113ca7b7', size: '63fcfd3e6c01733f' };

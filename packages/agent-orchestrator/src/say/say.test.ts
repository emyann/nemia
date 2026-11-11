/**
 * Who words a step's journal holds are from, read back off the words the step was handed (`framedForStep`, `saidBy`, `saidOf`): two runs
 * of the pure functions together, which their laws (`contracts/step-speaker.contract.ts`) do not hold, being of one run each.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { framedForStep, saidBy, saidOf } from './say.ts';

test('words handed to a step read back as who said them', async (t) => {
  const operator = { kind: 'agent', name: 'operator' } as const;
  await t.test("an agent's words, framed, read back as that agent's and its own words", () => {
    assert.deepEqual(saidBy(framedForStep(operator, 'Cut the scope.')), { from: operator, words: 'Cut the scope.' });
  });
  await t.test("the person's words, as they are, read back as the person's", () => {
    assert.deepEqual(saidBy(framedForStep({ kind: 'person' }, 'Cut the scope.')), { from: { kind: 'person' }, words: 'Cut the scope.' });
  });
  await t.test('words journalled before words were framed are the person’s', () => {
    assert.deepEqual(saidBy('Widen the scope.'), { from: { kind: 'person' }, words: 'Widen the scope.' });
  });
  await t.test("a said of the person's gains no key; an agent's gains who and its words", () => {
    const said = { at: '2026-11-11T10:00:00.000Z', attempt: 1, text: 'Widen the scope.', after: null };
    assert.deepEqual(saidOf(said), said);
    assert.deepEqual(Object.keys(saidOf(said)), ['at', 'attempt', 'text', 'after']);
    const framed = { ...said, text: framedForStep(operator, 'Widen it.') };
    assert.deepEqual(saidOf(framed), { ...framed, from: operator, words: 'Widen it.' });
  });
});

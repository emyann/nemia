/** `decide` is the `if` with judgment in it: three branches, and any failure is `unsure`. */
import './hermetic.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, FAILURE_KINDS, why, type Judgment } from '../src/decide.ts';

const noulOf = (p: number): Judgment => ({
  status: 'answered',
  answer: { type: 'noul', noul: p } as any,
  key: 'k',
  at: 't',
  model: 'jev-1.13.0',
});
const scoreOf = (s: number): Judgment => ({
  status: 'answered',
  answer: { type: 'score', score: s, confidence: 0.9, legend: {}, probabilities: {} } as any,
  key: 'k',
  at: 't',
  model: 'jev-1.13.0',
});
const t = { yes: 0.8, no: 0.2 };

test('a noul: at or above yes is yes, at or below no is no, between is unsure', () => {
  assert.deepEqual(
    [0, 0.2, 0.2001, 0.5, 0.7999, 0.8, 1].map((p) => decide(noulOf(p), t)),
    ['no', 'no', 'unsure', 'unsure', 'unsure', 'yes', 'yes'],
  );
});

test('a score reads its expected level', () => {
  assert.deepEqual(
    [0, 1.5, 2, 2.5, 3].map((s) => decide(scoreOf(s), { yes: 2.5, no: 1.5 })),
    ['no', 'no', 'unsure', 'yes', 'yes'],
  );
});

test('every failure kind is unsure, and why says which', () => {
  for (const kind of FAILURE_KINDS) {
    const j: Judgment = { status: 'failed', kind, message: 'because', key: 'k', at: 't' };
    assert.equal(decide(j, t), 'unsure', kind);
    assert.equal(why(j), `${kind}: because`);
  }
  assert.equal(why(noulOf(0.634)), 'P 0.63');
  assert.equal(why(scoreOf(2.25)), 'score 2.25');
});

test('REFUSED: thresholds that are not yes above no, or not probabilities for a noul, or a choice', () => {
  for (const bad of [{ yes: 0.2, no: 0.8 }, { yes: 0.5, no: 0.5 }, { yes: NaN, no: 0 }, {} as any, undefined as any]) {
    assert.throws(
      () => decide(noulOf(0.5), bad),
      (e: any) => e.exitCode === 2 && e.message.startsWith('judge: decide takes { yes, no } with yes above no'),
      JSON.stringify(bad),
    );
  }
  assert.throws(
    () => decide(noulOf(0.5), { yes: 2.5, no: 1.5 }),
    (e: any) => e.message.startsWith("judge: a noul's thresholds are probabilities"),
  );
  const chosen: Judgment = {
    status: 'answered',
    answer: { type: 'choice', choice: 'a', confidence: 0.9, probabilities: {} } as any,
    key: 'k',
    at: 't',
    model: 'm',
  };
  assert.throws(
    () => decide(chosen, t),
    (e: any) => e.message.startsWith('judge: decide reads a noul or a score; a choice has no threshold'),
  );
  assert.equal(why(chosen), 'chose a, confidence 0.90');
});

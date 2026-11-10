/**
 * How long something took, in the board's one writer (src/lib/duration.ts): to the second for a try, a turn and a run's clock, to the
 * minute where a row, a wait or a strip has room for less.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { durationWords } from '../src/lib/duration.ts';

const S = 1000;
const M = 60 * S;
const H = 60 * M;

test('durationWords: a duration in its two largest units, at the grain asked', async (t) => {
  await t.test('to the second', () => {
    const rows: Array<[number, string]> = [
      [0, '0s'],
      [45 * S, '45s'],
      [724 * S, '12m 04s'],
      [65 * M, '1h 05m'],
      [26 * H, '1d 2h'],
      [3 * H + 12 * M + 59 * S, '3h 12m'],
      [52 * H, '2d 4h'],
      [-5 * S, '0s'],
    ];
    for (const [ms, said] of rows) assert.equal(durationWords(ms, 'second'), said, String(ms));
  });
  await t.test('to the minute', () => {
    const rows: Array<[number, string]> = [
      [45 * S, 'under 1m'],
      [3 * M, '3m'],
      [90 * M, '1h 30m'],
      [65 * M, '1h 05m'],
      [26 * H, '1d 2h'],
      [27 * M + 40 * S, '27m'],
      [52 * H + 59 * M, '2d 4h'],
      [-5 * S, 'under 1m'],
    ];
    for (const [ms, said] of rows) assert.equal(durationWords(ms, 'minute'), said, String(ms));
  });
});

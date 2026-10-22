/**
 * The finished table's times (test/e2e/runs-times.ts): the `how long ago` form the two columns write passes, an absolute date and a
 * distance date-fns's `formatDistance` would write are refused, and so is a time wider than its cell's room. `npm run e2e` reads the
 * page itself (`runs`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AGO, agosRefused, type DrawnAgo } from './e2e/runs-times.ts';

const fits = (words: string, width = 70): DrawnAgo => ({ words, width, room: 96 });

/** A table read across a new year: minutes, hours, days and a run from two years back. */
const SPREAD = [fits('just now'), fits('3 minutes ago'), fits('2 hours ago'), fits('3 days ago'), fits('2 years ago')];

test('the column writes one form: `just now`, or a whole number, one unit, and `ago`', () => {
  for (const words of ['just now', '1 minute ago', '42 minutes ago', '4 months ago', '2 years ago', '30 seconds ago'])
    assert.match(words, AGO, words);
  for (const words of ['11 Oct  1:11 PM', '31 Dec 2025', 'about 2 hours ago', '1 hour 5 minutes ago', 'in 3 minutes', ''])
    assert.doesNotMatch(words, AGO, words);
});

test('a finished table of every distance passes, each time inside its own room', () => {
  assert.equal(agosRefused(SPREAD), null);
  assert.equal(agosRefused([]), null, 'no finished run, no time');
  assert.equal(agosRefused([{ words: '3 days ago', width: 96, room: 96 }]), null, 'a time that fills its room exactly');
});

test('REFUSED: an absolute date in the column, and the `about` formatDistance writes in place of formatDistanceStrict', () => {
  assert.equal(
    agosRefused([...SPREAD, fits('31 Dec 2025')]),
    'each time of the finished table says how long ago it was, as `just now` or one unit and `ago` — "31 Dec 2025"',
  );
  assert.match(agosRefused([fits('about 2 hours ago')]) ?? '', /^each time of the finished table says how long ago it was/);
});

test('REFUSED: a time wider than the room its cell leaves it, the overlap the padded dates had', () => {
  assert.equal(
    agosRefused([...SPREAD, { words: '11 months ago', width: 104, room: 96 }]),
    'each time has the room of its own cell — "11 months ago" is 104px in 96px',
  );
});

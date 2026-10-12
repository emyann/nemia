/**
 * The finished table's times (test/e2e/runs-times.ts): a table that crosses a new year holds two forms of two widths and passes, two
 * widths within one form are refused, and so is a time that does not keep its padding. `npm run e2e` reads the page itself (`runs`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formOf, timesRefused, type DrawnTime } from './e2e/runs-times.ts';

const pre = (words: string, width: number): DrawnTime => ({ words, whiteSpace: 'pre', width });

/** A table read in the first minutes of a year: two rows of this year, two of the last. */
const NEW_YEAR = [pre(' 1 Jan 12:02 AM', 108), pre(' 1 Jan 12:01 AM', 108), pre('31 Dec 2025', 79), pre('31 Dec 2025', 79)];

test('a time is of one of two forms: a day and a time, or a day and its year', () => {
  assert.equal(formOf('10 Oct 11:59 PM'), 'a day and a time');
  assert.equal(formOf(' 3 Aug  1:05 AM'), 'a day and a time');
  assert.equal(formOf('31 Dec 2025'), 'a day and its year');
});

test('a finished table that crosses a new year passes: two forms, each of its own width', () => {
  assert.equal(new Set(NEW_YEAR.map((time) => time.width)).size, 2, 'the fixture holds two widths, which one width for all refused');
  assert.equal(timesRefused(NEW_YEAR), null);
  assert.equal(timesRefused([pre('12 Oct  5:07 PM', 108), pre(' 3 Aug 11:05 AM', 108)]), null, 'one form, one width');
  assert.equal(timesRefused([]), null, 'no finished run, no time');
});

test('REFUSED: two times of one form that are not as wide as each other, naming the form', () => {
  const [first, ...rest] = NEW_YEAR;
  assert.equal(
    timesRefused([{ ...first, width: 109 }, ...rest]),
    'every time written as a day and a time is as wide as the next — " 1 Jan 12:02 AM" 109px, " 1 Jan 12:01 AM" 108px',
  );
  assert.match(
    timesRefused([...NEW_YEAR, pre(' 1 Dec 2025', 72)]) ?? '',
    /^every time written as a day and its year is as wide as the next/,
  );
});

test('REFUSED: a time that does not keep its white space as written, which would lose its padding', () => {
  const [first, ...rest] = NEW_YEAR;
  assert.equal(
    timesRefused([{ ...first, whiteSpace: 'normal' }, ...rest]),
    'each time of the finished table keeps its padding — " 1 Jan 12:02 AM" is normal',
  );
});

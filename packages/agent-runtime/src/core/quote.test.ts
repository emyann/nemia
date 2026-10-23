/**
 * The bounded quote (`core/quote.ts`): a text over its bound is cut there and marked, one within it comes back whole, and a list
 * past its count names how many more it held. What each caller quotes through it, bounded end to end, is
 * `test/remote-quotes.test.ts`'s.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstOf, quote, VALUE_QUOTE, WORDS_QUOTE } from './quote.ts';

const many = Array.from({ length: 2_000 }, (_, i) => `item ${i}`);

/** Each row: what was quoted, and what the sentence holds of it. */
const ROWS: Array<{ name: string; got: () => string; want: string }> = [
  { name: 'a text over the value bound is cut at 60 and marked `…`', got: () => quote('a'.repeat(61)), want: `${'a'.repeat(60)}…` },
  { name: 'a text at the value bound comes back whole', got: () => quote('a'.repeat(60)), want: 'a'.repeat(60) },
  { name: 'an empty text comes back empty', got: () => quote(''), want: '' },
  {
    name: 'a text over the words bound is cut at 200 and marked `…`',
    got: () => quote('b'.repeat(100_000), WORDS_QUOTE),
    want: `${'b'.repeat(200)}…`,
  },
  { name: 'a text at the words bound comes back whole', got: () => quote('b'.repeat(200), WORDS_QUOTE), want: 'b'.repeat(200) },
  { name: 'the value bound is 60', got: () => String(VALUE_QUOTE), want: '60' },
  {
    name: 'a list past its count shows the first three whole and names how many more',
    got: () => firstOf(many, '; or '),
    want: 'item 0; or item 1; or item 2, and 1,997 more',
  },
  { name: 'a list within its count is joined whole', got: () => firstOf(many.slice(0, 3), ', '), want: 'item 0, item 1, item 2' },
  { name: 'a count given is the count kept', got: () => firstOf(many.slice(0, 4), ', ', 1), want: 'item 0, and 3 more' },
  { name: 'an empty list is an empty text', got: () => firstOf([], ', '), want: '' },
];

test('quote and firstOf: a text cut at its bound and marked, a list cut at its count and counted, each whole within it', async (t) => {
  for (const row of ROWS) await t.test(row.name, () => assert.equal(row.got(), row.want));
});

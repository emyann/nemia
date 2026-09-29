/**
 * The bounded quote (`core/quote.ts`): a text over its bound is cut there and marked, one within it comes back whole, and a list
 * past its count names how many more it held.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstOf, quote, VALUE_QUOTE, WORDS_QUOTE } from './quote.ts';

test('a text over its bound is cut at it and marked `…`; one at or under it comes back whole', () => {
  assert.equal(quote('a'.repeat(61)), `${'a'.repeat(60)}…`);
  assert.equal(quote('a'.repeat(60)), 'a'.repeat(60));
  assert.equal(quote(''), '');
  assert.equal(quote('b'.repeat(100_000), WORDS_QUOTE), `${'b'.repeat(200)}…`);
  assert.equal(quote('b'.repeat(200), WORDS_QUOTE), 'b'.repeat(200));
  assert.equal(VALUE_QUOTE, 60);
});

test('a list past its count shows the first whole and names how many more; one within it is joined whole', () => {
  const many = Array.from({ length: 2_000 }, (_, i) => `item ${i}`);
  assert.equal(firstOf(many, '; or '), 'item 0; or item 1; or item 2, and 1,997 more');
  assert.equal(firstOf(many.slice(0, 3), ', '), 'item 0, item 1, item 2');
  assert.equal(firstOf(many.slice(0, 4), ', ', 1), 'item 0, and 3 more');
  assert.equal(firstOf([], ', '), '');
});

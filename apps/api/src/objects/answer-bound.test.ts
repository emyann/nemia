import '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jsonLengthPast } from './answer-bound.ts';

/** Values of every kind `JSON.stringify` writes, and leaves out. */
const VALUES: readonly unknown[] = [
  null,
  true,
  false,
  0,
  -1.5e-7,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  '',
  'plain',
  'quotes " and \\ back',
  'controls \n\r\t\b\f \u0000 \u001f \u007f',
  'unicode é 漢字 😀',
  'lone \ud800 and \udc00 halves',
  [],
  [1, 'two', null, undefined, () => 3, Symbol('s')],
  {},
  { a: 1, b: undefined, c: () => 2, d: 'x', [Symbol('k')]: 1 },
  { 'key "quoted"\n': [{ nested: { deep: [true, { e: '😀' }] } }], empty: {}, list: [[], [[]]] },
  { at: new Date(0), boxed: [new Number(2), new String('s'), new Boolean(false)] },
  { own: { toJSON: (key: string) => `told ${key}` } },
  new Map([['a', 1]]),
];

test('jsonLengthPast counts the length JSON.stringify writes, within the bound', () => {
  for (const value of VALUES) {
    const written = JSON.stringify(value);
    assert.equal(jsonLengthPast(value, Number.MAX_SAFE_INTEGER), written.length, `the length of ${written}`);
    assert.equal(jsonLengthPast(value, written.length), written.length, `the length of ${written}, at the bound itself`);
  }
  assert.equal(jsonLengthPast(undefined, 10), 0, 'undefined is written as nothing');
});

test('jsonLengthPast answers past the bound once it is, and stops walking there', () => {
  let reads = 0;
  const items = Array.from({ length: 1000 }, (_, i) => ({
    get text() {
      reads += 1;
      return `item ${i} of a long list`;
    },
  }));
  const length = jsonLengthPast(items, 200);
  assert.ok(length > 200, 'the length answered is past the bound');
  assert.ok(reads < 20, `the walk stopped once past the bound, ${reads} items read of 1000`);
  assert.ok(JSON.stringify(items).length > 200);
});

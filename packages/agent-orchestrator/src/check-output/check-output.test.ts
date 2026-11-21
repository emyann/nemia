/**
 * What the laws of `checkOutputCut` (contracts/check-output-page.contract.ts) leave to the door (check-output.ts): how a stream's text is
 * cut into numbered lines — from 1, a `\r` before a line end dropped, the end after a last line not a line of its own — and how a match
 * keeps a line: containing its text as it is, in any case, under the line's number in the stream.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { checkOutputLines } from './check-output.ts';

test('the lines are numbered from 1, the end after the last line ending in one no line of its own', () => {
  assert.deepEqual(checkOutputLines('a\nb\n', undefined), [
    { n: 1, text: 'a' },
    { n: 2, text: 'b' },
  ]);
  assert.deepEqual(checkOutputLines('a\n\nb', undefined), [
    { n: 1, text: 'a' },
    { n: 2, text: '' },
    { n: 3, text: 'b' },
  ]);
  assert.deepEqual(checkOutputLines('', undefined), []);
});

test('a carriage return before a line end is no part of the line', () => {
  assert.deepEqual(checkOutputLines('ok 1\r\nok 2\r\n', undefined), [
    { n: 1, text: 'ok 1' },
    { n: 2, text: 'ok 2' },
  ]);
});

test('a match keeps the lines containing its text, in any case, each under its number in the stream', () => {
  assert.deepEqual(checkOutputLines('ok\nFAIL x\nok\nfailed y', 'fail'), [
    { n: 2, text: 'FAIL x' },
    { n: 4, text: 'failed y' },
  ]);
  assert.deepEqual(checkOutputLines('ok\nfail', ''), checkOutputLines('ok\nfail', undefined), 'an empty match keeps every line');
});

test("a match is its text as it is, never a pattern: a '.' is a dot", () => {
  assert.deepEqual(checkOutputLines('abc\na.c\n', 'a.c'), [{ n: 2, text: 'a.c' }]);
  assert.deepEqual(checkOutputLines('x(y\n', 'x('), [{ n: 1, text: 'x(y' }], 'a text no pattern reads is matched all the same');
});

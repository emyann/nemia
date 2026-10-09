/**
 * The merge by line: changes far apart on each side both kept, the same change taken once, and different changes over the same base lines
 * a conflict that names them, with its three sides.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diff3Lines, linesOf } from './lines.ts';

/** The lines `a b c` as a file holds them, one a line. */
const file = (...words: string[]): string[] => words.map((w) => `${w}\n`);

test('changes far apart on each side are both kept, and the same change on both sides is taken once', () => {
  const base = file('a', 'b', 'c', 'd', 'e');
  assert.deepEqual(diff3Lines(base, file('A', 'b', 'c', 'd', 'e'), file('a', 'b', 'c', 'd', 'E')), [
    { clean: file('A', 'b', 'c', 'd', 'E') },
  ]);
  assert.deepEqual(diff3Lines(base, file('a', 'B', 'c', 'd', 'e'), file('a', 'B', 'c', 'd', 'e')), [
    { clean: file('a', 'B', 'c', 'd', 'e') },
  ]);
  assert.deepEqual(diff3Lines(base, file('a', 'c', 'd', 'e'), base), [{ clean: file('a', 'c', 'd', 'e') }]);
});

test('different changes to the same base lines are one conflict, at the base lines they span, with its three sides', () => {
  const base = file('a', 'b', 'c', 'd', 'e');
  assert.deepEqual(diff3Lines(base, file('a', 'x', 'y', 'd', 'e'), file('a', 'B', 'C', 'd', 'e')), [
    { clean: file('a') },
    { conflict: { a: 2, b: 3, base: file('b', 'c'), ours: file('x', 'y'), theirs: file('B', 'C') } },
    { clean: file('d', 'e') },
  ]);
});

test('different lines added at the same place conflict over an empty base range', () => {
  const base = file('a', 'b');
  assert.deepEqual(diff3Lines(base, file('a', 'x', 'b'), file('a', 'y', 'b')), [
    { clean: file('a') },
    { conflict: { a: 2, b: 1, base: [], ours: file('x'), theirs: file('y') } },
    { clean: file('b') },
  ]);
});

test('a text cut into lines keeps each line its newline, and a last line with none', () => {
  assert.deepEqual(linesOf('a\nb'), ['a\n', 'b']);
  assert.deepEqual(linesOf(''), []);
  assert.equal(linesOf('a\n\nb\n').join(''), 'a\n\nb\n');
});

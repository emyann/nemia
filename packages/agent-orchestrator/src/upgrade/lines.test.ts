/**
 * The merge by line: changes far apart on each side both kept, the same change taken once, and different changes over the same base lines
 * a conflict that names them, with its three sides.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diff2Lines, diff3Lines, linesOf } from './lines.ts';

/** The lines `a b c` as a file holds them, one a line. */
const file = (...words: string[]): string[] => words.map((w) => `${w}\n`);

test('the merge by line, row by row: what both sides keep, what conflicts, and how a text is cut', async (t) => {
  await t.test('changes far apart on each side are both kept, and the same change on both sides is taken once', () => {
    const base = file('a', 'b', 'c', 'd', 'e');
    assert.deepEqual(diff3Lines(base, file('A', 'b', 'c', 'd', 'e'), file('a', 'b', 'c', 'd', 'E')), [
      { clean: file('A', 'b', 'c', 'd', 'E') },
    ]);
    assert.deepEqual(diff3Lines(base, file('a', 'B', 'c', 'd', 'e'), file('a', 'B', 'c', 'd', 'e')), [
      { clean: file('a', 'B', 'c', 'd', 'e') },
    ]);
    assert.deepEqual(diff3Lines(base, file('a', 'c', 'd', 'e'), base), [{ clean: file('a', 'c', 'd', 'e') }]);
  });
  await t.test('different changes to the same base lines are one conflict, at the base lines they span, with its three sides', () => {
    const base = file('a', 'b', 'c', 'd', 'e');
    assert.deepEqual(diff3Lines(base, file('a', 'x', 'y', 'd', 'e'), file('a', 'B', 'C', 'd', 'e')), [
      { clean: file('a') },
      { conflict: { a: 2, b: 3, base: file('b', 'c'), ours: file('x', 'y'), theirs: file('B', 'C') } },
      { clean: file('d', 'e') },
    ]);
  });
  await t.test('different lines added at the same place conflict over an empty base range', () => {
    const base = file('a', 'b');
    assert.deepEqual(diff3Lines(base, file('a', 'x', 'b'), file('a', 'y', 'b')), [
      { clean: file('a') },
      { conflict: { a: 2, b: 1, base: [], ours: file('x'), theirs: file('y') } },
      { clean: file('b') },
    ]);
  });
  await t.test('with no common base, the lines both sides hold are clean, and equal texts give no conflict', () => {
    assert.deepEqual(diff2Lines(file('a', 'b'), file('a', 'b')), [{ clean: file('a', 'b') }]);
    assert.deepEqual(diff2Lines([], []), []);
  });
  await t.test('with no common base, a run both hold differently is one conflict, addressed by the tree’s lines', () => {
    assert.deepEqual(diff2Lines(file('a', 'x', 'y', 'd'), file('a', 'B', 'd')), [
      { clean: file('a') },
      { conflict: { a: 2, b: 3, base: [], ours: file('x', 'y'), theirs: file('B') } },
      { clean: file('d') },
    ]);
  });
  await t.test('with no common base, a run only the tree holds and a run only the template holds are each a conflict', () => {
    assert.deepEqual(diff2Lines(file('a', 'mine', 'b'), file('a', 'b', 'new')), [
      { clean: file('a') },
      { conflict: { a: 2, b: 2, base: [], ours: file('mine'), theirs: [] } },
      { clean: file('b') },
      { conflict: { a: 4, b: 3, base: [], ours: [], theirs: file('new') } },
    ]);
  });
  await t.test('a text cut into lines keeps each line its newline, and a last line with none', () => {
    assert.deepEqual(linesOf('a\nb'), ['a\n', 'b']);
    assert.deepEqual(linesOf(''), []);
    assert.equal(linesOf('a\n\nb\n').join(''), 'a\n\nb\n');
  });
});

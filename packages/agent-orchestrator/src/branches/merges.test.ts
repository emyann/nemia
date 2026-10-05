/** The merge check's words (`mergeWord`), and a place's trial merge read as one (`mergeWordOf`). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeWord, mergeWordOf } from './merges.ts';

test('a merge in words: clean, conflicted in one file or several, and not known with why', () => {
  assert.equal(mergeWord({ clean: true }, 'main'), 'merges cleanly onto main');
  assert.equal(mergeWord({ clean: false, conflicts: ['src/a.ts'] }, 'main'), 'conflicts with main in 1 file: src/a.ts');
  assert.equal(mergeWord({ clean: false, conflicts: ['a', 'b'] }, 'main'), 'conflicts with main in 2 files: a, b');
  assert.equal(mergeWord({ error: 'no such ref' }, 'main'), 'whether it merges onto main is not known: no such ref');
});

test('a trial the place could not say is an error in its words, never clean', () => {
  assert.deepEqual(mergeWordOf({ unknown: 'x' }), { error: 'x' });
  assert.deepEqual(mergeWordOf({ clean: true }), { clean: true });
  assert.deepEqual(mergeWordOf({ clean: false, conflicts: ['a.ts'] }), { clean: false, conflicts: ['a.ts'] });
});

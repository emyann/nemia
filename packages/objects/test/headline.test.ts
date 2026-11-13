/** `headline`: a body's first line, its leading heading mark taken off and nothing else changed. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headline } from 'objects';

test('a heading of each level gives its words without the mark, and only the first line', () => {
  for (let level = 1; level <= 6; level++) {
    assert.equal(headline(`${'#'.repeat(level)} api: a title\n\nThe body.`), 'api: a title', `level ${level}`);
  }
});

test('a first line with no mark is returned as it is', () => {
  assert.equal(headline('api: a title\n# not the first line'), 'api: a title');
  assert.equal(headline('one line'), 'one line');
  assert.equal(headline(''), '');
});

test('a # not followed by a space, and seven of them, are not a heading and stay', () => {
  assert.equal(headline('#tag the rest'), '#tag the rest');
  assert.equal(headline('####### seven'), '####### seven');
});

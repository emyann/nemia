/**
 * The laws of `withSharedLines` and `onceEach` the verifier leaves bounded (`contracts/shared-lines.contract.ts`), held here on a table:
 * every line the agent writes and every line of a file it names is kept, nothing else is added, and each line is written once.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onceEach, withSharedLines } from './shared-lines.ts';

test('a { path } item is replaced by its file’s lines in its place, the agent’s own lines kept, each line once at its first place', () => {
  const linesOf = { 'fences/read.yaml': ['Bash(git log *)', 'Bash(ls *)'], 'fences/deny.yaml': ['Bash(ls *)', 'Bash(rm *)'] };
  for (const [items, want] of [
    [
      [{ line: 'Read' }, { path: 'fences/read.yaml' }, { line: 'Grep' }],
      ['Read', 'Bash(git log *)', 'Bash(ls *)', 'Grep'],
    ],
    [
      [{ path: 'fences/read.yaml' }, { path: 'fences/deny.yaml' }],
      ['Bash(git log *)', 'Bash(ls *)', 'Bash(rm *)'],
    ],
    [
      [{ line: 'Bash(ls *)' }, { path: 'fences/read.yaml' }, { line: 'Bash(ls *)' }],
      ['Bash(ls *)', 'Bash(git log *)'],
    ],
    [[], []],
  ] as const)
    assert.deepEqual(withSharedLines(items, linesOf), want);
});

test('onceEach keeps every line at its first place and adds none', () => {
  assert.deepEqual(onceEach(['a', 'b', 'a', 'c', 'b']), ['a', 'b', 'c']);
  assert.deepEqual(onceEach([]), []);
});

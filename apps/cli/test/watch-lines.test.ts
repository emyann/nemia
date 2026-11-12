/**
 * The client's printer of a feed line (`watchedLine`, `src/watch/lines.ts`): a run's, a step's, the store's, a daemon's and a factory's,
 * each as the stream sends it, in the words the in-process watch printed of the same line before it was deleted; and under `--json`, the
 * line whole with the cursor after it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { watchedLine } from '../src/watch/lines.ts';

const at = '2026-11-11T10:02:13.000Z';
const LINES: ReadonlyArray<readonly [object, string]> = [
  [{ at, run: 'r-1', word: 'running' }, '10:02:13  r-1  —  running'],
  [
    { at, run: 'r-1', step: 'plan', word: 'awaiting approval', note: 'approve it: nemia approve r-1 plan' },
    '10:02:13  r-1  plan  awaiting approval  · approve it: nemia approve r-1 plan',
  ],
  [
    { at, store: 'store', word: 'store paused', by: 'ann', why: 'merging by hand', note: 'since 2026-11-11T10:00:00.000Z' },
    '10:02:13  store  —  store paused by ann  · merging by hand  · since 2026-11-11T10:00:00.000Z',
  ],
  [
    { at, daemon: 4242, word: 'daemon started', note: 'first daemon on this store' },
    '10:02:13  pid 4242  daemon started  · first daemon on this store',
  ],
  [
    { at, factory: 'acme', word: 'conflicts pending', note: 'agents/coder.md: choose one' },
    '10:02:13  acme  —  conflicts pending  · agents/coder.md: choose one',
  ],
];

test("the client prints each line of the feed in its words, a factory's headed by its name", () => {
  for (const [line, words] of LINES) assert.equal(watchedLine(JSON.stringify(line), 0, {}), words, JSON.stringify(line));
});

test('under --json a line is printed whole, with the cursor just after it', () => {
  for (const [line] of LINES)
    assert.deepEqual(JSON.parse(watchedLine(JSON.stringify(line), 412, { json: true })), { ...line, cursor: 412 });
});

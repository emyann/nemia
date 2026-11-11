/**
 * The client's printer of a feed line (`watchedLine`, `src/watch/lines.ts`) says what the orchestrator's `feedLineWords` says of the same
 * line: a run's, a step's, the store's, a daemon's and a factory's, each as the stream sends it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { feedLineWords } from 'agent-orchestrator';
import { watchedLine } from '../src/watch/lines.ts';

const at = '2026-11-11T10:02:13.000Z';
const LINES = [
  { at, run: 'r-1', word: 'running' },
  { at, run: 'r-1', step: 'plan', word: 'awaiting approval', note: 'approve it: nemia approve r-1 plan' },
  { at, store: 'store', word: 'store paused', by: 'ann', why: 'merging by hand', note: 'since 2026-11-11T10:00:00.000Z' },
  { at, daemon: 4242, word: 'daemon started' as const, note: 'first daemon on this store' },
  { at, factory: 'acme', word: 'conflicts pending', note: 'agents/coder.md: choose one' },
];

test("the client prints each line of the feed as the orchestrator does, a factory's headed by its name", () => {
  for (const line of LINES) assert.equal(watchedLine(JSON.stringify(line), 0, {}), feedLineWords(line), JSON.stringify(line));
  const factory = watchedLine(JSON.stringify(LINES[4]), 0, {});
  assert.ok(factory.includes('acme  —  conflicts pending'), "a factory's line is headed by the factory, not a daemon's pid");
});

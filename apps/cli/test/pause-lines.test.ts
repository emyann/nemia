/**
 * The client's pause line (`nemia watch`, `pausedWords`): a timed pause's count of sessions finishing a call and when they are cut, and
 * what the pause does, in the words the in-process watch printed of the same pause before it was deleted.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { pausedWords } from '../src/watch/lines.ts';

const at = '2026-11-03T10:00:00.000Z';
const now = new Date(Date.parse(at) + 61_000);
const paused = {
  pause: { at, by: 'ann', timeoutMs: 600_000 },
  finishing: [
    { run: 'r-1', step: 'a', kind: 'session' as const, calling: 'Bash' },
    { run: 'r-2', step: 'b', kind: 'check' as const },
  ],
  parked: [
    { run: 'r-3', step: 'c', after: 'Read' },
    { run: 'r-4', step: 'd', cut: 'Bash' },
  ],
  staged: [],
  held: [],
};

test('the pause line: the count of sessions finishing a call, and when they are cut', () => {
  assert.equal(
    pausedWords(paused, now),
    'Pausing: 1 session finishing a tool call, cut in 9 min — the store is paused since 2026-11-03T10:00:00.000Z by ann; nothing new starts, and each working session stops when its current tool call ends, cut once the timeout passes; nemia resume resumes it',
  );
  const cut = { ...paused, pause: { ...paused.pause, timeoutMs: 0 } };
  assert.equal(
    pausedWords(cut, now),
    'Pausing: 1 session finishing a tool call, cut now — the store is paused since 2026-11-03T10:00:00.000Z by ann; nothing new starts, and each working session is cut at once and parks; nemia resume resumes it',
  );
  assert.doesNotMatch(pausedWords(cut, now) ?? '', /once the timeout passes/, 'never that it waits on a timeout');
  assert.equal(
    pausedWords({ ...paused, finishing: [] }, now),
    'Paused since 2026-11-03T10:00:00.000Z by ann — nothing runs and nothing new starts; nemia resume resumes it',
  );
});

test('what a pause does: a timed one parks each session at its call’s end, an untimed one lets it run on', () => {
  assert.equal(
    pausedWords({ ...paused, pause: { at, by: 'ann' } }, now),
    'Pausing: 2 finishing — the store is paused since 2026-11-03T10:00:00.000Z by ann; nothing new starts, and each working session runs on to its end; nemia resume resumes it',
  );
});

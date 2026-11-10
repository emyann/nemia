/**
 * The client's pause line (`nemia watch`) says what the orchestrator's `pausedWords` says of the same pause: a timed pause's count of
 * sessions finishing a call and when they are cut, and what the pause does.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { pausedWords as orchestratorWords } from 'agent-orchestrator';
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

test("the client's pause line is the orchestrator's: the count of sessions finishing a call, and when they are cut", () => {
  assert.equal(pausedWords(paused, now), orchestratorWords(paused, now));
  const cut = { ...paused, pause: { ...paused.pause, timeoutMs: 0 } };
  assert.equal(pausedWords(cut, now), orchestratorWords(cut, now));
  assert.match(pausedWords(cut, now) ?? '', /cut now/, 'a pause at once says its calls are being cut');
  assert.match(pausedWords(cut, now) ?? '', /each working session is cut at once and parks/, 'and that each session is cut at once');
  assert.doesNotMatch(pausedWords(cut, now) ?? '', /once the timeout passes/, 'never that it waits on a timeout');
  const parked = { ...paused, finishing: [] };
  assert.equal(pausedWords(parked, now), orchestratorWords(parked, now));
});

test("the client says what the orchestrator says a pause does: a timed one parks each session at its call's end, an untimed one lets it run on", () => {
  const untimed = { ...paused, pause: { at, by: 'ann' } };
  assert.equal(pausedWords(untimed, now), orchestratorWords(untimed, now));
  assert.match(pausedWords(paused, now) ?? '', /each working session stops when its current tool call ends, cut once the timeout passes/);
  assert.match(pausedWords(untimed, now) ?? '', /each working session runs on to its end/);
});

/**
 * The client's pause lines (`nemia ls`, `nemia watch`) say what the orchestrator's `pausedLines` and `pausedWords` say of the same pause:
 * a timed pause's count of sessions finishing a call and when they are cut, and each step it holds parked.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { pausedLines as orchestratorLines, pausedWords as orchestratorWords } from 'agent-orchestrator';
import { pausedLines } from '../src/reads/ls-lines.ts';
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

test("the client's pause lines are the orchestrator's: the count of sessions finishing a call, when they are cut, and each step parked", () => {
  assert.deepEqual(pausedLines(paused, now), orchestratorLines(paused, now));
  assert.equal(pausedWords(paused, now), orchestratorWords(paused, now));
  const parked = { ...paused, finishing: [] };
  assert.deepEqual(pausedLines(parked, now), orchestratorLines(parked, now));
});

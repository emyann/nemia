/**
 * What a step needs from a person, as the board says it, and what the run's page offers to answer it with (lib/asks.ts): off the api's
 * `needs`, `blockedByHarness`, `asked` and `waitingOnYou` alone.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needLine, needOf, needsOf, needText, offersOf, type Need } from '../src/lib/asks.ts';
import type { RunDetail } from '../src/lib/api.ts';

const LOGIN = 'Could not refresh your login because another Claude Code process is refreshing it (or exited mid-refresh) · Try again in a minute';

type Step = RunDetail['steps'][number];

/** A step as the api gives it, cut to what these read. */
const step = (name: string, status: string, over: Partial<Step> = {}): Step =>
  ({ name, status, note: null, needs: null, blockedByHarness: null, asked: null, check: null, ...over }) as Step;

/** A run of these steps, waiting on `waitingOnYou`. */
const run = (steps: Step[], waitingOnYou: string[], cancelledAt: string | null = null) => ({ steps, waitingOnYou, cancelledAt });

test("a step's need is its question while it waits on you, or that the harness blocked its session, with what it said last — none once asked, and none on a run called off", () => {
  const steps = [
    step('implement', 'succeeded · BLOCKED', { needs: 'Which database?' }),
    step('theme', 'failed ✗ check (exit 1)'),
    step('held', 'needs-human', { blockedByHarness: { lastLine: LOGIN } }),
    step('silent', 'needs-human', { blockedByHarness: { lastLine: null } }),
    // Signed off blocked with a question, and a person has asked for its next try: the api leaves it out of `waitingOnYou`.
    step('plan', 'succeeded · BLOCKED', { needs: 'Which plan?', note: 'try 2 asked (--nudge, with your answer) — the next tick files it' }),
    step('review', 'waiting'),
  ];
  const needs = needsOf(run(steps, ['implement', 'theme']));
  assert.deepEqual(needs, [
    { step: 'implement', kind: 'asks', needs: 'Which database?' },
    { step: 'held', kind: 'harness', lastLine: LOGIN },
    { step: 'silent', kind: 'harness', lastLine: null },
  ]);
  assert.deepEqual(needsOf(run(steps, [], '2026-09-14T07:00:00.000Z')), []);
  assert.equal(needOf(steps[0]!, false, false), null, 'asked already: no question to show');
  assert.equal(needOf(steps[2]!, false, true), null, 'called off: nobody waits for the session');

  assert.deepEqual(needs.map(needLine), [
    'implement asks: Which database?',
    `held is blocked by the harness: ${LOGIN}`,
    'silent is blocked by the harness',
  ]);
  assert.deepEqual(needs.map(needText), ['asks: Which database?', `blocked by the harness: ${LOGIN}`, 'blocked by the harness']);
});

test('what the Decide section offers: an answer to a step that asks, Continue for a session the harness blocked, Try again for a refused check — recheck first where it did not finish — or an unsigned step, and the note of a try asked', () => {
  const steps = [
    step('implement', 'succeeded · BLOCKED', { needs: 'Which database?' }),
    step('quiet', 'succeeded · BLOCKED'),
    step('held', 'needs-human', { blockedByHarness: { lastLine: LOGIN } }),
    step('theme', 'failed ✗ check (exit 1)', { check: { command: 'npm test', taskId: 't-c', verdict: 'exit 1', refused: null } }),
    step('lint', 'failed ✗ check (unfinished)', { check: { command: 'npm run lint', taskId: 't-l', verdict: 'unfinished', refused: null } }),
    step('docs', 'unsigned'),
    step('plan', 'succeeded · BLOCKED', {
      needs: 'Which plan?', note: 'try 2 asked (--fresh, with your answer) — the next tick files it',
      asked: { try: 2, mode: 'fresh', model: null, message: 'The small one.' },
    }),
    // Out of rounds: `wf round`, among the commands, and no try.
    step('review', 'rounds exhausted'),
    // Done, and waiting on nobody.
    step('tokens', 'unverified · done'),
  ];
  const waiting = ['implement', 'quiet', 'theme', 'lint', 'docs', 'review'];
  assert.deepEqual(offersOf({ ...run(steps, waiting) }), [
    { step: 'implement', kind: 'answer', needs: 'Which database?' },
    { step: 'quiet', kind: 'answer', needs: null },
    { step: 'held', kind: 'continue', lastLine: LOGIN },
    { step: 'theme', kind: 'try-again', recheck: true, unfinished: false },
    { step: 'lint', kind: 'try-again', recheck: true, unfinished: true },
    { step: 'docs', kind: 'try-again', recheck: false, unfinished: false },
    { step: 'plan', kind: 'asked', try: 2, note: 'try 2 asked (--fresh, with your answer) — the next tick files it' },
  ]);
  // A blocked step the api does not name as waiting on you is offered nothing: what waits is the api's word.
  assert.deepEqual(offersOf(run([steps[0]!], [])), []);
  assert.deepEqual(offersOf(run(steps, waiting, '2026-09-14T07:00:00.000Z')), [], 'nothing on a run called off');
  const kinds = (needs: Need[]) => needs.map((n) => n.kind);
  assert.deepEqual(kinds(needsOf(run(steps, waiting))), ['asks', 'harness'], 'the banner names the two that need words');
});

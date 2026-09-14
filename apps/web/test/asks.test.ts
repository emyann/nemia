/**
 * What a step needs from a person, as the board says it, and what the run's page offers to answer it with (lib/asks.ts): off the api's
 * `needs`, `blockedByHarness`, `lastLine`, `asked` and `waitingOnYou` alone.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needLine, needOf, needsOf, needText, offersOf, unblockCommands, type Need } from '../src/lib/asks.ts';
import type { RunDetail } from '../src/lib/api.ts';

const LOGIN = 'Could not refresh your login because another Claude Code process is refreshing it (or exited mid-refresh) · Try again in a minute';

type Step = RunDetail['steps'][number];

/** A step as a run's detail gives it, cut to what these read. */
const step = (name: string, status: string, over: Partial<Step> = {}): Step =>
  ({ name, status, note: null, needs: null, blockedByHarness: false, lastLine: null, asked: null, check: null, ...over }) as Step;

/** A run of these steps, waiting on `waitingOnYou`. */
const run = (steps: Step[], waitingOnYou: string[], cancelledAt: string | null = null) => ({ steps, waitingOnYou, cancelledAt });

test("a step's need is its question while it waits on you, or that the harness blocked its session, with what it said last where the api read it — none once asked, and none on a run called off", () => {
  const steps = [
    step('implement', 'succeeded · BLOCKED', { needs: 'Which database?' }),
    step('theme', 'failed ✗ check (exit 1)'),
    step('held', 'needs-human', { blockedByHarness: true, lastLine: LOGIN }),
    step('silent', 'needs-human', { blockedByHarness: true }),
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

  // As the list gives a step the harness blocked, with no last line to give: the card names the harness and quotes nothing.
  const listed = needOf({ name: 'held', needs: null, blockedByHarness: true }, false, false);
  assert.deepEqual(listed, { step: 'held', kind: 'harness', lastLine: null });
  assert.equal(needLine(listed!), 'held is blocked by the harness');
});

test('what the Decide section offers: an answer to a step that asks, Try again for a refused check — recheck first where it did not finish — or an unsigned step, and the note of a try asked', () => {
  const steps = [
    step('implement', 'succeeded · BLOCKED', { needs: 'Which database?' }),
    step('quiet', 'succeeded · BLOCKED'),
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
  assert.deepEqual(offersOf(run(steps, waiting)), [
    { step: 'implement', kind: 'answer', needs: 'Which database?' },
    { step: 'quiet', kind: 'answer', needs: null },
    { step: 'theme', kind: 'try-again', recheck: true, unfinished: false },
    { step: 'lint', kind: 'try-again', recheck: true, unfinished: true },
    { step: 'docs', kind: 'try-again', recheck: false, unfinished: false },
    { step: 'plan', kind: 'asked', try: 2, note: 'try 2 asked (--fresh, with your answer) — the next tick files it' },
  ]);
  // A blocked step the api does not name as waiting on you is offered nothing: what waits is the api's word.
  assert.deepEqual(offersOf(run([steps[0]!], [])), []);
  assert.deepEqual(offersOf(run(steps, waiting, '2026-09-14T07:00:00.000Z')), [], 'nothing on a run called off');
  const kinds = (needs: Need[]) => needs.map((n) => n.kind);
  assert.deepEqual(kinds(needsOf(run(steps, waiting))), ['asks'], 'the banner names the step that asks');
});

test("REFUSED: a session the harness blocked is offered no try, since the package refuses every one — only the commands that can move it: stop its task in wf's engine store, then wf retry", () => {
  const held = step('held', 'needs-human', { blockedByHarness: true, lastLine: LOGIN });
  // Whether or not the api names it as waiting on you: it asked nothing, and no try of it is taken.
  assert.deepEqual(offersOf(run([held], [])), []);
  assert.deepEqual(offersOf(run([held], ['held'])), []);
  assert.deepEqual(unblockCommands('r-1', 'held', 'r-1-held'), [
    'AE_ROOT="${WF_ROOT:-$HOME/.agent-workflows}/engine" ae stop r-1-held',
    'wf retry r-1 held',
  ]);
});

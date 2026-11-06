/**
 * A step of a run her message links to, read as the run's page reads it (lib/brought.ts, `broughtFacts`): whether the run has it, whether
 * it waits at its gate, why the run's page offers it an answer, and whether a try of it is asked already, each off the run's own record.
 * Which part those facts draw is `broughtPart`'s, proved by `contracts/brought.contract.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { broughtFacts } from '../src/lib/brought.ts';
import type { RunView } from '../src/lib/runView.ts';
import { coded, detail, step as fixtureStep, type Word } from './run-fixtures.ts';

type Step = RunView['steps'][number];

/** A step named `name` saying `word`, with no gate words, no raise, no denial and no try asked unless `over` gives one. */
const step = (name: string, word: Word, over: Partial<Step> = {}): Step =>
  fixtureStep({ name, ...coded(word), approve: null, raise: null, denied: null, asked: null, needs: null, ...over });

/** A run nobody holds or called off, holding `steps`, waiting on the person for `waiting`. */
const run = (steps: Step[], waiting: string[], over: Partial<RunView> = {}): RunView =>
  detail({ holding: null, cancelledAt: null, steps, waitingOnYou: waiting, ...over });

const ASKED = { try: 2, mode: 'continue', model: null, message: null, stopFirst: false } as const;

test("broughtFacts: a step she brings, read as the run's page reads it", () => {
  const gated = step('design', 'awaiting approval', { approve: 'approve design' });
  const blocked = step('implement', 'succeeded · BLOCKED', { needs: 'Which way?' });
  const raise = step('lint', 'budget exhausted $3.02 of $3', {
    raise: { by: 'retry', above: 3.02, said: 'raise it', modes: ['continue', 'fresh'], own: 'budget exhausted' },
  });
  const refused = step('test', 'failed ✗ check (exit 1)');
  const harness = step('build', 'needs-human');
  const loop = step('review', 'rounds exhausted');
  const asked = step('plan', 'succeeded · BLOCKED', { asked: ASKED });
  const done = step('ship', 'verified ✓');
  const steps = [gated, blocked, raise, refused, harness, loop, asked, done];
  const waiting = ['design', 'implement', 'lint', 'test', 'review', 'plan'];
  const live = run(steps, waiting);

  const rows: Array<[string, RunView, string, ReturnType<typeof broughtFacts>]> = [
    ['a step at its gate, waiting on you', live, 'design', { found: true, atGate: true, offer: null, asked: false }],
    ['signed off blocked', live, 'implement', { found: true, atGate: false, offer: 'answer', asked: false }],
    ['held on its budget', live, 'lint', { found: true, atGate: false, offer: 'raise', asked: false }],
    ['refused by its check', live, 'test', { found: true, atGate: false, offer: 'try-again', asked: false }],
    ['its session blocked by the harness', live, 'build', { found: true, atGate: false, offer: 'continue', asked: false }],
    ['a loop out of rounds', live, 'review', { found: true, atGate: false, offer: 'enough', asked: false }],
    ['its next try asked already', live, 'plan', { found: true, atGate: false, offer: null, asked: true }],
    ['waiting on nobody', live, 'ship', { found: true, atGate: false, offer: null, asked: false }],
    [
      'approved elsewhere: no longer waiting on you',
      run(
        steps,
        waiting.filter((name) => name !== 'design'),
      ),
      'design',
      { found: true, atGate: false, offer: null, asked: false },
    ],
    [
      'on a run a person holds, blocked: nothing offered',
      run(steps, waiting, { holding: detail().holding }),
      'implement',
      { found: true, atGate: false, offer: null, asked: false },
    ],
    [
      'its try asked, on a run a person holds: the tick files nothing',
      run(steps, waiting, { holding: detail().holding }),
      'plan',
      { found: true, atGate: false, offer: null, asked: false },
    ],
    [
      'on a run called off, at its gate: nothing waits',
      run(steps, waiting, { cancelledAt: '2026-09-30T07:00:00.000Z' }),
      'design',
      { found: true, atGate: false, offer: null, asked: false },
    ],
    ['a name the run has no step of', live, 'deploy', { found: false, atGate: false, offer: null, asked: false }],
  ];
  for (const [said, view, name, facts] of rows) assert.deepEqual(broughtFacts(view, name), facts, said);
});

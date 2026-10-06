/**
 * A step's metrics (`step.ts`, `recordStepMetrics`): the facts read off the tasks a pass saw settle, recorded by the five attributes
 * alone, and a fact whose attributes carry a run's id refused. The tick that hands them over is proven on a store in
 * `test/step-metrics.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect, Metric } from 'effect';
import type { Run } from '../record/record.ts';
import type { Workflow } from '../step/step.ts';
import type { TaskSpend } from '../status/status.ts';
import { boundedAttributes, roundsGranted, settledFacts, stepAttributes, type FactReads, type FactView, type StepFact } from './step.ts';
import { recordStepMetrics } from './meter.verb.ts';

const WORK = { name: 'work', agent: { name: 'ada' } } as Workflow;
const REVIEW = { name: 'review' } as Workflow;

const RUN = {
  id: 'r-1',
  factory: 'nemia',
  workflowDir: '/home/me/.agent-workflows/workflows/build',
  steps: {
    work: { status: 'running', taskId: 'r-1-work-try2', check: { taskId: 'r-1-work-try2-check' }, tries: [{ taskId: 'r-1-work' }] },
    review: { status: 'running', taskId: 'r-1-review' },
  },
} as unknown as Run;

/** A task's view that ran from 10:00 to 10:05 and settled as `settled`, its last attempt's exit `exitCode`. */
const view = (settled: string, exitCode?: number): FactView => ({
  state: {
    brief: 'Do it.',
    settled,
    attempts: [
      {
        startedAt: '2026-10-06T10:00:00.000Z',
        spawnedAt: '2026-10-06T10:00:00.000Z',
        endedAt: '2026-10-06T10:05:00.000Z',
        reason: null,
        usage: { inputTokens: 1200, outputTokens: 300, costUsd: 1.25 },
        ...(exitCode === undefined ? {} : { exitCode }),
      },
    ],
  },
});

const SPENT: TaskSpend = { usd: 1.25, measured: 1, unmeasured: 0, budgetEnded: false, denied: ['Bash(curl x)', 'Bash(git push)'] };

const reads = (over: Partial<FactReads> = {}): FactReads => ({
  views: new Map([
    ['r-1-work-try2', view('succeeded')],
    ['r-1-work-try2-check', view('failed', 1)],
    ['r-1-work', view('stopped')],
    ['r-1-review', view('succeeded')],
  ]),
  spendOf: (taskId) => (taskId === 'r-1-work-try2' ? SPENT : undefined),
  signedOff: () => ({ outcome: 'blocked', summary: '', artifacts: [] }),
  statusOf: () => 'running',
  ...over,
});

test("a step's attributes are its factory, workflow, step, agent and outcome, and nothing of the run", () => {
  assert.deepEqual(stepAttributes(RUN, WORK, 'done'), { factory: 'nemia', workflow: 'build', step: 'work', agent: 'ada', outcome: 'done' });
  assert.deepEqual(stepAttributes({ workflowDir: '/w/intake' }, REVIEW, 'passed'), {
    factory: 'default',
    workflow: 'intake',
    step: 'review',
    agent: 'none',
    outcome: 'passed',
  });
});

test("REFUSED: attributes that carry a run's id or a task's are not a step's", () => {
  for (const key of ['run', 'task']) {
    let refused: unknown;
    try {
      boundedAttributes({ factory: 'nemia', step: 'work', [key]: 'r-1' });
    } catch (err) {
      refused = err;
    }
    assert.ok(refused instanceof Error, key);
    assert.match(
      refused.message,
      new RegExp(`carries the attribute "${key}", which is not one of factory, workflow, step, agent, outcome`),
    );
  }
});

test('the facts of the tasks that settled: a session with its cost, tokens, time and denials, a check by its verdict', () => {
  const facts = settledFacts(RUN, [WORK, REVIEW], new Set(['r-1-work-try2', 'r-1-work-try2-check', 'r-2-work']), reads());
  const attrs = (outcome: string) => ({ factory: 'nemia', workflow: 'build', step: 'work', agent: 'ada', outcome });
  assert.deepEqual(facts, [
    { metric: 'try', attributes: attrs('blocked'), costUsd: 1.25, inputTokens: 1200, outputTokens: 300, ms: 300_000, denied: 2 },
    { metric: 'check', attributes: attrs('refused') },
  ]);
});

test('an earlier try is read by how its session ended, never off the closeout of the try after it; nothing settled, no fact', () => {
  const [earlier] = settledFacts(RUN, [WORK, REVIEW], new Set(['r-1-work']), reads({ signedOff: () => undefined }));
  assert.equal(earlier.attributes.outcome, 'stopped');
  assert.equal('costUsd' in earlier, false, 'no cost measured, none said');
  assert.deepEqual(settledFacts(RUN, [WORK, REVIEW], new Set(), reads()), []);
});

test('a round exhausted once for a step one of its settled tasks leaves out of rounds, and one granted for each loop taken again', () => {
  const exhausted = reads({ statusOf: (s) => (s.name === 'work' ? 'exhausted' : 'running') });
  const facts = settledFacts(RUN, [WORK, REVIEW], new Set(['r-1-work-try2', 'r-1-work-try2-check']), exhausted);
  assert.deepEqual(
    facts.filter((f) => f.metric === 'round').map((f) => f.attributes.outcome),
    ['exhausted'],
  );
  assert.deepEqual(
    roundsGranted(RUN, [WORK, REVIEW], ['review']).map((f) => [f.attributes.step, f.attributes.outcome]),
    [['review', 'granted']],
  );
});

/** `program` over a registry of its own, and what it holds after. */
const recorded = async (facts: readonly StepFact[]) => {
  const registry = new Map();
  const own = <A, E>(program: Effect.Effect<A, E>) =>
    Effect.runPromise(program.pipe(Effect.provideService(Metric.MetricRegistry, registry)));
  await own(recordStepMetrics(facts));
  return own(Metric.snapshot);
};

test('a session that settled with a cost records its cost once, by the five attributes and no run', async () => {
  const facts = settledFacts(RUN, [WORK, REVIEW], new Set(['r-1-work-try2']), reads());
  const snapshot = await recorded(facts);
  const cost = snapshot.filter((m) => m.id === 'step.cost');
  assert.equal(cost.length, 1);
  assert.equal((cost[0].state as { count: number }).count, 1.25);
  assert.deepEqual(Object.keys(cost[0].attributes ?? {}).sort(), ['agent', 'factory', 'outcome', 'step', 'workflow']);
  const count = (id: string) => (snapshot.find((m) => m.id === id)!.state as { count: number }).count;
  assert.equal(count('step.tries'), 1);
  assert.equal(count('step.denied'), 2);
  assert.equal(count('step.tokens.input'), 1200);
  assert.equal(count('step.duration'), 1);
  assert.ok(snapshot.every((m) => !('run' in (m.attributes ?? {}))));
});

test("REFUSED: a fact whose attributes carry a run's id is recorded nowhere", async () => {
  const fact: StepFact = { metric: 'check', attributes: { factory: 'nemia', step: 'work', outcome: 'passed', run: 'r-1' } };
  await assert.rejects(recorded([fact]), (err: Error) => {
    assert.match(err.message, /carries the attribute "run"/);
    return true;
  });
});

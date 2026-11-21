/**
 * A step's named checks read off their tasks on a pass: which the pass files next (`stepChecksDue`), the one phase a step judged by several
 * stands in (`checksPhase`), and the task its verdict is read off (`decidingCheckTask`). What `checksDue` decides of any plan is proved by
 * contracts/checks-due.contract.ts; these rows hold the reads around it.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { checksPhase, decidingCheckTask, stepChecksDue } from './index.ts';
import type { TaskPhase } from '../record/record.ts';
import type { StepSpec } from '../step/step.ts';
import { run } from '../../test/assessed.ts';

const CHAIN: StepSpec = {
  name: 'implement',
  after: [],
  body: '',
  checks: [
    { name: 'probe', run: 'a', after: [] },
    { name: 'own', run: 'b', after: ['probe'] },
    { name: 'ci', run: 'c', after: ['own'] },
  ],
};

const TASKS = { probe: 't-probe', own: 't-own', ci: 't-ci' };

/** The phase of each task, by its id, as `phases` gives it, `unknown` for one the engine has not filed. */
const phasesOf = (phases: Record<string, TaskPhase>) => (id: string) => phases[id] ?? 'unknown';

describe('the pass files the checks of a chain one after the other, and none after a refusal', () => {
  test('before any check is on the record, the first alone is filed', () => {
    assert.deepEqual(stepChecksDue(run({ implement: 't-1' }), CHAIN, phasesOf({})).file, ['probe']);
  });

  const rows: [string, Record<string, TaskPhase>, string[], string][] = [
    ['the first running: nothing more', { 't-probe': 'running' }, [], 'checking'],
    ['the first passed: the second', { 't-probe': 'succeeded' }, ['own'], 'checking'],
    ['the second refused: nothing more, and the step failed', { 't-probe': 'succeeded', 't-own': 'failed' }, [], 'failed'],
    ['every one passed', { 't-probe': 'succeeded', 't-own': 'succeeded', 't-ci': 'succeeded' }, [], 'passed'],
  ];
  for (const [what, phases, file, verdict] of rows)
    test(what, () => {
      const r = run({ implement: 't-1' });
      r.steps.implement = { ...r.steps.implement, check: { taskId: 't-probe', tasks: TASKS } };
      const due = stepChecksDue(r, CHAIN, phasesOf(phases));
      assert.deepEqual([due.file, due.verdict], [file, verdict]);
    });
});

describe('a step judged by several checks stands in one phase, read as one check is', () => {
  const rows: [string, Record<string, TaskPhase>, TaskPhase][] = [
    ['every one succeeded', { 't-probe': 'succeeded', 't-own': 'succeeded', 't-ci': 'succeeded' }, 'succeeded'],
    ['one still to file', { 't-probe': 'succeeded', 't-own': 'succeeded' }, 'running'],
    ['one failed', { 't-probe': 'succeeded', 't-own': 'failed' }, 'failed'],
    ['one stopped and none failed', { 't-probe': 'succeeded', 't-own': 'stopped' }, 'stopped'],
  ];
  for (const [what, phases, phase] of rows)
    test(what, () => {
      assert.equal(checksPhase({ taskId: 't-probe', tasks: TASKS }, phasesOf(phases)), phase);
    });

  test('a step with one check stands in its task’s own phase', () => {
    assert.equal(checksPhase({ taskId: 't-1' }, phasesOf({ 't-1': 'pending' })), 'pending');
  });
});

describe("the step's verdict is read off the check that says why it failed", () => {
  test('the one that failed with an exit code, before one that stopped with none', () => {
    const phases = phasesOf({ 't-probe': 'stopped', 't-own': 'failed' });
    assert.equal(
      decidingCheckTask({ taskId: 't-probe', tasks: TASKS }, phases, (id) => id === 't-own'),
      't-own',
    );
  });

  test("a refusal the step's policy hands a person, before an earlier one the run would try again", () => {
    const phases = phasesOf({ 't-probe': 'failed', 't-own': 'failed' });
    assert.equal(
      decidingCheckTask(
        { taskId: 't-probe', tasks: TASKS },
        phases,
        () => true,
        (id) => id === 't-own',
      ),
      't-own',
    );
  });

  test('every one passed: the first', () => {
    assert.equal(
      decidingCheckTask({ taskId: 't-probe', tasks: TASKS }, phasesOf({}), () => true),
      't-probe',
    );
  });
});

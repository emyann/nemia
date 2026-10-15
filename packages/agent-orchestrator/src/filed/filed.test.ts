/**
 * The step's files directory in its session's environment: every local step is filed `STEP_FILES` naming the run's artifacts folder
 * of that step, and a background step, whose process ignores its asker's environment, is filed no `env`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWorkflow, type Workflow } from '../workflow.ts';
import { filedConfig, STEP_FILES } from './filed.ts';

const stepOf = (lines = ''): Workflow => parseWorkflow('look', `---\nplace: git\n${lines}---\nLook.\n`);
const filed = (step: Workflow) =>
  filedConfig(
    step,
    [step],
    { gates: [] },
    { model: undefined, budgetUsd: undefined, runArtifacts: '/runs/r/artifacts', inbox: '/inbox', own: {}, landingDenied: () => [] },
  );

test("a step's session is filed its files directory, the run's artifacts folder of that step, as WF_STEP_FILES", () => {
  assert.equal(STEP_FILES, 'WF_STEP_FILES');
  assert.deepEqual(filed(stepOf()).env, { WF_STEP_FILES: '/runs/r/artifacts/look' });
});

test("a background step is filed no env: its session runs in a process that ignores its asker's environment", () => {
  const step = stepOf('background: true\npermissionMode: auto\n');
  assert.equal(step.background, true);
  assert.equal(Object.hasOwn(filed(step), 'env'), false);
});

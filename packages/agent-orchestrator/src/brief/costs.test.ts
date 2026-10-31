/**
 * Where a brief says what recent runs of the step's workflow cost (`composeBrief`'s `costs`, `costsSection`): among what the step is
 * handed — after what was asked for and a person's approval, before where to look — and nowhere in a brief composed without it, nor in a
 * try's that continues the last session.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Workflow } from '../step/step.ts';
import type { RepositoryRun } from '../record/record.ts';
import { costsSection, type WorkflowCosts } from '../costs/index.ts';
import { composeBrief } from './index.ts';

const step = (name: string, after: string[] = []): Workflow => ({ name, after, body: `do ${name}` });
const STEPS = [step('design'), step('implement', ['design'])];

/** A run with `design` done and approved at its gate, and `implement` not yet filed. */
const RUN: RepositoryRun = {
  id: 'r-1',
  repo: '/repo',
  workspace: '/wt',
  baseRef: 'abc123',
  branch: 'main',
  isolate: true,
  brief: 'add a flag',
  workflowDir: '/wf/build',
  createdAt: '2026-10-01T00:00:00Z',
  steps: { design: { taskId: 't1' }, implement: { taskId: null } },
  gates: ['design'],
  approvals: [{ step: 'design', try: 1, at: '2026-10-01T01:00:00.000Z', message: 'go' }],
};

const COSTS: WorkflowCosts = {
  factory: 'nemia',
  workflow: 'build',
  runs: 1,
  since: '2026-09-30',
  steps: [{ step: 'design', runs: 1, median: 4, p90: 4, tries: { median: 1, max: 1 } }],
  run: { runs: 1, median: 30, p90: 30 },
  rounds: { median: null, max: null },
};

/** `composeBrief` for `implement`, handed `costs` and, where given, a retry. */
const briefOf = (costs?: WorkflowCosts, retry?: Parameters<typeof composeBrief>[6]) =>
  composeBrief(
    STEPS[1],
    RUN,
    STEPS,
    () => undefined,
    undefined,
    undefined,
    retry,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    costs,
  );

test('the costs are said after what was asked for and its approval, and before where to look', () => {
  const brief = briefOf(COSTS);
  const asked = brief.indexOf('## What was asked for');
  const approved = brief.indexOf('## Approved');
  const costs = brief.indexOf('## What runs of this workflow cost');
  const look = brief.indexOf('## Where to look');
  assert.ok(asked >= 0 && approved > asked && costs > approved && look > costs, brief);
  assert.ok(brief.includes(`${costsSection(COSTS)}\n\n## Where to look`), brief);
});

test('a brief composed without costs says none, and is as it was', () => {
  const brief = briefOf();
  assert.equal(brief.includes('## What runs of this workflow cost'), false);
  assert.equal(brief, briefOf(COSTS).replace(`\n${costsSection(COSTS)}`, ''));
});

test("a try that continues the last session is not told the costs again: it was, on the session's first brief", () => {
  const brief = briefOf(COSTS, { try: 2, by: 'retries', mode: 'continue', resumed: true, status: 'failed' });
  assert.equal(brief.includes('## What runs of this workflow cost'), false, brief);
});

/**
 * The builders the tables of `assess` and its neighbours share: a workflow's step, a run record, the engine's phases, and the check
 * that a line names its facts. A test file may not import another (it would run its tests there), so they live here.
 */
import assert from 'node:assert/strict';
import type { RepositoryRun, Run, TaskPhase } from '../src/run.ts';
import type { Workflow } from '../src/workflow.ts';

/** A step of a workflow, waiting on `after`. */
export const step = (name: string, after: string[] = []): Workflow => ({ name, after, body: `do ${name}` });

/** `implement → review`, the workflow most rows read. */
export const STEPS = [step('implement'), step('review', ['implement'])];

/** A run record whose steps are filed as `steps` says (a task id, or `null` for not yet filed), with `rest` over it. */
export const run = (steps: Record<string, string | null>, rest: Partial<RepositoryRun> = {}): RepositoryRun => ({
  id: 'r-1',
  repo: '/repo',
  workspace: '/wt',
  baseRef: 'abc123',
  branch: 'main',
  isolate: true,
  brief: 'add a flag',
  workflowDir: '/wf',
  createdAt: '2026-01-01T00:00:00Z',
  steps: Object.fromEntries(Object.entries(steps).map(([k, v]) => [k, { taskId: v }])),
  ...rest,
});

/** The engine's phase of each task id, `unknown` for one it does not hold. */
export const phases = (m: Record<string, TaskPhase>) => (id: string) => m[id] ?? 'unknown';

/**
 * That the code said something — a refusal, a line — and that it names each of `facts`: the command, flag or field its fix names,
 * and the ids, steps and counts the behaviour turns on. Never its sentence, whose words are nobody's to check.
 */
export const namesFor = (why: string, said: string | null | undefined, ...facts: string[]): void => {
  assert.equal(typeof said, 'string', `${why}: the code said nothing`);
  for (const fact of facts) assert.ok(said!.includes(fact), `${why}: ${JSON.stringify(said)} does not name ${JSON.stringify(fact)}`);
};

/** `namesFor`, where the test's title says why. */
export const names = (said: string | null | undefined, ...facts: string[]): void => namesFor('refused', said, ...facts);

/**
 * A run whose implement is on the try after the run's one sign-off nudge, spent: what `retriesDue` leaves an unsigned step to a person
 * on.
 */
export const signedOffOnce = (r: Run): Run => ({
  ...r,
  steps: { ...r.steps, implement: { ...r.steps.implement, tries: [{ taskId: 't0', then: 'signoff' }] } },
});

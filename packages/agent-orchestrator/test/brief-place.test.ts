/**
 * A step's git words come from its run's place: six briefs of a repository run of the tests' team, composed with the shipped place's
 * words, equal what they said before the words moved, line for line (`fixtures/briefs/`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadWorkflows } from '../src/folder/folder.store.ts';
import { composeBrief, type GitRun } from '../src/run.ts';
import type { Workflow } from '../src/workflow.ts';
import type { Closeout } from '../src/closeout/closeout.ts';
import { landingWords } from '../src/place/landing.store.ts';
import { TEAM_DEV } from './team.ts';

/** Where the pinned briefs are kept, one file each. */
const PINNED = path.join(import.meta.dirname, 'fixtures', 'briefs');

const STEPS = loadWorkflows(TEAM_DEV);

/** The step `name` of the tests' team. */
const stepNamed = (name: string): Workflow => {
  const found = STEPS.find((s) => s.name === name);
  if (!found) throw new Error(`the tests' team has no step ${name}`);
  return found;
};

/** A repository run of the tests' team, implement and review filed on one branch, with `steps` over its records. */
const runOf = (steps: Partial<GitRun['steps']> = {}): GitRun => ({
  id: 'r-1',
  repo: '/repo',
  workspace: '/wt/implement',
  baseRef: 'abc123',
  branch: 'main',
  isolate: true,
  brief: 'add a flag',
  workflowDir: TEAM_DEV,
  createdAt: '2026-01-01T00:00:00Z',
  steps: {
    implement: { taskId: 't1', workspace: '/wt/implement', branch: 'wf/r-1/implement' },
    review: { taskId: 't2', workspace: '/wt/implement', branch: 'wf/r-1/implement' },
    ship: { taskId: null },
    ...steps,
  } as GitRun['steps'],
});

const REVIEWED: Closeout = { outcome: 'done', summary: 'fine', output: { again: false, findings: [] } } as unknown as Closeout;

/** The six briefs, by the name of their pinned file. */
function briefs(): Record<string, string> {
  const implement = stepNamed('implement');
  const review = stepNamed('review');
  const ship = stepNamed('ship');
  const first = runOf({ implement: { taskId: null }, review: { taskId: null } });
  const run = runOf();
  const merge = { onto: 'main', sha: 'def4567890' };
  const round = (landing?: boolean) => ({
    loop: 'review',
    round: 2,
    rounds: 3,
    by: 'merge' as const,
    resumed: false,
    merge: landing
      ? {
          ...merge,
          landing: { step: 'ship', check: 't9', command: 'npm test', unreadable: 'its task is gone' },
        }
      : merge,
  });
  const mergedRun = runOf({
    review: { taskId: 't4', workspace: '/wt/implement', branch: 'wf/r-1/implement', tries: [{ taskId: 't2', then: 'merge' }] },
  });
  return {
    'first.txt': composeBrief(implement, first, STEPS, () => undefined, '/art/implement'),
    'later.txt': composeBrief(review, run, STEPS, () => undefined, '/art/review'),
    'ending.txt': composeBrief(
      ship,
      runOf({ review: { taskId: 't2', workspace: '/wt/review', branch: 'wf/r-1/review' } }),
      STEPS,
      () => undefined,
      '/art/ship',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      landingWords(run, ship),
    ),
    'merge-textual.txt': composeBrief(implement, run, STEPS, () => undefined, '/art/implement', undefined, undefined, round()),
    'merge-semantic.txt': composeBrief(implement, run, STEPS, () => undefined, '/art/implement', undefined, undefined, round(true)),
    'merge-review.txt': composeBrief(review, mergedRun, STEPS, (name) => (name === 'review' ? REVIEWED : undefined), '/art/review'),
  };
}

test("a repository run's briefs say what they said before the place gave their git words, line for line", () => {
  const composed = briefs();
  for (const [name, brief] of Object.entries(composed))
    assert.deepEqual(`${brief}\n`.split('\n'), fs.readFileSync(path.join(PINNED, name), 'utf8').split('\n'), name);
});

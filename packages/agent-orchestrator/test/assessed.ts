/**
 * The builders the tables of `assess` and its neighbours share: a workflow's step, a run record, the engine's phases, and the check
 * that a line names its facts. A test file may not import another (it would run its tests there), so they live here.
 */
import assert from 'node:assert/strict';
import { listing as listed, type ListedPhase, type RepositoryRun, type Run, type TaskPhase } from '../src/run.ts';
import type { Workflow } from '../src/workflow.ts';
import { feedPhase, feedWords, PHASE_OF, reasonOf } from '../src/feed/index.ts';

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

/** The engine's word as the feed keeps it (`feedPhase`), as the pass hands it to the listing it words for the feed (`wordFeed`). */
const fedWord = (word: ListedPhase): ListedPhase => (word === 'running' ? word : feedPhase(word));

/**
 * `listing`, holding each row's codes to the feed's word for it: a row's `reason` is the reason `reasonOf` reads off the word the feed
 * writes of the step (`feedWords`, over the listing the pass builds with the engine's words as the feed keeps them), and its `phase` the
 * phase of that reason (`PHASE_OF`). So a reason carried where the listing judges the step means what the feed's word meant before it was
 * carried, for every row the tables of `assess` list. The listing `nemia ls` prints is what it answers.
 */
export const listing = (input: Parameters<typeof listed>[0]): ReturnType<typeof listed> => {
  const l = listed(input);
  const fed = listed({ ...input, phaseOf: (id) => fedWord(input.phaseOf(id)) });
  const words = feedWords(fed, input.run, { status: 'running' }, input.closeoutOf);
  fed.steps.forEach((row, i) => {
    const word = words.steps[i].word;
    assert.equal(
      row.reason,
      reasonOf({ word }, 'Step'),
      `${row.name}: the row's reason is the one the feed's word ${JSON.stringify(word)} names`,
    );
    assert.equal(l.steps[i].reason, row.reason, `${row.name}: the engine's live words come to the reason the feed's word does`);
    assert.equal(row.phase, PHASE_OF[row.reason], `${row.name}: its phase is its reason's`);
  });
  return l;
};

/**
 * A finished run's timeline as facts (`timelineFacts`): each row of `timelineRows` with the attributes its span carries, a step's on a
 * step's row and the run's alone on a round's and the run's, and none at all while a task of the run is in flight. Pure.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Run } from '../record/record.ts';
import type { Workflow } from '../step/step.ts';
import { timeline, timelineRows } from '../timeline/index.ts';
import { boundedAttributes, timelineFacts, type FactView } from './step.ts';

const DAY = '2026-10-06';

/** A task filed, spawned and ended at those times; still running where `ended` is null. */
const clocked = (filed: string, spawned: string, ended: string | null): FactView => ({
  state: {
    brief: 'Do it.',
    settled: ended ? 'succeeded' : null,
    filedAt: `${DAY}T${filed}:00.000Z`,
    attempts: [
      {
        startedAt: `${DAY}T${spawned}:00.000Z`,
        spawnedAt: `${DAY}T${spawned}:00.000Z`,
        endedAt: ended ? `${DAY}T${ended}:00.000Z` : null,
        reason: null,
        usage: null,
      },
    ],
  },
});

const WORK = { name: 'work', after: [], agent: { name: 'ada' }, check: 'npm test' } as unknown as Workflow;
const REVIEW = { name: 'review', after: ['work'], loop: 'work', rounds: 3 } as unknown as Workflow;
const STEPS = [WORK, REVIEW];
const RUN = {
  id: 'r-1',
  factory: 'nemia',
  workflowDir: '/w/build',
  createdAt: `${DAY}T09:59:00.000Z`,
  steps: { work: { taskId: 'work', check: { taskId: 'work-check' } }, review: { taskId: 'review' } },
} as unknown as Run;
const VIEWS = new Map([
  ['work', clocked('10:00', '10:02', '10:20')],
  ['work-check', clocked('10:20', '10:21', '10:28')],
  ['review', clocked('10:28', '10:29', '10:35')],
]);

test("each fact is a row of the run's timeline with bounded attributes: a step's on its rows, the run's alone on a round's and the run's", () => {
  const facts = timelineFacts(RUN, STEPS, VIEWS, 'succeeded');
  assert.ok(facts, 'a run with nothing in flight');
  const filed = new Map([...VIEWS].map(([id, v]) => [id, v.state.filedAt!]));
  const rows = timelineRows(RUN, timeline(RUN, VIEWS, filed, STEPS), STEPS);
  assert.deepEqual(
    facts.map((f) => [f.of, f.row, f.part, f.value, f.try ?? null]),
    rows.map((r) => [r.of, r.row, r.part, r.value, r.try]),
  );
  for (const f of facts) {
    assert.deepEqual(boundedAttributes(f.attributes), f.attributes);
    assert.equal(f.run, 'r-1');
    assert.equal('try' in f, f.of === 'try' || f.of === 'check', `${f.row}: a try only on a try's and a check's row`);
  }
  const attributesOf = (row: string) => facts.find((f) => f.row === row)?.attributes;
  assert.deepEqual(attributesOf('01 work'), { factory: 'nemia', workflow: 'build', step: 'work', agent: 'ada', outcome: 'succeeded' });
  assert.deepEqual(attributesOf('01 work check'), {
    factory: 'nemia',
    workflow: 'build',
    step: 'work',
    agent: 'ada',
    outcome: 'succeeded',
  });
  assert.deepEqual(attributesOf('02 review'), { factory: 'nemia', workflow: 'build', step: 'review', agent: 'none', outcome: 'succeeded' });
  assert.deepEqual(attributesOf('review round 01'), { factory: 'nemia', workflow: 'build', outcome: 'succeeded' });
  assert.deepEqual(attributesOf('run'), { factory: 'nemia', workflow: 'build', outcome: 'succeeded' });
  assert.equal(facts.find((f) => f.row === 'run' && f.part === 'wall')?.value, 35 * 60_000);
  assert.equal(
    timelineFacts(RUN, STEPS, VIEWS, 'cancelled')?.every((f) => f.attributes.outcome === 'cancelled'),
    true,
  );
});

test('REFUSED: with one task in flight there is no fact at all, and a run nothing was filed of has none to hand over', () => {
  const running = new Map([...VIEWS, ['review', clocked('10:28', '10:29', null)]]);
  assert.equal(timelineFacts(RUN, STEPS, running, 'succeeded'), null);
  assert.deepEqual(timelineFacts({ ...RUN, steps: {} }, STEPS, new Map(), 'cancelled'), []);
});

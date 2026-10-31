/**
 * A run's timeline as rows: each row's number is the timeline's own field, the names sort as text into the workflow's order with each
 * check under its step, and a number nobody measured is no row. Pure: no disk, no engine.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Run } from '../record/record.ts';
import type { Workflow } from '../step/step.ts';
import { timeline, type TaskClock } from './timeline.ts';
import { gateWaitOf } from './took.ts';
import { TIMELINE_OF, TIMELINE_PARTS, timelineRows, type TimelineRow } from './rows.ts';

const MIN = 60_000;

/** An instant of the fixtures' day, at `hm`. */
const at = (hm: string) => `2026-10-06T${hm}:00.000Z`;

/** A task spawned and ended at those times, settled, having cost `costUsd` where given; `ended` null for one still running. */
const task = (spawned: string, ended: string | null, costUsd?: number): TaskClock => ({
  state: {
    brief: 'Do it.',
    settled: ended ? 'succeeded' : null,
    attempts: [
      {
        startedAt: at(spawned),
        spawnedAt: at(spawned),
        endedAt: ended ? at(ended) : null,
        reason: null,
        usage: costUsd === undefined ? null : { costUsd },
      },
    ],
  },
});

const PLAN = { name: 'plan', gate: true, after: [] } as unknown as Workflow;
const BUILD = { name: 'build', after: ['plan'], check: 'npm test' } as unknown as Workflow;
const REVIEW = { name: 'review', after: ['build'], loop: 'build', rounds: 3 } as unknown as Workflow;
const STEPS = [PLAN, BUILD, REVIEW];

/** A run of `plan`, approved at its gate, then two rounds of `build`, checked, and `review`. */
const RUN = {
  id: 'r-1',
  workflowDir: '/w/build',
  createdAt: at('09:59'),
  steps: {
    plan: { taskId: 'plan' },
    build: {
      taskId: 'build-2',
      check: { taskId: 'build-2-check' },
      tries: [{ taskId: 'build-1', check: { taskId: 'build-1-check' }, cause: 'round' }],
    },
    review: { taskId: 'review-2', tries: [{ taskId: 'review-1', cause: 'round' }] },
  },
  approvals: [{ step: 'plan', try: 1, at: at('10:30') }],
} as unknown as Run;

/** Each task's filing and its view. */
const TASKS: Record<string, [string, TaskClock]> = {
  plan: ['10:00', task('10:01', '10:10', 1.5)],
  'build-1': ['10:30', task('10:32', '10:50', 4)],
  'build-1-check': ['10:50', task('10:51', '10:58')],
  'review-1': ['10:58', task('10:59', '11:05', 0.75)],
  'build-2': ['11:05', task('11:05', '11:20', 2.25)],
  'build-2-check': ['11:20', task('11:21', '11:30')],
  'review-2': ['11:30', task('11:31', '11:45')],
};
const VIEWS = new Map(Object.entries(TASKS).map(([id, [, view]]) => [id, view]));
const FILED = new Map(Object.entries(TASKS).map(([id, [filed]]) => [id, at(filed)]));

/** The value of the one row `rows` holds of `row`, `part` and `try`; undefined where it holds none. */
const valueOf = (rows: readonly TimelineRow[], row: string, part: TimelineRow['part'], tryNo: number | null = null) => {
  const found = rows.filter((r) => r.row === row && r.part === part && r.try === tryNo);
  assert.ok(found.length <= 1, `${row} ${part} ${tryNo}: ${found.length} rows`);
  return found[0]?.value;
};

test("each row's number is the timeline's own field: a try's, its check's, a step's tries, a round's wall and the run's", () => {
  const tl = timeline(RUN, VIEWS, FILED, STEPS);
  const rows = timelineRows(RUN, tl, STEPS);
  for (const r of rows) {
    assert.ok(TIMELINE_OF.includes(r.of), r.of);
    assert.ok(TIMELINE_PARTS.includes(r.part), r.part);
  }
  for (const [i, step] of STEPS.entries()) {
    const label = `0${i + 1} ${step.name}`;
    for (const t of tl.steps[step.name]) {
      assert.equal(valueOf(rows, label, 'queued', t.try), t.session!.queuedMs!, `${label} queued`);
      assert.equal(valueOf(rows, label, 'ran', t.try), t.session!.ranMs!, `${label} ran`);
      assert.equal(valueOf(rows, label, 'cost', t.try), t.used?.costUsd, `${label} cost`);
      assert.equal(valueOf(rows, `${label} check`, 'queued', t.try), t.check?.queuedMs ?? undefined, `${label} check queued`);
      assert.equal(valueOf(rows, `${label} check`, 'ran', t.try), t.check?.ranMs ?? undefined, `${label} check ran`);
    }
    assert.equal(valueOf(rows, label, 'tries'), tl.steps[step.name].length);
  }
  assert.deepEqual(
    [valueOf(rows, '02 build', 'queued', 1), valueOf(rows, '02 build', 'ran', 1), valueOf(rows, '02 build', 'cost', 1)],
    [2 * MIN, 18 * MIN, 4],
  );
  assert.equal(valueOf(rows, '02 build check', 'ran', 2), 9 * MIN);
  assert.equal(valueOf(rows, '03 review', 'cost', 2), undefined, 'a session that measured no cost has no cost row');
  assert.equal(valueOf(rows, '02 build', 'tries'), 2);
  assert.deepEqual(
    rows.filter((r) => r.of === 'round').map((r) => [r.row, r.part, r.value]),
    tl.rounds.map((r) => [`review round 0${r.round}`, 'wall', r.wallMs]),
  );
  assert.deepEqual(
    rows.filter((r) => r.of === 'round').map((r) => r.value),
    [35 * MIN, 40 * MIN],
  );
  const checks = rows.filter((r) => r.of === 'check' && r.part === 'ran').reduce((ms, r) => ms + r.value, 0);
  assert.deepEqual(
    rows.filter((r) => r.of === 'run').map((r) => [r.part, r.value]),
    [
      ['wall', tl.run.wallMs],
      ['queued', tl.run.queuedMs],
      ['check', checks],
      ['gate', gateWaitOf(RUN, tl, PLAN, tl.steps.plan[0])],
      ['answer', 0],
    ],
  );
  assert.deepEqual(
    [valueOf(rows, 'run', 'wall'), valueOf(rows, 'run', 'check'), valueOf(rows, 'run', 'gate')],
    [105 * MIN, 16 * MIN, 20 * MIN],
  );
  assert.deepEqual(
    rows.filter((r) => r.of === 'round' || r.of === 'run').map((r) => [r.step, r.try]),
    Array.from({ length: 7 }, () => [null, null]),
    "a round's and the run's rows are of no step and no try",
  );
});

test("the rows' names, sorted as text, are the workflow's order with each check under its step", () => {
  const names = ['k', 'j', 'i', 'h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'];
  const steps = names.map((name, i) => ({ name, after: i ? [names[i - 1]] : [], check: 'npm test' }) as unknown as Workflow);
  const run = {
    id: 'r-2',
    workflowDir: '/w/long',
    createdAt: at('09:59'),
    steps: Object.fromEntries(names.map((name) => [name, { taskId: name, check: { taskId: `${name}-check` } }])),
  } as unknown as Run;
  const views = new Map(names.flatMap((name) => [name, `${name}-check`]).map((id) => [id, task('10:01', '10:02')]));
  const filed = new Map([...views.keys()].map((id) => [id, at('10:00')]));
  const rows = timelineRows(run, timeline(run, views, filed, steps), steps).filter((r) => r.of !== 'run');
  const sorted = [...new Set(rows.map((r) => r.row))].sort();
  assert.deepEqual(
    sorted,
    names.flatMap((name, i) => [`${String(i + 1).padStart(2, '0')} ${name}`, `${String(i + 1).padStart(2, '0')} ${name} check`]),
  );
  assert.deepEqual(sorted.slice(0, 2), ['01 k', '01 k check']);
  assert.deepEqual(sorted.slice(-2), ['11 a', '11 a check']);
});

test('REFUSED: a session still running gives no ran row and no 0, and a run whose wall is not known gives no run row at all', () => {
  const views = new Map([...VIEWS, ['review-2', task('11:31', null)]]);
  const tl = timeline(RUN, views, FILED, STEPS);
  assert.equal(tl.steps.review[1].session!.ranMs, null);
  assert.equal(tl.run.wallMs, null);
  const rows = timelineRows(RUN, tl, STEPS);
  assert.equal(valueOf(rows, '03 review', 'ran', 2), undefined);
  assert.equal(valueOf(rows, '03 review', 'queued', 2), MIN, 'what was measured of it is still a row');
  assert.deepEqual(
    rows.filter((r) => r.of === 'run'),
    [],
  );
  assert.deepEqual(
    rows.filter((r) => r.of === 'round').map((r) => r.row),
    ['review round 01'],
    'the round in flight has no wall yet',
  );
  assert.equal(
    rows.some((r) => r.value === 0 && r.part === 'ran'),
    false,
  );
});

test('a run that never left its first step has rows for that step alone, and none for a step not filed', () => {
  const run = { ...RUN, steps: { plan: { taskId: 'plan' } }, approvals: [] } as unknown as Run;
  const rows = timelineRows(run, timeline(run, VIEWS, FILED, STEPS), STEPS);
  assert.deepEqual([...new Set(rows.map((r) => r.row))], ['01 plan', 'run']);
  assert.equal(valueOf(rows, 'run', 'gate'), 0, 'no approval, no time at a gate');
  assert.equal(valueOf(rows, 'run', 'check'), 0, 'no check, no time in one');
  assert.equal(valueOf(rows, 'run', 'answer'), 0, 'no answer, no time waiting on one');
});

/** A gated step held open on one task: blocked at 10:05, answered into a turn from 10:11 to 10:20, and try 2 approved at 10:29. */
const ASK = { name: 'ask', gate: true, after: [] } as unknown as Workflow;
const ANSWERED = {
  id: 'r-3',
  workflowDir: '/w/intake',
  createdAt: at('09:59'),
  steps: { ask: { taskId: 'ask', tries: [{ taskId: 'ask', cause: 'continue' }] } },
  approvals: [{ step: 'ask', try: 2, at: at('10:29') }],
} as unknown as Run;
const turn = (n: number, spawned: string, ended: string, outcome = 'done') => ({
  startedAt: at(spawned),
  spawnedAt: at(spawned),
  endedAt: at(ended),
  reason: null,
  usage: { costUsd: n ? 1 : 3 },
  ended: 'succeeded' as const,
  turn: n,
  closeout: { outcome, summary: 'said', artifacts: [], needs: outcome === 'blocked' ? 'which flag?' : null },
});
const HELD: TaskClock = {
  phase: 'input-required',
  state: { brief: 'Do it.', settled: null, attempts: [turn(0, '10:01', '10:05', 'blocked'), turn(1, '10:11', '10:20')] },
};

test("a run answered then approved: its wait on the answer and its wait at the gate are two parts, and its session's rows are one", () => {
  const tl = timeline(ANSWERED, new Map([['ask', HELD]]), new Map([['ask', at('10:00')]]), [ASK]);
  const rows = timelineRows(ANSWERED, tl, [ASK]);
  assert.deepEqual(
    rows.map((r) => [r.of, r.try, r.part, r.value]),
    [
      ['try', 1, 'queued', MIN],
      ['try', 1, 'ran', 13 * MIN],
      ['try', 1, 'cost', 4],
      ['step', null, 'tries', 2],
      ['run', null, 'wall', 20 * MIN],
      ['run', null, 'queued', MIN],
      ['run', null, 'check', 0],
      ['run', null, 'gate', 9 * MIN],
      ['run', null, 'answer', 6 * MIN],
    ],
  );
  const run = (part: TimelineRow['part']) => valueOf(rows, 'run', part);
  assert.equal(valueOf(rows, '01 ask', 'ran', 1) + run('queued') + run('answer'), run('wall'), 'what ran, queued and waited is the wall');
  const signedDone: TaskClock = { ...HELD, state: { ...HELD.state, attempts: [turn(0, '10:01', '10:05'), turn(1, '10:11', '10:20')] } };
  const back = timelineRows(ANSWERED, timeline(ANSWERED, new Map([['ask', signedDone]]), new Map([['ask', at('10:00')]]), [ASK]), [ASK]);
  assert.equal(valueOf(back, 'run', 'answer'), 0, 'REFUSED: the same record after a done sign-off is work sent back from its gate');
  assert.equal(valueOf(back, 'run', 'gate'), 9 * MIN);
});

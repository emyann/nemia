/**
 * A run's clock (`clockOf`): its wall time in five parts that add up to it, each instant in the first part that covers it. Pure: a
 * hand-built record, the views of its tasks and their filing times, and each part pinned to the value worked out by hand, since parts made
 * by subtraction add up whatever they hold.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RepositoryRun } from '../record/record.ts';
import type { Workflow } from '../step/step.ts';
import { clockOf, waitingSinceOf, type RunClock } from './clock.ts';
import type { AttemptClock, TaskClock } from './timeline.ts';

const MIN = 60_000;

/** An instant `h` hours and `m` minutes into the fixtures' day. */
const at = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 4, h, m)).toISOString();

/** A task that spawned at `from` and ended at `to`, settled; still running, and not settled, where `to` is null. */
const ran = (from: string, to: string | null, more: Partial<AttemptClock> = {}): TaskClock => ({
  state: {
    brief: 'filed',
    settled: to ? 'succeeded' : null,
    attempts: [{ startedAt: from, spawnedAt: from, endedAt: to, reason: to ? 'harness' : null, usage: null, ...more }],
  },
});

/** A task filed and given no attempt yet: waiting for a slot. */
const QUEUED: TaskClock = { state: { brief: 'filed', settled: null, attempts: [] } };

const STEPS = [
  { name: 'plan', after: [], body: '', gate: true },
  { name: 'side', after: [], body: '' },
  { name: 'build', after: ['plan'], body: '' },
] as unknown as Workflow[];

/**
 * A run created at 10:00 that waited on another run until 10:10, then for a run slot until its first filing at 10:20. `plan`, gated,
 * ran 10:22 → 10:40 and its check 10:41 → 10:45; `side`, filed beside it, waited for a slot until 10:50 and ran until 11:10.
 */
const run = (more: Partial<RepositoryRun> = {}): RepositoryRun => ({
  id: 'r-1',
  repo: '/repo',
  workspace: '/wt',
  baseRef: 'abc123',
  branch: 'main',
  isolate: true,
  brief: 'add a flag',
  workflowDir: '/wf',
  workflow: STEPS,
  createdAt: at(10),
  after: ['r-0'],
  slotHeldAt: at(10, 10),
  steps: { plan: { taskId: 'p', check: { taskId: 'pc' } }, side: { taskId: 's' }, build: { taskId: null } },
  ...more,
});

const VIEWS = new Map<string, TaskClock>([
  ['p', ran(at(10, 22), at(10, 40))],
  ['pc', ran(at(10, 41), at(10, 45))],
  ['s', ran(at(10, 50), at(11, 10))],
]);

const FILED = new Map([
  ['p', at(10, 20)],
  ['pc', at(10, 40)],
  ['s', at(10, 20)],
  ['b', at(11, 40)],
]);

/** The plan approved at 11:30, held until 11:40, and `build` filed then: its record, and the view of its task. */
const approved = (build: TaskClock) => ({
  run: run({
    approvals: [{ step: 'plan', try: 1, at: at(11, 30) }],
    hold: { until: ['r-9'], at: at(11, 30) },
    steps: { plan: { taskId: 'p', check: { taskId: 'pc' } }, side: { taskId: 's' }, build: { taskId: 'b' } },
  }),
  views: new Map([...VIEWS, ['b', build]]),
});

const UNTIL = Date.parse(at(12));

/** The five parts of a clock, added up. */
const partsOf = (c: RunClock) => c.sessionsMs + c.checksMs + c.personMs + c.slotMs + c.restMs;

test("a clock's parts add up to its wall, each instant in the first part that covers it, on a run with a gate, a queue, a hold and a wait on a run", () => {
  const { run: r, views } = approved(ran(at(11, 42), null));
  const clock = clockOf(r, views, FILED, STEPS, [], UNTIL);
  assert.deepEqual(clock, {
    wallMs: 120 * MIN,
    sessionsMs: 56 * MIN,
    checksMs: 4 * MIN,
    personMs: 25 * MIN,
    slotMs: 15 * MIN,
    restMs: 20 * MIN,
  });
  assert.equal(partsOf(clock), clock.wallMs);
  const summed = (18 + 20 + 18 + 4 + 45 + 10 + 2 + 1 + 30 + 2) * MIN;
  assert.notEqual(summed + clock.restMs, clock.wallMs, 'the durations summed count the overlaps twice: more than the wall');
});

test('a wait still open on a person runs to the instant the clock is read at; with no step waiting, the same time is the rest', () => {
  const open = clockOf(run(), VIEWS, FILED, STEPS, ['plan'], UNTIL);
  assert.deepEqual(open, {
    wallMs: 120 * MIN,
    sessionsMs: 38 * MIN,
    checksMs: 4 * MIN,
    personMs: 55 * MIN,
    slotMs: 13 * MIN,
    restMs: 10 * MIN,
  });
  const nobody = clockOf(run(), VIEWS, FILED, STEPS, [], UNTIL);
  assert.equal(nobody.personMs, 0);
  assert.equal(nobody.slotMs, 18 * MIN, 'the slot wait of side, 10:45 → 10:50, is no longer under a wait on a person');
  assert.equal(nobody.restMs, 60 * MIN);
  assert.equal(partsOf(nobody), nobody.wallMs);
});

test('a task filed and not spawned waits for a slot until the clock is read; one whose filing is not known waits for none', () => {
  const { run: r, views } = approved(QUEUED);
  const clock = clockOf(r, views, FILED, STEPS, [], UNTIL);
  assert.deepEqual(clock, {
    wallMs: 120 * MIN,
    sessionsMs: 38 * MIN,
    checksMs: 4 * MIN,
    personMs: 25 * MIN,
    slotMs: 33 * MIN,
    restMs: 20 * MIN,
  });
  const unfiled = clockOf(r, views, new Map([...FILED].filter(([id]) => id !== 'b')), STEPS, [], UNTIL);
  assert.equal(unfiled.slotMs, 13 * MIN);
  assert.equal(unfiled.restMs, 40 * MIN);
});

test('a step held at its gate before it is filed waits on a person from the end of the steps it comes after', () => {
  const clock = clockOf(run(), VIEWS, FILED, STEPS, ['build'], UNTIL);
  assert.equal(clock.personMs, 55 * MIN, 'from the end of the check of plan, 10:45, less the session that ran meanwhile');
});

test('a blocked sign-off waits on a person until the turn that answers it spawns', () => {
  const BLOCKED = { outcome: 'blocked', summary: 'two flags could be meant', artifacts: [], needs: 'which flag?' };
  const asked: RepositoryRun = {
    ...run({ after: undefined, slotHeldAt: undefined }),
    steps: { side: { taskId: 'c', tries: [{ taskId: 'c', cause: 'nudge' }] as RepositoryRun['steps'][string]['tries'] } },
  };
  const view: TaskClock = {
    state: {
      brief: 'filed',
      settled: 'succeeded',
      attempts: [
        {
          startedAt: at(10),
          spawnedAt: at(10),
          endedAt: at(10, 5),
          reason: 'harness',
          usage: null,
          ended: 'succeeded',
          turn: 0,
          closeout: BLOCKED,
        },
        { startedAt: at(10, 30), spawnedAt: at(10, 30), endedAt: at(10, 40), reason: 'harness', usage: null, ended: 'succeeded', turn: 1 },
      ],
    },
  };
  const clock = clockOf(asked, new Map([['c', view]]), new Map([['c', at(10)]]), STEPS, [], Date.parse(at(11)));
  assert.deepEqual(clock, { wallMs: 60 * MIN, sessionsMs: 15 * MIN, checksMs: 0, personMs: 25 * MIN, slotMs: 0, restMs: 20 * MIN });
});

test('a clock read before the run was created is empty, never negative', () => {
  assert.deepEqual(clockOf(run(), VIEWS, FILED, STEPS, ['plan'], Date.parse(at(9))), {
    wallMs: 0,
    sessionsMs: 0,
    checksMs: 0,
    personMs: 0,
    slotMs: 0,
    restMs: 0,
  });
});

test('a run at its second gate has waited since the second gate was reached, while its clock sums both waits', () => {
  const { run: r, views } = approved(ran(at(11, 42), at(11, 50)));
  assert.equal(waitingSinceOf(r, views, FILED, STEPS, ['build'], null), at(11, 50));
  assert.equal(clockOf(r, views, FILED, STEPS, ['build'], UNTIL).personMs, 35 * MIN, '25 at the first gate, 10 open at the second');
});

test('a step held at its gate before it is filed has waited since the end of the steps it comes after', () => {
  assert.equal(waitingSinceOf(run(), VIEWS, FILED, STEPS, ['build'], null), at(10, 45));
});

test('with several waits open, the present wait began at the earliest, in whichever order they are named', () => {
  assert.equal(waitingSinceOf(run(), VIEWS, FILED, STEPS, ['plan', 'side'], null), at(10, 45));
  assert.equal(waitingSinceOf(run(), VIEWS, FILED, STEPS, ['side', 'plan'], null), at(10, 45));
});

test('a hold only a person lifts dates the wait from its placing, and an earlier step that waits dates it before', () => {
  assert.equal(waitingSinceOf(run(), VIEWS, FILED, STEPS, [], at(11, 30)), at(11, 30));
  assert.equal(waitingSinceOf(run(), VIEWS, FILED, STEPS, ['side'], at(11, 30)), at(11, 10));
});

test('a wait the record does not date began at no instant: nothing waits, or the waiting step has no try that ended', () => {
  assert.equal(waitingSinceOf(run(), VIEWS, FILED, STEPS, [], null), null);
  assert.equal(waitingSinceOf(run(), new Map(), FILED, STEPS, ['side'], null), null);
});

/**
 * What `assess` makes of a workflow that routes: a condition answered by its table off its producer's signed closeout, the nodes on the
 * route not taken read `skipped` and file nothing, a join files after the parents that ran, a route in `ends:` ends the run, a workflow
 * node is due its card (`send`), and a run succeeds when every node is satisfied, sent or skipped. With the words each step reads
 * (`runWords`), what a try may be (`retryable`) and where a join is cut (`ranShape`). A workflow without the routing keys assesses as it
 * always did. Pure: the engine's view of each task is handed in.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assess } from '../src/tick/assess.ts';
import { runWords } from '../src/routed/routed-words.ts';
import { retryable } from '../src/retry/retry.ts';
import { ranShape } from '../src/workspace/worktree.store.ts';
import { workspacePlan } from '../src/workspace/workspace.ts';
import type { Closeout } from '../src/closeout/closeout.ts';
import type { Run, StepRecord, TaskPhase } from '../src/record/record.ts';
import type { Workflow } from '../src/step/step.ts';
import { phases, run, step, STEPS } from './assessed.ts';

const PLAN_SCHEMA = {
  type: 'object' as const,
  properties: { surface: { type: 'string', enum: ['web', 'backend', 'docs'] } },
  required: ['surface'],
  additionalProperties: false as const,
};

/** plan → triage (a table over plan's surface; docs ends the run) → build-web | build-backend, and log on every route → notes. */
const TRIAGE: Workflow[] = [
  { ...step('plan'), output: { file: 'plan.schema.json', schema: PLAN_SCHEMA } },
  {
    ...step('triage', ['plan']),
    input: ['plan'],
    routes: ['web', 'backend', 'docs'],
    route: { kind: 'table', from: 'plan.surface', table: { web: 'web', backend: 'backend', docs: 'docs' } },
    ends: ['docs'],
  },
  { ...step('build-web', ['triage']), when: ['web'] },
  { ...step('build-backend', ['triage']), when: ['backend'] },
  step('log', ['triage']),
  step('notes', ['build-web', 'build-backend', 'log']),
];

/** The world of one pass: which steps are filed, the engine's phase of each task, and plan's surface. */
type Pass = { filed?: Record<string, TaskPhase>; surface?: string; steps?: Workflow[]; records?: Record<string, Partial<StepRecord>> };

const NAMES = ['plan', 'triage', 'build-web', 'build-backend', 'log', 'notes'];

const passOf = ({ filed = {}, surface = 'web', steps = TRIAGE, records = {} }: Pass) => {
  const r: Run = run(Object.fromEntries(NAMES.map((n) => [n, n in filed ? `t-${n}` : null])));
  for (const [name, extra] of Object.entries(records)) r.steps[name] = { taskId: r.steps[name]?.taskId ?? null, ...extra };
  const phaseOf = phases(Object.fromEntries(Object.entries(filed).map(([n, p]) => [`t-${n}`, p])));
  const said = (name: string): Closeout | undefined =>
    filed[name] === 'succeeded'
      ? { outcome: 'done', summary: `did ${name}`, artifacts: [], ...(name === 'plan' ? { output: { surface } } : {}) }
      : undefined;
  const asked = () => true;
  return {
    run: r,
    a: assess(steps, r, phaseOf, said, asked),
    words: Object.fromEntries(runWords(steps, r, phaseOf, said, asked)),
    retryOf: (name: string) => {
      const s = steps.find((x) => x.name === name);
      assert.ok(s);
      return retryable(s, r, phaseOf, said, asked, steps);
    },
  };
};

test('route web: the backend branch is skipped, the join files after what ran, and the run succeeds', async (t) => {
  await t.test('plan signed web: triage answers web unfiled, build-web and log are filed, build-backend skipped', () => {
    const { a, words } = passOf({ filed: { plan: 'succeeded' } });
    assert.deepEqual(a.ready, ['build-web', 'log'], 'a table condition is never filed as a task');
    assert.equal(words.triage, 'unverified');
    assert.equal(words['build-backend'], 'skipped');
    assert.equal(a.status, 'running');
  });
  await t.test('the join waits while a parent runs', () => {
    const { a, words } = passOf({ filed: { plan: 'succeeded', 'build-web': 'running', log: 'succeeded' } });
    assert.deepEqual(a.ready, []);
    assert.equal(words.notes, 'pending');
  });
  await t.test('both parents that ran signed: the join is filed, after them alone', () => {
    const { a, run } = passOf({ filed: { plan: 'succeeded', 'build-web': 'succeeded', log: 'succeeded' } });
    assert.deepEqual(a.ready, ['notes']);
    const notes = TRIAGE.find((s) => s.name === 'notes');
    assert.ok(notes);
    run.steps['build-web'] = { taskId: 't-build-web', workspace: '/wt/build-web', branch: 'wf/r-1/build-web' };
    run.steps.log = { taskId: 't-log', workspace: '/wt/log', branch: 'wf/r-1/log' };
    const shaped = ranShape(run, TRIAGE, notes);
    assert.deepEqual(shaped.step.after, ['build-web', 'log'], 'the skipped build-backend is no line of work to merge');
    assert.deepEqual(workspacePlan(shaped.steps, shaped.step), { kind: 'merge', from: 'build-web', also: ['log'] });
  });
  await t.test('every node satisfied or skipped: the run succeeds', () => {
    const { a, words } = passOf({ filed: { plan: 'succeeded', 'build-web': 'succeeded', log: 'succeeded', notes: 'succeeded' } });
    assert.equal(words['build-backend'], 'skipped');
    assert.equal(a.status, 'succeeded');
  });
});

test('a step after a condition is cut from the condition’s first parent, and a join after one parent that ran forks from it', () => {
  const r = run({ plan: 't-plan', triage: null, 'build-web': 't-web', 'build-backend': null, log: null, notes: null });
  const web = TRIAGE.find((s) => s.name === 'build-web');
  const notes = TRIAGE.find((s) => s.name === 'notes');
  assert.ok(web && notes);
  assert.deepEqual(ranShape(r, TRIAGE, web).step.after, ['plan'], "the condition's workspace is its first parent's");
  const shaped = ranShape(r, TRIAGE, notes);
  assert.deepEqual(shaped.step.after, ['build-web']);
  assert.notEqual(workspacePlan(shaped.steps, shaped.step).kind, 'merge');
});

test('a route in ends: skips everything after the condition, and the run succeeds', () => {
  const { a, words } = passOf({ filed: { plan: 'succeeded' }, surface: 'docs' });
  assert.deepEqual(a.ready, []);
  assert.deepEqual(
    ['build-web', 'build-backend', 'log', 'notes'].map((n) => words[n]),
    ['skipped', 'skipped', 'skipped', 'skipped'],
  );
  assert.equal(a.status, 'succeeded');
});

test('a stopped parent on the route taken leaves the join unreachable, and the run failed', () => {
  const { a } = passOf({ filed: { plan: 'succeeded', 'build-web': 'stopped', log: 'succeeded' } });
  assert.deepEqual(a.unreachable, ['notes']);
  assert.equal(a.status, 'failed');
});

test("a person's route wins over the table's", () => {
  const { a, words } = passOf({ filed: { plan: 'succeeded' }, records: { triage: { route: { route: 'backend', try: 1, by: 'person' } } } });
  assert.deepEqual(a.ready, ['build-backend', 'log']);
  assert.equal(words['build-web'], 'skipped');
});

test('a table with no row for what its producer said reads unsigned, and nothing after it runs', () => {
  const { a, words } = passOf({ filed: { plan: 'succeeded' }, surface: 'mobile' });
  assert.equal(words.triage, 'unsigned');
  assert.deepEqual(a.ready, []);
  assert.equal(a.status, 'waiting');
});

test('a gated condition holds its answered route for a person, and files on the approval', () => {
  const gated = TRIAGE.map((s) => (s.name === 'triage' ? { ...s, gate: true as const } : s));
  const held = passOf({ filed: { plan: 'succeeded' }, steps: gated });
  assert.equal(held.words.triage, 'awaiting approval');
  assert.deepEqual(held.a.ready, []);
  assert.equal(held.a.status, 'awaiting approval');
  held.run.approvals = [{ step: 'triage', try: 1, at: '2026-01-01T00:00:00Z' }];
  const approved = assess(gated, held.run, phases({ 't-plan': 'succeeded' }), (n) =>
    n === 'plan' ? { outcome: 'done', summary: 's', artifacts: [], output: { surface: 'web' } } : undefined,
  );
  assert.deepEqual(approved.ready, ['build-web', 'log']);
});

test('a workflow node on the route taken is due its card, then reads sent and satisfies what follows', () => {
  const routed = TRIAGE.map((s) => (s.name === 'build-backend' ? { ...s, workflow: 'build' } : s));
  const due = passOf({ filed: { plan: 'succeeded', log: 'succeeded' }, surface: 'backend', steps: routed });
  assert.deepEqual(due.a.send, ['build-backend']);
  assert.deepEqual(due.a.ready, [], 'a workflow node is sent, never filed as a session');
  const sent = passOf({
    filed: { plan: 'succeeded', log: 'succeeded' },
    surface: 'backend',
    steps: routed,
    records: { 'build-backend': { sent: { card: 'r-1-build-backend', at: '2026-01-01T00:00:00Z' } } },
  });
  assert.equal(sent.words['build-backend'], 'sent');
  assert.deepEqual(sent.a.send, []);
  assert.deepEqual(sent.a.ready, ['notes']);
});

test('a condition is tried only while none of its followers is filed; a skipped node never', () => {
  const judged = TRIAGE.map((s) => (s.name === 'triage' ? { ...s, route: { kind: 'judge' as const } } : s));
  const before = passOf({ filed: { plan: 'succeeded', triage: 'failed' }, steps: judged });
  assert.deepEqual(before.retryOf('triage').modes, ['continue', 'fresh']);
  const after = passOf({ filed: { plan: 'succeeded', triage: 'failed', log: 'running' }, steps: judged });
  assert.deepEqual(after.retryOf('triage').modes, [], 'a follower filed settles the route');
  const skipped = passOf({ filed: { plan: 'succeeded' } });
  assert.deepEqual(skipped.retryOf('build-backend').modes, []);
});

test('a workflow without the routing keys assesses exactly as before', () => {
  const r = run({ implement: 't-i', review: null });
  const a = assess(STEPS, r, phases({ 't-i': 'succeeded' }));
  assert.deepEqual(a, {
    ready: ['review'],
    send: [],
    check: [],
    retry: [],
    round: [],
    unreachable: [],
    waitingOnCheckout: [],
    status: 'running',
  });
  const done = assess(STEPS, run({ implement: 't-i', review: 't-r' }), phases({ 't-i': 'succeeded', 't-r': 'succeeded' }));
  assert.equal(done.status, 'succeeded');
  const broke = assess(STEPS, run({ implement: 't-i', review: null }), phases({ 't-i': 'failed' }));
  assert.deepEqual([broke.unreachable, broke.status], [['review'], 'failed']);
});

/**
 * `assess` is the whole controller, and it is pure: hand it the engine's view of each task and it
 * decides. No disk, no engine, no clock.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assess, composeBrief, workspacePlan, type Run, type TaskPhase } from '../src/run.ts';
import type { Workflow } from '../src/workflow.ts';

const step = (name: string, after: string[] = []): Workflow => ({ name, after, body: `do ${name}` });
const STEPS = [step('implement'), step('review', ['implement'])];

const run = (steps: Record<string, string | null>): Run => ({
  id: 'r-1', repo: '/repo', workspace: '/wt', baseRef: 'abc123', branch: 'main', isolate: true,
  brief: 'add a flag', workflowDir: '/wf', createdAt: '2026-01-01T00:00:00Z',
  steps: Object.fromEntries(Object.entries(steps).map(([k, v]) => [k, { taskId: v }])),
});

const phases = (m: Record<string, TaskPhase>) => (id: string) => m[id] ?? 'unknown';

test('a fresh run files only the step with nothing in front of it', () => {
  const a = assess(STEPS, run({ implement: null, review: null }), phases({}));
  assert.deepEqual(a.ready, ['implement']);
  assert.equal(a.status, 'running');
});

test('the next step waits while the first one runs', () => {
  const a = assess(STEPS, run({ implement: 't1', review: null }), phases({ t1: 'running' }));
  assert.deepEqual(a.ready, []);
  assert.equal(a.status, 'running');
});

test('the next step is filed when the first SUCCEEDS — not merely when it ends', () => {
  const a = assess(STEPS, run({ implement: 't1', review: null }), phases({ t1: 'succeeded' }));
  assert.deepEqual(a.ready, ['review']);
});

test('a failed step blocks what waits on it, and says so rather than hanging', () => {
  const a = assess(STEPS, run({ implement: 't1', review: null }), phases({ t1: 'failed' }));
  assert.deepEqual(a.ready, []);
  assert.deepEqual(a.blocked, ['review']);
  assert.equal(a.status, 'failed');
});

test('a stopped step blocks too — an operator stop is final, not a pause', () => {
  const a = assess(STEPS, run({ implement: 't1', review: null }), phases({ t1: 'stopped' }));
  assert.deepEqual(a.blocked, ['review']);
  assert.equal(a.status, 'failed');
});

test('a run is finished when every step has succeeded', () => {
  const a = assess(STEPS, run({ implement: 't1', review: 't2' }), phases({ t1: 'succeeded', t2: 'succeeded' }));
  assert.deepEqual(a.ready, []);
  assert.equal(a.status, 'succeeded');
});

test('independent steps are filed together — this is a DAG, not a queue', () => {
  const fan = [step('a'), step('b'), step('merge', ['a', 'b'])];
  const first = assess(fan, run({ a: null, b: null, merge: null }), phases({}));
  assert.deepEqual(first.ready.sort(), ['a', 'b']);

  const half = assess(fan, run({ a: 't1', b: 't2', merge: null }), phases({ t1: 'succeeded', t2: 'running' }));
  assert.deepEqual(half.ready, [], 'merge waits for BOTH');

  const done = assess(fan, run({ a: 't1', b: 't2', merge: null }), phases({ t1: 'succeeded', t2: 'succeeded' }));
  assert.deepEqual(done.ready, ['merge']);
});

test('assessing twice in a row says the same thing — it is level-triggered', () => {
  const r = run({ implement: 't1', review: null });
  const p = phases({ t1: 'succeeded' });
  assert.deepEqual(assess(STEPS, r, p), assess(STEPS, r, p));
});

// ─── what one step knows of another ─────────────────────────────────────────

test('a step is told its own prose and the original request', () => {
  const brief = composeBrief(step('implement'), run({ implement: null }), STEPS);
  assert.match(brief, /do implement/);
  assert.match(brief, /add a flag/, 'the spec travels to every step');
});

test('a later step is pointed at the workspace and the base ref, not at a transcript', () => {
  const brief = composeBrief(step('review', ['implement']), run({ implement: 't1', review: null }), STEPS);
  assert.match(brief, /git diff abc123/, 'it is told how to see what changed');
  assert.match(brief, /implement/, 'and who was here before it');
  assert.match(brief, /not an account of it/, 'and that it is judging the change, not a claim');
});

test('the first step is told nothing about a workspace nobody has touched', () => {
  const brief = composeBrief(step('implement'), run({ implement: null, review: null }), STEPS);
  assert.doesNotMatch(brief, /Where to look/);
});

test('a resumed step is told only its own prose — it already has the context', () => {
  const respond: Workflow = { name: 'respond', after: ['implement'], body: 'answer the review', resume: 'implement' };
  const brief = composeBrief(respond, run({ implement: 't1', respond: null }), [step('implement'), respond]);
  assert.equal(brief, 'answer the review');
  assert.doesNotMatch(brief, /What was asked for/, 'it was there when the request came in');
});

// ─── where a step works ─────────────────────────────────────────────────────

test('a sequential chain stays in one workspace — the line of work continues', () => {
  const chain = [step('implement'), step('review', ['implement']), step('respond', ['review'])];
  assert.deepEqual(workspacePlan(chain, chain[0]!), { kind: 'fork', from: null });
  assert.deepEqual(workspacePlan(chain, chain[1]!), { kind: 'inherit', from: 'implement' });
  assert.deepEqual(workspacePlan(chain, chain[2]!), { kind: 'inherit', from: 'review' });
});

test('SIBLINGS FORK — two concurrent steps never share a directory', () => {
  // The bug this prevents: N agents editing one worktree at the same time.
  const fan = [step('split'), step('a', ['split']), step('b', ['split']), step('c', ['split'])];
  for (const name of ['a', 'b', 'c']) {
    assert.deepEqual(workspacePlan(fan, fan.find((s) => s.name === name)!), { kind: 'fork', from: 'split' });
  }
});

test('a fan-in MERGES its predecessors — `after: a, b` means "and give me both"', () => {
  const fan = [step('a'), step('b'), step('c'), step('merge', ['a', 'b', 'c'])];
  assert.deepEqual(workspacePlan(fan, fan[3]!), { kind: 'merge', from: 'a', also: ['b', 'c'] });
});

test('the merge base is deterministic, whatever order `after` was written in', () => {
  const one = workspacePlan([step('x', ['b', 'a'])], step('x', ['b', 'a']));
  const two = workspacePlan([step('x', ['a', 'b'])], step('x', ['a', 'b']));
  assert.deepEqual(one, two);
});

test('several roots each fork from the base — a run may start wide', () => {
  const wide = [step('a'), step('b')];
  assert.deepEqual(workspacePlan(wide, wide[0]!), { kind: 'fork', from: null });
  assert.deepEqual(workspacePlan(wide, wide[1]!), { kind: 'fork', from: null });
});

test('a fan-in step is told it is holding merged work, and that conflicts are its job', () => {
  const merge: Workflow = { name: 'integrate', after: ['a', 'b'], body: 'combine them' };
  const brief = composeBrief(merge, run({ a: 't1', b: 't2', integrate: null }), [step('a'), step('b'), merge]);
  assert.match(brief, /work of a and b has been merged/);
  assert.match(brief, /yours to resolve/);
});

test('a run id is readable, and step ids share its prefix', async () => {
  // The session a person sees in `claude agents` is named from the task id, so the id is the only
  // thing standing between them and `ae/t-mtxvs3nw-f4763a59/1`.
  const { runId } = await import('../src/runner.ts');
  const id = runId('Add a `split` example workflow to this repository: a step whose job is...');
  assert.match(id, /^add-a-split-example-workflow-[a-z0-9]{4}$/);
  assert.equal(`${id}-implement`.startsWith(id), true, 'a step id carries its run');

  assert.match(runId('!!!'), /^run-[a-z0-9]{4}$/, 'a brief with nothing sluggable still gets an id');
  assert.notEqual(runId('same brief'), runId('same brief'), 'two runs of one request stay apart');
});

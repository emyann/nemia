/**
 * `assess` is the whole controller, and it is pure: hand it the engine's view of each task and it
 * decides. No disk, no engine, no clock.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assess, cancelPlan, composeBrief, inFlight, workspacePlan, type Run, type TaskPhase } from '../src/run.ts';
import type { Workflow } from '../src/workflow.ts';

const step = (name: string, after: string[] = []): Workflow => ({ name, after, body: `do ${name}` });
const STEPS = [step('implement'), step('review', ['implement'])];

const run = (steps: Record<string, string | null>, rest: Partial<Run> = {}): Run => ({
  id: 'r-1', repo: '/repo', workspace: '/wt', baseRef: 'abc123', branch: 'main', isolate: true,
  brief: 'add a flag', workflowDir: '/wf', createdAt: '2026-01-01T00:00:00Z',
  steps: Object.fromEntries(Object.entries(steps).map(([k, v]) => [k, { taskId: v }])),
  ...rest,
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

// ─── calling one off ────────────────────────────────────────────────────────

const CANCELLED = { cancelledAt: '2026-01-02T00:00:00Z' };

test('a cancelled run files nothing, however ready the next step looked', () => {
  // The point of writing the fact down: without it this assessment says `ready: ['review']`, and
  // the very next tick would start the step of a run somebody just stopped.
  const live = run({ implement: 't1', review: null });
  assert.deepEqual(assess(STEPS, live, phases({ t1: 'succeeded' })).ready, ['review']);

  const a = assess(STEPS, run({ implement: 't1', review: null }, CANCELLED), phases({ t1: 'succeeded' }));
  assert.deepEqual(a.ready, []);
  assert.equal(a.status, 'cancelled');
});

test('cancelled is a fact about the run, not a verdict on its steps', () => {
  // Nothing is reported as blocked: no step failed, the run was called off. And a run whose steps
  // all succeeded before the cancel is still reported as cancelled, not as succeeded.
  const a = assess(STEPS, run({ implement: 't1', review: 't2' }, CANCELLED), phases({ t1: 'succeeded', t2: 'succeeded' }));
  assert.deepEqual(a.blocked, []);
  assert.equal(a.status, 'cancelled');
});

test('cancelling stops what is in flight — both a running step and one still queued', () => {
  const queued = cancelPlan(STEPS, run({ implement: 't1', review: null }), phases({ t1: 'pending' }));
  assert.deepEqual(queued, { kind: 'cancel', stop: [{ name: 'implement', taskId: 't1' }] },
    'a filed task would be STARTED by the next tick, so it counts as in flight');

  const working = cancelPlan(STEPS, run({ implement: 't1', review: 't2' }), phases({ t1: 'succeeded', t2: 'running' }));
  assert.deepEqual(working, { kind: 'cancel', stop: [{ name: 'review', taskId: 't2' }] },
    'the step that has ended is not asked to stop');
});

test('a fan-out with two live siblings stops both', () => {
  const fan = [step('a'), step('b'), step('merge', ['a', 'b'])];
  const plan = cancelPlan(fan, run({ a: 't1', b: 't2', merge: null }), phases({ t1: 'running', t2: 'pending' }));
  assert.deepEqual(plan, { kind: 'cancel', stop: [{ name: 'a', taskId: 't1' }, { name: 'b', taskId: 't2' }] });
});

test('a sibling still working is stopped even though the run has already failed', () => {
  // `assess` calls this run failed the moment `a` failed, but `b` is a session that is still
  // burning, and stopping it is exactly what the person cancelling came for.
  const fan = [step('a'), step('b'), step('merge', ['a', 'b'])];
  const r = run({ a: 't1', b: 't2', merge: null });
  const p = phases({ t1: 'failed', t2: 'running' });
  assert.equal(assess(fan, r, p).status, 'failed');
  assert.deepEqual(cancelPlan(fan, r, p), { kind: 'cancel', stop: [{ name: 'b', taskId: 't2' }] });
});

test('cancelling a run with nothing in flight is normal, and still cancels it', () => {
  // Filed but never ticked: no task to stop, and marking it is the whole point — otherwise the
  // next tick starts the first step.
  const plan = cancelPlan(STEPS, run({ implement: null, review: null }), phases({}));
  assert.deepEqual(plan, { kind: 'cancel', stop: [] });
});

test('cancelling a finished run is not an error, and does not relabel it', () => {
  // A run that succeeded succeeded. Stamping it cancelled would make `wf ls` lie about work that
  // actually landed, so the answer is "already succeeded" and nothing is written.
  const done = cancelPlan(STEPS, run({ implement: 't1', review: 't2' }), phases({ t1: 'succeeded', t2: 'succeeded' }));
  assert.deepEqual(done, { kind: 'finished', status: 'succeeded' });

  const gone = cancelPlan(STEPS, run({ implement: 't1', review: null }), phases({ t1: 'failed' }));
  assert.deepEqual(gone, { kind: 'finished', status: 'failed' });
});

test('a failed run with a step still READY is cancelled, not called finished', () => {
  // `failed` does not mean "has stopped moving". `a` failed, but `c` waits only on `b`, which
  // succeeded — so a tick would still file `c`. Calling this finished wrote no mark and the next
  // tick filed it anyway, which is the whole thing cancelling is supposed to prevent.
  const fan = [step('a'), step('b'), step('c', ['b'])];
  const r = run({ a: 't1', b: 't2', c: null });
  const p = phases({ t1: 'failed', t2: 'succeeded' });

  const a = assess(fan, r, p);
  assert.equal(a.status, 'failed');
  assert.deepEqual(a.ready, ['c'], 'the run is failed AND has work it would file');

  assert.deepEqual(cancelPlan(fan, r, p), { kind: 'cancel', stop: [] });
  assert.deepEqual(assess(fan, { ...r, cancelledAt: '2026-01-02T00:00:00Z' }, p).ready, [],
    'and once marked, that step is never filed');
});

test('cancelling a cancelled run says who got there first, rather than re-stamping it', () => {
  const plan = cancelPlan(STEPS, run({ implement: 't1', review: null }, CANCELLED), phases({ t1: 'stopped' }));
  assert.deepEqual(plan, { kind: 'already-cancelled', at: CANCELLED.cancelledAt, stop: [] });
});

test('cancelling twice still stops what is still in flight — it is level-triggered', () => {
  // The engine carries a stop out on its NEXT tick, so a second `wf cancel` seconds later finds
  // the step still running. Asking again is how a person fixes one that slipped through, so it is
  // not an answer of "already cancelled, nothing to do".
  const plan = cancelPlan(STEPS, run({ implement: 't1', review: null }, CANCELLED), phases({ t1: 'running' }));
  assert.deepEqual(plan, { kind: 'already-cancelled', at: CANCELLED.cancelledAt, stop: [{ name: 'implement', taskId: 't1' }] });
});

test('a step the engine cannot find is not reported as stopped', () => {
  // `unknown` is a task we filed and cannot look up. Claiming to have stopped it would be a line
  // of output nobody can check.
  assert.deepEqual(inFlight(run({ implement: 't1' }), phases({})), []);
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

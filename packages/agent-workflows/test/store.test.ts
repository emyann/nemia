/**
 * The run store, where a person's cancellation meets the daemon's writes.
 *
 * Everything else about cancelling is a pure decision and lives in run.test.ts. This is the part
 * that is not pure and cannot be: two writers on one run, and a tick that takes seconds to make up
 * its mind. `wf cancel` is meant to be typed while `wf up` is running — that is the whole point of
 * the verb — so "what happens when they overlap" is a property worth pinning down.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Engine } from 'agent-engine';
import type { Run, TaskPhase } from '../src/run.ts';

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-store-'));
const WORKFLOW = path.join(ROOT, 'workflow');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
fs.mkdirSync(WORKFLOW, { recursive: true });
fs.writeFileSync(path.join(WORKFLOW, 'implement.md'), 'implement it\n');
fs.writeFileSync(path.join(WORKFLOW, 'review.md'), '---\nafter: implement\n---\nreview it\n');

// WF_ROOT is read as the module loads, so it is set before the import rather than after it.
process.env.WF_ROOT = ROOT;
const { advance, cancel, list, markCancelled, readRun } = await import('../src/runner.ts');

const aRun = (id: string, steps: Run['steps']): Run => ({
  id, repo: '/repo', workspace: '/repo', baseRef: 'abc123', branch: 'main',
  // No worktrees: this is a test about the record, not about git.
  isolate: false, brief: 'add a flag', workflowDir: WORKFLOW, steps, createdAt: '2026-01-01T00:00:00Z',
});

/** What the daemon does to the run's json, and the only thing it does to it. */
const writeRun = (run: Run) => fs.writeFileSync(path.join(ROOT, 'runs', `${run.id}.json`), JSON.stringify(run, null, 2));

/**
 * Just enough engine: what each task is doing, how it signed off if it did, and a `file` the test
 * can hold open mid-call.
 */
const engineWith = (phase: Record<string, TaskPhase>, hold?: Promise<void>, closeouts: Record<string, unknown> = {}) => {
  const stopped: string[] = [];
  const settled = new Set(['succeeded', 'failed', 'stopped']);
  const e = {
    view: async (id: string) => ({
      id, phase: phase[id] ?? 'unknown', sessionId: 's',
      state: {
        settled: settled.has(phase[id] ?? '') ? phase[id] : null,
        attempts: phase[id] === 'pending' ? [] : [{ n: 1, ended: null, nativeId: 's', closeout: closeouts[id] }],
        stopRequested: false,
      },
    }),
    file: async (spec: { id: string }) => { await hold; return spec.id; },
    stop: async (id: string) => { stopped.push(id); },
  } as unknown as Engine;
  return { e, stopped };
};

test('a cancellation is not kept in the file the daemon rewrites', () => {
  const run = aRun('r-store', { implement: { taskId: 't1' }, review: { taskId: null } });
  writeRun(run);
  markCancelled(run.id);

  // The daemon writes back the copy it read BEFORE the cancel — which is exactly what it does.
  writeRun(run);
  assert.ok(readRun(run.id).cancelledAt, 'the mark is in its own file, so there is nothing to clobber');
});

test('cancelling twice keeps the first time, not the second', () => {
  writeRun(aRun('r-twice', { implement: { taskId: null } }));
  const first = markCancelled('r-twice');
  assert.equal(markCancelled('r-twice'), first);
});

test('a cancel that lands mid-tick survives the tick', async () => {
  // The race, reproduced: a pass reads the run, gets as far as awaiting `e.file`, and a person
  // cancels while it is in there. Before the mark had its own file, the pass wrote its stale copy
  // back and the cancellation simply vanished — the run went on filing steps for ever.
  const run = aRun('r-race', { implement: { taskId: 't1' }, review: { taskId: null } });
  writeRun(run);

  let release!: () => void;
  const { e } = engineWith({ t1: 'succeeded' }, new Promise<void>((r) => { release = r; }));

  const pass = advance(e, readRun(run.id));          // a tick, now stuck inside e.file
  await new Promise((r) => setTimeout(r, 10));
  const { plan } = await cancel(e, run.id);          // a person, meanwhile
  assert.equal(plan.kind, 'cancel');
  release();
  await pass;

  const after = readRun(run.id);
  assert.ok(after.cancelledAt, 'the cancellation is still there');
  assert.equal(after.steps.review?.taskId, 'r-race-review', 'and so is the step the tick filed');
});

test('the next tick stops a step filed in the instant after the cancel, and files nothing more', async () => {
  // The other half of that race. `wf cancel` stops what it can SEE; a step filed a moment later is
  // not in that list, so the tick enforces the mark rather than trusting the one command.
  const run = aRun('r-heal', { implement: { taskId: 't1' }, review: { taskId: 'r-heal-review' } });
  writeRun(run);
  markCancelled(run.id);

  const { e, stopped } = engineWith({ t1: 'succeeded', 'r-heal-review': 'running' });
  const pass = await advance(e, readRun(run.id));

  assert.deepEqual(stopped, ['r-heal-review'], 'nobody had to notice and cancel a second time');
  assert.deepEqual(pass.filed, []);
  assert.equal(pass.status, 'cancelled');
});

test('a run the engine has already been asked to stop is not asked again every four seconds', async () => {
  const run = aRun('r-quiet', { implement: { taskId: 't1' }, review: { taskId: null } });
  writeRun(run);
  markCancelled(run.id);

  const { e, stopped } = engineWith({ t1: 'running' });
  // The engine's record says the request is already on it.
  const view = e.view.bind(e);
  e.view = async (id: string) => {
    const v = await view(id) as { state: { stopRequested: boolean } };
    return { ...v, state: { ...v.state, stopRequested: true } } as Awaited<ReturnType<Engine['view']>>;
  };

  await advance(e, readRun(run.id));
  assert.deepEqual(stopped, []);
});

// ─── what `wf ls` reads ─────────────────────────────────────────────────────

// Not cancelling, but the same kind of test: what `wf ls` shows is decided purely in run.test.ts,
// and this is the read that feeds it — each step's closeout, off the engine's record of its task.
test('`wf ls` takes how each step signed off from the engine — and a task from before closeouts still lists', async () => {
  // `implement` is from before closeouts: its attempt carries none. `review` signed off blocked, in a
  // session the engine settled exactly as cleanly as the other.
  const run = aRun('r-ls', { implement: { taskId: 't1' }, review: { taskId: 't2' } });
  const blocked = { outcome: 'blocked', summary: 'two readings of the brief', artifacts: [], needs: 'pick one' };
  const { e } = engineWith({ t1: 'succeeded', t2: 'succeeded' }, undefined, { t2: blocked });

  const l = await list(e, run);
  assert.deepEqual(l.steps.map((s) => s.status), ['succeeded', 'succeeded · BLOCKED']);
  assert.deepEqual(l.waitingOnYou, ['review']);
});

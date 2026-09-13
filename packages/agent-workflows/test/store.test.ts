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
import { execFileSync } from 'node:child_process';
import type { Engine } from 'agent-engine';
import type { Run, TaskPhase } from '../src/run.ts';
import { readCheckBrief } from '../src/check.ts';

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-store-'));
const WORKFLOW = path.join(ROOT, 'workflow');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
fs.mkdirSync(WORKFLOW, { recursive: true });
fs.writeFileSync(path.join(WORKFLOW, 'implement.md'), 'implement it\n');
fs.writeFileSync(path.join(WORKFLOW, 'review.md'), '---\nafter: implement\n---\nreview it\n');

// WF_ROOT is read as the module loads, so it is set before the import rather than after it.
process.env.WF_ROOT = ROOT;
const { advance, cancel, decide, list, markCancelled, readRun, start } = await import('../src/runner.ts');

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
        // A filed task has the brief it was filed with; only one the engine never heard of has none.
        brief: 'filed',
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
  assert.deepEqual(l.steps.map((s) => s.status), ['unverified', 'succeeded · BLOCKED']);
  assert.deepEqual(l.waitingOnYou, ['review']);
});

test('a step whose task the engine no longer has is unknown, not queued — cancelling stops nobody', async () => {
  // A task the engine has never heard of folds to the same empty state as one waiting for a slot,
  // and `pending` counts as in flight. Read that way, a run whose board was cleared since would
  // claim to stop sessions nobody can find. The brief is what tells them apart; see `phaseOfView`.
  // Found by the `wf rm` run (34774e0); the verb was not kept, this was.
  const run = aRun('r-amnesia', { implement: { taskId: 't-forgotten' }, review: { taskId: null } });
  writeRun(run);
  const stopped: string[] = [];
  const forgetful = {
    view: async (id: string) => ({
      id, phase: 'pending', sessionId: null,
      state: { settled: null, attempts: [], brief: '', stopRequested: false },
    }),
    stop: async (id: string) => { stopped.push(id); },
  } as unknown as Engine;

  const { plan } = await cancel(forgetful, run.id);
  assert.deepEqual(stopped, [], 'nobody to stop');
  assert.ok(plan.kind === 'finished' || plan.stop.length === 0, 'and nothing reported as stopped');
});

// ─── the workflow a run froze ───────────────────────────────────────────────

/** A repository with one commit, so `wf start` has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo, stdio: 'ignore' });
  git('init', '-q');
  git('commit', '-q', '--allow-empty', '-m', 'base');
  return repo;
};

/** An engine that has never heard of anything, and remembers every task it is asked to file. */
const recording = () => {
  const filed: Array<{ id: string; brief: string; harness?: string; cwd: string }> = [];
  const e = {
    view: async (id: string) => ({ id, phase: 'unknown', sessionId: null, state: { brief: '', settled: null, attempts: [], stopRequested: false } }),
    file: async (spec: { id: string; brief: string; harness?: string; cwd: string }) => { filed.push(spec); return spec.id; },
    stop: async () => {},
  } as unknown as Engine;
  return { e, filed };
};

test('a run reads the workflow it froze at `wf start` — the folder edited afterwards never reaches it', async () => {
  const folder = fs.mkdtempSync(path.join(ROOT, 'frozen-'));
  fs.writeFileSync(path.join(folder, 'implement.md'), 'implement it as asked\n');
  fs.writeFileSync(path.join(folder, 'review.md'), '---\nafter: implement\n---\nreview it\n');
  const run = start({ brief: 'add a flag', repo: aRepo(), workflowDir: folder, isolate: false });

  // Somebody — a step working in this checkout, say — rewrites the folder the run was started from.
  fs.writeFileSync(path.join(folder, 'implement.md'), 'something else entirely\n');
  fs.rmSync(path.join(folder, 'review.md'));

  const { e, filed } = recording();
  await advance(e, readRun(run.id));
  assert.deepEqual(filed.map((f) => f.id), [`${run.id}-implement`]);
  assert.match(filed[0]!.brief, /implement it as asked/);
  assert.doesNotMatch(filed[0]!.brief, /something else/);
  assert.deepEqual(readRun(run.id).workflow?.map((s) => s.name), ['implement', 'review'], 'the deleted step is still the run\'s');
});

// ─── the check, at shipped defaults ─────────────────────────────────────────

const gitOut = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/**
 * An engine board a test settles by hand. It keeps what each task was filed with — so a view carries
 * the closeout schema the run really asked for — and counts every filing.
 */
const board = () => {
  type Filed = { id: string; brief: string; harness?: string; cwd: string; closeoutSchema?: object } & Record<string, unknown>;
  const tasks = new Map<string, { spec: Filed; phase: TaskPhase; closeout?: unknown }>();
  const filings: string[] = [];
  const stopped: string[] = [];
  const logs = new Map<string, string>();
  const e = {
    view: async (id: string) => {
      const t = tasks.get(id);
      const settled = t && ['succeeded', 'failed', 'stopped'].includes(t.phase) ? t.phase : null;
      return {
        id, phase: t?.phase ?? 'pending', sessionId: t ? 's' : null,
        state: {
          brief: t?.spec.brief ?? '', closeoutSchema: t?.spec.closeoutSchema, settled, stopRequested: false,
          attempts: !t || t.phase === 'pending' ? [] : [{ n: 1, ended: null, nativeId: 's', closeout: t.closeout }],
        },
      };
    },
    file: async (spec: Filed) => { filings.push(spec.id); tasks.set(spec.id, { spec, phase: 'pending' }); return spec.id; },
    stop: async (id: string) => { stopped.push(id); },
    logs: async (id: string) => logs.get(id) ?? '(no output yet)',
  } as unknown as Engine;
  const settle = (id: string, phase: TaskPhase, closeout?: unknown) => Object.assign(tasks.get(id)!, { phase, closeout });
  return { e, tasks, filings, stopped, settle, logs };
};

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };

/** A workflow folder: `implement`, with whatever frontmatter it is given, and `review` after it. */
const folder = (implementKeys = '') => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), `${implementKeys ? `---\n${implementKeys}\n---\n` : ''}implement it\n`);
  fs.writeFileSync(path.join(dir, 'review.md'), '---\nafter: implement\n---\nreview it\n');
  return dir;
};

/** `wf start`, for real, over a fresh repository, the steps working in the checkout itself. */
const started = (dir: string) => start({ brief: 'add a flag', repo: aRepo(), workflowDir: dir, isolate: false });

test('no `check:` → the run never files a check task, from the first pass to the last', async () => {
  const run = started(folder());
  const { e, filings, settle } = board();
  await advance(e, readRun(run.id));
  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await advance(e, readRun(run.id));
  settle(`${run.id}-review`, 'succeeded', SIGNED);
  const last = await advance(e, readRun(run.id));

  assert.deepEqual(filings, [`${run.id}-implement`, `${run.id}-review`]);
  assert.equal(last.status, 'succeeded');
  assert.equal(readRun(run.id).steps.implement?.check, undefined);
});

test('the run files a signed step\'s check itself: the frozen command, in its workspace, on the check harness, once', async () => {
  const run = started(folder('check: npm test && npm run typecheck'));
  const { e, tasks, filings, settle } = board();
  await advance(e, readRun(run.id));
  settle(`${run.id}-implement`, 'succeeded', SIGNED);

  const pass = await advance(e, readRun(run.id));
  const id = `${run.id}-implement-check`;
  assert.deepEqual([pass.checked, pass.filed], [['implement'], []], 'the follower waits for the check, not for the agent');
  assert.deepEqual(readRun(run.id).steps.implement, {
    // Still the step's own task: apps/api reads `taskId`, and the check is not it.
    taskId: `${run.id}-implement`, workspace: run.repo, branch: run.branch, check: { taskId: id },
  });

  const spec = tasks.get(id)!.spec;
  assert.deepEqual(
    { harness: spec.harness, cwd: spec.cwd, deadlineSeconds: spec.deadlineSeconds, maxAttempts: spec.maxAttempts, resume: spec.resume, closeoutSchema: spec.closeoutSchema },
    { harness: 'check', cwd: run.repo, deadlineSeconds: 600, maxAttempts: 1, resume: 'never', closeoutSchema: undefined },
  );
  assert.deepEqual(readCheckBrief(spec.brief), {
    command: 'npm test && npm run typecheck',
    env: { WF_RUN: run.id, WF_STEP: 'implement', WF_BASE_REF: run.baseRef, WF_WORKSPACE: run.repo, WF_STDERR: path.join(ROOT, 'checks', `${id}.stderr`) },
  });
  assert.ok(fs.existsSync(path.join(ROOT, 'checks')), 'the stderr file has somewhere to go');

  await advance(e, readRun(run.id));
  assert.equal(filings.filter((f) => f === id).length, 1, 'filed once, however many passes');

  settle(id, 'succeeded');
  assert.deepEqual((await advance(e, readRun(run.id))).filed, ['review'], 'exit 0, and the follower is filed');
});

test('a check that exits non-zero leaves the follower unfiled, pass after pass, and the run failed', async () => {
  const run = started(folder('check: npm test'));
  const { e, filings, settle } = board();
  await advance(e, readRun(run.id));
  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await advance(e, readRun(run.id));
  settle(`${run.id}-implement-check`, 'failed');

  for (let i = 0; i < 3; i++) {
    const pass = await advance(e, readRun(run.id));
    assert.deepEqual([pass.filed, pass.checked, pass.blocked, pass.status], [[], [], ['review'], 'failed']);
  }
  assert.ok(!filings.includes(`${run.id}-review`));
});

test('UNSIGNED at shipped defaults: a step that ends without the closeout the run asked for files nothing after it', async () => {
  const run = started(folder('check: npm test'));
  const { e, tasks, filings, settle } = board();
  await advance(e, readRun(run.id));
  assert.ok(tasks.get(`${run.id}-implement`)!.spec.closeoutSchema, 'the run asked');
  settle(`${run.id}-implement`, 'succeeded');   // …and the session went quiet without one

  const pass = await advance(e, readRun(run.id));
  assert.deepEqual([pass.filed, pass.checked, pass.blocked], [[], [], ['review']]);
  assert.deepEqual(filings, [`${run.id}-implement`]);
});

test('a `check:` planted in the folder after `wf start` never reaches the check the run files', async () => {
  const dir = folder('check: npm test');
  const run = started(dir);
  // The command a step would like to be judged by.
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\ncheck: true\n---\nimplement it\n');

  const { e, tasks, settle } = board();
  await advance(e, readRun(run.id));
  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await advance(e, readRun(run.id));
  assert.equal(readCheckBrief(tasks.get(`${run.id}-implement-check`)!.spec.brief).command, 'npm test');
});

test('a pass that filed a check and died before writing the run down is adopted, never filed twice', async () => {
  const run = started(folder('check: npm test'));
  const { e, filings, settle } = board();
  await advance(e, readRun(run.id));
  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  const before = readRun(run.id);
  await advance(e, readRun(run.id));   // files the check…
  writeRun(before);                    // …and, as far as the record knows, never did

  const again = await advance(e, readRun(run.id));
  assert.equal(filings.filter((f) => f.endsWith('-check')).length, 1);
  assert.deepEqual(again.checked, [], 'adopted before the pass assessed anything, so there was nothing left to file');
  assert.deepEqual(readRun(run.id).steps.implement?.check, { taskId: `${run.id}-implement-check` });
});

test('a FAILED step is handed off: what it left is committed where the run can show it', async () => {
  const run = started(folder());
  const { e, settle } = board();
  await advance(e, readRun(run.id));
  fs.writeFileSync(path.join(run.repo, 'half-done.txt'), 'work\n');
  settle(`${run.id}-implement`, 'failed');

  await advance(e, readRun(run.id));
  assert.equal(gitOut(run.repo, 'status', '--porcelain'), '');
  assert.match(gitOut(run.repo, 'log', '-1', '--format=%s'), /^implement: hand off/);
});

test("nothing is committed for a step once its check is filed — the suite's litter stays off the branch", async () => {
  const run = started(folder('check: npm test'));
  const { e, settle } = board();
  await advance(e, readRun(run.id));
  fs.writeFileSync(path.join(run.repo, 'feature.txt'), 'work\n');
  settle(`${run.id}-implement`, 'succeeded', SIGNED);

  await advance(e, readRun(run.id));   // hands off the work, then files the check on that tree
  assert.match(gitOut(run.repo, 'show', '--name-only', '--format=', 'HEAD'), /feature\.txt/);

  fs.writeFileSync(path.join(run.repo, 'coverage.out'), 'litter\n');
  await advance(e, readRun(run.id));
  assert.match(gitOut(run.repo, 'status', '--porcelain'), /coverage\.out/, 'left untracked');
});

test('cancelling stops a running check — from the verb, and again from every pass', async () => {
  const run = started(folder('check: npm test'));
  const { e, stopped, settle } = board();
  await advance(e, readRun(run.id));
  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await advance(e, readRun(run.id));
  const id = `${run.id}-implement-check`;
  settle(id, 'running');

  const { plan } = await cancel(e, run.id);
  assert.deepEqual(plan, { kind: 'cancel', stop: [{ name: 'implement (check)', taskId: id }] });
  await advance(e, readRun(run.id));
  assert.deepEqual(stopped, [id, id]);
});

test("a step named for another step's check is refused at `wf start`, before anything is spent", () => {
  const dir = folder('check: npm test');
  fs.writeFileSync(path.join(dir, 'implement-check.md'), 'a step of its own\n');
  // With worktrees: a second root would otherwise be refused first, for running beside `implement`.
  assert.throws(() => start({ brief: 'add a flag', repo: aRepo(), workflowDir: dir }), (err: Error & { exitCode?: number }) =>
    err.exitCode === 2 && /implement-check/.test(err.message) && /Rename implement-check\.md/.test(err.message));
});

test('`wf ls` and `wf decide` read a refused check from its log and its stderr file', async () => {
  const run = started(folder('check: npm test'));
  const { e, settle, logs } = board();
  await advance(e, readRun(run.id));
  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await advance(e, readRun(run.id));
  const id = `${run.id}-implement-check`;
  settle(id, 'failed');
  logs.set(id, 'not ok 3 - parses a trailing comma\n# fail 1\n\n[wf check] exit 1\n');
  fs.writeFileSync(path.join(ROOT, 'checks', `${id}.stderr`), 'npm error Test failed.\n');

  const l = await list(e, readRun(run.id));
  assert.deepEqual(l.steps.map((s) => s.status), ['failed ✗ check (exit 1)', 'waiting']);
  assert.deepEqual(l.waitingOnYou, ['implement']);

  const { decision: d, checks } = await decide(e, run.id);
  assert.deepEqual(d.kind === 'awaiting' && [d.outcome, d.failedCheck], ['failed', ['implement']]);
  assert.deepEqual(checks.implement, {
    command: 'npm test', passed: false, verdict: 1,
    stdout: 'not ok 3 - parses a trailing comma\n# fail 1', stderr: 'npm error Test failed.',
  });
});

test('a check filed by a pass that died, on a run then cancelled, is found and stopped — by the verb, and by every pass', async () => {
  const run = started(folder('check: npm test'));
  const { e, filings, stopped, settle } = board();
  await advance(e, readRun(run.id));
  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  const before = readRun(run.id);
  await advance(e, readRun(run.id));   // files the check…
  writeRun(before);                    // …and, as far as the record knows, never did
  const id = `${run.id}-implement-check`;
  settle(id, 'running');

  const { plan } = await cancel(e, run.id);
  assert.deepEqual(plan, { kind: 'cancel', stop: [{ name: 'implement (check)', taskId: id }] }, 'the verb finds it');
  assert.equal(readRun(run.id).steps.implement?.check, undefined, 'and does not write the run to do so');

  await advance(e, readRun(run.id));
  assert.deepEqual(stopped, [id, id], 'a cancelled run files no check, and still finds the one it filed');
  assert.deepEqual(readRun(run.id).steps.implement?.check, { taskId: id }, 'the tick puts it on the record');
  assert.equal(filings.filter((f) => f === id).length, 1);
});

test("an unchecked step's hand-off stops once the step after it works in the same workspace — the next check's litter stays off the branch", async () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), 'implement it\n');
  fs.writeFileSync(path.join(dir, 'review.md'), '---\nafter: implement\ncheck: npm test\n---\nreview it\n');
  const run = started(dir);   // both steps in the one checkout, as an inheriting follower would be
  const { e, settle } = board();
  await advance(e, readRun(run.id));
  fs.writeFileSync(path.join(run.repo, 'feature.txt'), 'work\n');
  settle(`${run.id}-implement`, 'succeeded', SIGNED);

  await advance(e, readRun(run.id));   // hands implement off, then files review in the same workspace
  assert.match(gitOut(run.repo, 'log', '-1', '--format=%s'), /^implement: hand off/);

  fs.writeFileSync(path.join(run.repo, 'half-reviewed.txt'), 'wip\n');
  await advance(e, readRun(run.id));
  assert.match(gitOut(run.repo, 'status', '--porcelain'), /half-reviewed\.txt/, "review's work in progress is not committed under implement's name");

  settle(`${run.id}-review`, 'succeeded', SIGNED);
  await advance(e, readRun(run.id));   // hands review off, then files its check
  assert.match(gitOut(run.repo, 'log', '-1', '--format=%s'), /^review: hand off/);

  fs.writeFileSync(path.join(run.repo, 'coverage.out'), 'litter\n');
  await advance(e, readRun(run.id));
  await advance(e, readRun(run.id));
  assert.match(gitOut(run.repo, 'status', '--porcelain'), /coverage\.out/, 'left untracked — by implement as well as by review');
  assert.doesNotMatch(gitOut(run.repo, 'log', '--format=%s'), /implement: hand off[\s\S]*implement: hand off/, 'implement was handed off once');
});

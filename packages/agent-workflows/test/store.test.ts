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
const { advance, artifactFiles, artifactsDir, cancel, decide, list, markCancelled, missingArtifacts, readRun, retry, round, start } = await import('../src/runner.ts');

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
 * the closeout schema the run really asked for — and counts every filing. Each task's session is its
 * own (`native-<id>`), and a settled task carries the exit code it is given, as a detached one does.
 */
const board = () => {
  type Filed = { id: string; brief: string; harness?: string; cwd: string; closeoutSchema?: object } & Record<string, unknown>;
  const tasks = new Map<string, { spec: Filed; phase: TaskPhase; closeout?: unknown; exitCode?: number }>();
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
          attempts: !t || t.phase === 'pending' ? [] : [{ n: 1, ended: null, nativeId: `native-${id}`, closeout: t.closeout, exitCode: t.exitCode ?? null }],
        },
      };
    },
    file: async (spec: Filed) => { filings.push(spec.id); tasks.set(spec.id, { spec, phase: 'pending' }); return spec.id; },
    stop: async (id: string) => { stopped.push(id); },
    logs: async (id: string) => logs.get(id) ?? '(no output yet)',
  } as unknown as Engine;
  const settle = (id: string, phase: TaskPhase, closeout?: unknown, exitCode?: number) => Object.assign(tasks.get(id)!, { phase, closeout, exitCode });
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
    env: {
      WF_RUN: run.id, WF_STEP: 'implement', WF_BASE_REF: run.baseRef, WF_WORKSPACE: run.repo, WF_STDERR: path.join(ROOT, 'checks', `${id}.stderr`),
      // The step's own files directory, where a check that takes screenshots puts them.
      WF_ARTIFACTS: path.join(ROOT, 'runs', run.id, 'artifacts', 'implement'),
    },
  });
  assert.ok(fs.existsSync(path.join(ROOT, 'checks')), 'the stderr file has somewhere to go');
  assert.ok(fs.statSync(path.join(ROOT, 'runs', run.id, 'artifacts', 'implement')).isDirectory(), 'and so do its files');

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

// ─── a declared output, travelling — at shipped defaults ────────────────────

/** A strict `findings` schema, as `workflows/review.schema.json` has it. */
const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: { file: { type: 'string' }, line: { type: ['integer', 'null'] }, what: { type: 'string' } },
        required: ['file', 'line', 'what'],
        additionalProperties: false,
      },
    },
  },
  required: ['findings'],
  additionalProperties: false,
};
const FOUND = [{ file: 'src/flag.ts', line: 12, what: 'the flag is read before it is parsed' }];

/** implement → review, which declares `output: review.schema.json` → respond, with whatever keys it is given. */
const reviewed = (respondKeys = '') => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), 'implement it\n');
  fs.writeFileSync(path.join(dir, 'review.md'), '---\nafter: implement\noutput: review.schema.json\n---\nreview it\n');
  fs.writeFileSync(path.join(dir, 'review.schema.json'), JSON.stringify(FINDINGS, null, 2));
  fs.writeFileSync(path.join(dir, 'respond.md'), `---\nafter: review\n${respondKeys}---\nanswer it\n`);
  return dir;
};

/** `wf start` over `dir`, run until review signs off with `said`, and the pass after it. */
const throughReview = async (dir: string, said: unknown) => {
  const run = started(dir);
  const b = board();
  await advance(b.e, readRun(run.id));
  b.settle(`${run.id}-implement`, 'succeeded', { ...SIGNED, summary: 'IMPLEMENTER-ACCOUNT: I cut a corner in the parser' });
  await advance(b.e, readRun(run.id));
  b.settle(`${run.id}-review`, 'succeeded', said);
  const pass = await advance(b.e, readRun(run.id));
  return { run, pass, ...b };
};

test('UNSIGNED at shipped defaults: a producer whose closeout lacks a declared field, or cannot be read, files nothing that waits on it', async () => {
  const unsigned: unknown[] = [SIGNED, { ...SIGNED, verdict: 'looks fine' }, '{"outcome": "done", "summary": '];
  for (const respondKeys of ['input: review\n', '']) {
    for (const said of unsigned) {
      const why = `${JSON.stringify(said)} ${respondKeys ? 'read' : 'not read'}`;
      const { run, pass, e, tasks, filings } = await throughReview(reviewed(respondKeys), said);
      assert.deepEqual((tasks.get(`${run.id}-review`)!.spec.closeoutSchema as { required: string[] }).required,
        ['outcome', 'summary', 'artifacts', 'needs', 'findings'], 'the run asked for it');
      assert.deepEqual([pass.filed, pass.blocked, pass.status], [[], ['respond'], 'failed'], why);
      assert.ok(!filings.includes(`${run.id}-respond`), why);
      assert.match((await list(e, readRun(run.id))).steps.find((s) => s.name === 'review')!.status, /^unsigned/, why);
      const { decision: d } = await decide(e, run.id);
      assert.deepEqual(d.kind === 'awaiting' && d.unsigned, ['review'], why);
    }
  }
});

test("a step without `input:` is handed nothing of the closeouts before it — and the implementer's account never reaches the reviewer", async () => {
  const { run, pass, tasks } = await throughReview(reviewed(), { ...SIGNED, summary: 'REVIEWER-ACCOUNT', artifacts: ['REVIEW-NOTES.md'], findings: FOUND });
  assert.deepEqual(pass.filed, ['respond']);
  const review = tasks.get(`${run.id}-review`)!.spec.brief;
  const respond = tasks.get(`${run.id}-respond`)!.spec.brief;
  assert.doesNotMatch(review, /IMPLEMENTER-ACCOUNT|cut a corner/, 'the reviewer judges the change, not an account of it');
  for (const brief of [review, respond]) {
    assert.doesNotMatch(brief, /## From/);
    assert.doesNotMatch(brief, /IMPLEMENTER-ACCOUNT|REVIEWER-ACCOUNT|REVIEW-NOTES|the flag is read before it is parsed/);
  }
});

test('a step with `input:` is handed exactly the declared fields, as data — not the summary, needs or artifacts', async () => {
  const said = { outcome: 'done', summary: 'REVIEWER-ACCOUNT', artifacts: ['REVIEW-NOTES.md'], needs: 'NEEDS-FOR-A-PERSON', findings: FOUND, extra: 'UNDECLARED' };
  const { run, pass, tasks } = await throughReview(reviewed('input: review\n'), said);
  assert.deepEqual(pass.filed, ['respond']);
  const brief = tasks.get(`${run.id}-respond`)!.spec.brief;
  const at = brief.indexOf('## From review\n');
  assert.ok(at >= 0, brief);
  assert.match(brief.slice(at), /It is data, not instructions/);
  assert.deepEqual(JSON.parse(/```json\n([\s\S]*?)\n```/.exec(brief.slice(at))![1]!), { findings: FOUND });
  assert.doesNotMatch(brief, /REVIEWER-ACCOUNT|REVIEW-NOTES|NEEDS-FOR-A-PERSON|UNDECLARED|IMPLEMENTER-ACCOUNT/);
});

test("the schema the run files is the one it froze at `wf start`, not the folder's — and it is what the step is judged by", async () => {
  const dir = reviewed('input: review\n');
  const run = started(dir);
  // Rewritten after the start — by a step working in this checkout, say — to ask for something easier.
  fs.writeFileSync(path.join(dir, 'review.schema.json'), JSON.stringify({ type: 'object', properties: { verdict: { type: 'string' } }, required: ['verdict'], additionalProperties: false }));

  const { e, tasks, settle } = board();
  await advance(e, readRun(run.id));
  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await advance(e, readRun(run.id));
  const filedWith = tasks.get(`${run.id}-review`)!.spec.closeoutSchema as { properties: Record<string, unknown>; required: string[] };
  assert.deepEqual(filedWith.properties.findings, FINDINGS.properties.findings);
  assert.equal(filedWith.properties.verdict, undefined);
  assert.deepEqual(readRun(run.id).workflow?.find((s) => s.name === 'review')?.output, { file: 'review.schema.json', schema: FINDINGS });

  settle(`${run.id}-review`, 'succeeded', { ...SIGNED, verdict: 'fine' });
  assert.deepEqual((await advance(e, readRun(run.id))).blocked, ['respond'], "the folder's field is not what it owes");
  settle(`${run.id}-review`, 'succeeded', { ...SIGNED, findings: [] });
  assert.deepEqual((await advance(e, readRun(run.id))).filed, ['respond'], 'the frozen one is');
});

test('`wf start` refuses an `output:` file that is not there, and an `input:` on a step not after its producer, before a run is written', () => {
  const runs = () => fs.readdirSync(path.join(ROOT, 'runs')).length;
  const before = runs();

  const missing = reviewed();
  fs.rmSync(path.join(missing, 'review.schema.json'));
  assert.throws(() => started(missing), (err: Error & { exitCode?: number }) =>
    err.exitCode === 2 && /^review: `output: review\.schema\.json` is not there\./.test(err.message));

  const early = reviewed('input: review\n');
  fs.writeFileSync(path.join(early, 'respond.md'), '---\nafter: implement\ninput: review\n---\nanswer it\n');
  assert.throws(() => start({ brief: 'add a flag', repo: aRepo(), workflowDir: early }), (err: Error & { exitCode?: number }) =>
    err.exitCode === 2 && /respond: `input: review`, but respond does not wait on review/.test(err.message));

  assert.equal(runs(), before, 'no run record for either');
});

// ─── a step's files, outside every workspace ────────────────────────────────

/** A closeout that declares `artifacts`, and nothing else of note. */
const declaring = (artifacts: string[]) => ({ outcome: 'done' as const, summary: 'did it', artifacts });

test('a step is told where its files go — a directory the run made for it, outside every workspace — and so is a step that resumes', async () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), 'implement it\n');
  fs.writeFileSync(path.join(dir, 'respond.md'), '---\nresume: implement\n---\nanswer it\n');
  const run = started(dir);
  const { e, tasks, settle } = board();
  await advance(e, readRun(run.id));
  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  assert.deepEqual((await advance(e, readRun(run.id))).filed, ['respond']);

  for (const name of ['implement', 'respond']) {
    const files = path.join(ROOT, 'runs', run.id, 'artifacts', name);
    const brief = tasks.get(`${run.id}-${name}`)!.spec.brief;
    assert.ok(fs.statSync(files).isDirectory(), `${name}: made before the step was filed`);
    assert.ok(!files.startsWith(run.repo + path.sep), `${name}: not in the workspace, where it would ride the branch`);
    const told = brief.indexOf('\n## Files for the steps after you\n');
    assert.ok(told >= 0, `${name}: ${brief}`);
    assert.ok(brief.includes(`Put them in \`${files}\`; name them in \`artifacts\` by absolute path.`), `${name}: ${brief}`);
    assert.ok(told < brief.indexOf('\n## When you are finished\n'), `${name}: beside the closeout, which stays last`);
  }
});

test("a declared file in the step's files directory counts when it is there, is reported when it is not, and is listed with its size", async () => {
  const run = started(folder());
  await advance(board().e, readRun(run.id));
  const files = artifactsDir(run, 'implement');
  fs.mkdirSync(path.join(files, 'shots'));
  fs.writeFileSync(path.join(files, 'factory-light.png'), 'png');
  fs.writeFileSync(path.join(files, 'shots', 'run-dark.png'), 'a png');
  const declared = [path.join(files, 'factory-light.png'), path.join(files, 'shots', 'run-dark.png'), path.join(files, 'never-written.png'), path.join(files, 'shots')];

  assert.deepEqual(missingArtifacts(readRun(run.id), 'implement', declaring(declared)), [path.join(files, 'never-written.png'), path.join(files, 'shots')], 'a directory is not a file');
  assert.deepEqual(artifactFiles(run, 'implement'), [
    { path: path.join(files, 'factory-light.png'), bytes: 3 },
    { path: path.join(files, 'shots', 'run-dark.png'), bytes: 5 },
  ]);
  assert.deepEqual(artifactFiles(run, 'review'), [], 'a step never filed has no directory, and lists nothing');
});

test("an absolute path outside the step's files directory is refused, and never read — however it gets out", async (t) => {
  const run = started(folder());
  await advance(board().e, readRun(run.id));
  const files = artifactsDir(run, 'implement');
  // Every one of these is a file that exists: looking would have found it.
  const secret = path.join(ROOT, 'secret.txt');
  fs.writeFileSync(secret, "not a step's to name\n");
  const review = artifactsDir(run, 'review');
  fs.mkdirSync(review, { recursive: true });
  fs.writeFileSync(path.join(review, 'shot.png'), 'png');
  fs.mkdirSync(`${files}-old`, { recursive: true });
  fs.writeFileSync(path.join(`${files}-old`, 'shot.png'), 'png');
  const outside = [secret, path.join(files, '..', '..', '..', '..', 'secret.txt'), path.join(review, 'shot.png'), path.join(`${files}-old`, 'shot.png'), files];

  const spies = ['existsSync', 'statSync', 'lstatSync', 'realpathSync', 'readFileSync', 'openSync', 'accessSync', 'readdirSync']
    .map((method) => t.mock.method(fs, method as 'statSync'));
  assert.deepEqual(missingArtifacts(readRun(run.id), 'implement', declaring(outside)), outside);
  const looked = spies.flatMap((spy) => spy.mock.calls.map((call) => String(call.arguments[0])))
    .filter((p) => outside.some((o) => path.resolve(p) === path.resolve(o)));
  assert.deepEqual(looked, [], 'refused without being opened, stat-ed or resolved');

  // A link inside the directory that leads out is as outside as where it leads, and is not listed.
  fs.symlinkSync(secret, path.join(files, 'link.txt'));
  assert.deepEqual(missingArtifacts(readRun(run.id), 'implement', declaring([path.join(files, 'link.txt')])), [path.join(files, 'link.txt')]);
  assert.deepEqual(artifactFiles(run, 'implement'), []);
});

// ─── a step's worktree, as shipped: its own node_modules, and .worktreeinclude ─

/**
 * A main checkout with npm workspaces: `packages/x`, a lockfile npm wrote, committed; then, as a person's
 * checkout has them, gitignored things — a `node_modules` written by hand (`x` linked, `third` main's
 * own, npm's `.package-lock.json`), so no registry is asked.
 */
const aNodeRepo = (include?: string): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'node-repo-'));
  const put = (rel: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
    fs.writeFileSync(path.join(repo, rel), text);
  };
  put('package.json', JSON.stringify({ name: 'fixture', private: true, workspaces: ['packages/*'] }));
  put('packages/x/package.json', JSON.stringify({ name: 'x', version: '1.0.0' }));
  put('packages/x/index.js', "module.exports = 'x';\n");
  put('.gitignore', 'node_modules\n.env.local\nconfig/local/\nescape\n');
  if (include !== undefined) put('.worktreeinclude', include);
  execFileSync('npm', ['install', '--package-lock-only', '--offline', '--no-audit', '--no-fund'], { cwd: repo, stdio: 'ignore' });
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo, stdio: 'ignore' });
  git('init', '-q');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  put('node_modules/third/index.js', "module.exports = 'third';\n");
  // npm's record of what it installed, as npm would leave it: what the lockfile named. The run reads the disk instead.
  fs.copyFileSync(path.join(repo, 'package-lock.json'), path.join(repo, 'node_modules', '.package-lock.json'));
  fs.symlinkSync('../packages/x', path.join(repo, 'node_modules', 'x'));
  return repo;
};

/** `wf start` as a person types it: worktrees, the default. */
const isolated = (repo: string) => start({ brief: 'add a flag', repo, workflowDir: folder() });

test('a step\'s worktree gets what .worktreeinclude lists from the main checkout — a file, a directory — and a node_modules of its own, never a copy', async () => {
  // `/.env.local` is written the way Claude Code's gitignore syntax anchors a path at the root.
  const repo = aNodeRepo(['# what a worktree needs', '/.env.local', 'config/local/', 'node_modules', 'missing.txt', 'escape', 'notes.txt', ''].join('\n'));
  fs.writeFileSync(path.join(repo, '.env.local'), 'TOKEN=main\n');
  // Untracked, and not ignored: copied, the hand-off's `git add -A` would commit it onto the run's branch.
  fs.writeFileSync(path.join(repo, 'notes.txt'), 'TOKEN=main\n');
  fs.mkdirSync(path.join(repo, 'config/local/deeper'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'config/local/deeper/a.json'), '{"from":"main"}\n');
  const outside = fs.mkdtempSync(path.join(ROOT, 'outside-'));
  fs.writeFileSync(path.join(outside, 'secret'), 'not the step\'s\n');
  fs.symlinkSync(outside, path.join(repo, 'escape'));

  const run = isolated(repo);
  // Edited after `wf start`, which would have refused it: the cut refuses it too.
  fs.appendFileSync(path.join(repo, '.worktreeinclude'), `../${path.basename(outside)}/secret\n`);
  const { e, tasks } = board();
  const pass = await advance(e, readRun(run.id));
  const wt = readRun(run.id).steps.implement!.workspace!;
  assert.equal(wt, path.join(ROOT, 'worktrees', run.id, 'implement'), 'a worktree, as shipped');

  assert.equal(fs.readFileSync(path.join(wt, '.env.local'), 'utf8'), 'TOKEN=main\n', 'a listed file arrives');
  assert.equal(fs.readFileSync(path.join(wt, 'config/local/deeper/a.json'), 'utf8'), '{"from":"main"}\n', 'a listed directory arrives, whole');
  assert.ok(!fs.existsSync(path.join(wt, 'escape')), 'a listed path that leads out of the repository through a link is not copied');
  assert.ok(!fs.existsSync(path.join(wt, '..', path.basename(outside))), 'nor one that climbs out');
  assert.ok(!fs.existsSync(path.join(wt, 'notes.txt')), 'nor one git does not ignore');
  assert.equal(gitOut(wt, 'status', '--porcelain'), '', 'so the cut leaves nothing for the hand-off to commit');

  // `node_modules` was listed, and is not a copy: a directory of the worktree's own, linking main's
  // packages, without the file npm keeps for main's tree.
  assert.ok(fs.lstatSync(path.join(wt, 'node_modules')).isDirectory());
  assert.ok(fs.lstatSync(path.join(wt, 'node_modules/third')).isSymbolicLink());
  assert.equal(fs.realpathSync(path.join(wt, 'node_modules/x')), fs.realpathSync(path.join(wt, 'packages/x')), 'its workspace package is its own');
  assert.ok(!fs.existsSync(path.join(wt, 'node_modules/.package-lock.json')));

  assert.deepEqual(pass.notes, [
    'implement: .worktreeinclude: skipped missing.txt — not in the main checkout',
    `implement: .worktreeinclude: refused "../${path.basename(outside)}/secret" is outside the repository`,
    'implement: .worktreeinclude: refused "escape" leads outside the repository',
    'implement: .worktreeinclude: refused "notes.txt" is not gitignored — the hand-off would commit it',
  ]);
  assert.doesNotMatch(tasks.get(`${run.id}-implement`)!.spec.brief, /npm ci/, 'links cost nothing, and the brief says nothing of them');
});

test('wf start refuses a .worktreeinclude line outside the repository, by name, before a run is written', () => {
  const repo = aNodeRepo('/.env.local\n../x\nC:\\x\n');
  const runs = fs.readdirSync(path.join(ROOT, 'runs')).length;
  assert.throws(() => isolated(repo), (err: Error & { exitCode?: number }) => {
    assert.match(err.message, /"\.\.\/x" is outside the repository/);
    assert.match(err.message, /"C:\\x" is absolute/);
    assert.match(err.message, /fix or remove those lines/);
    assert.doesNotMatch(err.message, /\.env\.local/, 'a leading / is the root of the repository, and nothing to refuse');
    assert.equal(err.exitCode, 2);
    return true;
  });
  assert.equal(fs.readdirSync(path.join(ROOT, 'runs')).length, runs);
  // --no-worktree cuts nothing and copies nothing, so it has nothing to refuse.
  assert.ok(start({ brief: 'add a flag', repo, workflowDir: folder(), isolate: false }));
  // A file written for Claude Code, anchored lines and all, starts a run.
  assert.ok(isolated(aNodeRepo('# for claude --worktree\n/.env.local\n/config/local/\n')));
});

test('a worktree whose lockfile asks for what the main checkout has not installed gets its own tree from npm ci before the step is filed, and the step is told why', async () => {
  const repo = aNodeRepo();
  // A package lands in main's lockfile and is committed, and nobody has run `npm install` in main since:
  // the lockfile is ahead of the tree links would point at, and the worktree's lockfile is main's, byte for byte.
  fs.mkdirSync(path.join(repo, 'packages/y'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'packages/y/package.json'), JSON.stringify({ name: 'y', version: '1.0.0' }));
  fs.writeFileSync(path.join(repo, 'packages/y/index.js'), "module.exports = 'y';\n");
  execFileSync('npm', ['install', '--package-lock-only', '--offline', '--no-audit', '--no-fund'], { cwd: repo, stdio: 'ignore' });
  for (const args of [['add', '-A'], ['commit', '-q', '-m', 'add y']]) {
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo, stdio: 'ignore' });
  }
  assert.ok(!fs.existsSync(path.join(repo, 'node_modules/y')), 'main has not installed y');
  assert.match(fs.readFileSync(path.join(repo, 'node_modules/.package-lock.json'), 'utf8'), /node_modules\/y/,
    'though npm\'s record of main\'s tree says it has, after --package-lock-only');

  const run = isolated(repo);
  const { e, tasks } = board();
  const pass = await advance(e, readRun(run.id));
  const wt = readRun(run.id).steps.implement!.workspace!;
  assert.equal(fs.readFileSync(path.join(wt, 'package-lock.json'), 'utf8'), fs.readFileSync(path.join(repo, 'package-lock.json'), 'utf8'), 'the lockfiles agree');
  assert.deepEqual(pass.filed, ['implement']);
  assert.ok(fs.existsSync(path.join(wt, 'node_modules/.package-lock.json')), 'npm installed a tree here');
  assert.equal(fs.realpathSync(path.join(wt, 'node_modules/y')), fs.realpathSync(path.join(wt, 'packages/y')), 'with the package the lockfile names');
  assert.ok(!fs.existsSync(path.join(wt, 'node_modules/third')), 'and nothing of main\'s in it');
  assert.deepEqual(pass.notes, ['implement: node_modules: installed with npm ci — package-lock.json asks for packages the main checkout has not installed']);

  const brief = tasks.get(`${run.id}-implement`)!.spec.brief;
  const at = brief.indexOf('## Where to look');
  assert.ok(at >= 0 && brief.indexOf('`npm ci`', at) > at, 'told under Where to look');
  assert.ok(brief.indexOf('`npm ci`', at) < brief.indexOf('## When you are finished'), 'before the closeout, which stays last');
});

test('a pass that dies after cutting a worktree does not wedge every pass after it', async () => {
  const run = isolated(aNodeRepo());
  const { e, filings } = board();
  const dying = { ...(e as object), file: async () => { throw new Error('the tick died here'); } } as unknown as Engine;
  await assert.rejects(advance(dying, readRun(run.id)), /the tick died here/);
  const wt = path.join(ROOT, 'worktrees', run.id, 'implement');
  assert.ok(fs.existsSync(path.join(wt, '.git')), 'the worktree and its branch were made');

  const pass = await advance(e, readRun(run.id));
  assert.deepEqual([pass.filed, filings], [['implement'], [`${run.id}-implement`]]);
  assert.equal(readRun(run.id).steps.implement?.workspace, wt, 'in the worktree that pass cut');
});

// ─── trying again, at shipped defaults ──────────────────────────────────────

/** `wf start` over `implement` (with `keys`) → `review`, run until implement's check settles `phase`, with the exit code given. */
const throughCheck = async (keys: string, phase: TaskPhase, exitCode?: number) => {
  const run = started(folder(keys));
  const b = board();
  await advance(b.e, readRun(run.id));
  b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await advance(b.e, readRun(run.id));
  b.settle(`${run.id}-implement-check`, phase, undefined, exitCode);
  return { run, ...b };
};

const asksDir = (id: string) => path.join(ROOT, 'runs', `${id}.asks`);
/** The asks waiting in a run's directory, by name. */
const asksOf = (id: string) => (fs.existsSync(asksDir(id)) ? fs.readdirSync(asksDir(id)).filter((f) => f.startsWith('retry-')) : []);
const refusedWith = (pattern: RegExp) => (err: Error & { exitCode?: number }) => err.exitCode === 2 && pattern.test(err.message);

test('`retries: 1` re-files a step its check refused, once, continuing its session and told what the check said — and past it, files nothing', async () => {
  const { run, e, tasks, filings, settle, logs } = await throughCheck('check: npm test && npm run typecheck\nretries: 1', 'failed', 1);
  const check1 = `${run.id}-implement-check`;
  logs.set(check1, 'ok 1 - builds\nnot ok 2 - parses a trailing comma\n# fail 1\n\n[wf check] exit 1\n');
  fs.writeFileSync(path.join(ROOT, 'checks', `${check1}.stderr`), 'npm error Test failed.\n');

  const pass = await advance(e, readRun(run.id));
  const try2 = `${run.id}-implement-try2`;
  assert.deepEqual([pass.tried, pass.filed, pass.blocked, pass.status], [['implement'], [], [], 'running']);
  const spec = tasks.get(try2)!.spec;
  assert.deepEqual({ cwd: spec.cwd, resumeFrom: spec.resumeFrom, harness: spec.harness }, { cwd: run.repo, resumeFrom: `native-${run.id}-implement`, harness: undefined });
  assert.deepEqual(readRun(run.id).steps.implement, {
    taskId: try2, workspace: run.repo, branch: run.branch,
    tries: [{ taskId: `${run.id}-implement`, check: { taskId: check1 }, then: 'retries' }],
  });
  // What it is told: the command, the exit, the last lines of both streams, and not to weaken the check.
  assert.match(spec.brief, /^## Try 2\n/);
  assert.deepEqual(JSON.parse(/\n```json\n([\s\S]*?)\n```/.exec(spec.brief)![1]!), {
    command: 'npm test && npm run typecheck', exit: 1,
    stdout: 'ok 1 - builds\nnot ok 2 - parses a trailing comma\n# fail 1', stderr: 'npm error Test failed.',
  });
  assert.match(spec.brief, /Do not weaken the check to pass it/);

  await advance(e, readRun(run.id));
  assert.equal(filings.filter((f) => f === try2).length, 1, 'filed once, however many passes');

  // Try 2 signs off, is checked under an id of its own, and is refused too.
  settle(try2, 'succeeded', SIGNED);
  assert.deepEqual((await advance(e, readRun(run.id))).checked, ['implement']);
  const check2 = `${run.id}-implement-try2-check`;
  settle(check2, 'failed', undefined, 1);
  for (let i = 0; i < 3; i++) {
    const after = await advance(e, readRun(run.id));
    assert.deepEqual([after.tried, after.filed, after.checked, after.blocked, after.status], [[], [], [], ['review'], 'failed'], `pass ${i + 1}`);
  }
  assert.deepEqual(filings, [`${run.id}-implement`, check1, try2, check2], 'past `retries: 1`, nothing more');
  const l = await list(e, readRun(run.id));
  assert.deepEqual([l.waitingOnYou, l.steps[0]!.note], [['implement'], 'try 2, by retries: 1']);
});

test("`wf retry` writes a person's ask, and the tick honours it once: a second pass files nothing, and the ask is consumed whole, never edited", async () => {
  const { run, e, tasks, filings } = await throughCheck('check: npm test', 'failed', 1);
  const { ask, file } = await retry(e, run.id, 'implement', { mode: 'fresh', model: 'opus' });
  assert.equal(file, path.join(asksDir(run.id), 'retry-implement-2'));
  const written = fs.readFileSync(file, 'utf8');
  assert.deepEqual(JSON.parse(written), ask);
  assert.equal(readRun(run.id).steps.implement?.tries, undefined, 'the verb writes no record');
  assert.match((await list(e, readRun(run.id))).steps[0]!.note ?? '', /^try 2 asked \(--model opus\)/);

  const first = await advance(e, readRun(run.id));
  const try2 = `${run.id}-implement-try2`;
  assert.deepEqual(first.tried, ['implement']);
  const spec = tasks.get(try2)!.spec;
  assert.deepEqual({ model: spec.model, resumeFrom: spec.resumeFrom }, { model: 'opus', resumeFrom: undefined }, 'a new session, on the model asked for');
  assert.match(spec.brief, /## What was asked for\n\nadd a flag/, 'told everything a step starting cold is');
  assert.deepEqual(asksOf(run.id), [], 'consumed');
  assert.equal(fs.readFileSync(path.join(asksDir(run.id), 'done', 'retry-implement-2'), 'utf8'), written, 'moved whole');

  const second = await advance(e, readRun(run.id));
  assert.deepEqual([second.tried, second.filed, second.checked], [[], [], []]);

  // A pass that filed the try and wrote the record, and died before consuming the ask: the ask is spent, and files nothing.
  fs.copyFileSync(path.join(asksDir(run.id), 'done', 'retry-implement-2'), file);
  const third = await advance(e, readRun(run.id));
  assert.deepEqual([third.tried, asksOf(run.id)], [[], []]);
  assert.equal(filings.filter((f) => f === try2).length, 1);
  assert.deepEqual(readRun(run.id).steps.implement?.tries?.map((t) => [t.then, t.model]), [['fresh', 'opus']]);
});

test('a check that ended stopped spends no retry: the step waits on you, `wf decide` says its check did not finish and offers --recheck — which files a check, and no step', async () => {
  const { run, e, tasks, filings, settle } = await throughCheck('check: npm test\nretries: 2', 'stopped');
  const check1 = `${run.id}-implement-check`;
  for (let i = 0; i < 2; i++) {
    const pass = await advance(e, readRun(run.id));
    assert.deepEqual([pass.tried, pass.filed, pass.blocked, pass.status], [[], [], ['review'], 'failed']);
  }
  assert.equal(readRun(run.id).steps.implement?.tries, undefined, 'no try spent');
  assert.deepEqual((await list(e, readRun(run.id))).waitingOnYou, ['implement']);
  const { decision: d, offers } = await decide(e, run.id);
  assert.deepEqual(d.kind === 'awaiting' && [d.failedCheck, d.unfinishedCheck], [[], ['implement']]);
  assert.deepEqual(offers, [`implement: its check did not finish, so no retry was spent on it. Run the check again, and nothing else:  wf retry ${run.id} implement --recheck`]);

  await retry(e, run.id, 'implement', { mode: 'recheck' });
  const pass = await advance(e, readRun(run.id));
  const check2 = `${run.id}-implement-try2-check`;
  assert.deepEqual([pass.tried, pass.checked, pass.filed], [['implement'], ['implement'], []]);
  assert.deepEqual(filings, [`${run.id}-implement`, check1, check2], 'a check, and no step');
  assert.equal(tasks.get(check2)!.spec.harness, 'check');
  assert.deepEqual(readRun(run.id).steps.implement, {
    taskId: `${run.id}-implement`, workspace: run.repo, branch: run.branch, check: { taskId: check2 },
    tries: [{ taskId: `${run.id}-implement`, check: { taskId: check1 }, then: 'recheck' }],
  });

  settle(check2, 'succeeded', undefined, 0);
  assert.deepEqual((await advance(e, readRun(run.id))).filed, ['review'], 'the work passed as it stood');
});

test('`wf retry` refuses a running step, a cancelled run, a second ask for the same try, and a step the run retries itself — exit 2, and no ask written', async () => {
  const running = started(folder('check: npm test'));
  const b = board();
  await advance(b.e, readRun(running.id));
  b.settle(`${running.id}-implement`, 'running');
  await assert.rejects(retry(b.e, running.id, 'implement', { mode: 'nudge' }), refusedWith(/^implement is still running/));
  assert.deepEqual(asksOf(running.id), []);

  const twice = await throughCheck('check: npm test', 'failed', 1);
  await retry(twice.e, twice.run.id, 'implement', { mode: 'nudge' });
  await assert.rejects(retry(twice.e, twice.run.id, 'implement', { mode: 'recheck' }), refusedWith(/^try 2 of implement is already asked for \(--nudge/));
  assert.deepEqual(asksOf(twice.run.id), ['retry-implement-2']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(asksDir(twice.run.id), 'retry-implement-2'), 'utf8')).mode, 'nudge', 'the first ask stands');

  const called = await throughCheck('check: npm test', 'failed', 1);
  markCancelled(called.run.id);
  await assert.rejects(retry(called.e, called.run.id, 'implement', { mode: 'nudge' }), refusedWith(/was cancelled at .*never be honoured/));
  assert.deepEqual(asksOf(called.run.id), []);

  const itself = await throughCheck('check: npm test\nretries: 1', 'failed', 1);
  await assert.rejects(retry(itself.e, itself.run.id, 'implement', { mode: 'nudge' }), refusedWith(/^the run tries implement again itself/));
  assert.deepEqual(asksOf(itself.run.id), []);
});

test('a pass that filed try 2 and died before writing the run down is adopted, never filed twice — and a run cancelled in that window stops it', async () => {
  const { run, e, filings, stopped, settle } = await throughCheck('check: npm test\nretries: 1', 'failed', 1);
  const before = readRun(run.id);
  await advance(e, readRun(run.id));   // files try 2…
  writeRun(before);                    // …and, as far as the record knows, never did
  const try2 = `${run.id}-implement-try2`;

  const again = await advance(e, readRun(run.id));
  assert.deepEqual(again.tried, [], 'adopted before the pass assessed anything, so there was nothing left to file');
  assert.equal(filings.filter((f) => f === try2).length, 1);
  assert.deepEqual([readRun(run.id).steps.implement?.taskId, readRun(run.id).steps.implement?.tries?.map((t) => t.then)], [try2, ['retries']]);

  // The same window, and the run called off in it.
  writeRun(before);
  settle(try2, 'running');
  const { plan } = await cancel(e, run.id);
  assert.deepEqual(plan, { kind: 'cancel', stop: [{ name: 'implement', taskId: try2 }] }, 'the verb finds it');
  await advance(e, readRun(run.id));
  assert.deepEqual(stopped, [try2, try2], 'and so does every pass');
  assert.equal(filings.filter((f) => f === try2).length, 1);
});

test('an ask file the run cannot read is not honoured, and not touched: the pass says so, and files nothing', async () => {
  const { run, e, filings } = await throughCheck('check: npm test', 'failed', 1);
  fs.mkdirSync(asksDir(run.id), { recursive: true });
  fs.writeFileSync(path.join(asksDir(run.id), 'retry-implement-2'), 'try harder');
  fs.writeFileSync(path.join(asksDir(run.id), 'retry-review-2'), JSON.stringify({ mode: 'harder' }));
  const pass = await advance(e, readRun(run.id));
  assert.deepEqual(pass.tried, []);
  assert.ok(pass.notes.some((n) => /retry-implement-2: unreadable .* so it is not honoured/.test(n)), pass.notes.join('\n'));
  assert.ok(pass.notes.some((n) => /retry-review-2: it asks for no mode wf retry knows \("harder"\)/.test(n)), pass.notes.join('\n'));
  assert.deepEqual(asksOf(run.id), ['retry-implement-2', 'retry-review-2']);
  assert.equal(filings.length, 2);
});

test("a step named for another step's try is refused at `wf start`, before anything is spent", () => {
  const dir = folder();
  fs.writeFileSync(path.join(dir, 'implement-try2.md'), '---\nafter: implement\n---\na step of its own\n');
  const runs = fs.readdirSync(path.join(ROOT, 'runs')).length;
  assert.throws(() => start({ brief: 'add a flag', repo: aRepo(), workflowDir: dir }), (err: Error & { exitCode?: number }) =>
    err.exitCode === 2 && /^implement-try2: a step may not be named for another step's try/.test(err.message) && /Rename implement-try2\.md/.test(err.message));
  assert.equal(fs.readdirSync(path.join(ROOT, 'runs')).length, runs);
});

test('`wf retry` takes one way to try, and `--model` with a name — anything else is refused before a run is read', async () => {
  const { main } = await import('../src/cli.ts');
  for (const [flags, pattern] of [
    [['--fresh', '--recheck'], /pick one of --nudge, --fresh, --model <m>, --recheck/],
    [['--model'], /--model takes the model/],
    [['--model', '--fresh'], /--model takes the model/],
    [['--harder'], /does not take --harder/],
  ] as const) {
    await assert.rejects(main(['retry', 'no-such-run', 'implement', ...flags]), refusedWith(pattern), flags.join(' '));
  }
});

// ─── going round again, at shipped defaults ─────────────────────────────────

/** `findings` and `again`, as `workflows/review.schema.json` declares them. */
const LOOPING = { ...FINDINGS, properties: { ...FINDINGS.properties, again: { type: 'boolean' } }, required: ['findings', 'again'] };

/** implement, checked → review, looping back to it with `rounds:` at its default unless `reviewKeys` say — the shape `workflows/` ships. */
const looped = (reviewKeys = '') => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\ncheck: npm test\n---\nimplement it\n');
  fs.writeFileSync(path.join(dir, 'review.md'), `---\nafter: implement\noutput: review.schema.json\nloop: implement\n${reviewKeys}---\nreview it\n`);
  fs.writeFileSync(path.join(dir, 'review.schema.json'), JSON.stringify(LOOPING, null, 2));
  return dir;
};
const REPLIES = [{ finding: 'src/flag.ts:12', answer: 'fixed', why: 'the flag is parsed before it is read' }];
const reviewSays = (again: boolean) => ({ ...SIGNED, summary: 'REVIEWER-SUMMARY', findings: FOUND, again });
const ANSWERED = { ...SIGNED, summary: 'IMPLEMENTER-SUMMARY', replies: REPLIES };
/** A step's task on round `n`: its first try's id, then its try's. */
const onRound = (id: string, step: string, n: number) => (n === 1 ? `${id}-${step}` : `${id}-${step}-try${n}`);

/**
 * Round `n` up to review's word: implement's try signs off — answering, past round 1 — and its check is filed and passes, then review is
 * filed and signs off saying `again`. The pass that reads that word is the caller's.
 */
const toReview = async (b: ReturnType<typeof board>, id: string, n: number, again: boolean) => {
  b.settle(onRound(id, 'implement', n), 'succeeded', n === 1 ? SIGNED : ANSWERED);
  assert.deepEqual((await advance(b.e, readRun(id))).checked, ['implement'], `round ${n}: implement's check`);
  b.settle(`${onRound(id, 'implement', n)}-check`, 'succeeded', undefined, 0);
  assert.deepEqual((await advance(b.e, readRun(id))).filed, ['review'], `round ${n}: review`);
  b.settle(onRound(id, 'review', n), 'succeeded', reviewSays(again));
};
const roundAsksOf = (id: string) => (fs.existsSync(asksDir(id)) ? fs.readdirSync(asksDir(id)).filter((f) => f.startsWith('round-')) : []);
/** The JSON under a brief's `heading`. */
const dataUnder = (brief: string, heading: string) => JSON.parse(new RegExp(`${heading}\\n[\\s\\S]*?\\n\`\`\`json\\n([\\s\\S]*?)\\n\`\`\``).exec(brief)![1]!);

test('implement ⇄ review: `again: true` files round 2 — implement continued as -try2, handed the findings and not the summary; review a new session as -try2, handed the replies — and `again: false` ends the run', async () => {
  const run = started(looped());
  const b = board();
  await advance(b.e, readRun(run.id));
  await toReview(b, run.id, 1, true);
  const pass = await advance(b.e, readRun(run.id));
  const try2 = `${run.id}-implement-try2`;
  assert.deepEqual([pass.looped, pass.filed, pass.tried, pass.status], [['review'], [], [], 'running']);
  assert.ok(pass.notes.includes('review: round 2 — again, rounds: 3; implement goes again'), pass.notes.join('\n'));

  const spec = b.tasks.get(try2)!.spec;
  assert.deepEqual({ resumeFrom: spec.resumeFrom, cwd: spec.cwd }, { resumeFrom: `native-${run.id}-implement`, cwd: run.repo }, "implement's own session, continued");
  assert.match(spec.brief, /^## Round 2 of 3\n/);
  assert.deepEqual(dataUnder(spec.brief, '## From review'), { findings: FOUND });
  assert.doesNotMatch(spec.brief, /REVIEWER-SUMMARY|"again"/);
  assert.deepEqual((spec.closeoutSchema as { required: string[] }).required, ['outcome', 'summary', 'artifacts', 'needs', 'replies']);
  assert.deepEqual(readRun(run.id).steps, {
    implement: { taskId: try2, workspace: run.repo, branch: run.branch, tries: [{ taskId: `${run.id}-implement`, check: { taskId: `${run.id}-implement-check` }, then: 'round' }] },
    review: { taskId: null, workspace: run.repo, branch: run.branch, tries: [{ taskId: `${run.id}-review`, then: 'round' }] },
  });
  assert.deepEqual((await list(b.e, readRun(run.id))).steps.map((s) => [s.name, s.note]), [['implement', 'round 2 of 3'], ['review', 'round 2 of 3']]);
  await advance(b.e, readRun(run.id));
  assert.equal(b.filings.filter((f) => f === try2).length, 1, 'filed once, however many passes');

  await toReview(b, run.id, 2, false);
  const review2 = b.tasks.get(`${run.id}-review-try2`)!.spec;
  assert.equal(review2.resumeFrom, undefined, 'the reviewer is a new session each round');
  assert.match(review2.brief, /^review it\n\n## What was asked for\n\nadd a flag/);
  assert.deepEqual(dataUnder(review2.brief, '## Replies from implement'), { replies: REPLIES });
  assert.doesNotMatch(review2.brief, /IMPLEMENTER-SUMMARY|REVIEWER-SUMMARY/);

  const last = await advance(b.e, readRun(run.id));
  assert.deepEqual([last.looped, last.filed, last.status], [[], [], 'succeeded']);
  assert.deepEqual(b.filings, [`${run.id}-implement`, `${run.id}-implement-check`, `${run.id}-review`, try2, `${try2}-check`, `${run.id}-review-try2`]);
  const { decision: d, closeouts } = await decide(b.e, run.id);
  assert.deepEqual(d.kind === 'awaiting' && [d.outcome, d.exhausted], ['succeeded', []]);
  assert.deepEqual((closeouts.implement as { output?: object }).output, { replies: REPLIES }, "what decide prints beside the review's findings");
});

test("REFUSED at the cap, at shipped defaults: `again: true` on round 3 files nothing, reads exhausted and waits on you — and `wf round` takes it once more, once", async () => {
  const run = started(looped());
  const b = board();
  await advance(b.e, readRun(run.id));
  for (const n of [1, 2]) {
    await toReview(b, run.id, n, true);
    assert.deepEqual((await advance(b.e, readRun(run.id))).looped, ['review'], `round ${n + 1}`);
  }
  await toReview(b, run.id, 3, true);
  const filed = [...b.filings];
  for (let i = 0; i < 3; i++) {
    const pass = await advance(b.e, readRun(run.id));
    assert.deepEqual([pass.looped, pass.filed, pass.tried, pass.checked, pass.status], [[], [], [], [], 'failed'], `pass ${i + 1}`);
  }
  assert.deepEqual(b.filings, filed, 'nothing filed at the cap');
  const l = await list(b.e, readRun(run.id));
  assert.deepEqual([l.steps[1]!.status, l.steps[1]!.note, l.waitingOnYou], ['rounds exhausted', `round 3 of 3, and it asked again — once more: wf round ${run.id} review`, ['review']]);
  const { decision: d, offers, closeouts } = await decide(b.e, run.id);
  assert.deepEqual(d.kind === 'awaiting' && [d.outcome, d.exhausted, d.failed], ['blocked', ['review'], []]);
  assert.deepEqual(offers, [`review: it asked for round 4, and \`rounds: 3\` are spent. Its findings are below. Once more — implement continued, then a new review:  wf round ${run.id} review`]);
  assert.deepEqual((closeouts.review as { output?: object }).output, { findings: FOUND, again: true }, 'the last findings, for decide to print');

  // A person's once more: an ask, written whole, and no record.
  const { ask, file } = await round(b.e, run.id);
  assert.equal(file, path.join(asksDir(run.id), 'round-review-4'));
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), ask);
  assert.deepEqual([ask.step, ask.round, readRun(run.id).steps.implement?.taskId], ['review', 4, `${run.id}-implement-try3`], 'the verb writes no record');
  await assert.rejects(round(b.e, run.id), refusedWith(/^round 4 of review's loop is already asked for/));
  assert.match((await list(b.e, readRun(run.id))).steps[1]!.note ?? '', /^round 4 asked \(wf round\) — the next tick files implement/);

  const pass = await advance(b.e, readRun(run.id));
  assert.deepEqual(pass.looped, ['review']);
  assert.match(b.tasks.get(`${run.id}-implement-try4`)!.spec.brief, /^## Round 4, past rounds: 3\n\nreview asked for another round after the 3 its `rounds:` allows, and a person said once more/);
  assert.deepEqual(roundAsksOf(run.id), [], 'consumed');
  assert.ok(fs.existsSync(path.join(asksDir(run.id), 'done', 'round-review-4')), 'moved whole');
  await assert.rejects(round(b.e, run.id), refusedWith(/^round 4 of review's loop is still running/));

  // A pass that filed the round and wrote the record, and died before consuming the ask: the ask is spent, and files nothing.
  fs.copyFileSync(path.join(asksDir(run.id), 'done', 'round-review-4'), file);
  const again = await advance(b.e, readRun(run.id));
  assert.deepEqual([again.looped, again.filed, roundAsksOf(run.id)], [[], [], []]);
  assert.equal(b.filings.filter((f) => f === `${run.id}-implement-try4`).length, 1);
});

test('`wf round` refuses a round still running, a round the run files itself and a cancelled run — exit 2, and no ask written', async () => {
  const run = started(looped('rounds: 1\n'));
  const b = board();
  await advance(b.e, readRun(run.id));
  await assert.rejects(round(b.e, run.id), refusedWith(/^round 1 of review's loop is still running, so there is nothing to go round again until it ends/));
  assert.deepEqual(roundAsksOf(run.id), []);

  const more = started(looped());
  const m = board();
  await advance(m.e, readRun(more.id));
  await toReview(m, more.id, 1, true);
  await assert.rejects(round(m.e, more.id), refusedWith(/^the run goes round again itself: review asked for another round, and `rounds: 3` has 2 left/));
  assert.deepEqual(roundAsksOf(more.id), []);

  // `rounds: 1`: round 1 is the last, so review is out of rounds — and then the run is called off.
  await toReview(b, run.id, 1, true);
  assert.deepEqual((await advance(b.e, readRun(run.id))).looped, []);
  markCancelled(run.id);
  await assert.rejects(round(b.e, run.id), refusedWith(/was cancelled at .*a round would never be honoured/));
  await assert.rejects(round(b.e, run.id, 'review'), refusedWith(/was cancelled at /));
  assert.deepEqual(roundAsksOf(run.id), []);

  const { main } = await import('../src/cli.ts');
  await assert.rejects(main(['round', 'no-such-run', 'review', 'again']), refusedWith(/^wf round takes the run and, when the run has more than one loop, the step/));
});

test('a pass that filed a round and died before writing the run down is adopted, never filed twice — and a run cancelled in that window stops it', async () => {
  const run = started(looped());
  const b = board();
  await advance(b.e, readRun(run.id));
  await toReview(b, run.id, 1, true);
  const before = readRun(run.id);
  await advance(b.e, readRun(run.id));   // files round 2…
  writeRun(before);                      // …and, as far as the record knows, never did
  const try2 = `${run.id}-implement-try2`;

  const again = await advance(b.e, readRun(run.id));
  assert.deepEqual(again.looped, [], 'adopted before the pass assessed anything, so there was nothing left to file');
  assert.equal(b.filings.filter((f) => f === try2).length, 1);
  const record = readRun(run.id).steps;
  assert.deepEqual([record.implement?.taskId, record.review?.taskId, record.review?.tries?.map((t) => t.then)], [try2, null, ['round']]);

  // The same window, and the run called off in it.
  writeRun(before);
  b.settle(try2, 'running');
  const { plan } = await cancel(b.e, run.id);
  assert.deepEqual(plan, { kind: 'cancel', stop: [{ name: 'implement', taskId: try2 }] }, 'the verb finds it');
  assert.equal(readRun(run.id).steps.implement?.taskId, `${run.id}-implement`, 'and does not write the run to do so');
  await advance(b.e, readRun(run.id));
  assert.deepEqual(b.stopped, [try2, try2], 'and so does every pass');
  assert.equal(b.filings.filter((f) => f === try2).length, 1);
});

test('the shipped workflow goes round as its folder says: review filed read-only on codex, asked for `again` and told its round — implement filed as round 2 asked for `replies`, and checked', async () => {
  const run = started(path.join(import.meta.dirname, '..', 'workflows'));
  const b = board();
  await advance(b.e, readRun(run.id));
  await toReview(b, run.id, 1, true);
  const review = b.tasks.get(`${run.id}-review`)!.spec;
  assert.deepEqual([review.harness, review.permissionMode], ['codex', 'read-only']);
  assert.deepEqual((review.closeoutSchema as { required: string[] }).required, ['outcome', 'summary', 'artifacts', 'needs', 'findings', 'again']);
  assert.match(review.brief, /\n## Round 1 of 3\n\nThis step closes a loop \(`loop: implement`\)/);

  assert.deepEqual((await advance(b.e, readRun(run.id))).looped, ['review']);
  const implement = b.tasks.get(`${run.id}-implement-try2`)!.spec;
  assert.deepEqual((implement.closeoutSchema as { required: string[] }).required, ['outcome', 'summary', 'artifacts', 'needs', 'replies']);
  assert.match(implement.brief, /^## Round 2 of 3\n[\s\S]*\*\*Say why not\.\*\*[\s\S]*## Before you sign off\n[\s\S]*`npm test && npm run typecheck`/);
});

test('a round ask file the run cannot read is not honoured, and not touched: the pass says so, and files nothing', async () => {
  const run = started(looped('rounds: 1\n'));
  const b = board();
  await advance(b.e, readRun(run.id));
  await toReview(b, run.id, 1, true);
  assert.deepEqual((await advance(b.e, readRun(run.id))).looped, [], 'out of rounds, on the first');
  fs.mkdirSync(asksDir(run.id), { recursive: true });
  fs.writeFileSync(path.join(asksDir(run.id), 'round-review-2'), 'once more, please');
  fs.writeFileSync(path.join(asksDir(run.id), 'round-review-3'), '[]');
  const filed = b.filings.length;
  const pass = await advance(b.e, readRun(run.id));
  assert.deepEqual(pass.looped, []);
  assert.ok(pass.notes.some((n) => /round-review-2: unreadable .* so it is not honoured — remove it, and ask with wf round/.test(n)), pass.notes.join('\n'));
  assert.ok(pass.notes.some((n) => /round-review-3: it is not an ask wf round wrote, so it is not honoured/.test(n)), pass.notes.join('\n'));
  assert.deepEqual(roundAsksOf(run.id), ['round-review-2', 'round-review-3']);
  assert.equal(b.filings.length, filed);
});

test("REFUSED before the fix, now handed: a fresh try of implement inside round 2 gets the round's findings off review's try that asked — review's own place is unfiled — and owes replies to them", async () => {
  const run = started(looped());
  const b = board();
  await advance(b.e, readRun(run.id));
  await toReview(b, run.id, 1, true);
  assert.deepEqual((await advance(b.e, readRun(run.id))).looped, ['review']);
  b.settle(`${run.id}-implement-try2`, 'succeeded', { ...SIGNED, summary: 'IMPLEMENTER-SUMMARY' });   // signed, and answered nothing
  const pass = await advance(b.e, readRun(run.id));
  assert.deepEqual([pass.checked, pass.blocked], [[], ['review']]);
  assert.match((await list(b.e, readRun(run.id))).steps[0]!.status, /^unsigned/);

  await retry(b.e, run.id, 'implement', { mode: 'fresh' });
  assert.deepEqual((await advance(b.e, readRun(run.id))).tried, ['implement']);
  const spec = b.tasks.get(`${run.id}-implement-try3`)!.spec;
  assert.equal(spec.resumeFrom, undefined, 'a new session');
  assert.match(spec.brief, /\n## Try 3\n[\s\S]*\n## Round 2 of 3\n[\s\S]*\*\*Say why not\.\*\*/);
  assert.deepEqual(dataUnder(spec.brief, '## From review'), { findings: FOUND });
  assert.doesNotMatch(spec.brief, /REVIEWER-SUMMARY|IMPLEMENTER-SUMMARY/);
  assert.deepEqual((spec.closeoutSchema as { required: string[] }).required, ['outcome', 'summary', 'artifacts', 'needs', 'replies']);
});

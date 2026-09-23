/**
 * The run store, where a person's cancellation meets the daemon's writes.
 *
 * Everything else about cancelling is a pure decision and lives in run.test.ts. This is the part
 * that is not pure and cannot be: two writers on one run, and a tick that takes seconds to make up
 * its mind. `wf cancel` is meant to be typed while `wf up` is running — that is the whole point of
 * the verb — so "what happens when they overlap" is a property worth pinning down.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createEngine, nameFor, type Engine, type PromiseJournal, type PromiseRunner, type Sighting, type TaskView } from 'agent-runtime';
import type { Run, TaskPhase } from '../src/run.ts';
import type { RetryHow } from '../src/retry.ts';
import { readCheckBrief, verdictWord } from '../src/check.ts';

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-store-'));
const WORKFLOW = path.join(ROOT, 'workflow');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
fs.mkdirSync(WORKFLOW, { recursive: true });
fs.writeFileSync(path.join(WORKFLOW, 'implement.md'), 'implement it\n');
fs.writeFileSync(path.join(WORKFLOW, 'review.md'), '---\nafter: implement\n---\nreview it\n');

// WF_ROOT is read as the module loads, so it is set before the import rather than after it.
process.env.WF_ROOT = ROOT;
const { HARNESSES, accept, advance, approve, artifactFiles, artifactsDir, cancel, closeoutAsked, decide, exitVerdicts, forget, forgetLine: forgetLineOf, list, listRuns, markCancelled, missingArtifacts, parentOf, phaseOfView, readAnswers, readAsks, readRun, retry, round, say, start, startPlan, stepsOf } = await import('../src/runner.ts');

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
  const tasks = new Map<string, { spec: Filed; phase: TaskPhase; closeout?: unknown; exitCode?: number; reason?: string | string[]; usage?: object }>();
  const filings: string[] = [];
  const stopped: string[] = [];
  const logs = new Map<string, string>();
  /** What the engine journalled as said to each task (`say`), in order: its view's `state.said`. */
  const said = new Map<string, Array<{ at: string; attempt: number; text: string }>>();
  /** Tasks whose session is not given the words: `say` rejects, with no exit code, and journals nothing. */
  const deaf = new Set<string>();
  /** What the harness says each task's session waits for, as `claude agents` says it: the engine carries it onto the view (`TaskView.waitingFor`). */
  const waiting = new Map<string, string>();
  let clock = Date.parse('2026-09-14T16:00:00.000Z');
  const e = {
    view: async (id: string) => {
      const t = tasks.get(id);
      const settled = t && ['succeeded', 'failed', 'stopped'].includes(t.phase) ? t.phase : null;
      const reasons = Array.isArray(t?.reason) ? t.reason : [t?.reason];
      return {
        id, phase: t?.phase ?? 'pending', sessionId: t ? 's' : null,
        ...(waiting.get(id) ? { waitingFor: waiting.get(id) } : {}),
        state: {
          brief: t?.spec.brief ?? '', closeoutSchema: t?.spec.closeoutSchema, settled, stopRequested: false, said: said.get(id) ?? [],
          // An attempt given a reason ended `failed` with it, as the engine records a session that went quiet unsigned, or broke. What it
          // consumed is on it once it has settled, and not before: a `--bg` session writes its cost as its process exits. Given several reasons,
          // one attempt ended with each, in order, and the last carries what the task settled with.
          attempts: !t || t.phase === 'pending' ? [] : reasons.map((reason, i) => (i < reasons.length - 1
            ? { n: i + 1, ended: 'failed', reason, nativeId: `native-${id}`, exitCode: null, usage: null }
            : {
              n: i + 1, ended: null, nativeId: `native-${id}`, closeout: t.closeout, exitCode: t.exitCode ?? null, usage: settled && t.usage ? t.usage : null,
              ...(reason ? { ended: 'failed', reason } : {}),
            })),
        },
      };
    },
    file: async (spec: Filed) => { filings.push(spec.id); tasks.set(spec.id, { spec, phase: 'pending' }); return spec.id; },
    stop: async (id: string) => { stopped.push(id); },
    logs: async (id: string) => logs.get(id) ?? '(no output yet)',
    // The engine's `say`, as far as a run can tell it: refused in its words, exit code 2, for empty words, a task it has no record of, one
    // settled and one not started; rejected with no exit code for a session not given the words; otherwise journalled on the task, and returned.
    say: async (id: string, text: string) => {
      const refuse = (why: string) => Object.assign(new Error(`say: ${why}`), { exitCode: 2 });
      if (!text.trim()) throw refuse('`text` is empty. Give the words the session should hear.');
      const t = tasks.get(id);
      if (!t) throw refuse(`\`${id}\` is not a task on this board. \`ae ls\`, or \`list()\`, gives the ones it has.`);
      if (['succeeded', 'failed', 'stopped'].includes(t.phase)) throw refuse(`\`${id}\` has settled (${t.phase}): no session of it is running to hear anything.`);
      if (t.phase === 'pending') throw refuse(`\`${id}\` has not started an attempt yet, so there is no session to hear anything.`);
      if (deaf.has(id)) throw new Error(`say: ae/${id}/1 was not given the words (connect ECONNREFUSED). Nothing was journalled.`);
      const entry = { at: new Date((clock += 60_000)).toISOString(), attempt: 1, text };
      said.set(id, [...(said.get(id) ?? []), entry]);
      return entry;
    },
  } as unknown as Engine;
  const settle = (id: string, phase: TaskPhase, closeout?: unknown, exitCode?: number, reason?: string | string[], usage?: object) => Object.assign(tasks.get(id)!, { phase, closeout, exitCode, reason, usage });
  return { e, tasks, filings, stopped, settle, logs, said, deaf, waiting };
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
    // Handed off in the pass that filed its check: what it left is committed once for this try, and never again (`handOffDue`).
    handedOff: `${run.id}-implement`,
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
    assert.ok(brief.includes(`- Put it in \`${files}\`, and name it in \`artifacts\` by absolute path.`), `${name}: ${brief}`);
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

  assert.deepEqual(missingArtifacts(readRun(run.id), 'implement', declaring(declared)), [{ path: path.join(files, 'never-written.png'), why: 'missing' }, { path: path.join(files, 'shots'), why: 'missing' }], 'a directory is not a file');
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
  assert.deepEqual(missingArtifacts(readRun(run.id), 'implement', declaring(outside)), outside.map((p) => ({ path: p, why: 'outside' })));
  const looked = spies.flatMap((spy) => spy.mock.calls.map((call) => String(call.arguments[0])))
    .filter((p) => outside.some((o) => path.resolve(p) === path.resolve(o)));
  assert.deepEqual(looked, [], 'refused without being opened, stat-ed or resolved');

  // A link inside the directory that leads out is as outside as where it leads, and is not listed.
  fs.symlinkSync(secret, path.join(files, 'link.txt'));
  assert.deepEqual(missingArtifacts(readRun(run.id), 'implement', declaring([path.join(files, 'link.txt')])), [{ path: path.join(files, 'link.txt'), why: 'missing' }]);
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
/** What a verb refused with, once it has said it was a refusal — for a message to read more than one thing in, and to read something out of. */
const refusal = async (p: Promise<unknown>): Promise<string> => {
  const err = await p.then(() => undefined, (e: Error & { exitCode?: number }) => e);
  assert.ok(err?.exitCode === 2, `expected a refusal, got ${err ? err.message : 'no error'}`);
  return err!.message;
};

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
  assert.deepEqual({ model: spec.config?.model, resumeFrom: spec.resumeFrom }, { model: 'opus', resumeFrom: undefined }, 'a new session, on the model asked for');
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

/** implement, checked → review, looping back to it with `rounds:` at its default unless `reviewKeys` say — the shape `workflows/` ships. Each key set ends with a newline. */
const looped = (reviewKeys = '', implementKeys = '') => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), `---\ncheck: npm test\n${implementKeys}---\nimplement it\n`);
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
  assert.deepEqual(offers, [
    `review: it asked for round 4, and \`rounds: 3\` are spent. Its findings are below. Once more — implement continued, then a new review:  wf round ${run.id} review`,
    `review: enough — go on with what is there; its findings stay on the record, and the run ends with them on the record:  wf accept ${run.id} review --message "<why>"`,
  ]);
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

/** implement ⇄ review as `looped()` builds it, and a gated ship after the loop: the ending an acceptance exists to reach. */
const loopedThenShip = (reviewKeys = '') => {
  const dir = looped(reviewKeys);
  fs.writeFileSync(path.join(dir, 'ship.md'), '---\nafter: review\ngate: true\n---\nship it\n');
  return dir;
};
const acceptAsksOf = (id: string) => (fs.existsSync(asksDir(id)) ? fs.readdirSync(asksDir(id)).filter((f) => f.startsWith('accept-')) : []);
/** Why a person judged the loop's findings later work rather than this run's. */
const ENOUGH = 'the finding is a case no shipped team has: follow-up work, not this run.';

test("`wf accept` at the cap ends the loop on a person's word: the ask is written whole and no record, the next tick files the ending to its gate, and its brief carries the words and the findings", async () => {
  const run = started(loopedThenShip());
  const b = board();
  await advance(b.e, readRun(run.id));
  for (const n of [1, 2]) {
    await toReview(b, run.id, n, true);
    assert.deepEqual((await advance(b.e, readRun(run.id))).looped, ['review'], `round ${n + 1}`);
  }
  await toReview(b, run.id, 3, true);
  assert.deepEqual((await advance(b.e, readRun(run.id))).filed, [], 'at the cap the ending is never filed, and that is what this is for');

  // A person's word: an ask of its own, written whole, beside the retry and round asks — and no record.
  const { acceptance, file } = await accept(b.e, run.id, undefined, ENOUGH);
  assert.equal(file, path.join(asksDir(run.id), 'accept-review-3'));
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), acceptance);
  assert.deepEqual([acceptance.step, acceptance.try, acceptance.message], ['review', 3, ENOUGH]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(ROOT, 'runs', `${run.id}.json`), 'utf8')).acceptances, undefined, 'the verb writes no record');
  assert.deepEqual(readRun(run.id).acceptances, [acceptance], 'the tick composes it on read');
  await assert.rejects(accept(b.e, run.id, undefined, ENOUGH), refusedWith(/^try 3 of review is already accepted, at /));
  await assert.rejects(round(b.e, run.id), refusedWith(/^review asked for round 4, and a person accepted its work as it stands at .*take that acceptance back first/));

  const l = await list(b.e, readRun(run.id));
  assert.deepEqual([l.steps[1]!.status, l.steps[1]!.note], ['unverified · done', `round 3 of 3, and it asked again — accepted as it stands at ${acceptance.at}, its findings open`]);

  // The next tick files what waits on the loop, as if review had said `again: false` — and hands it the words and what is still open.
  const pass = await advance(b.e, readRun(run.id));
  assert.deepEqual([pass.filed, pass.looped, pass.tried, pass.status], [['ship'], [], [], 'running']);
  assert.deepEqual(acceptAsksOf(run.id), ['accept-review-3'], 'and the acceptance stays where it was written, as an approval does');
  const brief = b.tasks.get(`${run.id}-ship`)!.spec.brief;
  assert.match(brief, /\n## Accepted\n/);
  assert.match(brief, /\(`wf accept`, try 3, at /);
  assert.ok(brief.includes(ENOUGH), 'the words they gave, for the shipper and whoever reads the merge');
  assert.deepEqual(dataUnder(brief, '## From review'), { findings: FOUND }, 'and the findings the loop ended with open');
  assert.doesNotMatch(brief, /REVIEWER-SUMMARY|"again"/);
  assert.deepEqual((await advance(b.e, readRun(run.id))).filed, [], 'filed once, however many passes');

  // A gated ending goes to its gate and is approved or not as ever: the loop ended, the run did not.
  b.settle(`${run.id}-ship`, 'succeeded', SIGNED);
  await advance(b.e, readRun(run.id));
  const held = await list(b.e, readRun(run.id));
  assert.deepEqual([held.steps[2]!.status, held.waitingOnYou], ['awaiting approval', ['ship']]);
  const { decision: d, offers, accepted } = await decide(b.e, run.id);
  assert.deepEqual(d.kind === 'awaiting' && [d.outcome, d.exhausted, d.awaitingApproval], ['blocked', [], ['ship']]);
  assert.deepEqual(offers, [], 'no round is offered any more: the loop is over');
  assert.deepEqual(accepted, { review: `accepted as it stands ${acceptance.at.slice(11, 16)}Z, its findings open — "${ENOUGH}"` });
  await approve(b.e, run.id, 'ship', 'the findings are filed as follow-up');
  assert.equal((await advance(b.e, readRun(run.id))).status, 'succeeded');
});

test('an acceptance file the run cannot read is not honoured, and not touched: the pass says so, and the loop is still out of rounds', async () => {
  const run = started(loopedThenShip());
  const b = board();
  await advance(b.e, readRun(run.id));
  for (const n of [1, 2]) { await toReview(b, run.id, n, true); await advance(b.e, readRun(run.id)); }
  await toReview(b, run.id, 3, true);
  await advance(b.e, readRun(run.id));

  fs.mkdirSync(asksDir(run.id), { recursive: true });
  const file = path.join(asksDir(run.id), 'accept-review-3');
  const bad = [
    ['{ not json', /unreadable \(/],
    ['[]', /it is not an acceptance wf accept wrote/],
    ['{"at":"now","message":"enough"}', /it says no time it was given/],
    ['{"at":"2026-09-20T14:05:00.000Z"}', /it says nothing of why the work is good enough/],
    ['{"at":"2026-09-20T14:05:00.000Z","message":"  "}', /its message is empty/],
  ] as const;
  for (const [written, why] of bad) {
    fs.writeFileSync(file, written);
    const pass = await advance(b.e, readRun(run.id));
    assert.deepEqual([pass.filed, pass.status], [[], 'failed'], written);
    assert.ok(pass.notes.some((n) => why.test(n)), `${written}: ${pass.notes.join(' | ')}`);
    assert.equal(fs.readFileSync(file, 'utf8'), written, 'not touched');
    assert.equal((await list(b.e, readRun(run.id))).steps[1]!.status, 'rounds exhausted');
  }
});

/** The same loop, closed by a step with no gate: what waits on the loop runs the moment the loop is over, and nobody is asked. */
const loopedThenDocs = () => {
  const dir = looped();
  fs.writeFileSync(path.join(dir, 'docs.md'), '---\nafter: review\n---\nwrite it up\n');
  return dir;
};

test('an acceptance a tick has acted on is not a file to delete: the round refuses with what there is instead — and refuses again if it is deleted anyway', async () => {
  const run = started(loopedThenDocs());
  const b = board();
  await advance(b.e, readRun(run.id));
  for (const n of [1, 2]) { await toReview(b, run.id, n, true); await advance(b.e, readRun(run.id)); }
  await toReview(b, run.id, 3, true);
  assert.deepEqual((await advance(b.e, readRun(run.id))).filed, [], 'at the cap, nothing after the loop');

  // Before a tick has acted on it, taking the acceptance back is the way back into the loop: nothing has been done on its strength.
  const { file } = await accept(b.e, run.id, undefined, ENOUGH);
  const early = await refusal(round(b.e, run.id));
  assert.match(early, /^review asked for round 4, and a person accepted its work as it stands at .*Nothing waiting on it has been filed yet, so to go round once more after all, take that acceptance back first — accept-review-3, in the run's \.asks directory — then ask again: wf round /);

  // Once one has, it is not: docs has run on the work, and taking the word back takes none of that back. So the refusal says what there is.
  assert.deepEqual((await advance(b.e, readRun(run.id))).filed, ['docs'], 'the tick files what waited, as if review had said `again: false`');
  const late = await refusal(round(b.e, run.id));
  assert.match(late, /^review asked for round 4, and a person accepted its work as it stands at .* \(wf accept\), so its loop is over on their word and there is nothing to go round again\. What waits on it has been filed: wf ls /);
  assert.doesNotMatch(late, /take that acceptance back|\.asks directory/, 'and does not send them to delete it');

  // Deleted anyway — an acceptance is level-triggered, unlike a round ask, so the loop reads out of rounds again and a round would be filed.
  fs.rmSync(file);
  assert.equal(readRun(run.id).acceptances, undefined);
  assert.equal((await list(b.e, readRun(run.id))).steps[1]!.status, 'rounds exhausted', 'which is the standing a round is filed from');
  const anyway = await refusal(round(b.e, run.id));
  assert.match(anyway, /^docs waits on review and has already been filed \(running\), so a round would file implement again under a step that ran on its work, and take none of that back\./);
  assert.match(anyway, /deleting that acceptance does not delete docs\. See where the run stands, and what there is to do: wf decide /);
  assert.deepEqual(roundAsksOf(run.id), [], 'and no ask is written');
  assert.deepEqual((await advance(b.e, readRun(run.id))).looped, [], 'nor does a pass go round of its own accord');
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
  assert.deepEqual([review.harness, review.config?.permissionMode], ['codex', 'read-only']);
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

// ─── what a step may have: `tools:` and `effort:` ───────────────────────────

test('REFUSED before, now carried: a step with `tools:` and `effort:` reaches `e.file` with exactly that list and that effort — on its first filing, a try `retries:` files, and a try `wf retry` asks for', async () => {
  const TOOLS = ['Read', 'Grep', 'Glob', 'Bash'];
  const { run, e, tasks, settle } = await throughCheck('check: npm test\nretries: 1\ntools: Read, Grep, Glob, Bash\neffort: high', 'failed', 1);
  const first = tasks.get(`${run.id}-implement`)!.spec;
  assert.deepEqual([first.config?.tools, first.config?.effort], [TOOLS, 'high'], 'the first filing');

  assert.deepEqual((await advance(e, readRun(run.id))).tried, ['implement']);
  const nudged = tasks.get(`${run.id}-implement-try2`)!.spec;
  assert.deepEqual([nudged.config?.tools, nudged.config?.effort, nudged.resumeFrom], [TOOLS, 'high', `native-${run.id}-implement`], 'the try `retries:` files, continuing the session');

  settle(`${run.id}-implement-try2`, 'succeeded', SIGNED);
  assert.deepEqual((await advance(e, readRun(run.id))).checked, ['implement']);
  settle(`${run.id}-implement-try2-check`, 'failed', undefined, 1);
  await retry(e, run.id, 'implement', { mode: 'fresh', model: 'opus' });
  assert.deepEqual((await advance(e, readRun(run.id))).tried, ['implement']);
  const fresh = tasks.get(`${run.id}-implement-try3`)!.spec;
  assert.deepEqual([fresh.config?.tools, fresh.config?.effort, fresh.config?.model, fresh.resumeFrom], [TOOLS, 'high', 'opus', undefined], 'a new session on the model asked for, fenced the same');

  // The check is the run's own, on a harness with no tools to narrow.
  const check = tasks.get(`${run.id}-implement-check`)!.spec;
  assert.deepEqual([check.harness, check.config?.tools, check.config?.effort], ['check', undefined, undefined]);
});

test('a step with `context:` reaches `e.file` as its tokens, `contextTokens` — on its first filing, a try `retries:` files, and a try `wf retry` asks for; a check has none', async () => {
  const { run, e, tasks, settle } = await throughCheck('check: npm test\nretries: 1\ncontext: 200k', 'failed', 1);
  assert.equal(tasks.get(`${run.id}-implement`)!.spec.config?.contextTokens, 200_000, 'the first filing, as the number the line was read into');

  assert.deepEqual((await advance(e, readRun(run.id))).tried, ['implement']);
  const nudged = tasks.get(`${run.id}-implement-try2`)!.spec;
  assert.deepEqual([nudged.config?.contextTokens, nudged.resumeFrom], [200_000, `native-${run.id}-implement`], 'the try `retries:` files, continuing the session on its window');

  settle(`${run.id}-implement-try2`, 'succeeded', SIGNED);
  assert.deepEqual((await advance(e, readRun(run.id))).checked, ['implement']);
  settle(`${run.id}-implement-try2-check`, 'failed', undefined, 1);
  await retry(e, run.id, 'implement', { mode: 'fresh' });
  assert.deepEqual((await advance(e, readRun(run.id))).tried, ['implement']);
  assert.equal(tasks.get(`${run.id}-implement-try3`)!.spec.config?.contextTokens, 200_000, 'a new session, on the same window');

  assert.equal(tasks.get(`${run.id}-implement-check`)!.spec.config?.contextTokens, undefined, "the check is the run's own, and has no session");
  const plain = started(folder());
  const b = board();
  await advance(b.e, readRun(plain.id));
  assert.equal(b.tasks.get(`${plain.id}-implement`)!.spec.config?.contextTokens, undefined, "no line, no window: the model's own");
});

test("a step that continues another's session (`resume:`) is filed with that session's window, and with no line of its own inherits it — a retry of it too", async () => {
  // REFUSED before `sessionContext`: respond was filed with its own `context:`, none, and its copy of implement's session ran on the whole window.
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\ncontext: 200k\n---\nimplement it\n');
  fs.writeFileSync(path.join(dir, 'respond.md'), '---\nresume: implement\ncheck: npm test\n---\nanswer it\n');
  const run = started(dir);
  const { e, tasks, settle } = board();
  await advance(e, readRun(run.id));
  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  assert.deepEqual((await advance(e, readRun(run.id))).filed, ['respond']);
  const respond = tasks.get(`${run.id}-respond`)!.spec;
  assert.deepEqual([respond.resumeFrom, respond.config?.contextTokens], [`native-${run.id}-implement`, 200_000]);

  settle(`${run.id}-respond`, 'succeeded', SIGNED);
  assert.deepEqual((await advance(e, readRun(run.id))).checked, ['respond']);
  settle(`${run.id}-respond-check`, 'failed', undefined, 1);
  await retry(e, run.id, 'respond', { mode: 'nudge', message: 'the test fails' });
  assert.deepEqual((await advance(e, readRun(run.id))).tried, ['respond']);
  assert.equal(tasks.get(`${run.id}-respond-try2`)!.spec.config?.contextTokens, 200_000, 'its nudge, continuing the same chain');
});

test('a step with `disallow:` reaches `e.file` with exactly those rules as `disallowedTools` — on its first filing, a try `retries:` files, and a try `wf retry` asks for', async () => {
  const RULES = ['Bash(npm run build)', 'Bash(npm run e2e)', 'SendMessage'];
  const { run, e, tasks, settle } = await throughCheck('check: npm test\nretries: 1\ndisallow: Bash(npm run build), Bash(npm run e2e), SendMessage', 'failed', 1);
  assert.deepEqual(tasks.get(`${run.id}-implement`)!.spec.config?.disallowedTools, RULES, 'the first filing');

  assert.deepEqual((await advance(e, readRun(run.id))).tried, ['implement']);
  const nudged = tasks.get(`${run.id}-implement-try2`)!.spec;
  assert.deepEqual([nudged.config?.disallowedTools, nudged.resumeFrom], [RULES, `native-${run.id}-implement`], 'the try `retries:` files, continuing the session');

  settle(`${run.id}-implement-try2`, 'succeeded', SIGNED);
  assert.deepEqual((await advance(e, readRun(run.id))).checked, ['implement']);
  settle(`${run.id}-implement-try2-check`, 'failed', undefined, 1);
  await retry(e, run.id, 'implement', { mode: 'fresh' });
  assert.deepEqual((await advance(e, readRun(run.id))).tried, ['implement']);
  assert.deepEqual(tasks.get(`${run.id}-implement-try3`)!.spec.config?.disallowedTools, RULES, 'a new session, denied the same');

  assert.equal(tasks.get(`${run.id}-implement-check`)!.spec.config?.disallowedTools, undefined, "the check is the run's own, and denied nothing");
});

test('a step with `allow:` reaches `e.file` with exactly those rules as `allowedTools` — on its first filing, a try `retries:` files, and a try `wf retry` asks for', async () => {
  const RULES = ['Edit(**)', 'Bash(npm test)'];
  const { run, e, tasks, settle } = await throughCheck('check: npm test\nretries: 1\nallow: Edit(**), Bash(npm test)', 'failed', 1);
  assert.deepEqual(tasks.get(`${run.id}-implement`)!.spec.config?.allowedTools, RULES, 'the first filing');

  assert.deepEqual((await advance(e, readRun(run.id))).tried, ['implement']);
  const nudged = tasks.get(`${run.id}-implement-try2`)!.spec;
  assert.deepEqual([nudged.config?.allowedTools, nudged.resumeFrom], [RULES, `native-${run.id}-implement`], 'the try `retries:` files, continuing the session');

  settle(`${run.id}-implement-try2`, 'succeeded', SIGNED);
  assert.deepEqual((await advance(e, readRun(run.id))).checked, ['implement']);
  settle(`${run.id}-implement-try2-check`, 'failed', undefined, 1);
  await retry(e, run.id, 'implement', { mode: 'fresh' });
  assert.deepEqual((await advance(e, readRun(run.id))).tried, ['implement']);
  assert.deepEqual(tasks.get(`${run.id}-implement-try3`)!.spec.config?.allowedTools, RULES, 'a new session, allowed the same');

  assert.equal(tasks.get(`${run.id}-implement-check`)!.spec.config?.allowedTools, undefined, "the check is the run's own, and is allowed nothing");
});

test("at shipped defaults a step names neither, and is filed with neither: the harness's own tools, at its own effort", async () => {
  const run = started(folder());
  const { e, tasks } = board();
  await advance(e, readRun(run.id));
  const spec = tasks.get(`${run.id}-implement`)!.spec;
  assert.deepEqual([spec.config?.tools, spec.config?.disallowedTools, spec.config?.effort], [undefined, undefined, undefined]);
});

test("a round files its target with the target's tools, deny list and effort, and the looping step — a new session each round — with its own", async () => {
  const REVIEWS = ['Read', 'Grep', 'Glob', 'Bash'];
  const EDITS = ['Read', 'Edit', 'Write', 'Bash'];
  const run = started(looped('tools: Read, Grep, Glob, Bash\ndisallow: Bash(npm run build)\neffort: max\n', 'tools: Read, Edit, Write, Bash\ndisallow: SendMessage\nallow: Edit(**)\neffort: low\n'));
  const b = board();
  await advance(b.e, readRun(run.id));
  const implement1 = b.tasks.get(`${run.id}-implement`)!.spec;
  assert.deepEqual([implement1.config?.tools, implement1.config?.disallowedTools, implement1.config?.allowedTools, implement1.config?.effort], [EDITS, ['SendMessage'], ['Edit(**)'], 'low']);
  await toReview(b, run.id, 1, true);
  const review1 = b.tasks.get(`${run.id}-review`)!.spec;
  assert.deepEqual([review1.config?.tools, review1.config?.disallowedTools, review1.config?.allowedTools, review1.config?.effort], [REVIEWS, ['Bash(npm run build)'], undefined, 'max'], 'the looping step, which allows nothing of its own');

  assert.deepEqual((await advance(b.e, readRun(run.id))).looped, ['review']);
  const implement2 = b.tasks.get(`${run.id}-implement-try2`)!.spec;
  assert.deepEqual([implement2.config?.tools, implement2.config?.disallowedTools, implement2.config?.allowedTools, implement2.config?.effort, implement2.resumeFrom], [EDITS, ['SendMessage'], ['Edit(**)'], 'low', `native-${run.id}-implement`], 'the round, continuing implement');
  await toReview(b, run.id, 2, false);
  const review2 = b.tasks.get(`${run.id}-review-try2`)!.spec;
  assert.deepEqual([review2.config?.tools, review2.config?.disallowedTools, review2.config?.effort, review2.resumeFrom], [REVIEWS, ['Bash(npm run build)'], 'max', undefined], "round 2's review");
});

// ─── a run in flight keeps its momentum: `priority` ─────────────────────────

/** The `priority` each task of a run was filed with, by the name the run gives it: `implement`, `implement-check`, `review-try2`. */
const prioritiesOf = (b: ReturnType<typeof board>, id: string) =>
  Object.fromEntries([...b.tasks].filter(([task]) => task.startsWith(`${id}-`)).map(([task, t]) => [task.slice(id.length + 1), t.spec.priority]));

test('a run in flight keeps its momentum: its first step is filed with no `priority`, and everything after it — its check, a step after another, a round, a try `retries:` files and one `wf retry` asks for — with `priority: 1`', async () => {
  // implement → its check → review, looping back: round 2's implement, continued, its check, and a new session of review.
  const run = started(looped());
  const b = board();
  await advance(b.e, readRun(run.id));
  await toReview(b, run.id, 1, true);
  assert.deepEqual((await advance(b.e, readRun(run.id))).looped, ['review']);
  await toReview(b, run.id, 2, false);
  assert.deepEqual(prioritiesOf(b, run.id), {
    implement: undefined, 'implement-check': 1, review: 1, 'implement-try2': 1, 'implement-try2-check': 1, 'review-try2': 1,
  });

  // A try `retries:` files, its check, and a try `wf retry` asks for.
  const tried = await throughCheck('check: npm test\nretries: 1', 'failed', 1);
  assert.deepEqual((await advance(tried.e, readRun(tried.run.id))).tried, ['implement']);
  tried.settle(`${tried.run.id}-implement-try2`, 'succeeded', SIGNED);
  assert.deepEqual((await advance(tried.e, readRun(tried.run.id))).checked, ['implement']);
  tried.settle(`${tried.run.id}-implement-try2-check`, 'failed', undefined, 1);
  await retry(tried.e, tried.run.id, 'implement', { mode: 'fresh' });
  assert.deepEqual((await advance(tried.e, readRun(tried.run.id))).tried, ['implement']);
  assert.deepEqual(prioritiesOf(tried, tried.run.id), {
    implement: undefined, 'implement-check': 1, 'implement-try2': 1, 'implement-try2-check': 1, 'implement-try3': 1,
  });
});

test('a run\'s first steps are every step that waits on nothing: two roots filed with no `priority`, and the step that joins them with `priority: 1`', async () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'left.md'), 'the left half\n');
  fs.writeFileSync(path.join(dir, 'right.md'), 'the right half\n');
  fs.writeFileSync(path.join(dir, 'join.md'), '---\nafter: left, right\n---\njoin them\n');
  const run = start({ brief: 'two halves', repo: aRepo(), workflowDir: dir });
  const b = board();
  assert.deepEqual((await advance(b.e, readRun(run.id))).filed.sort(), ['left', 'right']);
  b.settle(`${run.id}-left`, 'succeeded', SIGNED);
  b.settle(`${run.id}-right`, 'succeeded', SIGNED);
  assert.deepEqual((await advance(b.e, readRun(run.id))).filed, ['join']);
  assert.deepEqual(prioritiesOf(b, run.id), { left: undefined, right: undefined, join: 1 });
});

/** The engine's store, in memory, as its own tests keep one. */
const memoryJournal = (): PromiseJournal => {
  const tasks = new Map<string, Parameters<PromiseJournal['append']>[1][]>();
  const feed: Awaited<ReturnType<PromiseJournal['feed']>>['entries'] = [];
  return {
    async append(taskId, event) { tasks.set(taskId, [...(tasks.get(taskId) ?? []), event]); feed.push({ taskId, event }); },
    async read(taskId) { return [...(tasks.get(taskId) ?? [])]; },
    async list() { return [...tasks.keys()].sort(); },
    async feed(after) { return { entries: feed.slice(after as number | undefined), cursor: feed.length }; },
  };
};

/** A harness that starts whatever it is asked to, and remembers the order: every session at work. */
const startsInOrder = (sessions: Map<string, Sighting>): PromiseRunner => ({
  async spawn(r) { sessions.set(r.name, { sessionId: `s-${sessions.size + 1}`, state: 'working' }); },
  async observe() { return new Map(sessions); },
  async stop() {},
  async logs() { return ''; },
});

test("REFUSED without the momentum: at a ceiling of one, the engine's own admission gives the slot to a run's next step before a newer run's first step filed ahead of it — and, filed with no `priority`, to the newer run", async () => {
  // Run a's implement has ended; run b starts, and files its implement; then a's review is filed — after it, a pass later.
  const a = started(folder());
  const b = started(folder());
  const filedBy = board();
  await advance(filedBy.e, readRun(a.id));
  await advance(filedBy.e, readRun(b.id));
  filedBy.settle(`${a.id}-implement`, 'succeeded', SIGNED);
  assert.deepEqual((await advance(filedBy.e, readRun(a.id))).filed, ['review']);
  const newer = filedBy.tasks.get(`${b.id}-implement`)!.spec;
  const next = filedBy.tasks.get(`${a.id}-review`)!.spec;
  assert.deepEqual([newer.priority, next.priority], [undefined, 1]);

  /** The two filings, handed to an engine with one slot in the order the run filed them, and the session its first pass starts. */
  const admitted = async (strip: boolean) => {
    const sessions = new Map<string, Sighting>();
    const e = createEngine({ journal: memoryJournal(), harnesses: { claude: startsInOrder(sessions) }, defaultHarness: 'claude', maxConcurrent: 1 });
    const as = (spec: typeof next) => ({ ...spec, harness: 'claude', ...(strip ? { priority: undefined } : {}) }) as Parameters<Engine['file']>[0];
    await e.file(as(newer));
    await new Promise((r) => setTimeout(r, 5));
    await e.file(as(next));
    await e.tick();
    return [...sessions.keys()];
  };
  assert.deepEqual(await admitted(false), [nameFor(`${a.id}-review`, 1)], "the run in flight's next step, filed later");
  assert.deepEqual(await admitted(true), [nameFor(`${b.id}-implement`, 1)], 'without it, the newer run, filed first');
});

// ─── a step reachable from a phone: `remote:` ───────────────────────────────

test('a step with `background: true` and `remote: true` reaches `e.file` with both — on its first filing, a try `retries:` files, and a try `wf retry` asks for — and its check, and a step without the lines, with neither', async () => {
  const { run, e, tasks, settle } = await throughCheck('check: npm test\nretries: 1\nbackground: true\nremote: true', 'failed', 1);
  const both = (id: string) => [tasks.get(id)!.spec.config?.background, tasks.get(id)!.spec.config?.remoteControl];
  assert.deepEqual(both(`${run.id}-implement`), [true, true], 'the first filing');

  assert.deepEqual((await advance(e, readRun(run.id))).tried, ['implement']);
  const nudged = tasks.get(`${run.id}-implement-try2`)!.spec;
  assert.deepEqual([nudged.config?.background, nudged.config?.remoteControl, nudged.resumeFrom], [true, true, `native-${run.id}-implement`], 'the try `retries:` files, continuing the session');

  settle(`${run.id}-implement-try2`, 'succeeded', SIGNED);
  assert.deepEqual((await advance(e, readRun(run.id))).checked, ['implement']);
  settle(`${run.id}-implement-try2-check`, 'failed', undefined, 1);
  await retry(e, run.id, 'implement', { mode: 'fresh' });
  assert.deepEqual((await advance(e, readRun(run.id))).tried, ['implement']);
  assert.deepEqual(both(`${run.id}-implement-try3`), [true, true], 'a new session, bridged the same');

  // The check is the run's own, on a harness the engine refuses a bridge for; and review never said the word.
  assert.deepEqual([tasks.get(`${run.id}-implement-check`)!.spec.harness, ...both(`${run.id}-implement-check`)], ['check', undefined, undefined]);
  settle(`${run.id}-implement-try3`, 'succeeded', SIGNED);
  await advance(e, readRun(run.id));
  settle(`${run.id}-implement-try3-check`, 'succeeded', undefined, 0);
  assert.deepEqual((await advance(e, readRun(run.id))).filed, ['review']);
  assert.deepEqual(both(`${run.id}-review`), [undefined, undefined], 'never a default: a job, unbridged');
});

test('a round files its target bridged as the target says, and the looping step — a new session each round — as it says', async () => {
  const run = started(looped('background: true\nremote: true\n'));
  const b = board();
  await advance(b.e, readRun(run.id));
  assert.equal(b.tasks.get(`${run.id}-implement`)!.spec.config?.remoteControl, undefined);
  await toReview(b, run.id, 1, true);
  assert.equal(b.tasks.get(`${run.id}-review`)!.spec.config?.remoteControl, true);
  assert.deepEqual((await advance(b.e, readRun(run.id))).looped, ['review']);
  assert.equal(b.tasks.get(`${run.id}-implement-try2`)!.spec.config?.remoteControl, undefined, 'the round, continuing implement');
  await toReview(b, run.id, 2, false);
  assert.equal(b.tasks.get(`${run.id}-review-try2`)!.spec.config?.remoteControl, true, "round 2's review");

  const other = started(looped('', 'background: true\nremote: true\n'));
  const c = board();
  await advance(c.e, readRun(other.id));
  await toReview(c, other.id, 1, true);
  assert.deepEqual((await advance(c.e, readRun(other.id))).looped, ['review']);
  assert.deepEqual([c.tasks.get(`${other.id}-implement-try2`)!.spec.config?.remoteControl, c.tasks.get(`${other.id}-review`)!.spec.config?.remoteControl], [true, undefined]);
  // And run as the target says, a round being a session of it: a background session again, and review a job.
  assert.deepEqual([c.tasks.get(`${other.id}-implement-try2`)!.spec.config?.background, c.tasks.get(`${other.id}-review`)!.spec.config?.background], [true, undefined]);
});

test("REFUSED at `wf start`, in the engine's words, with nothing written: `remote: true` on every harness the engine refuses `remoteControl` for — codex and claude-detached — and on a claude job; taken on a claude background session, and `remote: false` on any", async () => {
  const engine = createEngine({ root: fs.mkdtempSync(path.join(ROOT, 'engine-')), journal: memoryJournal(), harnesses: HARNESSES });
  /** What the engine's own door says to `remoteControl: true` on `harness`: the whole message, or undefined when it files the task. */
  const engineRefuses = async (harness: string, background?: boolean): Promise<string | undefined> => {
    try {
      await engine.file({ brief: 'b', cwd: '/w', harness, config: { remoteControl: true, ...(background ? { background } : {}) } });
      return undefined;
    } catch (err) {
      return (err as Error).message;
    }
  };
  /** Its reason on a harness that bridges nothing. */
  const engineSays = async (harness: string): Promise<string | undefined> => {
    const said = await engineRefuses(harness);
    if (said === undefined) return undefined;
    const reason = new RegExp(`^file: \`remoteControl: true\` asks for a session bridged to claude\\.ai, and the \`${harness}\` harness (.*?)\\. File the task on \`claude\``).exec(said)?.[1];
    assert.ok(reason, said);
    return reason;
  };
  const runs = () => fs.readdirSync(path.join(ROOT, 'runs')).sort();
  const withRemote = (harness: string, word = 'true') => folder(`harness: ${harness}\nremote: ${word}`);
  const refusedAtStart = (dir: string, message: string, label: string) => {
    const repo = aRepo();
    const before = runs();
    assert.throws(() => start({ brief: 'add a flag', repo, workflowDir: dir, isolate: false }), (err: Error & { exitCode?: number }) => err.exitCode === 2 && err.message === message, label);
    assert.deepEqual(runs(), before, `nothing written for ${label}`);
    assert.equal(gitOut(repo, 'branch', '--list').split('\n').length, 1, 'and no branch cut');
    // And a plan whose card names such a workflow is refused before its first run is started.
    const plan = fs.mkdtempSync(path.join(ROOT, 'plan-'));
    fs.writeFileSync(path.join(plan, 'card.md'), `---\nworkflow: ${dir}\n---\nadd a flag\n`);
    assert.throws(() => startPlan({ dir: plan, repo }), (err: Error & { exitCode?: number }) => err.exitCode === 2 && err.message.includes(message), `a plan on ${label}`);
    assert.deepEqual(runs(), before, `nothing written for a plan on ${label}`);
  };

  for (const harness of ['codex', 'claude-detached']) {
    const reason = await engineSays(harness);
    assert.ok(reason, `the engine refuses it on ${harness}`);
    refusedAtStart(withRemote(harness), `implement: \`remote: true\` asks for a session bridged to claude.ai, and the \`${harness}\` harness ${reason}. Run the step on claude with \`background: true\` — delete \`harness: ${harness}\` — or delete \`remote: true\`.`, harness);
    // `remote: false` asks for nothing, and the engine files it on any harness: so does start.
    assert.ok(started(withRemote(harness, 'false')).id);
  }

  // On claude, a job opens no bridge: the engine refuses it, and so does start — named, or by default — in its words.
  const job = await engineRefuses('claude');
  const why = /^file: `remoteControl: true` bridges a session to claude\.ai, and (.*?)\. Give `config\.background: true` as well/.exec(job ?? '')?.[1];
  assert.ok(why, job);
  for (const [dir, label] of [[withRemote('claude'), 'claude named'], [folder('remote: true'), 'claude by default']] as const) {
    refusedAtStart(dir, `implement: \`remote: true\` bridges a session to claude.ai, and ${why}. Write \`background: true\` beside it, or delete \`remote: true\`.`, label);
  }

  // A background session is bridged: the engine files it, and so does start.
  assert.equal(await engineRefuses('claude', true), undefined);
  for (const dir of [folder('harness: claude\nbackground: true\nremote: true'), folder('background: true\nremote: true')]) {
    const run = started(dir);
    const b = board();
    await advance(b.e, readRun(run.id));
    assert.deepEqual([b.tasks.get(`${run.id}-implement`)!.spec.config?.background, b.tasks.get(`${run.id}-implement`)!.spec.config?.remoteControl], [true, true]);
  }
});

// ─── what a consumer reads without a log: `phaseOfView`, `closeoutAsked`, `exitVerdicts` ───

/** Every task a run's record names, viewed once, as the tick views them: all the exports are given — no engine, and so no log. */
const viewsOf = async (e: Engine, run: Run): Promise<Map<string, TaskView>> => {
  const views = new Map<string, TaskView>();
  for (const { taskId, check } of Object.values(run.steps)) {
    if (taskId) views.set(taskId, await e.view(taskId));
    if (check) views.set(check.taskId, await e.view(check.taskId));
  }
  return views;
};

test('REFUSED as a verdict: `exitVerdicts` reads `unfinished` for a check whose attempt has no exit code — the word `wf ls` reads off the log — and no retry is spent on it', async () => {
  const refused = await throughCheck('check: npm test\nretries: 1', 'failed', 1);
  refused.logs.set(`${refused.run.id}-implement-check`, 'not ok 1 - parses a trailing comma\n\n[wf check] exit 1\n');
  // Killed at its deadline: the engine settles it `failed`, with no exit code on its attempt and no trailer on its log.
  const killed = await throughCheck('check: npm test\nretries: 1', 'failed');
  killed.logs.set(`${killed.run.id}-implement-check`, 'ok 1 - builds\n');
  // Cut at its deadline with an exit code on its end — a script that traps the signal and exits — is cut all the same:
  // the engine ends it `deadline` since P0.5, and the code on that end is how it died, not a verdict on the work.
  const cut = await throughCheck('check: npm test\nretries: 1', 'failed', 143);
  cut.settle(`${cut.run.id}-implement-check`, 'failed', undefined, 143, 'deadline');
  cut.logs.set(`${cut.run.id}-implement-check`, 'ok 1 - builds\n');

  for (const [b, verdict] of [[refused, 1], [killed, 'unfinished'], [cut, 'unfinished']] as const) {
    const run = readRun(b.run.id);
    const verdictOf = exitVerdicts(await viewsOf(b.e, run), run);
    assert.equal(verdictOf('implement'), verdict);
    assert.equal(verdictOf('review'), undefined, 'a step with no check filed has no verdict at all');
    assert.equal((await list(b.e, run)).steps[0]!.status, `failed ✗ check (${verdictWord(verdict)})`, "`wf ls`'s word, which it read off the log");
  }
  assert.deepEqual((await advance(killed.e, readRun(killed.run.id))).tried, [], 'a check that did not finish spends no retry');
  assert.deepEqual((await advance(cut.e, readRun(cut.run.id))).tried, [], 'nor does one cut at its deadline, whatever code it exited with');
  assert.deepEqual((await advance(refused.e, readRun(refused.run.id))).tried, ['implement'], 'a refusal does');
});

test("`phaseOfView` and `closeoutAsked` say what `wf ls` says: `unknown` for a task the engine has no record of, not `pending`; `unsigned` only for a step that was asked for its closeout", async () => {
  const b = board();
  const run = started(folder());
  await advance(b.e, readRun(run.id));
  const implement = `${run.id}-implement`;
  // Filed, and waiting for a slot.
  let views = await viewsOf(b.e, readRun(run.id));
  assert.deepEqual([phaseOfView(views.get(implement)), (await list(b.e, readRun(run.id))).steps[0]!.status], ['pending', 'pending']);

  // A record naming a task the engine has no record of. The engine folds it to a filed task's state, and says `pending`;
  // `wf ls` said so too, which is in flight, for a task nobody will ever move.
  const lost = aRun('r-lost', { implement: { taskId: 'r-lost-implement' }, review: { taskId: null } });
  writeRun(lost);
  const lostView = await b.e.view('r-lost-implement');
  assert.equal(lostView.phase, 'pending', "the engine's own word");
  assert.deepEqual([phaseOfView(lostView), phaseOfView(undefined), (await list(b.e, lost)).steps[0]!.status], ['unknown', 'unknown', 'unknown']);

  // Settled without the closeout the run asked for.
  b.settle(implement, 'succeeded');
  views = await viewsOf(b.e, readRun(run.id));
  assert.deepEqual([phaseOfView(views.get(implement)), closeoutAsked(views)(implement)], ['succeeded', true]);
  assert.equal((await list(b.e, readRun(run.id))).steps[0]!.status, 'unsigned');

  // A task from before closeouts was never asked for one, so it is not unsigned: it lists `unverified`.
  const before = aRun('r-before', { implement: { taskId: 't-before' }, review: { taskId: null } });
  const { e: old } = engineWith({ 't-before': 'succeeded' });
  const oldViews = await viewsOf(old, before);
  assert.deepEqual([phaseOfView(oldViews.get('t-before')), closeoutAsked(oldViews)('t-before'), (await list(old, before)).steps[0]!.status], ['succeeded', false, 'unverified']);
});

/**
 * The run's one sign-off nudge of an unsigned implement, filed by the next pass and ended unsigned in its turn: what leaves the step on a
 * person at shipped defaults (`retriesDue`, `by: 'signoff'`).
 */
async function nudgedUnsigned(b: ReturnType<typeof board>, runId: string): Promise<void> {
  const pass = await advance(b.e, readRun(runId));
  assert.deepEqual(pass.tried, ['implement'], 'the run nudges it to sign off, itself');
  assert.equal(readRun(runId).steps.implement?.tries?.at(-1)?.then, 'signoff');
  b.settle(`${runId}-implement-try2`, 'failed', undefined, undefined, 'unsigned');
}

test('UNSIGNED at shipped defaults, now that the engine settles it `failed`: a step whose session went quiet without its closeout waits on you, the run is blocked, and a nudge is told it gave none — a step that failed for another reason still reads `failed`', async () => {
  // Each as the engine records it (agent-runtime's open issues, *Quiet without a closeout*): the attempt ended `failed` with its reason, the
  // task settled `failed`, and nothing said.
  const through = async (reason: 'unsigned' | 'harness') => {
    const b = board();
    const run = started(folder());
    await advance(b.e, readRun(run.id));
    b.settle(`${run.id}-implement`, 'failed', undefined, undefined, reason);
    // Unsigned, the run nudges it itself first, once (`retriesDue`, `signoff`); this nudge ends unsigned too, and the step is a person's.
    if (reason === 'unsigned') await nudgedUnsigned(b, run.id);
    return { ...b, run };
  };
  const quiet = await through('unsigned');
  const broke = await through('harness');
  const askedOf = async (b: typeof quiet) => {
    // The first try's task, as the engine records it — the step is on the nudge after it when unsigned.
    const first = `${b.run.id}-implement`;
    const views = new Map([[first, await b.e.view(first)]]);
    return [phaseOfView(views.get(first)), closeoutAsked(views)(first)];
  };
  assert.deepEqual(await askedOf(quiet), ['failed', 'unsigned']);
  assert.deepEqual(await askedOf(broke), ['failed', true]);

  const cases = [
    { b: quiet, word: 'unsigned', outcome: 'blocked', onYou: ['implement'], told: 'The last try ended without the closeout the run asked for' },
    { b: broke, word: 'failed', outcome: 'failed', onYou: [], told: "The last try's session ended `failed` before it signed off." },
  ];
  for (const { b, word, outcome, onYou, told } of cases) {
    const pass = await advance(b.e, readRun(b.run.id));
    assert.deepEqual([pass.filed, pass.blocked], [[], ['review']], word);
    const l = await list(b.e, readRun(b.run.id));
    assert.deepEqual([l.steps[0]!.status, l.waitingOnYou], [word, onYou], word);
    const { decision: d } = await decide(b.e, b.run.id);
    assert.deepEqual(d.kind === 'awaiting' && { outcome: d.outcome, unsigned: d.unsigned, failed: d.failed },
      { outcome, unsigned: word === 'unsigned' ? ['implement'] : [], failed: word === 'failed' ? ['implement'] : [] }, word);

    await retry(b.e, b.run.id, 'implement', { mode: 'nudge' });
    assert.deepEqual((await advance(b.e, readRun(b.run.id))).tried, ['implement'], word);
    const brief = b.tasks.get(readRun(b.run.id).steps.implement!.taskId!)!.spec.brief;
    assert.ok(brief.includes(told), `${word}: the try is told ${told}`);
  }
});

test("UNSIGNED is read off the LAST attempt: a step of `maxAttempts: 2` whose attempt 1 went quiet and whose nudge was `lost` reads `failed` on `wf ls`, `wf decide` and a try's brief — and one lost, then quiet, reads `unsigned`", async () => {
  const through = async (reasons: string[]) => {
    const b = board();
    const run = started(folder('maxAttempts: 2'));
    await advance(b.e, readRun(run.id));
    assert.equal(b.tasks.get(`${run.id}-implement`)!.spec.maxAttempts, 2, 'filed with two attempts');
    b.settle(`${run.id}-implement`, 'failed', undefined, undefined, reasons);
    if (reasons.at(-1) === 'unsigned') await nudgedUnsigned(b, run.id);
    return { ...b, run };
  };
  const cases = [
    { reasons: ['unsigned', 'lost'], asked: true, word: 'failed', outcome: 'failed', onYou: [], told: "The last try's session ended `failed` before it signed off." },
    { reasons: ['lost', 'unsigned'], asked: 'unsigned', word: 'unsigned', outcome: 'blocked', onYou: ['implement'], told: 'The last try ended without the closeout the run asked for' },
  ];
  for (const { reasons, asked, word, outcome, onYou, told } of cases) {
    const b = await through(reasons);
    const taskId = `${b.run.id}-implement`;
    // The first try's task: unsigned, the step is on the run's nudge after it.
    const views = new Map([[taskId, await b.e.view(taskId)]]);
    assert.deepEqual(views.get(taskId)!.state.attempts.map((a) => a.reason), reasons, 'two attempts on the view');
    assert.deepEqual([phaseOfView(views.get(taskId)), closeoutAsked(views)(taskId)], ['failed', asked], word);
    const l = await list(b.e, readRun(b.run.id));
    assert.deepEqual([l.steps[0]!.status, l.waitingOnYou], [word, onYou], word);
    const { decision: d } = await decide(b.e, b.run.id);
    assert.deepEqual(d.kind === 'awaiting' && { outcome: d.outcome, unsigned: d.unsigned, failed: d.failed },
      { outcome, unsigned: word === 'unsigned' ? ['implement'] : [], failed: word === 'failed' ? ['implement'] : [] }, word);
    await retry(b.e, b.run.id, 'implement', { mode: 'nudge' });
    assert.deepEqual((await advance(b.e, readRun(b.run.id))).tried, ['implement'], word);
    const now = readRun(b.run.id).steps.implement!.taskId!;
    assert.ok(b.tasks.get(now)!.spec.brief.includes(told), `${word}: the try is told ${told}`);
  }
});

test("`wf retry --message` writes the answer on the person's ask and nothing else; the tick carries it into the try's brief as `## Your answer`, once, and `wf ls` says the try was answered", async () => {
  const run = started(folder());
  const { e, tasks, filings, settle } = board();
  await advance(e, readRun(run.id));
  settle(`${run.id}-implement`, 'succeeded', { outcome: 'blocked', summary: 'two readings', artifacts: [], needs: 'Rename --flag, or keep it?' });
  await advance(e, readRun(run.id));

  const answer = 'Keep it.\nThe flag is public: say so in the README.';
  const record = fs.readFileSync(path.join(ROOT, 'runs', `${run.id}.json`), 'utf8');
  const { ask, file } = await retry(e, run.id, 'implement', { mode: 'nudge', message: answer });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { step: 'implement', try: 2, mode: 'nudge', message: answer, at: ask.at });
  assert.equal(fs.readFileSync(path.join(ROOT, 'runs', `${run.id}.json`), 'utf8'), record, 'the verb writes no record');
  assert.equal((await list(e, readRun(run.id))).steps[0]!.note, 'try 2 asked (--nudge, with your answer) — the next tick files it');

  const pass = await advance(e, readRun(run.id));
  const try2 = `${run.id}-implement-try2`;
  assert.deepEqual(pass.tried, ['implement']);
  assert.ok(pass.notes.includes('implement: try 2 — wf retry --nudge, with your answer'), pass.notes.join('\n'));
  const brief = tasks.get(try2)!.spec.brief;
  assert.match(brief, /^## Try 2\n\nThe last try signed off `blocked`\./, 'its session continued, told why it is back');
  assert.ok(brief.includes(`\n\n## Your answer\n\n\`\`\`text\n${answer}\n\`\`\``), brief);
  assert.equal(readRun(run.id).steps.implement?.tries?.[0]?.then, 'nudge');
  assert.ok(!fs.readFileSync(path.join(ROOT, 'runs', `${run.id}.json`), 'utf8').includes('say so in the README'), 'the record keeps no message');
  assert.deepEqual(asksOf(run.id), [], 'consumed');

  settle(try2, 'running');
  assert.equal((await list(e, readRun(run.id))).steps[0]!.note, 'try 2, nudged on your word, answered', 'read off the consumed ask');
  assert.deepEqual(readAnswers(run.id), [{ ...ask }]);
  await advance(e, readRun(run.id));
  assert.equal(filings.filter((f) => f === try2).length, 1, 'honoured once');
});

test('REFUSED: `wf retry` with an empty --message, or --message on --recheck — exit 2, by name, and no ask written; the CLI refuses before it reads a run', async () => {
  const { run, e } = await throughCheck('check: npm test', 'stopped');
  await assert.rejects(retry(e, run.id, 'implement', { mode: 'nudge', message: ' \n' }), refusedWith(/^--message is empty/));
  await assert.rejects(retry(e, run.id, 'implement', { mode: 'recheck', message: 'the suite is fixed' }),
    refusedWith(/^--message carries your answer into the try's brief, and --recheck files no session to read it/));
  assert.deepEqual(asksOf(run.id), []);
  // Not refused: a message to a step whose check did not finish. It did not sign off blocked, and a person may still have something to say.
  await retry(e, run.id, 'implement', { mode: 'fresh', message: 'main has the fix for the flake' });
  assert.deepEqual(asksOf(run.id), ['retry-implement-2']);

  const { main } = await import('../src/cli.ts');
  for (const [flags, pattern] of [
    [['--message', ''], /^--message is empty/],
    [['--recheck', '--message', 'the second reading'], /^--message carries your answer into the try's brief, and --recheck files no session/],
    [['--message'], /^--message takes what to tell the step, quoted/],
    [['--message', '--fresh'], /^--message takes what to tell the step, and --fresh is one of wf retry's own flags, so the answer was left out: .*give it as --message=--fresh\.$/],
    [['--nudge', '--message', '--model', 'opus'], /^--message takes what to tell the step, and --model is one of wf retry's own flags/],
    [['--message=', '--fresh'], /^--message is empty/],
    [['--message=a', '--message', 'b'], /^wf retry takes --message once/],
  ] as const) {
    await assert.rejects(main(['retry', 'no-such-run', 'implement', ...flags]), refusedWith(pattern), flags.join(' '));
  }
});

test('`wf retry --message` takes the next argument as the answer whatever it starts with — an answer about a flag names it — and `--message=<answer>` too', async (t) => {
  t.mock.method(console, 'log', () => {});
  const { main } = await import('../src/cli.ts');
  /** What the ask file says of how, after `wf retry` with these flags on a step waiting on you. */
  const asked = async (...flags: string[]) => {
    const { run, e } = await throughCheck('check: npm test', 'stopped');
    await main(['retry', run.id, 'implement', ...flags], e);
    const { step: _, try: __, at: ___, ...how } = JSON.parse(fs.readFileSync(path.join(asksDir(run.id), 'retry-implement-2'), 'utf8'));
    return how;
  };
  assert.deepEqual(await asked('--message', '--flag stays; say so in the README'), { mode: 'nudge', message: '--flag stays; say so in the README' });
  assert.deepEqual(await asked('--fresh', '--message', '-n is short for --dry-run'), { mode: 'fresh', message: '-n is short for --dry-run' });
  assert.deepEqual(await asked('--message=--fresh'), { mode: 'nudge', message: '--fresh' }, "a flag's name, as the whole answer");
  assert.deepEqual(await asked('--message=keep --flag=on', '--model', 'opus'), { mode: 'fresh', model: 'opus', message: 'keep --flag=on' });
});

test('REFUSED at read: an ask file whose message is not text, is empty, or rides on a recheck is not honoured — and one written before messages reads as it always did', async () => {
  const { run, e, filings } = await throughCheck('check: npm test', 'stopped');
  const at = '2026-09-13T10:00:00.000Z';
  fs.mkdirSync(asksDir(run.id), { recursive: true });
  const refused = {
    'retry-implement-2': [{ mode: 'nudge', message: 42, at }, 'its message is not text'],
    'retry-implement-3': [{ mode: 'fresh', message: ' ', at }, 'its message is empty'],
    'retry-review-2': [{ mode: 'recheck', message: 'the suite is fixed', at }, 'it carries a message and asks for a recheck, which files no session to read it'],
  } as const;
  for (const [name, [held]] of Object.entries(refused)) fs.writeFileSync(path.join(asksDir(run.id), name), JSON.stringify(held));
  const pass = await advance(e, readRun(run.id));
  assert.deepEqual(pass.tried, []);
  for (const [name, [, why]] of Object.entries(refused)) {
    assert.ok(pass.notes.some((n) => n.endsWith(`${name}: ${why}, so it is not honoured — remove it, and ask with wf retry`)), pass.notes.join('\n'));
  }
  assert.deepEqual([readAsks(run.id).asks, readAnswers(run.id)], [[], []]);
  assert.equal(filings.length, 2);

  // The shape `wf retry` wrote before --message: read with no message, and honoured.
  for (const name of Object.keys(refused)) fs.rmSync(path.join(asksDir(run.id), name));
  const legacy = { step: 'implement', try: 2, mode: 'recheck', at };
  fs.writeFileSync(path.join(asksDir(run.id), 'retry-implement-2'), `${JSON.stringify(legacy, null, 2)}\n`);
  assert.deepEqual(readAsks(run.id), { asks: [legacy], rounds: [], notes: [] });
  assert.deepEqual(readAnswers(run.id), []);
  assert.deepEqual((await advance(e, readRun(run.id))).tried, ['implement']);
});

// ─── a run that waits on a run, at shipped defaults ─────────────────────────

/** Git in a checkout, as a person types it there. */
const gitIn = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** A workflow of one step, `implement`: its branch is the run's result. */
const oneStep = () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'one-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), 'implement it\n');
  return dir;
};

/**
 * A run another will wait on, on the board its child is ticked on — one engine, as in life: started for real, with worktrees, and its
 * step filed. With `work`, a file committed on its branch; with `signed` — by default, when there is work — its step signed off.
 */
const aParent = async (
  repo: string,
  b: ReturnType<typeof board>,
  { work, signed = Boolean(work), workflowDir, brief = 'the parent' }: { work?: string; signed?: boolean; workflowDir?: string; brief?: string } = {},
) => {
  const run = start({ brief, repo, workflowDir: workflowDir ?? oneStep() });
  await advance(b.e, readRun(run.id));
  const wt = readRun(run.id).steps.implement!.workspace!;
  if (work) {
    fs.writeFileSync(path.join(wt, work), `${work}\n`);
    gitIn(wt, 'add', '-A');
    gitIn(wt, 'commit', '-q', '-m', `add ${work}`);
  }
  if (signed) b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
  return { run, wt, branch: `wf/${run.id}/implement` };
};

const runsWritten = () => fs.readdirSync(path.join(ROOT, 'runs')).length;
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

test("REFUSED at shipped defaults: a run whose parent has not shipped files nothing, tick after tick, and says `waiting on <parent>` — merged while it still runs, nothing; signed off and on the base, the next tick files its roots, from a base with the parent's work", async () => {
  const repo = aRepo();
  const c = board();
  // Filed and still running, the parent's branch sits at its base, which is on the base branch: that is not shipped.
  const p = await aParent(repo, c);
  const child = start({ brief: 'the child', repo, workflowDir: folder(), after: [p.run.id] });
  assert.deepEqual(readRun(child.id).after, [p.run.id], 'frozen on the record');
  const filings = [...c.filings];
  for (let pass = 0; pass < 3; pass++) {
    const r = await advance(c.e, readRun(child.id));
    assert.deepEqual([r.filed, c.filings, r.waiting], [[], filings, [{ run: p.run.id }]], `pass ${pass + 1}`);
  }
  // The step does its work on its branch: still running, and not on the base branch.
  fs.writeFileSync(path.join(p.wt, 'parent.txt'), 'parent.txt\n');
  gitIn(p.wt, 'add', '-A');
  gitIn(p.wt, 'commit', '-q', '-m', 'add parent.txt');
  assert.deepEqual((await advance(c.e, readRun(child.id))).filed, []);
  assert.equal((await parentOf(c.e, p.run.id)).shipped, false);

  assert.deepEqual((await list(c.e, readRun(child.id))).steps.map((s) => s.status), [`waiting on ${p.run.id}`, 'waiting']);
  const d = await decide(c.e, child.id);
  assert.deepEqual([d.waiting, d.offers, d.retrying, d.rounding], [[{ run: p.run.id }], [], [], []], '`wf decide` says the same, and offers nothing else');

  // A person merges it while its session still runs: on the base branch, and not decided. The parent's `wf decide` says still running, and so does the gate.
  gitIn(repo, 'merge', '-q', '--no-ff', '-m', 'Merge the parent', p.branch);
  const tip = gitIn(repo, 'rev-parse', 'HEAD');
  assert.equal((await decide(c.e, p.run.id)).decision.kind, 'running');
  assert.deepEqual((await advance(c.e, readRun(child.id))).filed, []);

  // It signs off: its `wf decide` says shipped, and the next tick files the child's roots.
  c.settle(`${p.run.id}-implement`, 'succeeded', SIGNED);
  assert.deepEqual((await decide(c.e, p.run.id)).decision, { kind: 'shipped', branches: [p.branch] });
  const r = await advance(c.e, readRun(child.id));
  assert.deepEqual([r.filed, r.waiting], [['implement'], []]);
  const now = readRun(child.id);
  assert.notEqual(child.baseRef, tip);
  assert.equal(now.baseRef, tip, 'the base as it stands now, and not as it stood at `wf start`');
  assert.equal(fs.readFileSync(path.join(now.steps.implement!.workspace!, 'parent.txt'), 'utf8'), 'parent.txt\n', "so the child's worktree has the parent's work");
  assert.equal(gitIn(now.steps.implement!.workspace!, 'rev-parse', 'HEAD'), tip);
});

test("REFUSED before review, now shipped: a parent whose step signs off with nothing to commit has shipped, as its own `wf decide` says — its child's next tick files the roots, and `wf start --after` it is not refused", async () => {
  const repo = aRepo();
  const c = board();
  const p = await aParent(repo, c);
  const child = start({ brief: 'the child of a change already made', repo, workflowDir: folder(), after: [p.run.id] });
  // Running, with nothing committed: its branch has been on the base branch since it was cut, and that is not shipped.
  assert.deepEqual((await advance(c.e, readRun(child.id))).filed, []);
  assert.equal((await decide(c.e, p.run.id)).decision.kind, 'running');

  // It finds the work already done, and signs off with no commit.
  c.settle(`${p.run.id}-implement`, 'succeeded', SIGNED);
  assert.equal(gitIn(repo, 'rev-list', '--count', `${p.run.baseRef}..${p.branch}`), '0', 'nothing past its base');
  assert.deepEqual((await decide(c.e, p.run.id)).decision, { kind: 'shipped', branches: [p.branch] });
  assert.equal((await parentOf(c.e, p.run.id)).shipped, true, 'the gate says what its `wf decide` says');
  const r = await advance(c.e, readRun(child.id));
  assert.deepEqual([r.filed, r.waiting], [['implement'], []]);
  assert.deepEqual(start({ brief: 'another child', repo, workflowDir: folder(), after: [p.run.id] }).after, [p.run.id]);
});

test("REFUSED before review, now shipped: a parent merged and then its branch deleted still ships, by the tip its finished run's own pass recorded — a run that started on the merge files what follows, and one that had not files its roots", async () => {
  const repo = aRepo();
  const c = board();
  const p = await aParent(repo, c, { work: 'parent.txt' });
  assert.equal(readRun(p.run.id).tips, undefined, 'not recorded while it ran');
  // The parent's own pass, as `wf up` makes one over every run: it has finished, so it records its result branch's tip.
  await advance(c.e, readRun(p.run.id));
  const tip = gitIn(repo, 'rev-parse', p.branch);
  assert.deepEqual(readRun(p.run.id).tips, { [p.branch]: tip });
  const early = start({ brief: 'the early child', repo, workflowDir: folder(), after: [p.run.id] });
  const late = start({ brief: 'the late child', repo, workflowDir: folder(), after: [p.run.id] });
  gitIn(repo, 'merge', '-q', '--no-ff', '-m', 'Merge the parent', p.branch);
  assert.deepEqual((await advance(c.e, readRun(early.id))).filed, ['implement']);

  // The merge stays, and the branch goes: `git branch -d` refuses a branch a worktree uses, so the worktree goes first.
  gitIn(repo, 'worktree', 'remove', '--force', p.wt);
  gitIn(repo, 'branch', '-q', '-d', p.branch);
  assert.deepEqual(await parentOf(c.e, p.run.id), { record: readRun(p.run.id), shipped: true });
  assert.deepEqual((await decide(c.e, p.run.id)).decision, { kind: 'shipped', branches: [p.branch] }, 'and its own `wf decide` says the same');
  assert.equal((await advance(c.e, readRun(p.run.id))).run.tips?.[p.branch], tip, 'a branch git no longer has keeps the tip last seen');

  c.settle(`${early.id}-implement`, 'succeeded', SIGNED);
  const next = await advance(c.e, readRun(early.id));
  assert.deepEqual([next.filed, next.waiting], [['review'], []], 'a run that has started is never gated again');

  const r = await advance(c.e, readRun(late.id));
  assert.deepEqual([r.filed, r.waiting], [['implement'], []], 'on the base is shipped');
  assert.deepEqual(start({ brief: 'the latest child', repo, workflowDir: folder(), after: [p.run.id] }).after, [p.run.id]);
});

test("the diamond's D, after B and C: B merged and its branch deleted while C is still running — D says `waiting on C` alone, and files its roots on the pass after C ships, from a base with both", async () => {
  const repo = aRepo();
  const c = board();
  const b = await aParent(repo, c, { work: 'b.txt' });
  const cc = await aParent(repo, c, { work: 'c.txt', signed: false });
  const d = start({ brief: 'd, after b and c', repo, workflowDir: folder(), after: [b.run.id, cc.run.id] });
  // `wf up`'s pass over B: finished, its tip recorded. Then a person ships B and cleans up, while C is still in review.
  await advance(c.e, readRun(b.run.id));
  gitIn(repo, 'merge', '-q', '--no-ff', '-m', 'Merge B', b.branch);
  gitIn(repo, 'worktree', 'remove', '--force', b.wt);
  gitIn(repo, 'branch', '-q', '-d', b.branch);
  const filings = [...c.filings];
  for (let pass = 0; pass < 2; pass++) {
    const r = await advance(c.e, readRun(d.id));
    assert.deepEqual([r.filed, c.filings, r.waiting], [[], filings, [{ run: cc.run.id }]], `pass ${pass + 1}`);
  }
  assert.deepEqual((await list(c.e, readRun(d.id))).steps.map((s) => s.status), [`waiting on ${cc.run.id}`, 'waiting']);

  // Hours later, C signs off and a person ships it.
  c.settle(`${cc.run.id}-implement`, 'succeeded', SIGNED);
  gitIn(repo, 'merge', '-q', '--no-ff', '-m', 'Merge C', cc.branch);
  const r = await advance(c.e, readRun(d.id));
  assert.deepEqual([r.filed, r.waiting], [['implement'], []]);
  const wt = readRun(d.id).steps.implement!.workspace!;
  assert.deepEqual(['b.txt', 'c.txt'].map((f) => fs.existsSync(path.join(wt, f))), [true, true]);
});

test('REFUSED at shipped defaults: a parent dropped unmerged after its tip was recorded, and one merged and deleted before any pass saw it finish, read `(<branch> gone)` — the child files nothing, and `wf start --after` either is refused', async () => {
  const repo = aRepo();
  const c = board();
  const dropped = await aParent(repo, c, { work: 'dropped.txt' });
  await advance(c.e, readRun(dropped.run.id));
  // No pass over it since it signed off: no tip was recorded, and git keeps no trace of what its branch named.
  const unseen = await aParent(repo, c, { work: 'unseen.txt' });
  const child = start({ brief: 'the child of work that is gone', repo, workflowDir: folder(), after: [dropped.run.id, unseen.run.id] });
  gitIn(repo, 'merge', '-q', '--no-ff', '-m', 'Merge the unseen parent', unseen.branch);
  for (const [p, how] of [[dropped, '-D'], [unseen, '-d']] as const) {
    gitIn(repo, 'worktree', 'remove', '--force', p.wt);
    gitIn(repo, 'branch', '-q', how, p.branch);
  }
  assert.ok(readRun(dropped.run.id).tips?.[dropped.branch], 'the dropped parent had its tip recorded');
  const filings = [...c.filings];
  const r = await advance(c.e, readRun(child.id));
  assert.deepEqual([r.filed, c.filings, r.waiting], [[], filings, [{ run: dropped.run.id, gone: [dropped.branch] }, { run: unseen.run.id, gone: [unseen.branch] }]]);
  assert.deepEqual((await list(c.e, readRun(child.id))).steps.map((s) => s.status),
    [`waiting on ${dropped.run.id} (${dropped.branch} gone), ${unseen.run.id} (${unseen.branch} gone)`, 'waiting']);
  const before = runsWritten();
  for (const p of [dropped, unseen]) {
    assert.throws(() => start({ brief: 'another child', repo, workflowDir: folder(), after: [p.run.id] }),
      refusedWith(new RegExp(`^--after ${escaped(p.run.id)}: ${escaped(p.branch)} is gone, and git cannot find it on ${escaped(p.run.branch)}, so this run would wait for ever\\.`)));
  }
  assert.equal(runsWritten(), before);
});

test('REFUSED at shipped defaults: a run whose parent was cancelled files nothing, merged or not, and `wf ls` and `wf decide` say `waiting on <parent> (cancelled)` and how to resolve it — which `wf cancel` does', async (t) => {
  const repo = aRepo();
  const c = board();
  const p = await aParent(repo, c, { work: 'parent.txt' });
  const child = start({ brief: 'the child of a cancelled run', repo, workflowDir: folder(), after: [p.run.id] });
  const at = markCancelled(p.run.id);
  const filings = [...c.filings];
  for (let pass = 0; pass < 2; pass++) {
    const r = await advance(c.e, readRun(child.id));
    assert.deepEqual([r.filed, c.filings, r.waiting], [[], filings, [{ run: p.run.id, cancelledAt: at }]]);
  }
  // Merged all the same: a cancelled run's `wf decide` says it was cancelled, never shipped, and the gate says what it says.
  gitIn(repo, 'merge', '-q', '--no-ff', '-m', 'Merge the cancelled parent', p.branch);
  assert.equal((await decide(c.e, p.run.id)).decision.kind, 'cancelled');
  assert.deepEqual([(await advance(c.e, readRun(child.id))).filed, c.filings], [[], filings]);

  const printed: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => { printed.push(args.join(' ')); });
  const { main } = await import('../src/cli.ts');
  await main(['ls', child.id], c.e);
  const ls = printed.join('\n');
  assert.match(ls, new RegExp(`^   implement +waiting on ${escaped(p.run.id)} \\(cancelled\\) *$`, 'm'));
  assert.match(ls, /^   review +waiting *$/m);
  assert.match(ls, new RegExp(`→ waiting on you: ${escaped(p.run.id)} was cancelled at ${escaped(at)}, and a cancelled run never ships — yours to resolve: wf cancel ${escaped(child.id)}, or start the work again without --after ${escaped(p.run.id)}$`, 'm'));

  printed.length = 0;
  await main(['decide', child.id], c.e);
  assert.deepEqual(printed.join('\n').split('\n').slice(1), [
    '',
    `  waiting on ${p.run.id} (cancelled)`,
    `  ${p.run.id} was cancelled at ${at}, and a cancelled run never ships — yours to resolve: wf cancel ${child.id}, or start the work again without --after ${p.run.id}`,
  ]);

  // A person resolves it: the child called off waits on nothing, and files nothing.
  assert.equal((await cancel(c.e, child.id)).plan.kind, 'cancel');
  assert.deepEqual((await list(c.e, readRun(child.id))).steps.map((s) => s.status), ['waiting', 'waiting']);
  assert.deepEqual([(await advance(c.e, readRun(child.id))).filed, c.filings], [[], filings]);
});

test('REFUSED at `wf start`, before a run is written: --after an unknown run, a run given twice, another repository\'s run, a cancelled one, one run --no-worktree, one on another base branch — and the CLI refuses --after with no run, a misspelt --after, a flag given twice and a second brief, and reads --after=<runId>', async (t) => {
  const repo = aRepo();
  const b = board();
  const p = await aParent(repo, b, { work: 'parent.txt' });
  const other = await aParent(aRepo(), b, { work: 'other.txt' });
  const called = await aParent(repo, b, { work: 'called.txt' });
  markCancelled(called.run.id);
  const direct = start({ brief: 'the direct parent', repo, workflowDir: oneStep(), isolate: false });
  const before = runsWritten();
  const starting = (...after: string[]) => () => start({ brief: 'a child', repo, workflowDir: folder(), after });

  assert.throws(starting('no-such-run-zz9z'), refusedWith(/^--after no-such-run-zz9z: the store has no run no-such-run-zz9z\./));
  assert.throws(starting(p.run.id, p.run.id), refusedWith(new RegExp(`^--after ${escaped(p.run.id)} is given twice`)));
  assert.throws(starting(other.run.id), refusedWith(new RegExp(`^--after ${escaped(other.run.id)}: ${escaped(other.run.id)} works on ${escaped(other.run.repo)}, and this run on ${escaped(repo)}\\.`)));
  assert.throws(starting(called.run.id), refusedWith(/was cancelled at .*, and a cancelled run never ships, so this run would wait for ever\./));
  assert.throws(starting(direct.id), refusedWith(/\(--no-worktree\), so it has no result branch to ship/));
  gitIn(repo, 'checkout', '-q', '-b', 'elsewhere');
  assert.throws(starting(p.run.id), refusedWith(new RegExp(`ships onto ${escaped(p.run.branch)}, and this run would start from elsewhere`)));
  gitIn(repo, 'checkout', '-q', p.run.branch);
  assert.equal(runsWritten(), before, 'no run written');

  const { main } = await import('../src/cli.ts');
  const typed = (...flags: string[]) => main(['start', 'a child', '--workflows', folder(), '--repo', repo, ...flags]);
  await assert.rejects(typed('--after'), refusedWith(/^--after takes the run this one waits on, by its id/));
  await assert.rejects(typed('--after', '--no-worktree'), refusedWith(/^--after takes the run this one waits on/));
  await assert.rejects(typed('--after', p.run.id, '--after', p.run.id), refusedWith(/is given twice/));
  // Dropped, any of these would start a run that waits on nothing, or on the wrong repository, and the tick would file it at once.
  await assert.rejects(typed('--after='), refusedWith(/^--after takes the run this one waits on, by its id/));
  await assert.rejects(typed('--afer', p.run.id), refusedWith(/^wf start does not take --afer\. It takes the brief, then --workflows <dir>, --repo <r>, --no-worktree, and --after <runId>/));
  await assert.rejects(typed('-a', p.run.id), refusedWith(/^wf start does not take -a\./));
  await assert.rejects(typed('--repo', repo), refusedWith(/^wf start takes --repo once/));
  await assert.rejects(typed('--after', p.run.id, p.run.id), refusedWith(new RegExp(`^wf start takes one brief, and ${escaped(p.run.id)} is a second\\.`)));
  assert.equal(runsWritten(), before, 'nor by the CLI');

  // Allowed: as often as there are runs to wait on; and without --after the record is what it was.
  const printed: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => { printed.push(args.join(' ')); });
  const second = await aParent(repo, b, { work: 'second.txt' });
  await typed('--after', p.run.id, `--after=${second.run.id}`);
  const id = printed[0]!.split(' ')[0]!;
  assert.deepEqual(readRun(id).after, [p.run.id, second.run.id]);
  assert.match(printed.join('\n'), new RegExp(`^waits on: ${escaped(p.run.id)}, ${escaped(second.run.id)} — nothing is filed until wf decide says each has shipped onto ${escaped(p.run.branch)}$`, 'm'));
  printed.length = 0;
  await typed();
  assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(path.join(ROOT, 'runs', `${printed[0]!.split(' ')[0]}.json`), 'utf8')), 'after'), false);
});

// ─── an ask file that is not an ask ─────────────────────────────────────────

test("REFUSED by name at shipped defaults: a file at an ask's name that is not an ask — `wf retry` and `wf round` name it and say to delete it, never to wait for an ask no pass honours", async () => {
  const { run, e, filings } = await throughCheck('check: npm test', 'failed', 1);
  const file = path.join(asksDir(run.id), 'retry-implement-2');
  fs.mkdirSync(asksDir(run.id), { recursive: true });
  fs.writeFileSync(file, '{}');
  assert.equal((await list(e, readRun(run.id))).steps[0]!.note, undefined, '`wf ls` shows nothing asked');
  assert.deepEqual((await advance(e, readRun(run.id))).tried, [], 'and no pass honours it');
  await assert.rejects(retry(e, run.id, 'implement', { mode: 'nudge' }), refusedWith(new RegExp(
    `^try 2 of implement cannot be asked for: ${escaped(file)} is already there, and it is not an ask — it asks for no mode wf retry knows \\(undefined\\)\\. `
    + `No tick honours it, and wf ls shows nothing asked, so waiting would be for ever\\. Delete it \\(rm ${escaped(file)}\\), then ask again: wf retry ${escaped(run.id)} implement\\.$`,
  )));
  assert.equal(fs.readFileSync(file, 'utf8'), '{}', 'not written over');
  assert.equal(filings.length, 2);
  // Deleted, as the refusal says: the ask is written, and the next pass honours it.
  fs.rmSync(file);
  await retry(e, run.id, 'implement', { mode: 'nudge' });
  assert.deepEqual((await advance(e, readRun(run.id))).tried, ['implement']);

  const looping = started(looped('rounds: 1\n'));
  const b = board();
  await advance(b.e, readRun(looping.id));
  await toReview(b, looping.id, 1, true);
  assert.deepEqual((await advance(b.e, readRun(looping.id))).looped, [], 'out of rounds, on the first');
  const roundFile = path.join(asksDir(looping.id), 'round-review-2');
  fs.mkdirSync(asksDir(looping.id), { recursive: true });
  fs.writeFileSync(roundFile, '[]');
  await assert.rejects(round(b.e, looping.id), refusedWith(new RegExp(
    `^round 2 of review's loop cannot be asked for: ${escaped(roundFile)} is already there, and it is not an ask — it is not an ask wf round wrote\\. .*Delete it \\(rm ${escaped(roundFile)}\\), then ask again: wf round ${escaped(looping.id)} review\\.$`,
  )));
  assert.equal(fs.readFileSync(roundFile, 'utf8'), '[]');
});

// ─── shipped, with nothing past the base ────────────────────────────────────

test("REFUSED at shipped defaults: a one-step run whose step failed with nothing committed reads failed, not shipped, and a run `--after` it files nothing — with its work merged onto the base, a failed step's run is shipped, and its child starts", async () => {
  const repo = aRepo();
  const c = board();
  const p = await aParent(repo, c);
  c.settle(`${p.run.id}-implement`, 'failed');
  await advance(c.e, readRun(p.run.id));   // its own pass: nothing to hand off, and its tip recorded
  assert.equal(gitIn(repo, 'rev-list', '--count', `${p.run.baseRef}..${p.branch}`), '0', 'nothing past its base');
  assert.equal(gitIn(repo, 'merge-base', '--is-ancestor', p.branch, p.run.branch), '', 'and so on the base branch, as git reads it');
  const d = (await decide(c.e, p.run.id)).decision;
  assert.deepEqual(d.kind === 'awaiting' && [d.outcome, d.failed, d.branches], ['failed', ['implement'], [p.branch]], '`wf decide` shows the failure');
  assert.equal((await parentOf(c.e, p.run.id)).shipped, false);
  const child = start({ brief: 'the child of a failure', repo, workflowDir: folder(), after: [p.run.id] });
  for (let pass = 0; pass < 3; pass++) {
    const r = await advance(c.e, readRun(child.id));
    assert.deepEqual([r.filed, r.waiting], [[], [{ run: p.run.id }]], `pass ${pass + 1}`);
  }

  // Its step failed, and a person merged what it committed: shipped, whatever the step said.
  const q = await aParent(repo, c, { work: 'kept.txt', signed: false });
  c.settle(`${q.run.id}-implement`, 'failed');
  const before = await decide(c.e, q.run.id);
  assert.deepEqual(before.decision.kind === 'awaiting' && before.decision.outcome, 'failed', 'not merged yet: decided');
  gitIn(repo, 'merge', '-q', '--no-ff', '-m', 'Merge the work of a failed step', q.branch);
  assert.deepEqual((await decide(c.e, q.run.id)).decision, { kind: 'shipped', branches: [q.branch] });
  const next = start({ brief: 'the child of merged work', repo, workflowDir: folder(), after: [q.run.id] });
  assert.deepEqual((await advance(c.e, readRun(next.id))).filed, ['implement']);
});

// ─── a session the harness blocked ──────────────────────────────────────────

/** A board whose views carry a stop once it is asked for, as the engine's record does: `stopRequested` from then on. */
const recordingStops = (b: ReturnType<typeof board>): Engine => ({
  ...b.e,
  view: async (id: string) => {
    const v = await b.e.view(id);
    return { ...v, state: { ...v.state, stopRequested: b.stopped.includes(id) } };
  },
}) as Engine;

test("REFUSED before, now accepted at shipped defaults: `wf retry` on a step whose session its harness blocked, with nothing signed — the tick stops the session, files nothing while it stops, and once it has, files the try as a nudge that continues it", async (t) => {
  const run = started(folder());
  const b = board();
  await advance(b.e, readRun(run.id));
  const taskId = `${run.id}-implement`;
  // The engine's word for a session the harness marked blocked, its attempt running and nothing signed.
  b.settle(taskId, 'needs-human' as TaskPhase);
  const e = recordingStops(b);

  // Asked for without the harness's word, it is still running, and refused.
  await assert.rejects(retry(e, run.id, 'implement', { mode: 'nudge' }), refusedWith(/^implement is still running/));
  assert.deepEqual(asksOf(run.id), []);

  // `wf retry`, as a person types it.
  const printed: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => { printed.push(args.join(' ')); });
  const { main } = await import('../src/cli.ts');
  await main(['retry', run.id, 'implement'], e);
  assert.deepEqual(asksOf(run.id), ['retry-implement-2']);
  assert.equal(printed[0], `${run.id}  asked: try 2 of implement (--nudge) — its harness blocked its session: the next tick stops it, and files the try once it has stopped`);
  assert.deepEqual((await list(e, readRun(run.id))).steps[0], { name: 'implement', status: 'needs-human', branch: run.branch, note: 'try 2 asked (--nudge) — stopping its blocked session, then the tick files it' },
    'this harness says nothing about what it waits for: the phase alone, as before');

  const record = fs.readFileSync(path.join(ROOT, 'runs', `${run.id}.json`), 'utf8');
  const first = await advance(e, readRun(run.id));
  assert.deepEqual([b.stopped, first.tried, first.filed, first.status], [[taskId], [], [], 'running'], 'the session asked to stop, and nothing filed');
  assert.ok(first.notes.some((n) => n.startsWith('implement: try 2 — wf retry --nudge; its harness blocked its session, so the engine is asked to stop it')), first.notes.join('\n'));
  assert.equal(fs.readFileSync(path.join(ROOT, 'runs', `${run.id}.json`), 'utf8'), record, 'the record untouched');
  assert.deepEqual(asksOf(run.id), ['retry-implement-2'], 'the ask waits for its try');

  // Passes while the engine stops it — the second on a board read afresh, as after a restart: nothing carried, no second stop, nothing filed.
  for (const engineOf of [() => e, () => recordingStops(b)]) {
    const again = await advance(engineOf(), readRun(run.id));
    assert.deepEqual([b.stopped, again.tried, again.filed, again.notes], [[taskId], [], [], []]);
  }

  // The engine settles it stopped: the next pass files try 2 as it files one for a stopped step, a nudge that continues the session.
  b.settle(taskId, 'stopped');
  const filed = await advance(e, readRun(run.id));
  const try2 = `${run.id}-implement-try2`;
  assert.deepEqual([filed.tried, b.filings], [['implement'], [taskId, try2]]);
  const spec = b.tasks.get(try2)!.spec;
  assert.equal(spec.resumeFrom, `native-${taskId}`, 'the blocked session, continued');
  assert.match(spec.brief, /^## Try 2\n\nThe last try's session was stopped before it signed off\.\nA person asked for this try: `wf retry --nudge`\./);
  assert.deepEqual(readRun(run.id).steps.implement?.tries, [{ taskId, then: 'nudge' }]);
  assert.deepEqual(asksOf(run.id), [], 'consumed');
  const after = await advance(e, readRun(run.id));
  assert.deepEqual([after.tried, b.stopped, b.filings.filter((f) => f === try2).length], [[], [taskId], 1], 'once');
});

test("a step whose harness blocked its session says what the harness waits for — on `wf ls` and on `wf decide`, read afresh each pass", async (t) => {
  const run = started(folder());
  const b = board();
  await advance(b.e, readRun(run.id));
  const taskId = `${run.id}-implement`;
  b.settle(taskId, 'needs-human' as TaskPhase);
  b.waiting.set(taskId, 'permission prompt');
  const status = async () => (await list(b.e, readRun(run.id))).steps[0]!.status;
  const printed: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => { printed.push(args.join(' ')); });
  const { main } = await import('../src/cli.ts');
  const decided = async () => { printed.length = 0; await main(['decide', run.id], b.e); return printed.join('\n'); };

  assert.equal(await status(), 'needs-human: waiting for a permission prompt', '`wf ls`: beside the phase');
  assert.match(await decided(), new RegExp(`\n {2}implement: waiting for a permission prompt — answer it in Claude Code: claude agents, session ae/${taskId}/1$`, 'm'),
    '`wf decide`: the word, and where a person answers it');

  // Level-triggered: the word is read on the pass that prints it, and nothing of the last one is kept.
  b.waiting.set(taskId, 'workspace trust dialog');
  assert.equal(await status(), 'needs-human: waiting for a workspace trust dialog');
  assert.doesNotMatch(await decided(), /permission prompt/, 'the old word is nowhere');

  // And a harness that stops saying leaves the step reading as it did before any of this.
  b.waiting.delete(taskId);
  assert.equal(await status(), 'needs-human');
  assert.doesNotMatch(await decided(), /answer it in Claude Code/, 'no word, no line');
});

test("REFUSED at shipped defaults: `wf retry` on a step whose session still works, `--recheck` on one its harness blocked, and one that signed off and runs on — exit 2, and no ask written", async () => {
  const run = started(folder());
  const b = board();
  await advance(b.e, readRun(run.id));
  const { main } = await import('../src/cli.ts');
  b.settle(`${run.id}-implement`, 'running');
  await assert.rejects(main(['retry', run.id, 'implement'], b.e), refusedWith(/^implement is still running, so there is nothing to try again until it ends/));
  await assert.rejects(main(['retry', run.id, 'implement', '--fresh'], b.e), refusedWith(/^implement is still running/));
  b.settle(`${run.id}-implement`, 'needs-human' as TaskPhase);
  await assert.rejects(main(['retry', run.id, 'implement', '--recheck'], b.e),
    refusedWith(/^--recheck runs a step's check again, and implement is running, its session blocked by its harness with nothing signed off: no check of it failed/));
  b.settle(`${run.id}-implement`, 'needs-human' as TaskPhase, SIGNED);
  await assert.rejects(main(['retry', run.id, 'implement'], b.e), refusedWith(/^implement is still running/));
  assert.deepEqual([asksOf(run.id), b.stopped], [[], []]);
});

// ─── a plan as a folder of cards ────────────────────────────────────────────

/** A card's text: its frontmatter keys, and its body. */
const cardText = (keys: string, body: string) => `---\n${keys}\n---\n${body}\n`;

/** A plan folder holding these files, by name — a function of the folder, so a card can name a workflow by a path from it. */
const aPlan = (files: (dir: string) => Record<string, string>): string => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'plan-'));
  for (const [file, text] of Object.entries(files(dir))) fs.writeFileSync(path.join(dir, file), text);
  return dir;
};

/** A repository with a workflow of one step under its workflows/, by name. */
const aRepoWith = (name: string): { repo: string; dir: string } => {
  const repo = aRepo();
  const dir = path.join(repo, 'workflows', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'implement.md'), 'implement it\n');
  return { repo, dir };
};

test("`wf plan` on the diamond starts four runs, parents first, each `after` the runs of the cards it names — the record `wf start --after` writes, and nothing else — prints a line per card, and `wf ls` says D waits on B and C", async (t) => {
  const { repo, dir: dev } = aRepoWith('dev');
  const other = oneStep();
  const b = board();
  const plan = aPlan((dir) => ({
    'README.md': '# The flag\n\nParse it, then document and store it, then show it.\n',
    'd.md': cardText('workflow: dev\nafter: b, c', 'Show the flag on the settings page'),
    'c.md': cardText('workflow: dev\nafter: a', 'Store the flag'),
    'b.md': cardText(`# a workflow by a path from the plan folder\nworkflow: ${path.relative(dir, other)}\nafter: a`, 'Document the flag'),
    'a.md': cardText('workflow: dev', 'Parse the flag'),
  }));
  const before = runsWritten();
  const printed: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => { printed.push(args.join(' ')); });
  const { main } = await import('../src/cli.ts');
  await main(['plan', plan, '--repo', repo], b.e);

  assert.equal(runsWritten(), before + 4, 'four runs, and no file of the plan');
  const ids: Record<string, string> = Object.fromEntries(printed.slice(0, 4).map((line) => line.split(/ +/).slice(0, 2)));
  assert.deepEqual(Object.keys(ids), ['a', 'b', 'c', 'd'], 'parents first');
  const record = (card: string) => readRun(ids[card]!);
  assert.deepEqual(['a', 'b', 'c', 'd'].map((card) => record(card).after), [undefined, [ids.a], [ids.a], [ids.b, ids.c]]);
  assert.deepEqual(['a', 'b', 'c', 'd'].map((card) => record(card).brief), ['Parse the flag', 'Document the flag', 'Store the flag', 'Show the flag on the settings page']);
  assert.deepEqual(['a', 'b', 'c', 'd'].map((card) => record(card).workflowDir), [dev, other, dev, dev]);
  assert.match(printed[0]!, new RegExp(`^a  ${escaped(ids.a!)} +dev +waits on nothing$`));
  assert.match(printed[1]!, new RegExp(`^b  ${escaped(ids.b!)} +${escaped(path.relative(plan, other))}  waits on a \\(${escaped(ids.a!)}\\)$`));
  assert.match(printed[3]!, new RegExp(`^d  ${escaped(ids.d!)} +dev +waits on b \\(${escaped(ids.b!)}\\), c \\(${escaped(ids.c!)}\\)$`));
  assert.deepEqual(printed.slice(4), ["run 'wf tick' (or 'wf up') to start them"]);

  assert.deepEqual((await list(b.e, record('d'))).steps.map((s) => s.status), [`waiting on ${ids.b}, ${ids.c}`]);
  printed.length = 0;
  await main(['ls', ids.d!], b.e);
  assert.match(printed.join('\n'), new RegExp(`^   implement +waiting on ${escaped(ids.b!)}, ${escaped(ids.c!)} *$`, 'm'));

  // The tick does the waiting: a is filed, and nothing that waits on it.
  assert.deepEqual((await advance(b.e, record('a'))).filed, ['implement']);
  for (const card of ['b', 'c', 'd']) assert.deepEqual((await advance(b.e, record(card))).filed, [], `${card} waits`);
});

test("REFUSED at shipped defaults, before the first `start()`: `wf plan` on a folder whose second card's workflow does not load starts nothing — the workflow's own refusal, behind the card — nor on a workflow that is not there, a cycle, a folder inside the plan, a folder with no card, or no folder", async () => {
  const repo = aRepo();
  const b = board();
  const broken = fs.mkdtempSync(path.join(ROOT, 'broken-'));
  fs.writeFileSync(path.join(broken, 'implement.md'), '---\nafer: plan\n---\nimplement it\n');
  const first = oneStep();
  const plan = aPlan(() => ({
    'a.md': cardText(`workflow: ${first}`, 'the first card'),
    'b.md': cardText(`workflow: ${broken}\nafter: a`, 'the second card'),
  }));
  const before = runsWritten();
  const { main } = await import('../src/cli.ts');
  const planned = () => main(['plan', plan, '--repo', repo], b.e);
  await assert.rejects(planned(), refusedWith(new RegExp(`^b\\.md: \`workflow: ${escaped(broken)}\` — implement: \`afer\` is not a key a step has\\.`)));
  assert.equal(runsWritten(), before, 'not even the first card');

  fs.writeFileSync(path.join(plan, 'b.md'), cardText('workflow: nope\nafter: a', 'the second card'));
  await assert.rejects(planned(), refusedWith(new RegExp(`^b\\.md: \`workflow: nope\` — no workflow folder at ${escaped(path.join(plan, 'nope'))}, nor a workflow named nope in ${escaped(path.join(repo, 'workflows'))}\\.`)));
  fs.writeFileSync(path.join(plan, 'b.md'), cardText(`workflow: ${first}\nafter: c`, 'the second card'));
  fs.writeFileSync(path.join(plan, 'c.md'), cardText(`workflow: ${first}\nafter: b`, 'the third card'));
  await assert.rejects(planned(), refusedWith(/^b\.md, c\.md wait on each other — b after c, c after b — so none of them could ever start\./));
  fs.rmSync(path.join(plan, 'c.md'));
  fs.writeFileSync(path.join(plan, 'b.md'), cardText(`workflow: ${first}\nafter: a`, 'the second card'));
  fs.mkdirSync(path.join(plan, 'drafts'));
  await assert.rejects(planned(), refusedWith(new RegExp(`^drafts/ in ${escaped(plan)}: not a card\\.`)));
  const empty = aPlan(() => ({ 'README.md': '# Nothing yet\n' }));
  await assert.rejects(main(['plan', empty, '--repo', repo], b.e), refusedWith(new RegExp(`^${escaped(empty)} has no cards in it — README\\.md says what the plan is for, and is not a card\\.`)));
  await assert.rejects(main(['plan', path.join(ROOT, 'no-such-plan'), '--repo', repo], b.e), refusedWith(/^no plan folder at .*no-such-plan\./));
  assert.equal(runsWritten(), before, 'no run written');
});

test('REFUSED by name: `wf plan` with --after, --workflows or --no-worktree — the folder says each — an unknown flag, --repo twice or with no value, and a second folder; nothing is started', async () => {
  const repo = aRepo();
  const b = board();
  const plan = aPlan(() => ({ 'a.md': cardText(`workflow: ${oneStep()}`, 'the only card') }));
  const before = runsWritten();
  const { main } = await import('../src/cli.ts');
  const typed = (...flags: string[]) => main(['plan', plan, ...flags], b.e);
  await assert.rejects(typed('--repo', repo, '--after', 'r-xyz'), refusedWith(/^wf plan does not take --after: each card says what it waits on, in its after:, and the folder is the whole plan\./));
  await assert.rejects(typed('--after=r-xyz', '--repo', repo), refusedWith(/^wf plan does not take --after:/));
  await assert.rejects(typed('--workflows', 'dev', '--repo', repo), refusedWith(/^wf plan does not take --workflows: each card names its own, in its workflow:/));
  await assert.rejects(typed('--no-worktree', '--repo', repo), refusedWith(/^wf plan does not take --no-worktree:/));
  await assert.rejects(typed('--repos', repo), refusedWith(/^wf plan does not take --repos\. It takes the plan folder, then --repo <r>\.$/));
  await assert.rejects(typed('--repo', repo, '--repo', repo), refusedWith(/^wf plan takes --repo once: a plan works on one repository\.$/));
  await assert.rejects(typed('--repo'), refusedWith(/^--repo takes the repository the plan works on: wf plan <folder> --repo <r>$/));
  await assert.rejects(typed('--repo='), refusedWith(/^--repo takes the repository the plan works on/));
  await assert.rejects(typed(plan, '--repo', repo), refusedWith(new RegExp(`^wf plan takes one folder, and ${escaped(plan)} is a second\\.`)));
  assert.equal(runsWritten(), before, 'no run written');
});

test("`wf start --workflows <name>` starts the repository's workflow of that name when no folder of that name is where it is typed — and refuses a name it does not have, naming both places and the workflows it has", async (t) => {
  const { repo, dir } = aRepoWith('flagship');
  const b = board();
  const printed: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => { printed.push(args.join(' ')); });
  const { main } = await import('../src/cli.ts');
  await main(['start', 'a brief', '--workflows', 'flagship', '--repo', repo], b.e);
  assert.equal(readRun(printed[0]!.split(' ')[0]!).workflowDir, dir);
  const before = runsWritten();
  await assert.rejects(main(['start', 'a brief', '--workflows', 'flagshp', '--repo', repo], b.e),
    refusedWith(new RegExp(`^no workflow folder at ${escaped(path.resolve('flagshp'))}, nor a workflow named flagshp in ${escaped(path.join(repo, 'workflows'))}\\. The repository's workflows are: flagship — name one, or give the path to a workflow folder\\.$`)));
  assert.equal(runsWritten(), before);
});

test('a `start()` that refuses part-way stops the plan: the runs already started stand, with their edges, and it says which card refused and which are left', () => {
  const repo = aRepo();
  const flow = oneStep();
  const plan = aPlan(() => ({
    'a.md': cardText(`workflow: ${flow}`, 'the root'),
    'b.md': cardText(`workflow: ${flow}\nafter: a`, 'the left'),
    'c.md': cardText(`workflow: ${flow}\nafter: a`, 'the right'),
    'd.md': cardText(`workflow: ${flow}\nafter: b, c`, 'the join'),
  }));
  const before = runsWritten();
  let calls = 0;
  const startRun: typeof start = (opts) => {
    if (++calls === 3) throw Object.assign(new Error('the disk is full'), { exitCode: 1 });
    return start(opts);
  };
  const { started, stopped, folderOf } = startPlan({ dir: plan, repo, startRun });
  assert.deepEqual([started.map((p) => p.card.name), stopped?.card.name, stopped?.error.message, stopped?.rest.map((c) => c.name)], [['a', 'b'], 'c', 'the disk is full', ['d']]);
  assert.equal(runsWritten(), before + 2, 'the runs it started stand');
  assert.deepEqual(started.map((p) => readRun(p.runId).after), [undefined, [started[0]!.runId]]);
  assert.equal(folderOf(stopped!.card), flow);
});

test("a run that waited on runs has its roots filed with `## From run <parent>` for each — the first line of the parent's brief, its terminal step's summary and declared fields, as data — and neither a run without `after` nor a step after a root is given one", async () => {
  const repo = aRepo();
  const c = board();
  const declaring = fs.mkdtempSync(path.join(ROOT, 'declaring-'));
  fs.writeFileSync(path.join(declaring, 'implement.md'), '---\noutput: implement.schema.json\n---\nimplement it\n');
  fs.writeFileSync(path.join(declaring, 'implement.schema.json'), JSON.stringify(FINDINGS));
  const p = await aParent(repo, c, { work: 'parent.txt', signed: false, workflowDir: declaring, brief: 'Parse the flag\n\nIn cli.ts, before anything reads it.' });
  c.settle(`${p.run.id}-implement`, 'succeeded', { ...SIGNED, summary: 'PARENT-SUMMARY: the flag is parsed first', findings: FOUND });
  const q = await aParent(repo, c, { work: 'second.txt', brief: 'Store the flag' });
  assert.doesNotMatch(c.tasks.get(`${p.run.id}-implement`)!.spec.brief, /## From run/, 'a run without `after` is given none');

  const child = start({ brief: 'Show the flag', repo, workflowDir: folder(), after: [p.run.id, q.run.id] });
  for (const parent of [p, q]) gitIn(repo, 'merge', '-q', '--no-ff', '-m', `Merge ${parent.run.id}`, parent.branch);
  const r = await advance(c.e, readRun(child.id));
  assert.deepEqual([r.filed, r.waiting], [['implement'], []]);
  const brief = c.tasks.get(`${child.id}-implement`)!.spec.brief;
  assert.ok(brief.includes(`## What was asked for\n\nShow the flag\n\n## From run ${p.run.id}\n`), brief);
  const fromP = brief.slice(brief.indexOf(`## From run ${p.run.id}\n`), brief.indexOf(`## From run ${q.run.id}\n`));
  assert.ok(fromP.includes('What it was asked, the first line:\n\n```text\nParse the flag\n```'), fromP);
  assert.ok(fromP.includes('What implement said when it signed off, its `summary`:\n\n```text\nPARENT-SUMMARY: the flag is parsed first\n```'), fromP);
  assert.deepEqual(dataUnder(fromP, 'What implement declared in its closeout — `findings`:'), { findings: FOUND });
  const qAt = brief.indexOf(`## From run ${q.run.id}\n`);
  const fromQ = brief.slice(qAt, brief.indexOf('\n## ', qAt));
  assert.ok(fromQ.includes('What it was asked, the first line:\n\n```text\nStore the flag\n```'), fromQ);
  assert.ok(fromQ.includes('What implement said when it signed off, its `summary`:\n\n```text\ndid it\n```'), fromQ);
  assert.doesNotMatch(fromQ, /declared in its closeout/, 'a step that declares nothing hands on its summary alone');

  c.settle(`${child.id}-implement`, 'succeeded', SIGNED);
  assert.deepEqual((await advance(c.e, readRun(child.id))).filed, ['review']);
  assert.doesNotMatch(c.tasks.get(`${child.id}-review`)!.spec.brief, /## From run/, 'only its roots');
});

test('REFUSED to fail the filing: a parent whose closeout cannot be read — a failed step whose work a person merged, and one whose closeout does not parse — is handed on as a section that says so, and the roots are filed all the same', async () => {
  const repo = aRepo();
  const c = board();
  const lost = await aParent(repo, c, { work: 'lost.txt', signed: false });
  c.settle(`${lost.run.id}-implement`, 'failed');
  const garbled = await aParent(repo, c, { work: 'garbled.txt', signed: false });
  c.settle(`${garbled.run.id}-implement`, 'failed', 'not json {');
  for (const parent of [lost, garbled]) {
    gitIn(repo, 'merge', '-q', '--no-ff', '-m', `Merge ${parent.run.id}`, parent.branch);
    assert.deepEqual((await decide(c.e, parent.run.id)).decision, { kind: 'shipped', branches: [parent.branch] });
  }
  const child = start({ brief: 'the child of work merged without a word', repo, workflowDir: folder(), after: [lost.run.id, garbled.run.id] });
  const r = await advance(c.e, readRun(child.id));
  assert.deepEqual([r.filed, r.waiting], [['implement'], []], 'filed all the same');
  const brief = c.tasks.get(`${child.id}-implement`)!.spec.brief;
  assert.ok(brief.includes(`## From run ${lost.run.id}\n`) && brief.includes(`## From run ${garbled.run.id}\n`), brief);
  assert.ok(brief.includes(`\nWhat implement said when it signed off cannot be given here — the engine holds no closeout for its task ${lost.run.id}-implement, which is failed.\n`), brief);
  assert.match(brief, /\nWhat implement said when it signed off cannot be given here — its closeout cannot be read: unparseable: .*\.\n/);
});

// ─── telling a running step something: `wf say` ─────────────────────────────

test("`wf say` hands the words to the step's current task through the engine's `say` and prints the line it journalled, writing nothing of its own — `wf ls` notes the step said to, and `wf decide` prints each thing said under the step, before its closeout, fenced", async (t) => {
  const run = started(folder());
  const b = board();
  await advance(b.e, readRun(run.id));
  const taskId = `${run.id}-implement`;
  b.settle(taskId, 'running');
  const printed: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => { printed.push(args.join(' ')); });
  const { main } = await import('../src/cli.ts');
  const recordOf = () => fs.readFileSync(path.join(ROOT, 'runs', `${run.id}.json`), 'utf8');
  const record = recordOf();
  const beside = fs.readdirSync(path.join(ROOT, 'runs')).sort();

  // The words are everything after the step, so an unquoted sentence is one message.
  await main(['say', run.id, 'implement', 'Widen', 'the', 'scope', 'to', 'apps/api', 'too.'], b.e);
  const [first] = b.said.get(taskId)!;
  assert.deepEqual(first, { at: '2026-09-14T16:01:00.000Z', attempt: 1, text: 'Widen the scope to apps/api too.' });
  assert.deepEqual(printed, [
    `${run.id}  said to implement, try 1, at ${first!.at} — journalled on ${taskId}: wf decide ${run.id} prints it under the step`,
    '   ```text', '   Widen the scope to apps/api too.', '   ```',
  ]);
  assert.equal(recordOf(), record, "the run's record untouched");
  assert.deepEqual(fs.readdirSync(path.join(ROOT, 'runs')).sort(), beside, 'and no file of its own beside it: the engine journal is the record');
  assert.deepEqual((await list(b.e, readRun(run.id))).steps[0], { name: 'implement', status: 'running', branch: run.branch, note: 'said to 1×' });

  const told = await say(b.e, run.id, 'implement', 'And keep `--flag` as it is.');
  const second = b.said.get(taskId)![1]!;
  assert.deepEqual([told.taskId, told.try, told.said], [taskId, 1, second]);
  assert.equal((await list(b.e, readRun(run.id))).steps[0]!.note, 'said to 2×');

  // Signed off blocked, the run waits on a person: `wf decide` prints what was said under the step, before the step's own account of it.
  b.settle(taskId, 'succeeded', { outcome: 'blocked', summary: 'IMPLEMENTER-SUMMARY', artifacts: [], needs: 'Which reading?' });
  printed.length = 0;
  await main(['decide', run.id], b.e);
  const at = (line: string) => printed.indexOf(line);
  const under = at(`    said to try 1, at ${first!.at}:`);
  assert.ok(at('\n  implement  BLOCKED') >= 0 && at('\n  implement  BLOCKED') < under, printed.join('\n'));
  assert.deepEqual(printed.slice(under, under + 8), [
    `    said to try 1, at ${first!.at}:`, '    ```text', '    Widen the scope to apps/api too.', '    ```',
    `    said to try 1, at ${second.at}:`, '    ```text', '    And keep `--flag` as it is.', '    ```',
  ]);
  assert.ok(under < at('    IMPLEMENTER-SUMMARY'), 'before the closeout');
  assert.equal(recordOf(), record, 'and still nothing written');
});

test("REFUSED: `wf say` on a step the run does not have, a step not filed, a settled step and a cancelled run — exit 2 in the package's words, the engine never asked; the engine's own refusals pass through verbatim, exit 2 — a task not started, empty words — and words not delivered reject in its words with no exit code; nothing said, nothing written", async () => {
  const run = started(folder());
  const b = board();
  await advance(b.e, readRun(run.id));
  const taskId = `${run.id}-implement`;
  const { main } = await import('../src/cli.ts');
  const asked: string[] = [];
  const e = { ...b.e, say: async (id: string, text: string) => { asked.push(id); return b.e.say(id, text); } } as Engine;
  const record = fs.readFileSync(path.join(ROOT, 'runs', `${run.id}.json`), 'utf8');
  const verbatim = (message: string, exitCode: number | undefined) => (err: Error & { exitCode?: number }) => err.exitCode === exitCode && err.message === message;

  // The engine's. Filed, with no attempt started:
  await assert.rejects(say(e, run.id, 'implement', 'Start with the parser.'), verbatim(`say: \`${taskId}\` has not started an attempt yet, so there is no session to hear anything.`, 2));
  b.settle(taskId, 'running');
  // empty words, from the verb and from the command line with none at all:
  for (const words of [[''], [' \n '], []]) {
    await assert.rejects(main(['say', run.id, 'implement', ...words], e), verbatim('say: `text` is empty. Give the words the session should hear.', 2), JSON.stringify(words));
  }
  // and words its harness did not take: no exit code, since asking again may work.
  b.deaf.add(taskId);
  await assert.rejects(say(e, run.id, 'implement', 'Widen the scope.'), verbatim(`say: ae/${taskId}/1 was not given the words (connect ECONNREFUSED). Nothing was journalled.`, undefined));
  b.deaf.delete(taskId);
  assert.equal(asked.length, 5, "each of those was the engine's to answer");
  asked.length = 0;

  // The package's, before the engine is asked.
  await assert.rejects(say(e, run.id, 'deploy', 'Ship it.'), verbatim(`${run.id} has no step "deploy" — its steps are implement, review.`, 2));
  await assert.rejects(main(['say', run.id, 'review', 'Look at the parser first.'], e), verbatim(`review has not been filed yet, so there is no session to hear anything. Say it once it runs: wf ls ${run.id}.`, 2));
  for (const phase of ['succeeded', 'failed', 'stopped'] as const) {
    b.settle(taskId, phase);
    await assert.rejects(say(e, run.id, 'implement', 'Widen the scope.'), refusedWith(new RegExp(`^implement is not running: try 1's task settled \`${phase}\`, so no session of it is there to hear anything\\. .*: wf retry ${run.id} implement --message "<words>"\\.$`)), phase);
  }
  b.settle(taskId, 'running');
  markCancelled(run.id);
  await assert.rejects(main(['say', run.id, 'implement', 'Widen the scope.'], e), refusedWith(new RegExp(`^${run.id} was cancelled at [^:]+:\\d\\d:[\\d.]+Z: its sessions are being stopped, not steered`)));
  assert.deepEqual(asked, [], 'the engine was never asked');
  assert.equal(b.said.get(taskId), undefined, 'nothing said');
  assert.equal(fs.readFileSync(path.join(ROOT, 'runs', `${run.id}.json`), 'utf8'), record, 'nothing written');
});

test("a nudge that continues a session is handed what was said to it — `wf retry`, `retries:`, and a session its harness blocked, stopped and continued (agent-runtime open issue 16) — as `## Said to your session` inside `## Try 2`, each message with its time, fenced; a fresh session is handed none", async () => {
  // A step told two things while it ran, then signed off blocked: the next try as asked.
  const toldThenBlocked = async (how: RetryHow) => {
    const run = started(folder());
    const b = board();
    await advance(b.e, readRun(run.id));
    const taskId = `${run.id}-implement`;
    b.settle(taskId, 'running');
    await say(b.e, run.id, 'implement', 'Widen the scope to apps/api too.');
    await say(b.e, run.id, 'implement', 'Keep:\n```\n--flag\n```');
    b.settle(taskId, 'succeeded', { outcome: 'blocked', summary: 'two readings', artifacts: [], needs: 'Rename --flag?' });
    await advance(b.e, readRun(run.id));
    await retry(b.e, run.id, 'implement', how);
    assert.deepEqual((await advance(b.e, readRun(run.id))).tried, ['implement']);
    return { brief: b.tasks.get(`${run.id}-implement-try2`)!.spec.brief, said: b.said.get(taskId)! };
  };

  const nudged = await toldThenBlocked({ mode: 'nudge', message: 'Keep it.' });
  const [one, two] = nudged.said;
  assert.match(nudged.brief, /^## Try 2\n\nThe last try signed off `blocked`\./);
  assert.ok(nudged.brief.includes(`\n\n## Said to your session\n\nA person said these to your session while the last try ran (\`wf say\`).`), nudged.brief);
  assert.ok(nudged.brief.includes(`\n\nAt ${one!.at}:\n\n\`\`\`text\n${one!.text}\n\`\`\`\n\nAt ${two!.at}:\n\n\`\`\`\`text\n${two!.text}\n\`\`\`\`\n\n## Your answer\n\n\`\`\`text\nKeep it.\n\`\`\``), nudged.brief);
  const fresh = await toldThenBlocked({ mode: 'fresh' });
  assert.doesNotMatch(fresh.brief, /Said to your session|Widen the scope/, 'a new session is handed none of the last one');

  // `retries:` — the run's own nudge — hands them on too, beside what the check said.
  const { run: checked, e, tasks, said, logs } = await throughCheck('check: npm test\nretries: 1', 'failed', 1);
  logs.set(`${checked.id}-implement-check`, 'not ok 1 - parses a trailing comma\n\n[wf check] exit 1\n');
  said.set(`${checked.id}-implement`, [{ at: '2026-09-14T16:05:00.000Z', attempt: 1, text: 'Run the parser tests too.' }]);
  assert.deepEqual((await advance(e, readRun(checked.id))).tried, ['implement']);
  const retried = tasks.get(`${checked.id}-implement-try2`)!.spec.brief;
  assert.ok(retried.includes('## Said to your session\n\nA person said this to your session'), retried);
  assert.ok(retried.includes('At 2026-09-14T16:05:00.000Z:\n\n```text\nRun the parser tests too.\n```'), retried);
  assert.ok(retried.indexOf('## Said to your session') < retried.indexOf('## What the check said'), 'before the evidence');

  // The case open issue 16 measured: words said to a session its harness blocked, which the board's Continue stops, then continues.
  const run = started(folder());
  const b = board();
  await advance(b.e, readRun(run.id));
  const blocked = `${run.id}-implement`;
  b.settle(blocked, 'needs-human' as TaskPhase);
  const stops = recordingStops(b);
  await say(stops, run.id, 'implement', 'Approve nothing; widen the scope instead.');
  await retry(stops, run.id, 'implement', { mode: 'nudge' }, { stopBlocked: true });
  await advance(stops, readRun(run.id));
  assert.deepEqual(b.stopped, [blocked]);
  b.settle(blocked, 'stopped');
  assert.deepEqual((await advance(stops, readRun(run.id))).tried, ['implement']);
  const continued = b.tasks.get(`${run.id}-implement-try2`)!.spec;
  assert.equal(continued.resumeFrom, `native-${blocked}`);
  assert.match(continued.brief, /^## Try 2\n\nThe last try's session was stopped before it signed off\.[\s\S]*\n\n## Said to your session\n\n[\s\S]*```text\nApprove nothing; widen the scope instead\.\n```/);
});

test("a round that continues the loop's target hands it what was said to its last session, before the findings", async () => {
  const run = started(looped());
  const b = board();
  await advance(b.e, readRun(run.id));
  b.settle(`${run.id}-implement`, 'running');
  await say(b.e, run.id, 'implement', 'Leave the parser alone.');
  await toReview(b, run.id, 1, true);
  assert.deepEqual((await advance(b.e, readRun(run.id))).looped, ['review']);
  const brief = b.tasks.get(`${run.id}-implement-try2`)!.spec.brief;
  assert.match(brief, /^## Round 2 of 3\n/);
  const at = brief.indexOf('## Said to your session');
  assert.ok(at > 0 && at < brief.indexOf('## From review'), brief);
  assert.ok(brief.includes('```text\nLeave the parser alone.\n```'), brief);
});

// ─── the order a run's steps are listed in ──────────────────────────────────

/** `plan → implement ⇄ review`, whose files sort implement, plan, review. */
const plannedFolder = () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'planned-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nafter: plan\n---\nimplement it\n');
  fs.writeFileSync(path.join(dir, 'plan.md'), 'plan it\n');
  fs.writeFileSync(path.join(dir, 'review.md'), '---\nafter: implement\nloop: implement\noutput: review.schema.json\n---\nreview it\n');
  fs.writeFileSync(path.join(dir, 'review.schema.json'), JSON.stringify({ type: 'object', properties: { again: { type: 'boolean' } }, required: ['again'], additionalProperties: false }));
  return dir;
};

test("REFUSED before, now in order: `wf start` on `plan → implement ⇄ review` says plan → implement → review, keys the record so and `wf ls` lists it so — and a record written in the folder's order, frozen or not, reads in the steps' order", async (t) => {
  const repo = aRepo();
  const b = board();
  const printed: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => { printed.push(args.join(' ')); });
  const { main } = await import('../src/cli.ts');
  await main(['start', 'plan the flag', '--workflows', plannedFolder(), '--repo', repo], b.e);
  const [id, said] = printed[0]!.split('  ');
  assert.equal(said, '3 step(s): plan → implement → review');
  const run = readRun(id!);
  assert.deepEqual([Object.keys(run.steps), run.workflow?.map((s) => s.name)], [['plan', 'implement', 'review'], ['plan', 'implement', 'review']]);

  /** The step names `wf ls <run>` prints, in the order it prints them. */
  const rows = async (runId: string) => {
    printed.length = 0;
    await main(['ls', runId], b.e);
    return printed.slice(1).map((line) => /^ {3}([a-z][\w-]*) /.exec(line)?.[1]).filter(Boolean);
  };
  assert.deepEqual(await rows(id!), ['plan', 'implement', 'review']);

  // Written before steps were ordered: keyed in the folder's order, with its workflow frozen in that order or not frozen at all.
  const folderOrder = ['implement', 'plan', 'review'];
  for (const frozen of [true, false]) {
    const legacyId = `${id}-${frozen ? 'frozen' : 'unfrozen'}`;
    const { workflow, steps, ...rest } = run;
    fs.writeFileSync(path.join(ROOT, 'runs', `${legacyId}.json`), JSON.stringify({
      ...rest, id: legacyId,
      ...(frozen ? { workflow: folderOrder.map((name) => workflow!.find((s) => s.name === name)) } : {}),
      steps: Object.fromEntries(folderOrder.map((name) => [name, steps[name]])),
    }, null, 2));
    const legacy = readRun(legacyId);
    assert.deepEqual([Object.keys(legacy.steps), legacy.workflow?.map((s) => s.name)], [folderOrder, frozen ? folderOrder : undefined], 'as it was written');
    assert.deepEqual(stepsOf(legacy).map((s) => s.name), ['plan', 'implement', 'review'], legacyId);
    assert.deepEqual((await list(b.e, legacy)).steps.map((s) => s.name), ['plan', 'implement', 'review'], legacyId);
    assert.deepEqual(await rows(legacyId), ['plan', 'implement', 'review'], legacyId);
  }
});

test("`wf decide` prints each step in the order the steps run — on a record keyed in the folder's order too", async (t) => {
  const run = start({ brief: 'plan the flag', repo: aRepo(), workflowDir: plannedFolder(), isolate: false });
  const b = board();
  // plan and implement sign off with no check; review signs off without the `again` it declares, so the run waits on you.
  for (const name of ['plan', 'implement', 'review']) {
    assert.deepEqual((await advance(b.e, readRun(run.id))).filed, [name]);
    b.settle(`${run.id}-${name}`, 'succeeded', SIGNED);
  }
  const { main } = await import('../src/cli.ts');
  const sections = async () => {
    const out: string[] = [];
    const log = t.mock.method(console, 'log', (...args: unknown[]) => { out.push(args.map(String).join(' ')); });
    try { await main(['decide', run.id], b.e); } finally { log.mock.restore(); }
    const lines = out.join('\n').split('\n');
    assert.ok(lines.some((l) => l.startsWith('  UNSIGNED: review')), lines.join('\n'));
    return lines.filter((l) => /^ {2}(plan|implement|review)$/.test(l)).map((l) => l.trim());
  };
  assert.deepEqual(await sections(), ['plan', 'implement', 'review']);

  const record = readRun(run.id);
  const folderOrder = ['implement', 'plan', 'review'];
  fs.writeFileSync(path.join(ROOT, 'runs', `${run.id}.json`), JSON.stringify({
    ...record,
    workflow: folderOrder.map((name) => record.workflow!.find((s) => s.name === name)),
    steps: Object.fromEntries(folderOrder.map((name) => [name, record.steps[name]])),
  }, null, 2));
  assert.deepEqual(Object.keys(readRun(run.id).steps), folderOrder);
  assert.deepEqual(await sections(), ['plan', 'implement', 'review']);
});

// ─── files for a run: wf start --input ──────────────────────────────────────

test("`wf start --input` copies each file into the run's own inputs/, freezes their names on the record and names them on every step's brief, under what was asked for — nothing in the workspace; `wf decide` names them under the run's line", async (t) => {
  const repo = aRepo();
  const given = fs.mkdtempSync(path.join(ROOT, 'given-'));
  fs.writeFileSync(path.join(given, 'mock.png'), 'png bytes');
  fs.mkdirSync(path.join(given, 'notes'));
  fs.writeFileSync(path.join(given, 'notes', 'brief notes.md'), '# what the person meant\n');
  const b = board();
  const printed: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => { printed.push(args.join(' ')); });
  const { main } = await import('../src/cli.ts');
  await main(['start', 'add a flag', '--workflows', folder(), '--repo', repo, '--no-worktree', '--input', path.join(given, 'mock.png'), `--input=${path.join(given, 'notes', 'brief notes.md')}`], b.e);
  const id = printed[0]!.split(' ')[0]!;
  const dir = path.join(ROOT, 'runs', id, 'inputs');
  assert.deepEqual(readRun(id).inputs, ['mock.png', 'brief notes.md'], 'by name, in the order given');
  assert.deepEqual(fs.readdirSync(dir).sort(), ['brief notes.md', 'mock.png']);
  assert.equal(fs.readFileSync(path.join(dir, 'mock.png'), 'utf8'), 'png bytes');
  assert.ok(printed.includes(`inputs: mock.png, brief notes.md — copied into ${dir}`), printed.join('\n'));
  assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }), '', 'nothing written into the workspace');

  const line = `Files given with it (\`wf start --input\`), in \`${dir}\`: \`mock.png\`, \`brief notes.md\`.`;
  await advance(b.e, readRun(id));
  b.settle(`${id}-implement`, 'succeeded', SIGNED);
  await advance(b.e, readRun(id));
  for (const name of ['implement', 'review']) {
    const brief = b.tasks.get(`${id}-${name}`)!.spec.brief;
    assert.ok(brief.includes(`## What was asked for\n\nadd a flag\n\n${line}\n`), `${name}:\n${brief}`);
  }
  printed.length = 0;
  await main(['decide', id], b.e);
  assert.deepEqual(printed[0]!.split('\n').slice(0, 2), [`${id}  add a flag`, `  inputs  mock.png, brief notes.md  —  in ${dir}`]);

  // A run given none: no directory, no key on the record, and a brief without the line.
  const plain = start({ brief: 'add a flag', repo, workflowDir: folder(), isolate: false });
  assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(path.join(ROOT, 'runs', `${plain.id}.json`), 'utf8')), 'inputs'), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'runs', plain.id)), false);
  await advance(b.e, readRun(plain.id));
  assert.doesNotMatch(b.tasks.get(`${plain.id}-implement`)!.spec.brief, /wf start --input/);
});

test('REFUSED at `wf start`, before a run is written: an --input that is not there, a directory, two of one name and one file given twice — and the CLI refuses --input with no file and a misspelt --input; `wf plan --input` is refused by name', async () => {
  const repo = aRepo();
  const given = fs.mkdtempSync(path.join(ROOT, 'given-'));
  for (const d of ['a', 'b']) {
    fs.mkdirSync(path.join(given, d));
    fs.writeFileSync(path.join(given, d, 'notes.md'), `${d}\n`);
  }
  const before = runsWritten();
  const starting = (...inputs: string[]) => () => start({ brief: 'a run with files', repo, workflowDir: folder(), isolate: false, inputs });
  assert.throws(starting(path.join(given, 'a', 'notes.md'), path.join(given, 'nope.png')),
    refusedWith(new RegExp(`^--input ${escaped(path.join(given, 'nope.png'))}: there is no file at ${escaped(path.join(given, 'nope.png'))}\\.`)));
  assert.throws(starting(path.join(given, 'a')), refusedWith(new RegExp(`^--input ${escaped(path.join(given, 'a'))}: ${escaped(path.join(given, 'a'))} is a directory, and --input copies one file\\.`)));
  assert.throws(starting(path.join(given, 'a', 'notes.md'), path.join(given, 'b', 'notes.md')),
    refusedWith(new RegExp(`^--input ${escaped(path.join(given, 'a', 'notes.md'))} and --input ${escaped(path.join(given, 'b', 'notes.md'))} are both named notes\\.md`)));
  assert.throws(starting(path.join(given, 'a', 'notes.md'), `${given}/b/../a/notes.md`), refusedWith(/is given twice\. Each file is copied once: give it one --input\.$/));
  assert.equal(runsWritten(), before, 'no run written, and no inputs directory');

  const { main } = await import('../src/cli.ts');
  const typed = (...flags: string[]) => main(['start', 'a run with files', '--workflows', folder(), '--repo', repo, '--no-worktree', ...flags]);
  await assert.rejects(typed('--input'), refusedWith(/^--input takes a file to hand the run's steps: wf start <brief> --input <file>/));
  await assert.rejects(typed('--input='), refusedWith(/^--input takes a file to hand the run's steps/));
  await assert.rejects(typed('--input', '--after', 'r-xyz'), refusedWith(/^--input takes a file to hand the run's steps/));
  await assert.rejects(typed('--input', path.join(given, 'a')), refusedWith(/ is a directory, and --input copies one file\./));
  await assert.rejects(typed('--inputs', path.join(given, 'a', 'notes.md')), refusedWith(/^wf start does not take --inputs\. .*; --input <file> once per file to hand its steps; --gate <step> once per step to gate; and, for an inbox card, --brief "<brief>"\.$/));
  const plan = aPlan(() => ({ 'a.md': cardText(`workflow: ${oneStep()}`, 'the only card') }));
  await assert.rejects(main(['plan', plan, '--repo', repo, '--input', path.join(given, 'a', 'notes.md')]), refusedWith(/^wf plan does not take --input: a card's inputs are not a thing yet\./));
  assert.equal(runsWritten(), before, 'nor by the CLI');
});

// ─── files named from the workspace, collected ──────────────────────────────

test("a file `artifacts` names from the workspace root is collected into the step's files directory when the step hands off, before its check is filed — again, only what changed, after a pass that died — and read from there; an absolute path in the directory is read where it is", async () => {
  const run = started(folder('check: npm test'));
  const b = board();
  await advance(b.e, readRun(run.id));
  const files = artifactsDir(run, 'implement');
  // What a step that can write only its workspace leaves — a file for the branch, and one git ignores — and one written into the directory by absolute path.
  fs.writeFileSync(path.join(run.repo, '.gitignore'), '.e2e/\n');
  fs.mkdirSync(path.join(run.repo, '.e2e'));
  fs.writeFileSync(path.join(run.repo, '.e2e', 'shot.png'), 'png');
  fs.writeFileSync(path.join(run.repo, 'RESPONSE.md'), '# response\n');
  fs.writeFileSync(path.join(files, 'trace.zip'), 'zip');
  const named = ['RESPONSE.md', './.e2e/shot.png', path.join(files, 'trace.zip')];
  b.settle(`${run.id}-implement`, 'succeeded', declaring(named));

  // A pass that hands off, collects, and dies filing the check.
  const dying = { ...b.e, file: async (spec: { id: string }) => { if (spec.id.endsWith('-check')) throw new Error('the pass died'); return b.e.file(spec as never); } } as unknown as Engine;
  await assert.rejects(advance(dying, readRun(run.id)), /the pass died/);
  assert.equal(fs.readFileSync(path.join(files, 'RESPONSE.md'), 'utf8'), '# response\n');
  assert.equal(fs.readFileSync(path.join(files, '.e2e', 'shot.png'), 'utf8'), 'png', 'a file git ignores, which never reaches the branch');

  // The next pass collects again — only what changed since — and files the check.
  fs.writeFileSync(path.join(run.repo, 'RESPONSE.md'), '# response, amended\n');
  const pass = await advance(b.e, readRun(run.id));
  assert.deepEqual([pass.checked, pass.notes], [['implement'], [`implement: collected RESPONSE.md into ${files}`]]);
  assert.equal(fs.readFileSync(path.join(files, 'RESPONSE.md'), 'utf8'), '# response, amended\n');
  assert.equal(fs.readFileSync(path.join(files, 'trace.zip'), 'utf8'), 'zip', 'an absolute path in the directory, where it is');
  assert.deepEqual(missingArtifacts(readRun(run.id), 'implement', declaring(named)), []);
  assert.deepEqual(artifactFiles(run, 'implement').map((f) => path.relative(files, f.path)).sort(), ['.e2e/shot.png', 'RESPONSE.md', 'trace.zip']);

  // Once its check is filed, the workspace is the check's: nothing more is collected.
  fs.writeFileSync(path.join(run.repo, 'RESPONSE.md'), '# rewritten while the check ran\n');
  assert.deepEqual((await advance(b.e, readRun(run.id))).notes, []);
  assert.equal(fs.readFileSync(path.join(files, 'RESPONSE.md'), 'utf8'), '# response, amended\n');
});

test("REFUSED as findings on the screen, never silently: a path that climbs out of the workspace is never read, a link that leads out is not followed, and a directory and a file not there are not collected — `wf decide` names each", async (t) => {
  const run = started(folder());
  const b = board();
  await advance(b.e, readRun(run.id));
  const files = artifactsDir(run, 'implement');
  const secret = path.join(path.dirname(run.repo), `secret-${run.id}.txt`);
  fs.writeFileSync(secret, "not a step's to name\n");
  fs.mkdirSync(path.join(run.repo, 'shots'));
  fs.writeFileSync(path.join(run.repo, 'shots', 'a.png'), 'png');
  fs.symlinkSync(secret, path.join(run.repo, 'leak.txt'));
  const climbs = `../${path.basename(secret)}`;
  b.settle(`${run.id}-implement`, 'succeeded', declaring([climbs, 'never-written.md', 'shots', 'leak.txt']));

  const spies = ['existsSync', 'statSync', 'lstatSync', 'realpathSync', 'readFileSync', 'openSync', 'accessSync', 'readdirSync', 'copyFileSync', 'cpSync']
    .map((method) => t.mock.method(fs, method as 'statSync'));
  const looked = () => spies.flatMap((spy) => spy.mock.calls.flatMap((call) => call.arguments.slice(0, 2).filter((a) => typeof a === 'string') as string[]))
    .filter((p) => path.resolve(p) === secret);
  const pass = await advance(b.e, readRun(run.id));
  assert.deepEqual([pass.filed, pass.notes], [['review'], []], 'review filed, and nothing collected');
  assert.deepEqual(artifactFiles(run, 'implement'), []);
  assert.deepEqual(looked(), [], 'the file outside the workspace is neither opened, stat-ed nor resolved by the tick');

  b.settle(`${run.id}-review`, 'succeeded', { outcome: 'blocked', summary: 'stopped', artifacts: [], needs: 'a person' });
  const out: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => { out.push(args.map(String).join(' ')); });
  const { main } = await import('../src/cli.ts');
  try { await main(['decide', run.id], b.e); } finally { log.mock.restore(); }
  const lines = out.join('\n').split('\n');
  const at = lines.indexOf('  implement');
  assert.ok(at >= 0, lines.join('\n'));
  assert.deepEqual(lines.slice(at).filter((l) => l.startsWith('    !! ')), [
    '    !! declared but not in the workspace: never-written.md  — nothing to collect',
    '    !! declared a directory, not collected: shots  — a step names each file',
    `    !! declared outside the workspace, and not read: ${climbs}, leak.txt  — name a file from the workspace root, or put it in ${files}`,
  ]);
  assert.deepEqual(looked(), [], 'nor by wf decide');
});

test("REFUSED at shipped defaults: a copy is never written through a link a step made in its files directory — on the way to it, or in its place — what the link leads to is left as it was, and `wf decide` names the file not collected, though it is on the branch", async () => {
  const run = started(folder('check: npm test'));
  const b = board();
  await advance(b.e, readRun(run.id));
  const files = artifactsDir(run, 'implement');
  const elsewhere = fs.mkdtempSync(path.join(ROOT, 'elsewhere-'));
  fs.writeFileSync(path.join(elsewhere, 'shot.png'), 'what was there');
  fs.writeFileSync(path.join(elsewhere, 'report.md'), 'what was there');
  // A step that can write its files directory makes links in it, then names workspace files whose copies would go through them.
  fs.symlinkSync(elsewhere, path.join(files, 'shots'));
  fs.symlinkSync(path.join(elsewhere, 'report.md'), path.join(files, 'report.md'));
  fs.mkdirSync(path.join(run.repo, 'shots'));
  fs.writeFileSync(path.join(run.repo, 'shots', 'shot.png'), 'png');
  fs.writeFileSync(path.join(run.repo, 'report.md'), '# report\n');
  const named = ['shots/shot.png', 'report.md'];
  b.settle(`${run.id}-implement`, 'succeeded', declaring(named));

  const pass = await advance(b.e, readRun(run.id));
  assert.deepEqual([pass.checked, pass.notes], [['implement'], []], 'its check filed, and nothing collected');
  assert.deepEqual(Object.fromEntries(fs.readdirSync(elsewhere).map((f) => [f, fs.readFileSync(path.join(elsewhere, f), 'utf8')])),
    { 'report.md': 'what was there', 'shot.png': 'what was there' });
  // Handed off, both are on the branch. The run reads a step's files from its directory, and says what it did not collect.
  assert.equal(execFileSync('git', ['cat-file', '-t', `${run.branch}:report.md`], { cwd: run.repo, encoding: 'utf8' }).trim(), 'blob');
  assert.deepEqual(missingArtifacts(readRun(run.id), 'implement', declaring(named)), [{ path: 'shots/shot.png', why: 'not collected' }, { path: 'report.md', why: 'not collected' }]);
});

// ─── a stale ask ────────────────────────────────────────────────────────────

test("REFUSED before, now honoured at shipped defaults: `wf retry` on a step whose harness blocked its session, and the session works again before any tick — the tick stops it once, files nothing while it stops, and files the try once it has; `wf ls` says so meanwhile", async (t) => {
  const run = started(folder());
  const b = board();
  await advance(b.e, readRun(run.id));
  const taskId = `${run.id}-implement`;
  b.settle(taskId, 'needs-human' as TaskPhase);
  const e = recordingStops(b);
  t.mock.method(console, 'log', () => {});
  const { main } = await import('../src/cli.ts');
  await main(['retry', run.id, 'implement'], e);
  assert.deepEqual(asksOf(run.id), ['retry-implement-2']);

  // A peer's message, and the session works again: no tick ran in between.
  b.settle(taskId, 'running');
  assert.deepEqual((await list(e, readRun(run.id))).steps[0], { name: 'implement', status: 'running', branch: run.branch, note: 'try 2 asked (--nudge) — stopping its session, then the tick files it' });

  const record = fs.readFileSync(path.join(ROOT, 'runs', `${run.id}.json`), 'utf8');
  const first = await advance(e, readRun(run.id));
  assert.deepEqual([b.stopped, first.tried, first.filed, first.status], [[taskId], [], [], 'running'], 'the session asked to stop, and nothing filed');
  assert.ok(first.notes.includes(`implement: try 2 — wf retry --nudge; its session runs on, asked for while its harness had blocked it, so the engine is asked to stop it, and the try is filed once it has`), first.notes.join('\n'));
  assert.equal(fs.readFileSync(path.join(ROOT, 'runs', `${run.id}.json`), 'utf8'), record, 'the record untouched');
  assert.deepEqual(asksOf(run.id), ['retry-implement-2'], 'the ask waits for its try');

  // Passes while the engine stops it — the second on a board read afresh, as after a restart: no second stop, nothing filed.
  for (const engineOf of [() => e, () => recordingStops(b)]) {
    const again = await advance(engineOf(), readRun(run.id));
    assert.deepEqual([b.stopped, again.tried, again.filed, again.notes], [[taskId], [], [], []]);
  }

  // Settled stopped: the next pass files try 2, a nudge that continues the session, once.
  b.settle(taskId, 'stopped');
  const try2 = `${run.id}-implement-try2`;
  assert.deepEqual((await advance(e, readRun(run.id))).tried, ['implement']);
  assert.equal(b.tasks.get(try2)!.spec.resumeFrom, `native-${taskId}`);
  assert.deepEqual(asksOf(run.id), [], 'consumed');
  await advance(e, readRun(run.id));
  assert.deepEqual([b.stopped, b.filings.filter((f) => f === try2).length], [[taskId], 1], 'once');
});

// ─── wf start on a card file ────────────────────────────────────────────────

test("`wf start <card>.md` starts the card's body — its id from the body, its `workflow:` found from its plan folder, --workflows over it — and a card whose `after:` names cards starts only with --after; a brief whose frontmatter is not a card's is taken whole, as before", async (t) => {
  const { repo, dir: dev } = aRepoWith('dev');
  const other = oneStep();
  const b = board();
  const plan = aPlan((d) => ({
    'a.md': cardText('workflow: dev', 'Parse the flag option in cli'),
    'b.md': cardText(`# by a path from the plan folder\nworkflow: ${path.relative(d, other)}`, 'Document the flag'),
    'd.md': cardText('workflow: dev\nafter: a, b', 'Show the flag'),
  }));
  const printed: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => { printed.push(args.join(' ')); });
  const { main } = await import('../src/cli.ts');
  const startedBy = async (...argv: string[]) => {
    printed.length = 0;
    await main(['start', ...argv], b.e);
    return readRun(printed[0]!.split(' ')[0]!);
  };

  const a = await startedBy(path.join(plan, 'a.md'), '--repo', repo);
  assert.deepEqual([a.brief, a.workflowDir], ['Parse the flag option in cli', dev], 'the body, and workflow: dev found as wf plan finds it');
  assert.match(a.id, /^parse-the-flag-option-in-cli-[a-z0-9]{4}$/);
  const second = await startedBy(path.join(plan, 'b.md'), '--repo', repo);
  assert.deepEqual([second.brief, second.workflowDir], ['Document the flag', other], 'a path from the plan folder, not from where wf start is typed');
  assert.equal((await startedBy(path.join(plan, 'a.md'), '--repo', repo, '--workflows', other)).workflowDir, other, '--workflows over the card');

  const before = runsWritten();
  await assert.rejects(main(['start', path.join(plan, 'd.md'), '--repo', repo], b.e),
    refusedWith(new RegExp(`^${escaped(path.join(plan, 'd.md'))}: \`after: a, b\` — this card waits on the runs of a and b, and wf start was given no --after, so it would start at once`)));
  assert.equal(runsWritten(), before, 'no run written');
  const d = await startedBy(path.join(plan, 'd.md'), '--workflows', dev, '--repo', repo, '--after', a.id, '--after', second.id);
  assert.deepEqual([d.brief, d.after], ['Show the flag', [a.id, second.id]]);

  // Not a card: a brief whose frontmatter has a key a card does not have is taken whole, and so is one that opens with a rule and never closes it.
  const brief = path.join(fs.mkdtempSync(path.join(ROOT, 'brief-')), 'brief.md');
  fs.writeFileSync(brief, '---\ntitle: the flag\nworkflow: dev\n---\nParse the flag.\n');
  assert.equal((await startedBy(brief, '--repo', repo, '--workflows', dev)).brief, '---\ntitle: the flag\nworkflow: dev\n---\nParse the flag.');
  fs.writeFileSync(brief, '---\nA brief that opens with a rule.\n');
  assert.equal((await startedBy(brief, '--repo', repo, '--workflows', dev)).brief, '---\nA brief that opens with a rule.');
});

test("REFUSED before, now read as it was: a run from before collection — its step past hand-off, its worktree still there, its files on the branch and none in its files directory — has nothing missing, and no pass collects it; a file on no branch still reads not collected", async () => {
  const run = started(folder('check: npm test'));
  const b = board();
  await advance(b.e, readRun(run.id));
  const files = artifactsDir(run, 'implement');
  fs.writeFileSync(path.join(run.repo, '.gitignore'), '.e2e/\n');
  fs.mkdirSync(path.join(run.repo, '.e2e'));
  fs.writeFileSync(path.join(run.repo, '.e2e', 'shot.png'), 'png');
  fs.mkdirSync(path.join(run.repo, 'docs'));
  fs.writeFileSync(path.join(run.repo, 'docs', 'RESPONSE.md'), '# response\n');
  gitIn(run.repo, 'add', '-A');
  gitIn(run.repo, 'commit', '-q', '-m', 'the step, handed off');
  // As a run from before collection left it: its check filed, and nothing in its files directory.
  const record = readRun(run.id);
  record.steps.implement = { ...record.steps.implement!, check: { taskId: `${run.id}-implement-check` } };
  fs.writeFileSync(path.join(ROOT, 'runs', `${run.id}.json`), JSON.stringify(record, null, 2));
  b.settle(`${run.id}-implement`, 'succeeded', declaring(['docs/RESPONSE.md', '.e2e/shot.png']));
  fs.rmSync(files, { recursive: true, force: true });

  assert.equal(execFileSync('git', ['cat-file', '-t', `${run.branch}:docs/RESPONSE.md`], { cwd: run.repo, encoding: 'utf8' }).trim(), 'blob');
  assert.ok(fs.existsSync(path.join(run.repo, 'docs', 'RESPONSE.md')), 'the worktree is still there');
  assert.deepEqual(missingArtifacts(readRun(run.id), 'implement', declaring(['docs/RESPONSE.md', '.e2e/shot.png'])),
    [{ path: '.e2e/shot.png', why: 'not collected' }], 'the branch has RESPONSE.md; a file git ignores is on no branch');
  // Past hand-off, so no pass collects it: the branch is where the run reads it.
  assert.deepEqual((await advance(b.e, readRun(run.id))).notes, []);
  assert.deepEqual(artifactFiles(run, 'implement'), []);
});

// ─── what a step may spend ──────────────────────────────────────────────────

test("a step's `budget:` is frozen on the run with the rest of its keys: the folder edited afterwards never raises it, nor takes it off", () => {
  const dir = folder('budget: 2.50');
  const run = started(dir);
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nbudget: 500\n---\nimplement it\n');
  assert.deepEqual(stepsOf(readRun(run.id)).map((s) => [s.name, s.budget]), [['implement', 2.5], ['review', undefined]]);
});

test("REFUSED past its budget at shipped defaults: a claude step whose ended tries cost more than its `budget:` is not tried again by `retries:` — `wf ls` says over budget with the amounts — `wf retry` is refused without `--budget` or with one not above what it spent, and one above it files the try, the cap on the record", async () => {
  const { run, e, tasks, filings, settle, logs } = await throughCheck('check: npm test\nretries: 2\nbudget: 3', 'failed', 1);
  const implement = `${run.id}-implement`;
  // The engine's view of the settled try, with what it cost on it — and its check's log, which `wf ls` and `wf decide` read the exit off.
  settle(implement, 'succeeded', SIGNED, undefined, undefined, { costUsd: 4.25 });
  logs.set(`${implement}-check`, 'not ok 1 - parses\n\n[wf check] exit 1\n');
  for (let i = 0; i < 2; i++) {
    const pass = await advance(e, readRun(run.id));
    assert.deepEqual([pass.tried, pass.filed, pass.checked, pass.blocked, pass.status], [[], [], [], ['review'], 'failed'], `pass ${i + 1}`);
  }
  assert.deepEqual(filings, [implement, `${implement}-check`], '`retries: 2` files nothing past the cap');
  assert.equal(tasks.get(implement)!.spec.budgetUsd, 3, 'a claude step runs as a job, which keeps the cap: filed with it whole');
  const l = await list(e, readRun(run.id));
  assert.deepEqual([l.steps[0]!.status, l.waitingOnYou], ['over budget $4.25 of $3', ['implement']]);
  await assert.rejects(retry(e, run.id, 'implement', { mode: 'nudge' }), refusedWith(/^implement is over budget: its tries have cost \$4\.25 of its \$3 budget, .*: wf retry \S+ implement --budget <amount>\.$/));
  await assert.rejects(retry(e, run.id, 'implement', { mode: 'nudge', budget: 4 }), refusedWith(/^--budget 4 is not above \$4\.25, what implement's tries have cost/));
  assert.deepEqual(asksOf(run.id), [], 'no ask written');
  const { offers, decision: d } = await decide(e, run.id);
  assert.deepEqual(d.kind === 'awaiting' && [d.outcome, d.overBudget, d.failedCheck], ['failed', ['implement'], ['implement']]);
  assert.match(offers[0]!, new RegExp(`^implement: over budget \\(check refused\\), \\$4\\.25 of \\$3\\. Raise its cap above \\$4\\.25 and continue its session:  wf retry ${run.id} implement --budget <amount>`));

  const { ask } = await retry(e, run.id, 'implement', { mode: 'nudge', budget: 10 });
  assert.equal(ask.budget, 10);
  assert.match((await list(e, readRun(run.id))).steps[0]!.note ?? '', /^try 2 asked \(--nudge, --budget 10\) — the next tick files it/);
  const pass = await advance(e, readRun(run.id));
  const try2 = `${implement}-try2`;
  assert.deepEqual(pass.tried, ['implement']);
  assert.ok(pass.notes.includes('implement: try 2 — wf retry --nudge --budget 10'), pass.notes.join('\n'));
  assert.deepEqual(readRun(run.id).steps.implement?.tries, [{ taskId: implement, check: { taskId: `${implement}-check` }, then: 'nudge', budget: 10 }]);
  const spec = tasks.get(try2)!.spec;
  assert.deepEqual([spec.resumeFrom, spec.budgetUsd], [`native-${implement}`, 5.75], 'the job resumed, handed what is left of $10 after the $4.25 its tries cost: a resume is charged its own spend');
  assert.match(spec.brief, /A person asked for this try: `wf retry --nudge --budget 10`, raising this step's budget to \$10\./);
  assert.match(spec.brief, /^## Try 2\n\nAfter the last try signed off, the run executed this step's check, and it did not pass\.\nAnd this step's tries had together cost its budget or more, so the run filed nothing more for it until a person raised the cap\.\n/);

  // Try 2 costs $6 more — $10.25 of $10 — and its check refuses: over again, and `retries:` files nothing on its own.
  settle(try2, 'succeeded', SIGNED, undefined, undefined, { costUsd: 6 });
  assert.deepEqual((await advance(e, readRun(run.id))).checked, ['implement']);
  settle(`${try2}-check`, 'failed', undefined, 1);
  logs.set(`${try2}-check`, '[wf check] exit 1\n');
  assert.deepEqual((await advance(e, readRun(run.id))).tried, []);
  const again = await list(e, readRun(run.id));
  assert.deepEqual([again.steps[0]!.status, again.steps[0]!.note], ['over budget $10.25 of $10', 'try 2, nudged on your word, budget $10']);
});

test("a claude-detached step's `budget:` goes to the engine as `budgetUsd`; a session its harness ended at the cap reads budget exhausted — not tried by `retries:`, offered `--budget`, refused one not above what it spent — and a try with a larger one carries it", async () => {
  const run = started(folder('harness: claude-detached\ncheck: npm test\nretries: 2\nbudget: 3'));
  const { e, tasks, filings, settle } = board();
  await advance(e, readRun(run.id));
  const implement = `${run.id}-implement`;
  assert.deepEqual([tasks.get(implement)!.spec.harness, tasks.get(implement)!.spec.budgetUsd], ['claude-detached', 3]);
  // The engine settles it `failed`, naming the budget, with what the session cost.
  settle(implement, 'failed', undefined, 1, 'budget', { costUsd: 3.02 });
  for (let i = 0; i < 2; i++) {
    const pass = await advance(e, readRun(run.id));
    assert.deepEqual([pass.tried, pass.filed, pass.checked, pass.blocked, pass.status], [[], [], [], ['review'], 'failed'], `pass ${i + 1}`);
  }
  assert.deepEqual(filings, [implement]);
  const l = await list(e, readRun(run.id));
  assert.deepEqual([l.steps[0]!.status, l.waitingOnYou], ['budget exhausted $3.02 of $3', ['implement']]);
  const { offers, decision: d } = await decide(e, run.id);
  assert.deepEqual(d.kind === 'awaiting' && [d.outcome, d.budgetExhausted, d.failed], ['blocked', ['implement'], []]);
  assert.deepEqual(offers, [`implement: budget exhausted, $3.02 of $3. Raise its cap above $3.02 and continue its session:  wf retry ${run.id} implement --budget <amount>  (--fresh, or --model <m>, for a new session; retries: 2, 0 spent)`]);
  await assert.rejects(retry(e, run.id, 'implement', { mode: 'fresh' }), refusedWith(/^implement ended at its budget: its harness stopped its session at \$3/));
  await assert.rejects(retry(e, run.id, 'implement', { mode: 'fresh', budget: 2 }), refusedWith(/^--budget 2 is not above \$3\.02, what implement's tries have cost/));
  await retry(e, run.id, 'implement', { mode: 'fresh', budget: 8 });
  assert.deepEqual((await advance(e, readRun(run.id))).tried, ['implement']);
  const spec = tasks.get(`${implement}-try2`)!.spec;
  assert.deepEqual([spec.harness, spec.budgetUsd, spec.resumeFrom], ['claude-detached', 4.98, undefined], 'what is left of $8 after the $3.02 its tries cost');
  assert.match(spec.brief, /The last try's session was ended by its harness at this step's budget, before it signed off\./);
});

test("REFUSED past a budget in a loop at shipped defaults: review's `again: true` files no round while implement is over its budget — `wf round` is refused without `--budget`, and with one files the round, the cap on implement's record", async (t) => {
  const { main } = await import('../src/cli.ts');
  const run = started(looped('', 'budget: 3\n'));
  const b = board();
  await advance(b.e, readRun(run.id));
  await toReview(b, run.id, 1, true);
  b.settle(`${run.id}-implement`, 'succeeded', SIGNED, undefined, undefined, { costUsd: 4.25 });
  const filed = [...b.filings];
  for (let i = 0; i < 2; i++) {
    const pass = await advance(b.e, readRun(run.id));
    assert.deepEqual([pass.looped, pass.filed, pass.tried, pass.status], [[], [], [], 'failed'], `pass ${i + 1}`);
  }
  assert.deepEqual(b.filings, filed, 'no round');
  const l = await list(b.e, readRun(run.id));
  assert.deepEqual([l.steps.map((s) => s.status), l.waitingOnYou], [['over budget $4.25 of $3', 'over budget — implement $4.25 of $3'], ['implement', 'review']]);
  await assert.rejects(round(b.e, run.id), refusedWith(/^review asked for round 2, and implement has cost \$4\.25 of its \$3 budget/));
  await assert.rejects(main(['round', run.id, '--budget', 'lots'], b.e), refusedWith(/^--budget takes the most a step of the loop may cost together, in dollars, above what it has cost — an amount above zero, in digits, like 5 or 2\.50, and lots is not one/));
  assert.deepEqual(roundAsksOf(run.id), []);

  const { ask } = await round(b.e, run.id, undefined, 10);
  assert.deepEqual([ask.round, ask.budget], [2, 10]);
  // Asked, and not filed yet: no step of the loop is held on its budget, and the run waits on nobody — `wf ls`, `wf decide` and the CLI say so.
  const asked = await list(b.e, readRun(run.id));
  assert.deepEqual([asked.steps.map((s) => s.status), asked.waitingOnYou], [['verified ✓', 'unverified · done'], []]);
  assert.deepEqual((await decide(b.e, run.id)).decision, { kind: 'running', waiting: ['review'] });
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => { printed.push(args.join(' ')); });
  try {
    await main(['ls', run.id], b.e);
    await main(['decide', run.id], b.e);
  } finally { log.mock.restore(); }
  assert.doesNotMatch(printed.join('\n'), /over budget|waiting on you|OVER BUDGET/i, printed.join('\n'));
  assert.match(printed.join('\n'), /still running: review\n {2}review: round 2 asked \(wf round --budget 10\) — the next tick files implement\n {2}nothing to decide yet/);
  const pass = await advance(b.e, readRun(run.id));
  assert.deepEqual(pass.looped, ['review']);
  assert.ok(pass.notes.includes('review: round 2 — wf round --budget 10; implement goes again'), pass.notes.join('\n'));
  assert.deepEqual(readRun(run.id).steps.implement?.tries, [{ taskId: `${run.id}-implement`, check: { taskId: `${run.id}-implement-check` }, then: 'round', budget: 10 }]);
  assert.equal(b.tasks.get(`${run.id}-implement-try2`)!.spec.budgetUsd, 5.75, 'on claude, a job, the round is handed what is left of the raised cap');
  assert.equal((await list(b.e, readRun(run.id))).steps[0]!.note, 'round 2 of 3, budget $10');
});

test('REFUSED by the CLI before a run is read: `wf retry --budget` with no amount, a word, 0, a unit, twice, or with --recheck — and `--budget=<amount>` is read', async () => {
  const { main } = await import('../src/cli.ts');
  const { e } = board();
  const cases: Array<[string[], RegExp]> = [
    [['--budget'], /^--budget takes the most the step's tries may cost together, in dollars, above what they have cost — an amount above zero, in digits, like 5 or 2\.50: wf retry <runId> <step> --budget <amount>$/],
    [['--budget', 'five'], /, and five is not one: /],
    [['--budget', '0'], /, and 0 is not one: /],
    [['--budget', '$5'], /, and \$5 is not one: /],
    [['--budget', '5', '--budget', '6'], /^wf retry takes --budget once/],
    [['--recheck', '--budget', '5'], /^--budget raises a step's cap for the session a try files, and --recheck files none/],
  ];
  for (const [argv, pattern] of cases) await assert.rejects(main(['retry', 'no-such-run', 'implement', ...argv], e), refusedWith(pattern), argv.join(' '));
  await assert.rejects(main(['retry', 'no-such-run', 'implement', '--budget=5'], e), /^Error: no such run: no-such-run/, 'read, and the run is looked for');
});

test("a claude-detached step's tries share its cap: `retries:` files the next try with what is left of it, not a cap of its own — and at the cap, nothing left, files none", async () => {
  const { run, e, tasks, settle, logs } = await throughCheck('harness: claude-detached\ncheck: npm test\nretries: 2\nbudget: 3', 'failed', 1);
  const implement = `${run.id}-implement`;
  assert.equal(tasks.get(implement)!.spec.budgetUsd, 3, 'the first filing: nothing spent, the whole cap');
  settle(implement, 'succeeded', SIGNED, undefined, undefined, { costUsd: 2.9 });
  logs.set(`${implement}-check`, '[wf check] exit 1\n');
  assert.deepEqual((await advance(e, readRun(run.id))).tried, ['implement'], '$2.90 of $3: `retries:` tries it');
  const try2 = `${implement}-try2`;
  assert.equal(tasks.get(try2)!.spec.budgetUsd, 0.1, 'what is left of $3 after $2.90');

  settle(try2, 'succeeded', SIGNED, undefined, undefined, { costUsd: 0.1 });
  assert.deepEqual((await advance(e, readRun(run.id))).checked, ['implement']);
  settle(`${try2}-check`, 'failed', undefined, 1);
  logs.set(`${try2}-check`, '[wf check] exit 1\n');
  const pass = await advance(e, readRun(run.id));
  assert.deepEqual([pass.tried, pass.blocked], [[], ['review']], '$3.00 of $3: nothing left, and `retries: 2` does not spend the try it has');
  assert.equal((await list(e, readRun(run.id))).steps[0]!.status, 'over budget $3.00 of $3');
});

test("a nudge past a budget is told why its last try ended on its own work — here, without its closeout — beside the budget a person raised, and not in its place", async () => {
  const run = started(folder('budget: 3'));
  const { e, tasks, settle } = board();
  await advance(e, readRun(run.id));
  const implement = `${run.id}-implement`;
  settle(implement, 'succeeded', undefined, undefined, undefined, { costUsd: 4.25 });
  assert.equal((await list(e, readRun(run.id))).steps[0]!.status, 'over budget $4.25 of $3');
  await retry(e, run.id, 'implement', { mode: 'nudge', budget: 10 });
  assert.deepEqual((await advance(e, readRun(run.id))).tried, ['implement']);
  const brief = tasks.get(`${implement}-try2`)!.spec.brief;
  assert.match(brief, /^## Try 2\n\nThe last try ended without the closeout the run asked for, or without a field its `output:` declares, so nothing that waits on this step started\.\nAnd this step's tries had together cost its budget or more, so the run filed nothing more for it until a person raised the cap\.\nA person asked for this try: `wf retry --nudge --budget 10`/);
  assert.doesNotMatch(brief, /The last try ended `over budget`/);
});

// ─── forgetting a run: `wf rm` ──────────────────────────────────────────────

/** A repository whose `.gitignore` names what a worktree is given and what a check leaves: not work, and never committed. */
const anIgnoringRepo = (): string => {
  const repo = aRepo();
  fs.writeFileSync(path.join(repo, '.gitignore'), 'node_modules\n.e2e/\n');
  gitIn(repo, 'add', '-A');
  gitIn(repo, 'commit', '-q', '-m', 'ignore');
  return repo;
};
const worktreesOf = (repo: string) => gitIn(repo, 'worktree', 'list', '--porcelain').split('\n').filter((l) => l.startsWith('worktree ')).map((l) => l.slice('worktree '.length));
const hasBranch = (repo: string, branch: string) => gitIn(repo, 'branch', '--list', branch) !== '';
const under = (...parts: string[]) => fs.existsSync(path.join(ROOT, ...parts));
/** `wf rm`, through the CLI, as a person types it: the lines it printed, and the error it ended with, if it did. */
const rmTyped = async (t: TestContext, e: Engine, ...args: string[]) => {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...a: unknown[]) => { printed.push(a.join(' ')); });
  const { main } = await import('../src/cli.ts');
  try {
    await main(['rm', ...args], e);
    return { printed, error: undefined };
  } catch (err) {
    return { printed, error: err as Error & { exitCode?: number } };
  } finally {
    log.mock.restore();
  }
};

test("`wf rm` forgets a run that is over, at shipped defaults: its worktree removed through git, which lists it no more — what the failed step left uncommitted committed on its branch first, what git ignores not, and nothing a link in it leads to touched — then the record and every file under its id; its branch kept, and said so; the engine's board untouched; a second `wf rm` says there is no such run, and exits 0", async (t) => {
  const repo = anIgnoringRepo();
  const b = board();
  const run = start({ brief: 'add a flag', repo, workflowDir: folder() });
  await advance(b.e, readRun(run.id));
  const wt = readRun(run.id).steps.implement!.workspace!;
  assert.equal(wt, path.join(ROOT, 'worktrees', run.id, 'implement'));
  b.settle(`${run.id}-implement`, 'failed');
  await advance(b.e, readRun(run.id));   // the pass that hands the failed step off: nothing to commit yet

  // Written after the last pass: work, ignored files, and a link out of the worktree to something that must survive.
  fs.writeFileSync(path.join(wt, 'fix.ts'), 'export const fixed = true;\n');
  const outside = fs.mkdtempSync(path.join(ROOT, 'outside-'));
  fs.writeFileSync(path.join(outside, 'precious.txt'), 'keep me\n');
  fs.mkdirSync(path.join(wt, 'node_modules'));
  fs.symlinkSync(outside, path.join(wt, 'node_modules', 'linked'));
  fs.mkdirSync(path.join(wt, '.e2e'));
  fs.writeFileSync(path.join(wt, '.e2e', 'shot.png'), 'png');
  // Its files, keyed by its id — and another run's check log, whose id starts with this one's.
  fs.writeFileSync(path.join(ROOT, 'runs', run.id, 'artifacts', 'implement', 'report.md'), 'report\n');
  fs.mkdirSync(path.join(ROOT, 'checks'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'checks', `${run.id}-implement-check.stderr`), 'boom\n');
  fs.writeFileSync(path.join(ROOT, 'checks', `${run.id}-x2-implement-check.stderr`), 'not mine\n');
  writeRun(aRun(`${run.id}-x2`, { implement: { taskId: `${run.id}-x2-implement` } }));
  fs.mkdirSync(path.join(ROOT, 'runs', `${run.id}.asks`, 'done'), { recursive: true });
  const filings = [...b.filings];

  const { printed, error } = await rmTyped(t, b.e, run.id);
  assert.equal(error, undefined);
  const branch = `wf/${run.id}/implement`;
  const commit = gitIn(repo, 'rev-parse', branch);
  assert.deepEqual(printed, [
    `${run.id}  forgotten: removed 1 worktree, committed what implement left uncommitted on ${branch} as ${commit.slice(0, 7)}; `
    + `removed runs/${run.id}.json, runs/${run.id}.asks/, runs/${run.id}/, checks/${run.id}-implement-check.stderr, worktrees/${run.id}/; `
    + `kept ${branch} — branches are kept unless asked: --delete-branches deletes those merged into ${run.branch}`,
  ]);

  assert.ok(!worktreesOf(repo).includes(wt), 'git lists the worktree no more');
  assert.ok(!fs.existsSync(wt) && !under('worktrees', run.id));
  assert.equal(gitIn(repo, 'log', '-1', '--format=%s', branch), 'implement: hand off what was left uncommitted, before its run was forgotten');
  assert.deepEqual(gitIn(repo, 'show', '--name-only', '--format=', branch).split('\n'), ['fix.ts'], 'the work, and nothing git ignores');
  assert.equal(fs.readFileSync(path.join(outside, 'precious.txt'), 'utf8'), 'keep me\n', 'a link in node_modules is not followed');
  for (const gone of [[`${run.id}.json`], [run.id], [`${run.id}.asks`]]) assert.ok(!under('runs', ...gone), `runs/${gone.join('/')} removed`);
  assert.ok(!under('checks', `${run.id}-implement-check.stderr`));
  assert.ok(under('checks', `${run.id}-x2-implement-check.stderr`), "another run's check log is left");
  assert.deepEqual([b.filings, b.stopped, b.tasks.has(`${run.id}-implement`)], [filings, [], true], "the engine's board is the engine's");
  assert.throws(() => readRun(run.id), (err: Error) => /^no such run: /.test(err.message));

  const again = await rmTyped(t, b.e, run.id);
  assert.deepEqual([again.printed, again.error], [[`${run.id}  no such run — nothing to forget`], undefined]);
  assert.ok(under('checks', `${run.id}-x2-implement-check.stderr`), "with no record, still not another stored run's");
  fs.rmSync(path.join(ROOT, 'runs', `${run.id}-x2.json`));
});

test('REFUSED at shipped defaults: `wf rm` on a run with a step in flight, one whose next step is ready, one with an unspent ask, and one another run waits on — each named on its line with what to do, nothing of it removed, exit 2 — while a run beside them in the same `wf rm` is forgotten', async (t) => {
  const repo = aRepo();
  const b = board();
  const running = start({ brief: 'still running', repo, workflowDir: folder() });
  await advance(b.e, readRun(running.id));
  const ready = start({ brief: 'review is ready', repo, workflowDir: folder() });
  await advance(b.e, readRun(ready.id));
  b.settle(`${ready.id}-implement`, 'succeeded', SIGNED);
  const asked = start({ brief: 'a try asked for', repo, workflowDir: folder() });
  await advance(b.e, readRun(asked.id));
  b.settle(`${asked.id}-implement`, 'succeeded');   // no closeout: unsigned, and waiting on a person
  await retry(b.e, asked.id, 'implement', { mode: 'nudge' });
  const parent = await aParent(repo, b, { work: 'parent.txt' });
  const child = start({ brief: 'the child', repo, workflowDir: folder(), after: [parent.run.id] });
  const over = await aParent(repo, b, { work: 'over.txt' });

  const { printed, error } = await rmTyped(t, b.e, running.id, ready.id, asked.id, parent.run.id, over.run.id);
  assert.equal(error?.exitCode, 2);
  assert.equal(error?.message, `wf rm: ${running.id}, ${ready.id}, ${asked.id}, ${parent.run.id} not forgotten — each line above says why, and what to do.`);
  assert.deepEqual(printed.slice(0, 4), [
    `${running.id}  not forgotten: implement is pending. Forgetting is not cancelling: wf cancel ${running.id} stops what is in flight and files nothing more, then wf rm ${running.id} once what was in flight has settled (wf ls ${running.id}).`,
    `${ready.id}  not forgotten: review is ready to be filed, and a pass may be filing it now. Forgetting is not cancelling: wf cancel ${ready.id} files nothing more, then wf rm ${ready.id}.`,
    `${asked.id}  not forgotten: try 2 of implement is due (wf retry --nudge), and a pass may be filing it now. Forgetting is not cancelling: wf cancel ${asked.id} files nothing more, then wf rm ${asked.id}.`,
    `${parent.run.id}  not forgotten: ${child.id} waits on it and has not started: forgotten, it would read waiting on ${parent.run.id} (no such run) for ever. Let it start first, on the pass after wf decide says ${parent.run.id} has shipped, or call it off: wf cancel ${child.id}.`,
  ]);
  assert.match(printed[4]!, new RegExp(`^${escaped(over.run.id)}  forgotten: removed 1 worktree; `));
  for (const id of [running.id, ready.id, asked.id, parent.run.id]) {
    assert.ok(under('runs', `${id}.json`) && under('worktrees', id, 'implement'), `${id}: record and worktree kept`);
  }
  assert.ok(under('runs', `${asked.id}.asks`, 'retry-implement-2'), 'and the ask');
  assert.deepEqual(b.stopped, [], 'nothing stopped: cancelling is its own verb');

  // A person cancels: what is in flight is stopped by a tick, and the run is forgotten once it has settled — not before.
  await cancel(b.e, running.id);
  assert.match((await forget(b.e, running.id)).refusal!, /^implement is pending\. It was cancelled at .*, and a tick stops what is in flight: wf rm .* once it has settled/);
  b.settle(`${running.id}-implement`, 'stopped');
  assert.equal((await forget(b.e, running.id)).kind, 'forgotten');
  // A cancelled run files nothing and honours no ask; a child called off strands nothing.
  await cancel(b.e, ready.id);
  await cancel(b.e, asked.id);
  await cancel(b.e, child.id);
  for (const id of [ready.id, asked.id, parent.run.id]) assert.equal((await forget(b.e, id)).kind, 'forgotten', id);
  assert.ok(!under('runs', `${asked.id}.asks`) && !under('runs', `${asked.id}.cancelled`), 'its ask and its cancellation go with it');
});

test('REFUSED at shipped defaults: a check a pass filed and died before writing down is in flight too — on a cancelled run, which files nothing, it is what holds `wf rm` until it settles', async () => {
  const run = start({ brief: 'a check nobody wrote down', repo: aRepo(), workflowDir: folder('check: npm test') });
  const b = board();
  await advance(b.e, readRun(run.id));
  b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await b.e.file({ id: `${run.id}-implement-check`, brief: 'npm test', cwd: '/', harness: 'check' } as never);   // filed; the record never says so
  const at = markCancelled(run.id);
  assert.equal(readRun(run.id).steps.implement!.check, undefined);

  const held = await forget(b.e, run.id);
  assert.equal(held.refusal, `implement's check is pending. It was cancelled at ${at}, and a tick stops what is in flight: wf rm ${run.id} once it has settled (wf ls ${run.id}).`);
  assert.ok(under('runs', `${run.id}.json`) && under('worktrees', run.id, 'implement'));
  b.settle(`${run.id}-implement-check`, 'stopped');
  assert.equal((await forget(b.e, run.id)).kind, 'forgotten');
});

test("REFUSED at shipped defaults: a locked worktree — git will not remove it, and neither does `wf rm`: the run is held, its record, files and branch kept, exit 2, with the command that unlocks it; unlocked, `wf rm` again finishes. A directory in the run's own that git does not know is held the same way", async (t) => {
  const repo = aRepo();
  const b = board();
  const locked = await aParent(repo, b, { work: 'locked.txt' });
  gitIn(repo, 'worktree', 'lock', '--reason', 'a person holds it', locked.wt);
  markCancelled(locked.run.id);

  const held = await rmTyped(t, b.e, locked.run.id);
  assert.deepEqual([held.error?.exitCode, held.error?.message], [2, `wf rm: ${locked.run.id} not forgotten — its line above says why, and what to do.`]);
  assert.deepEqual(held.printed, [
    `${locked.run.id}  not forgotten: ${locked.wt} is locked (a person holds it), and git will not remove it — unlock it if nothing needs it: git -C ${repo} worktree unlock ${locked.wt}. Its record, files and branches are kept until every worktree is gone: wf rm ${locked.run.id} again then.`,
  ]);
  assert.ok(fs.existsSync(path.join(locked.wt, 'locked.txt')) && worktreesOf(repo).includes(locked.wt));
  assert.ok(readRun(locked.run.id).cancelledAt, 'the record is read with its cancellation, still');

  gitIn(repo, 'worktree', 'unlock', locked.wt);
  assert.equal((await forget(b.e, locked.run.id)).kind, 'forgotten');
  assert.ok(!worktreesOf(repo).includes(locked.wt) && !under('runs', `${locked.run.id}.cancelled`) && hasBranch(repo, locked.branch));

  // Something in the run's directory that git does not list: never deleted behind git's back.
  const stray = await aParent(repo, b, { work: 'stray.txt' });
  const odd = path.join(ROOT, 'worktrees', stray.run.id, 'notes');
  fs.mkdirSync(odd);
  fs.writeFileSync(path.join(odd, 'mine.txt'), 'mine\n');
  const f = await forget(b.e, stray.run.id);
  assert.equal(forgetLineOf(f), `${stray.run.id}  not forgotten: ${odd} is not a worktree git knows, and wf rm removes worktrees only through git — look in it, and remove it yourself if nothing there is wanted; removed 1 worktree. Its record, files and branches are kept until every worktree is gone: wf rm ${stray.run.id} again then.`);
  assert.ok(fs.existsSync(path.join(odd, 'mine.txt')) && under('runs', `${stray.run.id}.json`));
  fs.rmSync(odd, { recursive: true });
  const finished = await forget(b.e, stray.run.id);
  assert.deepEqual([finished.kind, finished.removed, finished.gone], ['forgotten', [], [stray.wt]], 'its worktree was already gone, and that is normal');
});

test("`wf rm --delete-branches` deletes a branch merged into its run's base and keeps one that is not, saying why; `--force-unmerged` beside it deletes that one too; the base branch a `--no-worktree` run worked on is never touched — and the CLI refuses `--force-unmerged` alone, a flag it does not take, and an id that is not a name, before anything is read", async (t) => {
  const repo = aRepo();
  const b = board();
  const merged = await aParent(repo, b, { work: 'merged.txt' });
  gitIn(repo, 'merge', '-q', '--no-ff', '-m', 'Merge it', merged.branch);
  const unmerged = await aParent(repo, b, { work: 'unmerged.txt' });
  const forced = await aParent(repo, b, { work: 'forced.txt' });
  const base = merged.run.branch;

  const one = await rmTyped(t, b.e, merged.run.id, unmerged.run.id, '--delete-branches');
  assert.equal(one.error, undefined);
  assert.match(one.printed[0]!, new RegExp(`; deleted ${escaped(merged.branch)} \\(merged into ${base}\\)$`));
  assert.match(one.printed[1]!, new RegExp(`; kept ${escaped(unmerged.branch)}: not merged into ${base} — --force-unmerged deletes it, and the work on it$`));
  assert.deepEqual([hasBranch(repo, merged.branch), hasBranch(repo, unmerged.branch)], [false, true]);

  const two = await rmTyped(t, b.e, forced.run.id, '--force-unmerged', '--delete-branches');
  assert.match(two.printed[0]!, new RegExp(`; deleted ${escaped(forced.branch)} \\(not merged into ${base}, forced\\)$`));
  assert.equal(hasBranch(repo, forced.branch), false);

  const direct = start({ brief: 'on the base itself', repo, workflowDir: oneStep(), isolate: false });
  await advance(b.e, readRun(direct.id));
  b.settle(`${direct.id}-implement`, 'succeeded', SIGNED);
  const three = await rmTyped(t, b.e, direct.id, '--delete-branches', '--force-unmerged');
  assert.deepEqual(three.printed, [`${direct.id}  forgotten: no worktrees, it worked in ${repo} itself; removed runs/${direct.id}.json, runs/${direct.id}/; no branch of its own`]);
  assert.ok(hasBranch(repo, base) && fs.existsSync(path.join(repo, '.git')), 'the base branch and the repository are where they were');

  const kept = await aParent(repo, b, { work: 'kept.txt' });
  const refused = async (args: string[], pattern: RegExp) => {
    const { printed, error } = await rmTyped(t, b.e, ...args);
    assert.equal(error?.exitCode, 2, args.join(' '));
    assert.match(error!.message, pattern);
    assert.deepEqual(printed, [], 'refused before any run is read');
    assert.ok(under('runs', `${kept.run.id}.json`) && hasBranch(repo, kept.branch));
  };
  await refused([kept.run.id, '--force-unmerged'], /^--force-unmerged forces --delete-branches to delete a branch not merged into its run's base branch, and alone deletes nothing: /);
  await refused([kept.run.id, '--force'], /^wf rm does not take --force\. It takes the runs to forget, then --delete-branches, and --force-unmerged beside it: /);
  await refused(['--delete-branches'], /^wf rm takes the runs to forget, by id: /);

  // An id that is not a name names a directory that is not the run's: `..` is the store itself.
  for (const id of ['..', '.', 'runs/../..', '']) {
    const { printed, error } = await rmTyped(t, b.e, id);
    assert.equal(error?.exitCode, 2, JSON.stringify(id));
    assert.deepEqual(printed, [`${id}  not forgotten: ${JSON.stringify(id)} is not a run's id, and wf rm removes what is under WF_ROOT by id — lowercase letters, digits and dashes: give the id wf ls prints, as in wf rm add-a-flag-x1y2.`]);
    assert.ok(under('runs', `${kept.run.id}.json`) && under('worktrees', kept.run.id, 'implement'), 'the store is where it was');
  }
});

test("REFUSED at shipped defaults: a pass that read a run before `wf rm` forgot it writes nothing back — the record stays gone — and a pass that reaches a run's asks as they are removed does not make their directory again; a record gone between the store's listing and its read is no run, and no failure", async (t) => {
  const repo = aRepo();
  const b = board();
  const p = await aParent(repo, b, { work: 'done.txt' });
  // The pass after it finished records its branch's tip, and writes the record: held on the engine, after it has read the run.
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const slow = { ...b.e, view: async (id: string) => { await gate; return b.e.view(id); } } as Engine;
  const pass = advance(slow, readRun(p.run.id));
  assert.equal((await forget(b.e, p.run.id)).kind, 'forgotten');
  release();
  const after = await pass;
  assert.equal(after.status, 'succeeded');
  assert.ok(after.run.tips, 'the pass had tips to write');
  assert.ok(!under('runs', `${p.run.id}.json`), 'and did not write them into a record it made again');
  assert.deepEqual(listRuns().filter((r) => r.id === p.run.id), []);

  // A spent ask, still in the directory: the pass moves it into `done/`, and `wf rm` removes the directory as it does.
  const q = await aParent(repo, b, { work: 'asked.txt' });
  const asks = path.join(ROOT, 'runs', `${q.run.id}.asks`);
  fs.mkdirSync(asks);
  fs.writeFileSync(path.join(asks, 'retry-implement-1'), JSON.stringify({ step: 'implement', try: 1, mode: 'nudge', at: '2026-09-16T00:00:00.000Z' }));
  const mkdir = fs.mkdirSync;
  t.mock.method(fs, 'mkdirSync', (at: string, ...rest: unknown[]) => {
    if (String(at).startsWith(asks)) fs.rmSync(asks, { recursive: true, force: true });   // removed, as the pass reaches it
    return (mkdir as (...a: unknown[]) => unknown)(at, ...rest);
  });
  await advance(b.e, readRun(q.run.id));
  (fs.mkdirSync as unknown as { mock: { restore: () => void } }).mock.restore();
  assert.ok(!fs.existsSync(asks), 'no asks directory made again');

  // Listed, then gone before it is read: a dangling link reads as exactly that.
  const vanished = path.join(ROOT, 'runs', 'vanished-a1b2.json');
  fs.symlinkSync(path.join(ROOT, 'nowhere.json'), vanished);
  try {
    assert.ok(listRuns().length > 0);
    assert.ok(!listRuns().some((r) => r.id === 'vanished-a1b2'));
  } finally {
    fs.rmSync(vanished);
  }
});

test("a run whose tasks the engine no longer knows is forgotten; so is a record from before runs froze their workflow whose folder is gone — which every pass, `wf ls` and `wf decide` read and died on — and the line says so; a run with no record is `no such run`, and what was left under its id is removed and named", async (t) => {
  const { e } = recording();   // a board that has never heard of anything
  const legacyDir = fs.mkdtempSync(path.join(ROOT, 'legacy-'));
  fs.writeFileSync(path.join(legacyDir, 'implement.md'), 'implement it\n');
  const legacy = { ...aRun('legacy-run-9z9z', { implement: { taskId: 'legacy-run-9z9z-implement' } }), workflowDir: legacyDir };
  writeRun(legacy);
  assert.equal(stepsOf(readRun(legacy.id)).length, 1, 'read from the folder, since the record froze nothing');
  fs.rmSync(legacyDir, { recursive: true });
  assert.throws(() => stepsOf(readRun(legacy.id)), (err: Error) => /^no workflow folder at /.test(err.message));

  const { printed, error } = await rmTyped(t, e, legacy.id);
  assert.equal(error, undefined);
  assert.deepEqual(printed, [`${legacy.id}  forgotten: no worktrees, it worked in /repo itself; removed runs/${legacy.id}.json; no branch of its own; its workflow was never frozen, and no workflow folder at ${legacyDir}`]);

  // No record, and files left under the id: a cancellation typed as it went, an asks directory.
  fs.writeFileSync(path.join(ROOT, 'runs', 'gone-run-3c4d.cancelled'), '2026-09-16T00:00:00.000Z');
  fs.mkdirSync(path.join(ROOT, 'runs', 'gone-run-3c4d.asks', 'done'), { recursive: true });
  const leftover = await rmTyped(t, e, 'gone-run-3c4d');
  assert.deepEqual([leftover.printed, leftover.error], [['gone-run-3c4d  no such run — nothing to forget but what was left under its id: removed runs/gone-run-3c4d.cancelled, runs/gone-run-3c4d.asks/'], undefined]);
  assert.ok(!under('runs', 'gone-run-3c4d.asks') && !under('runs', 'gone-run-3c4d.cancelled'));
});

/**
 * A pass held inside `npm ci`, after it has cut its first step's worktree and before it files the step: a main checkout with a lockfile its
 * worktree does not have, and an `npm` first on PATH that waits to be let go. `release` lets it go, and answers with what the pass did.
 */
const heldInNpmCi = async (t: TestContext, b: ReturnType<typeof board>, brief: string) => {
  const repo = aRepo();
  fs.writeFileSync(path.join(repo, 'package-lock.json'), '{}\n');
  const bin = fs.mkdtempSync(path.join(ROOT, 'bin-'));
  const started = path.join(bin, 'started');
  const let_go = path.join(bin, 'release');
  fs.writeFileSync(path.join(bin, 'npm'), `#!/bin/sh\n: > '${started}'\nwhile [ ! -e '${let_go}' ]; do sleep 0.02; done\n`, { mode: 0o755 });
  const PATH = process.env.PATH;
  process.env.PATH = `${bin}${path.delimiter}${PATH}`;
  t.after(() => { process.env.PATH = PATH; fs.writeFileSync(let_go, ''); });
  const run = start({ brief, repo, workflowDir: folder() });
  const pass = advance(b.e, readRun(run.id));
  while (!fs.existsSync(started)) await new Promise((r) => setTimeout(r, 10));
  const wt = path.join(ROOT, 'worktrees', run.id, 'implement');
  assert.ok(worktreesOf(repo).includes(wt), 'the pass has cut the worktree, and not filed the step');
  return { run, repo, wt, release: () => { fs.writeFileSync(let_go, ''); return pass; } };
};

test("REFUSED at shipped defaults: a pass that read a run before `wf cancel` and is still cutting its step's worktree — `npm ci`, a minute — files nothing once the run is called off and forgotten under it: no session on the board, no record, no worktree made again", async (t) => {
  const b = board();
  const { run, release } = await heldInNpmCi(t, b, 'called off while it is cut');
  assert.deepEqual((await cancel(b.e, run.id)).plan, { kind: 'cancel', stop: [] }, 'nothing in flight to stop');
  assert.equal((await forget(b.e, run.id)).kind, 'forgotten');
  await release();

  assert.deepEqual(b.filings, [], 'the step is not filed into a worktree that is gone');
  assert.ok(!under('runs', `${run.id}.json`) && !under('runs', run.id) && !under('worktrees', run.id), 'nothing of the run made again');
});

test("REFUSED at shipped defaults: a pass still cutting a step's worktree when `wf cancel` lands files no session for it — the worktree it cut stays, and `wf rm` then forgets the run, with nothing in flight", async (t) => {
  const b = board();
  const { run, wt, release } = await heldInNpmCi(t, b, 'cancelled while it is cut');
  await cancel(b.e, run.id);
  const pass = await release();
  assert.deepEqual([pass.filed, b.filings, b.stopped], [[], [], []], 'nothing filed, so nothing to stop');
  assert.equal(readRun(run.id).steps.implement!.taskId, null);
  const forgot = await forget(b.e, run.id);
  assert.deepEqual([forgot.kind, forgot.removed], ['forgotten', [wt]]);
});

test("REFUSED at shipped defaults: a step a pass filed and died before writing down, on a run then cancelled — `wf rm` finds it on the engine, in flight, and says a tick stops it; the next tick does, and once it has settled the run is forgotten", async () => {
  const b = board();
  const run = start({ brief: 'filed and never written down', repo: aRepo(), workflowDir: folder() });
  const taskId = `${run.id}-implement`;
  await b.e.file({ id: taskId, brief: 'implement it', cwd: '/' } as never);   // the pass that filed it died here
  const at = markCancelled(run.id);
  assert.equal(readRun(run.id).steps.implement!.taskId, null, 'the record never names it');

  assert.equal((await forget(b.e, run.id)).refusal, `implement is pending. It was cancelled at ${at}, and a tick stops what is in flight: wf rm ${run.id} once it has settled (wf ls ${run.id}).`);
  assert.ok(under('runs', `${run.id}.json`));
  const pass = await advance(b.e, readRun(run.id));
  assert.deepEqual([b.stopped, pass.filed, b.filings], [[taskId], [], [taskId]], 'stopped, and nothing filed');
  b.settle(taskId, 'stopped');
  assert.equal((await forget(b.e, run.id)).kind, 'forgotten');
});

test("REFUSED at shipped defaults: a hand-off git will not commit — a pre-commit hook refusing a failed step's code — holds the run in the hook's own words with a safe way on, not git's --force; the work stays, staged. A hook that speaks on stdout alone is heard too, and once a person has committed it, `wf rm` again forgets the run", async () => {
  const repo = aRepo();
  const b = board();
  const p = await aParent(repo, b, { signed: true });
  fs.writeFileSync(path.join(p.wt, 'flag.ts'), 'export const flag: any = 1;\n');
  const hook = path.join(repo, '.git', 'hooks', 'pre-commit');
  fs.writeFileSync(hook, '#!/bin/sh\necho "lint: flag.ts:1 unexpected any" >&2\necho "husky - pre-commit script failed (code 1)" >&2\nexit 1\n', { mode: 0o755 });

  const held = await forget(b.e, p.run.id);
  assert.equal(forgetLineOf(held), `${p.run.id}  not forgotten: ${p.wt} holds what implement left uncommitted, and the hand-off could not commit it — lint: flag.ts:1 unexpected any / husky - pre-commit script failed (code 1). That work is on no branch until it is committed, so nothing of it was removed: commit it there yourself (it is staged: git -C ${p.wt} commit), then wf rm ${p.run.id} again. Its record, files and branches are kept until every worktree is gone: wf rm ${p.run.id} again then.`);
  assert.equal(gitIn(p.wt, 'status', '--porcelain'), 'A  flag.ts', 'the work is where it was, staged');
  assert.ok(worktreesOf(repo).includes(p.wt) && under('runs', `${p.run.id}.json`));

  // A hook that speaks on stdout alone: git hands it on as its own stderr.
  fs.writeFileSync(hook, '#!/bin/sh\necho "secret scan: a token in flag.ts"\nexit 1\n', { mode: 0o755 });
  assert.equal((await forget(b.e, p.run.id)).left[0]!.uncommitted, 'secret scan: a token in flag.ts');
  // One that says nothing: its exit status.
  fs.writeFileSync(hook, '#!/bin/sh\nexit 3\n', { mode: 0o755 });
  assert.equal((await forget(b.e, p.run.id)).left[0]!.uncommitted, 'it exited 1');

  fs.rmSync(hook);
  gitIn(p.wt, 'commit', '-q', '-m', 'the flag, committed by a person');
  const forgot = await forget(b.e, p.run.id);
  assert.deepEqual([forgot.kind, forgot.handedOff], ['forgotten', []]);
  assert.equal(gitIn(repo, 'log', '-1', '--format=%s', p.branch), 'the flag, committed by a person');
});

test("REFUSED at shipped defaults: a worktree on no branch — its session stopped with HEAD detached, a commit made there — is held and named with its commit, not removed with the commit on no branch; put on a branch, `wf rm` again forgets the run and the branch keeps the commit. One detached, clean, at a commit on a branch loses nothing, and is removed", async () => {
  const repo = aRepo();
  const b = board();
  const p = await aParent(repo, b, { work: 'first.txt' });
  gitIn(p.wt, 'checkout', '-q', '--detach');
  fs.writeFileSync(path.join(p.wt, 'rebased.txt'), 'rebased\n');
  gitIn(p.wt, 'add', '-A');
  gitIn(p.wt, 'commit', '-q', '-m', 'made on no branch');
  const sha = gitIn(p.wt, 'rev-parse', 'HEAD');

  const held = await forget(b.e, p.run.id);
  assert.equal(forgetLineOf(held), `${p.run.id}  not forgotten: ${p.wt} is on no branch — its HEAD is detached at ${sha.slice(0, 7)}, as a rebase, a bisect or a checkout of a commit leaves it — and removing it would leave what it holds, committed or not, on no branch: put it on one (git -C ${p.wt} switch -c <branch>, or finish or abort what left it there), then wf rm ${p.run.id} again. Its record, files and branches are kept until every worktree is gone: wf rm ${p.run.id} again then.`);
  assert.ok(worktreesOf(repo).includes(p.wt) && gitIn(p.wt, 'rev-parse', 'HEAD') === sha, 'the worktree, and its commit, where they were');

  // Uncommitted work beside it, at a commit that is on a branch: a hand-off would still commit onto no branch.
  gitIn(p.wt, 'checkout', '-q', '--detach', p.branch);
  fs.writeFileSync(path.join(p.wt, 'more.txt'), 'more\n');
  assert.deepEqual((await forget(b.e, p.run.id)).left.map((l) => l.detached), [gitIn(p.wt, 'rev-parse', 'HEAD')]);
  fs.rmSync(path.join(p.wt, 'more.txt'));
  gitIn(p.wt, 'checkout', '-q', sha);
  gitIn(p.wt, 'switch', '-q', '-c', 'keep-the-rebase');
  assert.equal((await forget(b.e, p.run.id)).kind, 'forgotten');
  assert.equal(gitIn(repo, 'rev-parse', 'keep-the-rebase'), sha);

  const q = await aParent(repo, b, { work: 'clean.txt' });
  gitIn(q.wt, 'checkout', '-q', '--detach');
  const forgot = await forget(b.e, q.run.id);
  assert.deepEqual([forgot.kind, forgot.removed, forgot.handedOff], ['forgotten', [q.wt], []]);
});

test("REFUSED at shipped defaults: `wf rm` on a name that is a live run's id plus the suffix of one of its files — `<id>.json`, `<id>.cancelled`, `<id>.asks`, as `ls runs/` gives them — exit 2, saying the id to give; its record, cancellation and asks stay. Nor does a run with no record take a live run's check logs: `wf rm <id>-implement` leaves `<id>-implement-check.stderr`", async (t) => {
  const repo = aRepo();
  const b = board();
  const live = await aParent(repo, b);   // implement filed, not settled: in flight
  const id = live.run.id;
  markCancelled(id);
  const asks = path.join(ROOT, 'runs', `${id}.asks`);
  fs.mkdirSync(asks, { recursive: true });
  fs.writeFileSync(path.join(asks, 'retry-implement-2'), JSON.stringify({ step: 'implement', try: 2, mode: 'nudge', at: '2026-09-16T00:00:00.000Z' }));
  fs.mkdirSync(path.join(ROOT, 'checks'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'checks', `${id}-implement-check.stderr`), 'the live run\'s\n');

  for (const [named, suffix] of [[`${id}.json`, '.json'], [`${id}.cancelled`, '.cancelled'], [`${id}.asks`, '.asks']] as const) {
    const { printed, error } = await rmTyped(t, b.e, named);
    assert.equal(error?.exitCode, 2, named);
    assert.deepEqual(printed, [`${named}  not forgotten: "${named}" is not a run's id: ${suffix} is on the name of one of its files under runs/, not on the run's. Give the id wf ls prints: wf rm ${id}.`]);
  }
  for (const other of ['R-XYZ', 'r_xyz', 'r.xyz']) {
    const { printed, error } = await rmTyped(t, b.e, other);
    assert.deepEqual([error?.exitCode, printed], [2, [`${other}  not forgotten: "${other}" is not a run's id, and wf rm removes what is under WF_ROOT by id — lowercase letters, digits and dashes: give the id wf ls prints, as in wf rm add-a-flag-x1y2.`]]);
  }
  assert.ok(under('runs', `${id}.json`) && under('runs', `${id}.cancelled`) && under('runs', `${id}.asks`, 'retry-implement-2'), 'the record, its cancellation and its ask stay');
  assert.ok(readRun(id).cancelledAt);

  const sibling = await rmTyped(t, b.e, `${id}-implement`);
  assert.deepEqual([sibling.error, sibling.printed], [undefined, [`${id}-implement  no such run — nothing to forget`]]);
  assert.ok(under('checks', `${id}-implement-check.stderr`), "the live run's check log stays");
});

test("REFUSED at shipped defaults: a pass that read a `--no-worktree` run before `wf rm` forgot it hands nothing off and collects nothing afterwards — its workspace, the repository, is still there, and its files directory is not made again", async () => {
  const repo = aRepo();
  const b = board();
  const run = start({ brief: 'notes on the base itself', repo, workflowDir: oneStep(), isolate: false });
  await advance(b.e, readRun(run.id));
  fs.writeFileSync(path.join(repo, 'notes.md'), 'notes\n');
  b.settle(`${run.id}-implement`, 'succeeded', { ...SIGNED, artifacts: ['notes.md'] });
  await advance(b.e, readRun(run.id));
  assert.ok(under('runs', run.id, 'artifacts', 'implement', 'notes.md'), 'collected, as a step with no check is on every pass');

  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const slow = { ...b.e, view: async (id: string) => { await gate; return b.e.view(id); } } as Engine;
  const pass = advance(slow, readRun(run.id));
  assert.equal((await forget(b.e, run.id)).kind, 'forgotten');
  fs.writeFileSync(path.join(repo, 'later.txt'), 'a person\'s edit, after the run was forgotten\n');
  release();
  await pass;

  assert.ok(!under('runs', run.id), 'no files directory without a record');
  assert.equal(gitIn(repo, 'status', '--porcelain'), '?? later.txt', "and nothing of a person's checkout committed under the step's name");
});

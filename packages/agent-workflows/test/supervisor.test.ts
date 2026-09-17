/**
 * `workflows/supervisor/`, the workflow of one step that never ends — held to its shape, and run on disk against a board a test settles.
 *
 *   supervise        (one step, `workspace: main`, `slot: none`, `remote: true`, no check)
 *
 * What it watches is every other run: it prepares a decision, asks by signing off `blocked`, and acts on the answer. So the two things
 * the package had to be able to do are here: a step answered many times over, each answer a try of the same session, and a run the cap on
 * runs in flight (`WF_MAX_RUNS`) neither holds nor counts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Engine } from 'agent-engine';
import type { TaskPhase } from '../src/run.ts';
import { loadWorkflows, terminalSteps, workflowDescription } from '../src/workflow.ts';

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-supervisor-'));
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

// WF_ROOT is read as the module loads, so it is set before the import rather than after it.
process.env.WF_ROOT = ROOT;
const { advance, list, readRun, retry, runSlots, start } = await import('../src/runner.ts');

const REPO = path.join(import.meta.dirname, '..', '..', '..');
const FOLDER = path.join(REPO, 'workflows', 'supervisor');

/** A step's prose with its line breaks as spaces, so a sentence is found wherever the file wraps it. */
const said = (text: string) => text.replace(/\s+/g, ' ');

/** What an unattended session has and no step needs (plan §4b, "what a worker gets, measured"), as every implement is denied it. */
const IMPLEMENT_DENIED = ['SendMessage', 'CronCreate', 'CronDelete', 'RemoteTrigger'];

/** A repository with one commit, so `wf start` has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo, stdio: 'ignore' });
  git('init', '-q');
  git('commit', '-q', '--allow-empty', '-m', 'base');
  return repo;
};

/** A folder of steps written from their frontmatter and a one-line body, for the shapes the shipped folder is not. */
const folderOf = (steps: Record<string, string>): string => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  for (const [name, front] of Object.entries(steps)) fs.writeFileSync(path.join(dir, `${name}.md`), `---\n${front}\n---\n${name} it\n`);
  return dir;
};

/**
 * An engine board a test settles by hand, as gate.test.ts's: what each task was filed with, every filing, and each task's own session
 * (`native-<id>`). A settled task carries the closeout it is given.
 */
const board = () => {
  type Filed = { id: string; brief: string; closeoutSchema?: object } & Record<string, unknown>;
  const tasks = new Map<string, { spec: Filed; phase: TaskPhase; closeout?: unknown; exitCode?: number }>();
  const filings: string[] = [];
  const stopped: string[] = [];
  const e = {
    view: async (id: string) => {
      const t = tasks.get(id);
      const settled = t && ['succeeded', 'failed', 'stopped'].includes(t.phase) ? t.phase : null;
      return {
        id, phase: t?.phase ?? 'pending', sessionId: t ? 's' : null,
        state: {
          brief: t?.spec.brief ?? '', closeoutSchema: t?.spec.closeoutSchema, settled, stopRequested: false, said: [],
          attempts: !t || t.phase === 'pending' ? [] : [{ n: 1, ended: null, nativeId: `native-${id}`, closeout: t.closeout, exitCode: t.exitCode ?? null, usage: null }],
        },
      };
    },
    file: async (spec: Filed) => { filings.push(spec.id); tasks.set(spec.id, { spec, phase: 'pending' }); return spec.id; },
    stop: async (id: string) => { stopped.push(id); },
    logs: async () => '(no output yet)',
    feed: async () => ({ entries: [], cursor: 0 }),
    tick: async () => {},
  } as unknown as Engine;
  const settle = (id: string, phase: TaskPhase, closeout?: unknown, exitCode?: number) => Object.assign(tasks.get(id)!, { phase, closeout, exitCode });
  return { e, tasks, filings, stopped, settle };
};

// ─── the folder, held to its shape ──────────────────────────────────────────

test('the supervisor is one step that never ends: in the repository\'s checkout, outside the cap on runs in flight, bridged to a phone, with implement\'s denies and no check', () => {
  const steps = loadWorkflows(FOLDER);
  assert.deepEqual(steps.map((s) => s.name), ['supervise']);
  const supervise = steps[0]!;
  const { after, workspace, slot, harness, model, remote, disallow, check, tools, output, gate, loop, resume, input } = supervise;
  assert.deepEqual({ after, workspace, slot, harness, model, remote, disallow, check, tools, output, gate, loop, resume, input }, {
    after: [], workspace: 'main', slot: 'none', harness: 'claude', model: 'opus', remote: true,
    disallow: IMPLEMENT_DENIED, check: undefined, tools: undefined, output: undefined, gate: undefined, loop: undefined, resume: undefined, input: undefined,
  });
  assert.deepEqual(terminalSteps(steps).map((s) => s.name), ['supervise'], 'it is the whole workflow');
  // No `output:` and no `gate:`, which is what lets it sign off `blocked` and be answered for ever: a declared output would have to be
  // invented on every one of those sign-offs, and a gate holds a handoff this step never makes.
  assert.equal(supervise.output, undefined);
  assert.ok(workflowDescription(FOLDER), 'the folder says what it is for');
});

test("the supervisor's brief is the loop: what it watches, how it reads a run to decide, how it asks and is answered, and that it never types git for a run", () => {
  const body = said(loadWorkflows(FOLDER)[0]!.body);
  for (const sentence of [
    // What it watches, and what it reads before it decides anything.
    '`wf ls` is the pass.',
    'the run\'s workflow folder — its README, and its last step\'s file',
    '`wf decide <run>`',
    'The look skill (`.claude/skills/look/SKILL.md`) reads them',
    // The three moments §9 names, and the fourth.
    '**A run to decide.**', '**A plan waiting.**', '**A stall.**', '**An idea from the person.**',
    'wf retry <run> <step> --message "<their answer>"',
    'wf say <run> <step> "<words>"',
    // How it asks: its own sign-off is the question, and the answer continues the session.
    'Sign off `blocked` with:',
    'their answer starts it again — the same session, continued',
    'There is no cap on how many times: that is the loop.',
    // What it does with a yes, and what it never does.
    '**`wf approve <run> <step> --message "<their words>"`**, and nothing more.',
    '**Never type git for a run.**',
    'Never `git add -A`, never `git commit -a`, never push, never merge, never delete a branch.',
    // It shares the checkout with every run's ending step, which stops at a dirty tree.
    '**Leave the checkout clean, always.**',
    '**Commit what you wrote before any `wf approve`.**',
    '**Never sign off with a file of yours uncommitted.**',
    '`git add <path>` for a file git does not track yet',
    // What it does when nothing needs a person, and the trap that cost the operator seventy-seven minutes.
    '**Never a background loop**', 'End anything you start before you sign off.',
    'Sign off only to ask a person something',
    // Where the lessons go.
    'a trap in `CLAUDE.md`',
  ]) assert.ok(body.includes(sentence), `${sentence}\n\n${body}`);

  // The skill it is told to use is in the repository, under that name, and this step has every tool, so `Skill` loads it.
  assert.ok(fs.existsSync(path.join(REPO, '.claude', 'skills', 'look', 'SKILL.md')));
  assert.equal(loadWorkflows(FOLDER)[0]!.tools, undefined, 'the harness\'s own set: it reads the store, git, the registry and the browser');
});

// ─── a step that never ends ─────────────────────────────────────────────────

test('a step answered five times over keeps working: each answer a try of the same session, told what was said, with nothing capping the count', async () => {
  const repo = aRepo();
  const { e, tasks, filings, settle } = board();
  const run = start({ brief: 'supervise this repository', repo, workflowDir: FOLDER });

  await advance(e, readRun(run.id));
  assert.deepEqual(filings, [`${run.id}-supervise`], 'filed once, in the repository\'s own checkout');
  assert.equal(tasks.get(`${run.id}-supervise`)!.spec.cwd, repo);
  assert.equal(tasks.get(`${run.id}-supervise`)!.spec.remoteControl, true, 'bridged, as `remote: true` says');

  for (let n = 1; n <= 5; n++) {
    const taskId = n === 1 ? `${run.id}-supervise` : `${run.id}-supervise-try${n}`;
    settle(taskId, 'succeeded', { outcome: 'blocked', summary: `round ${n}: a run is ready to decide`, artifacts: [], needs: `Merge r-${n}, or hold it?` });
    // The pass that reads the question files nothing: it waits on a person, as `wf ls` says.
    const quiet = await advance(e, readRun(run.id));
    assert.deepEqual([quiet.filed, quiet.tried], [[], []], `answer ${n}: nothing is filed until a person answers`);
    assert.deepEqual((await list(e, readRun(run.id))).waitingOnYou, ['supervise'], `answer ${n}: it waits on you`);

    await retry(e, run.id, 'supervise', { mode: 'nudge', message: `yes, merge r-${n}` });
    const filed = await advance(e, readRun(run.id));
    const next = `${run.id}-supervise-try${n + 1}`;
    assert.deepEqual(filed.tried, ['supervise'], `answer ${n} files try ${n + 1}`);
    assert.ok(tasks.has(next), `try ${n + 1} is on the board: ${filings.join(', ')}`);
    assert.match(tasks.get(next)!.spec.brief, new RegExp(`## Your answer[\\s\\S]*yes, merge r-${n}`), `try ${n + 1} is told answer ${n}`);
    assert.equal(tasks.get(next)!.spec.resumeFrom, `native-${taskId}`, `try ${n + 1} continues try ${n}'s session`);
  }
  assert.equal(readRun(run.id).steps.supervise?.tries?.length, 5, 'five tries behind the one it is on, and the sixth running');
  assert.equal(filings.length, 6);
});

// ─── and one the cap on runs in flight does not hold ────────────────────────

test('`slot: none` on disk: the supervisor\'s run files its step at a full cap, counts against nothing, and holds no other run — while the run beside it waits', async () => {
  const repo = aRepo();
  const { e, filings, settle } = board();
  const watcher = start({ brief: 'supervise this repository', repo, workflowDir: FOLDER });
  const work = start({ brief: 'do the work', repo, workflowDir: folderOf({ implement: 'harness: claude' }), isolate: false });

  // One slot, and it is taken: the work run with nothing filed is held, and the supervisor is not.
  const full = { inFlight: 1, cap: 1 };
  const held = await advance(e, readRun(work.id), full);
  assert.deepEqual([held.filed, held.held], [[], full], 'the work waits for a run slot');
  const watching = await advance(e, readRun(watcher.id), full);
  assert.deepEqual(watching.filed, ['supervise'], 'the supervisor files its step all the same');
  assert.equal(watching.held, undefined, 'and is not held');
  assert.equal(watching.inFlight, false, 'nor counted: what it filed is its own watching, not a run\'s work');

  // And it holds nobody: with the supervisor running, one slot is still free for the work.
  process.env.WF_MAX_RUNS = '1';
  assert.deepEqual([...await runSlots(e, [readRun(watcher.id), readRun(work.id)])], [], 'nothing held');
  const free = await advance(e, readRun(work.id), { inFlight: 0, cap: 1 });
  assert.deepEqual(free.filed, ['implement'], 'the work takes the slot the supervisor never held');
  assert.equal(free.inFlight, true);

  // Its own filing is not counted even while its session runs, pass after pass.
  settle(`${watcher.id}-supervise`, 'succeeded', { outcome: 'blocked', summary: 'a run is ready', artifacts: [], needs: 'Merge it?' });
  for (let pass = 0; pass < 2; pass++) assert.equal((await advance(e, readRun(watcher.id), { inFlight: 1, cap: 1 })).inFlight, false, `pass ${pass}`);
  assert.deepEqual([...await runSlots(e, [readRun(watcher.id), readRun(work.id)])], []);
  delete process.env.WF_MAX_RUNS;
  assert.ok(filings.includes(`${watcher.id}-supervise`) && filings.includes(`${work.id}-implement`));
});

test('REFUSED at `wf start`, with nothing written: `slot: none` on a step of a workflow that has another — a slot is a run\'s, and the work beside it would run outside the cap', () => {
  const repo = aRepo();
  const runs = () => fs.readdirSync(path.join(ROOT, 'runs')).filter((f) => f.endsWith('.json')).length;
  const before = runs();
  for (const steps of [
    { supervise: 'slot: none', implement: 'harness: claude' },
    { implement: 'harness: claude', supervise: 'after: implement\nslot: none' },
    { supervise: 'slot: none', review: 'after: supervise' },
  ]) {
    assert.throws(
      () => start({ brief: 'watch it', repo, workflowDir: folderOf(steps) }),
      (err: Error & { exitCode?: number }) => err.exitCode === 2 && /^supervise: `slot: none` takes this step's whole RUN out of the cap on runs in flight \(WF_MAX_RUNS\), and this workflow has \w+ beside it — a slot is a run's, not a step's/.test(err.message),
      Object.keys(steps).join(' + '),
    );
  }
  assert.equal(runs(), before, 'nothing written');
  // The shipped folder is the shape that is allowed: one step, and it starts.
  assert.ok(start({ brief: 'watch it', repo, workflowDir: FOLDER }).id);
});

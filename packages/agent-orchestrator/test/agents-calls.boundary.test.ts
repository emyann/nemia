/**
 * What a pass asks Claude Code, at shipped defaults: the client's `engine(ENV)` and `tick()`, over a run started from a workflow
 * folder, so `advance` reads every step in flight as the daemon does. A fake `claude` first on PATH counts each `claude agents` call, and a
 * job, on the same fake named its Claude Code (`gatedJob`), runs until the test stops it.
 *
 * A `claude agents` call costs about 0.2-0.4 s, and every Claude Code session is a job, read off its run file: a pass asks it nothing, and
 * `advance` reads the views the runtime's pass reported (`reportedEngine`) rather than viewing each step in flight, which would observe
 * again.
 *
 * The test's store is its own, at `ROOT`, given as `ENV` with the shipped ceilings and every run the memo answers judged in full;
 * `CLAUDE_CONFIG_DIR`
, where Claude Code keeps its sessions and transcripts, is a folder of the test's.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { scratch } from 'test-kit/scratch';
import { until, WAITED, type Waiter } from 'agent-runtime/testing';
import { Effect } from 'effect';
import { runGiven, runOver } from './placed.ts';
import { engine, startRun, tickRun, runWith as runEngine, gitPlaceLayer } from '../src/runner.ts';
import { runRecord } from '../src/record/record.store.ts';
import { freshRestMemo } from '../src/tick/tick.verb.ts';
import type { Env } from '../src/config/config.store.ts';
import { gatedJob } from './gated-job.ts';

const ROOT = scratch('wf-agents-calls-');
process.env.CLAUDE_CONFIG_DIR = scratch('wf-agents-calls-config-');
const ENV: Env = { ...process.env, WF_ROOT: ROOT, WF_VERIFY_REST: '1', WF_MAX_CONCURRENT: undefined, WF_MAX_RUNS: undefined };
const runWith = runOver(runEngine, gitPlaceLayer, ENV);
const runPlaced = runGiven(gitPlaceLayer, ENV);

const git = (repo: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

const REPO = scratch('wf-agents-calls-repo-');
git(REPO, 'init', '-q');
git(REPO, 'commit', '-q', '--allow-empty', '-m', 'base');

/** A workflow folder of one claude step, with the keys given. */
const folder = (keys = '') => {
  const dir = scratch('wf-agents-calls-folder-');
  fs.writeFileSync(path.join(dir, 'work.md'), `---\nplace: git\nharness: claude\n${keys}---\nwork it\n`);
  return dir;
};

/**
 * The fake `claude` first on PATH, named the jobs' own Claude Code too (`gatedJob`), and the count of its `claude agents` calls. A job
 * holds until the test stops it: its gate, named by its brief, is never opened.
 */
const fakes = () => {
  const bin = scratch('wf-agents-calls-bin-');
  const counter = path.join(bin, 'agents-calls');
  fs.writeFileSync(counter, '');
  const head = `if (args[0] === 'agents') {
  fs.appendFileSync(${JSON.stringify(counter)}, 'agents\\n');
  process.stdout.write('[]');
  process.exit(0);
}`;
  gatedJob(bin, scratch('wf-agents-calls-gates-'), head);
  process.env.PATH = `${bin}:${process.env.PATH}`;
  return { agentsCalls: () => fs.readFileSync(counter, 'utf8').split('\n').filter(Boolean).length };
};

const fake = fakes();
let e = engine(ENV);
let memo = freshRestMemo();
const pass = () => runWith(e, tickRun({ repo: ROOT, memo }));

/** The task a run's one step is filed as. */
const taskOf = (runId: string) => runRecord(ROOT, runId).steps.work.taskId!;

/** Passes in test `t`, every 50ms, until the run's step is at work, as its harness lists it; answers its task. */
const atWork = (t: Waiter, runId: string) =>
  until(
    t,
    async () => {
      await pass();
      const taskId = runRecord(ROOT, runId).steps.work?.taskId;
      if (!taskId) return undefined;
      return (await Effect.runPromise(e.view(taskId))).phase === 'working' && taskId;
    },
    `${runId}'s step at work`,
    { everyMs: 50 },
  );

/** One pass, and the `claude agents` calls it made. */
const counted = async () => {
  const before = fake.agentsCalls();
  const done = await pass();
  return { calls: fake.agentsCalls() - before, done };
};

const jobRun = await runPlaced(startRun({ brief: 'a job', repo: REPO, workflowDir: folder() }));

/** What the pass judged of a run. */
const advanced = (done: Awaited<ReturnType<typeof pass>>, runId: string) => done.runs.find((r) => r.run.id === runId);

test('a pass with claude jobs in flight asks `claude agents` nothing, and advance still reads the step', WAITED, async (t) => {
  await atWork(t, jobRun.id);
  const { calls, done } = await counted();
  assert.equal(calls, 0, 'no `claude agents` for a pass whose claude sessions are all jobs');
  assert.deepEqual(
    [advanced(done, jobRun.id)?.status, advanced(done, jobRun.id)?.inFlight],
    ['running', true],
    'and the job run is in flight, its step read',
  );
  assert.equal(done.cost?.harnesses.claude?.calls, 1, 'claude observed once, its jobs off their run files');
  assert.equal(done.cost?.harnesses.claude?.spawned, 0, 'the meter says the same: no process to observe claude');
});

test('a job left running across a restart is read at work on the first pass of a fresh engine, off its run file', async () => {
  e = engine(ENV);
  memo = freshRestMemo();
  const { calls, done } = await counted();
  assert.equal(calls, 0, 'a fresh engine asks Claude Code nothing either');
  assert.equal((await Effect.runPromise(e.view(taskOf(jobRun.id)))).phase, 'working', 'at work — not lost');
  assert.equal(advanced(done, jobRun.id)?.status, 'running');
});

test('the board drains', WAITED, async (t) => {
  await Effect.runPromise(e.stop(taskOf(jobRun.id)));
  await until(
    t,
    async () => {
      if ((await Effect.runPromise(e.list())).views.every((v) => v.state.settled)) return true;
      await Effect.runPromise(e.tick());
      return false;
    },
    'every task settled',
    { everyMs: 50 },
  );
});

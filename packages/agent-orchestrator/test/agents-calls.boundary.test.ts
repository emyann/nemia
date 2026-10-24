/**
 * What a pass asks Claude Code, at shipped defaults: the client's `engine()` and `tick()`, over a run started from a workflow folder, so
 * `advance` reads every step in flight as the daemon does. A fake `claude` first on PATH counts each `claude agents` call, and a job reads
 * its brief and runs until the test ends it.
 *
 * A `claude agents` call costs about 0.2-0.4 s, and every Claude Code session is a job, read off its run file: a pass asks it nothing, and
 * `advance` reads the views the runtime's pass reported (`reportedEngine`) rather than viewing each step in flight, which would observe
 * again.
 *
 * `WF_ROOT` is set before the import, since the module reads it as it loads, with the shipped ceilings and every run the memo answers
 * judged in full; `CLAUDE_CONFIG_DIR`, where Claude Code keeps its sessions and transcripts, is a folder of the test's.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { scratch } from './scratch.ts';
import { until, WAITED, type Waiter } from 'agent-runtime/testing';
import { Effect } from 'effect';
import { runGiven, runOver } from './placed.ts';

const ROOT = scratch('wf-agents-calls-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
process.env.CLAUDE_CONFIG_DIR = scratch('wf-agents-calls-config-');
const { engine, startRun, tickRun, runWith: runEngine, gitPlaceLayer } = await import('../src/runner.ts');
const runWith = runOver(runEngine, gitPlaceLayer);
const runPlaced = runGiven(gitPlaceLayer);
const { readRun } = await import('../src/record/record.store.ts');
const { freshRestMemo } = await import('../src/tick/tick.verb.ts');

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

/** The fake `claude`, and the count of `claude agents` calls. */
const fakes = () => {
  const bin = scratch('wf-agents-calls-bin-');
  const counter = path.join(bin, 'agents-calls');
  const ended = path.join(bin, 'ended');
  fs.writeFileSync(counter, '');
  fs.writeFileSync(
    path.join(bin, 'claude'),
    `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] === 'agents') {
  fs.appendFileSync(${JSON.stringify(counter)}, 'agents\\n');
  process.stdout.write('[]');
} else {
  // A job: reads its brief, the first line on its stdin, and runs until the test is over.
  process.stdin.once('data', () => process.stdin.pause());
  const wait = () => (fs.existsSync(${JSON.stringify(ended)}) ? process.exit(0) : setTimeout(wait, 50));
  wait();
}
`,
    { mode: 0o755 },
  );
  process.env.PATH = `${bin}:${process.env.PATH}`;
  return {
    agentsCalls: () => fs.readFileSync(counter, 'utf8').split('\n').filter(Boolean).length,
    end: () => fs.writeFileSync(ended, ''),
  };
};

const fake = fakes();
let e = engine();
let memo = freshRestMemo();
const pass = () => runWith(e, tickRun({ repo: ROOT, memo }));

/** The task a run's one step is filed as. */
const taskOf = (runId: string) => readRun(runId).steps.work.taskId!;

/** Passes in test `t`, every 50ms, until the run's step is at work, as its harness lists it; answers its task. */
const atWork = (t: Waiter, runId: string) =>
  until(
    t,
    async () => {
      await pass();
      const taskId = readRun(runId).steps.work?.taskId;
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
  e = engine();
  memo = freshRestMemo();
  const { calls, done } = await counted();
  assert.equal(calls, 0, 'a fresh engine asks Claude Code nothing either');
  assert.equal((await Effect.runPromise(e.view(taskOf(jobRun.id)))).phase, 'working', 'at work — not lost');
  assert.equal(advanced(done, jobRun.id)?.status, 'running');
});

test('the board drains', WAITED, async (t) => {
  fake.end();
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

/**
 * What a pass asks Claude Code's registry, at shipped defaults: the client's `engine()` and `tick()`, over runs started from a workflow
 * folder, so `advance` reads every step in flight as the daemon does. A fake `claude` first on PATH counts each `claude agents` call: a job
 * (`-p`) reads its brief and runs until the test ends it, and a background session (`--bg`) is written into the registry `agents` prints,
 * working and busy, as Claude Code's registry lists one.
 *
 * A `claude agents` call costs about 0.2-0.4 s. A pass asks it only for a session expected that is no job, once, and `advance` reads the
 * views the runtime's pass reported (`reportedEngine`) rather than viewing each step in flight, which would observe again.
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
  const registry = path.join(bin, 'registry.json');
  const counter = path.join(bin, 'agents-calls');
  const ended = path.join(bin, 'ended');
  fs.writeFileSync(registry, '[]');
  fs.writeFileSync(counter, '');
  fs.writeFileSync(
    path.join(bin, 'claude'),
    `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const rows = () => JSON.parse(fs.readFileSync(${JSON.stringify(registry)}, 'utf8'));
const write = (r) => fs.writeFileSync(${JSON.stringify(registry)}, JSON.stringify(r));
if (args[0] === 'agents') {
  fs.appendFileSync(${JSON.stringify(counter)}, 'agents\\n');
  process.stdout.write(fs.readFileSync(${JSON.stringify(registry)}, 'utf8'));
} else if (args[0] === 'stop') {
  write(rows().map((r) => (r.sessionId.startsWith(args[1]) ? { ...r, state: 'stopped', status: 'idle' } : r)));
} else if (args[0] === 'rm') {
  write(rows().filter((r) => !r.sessionId.startsWith(args[1])));
} else if (args[0] === '--bg') {
  const name = args[args.indexOf('--name') + 1];
  const n = rows().length + 1;
  const sessionId = '5e551011-0000-4000-8000-' + String(n).padStart(12, '0');
  write([...rows(), { name, sessionId, state: 'working', status: 'busy', kind: 'background', startedAt: Date.now() }]);
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
let bgRun: Effect.Success<ReturnType<typeof startRun>>;

/** What the pass judged of a run. */
const advanced = (done: Awaited<ReturnType<typeof pass>>, runId: string) => done.runs.find((r) => r.run.id === runId);

test(
  'a pass with claude jobs in flight and no background session asks `claude agents` nothing, and advance still reads the step',
  WAITED,
  async (t) => {
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
  },
);

test(
  'a pass with one background session in flight asks `claude agents` once, beside a job — advance adds no observe of its own',
  WAITED,
  async (t) => {
    bgRun = await runPlaced(startRun({ brief: 'a background session', repo: REPO, workflowDir: folder('background: true\n') }));
    const bg = await atWork(t, bgRun.id);
    const { calls, done } = await counted();
    assert.equal(calls, 1, "one `claude agents` for the runtime's observe, and none for the step advance reads");
    for (const run of [jobRun, bgRun])
      assert.deepEqual(
        [advanced(done, run.id)?.status, advanced(done, run.id)?.inFlight],
        ['running', true],
        'both runs in flight, each step read',
      );
    assert.equal(done.cost?.harnesses.claude?.spawned, 1);
    assert.equal((await Effect.runPromise(e.view(bg))).phase, 'working');
  },
);

test('a background session left running across a restart is observed on the first pass of a fresh engine, and read at work', async () => {
  const bg = taskOf(bgRun.id);
  e = engine();
  memo = freshRestMemo();
  const { calls, done } = await counted();
  assert.equal(calls, 1, 'a fresh engine remembers no session it spawned: the journal names the session, and the registry is asked for it');
  assert.equal((await Effect.runPromise(e.view(bg))).phase, 'working', 'at work, as the registry lists it — not lost');
  assert.equal(advanced(done, bgRun.id)?.status, 'running');
  assert.equal((await Effect.runPromise(e.view(taskOf(jobRun.id)))).phase, 'working', 'and the job, off its run file');
});

test('the board drains', WAITED, async (t) => {
  fake.end();
  for (const id of [taskOf(jobRun.id), taskOf(bgRun.id)]) await Effect.runPromise(e.stop(id));
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

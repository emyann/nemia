/**
 * `nemia retry` over an ask `nemia pause --now` wrote for the same try: a void one (its session failed on its own) is refused, left where
 * the tick alone moves it by its name, and once a pass set it aside into `done/` the retry is written; one still due (its session stopped)
 * is refused, and left as it is. `WF_ROOT` is set before the runner is imported, which reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { board as engineBoard } from './engine-board.ts';
import { scratch } from './scratch.ts';
import { runGiven, runOver } from './placed.ts';

const ROOT = scratch('wf-pause-retry-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
process.env.WF_ROOT = ROOT;
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const { advanceRun, retryRun, startRun, runWith: runEngine, gitPlaceLayer } = await import('../src/runner.ts');
const runWith = runOver(runEngine, gitPlaceLayer);
const runPlaced = runGiven(gitPlaceLayer);
const { askFile, asksDir, readRun } = await import('../src/record/record.store.ts');
const { engineOf } = await import('../src/runtime-client.ts');

/** A repository with one commit, so `nemia start` has a base to record. */
function aRepo(): string {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo, stdio: 'ignore' });
  git('init', '-q');
  git('commit', '-q', '--allow-empty', '-m', 'base');
  return repo;
}

/** A run of one step `implement`, filed and settled `phase`, with the ask a pause at once wrote for its next try on disk. */
async function pausedThen(phase: 'failed' | 'stopped') {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  const run = await runPlaced(startRun({ brief: 'the pause', repo: aRepo(), workflowDir: dir, isolate: false }));
  const b = engineBoard();
  const e = engineOf(b.layer);
  await runWith(e, advanceRun(readRun(run.id)));
  const taskId = `${run.id}-implement`;
  b.settle(taskId, phase);
  const pauseAsk = { step: 'implement', try: 2, mode: 'nudge', interrupted: taskId, at: '2026-10-04T12:00:00.000Z' };
  fs.mkdirSync(asksDir(run.id), { recursive: true });
  fs.writeFileSync(askFile(run.id, 'implement', 2), JSON.stringify(pauseAsk));
  return { e, id: run.id, pauseAsk };
}

test('REFUSED: a retry over a void pause ask of its try, which the verb leaves for the tick; once a pass set it aside, the retry is written', async () => {
  const { e, id, pauseAsk } = await pausedThen('failed');
  await assert.rejects(runWith(e, retryRun(id, 'implement', { mode: 'fresh', message: 'start over' })), (err: Error) => {
    assert.match(err.message, /^try 2 of implement is held by the ask nemia pause --now wrote .* the next pass sets it aside/);
    return true;
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(askFile(id, 'implement', 2), 'utf8')), pauseAsk);
  assert.equal(fs.existsSync(path.join(asksDir(id), 'done')), false, 'the verb moves no file the tick reads');
  await runWith(e, advanceRun(readRun(id)));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(asksDir(id), 'done', 'retry-implement-2'), 'utf8')), pauseAsk);
  const { ask } = await runWith(e, retryRun(id, 'implement', { mode: 'fresh', message: 'start over' }));
  assert.deepEqual(JSON.parse(fs.readFileSync(askFile(id, 'implement', 2), 'utf8')), ask);
});

test('REFUSED: a retry over a pause ask still due, its session stopped, and that ask left as it is', async () => {
  const { e, id, pauseAsk } = await pausedThen('stopped');
  await assert.rejects(runWith(e, retryRun(id, 'implement', { mode: 'fresh' })), (err: Error) => {
    assert.match(err.message, /^try 2 of implement is asked by nemia pause --now/);
    return true;
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(askFile(id, 'implement', 2), 'utf8')), pauseAsk);
  assert.equal(fs.existsSync(path.join(asksDir(id), 'done')), false);
});

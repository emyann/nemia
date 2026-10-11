/**
 * `nemia retry` asks the runtime of the config the try would be filed with, on the model it runs on and with its cap (`tryRefused`), and
 * refuses one it refuses before the ask is written, in its words after the flag the retry typed. The CLI refuses an empty `--model`
 * itself; the board's `POST …/retry` hands the verb what it was sent, so the verb is called here as it does. `WF_ROOT` is set before
 * the runner is imported, which reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { testEngine } from 'agent-runtime/testing';
import { scratch } from './scratch.ts';
import { runGiven, runOver } from './placed.ts';

const ROOT = scratch('wf-retry-config-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
process.env.WF_ROOT = ROOT;
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const { advanceRun, retryRun, startRun, runWith: runEngine, gitPlaceLayer } = await import('../src/runner.ts');
const runWith = runOver(runEngine, gitPlaceLayer);
const runPlaced = runGiven(gitPlaceLayer);
const { readRun } = await import('../src/record/record.store.ts');
const { runStore } = await import('../src/record/files.store.ts');
const { configRefusal, engineOf } = await import('../src/runtime-client.ts');

/** A repository with one commit, so `nemia start` has a base to record. */
function aRepo(): string {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo, stdio: 'ignore' });
  git('init', '-q');
  git('commit', '-q', '--allow-empty', '-m', 'base');
  return repo;
}

/** A run of one step `implement`, on Claude Code at the model `opus`, filed and failed: a try of it is the person's to ask for. */
async function failed() {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\nmodel: opus\n---\nimplement it\n');
  const run = await runPlaced(startRun({ brief: 'the flag', repo: aRepo(), workflowDir: dir, isolate: false }));
  const b = testEngine();
  const e = engineOf(b.layer);
  await runWith(e, advanceRun(readRun(run.id)));
  b.settle(`${run.id}-implement`, 'failed');
  return { e, id: run.id };
}

test('REFUSED: a fresh try on a model its harness refuses, named by the flag as typed, and no ask written', async () => {
  const { e, id } = await failed();
  await assert.rejects(runWith(e, retryRun(id, 'implement', { mode: 'fresh', model: '' })), (err: Error & { exitCode?: number }) => {
    assert.equal(err.exitCode, 2);
    assert.equal(err.message, `implement: \`--model ''\` (filed as \`model\`): ${configRefusal('claude', { model: '' })}`);
    return true;
  });
  assert.deepEqual(runStore.asks.read(id).asks, [], 'nothing written');
});

test('a fresh try on a model its harness takes is asked for', async () => {
  const { e, id } = await failed();
  const { ask } = await runWith(e, retryRun(id, 'implement', { mode: 'fresh', model: 'sonnet' }));
  assert.deepEqual([ask.try, ask.mode, ask.model], [2, 'fresh', 'sonnet']);
});

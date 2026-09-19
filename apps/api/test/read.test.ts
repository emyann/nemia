/**
 * What a session read, by price, as the board reads it on a step's `used`: the cache's reads and writes and the peak context in `wf decide`'s
 * words (`read`), the peak against the step's `context:` cap (`peak`), and the resumed sessions that rebuilt their cache (`rebuilt`) — and
 * nothing where the runner measured none of it.
 *
 * At shipped defaults: the api's own engine over a store this file seeds, the harness's fake `claude` first on PATH (test/harness.ts).
 */
import './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// agent-workflows locates its store as its module loads: set first.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-api-read-'));
process.env.WF_ROOT = root;

const { app } = await import('../src/app.ts');

const T0 = Date.parse('2026-09-19T06:00:00.000Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const done = { outcome: 'done', summary: 'Done.', needs: null, artifacts: [] };

/** A step's task whose attempts each ended with the usage given; an attempt after the first continued the session before it. */
const task = (taskId: string, harness: string, usages: object[]) => write(path.join(root, 'engine', 'tasks', `${taskId}.jsonl`), [
  { kind: 'filed', at: at(0), brief: 'Do it.', cwd: '/code/app', maxAttempts: usages.length, harness },
  ...usages.flatMap((usage, i) => {
    const n = i + 1;
    const last = n === usages.length;
    return [
      { kind: 'starting', at: at(n * 100), attempt: n, ...(n > 1 ? { resumeFrom: `ae/${taskId}/${n - 1}` } : {}) },
      { kind: 'spawned', at: at(n * 100 + 1), attempt: n },
      { kind: 'ended', at: at(n * 100 + 60), attempt: n, sessionId: `ae/${taskId}/${n}`, observed: last ? 'done' : 'failed', reason: 'harness', ...(last ? { closeout: done } : {}), usage },
    ];
  }),
  { kind: 'settled', at: at(usages.length * 100 + 60), outcome: 'succeeded' },
].map((e) => `${JSON.stringify(e)}\n`).join(''));

/**
 * `implement` runs under `context: 200k`: a cold attempt peaked at 150k, and its resumed one wrote its whole context to the cache again and
 * reached the cap. `review` has no cap and peaked past 200k. `plan` ran on a runner that counted its input as one number.
 */
const USAGE = {
  cold: { turns: 30, inputTokens: 4_150_000, cacheReadTokens: 4_000_000, cacheWriteTokens: 149_990, uncachedTokens: 10, peakContextTokens: 150_000, outputTokens: 30_000, costUsd: 3 },
  rebuilt: { turns: 4, inputTokens: 605_000, cacheReadTokens: 400_000, cacheWriteTokens: 204_990, uncachedTokens: 10, peakContextTokens: 204_000, outputTokens: 2_000, costUsd: 2.3 },
  review: { turns: 20, inputTokens: 3_000_000, cacheReadTokens: 2_900_000, cacheWriteTokens: 99_995, uncachedTokens: 5, peakContextTokens: 250_000, outputTokens: 9_000, costUsd: 1.5 },
  plan: { toolCalls: 6, inputTokens: 50_000, outputTokens: 2_000 },
};
const R = 'r-read';
write(path.join(root, 'runs', `${R}.json`), JSON.stringify({
  id: R, repo: '/code/app', workspace: '/code/app', baseRef: 'abc123', branch: 'main', isolate: true, brief: 'What it read',
  workflowDir: path.join(root, 'no-such-workflow'), createdAt: at(0),
  workflow: [
    { name: 'implement', after: [], body: 'Implement it.', harness: 'claude', context: 200_000, maxAttempts: 2 },
    { name: 'review', after: ['implement'], body: 'Review it.', harness: 'claude' },
    { name: 'plan', after: [], body: 'Plan it.', harness: 'codex' },
  ],
  steps: { implement: { taskId: 't-implement' }, review: { taskId: 't-review' }, plan: { taskId: 't-plan' } },
}));
task('t-implement', 'claude', [USAGE.cold, USAGE.rebuilt]);
task('t-review', 'claude', [USAGE.review]);
task('t-plan', 'codex', [USAGE.plan]);

type Used = { cost: string; read: string | null; peak: string | null; rebuilt: number };
type Step = { name: string; used: Used | null; timeline: Array<{ used: Used | null }> };
const stepOf = async (name: string): Promise<Step> => (await (await app.request(`/api/runs/${R}`)).json()).steps.find((s: Step) => s.name === name);

test("a step's reads: its classes summed over its attempts, its peak at its `context:` cap, and the resumed session that rebuilt its cache", async () => {
  const implement = await stepOf('implement');
  const { cost, read, peak, rebuilt } = implement.used!;
  // The cost alone, as it was: what the sessions read is beside it, not in it.
  assert.equal(cost, '$5.30');
  assert.equal(read, 'read 4.4M · wrote 355k · peak 204k, at its 200k cap · resumed, it wrote its context to the cache again instead of reading it');
  assert.equal(peak, 'cap');
  assert.equal(rebuilt, 1);
});

test('a peak past 200k on a step with no cap is marked, and a cold session that wrote its cache once is not a rebuild', async () => {
  const review = await stepOf('review');
  assert.deepEqual([review.used!.read, review.used!.peak, review.used!.rebuilt], ['read 2.9M · wrote 100k · peak 250k, past 200k with no cap', 'large', 0]);
});

test('a runner that counted the input as one number says nothing of what it read: null, never 0', async () => {
  const plan = await stepOf('plan');
  assert.deepEqual([plan.used!.read, plan.used!.peak, plan.used!.rebuilt], [null, null, 0]);
  assert.deepEqual(plan.timeline.map((t) => t.used?.read), [null]);
});

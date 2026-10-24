/**
 * What a session read, by price, as the board reads it on a step's `used`: the cache's reads and writes and the peak context in
 * `nemia decide`'s words (`read`), the peak against the step's `context:` cap (`peak`), and the resumed sessions that rebuilt their cache
 * (`rebuilt`) — and nothing where the runner measured none of it.
 *
 * On the stand-ins: the runtime's test engine, each task filed and moved by hand (`engine().settle`), and the test place, under
 * the run records this file seeds. One story, so its checkpoints read one engine, one app and the runs it seeded in turn.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import { story } from '../../test/checkpoints.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { RunDetail } from './detail.ts';
import { Effect } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { appOver, beforeEachTest, eachTest, engineFor } from '../../test/placed.ts';

const stand = eachTest(testPlace);
const standIn = eachTest(testEngine);
const engine = () => engineFor(standIn());
const app = eachTest(() => appOver(standIn(), stand()));

const T0 = Date.parse('2026-09-19T06:00:00.000Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const done = { outcome: 'done', summary: 'Done.', needs: null, artifacts: [] };

/** A step's task whose attempts each ended with the usage given; an attempt after the first continued the session before it. */
const task = (taskId: string, harness: string, usages: object[]) => {
  Effect.runSync(engine().file({ id: taskId, brief: 'Do it.', cwd: '/code/app', harness }));
  usages.forEach((usage, i) => {
    const n = i + 1;
    const last = n === usages.length;
    if (n > 1) standIn().restart(taskId);
    standIn().settle(taskId, last ? 'succeeded' : 'failed', {
      exitCode: last ? 0 : 1,
      usage,
      ...(n > 1 ? { resumeFrom: `ae/${taskId}/${n - 1}` } : {}),
      ...(last ? { closeout: done } : {}),
    });
  });
};

/**
 * `implement` runs under `context: 200k`: a cold attempt peaked at 150k, and its resumed one wrote its whole context to the cache again and
 * reached the cap. `review` has no cap and peaked past 200k. `plan` ran on a runner that counted its input as one number.
 */
const USAGE = {
  cold: {
    responses: 30,
    inputTokens: 4_150_000,
    cacheReadTokens: 4_000_000,
    cacheWriteTokens: 149_990,
    uncachedTokens: 10,
    peakContextTokens: 150_000,
    firstContextTokens: 21_000,
    firstCacheWriteTokens: 21_000,
    outputTokens: 30_000,
    costUsd: 3,
  },
  rebuilt: {
    responses: 4,
    inputTokens: 605_000,
    cacheReadTokens: 400_000,
    cacheWriteTokens: 204_990,
    uncachedTokens: 10,
    peakContextTokens: 204_000,
    firstContextTokens: 150_010,
    firstCacheWriteTokens: 150_000,
    outputTokens: 2_000,
    costUsd: 2.3,
  },
  review: {
    responses: 20,
    inputTokens: 3_000_000,
    cacheReadTokens: 2_900_000,
    cacheWriteTokens: 99_995,
    uncachedTokens: 5,
    peakContextTokens: 250_000,
    firstContextTokens: 21_000,
    firstCacheWriteTokens: 21_000,
    outputTokens: 9_000,
    costUsd: 1.5,
  },
  plan: { toolCalls: 6, inputTokens: 50_000, outputTokens: 2_000 },
};
const R = 'r-read';
write(
  path.join(root, 'runs', `${R}.json`),
  JSON.stringify({
    id: R,
    repo: '/code/app',
    workspace: '/code/app',
    baseRef: 'abc123',
    branch: 'main',
    isolate: true,
    brief: 'What it read',
    workflowDir: path.join(root, 'no-such-workflow'),
    createdAt: at(0),
    workflow: [
      { name: 'implement', after: [], body: 'Implement it.', harness: 'claude', context: 200_000, maxAttempts: 2 },
      { name: 'review', after: ['implement'], body: 'Review it.', harness: 'claude' },
      { name: 'plan', after: [], body: 'Plan it.', harness: 'codex' },
    ],
    steps: { implement: { taskId: 't-implement' }, review: { taskId: 't-review' }, plan: { taskId: 't-plan' } },
  }),
);
beforeEachTest(() => {
  task('t-implement', 'claude', [USAGE.cold, USAGE.rebuilt]);
  task('t-review', 'claude', [USAGE.review]);
  task('t-plan', 'codex', [USAGE.plan]);
});

const detailOf = async (id: string) => (await (await app().request(`/api/runs/${id}`)).json()) as RunDetail;
const stepOf = async (name: string) => {
  const step = (await detailOf(R)).steps.find((s) => s.name === name);
  assert.ok(step, name);
  return step;
};

test("a run's page says what its sessions read: each step's classes, peak and rebuilt caches, and the run's own beside its cost", async (t) => {
  const s = story(t);
  await s.test(
    "a step's reads: its classes summed over its attempts, its peak at its `context:` cap, and the resumed session that rebuilt its cache",
    async () => {
      const implement = await stepOf('implement');
      const { cost, read, peak, rebuilt } = implement.used!;
      assert.equal(cost, '$5.30', 'the cost alone: what the sessions read is beside it, not in it');
      assert.equal(
        read,
        'read 4.4M · wrote 355k · peak 204k, at its 200k cap · a resumed session wrote its context to the cache again instead of reading it',
      );
      assert.equal(peak, 'cap');
      assert.equal(rebuilt, 1);
    },
  );
  await s.test(
    'a peak past 200k on a step with no cap is marked, and a cold session that wrote its cache once is not a rebuild',
    async () => {
      const review = await stepOf('review');
      assert.deepEqual(
        [review.used!.read, review.used!.peak, review.used!.rebuilt],
        ['read 2.9M · wrote 100k · peak 250k, past 200k with no cap', 'large', 0],
      );
    },
  );
  await s.test('a runner that counted the input as one number says nothing of what it read: null, never 0', async () => {
    const plan = await stepOf('plan');
    assert.deepEqual([plan.used!.read, plan.used!.peak, plan.used!.rebuilt], [null, null, 0]);
    assert.deepEqual(
      plan.timeline.map((t) => t.used?.read),
      [null],
    );
  });
  await s.test(
    "the run's reads are every try's of every step, beside its cost — no class or peak where one session measured none of them",
    async () => {
      const run = await detailOf(R);
      assert.deepEqual(
        run.read,
        {
          said: 'a resumed session wrote its context to the cache again instead of reading it',
          peak: null,
          rebuilt: 1,
        },
        "`plan` counted its input as one number: a sum over the others would read as the whole run's; the rebuilt cache is still a fact",
      );

      const R2 = 'r-read-all';
      const record = JSON.parse(fs.readFileSync(path.join(root, 'runs', `${R}.json`), 'utf8'));
      write(
        path.join(root, 'runs', `${R2}.json`),
        JSON.stringify({
          ...record,
          id: R2,
          workflow: record.workflow.slice(0, 2),
          steps: { implement: { taskId: 't-implement' }, review: { taskId: 't-review' } },
        }),
      );
      const all = await detailOf(R2);
      assert.deepEqual(
        all.read,
        {
          said: 'read 7.3M · wrote 455k · peak 250k, past 200k with no cap · a resumed session wrote its context to the cache again instead of reading it',
          peak: 'large',
          rebuilt: 1,
        },
        "the largest peak is review's, which had no cap: the run's is marked as review's is, not as implement's 200k would mark it",
      );
    },
  );
  await s.test(
    "a session that compacted reached its cap, short of it in tokens — and the run's peak says so of its own step's compactions alone",
    async () => {
      const compacted = {
        responses: 60,
        inputTokens: 6_000_000,
        cacheReadTokens: 5_700_000,
        cacheWriteTokens: 299_990,
        uncachedTokens: 10,
        /** A session under `--autocompact 200000` compacts short of its cap, and the context at the compaction's boundary is its peak. */
        peakContextTokens: 173_584,
        compactions: 2,
        outputTokens: 20_000,
        costUsd: 4,
      };
      const RC = 'r-read-compacted';
      const run = (id: string, reviewPeak: number) => {
        write(
          path.join(root, 'runs', `${id}.json`),
          JSON.stringify({
            id,
            repo: '/code/app',
            workspace: '/code/app',
            baseRef: 'abc123',
            branch: 'main',
            isolate: true,
            brief: 'What it read',
            workflowDir: path.join(root, 'no-such-workflow'),
            createdAt: at(0),
            workflow: [
              { name: 'implement', after: [], body: 'Implement it.', harness: 'claude', context: 200_000 },
              { name: 'review', after: ['implement'], body: 'Review it.', harness: 'claude' },
            ],
            steps: { implement: { taskId: `${id}-implement` }, review: { taskId: `${id}-review` } },
          }),
        );
        task(`${id}-implement`, 'claude', [compacted]);
        task(`${id}-review`, 'claude', [{ ...USAGE.review, peakContextTokens: reviewPeak, compactions: 1 }]);
      };
      run(RC, 120_000);
      const detail = await detailOf(RC);
      const implement = detail.steps.find((s) => s.name === 'implement')?.used;
      assert.ok(implement);
      assert.deepEqual(
        [implement.read, implement.peak],
        ['read 5.7M · wrote 300k · peak 174k, compacted twice at its 200k cap', 'cap'],
        'its peak is short of its cap, and it reached it',
      );
      const review = detail.steps.find((s) => s.name === 'review')?.used;
      assert.ok(review);
      assert.deepEqual(
        [review.read, review.peak],
        ['read 2.9M · wrote 100k · peak 120k, compacted', null],
        "no cap to reach: on the harness's own window it compacted once, short of 200k",
      );
      assert.deepEqual(
        detail.read,
        { said: 'read 8.6M · wrote 400k · peak 174k, compacted twice at its 200k cap', peak: 'cap', rebuilt: 0 },
        "implement's two, not review's third",
      );

      const RL = 'r-read-compacted-larger';
      run(RL, 180_000);
      const larger = await detailOf(RL);
      assert.deepEqual(
        larger.read,
        { said: 'read 8.6M · wrote 400k · peak 180k, compacted', peak: null, rebuilt: 0 },
        "the peak is review's, which had no cap: implement's cap is not its",
      );
    },
  );
});

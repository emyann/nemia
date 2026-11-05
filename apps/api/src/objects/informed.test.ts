/**
 * One informer (src/objects): the run object served by the objects' handler reads the app's own informer, the one Hono's routes and the
 * store's daemon's pass fill, never one of its own. A run at rest read twice through it, the second time with its check off
 * (`unverified`), is kept by the first and answered from memory by the second: one hit, no second judgement.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Layer } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { Informer, informerMemo } from 'agent-orchestrator';
import { appOver, beforeEachTest, eachTest, engineFor } from '../../test/placed.ts';

const stand = eachTest(testPlace);
const standIn = eachTest(testEngine);
const engine = () => engineFor(standIn());
/** The informer of the app the test reads, its own: what a daemon's passes would fill. */
const informer = eachTest(() => informerMemo());
const app = eachTest(() => appOver(standIn(), stand(), Layer.succeed(Informer)(informer())));

const GATED = 'r-informed-gated';
const AT_WORK = 'r-informed-at-work';
/** A run's record of one step, `implement`, its task `t-<id>`, gated where asked. */
const record = (id: string, gates: string[] = []) => ({
  id,
  repo: '/code/app',
  workspace: '/code/app',
  baseRef: 'abc123',
  branch: 'main',
  isolate: true,
  brief: 'Inform it',
  workflowDir: path.join(root, 'no-such-workflow'),
  createdAt: '2026-11-02T06:00:00.000Z',
  workflow: [{ name: 'implement', after: [], body: 'Implement it.', harness: 'claude' }],
  gates,
  steps: { implement: { taskId: `t-${id}` } },
});
fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
fs.writeFileSync(path.join(root, 'runs', `${GATED}.json`), JSON.stringify(record(GATED, ['implement'])));
fs.writeFileSync(path.join(root, 'runs', `${AT_WORK}.json`), JSON.stringify(record(AT_WORK)));
beforeEachTest(() => {
  fs.rmSync(path.join(root, 'runs', `${GATED}.asks`), { recursive: true, force: true });
  Effect.runSync(engine().file({ id: `t-${GATED}`, brief: 'Do it.', cwd: '/code/app', harness: 'claude' }));
  standIn().settle(`t-${GATED}`, 'succeeded', {
    exitCode: 0,
    closeout: { outcome: 'done', summary: 'Built it.', needs: null, artifacts: [] },
  });
  Effect.runSync(engine().file({ id: `t-${AT_WORK}`, brief: 'Do it.', cwd: '/code/app', harness: 'claude' }));
  standIn().settle(`t-${AT_WORK}`, 'working');
});

/** `f` with the informer's check of each kept answer off, as a test that counts what is read turns it off for its request. */
async function unverified<T>(f: () => Promise<T>): Promise<T> {
  process.env.WF_VERIFY_REST = '0';
  try {
    return await f();
  } finally {
    process.env.WF_VERIFY_REST = '1';
  }
}

test("a run at rest read through the objects' handler is kept in the app's informer and answered from it: no second judgement", async () => {
  const first = await app().request(`/api/runs/${GATED}`);
  assert.equal(first.status, 200);
  assert.ok(informer().runs.has(GATED), "the handler kept the run in the app's informer");
  const hits = informer().hits;
  const again = await unverified(async () => app().request(`/api/runs/${GATED}`));
  assert.equal(again.status, 200);
  assert.equal(informer().hits - hits, 1, 'answered from the informer, not judged again');
  assert.deepEqual(await again.json(), await first.json(), 'the same object');
});

test("a step's tries read through the objects' handler judge the run through the same informer", async () => {
  const res = await app().request(`/api/runs/${GATED}/steps/implement/tries`);
  assert.equal(res.status, 200);
  assert.ok(informer().runs.has(GATED), "the sub-resource kept the run in the app's informer");
});

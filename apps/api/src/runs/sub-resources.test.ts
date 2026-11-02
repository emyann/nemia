/**
 * The run object's sub-resources on their routes (`tries`, `try`, `closeout`, `told`): a step's tries, one try, its closeout, and what it
 * was told, each the package's entry with its path bound to its arguments; a step or a try the run does not have is a 404.
 *
 * On the stand-ins: the runtime's test engine, its task filed and settled by hand, and the test place, under the run record this file seeds.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { appOver, beforeEachTest, eachTest, engineFor } from '../../test/placed.ts';

const stand = eachTest(testPlace);
const standIn = eachTest(testEngine);
const engine = () => engineFor(standIn());
const app = eachTest(() => appOver(standIn(), stand()));

const R = 'r-sub';
fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'runs', `${R}.json`),
  JSON.stringify({
    id: R,
    repo: '/code/app',
    workspace: '/code/app',
    baseRef: 'abc123',
    branch: 'main',
    isolate: true,
    brief: 'Sub-resources',
    workflowDir: path.join(root, 'no-such-workflow'),
    createdAt: '2026-11-02T06:00:00.000Z',
    workflow: [{ name: 'implement', after: [], body: 'Implement it.', harness: 'claude' }],
    steps: { implement: { taskId: 't-sub' } },
  }),
);
beforeEachTest(() => {
  Effect.runSync(engine().file({ id: 't-sub', brief: 'Do it.', cwd: '/code/app', harness: 'claude' }));
  standIn().settle('t-sub', 'succeeded', {
    exitCode: 0,
    closeout: { outcome: 'done', summary: 'Built it.', needs: null, artifacts: [] },
  });
});

const get = async (url: string) => {
  const res = await app().request(url);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const at = `/api/runs/${R}/steps/implement`;

test("a run's step answers its tries, one try, that try's closeout and what it was told, each on its own route", async (t) => {
  await t.test('the tries: the one try the step ran', async () => {
    const { status, body } = await get(`${at}/tries`);
    assert.equal(status, 200);
    assert.deepEqual(
      (body as { tries: Array<{ try: number }> }).tries.map((x) => x.try),
      [1],
      'one try',
    );
  });
  await t.test("the closeout's route answers the closeout the try carries", async () => {
    const one = await get(`${at}/tries/1`);
    const closeout = await get(`${at}/tries/1/closeout`);
    assert.equal(one.status, 200);
    assert.equal(closeout.status, 200);
    assert.deepEqual(
      (closeout.body as { closeout: unknown }).closeout,
      (one.body as { closeout: unknown }).closeout,
      'the same closeout, read once',
    );
    assert.equal((closeout.body as { closeout: { summary: string } }).closeout.summary, 'Built it.', 'the step signed off with it');
  });
  await t.test('the told layers answer', async () => {
    assert.equal((await get(`${at}/told`)).status, 200);
  });
  await t.test('REFUSED: a try or a step the run does not have is a 404', async () => {
    assert.equal((await get(`${at}/tries/7/closeout`)).status, 404, 'no try 7');
    assert.equal((await get(`/api/runs/${R}/steps/gone/tries`)).status, 404, 'no step gone');
  });
});

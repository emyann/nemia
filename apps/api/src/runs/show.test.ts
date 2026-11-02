/**
 * `GET /api/runs/:runId` answers the run as one object (`nemia show`'s, the package's `Run`), the run's one entry served on both sides;
 * any `view`, the page's `?view=page` among them, is refused.
 *
 * On the stand-ins: the runtime's test engine, its task filed and settled by hand, and the test place, under the records this file seeds.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Schema } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { COMMANDS, RunObject } from 'agent-orchestrator';
import type { RunAnswer } from './runs.ts';
import { appOver, beforeEachTest, eachTest, engineFor, runOver } from '../../test/placed.ts';

const stand = eachTest(testPlace);
const standIn = eachTest(testEngine);
const engine = () => engineFor(standIn());
const app = eachTest(() => appOver(standIn(), stand()));
const runWith = runOver(() => stand().layer);

const R = 'r-show';
/** A run's record of one step, its task `t-<id>`. */
const record = (id: string) => ({
  id,
  repo: '/code/app',
  workspace: '/code/app',
  baseRef: 'abc123',
  branch: 'main',
  isolate: true,
  brief: 'Show it',
  workflowDir: path.join(root, 'no-such-workflow'),
  createdAt: '2026-11-02T06:00:00.000Z',
  workflow: [{ name: 'implement', after: [], body: 'Implement it.', harness: 'claude' }],
  steps: { implement: { taskId: `t-${id}` } },
});
fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
fs.writeFileSync(path.join(root, 'runs', `${R}.json`), JSON.stringify(record(R)));
beforeEachTest(() => {
  Effect.runSync(engine().file({ id: `t-${R}`, brief: 'Do it.', cwd: '/code/app', harness: 'claude' }));
  standIn().settle(`t-${R}`, 'succeeded', {
    exitCode: 0,
    closeout: { outcome: 'done', summary: 'Built it.', needs: null, artifacts: [] },
  });
});

const SHOW = COMMANDS.find((c) => c.name === 'show');

test("the run's route answers the run object, nemia/v1's Run, as nemia show prints it", async () => {
  const res = await app().request(`/api/runs/${R}`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as RunAnswer;
  assert.deepEqual(Schema.decodeUnknownSync(RunObject.Run)(body), body, "the package's Run decodes the answer");
  assert.equal(body.apiVersion, 'nemia/v1');
  assert.equal(body.kind, 'Run');
  assert.equal(body.metadata.name, R);
  const handler = SHOW?.handler?.bind(SHOW);
  assert.ok(handler, 'show has a handler');
  const shown = await runWith(engine(), handler({ runId: R }, process.env, root));
  assert.deepEqual(body, JSON.parse(JSON.stringify(shown)), 'one judgement serves both sides: the api answers what nemia show prints');
});

test('REFUSED: no such run, or a path made of an id, is a 404; a view the route does not take is a 422', async () => {
  assert.equal((await app().request('/api/runs/r-nowhere')).status, 404, 'no such run');
  assert.equal((await app().request(`/api/runs/..%2Fruns%2F${R}`)).status, 404, 'a path is no id');
  assert.equal((await app().request(`/api/runs/${R}?view=frob`)).status, 422, 'the route takes no view');
});

test('REFUSED: ?view=page is gone, a 422 like any view: the route answers the object, and the board reads its sub-resources and lines', async () => {
  const res = await app().request(`/api/runs/${R}?view=page`);
  assert.equal(res.status, 422, 'the page is no view the route takes');
  const body = (await res.json()) as { error?: unknown };
  assert.equal(typeof body.error, 'string', 'a refusal, in words');
});

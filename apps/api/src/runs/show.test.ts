/**
 * `GET /api/runs/:name` answers the run as one object (`nemia show`'s, the package's `Run`), the run's one entry served on both sides,
 * and takes no view. `GET /api/runs/:name/record` answers the record as `nemia show --raw` prints it, and `GET /api/listing[/:name]` what
 * `nemia ls` lists, the two reads `nemia` prints from as a client of the api.
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
import type { Run as RunAnswer } from 'objects';
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

test('REFUSED: no such run, or a path made of an id, is a 404', async () => {
  assert.equal((await app().request('/api/runs/r-nowhere')).status, 404, 'no such run');
  assert.equal((await app().request(`/api/runs/..%2Fruns%2F${R}`)).status, 404, 'a path is no id');
});

test('the run takes no view: `?view=` and `?raw=` are no query of its endpoint, which answers the object whatever they say', async () => {
  for (const query of ['view=page', 'view=frob', 'raw=true']) {
    const res = await app().request(`/api/runs/${R}?${query}`);
    assert.equal(res.status, 200, query);
    assert.equal(((await res.json()) as RunAnswer).kind, 'Run', `${query}: the object`);
  }
});

test("GET /api/runs/:name/record answers the run's record as nemia show --raw prints it; no such run a 404", async () => {
  const res = await app().request(`/api/runs/${R}/record`);
  assert.equal(res.status, 200);
  const handler = SHOW?.handler?.bind(SHOW);
  assert.ok(handler, 'show has a handler');
  const printed = await runWith(engine(), handler({ runId: R, raw: true }, process.env, root));
  assert.deepEqual(await res.json(), JSON.parse(JSON.stringify(printed)), 'the record nemia show --raw prints');
  assert.equal((await app().request('/api/runs/r-nowhere/record')).status, 404, 'no such run');
});

test("GET /api/listing answers nemia ls's whole answer, every run or the one named; a run the store does not have is a 404", async (t) => {
  const ceilings = { WF_MAX_RUNS: process.env.WF_MAX_RUNS, WF_MAX_CONCURRENT: process.env.WF_MAX_CONCURRENT };
  Object.assign(process.env, { WF_MAX_RUNS: '2', WF_MAX_CONCURRENT: '2' });
  t.after(() => Object.assign(process.env, ceilings));
  const LS = COMMANDS.find((c) => c.name === 'ls');
  const handler = LS?.handler?.bind(LS);
  assert.ok(handler, 'ls has a handler');
  const all = (await (await app().request('/api/listing')).json()) as { runs: Array<{ run: { id: string } }>; daemon: unknown };
  assert.ok(
    all.runs.some((r) => r.run.id === R),
    'every run',
  );
  const one = await app().request(`/api/listing/${R}`);
  assert.equal(one.status, 200);
  const listed = await runWith(engine(), handler({ runId: R }, process.env, root));
  assert.deepEqual(await one.json(), JSON.parse(JSON.stringify(listed)), 'what nemia ls lists of it');
  assert.equal((await app().request('/api/listing/r-nowhere')).status, 404, 'no such run');
});

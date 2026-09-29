/**
 * The api's layer (layer.ts, `appOf` and `liveOf` in app.ts): every route, a mounted router's among them, reads the services of the app it
 * was asked through, so an app built over a layer of a test's own answers from that layer and the process's app is untouched.
 */
import './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Layer } from 'effect';
import { scratch } from './scratch.ts';
import type { WorkflowListing } from '../src/workflows/workflows.ts';
import { app, appOf, liveOf } from '../src/app.ts';
import { Engine, StoreRoot } from '../src/store.ts';
import { engine } from 'agent-orchestrator';

/** The names of the workflows `GET /api/workflows` lists as yours, through `on`. */
const yoursOn = async (on: typeof app): Promise<string[]> => {
  const res = await on.request('/api/workflows');
  assert.equal(res.status, 200);
  return ((await res.json()) as WorkflowListing[]).filter((w) => w.from === 'yours').map((w) => w.name);
};

test("a mounted router's route reads the engine of the app it was asked through", async () => {
  const live = engine();
  let lists = 0;
  const counted: typeof live = {
    ...live,
    list: (...args) => {
      lists++;
      return live.list(...args);
    },
  };
  const { app: own } = appOf(Layer.merge(liveOf(), Layer.succeed(Engine)(counted)));
  assert.equal((await own.request('/api/runs')).status, 200);
  assert.ok(lists > 0, "GET /api/runs listed the tasks through the layer's engine");
  const before = lists;
  assert.equal((await app.request('/api/runs')).status, 200);
  assert.equal(lists, before, "the process's app reads through an engine of its own");
});

test("a mounted router's route reads the store's root of the app it was asked through", async () => {
  const home = scratch('hkb-api-layer-home-');
  fs.mkdirSync(path.join(home, 'workflows', 'elsewhere'), { recursive: true });
  fs.writeFileSync(path.join(home, 'workflows', 'elsewhere', 'plan.md'), '---\nharness: codex\n---\nWrite PLAN.md.\n');
  const { app: own } = appOf(Layer.merge(liveOf(), Layer.succeed(StoreRoot)(home)));
  assert.deepEqual(await yoursOn(own), ['elsewhere'], "yours, read under the layer's root");
  assert.deepEqual(await yoursOn(app), [], "the process's app reads yours under WF_ROOT, which has none");
});

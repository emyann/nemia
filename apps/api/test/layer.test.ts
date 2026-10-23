/**
 * The api's layer (layer.ts, `appOf` and `liveOf` in app.ts): every route, a mounted router's among them, reads the services of the app it
 * was asked through, so an app built over a layer of a test's own answers from that layer and the process's app is untouched.
 */
import './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Layer } from 'effect';
import { scratch } from './scratch.ts';
import type { WorkflowListing } from '../src/workflows/workflows.ts';
import { app, appOf, liveOf, runtime } from '../src/app.ts';
import { ReadMemo } from '../src/layer.ts';
import { Engine, StoreRoot } from '../src/store.ts';
import { engine } from 'agent-orchestrator';

/** The names of the workflows `GET /api/workflows` lists as yours, through `on`. */
const yoursOn = async (on: typeof app): Promise<string[]> => {
  const res = await on.request('/api/workflows');
  assert.equal(res.status, 200);
  return ((await res.json()) as WorkflowListing[]).filter((w) => w.from === 'yours').map((w) => w.name);
};

test("appOf: a mounted router reads the engine and the store's root of the app it was asked through, and an app keeps its reads of its own", async (t) => {
  await t.test("a mounted router's route reads the engine of the app it was asked through", async () => {
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
  await t.test("a mounted router's route reads the store's root of the app it was asked through", async () => {
    const home = scratch('nemia-api-layer-home-');
    fs.mkdirSync(path.join(home, 'workflows', 'elsewhere'), { recursive: true });
    fs.writeFileSync(path.join(home, 'workflows', 'elsewhere', 'plan.md'), '---\nplace: git\nharness: codex\n---\nWrite PLAN.md.\n');
    const { app: own } = appOf(Layer.merge(liveOf(), Layer.succeed(StoreRoot)(home)));
    assert.deepEqual(await yoursOn(own), ['elsewhere'], "yours, read under the layer's root");
    assert.deepEqual(await yoursOn(app), [], "the process's app reads yours under WF_ROOT, which has none");
  });
  await t.test(
    'an app keeps what its reads keep of its own: one over another engine starts with none, and reads the feed from its start',
    async () => {
      await Effect.runPromise(
        engine().file({ id: 't-layer-filed', brief: 'Read me.', cwd: scratch('nemia-api-layer-cwd-'), harness: 'claude' }),
      );
      const memoOf = (on: typeof runtime) => on.runPromise(ReadMemo.useSync((memo) => memo));
      assert.equal((await app.request('/api/runs')).status, 200);
      const theProcess = await memoOf(runtime);
      assert.ok(theProcess.filings.filed.has('t-layer-filed'), "the process's app read the filing off the feed");
      assert.ok(theProcess.filings.cursor > 0, 'and holds where it stopped');
      const { app: own, runtime: ownRuntime } = appOf(Layer.merge(liveOf(), Layer.succeed(Engine)(engine())));
      const mine = await memoOf(ownRuntime);
      assert.notEqual(mine, theProcess, "an app's memo is its own");
      assert.deepEqual([mine.filings.cursor, mine.filings.filed.size, mine.resting.runs.size, mine.said.size], [0, 0, 0, 0]);
      assert.equal((await own.request('/api/runs')).status, 200);
      assert.ok(mine.filings.filed.has('t-layer-filed'), "read from the feed's start, not from where the process's app stopped");
    },
  );
});

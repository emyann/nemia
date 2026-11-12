/**
 * The server's upgrade on the daemon's own engine (`engine(env)`, its command harness), never the stand-in: `startUpgrade` files the real
 * `bin/nemia.ts upgrade <tag>` on a scratch store, the engine runs it to its end, and `upgradeOf` and `followUpgrade` read it back. The
 * code this test runs is a checkout, so the job's `nemia upgrade` takes a build's path, the tag resolved in the checkout's repository: a
 * tag it lacks is refused there before anything is built, so the job settles failed, its refusal read in its one stream (stderr joined to
 * stdout), and `releases/current` is never made. An archive's path — a `file:` download base, a checksum — is the archive's own boundary
 * test (`upgrade.archive.boundary.test.ts`): the job runs the package's own CLI, which reads an archive install only where the code runs
 * from one, and this test's code is the checkout.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Stream } from 'effect';
import { until, WAITED, type Waiter } from 'agent-runtime/testing';
import { scratch } from 'test-kit/scratch';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runOver } from '../../test/placed.ts';
import { engine, runWith, type Engine } from '../runtime-client.ts';
import type { Env } from '../config/config.store.ts';
import { CURRENT } from './release.ts';
import { releasesDir } from './release.store.ts';
import { followUpgrade, startUpgrade, upgradeOf } from './upgrade-job.verb.ts';

const ROOT = scratch('wf-upgrade-job-live-');
const ENV: Env = { ...process.env, WF_ROOT: ROOT, WF_MAX_CONCURRENT: '4', WF_MAX_RUNS: undefined };

/** A tag no repository holds. */
const NO_TAG = 'v999.0.0';

const stand = eachTest(testPlace);

/** Tick `e` until the task `id` has settled, and answer its view. */
const settled = (t: Waiter, e: Engine, id: string) => {
  let phase = '';
  return until(
    t,
    async () => {
      await Effect.runPromise(e.tick());
      const v = await Effect.runPromise(e.view(id));
      phase = v.phase;
      return Boolean(v.state.settled) && v;
    },
    () => `${id} settled; phase ${phase}`,
    { everyMs: 150 },
  );
};

test(
  "LIVE: an upgrade is filed on the daemon's engine, runs the package's own nemia upgrade, and reads back as it ended",
  WAITED,
  async (t) => {
    const e = engine(ENV);
    const run = runOver(runWith, () => stand().layer, ENV);
    const started = await run(e, startUpgrade({ tag: NO_TAG }));
    assert.equal(started.phase, 'pending');
    const v = await settled(t, e, started.id);
    assert.equal(v.state.settled, 'failed', 'a refused upgrade exits non-zero');

    const ended = await run(e, upgradeOf(started.id));
    assert.equal(ended.phase, 'failed');
    assert.equal(ended.exitCode, 2, "a refusal's exit");
    assert.match(ended.output, new RegExp(NO_TAG.replaceAll('.', '\\.')), "its refusal is read in the one stream, stderr's included");
    assert.equal(fs.existsSync(path.join(releasesDir(ROOT), CURRENT)), false, 'releases/current is never made');

    const followed = await run(
      e,
      Effect.flatMap(followUpgrade(started.id, 1), (s) => Stream.runCollect(s)),
    );
    assert.deepEqual(
      followed.map((f) => f.kind),
      ['output', 'ended'],
    );
  },
);

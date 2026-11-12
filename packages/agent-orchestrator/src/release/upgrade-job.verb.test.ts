/**
 * The server's upgrade as Settings starts and follows it, on the runtime's stand-in (`testEngine`) and a scratch store: a start files one
 * command task that runs `nemia upgrade <tag>` on the store and answers it pending; while that task is unsettled, or a `nemia upgrade`
 * typed on the machine is building, another start is refused; a tag below the store's floor is refused before anything is filed; the
 * upgrade's phase, output and exit code are read off its task as it settles, and its follow sends the output from its first byte, then
 * its end. The read says the release going back goes to, with the floor's words where it refuses it. Who may start one is the api's
 * concern (`personOnly`), not this layer's.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Stream } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { scratch } from 'test-kit/scratch';
import { story } from 'test-kit/checkpoints';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runOver } from '../../test/placed.ts';
import { engineOf, runWith, type EngineService } from '../runtime-client.ts';
import type { StoreRoot } from '../config/root.store.ts';
import type { Env } from '../config/config.store.ts';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { writeStoreFloor } from './archive.store.ts';
import type { Running } from './release.ts';
import { releaseDir, releasesDir, writeReleaseFile } from './release.store.ts';
import { writeUpgradeRecord } from './upgrade-job.store.ts';
import { followUpgrade, RunningCode, startUpgrade, upgradeOf, upgradesRead } from './upgrade-job.verb.ts';

const ROOT = scratch('wf-upgrade-job-');
const ENV: Env = { ...process.env, WF_ROOT: ROOT };

/** The install the server runs here: `v1.3.0`, from an archive. */
const RUNNING: Running = { kind: 'install', root: '/r/v1.3.0', tag: 'v1.3.0', commit: 'c0ffee', source: 'file:///base', builtAt: '' };

const stand = eachTest(testPlace);
const engine = eachTest(testEngine);
/** `program` over this test's engine, its store `ROOT`, the server running `RUNNING`. */
const run = <A, E>(program: Effect.Effect<A, E, StoreRoot | EngineService>) =>
  runOver(runWith, () => stand().layer, ENV)(engineOf(engine().layer), program.pipe(Effect.provideService(RunningCode, () => RUNNING)));

/** What `program` was refused with, which must be a refusal. */
const refusedBy = async (program: Effect.Effect<unknown, unknown, StoreRoot | EngineService>) => {
  try {
    await run(program);
  } catch (err) {
    return err;
  }
  assert.fail('the program was not refused');
};

/** A release of `tag` installed under the store's `releases/`. */
const installed = (tag: string) => {
  fs.mkdirSync(releaseDir(tag, ROOT), { recursive: true });
  writeReleaseFile(releaseDir(tag, ROOT), { tag, commit: 'c0ffee', source: 'file:///base', builtAt: '' });
};

test('Settings upgrades the server, one upgrade at a time, never below the floor, and follows it to its end', async (t) => {
  const s = story(t);
  let id = '';

  await s.test('a start files one command task that runs nemia upgrade <tag> on the store, and answers it pending', async () => {
    const started = await run(startUpgrade({ tag: 'v1.4.0' }));
    id = started.id;
    assert.equal(started.phase, 'pending');
    assert.equal(started.tag, 'v1.4.0');
    assert.equal(started.from, 'v1.3.0', 'the release the server ran when it started');
    assert.equal(engine().tasks.size, 1);
    const filed = engine().tasks.get(id)?.spec;
    assert.ok(filed);
    assert.equal(filed.harness, 'command');
    assert.equal(filed.cwd, ROOT);
    const config = filed.config as { command: string[]; env: Record<string, string> };
    assert.deepEqual(config.command.slice(-2), ['upgrade', 'v1.4.0']);
    assert.ok(config.command.includes(process.execPath), 'run on the server’s own Node');
    assert.ok(
      config.command.some((a) => a.endsWith(path.join('agent-orchestrator', 'bin', 'nemia.ts'))),
      'run by the package’s own CLI',
    );
    assert.equal(config.env.WF_ROOT, ROOT);
  });

  await s.test('a second start while that task is unsettled is refused Conflict, and files nothing', async () => {
    engine().settle(id, 'working');
    assert.ok((await refusedBy(startUpgrade({ tag: 'v1.5.0' }))) instanceof Conflict);
    assert.equal(engine().tasks.size, 1);
    assert.equal((await run(upgradeOf(id))).phase, 'running');
  });

  await s.test('once it settles, upgradeOf and the read say it succeeded, with its output and exit code', async () => {
    engine().settle(id, 'succeeded', { exitCode: 0, printed: { stdout: 'downloaded v1.4.0\nreleases/current now names v1.4.0\n' } });
    const ended = await run(upgradeOf(id));
    assert.equal(ended.phase, 'succeeded');
    assert.equal(ended.exitCode, 0);
    assert.equal(ended.output, 'downloaded v1.4.0\nreleases/current now names v1.4.0\n');
    const read = await run(upgradesRead());
    assert.equal(read.last?.id, id);
    assert.equal(read.last?.phase, 'succeeded');
  });

  await s.test('its follow sends the output from its first byte, then its end', async () => {
    const followed = await run(Effect.flatMap(followUpgrade(id, 1), (stream) => Stream.runCollect(stream)));
    assert.deepEqual(
      followed.map((f) => f.kind),
      ['output', 'ended'],
    );
    const [output, ended] = followed;
    assert.equal(output?.kind === 'output' ? output.text : '', 'downloaded v1.4.0\nreleases/current now names v1.4.0\n');
    assert.equal(ended?.kind === 'ended' ? ended.upgrade.phase : '', 'succeeded');
  });

  await s.test('a start while a nemia upgrade typed on the machine is building is refused Conflict', async () => {
    const building = path.join(releasesDir(ROOT), `.building-v1.5.0-2026-${process.pid}`);
    fs.mkdirSync(building, { recursive: true });
    try {
      assert.ok((await refusedBy(startUpgrade({ tag: 'v1.5.0' }))) instanceof Conflict);
      assert.equal(engine().tasks.size, 1);
    } finally {
      fs.rmSync(building, { recursive: true });
    }
  });

  await s.test('a tag below the floor is refused Conflict before anything is filed, and a tag no folder is named by Invalid', async () => {
    writeStoreFloor(ROOT, { major: 1, minor: 2, patch: 0 });
    assert.ok((await refusedBy(startUpgrade({ tag: 'v1.1.0' }))) instanceof Conflict);
    assert.ok((await refusedBy(startUpgrade({ tag: '../v1.4.0' }))) instanceof Invalid);
    assert.equal(engine().tasks.size, 1, 'the engine holds no task but the first');
  });

  await s.test('the read names the newest older release installed, with the floor’s words where it refuses going back', async () => {
    installed('v1.1.0');
    installed('v1.2.0');
    installed('v1.3.0');
    const allowed = await run(upgradesRead());
    assert.deepEqual(allowed.previous, { tag: 'v1.2.0' });
    writeStoreFloor(ROOT, { major: 1, minor: 3, patch: 0 });
    const refused = await run(upgradesRead());
    assert.equal(refused.previous?.tag, 'v1.2.0');
    assert.equal(typeof refused.previous?.refused, 'string');
  });

  await s.test('an id no upgrade was started under is refused Missing', async () => {
    assert.ok((await refusedBy(upgradeOf('upgrade-none'))) instanceof Missing);
    assert.ok((await refusedBy(followUpgrade('upgrade-none'))) instanceof Missing);
  });
});

test('a server that runs code from a repository has no release to go back to, and its upgrade says no from', async () => {
  const root = scratch('wf-upgrade-job-checkout-');
  const env: Env = { ...process.env, WF_ROOT: root };
  const checkout = <A, E>(program: Effect.Effect<A, E, StoreRoot | EngineService>) =>
    runOver(
      runWith,
      () => stand().layer,
      env,
    )(engineOf(engine().layer), program.pipe(Effect.provideService(RunningCode, (): Running => ({ kind: 'checkout', root: '/r' }))));
  fs.mkdirSync(releaseDir('v1.0.0', root), { recursive: true });
  writeReleaseFile(releaseDir('v1.0.0', root), { tag: 'v1.0.0', commit: 'c0ffee', source: 'file:///base', builtAt: '' });
  assert.deepEqual(await checkout(upgradesRead()), { previous: null, last: null });
  const started = await checkout(startUpgrade({ tag: 'v1.4.0' }));
  assert.equal(started.from, undefined);
});

test('an upgrade whose task the engine has forgotten holds no start back, and is no last upgrade to read', async () => {
  const root = scratch('wf-upgrade-job-forgotten-');
  const env: Env = { ...process.env, WF_ROOT: root };
  const over = <A, E>(program: Effect.Effect<A, E, StoreRoot | EngineService>) =>
    runOver(runWith, () => stand().layer, env)(engineOf(engine().layer), program.pipe(Effect.provideService(RunningCode, () => RUNNING)));
  writeUpgradeRecord(root, { id: 'upgrade-gone', tag: 'v1.4.0', taskId: 'upgrade-gone', startedAt: '2026-11-01T00:00:00.000Z' });
  assert.equal((await over(upgradesRead())).last, null);
  const started = await over(startUpgrade({ tag: 'v1.4.0' }));
  assert.equal(started.phase, 'pending');
  assert.equal((await over(upgradesRead())).last?.id, started.id, 'the newest record is the last');
});

/**
 * What the daemon's pass records of a run's observed status (`runStatusesObserved`, `/registry/runstatus/<id>`): a step finishing moves the
 * run's revision, so a watch from before it is handed the run once, MODIFIED; and a status that did not change across passes writes
 * nothing, a run going measured at a later instant included (the times measured to the read are left out of what is compared). Walked
 * through the pass (`tickRun`) over the test engine and the test place, with the informer a daemon keeps.
 *
 * On a store of its own at `ROOT`, given as `ENV`.
 */
import { emptyRuns, runRecord } from '../../testing.ts';
import { beforeEach, test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { scratch } from 'test-kit/scratch';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runGiven, runOver } from '../../test/placed.ts';
import { advanceRun, startRun, runWith as runEngine } from '../runner.ts';
import { freshRestMemo, tickRun } from './tick.verb.ts';
import { Informer, informerMemo, type InformerMemo } from '../rest/informer.verb.ts';
import { engineOf } from '../runtime-client.ts';
import { keyspaceHead, kindReplay } from '../list-watch/kind-watch.store.ts';
import { runList } from '../run-list/run-list.verb.ts';
import { runStatusesHeld } from '../run-status/run-status.store.ts';

const ROOT = scratch('wf-run-status-pass-');
const ENV: Record<string, string | undefined> = {
  ...process.env,
  WF_ROOT: ROOT,
  WF_VERIFY_REST: '0',
  WF_DEFAULT_FACTORY_STARTS: '1',
  WF_MAX_CONCURRENT: undefined,
  WF_MAX_RUNS: undefined,
};
const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };
const AT = '2026-10-14T09:30:00.000Z';

const stand = eachTest(testPlace);
const runWith = runOver(runEngine, () => stand().layer, ENV);
const runPlaced = runGiven(() => stand().layer, ENV);
const engine = eachTest(testEngine);
const e = () =>
  Object.assign(engineOf(engine().layer), {
    tick: () => Effect.succeed({ tasks: 0, actions: [], running: {}, views: [] }),
    tallied: undefined,
  });

beforeEach(() => {
  fs.rmSync(path.join(ROOT, 'runs'), { recursive: true, force: true });
  emptyRuns(ROOT);
  fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
});

/**
 * A run of one step, `work`, advanced one pass so its step is filed, its session at work; with a gate on `work`, its step signed and
 * waiting at it.
 */
const atWork = async (gates: string[] = []) => {
  const dir = scratch('wf-run-status-team-');
  fs.writeFileSync(path.join(dir, 'work.md'), '---\nplace: folder\n---\nwork it\n');
  const repo = scratch('wf-run-status-repo-');
  stand().world.repository(repo, {});
  const run = await runPlaced(startRun({ brief: 'record me', repo, workflowDir: dir, gates }));
  await runWith(e(), advanceRun(runRecord(ROOT, run.id)));
  if (gates.length === 0) engine().settle(`${run.id}-work`, 'working', { startedAt: AT, spawnedAt: AT });
  else {
    engine().settle(`${run.id}-work`, 'succeeded', { closeout: SIGNED, startedAt: AT, spawnedAt: AT });
    await runWith(e(), advanceRun(runRecord(ROOT, run.id)));
  }
  return run;
};

/** One pass of the daemon over the store, through the informer `memo`. */
const pass = (memo: InformerMemo) =>
  runWith(e(), tickRun({ repo: ROOT, memo: freshRestMemo(), verifyRest: false }).pipe(Effect.provideService(Informer, memo)));

test('a step finishing moves the run, and a watch from before it is handed the run once, MODIFIED', async () => {
  const run = await atWork();
  const memo = informerMemo();
  await pass(memo);
  const before = (await runPlaced(runStatusesHeld())).get(run.id);
  assert.ok(before !== undefined, 'the pass recorded the run it judged');
  const head = await runPlaced(keyspaceHead());
  engine().settle(`${run.id}-work`, 'succeeded', { closeout: SIGNED, startedAt: AT, spawnedAt: AT });
  await pass(memo);
  const moved = (await runPlaced(runStatusesHeld())).get(run.id);
  assert.ok(moved !== undefined && moved.revision > before.revision, 'its status record moved');
  const replay = await runPlaced(kindReplay('Run', head));
  assert.ok('changes' in replay);
  assert.deepEqual(
    replay.changes.filter((c) => c.name === run.id).map((c) => c.change),
    ['MODIFIED'],
  );
});

test('a status unchanged across passes writes nothing, a run going measured at a later instant included', async () => {
  const run = await atWork();
  const memo = informerMemo();
  await pass(memo);
  await pass(memo);
  const first = (await runPlaced(runStatusesHeld())).get(run.id);
  assert.ok(first !== undefined);
  await pass(memo);
  const second = (await runPlaced(runStatusesHeld())).get(run.id);
  assert.equal(second?.revision, first.revision);
});

test('a run waiting at its gate, unchanged across passes, keeps its record at the revision it had', async () => {
  const run = await atWork(['work']);
  const memo = informerMemo();
  await pass(memo);
  const first = (await runPlaced(runStatusesHeld())).get(run.id);
  assert.equal(first?.record.status.state, 'waiting');
  await pass(memo);
  await pass(memo);
  const later = (await runPlaced(runStatusesHeld())).get(run.id);
  assert.equal(later?.revision, first?.revision);
});

/** The runs list as the api reads it, plain or asked by state, through `memo`. */
const listed = (memo: InformerMemo, fieldSelector?: string) =>
  runWith(e(), runList(e(), { home: ROOT, memo, verify: false }, { memo: { said: new Map() } }, { fieldSelector }));

/** `answer` without what a read measures or stamps: the instant, the clocks, and each run's revision. */
const unstamped = (answer: object) =>
  JSON.parse(
    JSON.stringify(answer, (key, value) => (['asOf', 'clock', 'wallMs', 'resourceVersion'].includes(key) ? undefined : value)),
  ) satisfies object;

test('a run served from the record the pass wrote is the run judged on demand, in a plain list and in a list asked by state', async () => {
  await atWork(['work']);
  const memo = informerMemo();
  const plain = unstamped(await listed(memo));
  const byState = unstamped(await listed(memo, 'status.state=waiting'));
  await pass(memo);
  assert.deepEqual(unstamped(await listed(informerMemo())), plain);
  assert.deepEqual(unstamped(await listed(informerMemo(), 'status.state=waiting')), byState);
});

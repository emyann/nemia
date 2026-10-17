/**
 * The factories' listing, which the board polls (`GET /api/factories`, `FACTORY`): a schedule's last run is found among the runs the
 * store has, so the listing reads every record — through the memo a serving caller hands it, each run whose files have not moved is
 * answered from memory, and a warm read reads no finished run's record.
 *
 * `WF_ROOT` is set before the import, since the store reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { testEngine } from 'agent-runtime/testing';
import { scratch } from '../../test/scratch.ts';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runOver } from '../../test/placed.ts';
import { heldUnasked } from '../../test/unasked.ts';

const ROOT = scratch('wf-factory-listing-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '0';
const { FACTORY } = await import('./factory.verb.ts');
type ScheduleRuns = import('../schedule/listed.store.ts').ScheduleRuns;
const { addFactory, attachWorkflow, setSchedule } = await import('./factory.store.ts');
const { recordMemo } = await import('../rest/index.ts');
const { metered } = await import('../meter/tally.store.ts');
const { runWith: runEngine, engineOf } = await import('../runtime-client.ts');

const stand = eachTest(testPlace);
const runWith = runOver(runEngine, () => stand().layer);
const engine = eachTest(testEngine);
heldUnasked(engine);
const e = () => engineOf(engine().layer);

const RUNS = path.join(ROOT, 'runs');

/** A record of a run a schedule started, as the tick writes one. */
const writeRun = (id: string, scheduled?: { factory: string; workflow: string; due: string }) =>
  fs.writeFileSync(
    path.join(RUNS, `${id}.json`),
    JSON.stringify({
      id,
      workspace: ROOT,
      brief: 'x',
      workflowDir: path.join(ROOT, 'wf'),
      place: { kind: 'folder' },
      steps: {},
      createdAt: '2026-10-16T00:00:00.000Z',
      ...(scheduled ? { scheduled } : {}),
    }),
  );

const listed = (kept?: Parameters<typeof FACTORY.handler>[3]) => runWith(e(), FACTORY.handler({}, process.env, ROOT, kept));

test("a warm read of the factories reads no finished run's record, however many there are, and answers a cold read's own", async () => {
  fs.rmSync(RUNS, { recursive: true, force: true });
  fs.mkdirSync(RUNS, { recursive: true });
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stand().world.repository(repo, {});
  addFactory({ name: 'nemia', repos: [repo] });
  attachWorkflow({ factory: 'nemia', workflow: 'janitor' });
  setSchedule({ factory: 'nemia', workflow: 'janitor', cron: '0 3 * * *', brief: 'tidy' });
  writeRun('r-fired', { factory: 'nemia', workflow: 'janitor', due: '2026-10-15T03:00:00.000Z' });

  const kept = { records: { factories: recordMemo() as ScheduleRuns } };
  const warm = async () => {
    await listed(kept);
    return (await metered(async () => await listed(kept))).tallies?.records;
  };

  const few = await warm();
  for (let n = 0; n < 200; n++) writeRun(`fin-${String(n).padStart(3, '0')}`);
  const many = await warm();
  assert.equal(few, 0, 'nothing moved since the last read, so no record is read');
  assert.equal(many, few, "a warm read reads no finished run's record, however many there are");

  const warmed = await listed(kept);
  const cold = await listed();
  assert.deepEqual(warmed.schedules[0].last, { run: 'r-fired', at: '2026-10-16T00:00:00.000Z' }, 'the fixture has a run of the schedule');
  assert.deepEqual(warmed, cold, "the warm answer is a cold read's own: nothing the board shows changes");
});

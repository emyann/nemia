/**
 * What a factory's object and its parts read of the store's runs (factory.verb.ts, schedule.verb.ts, hire.verb.ts,
 * mcp-server.verb.ts): the factories, one, its commands, hires and servers read no run record at all, however many the store holds; the
 * schedules read every run through the memo a serving caller hands them, so a warm read reads no finished run's record, answers a cold
 * read's own, and sees a run a schedule fired since on the next read.
 *
 * The store is the process's own (`WF_ROOT`, set by `test/ambient.ts` before any import), which the run records are read at.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from '../../../place/memory/index.ts';
import { eachTest, runOver } from '../../../test/placed.ts';
import { heldUnasked } from '../../../test/unasked.ts';
import { addFactory, attachWorkflow, setSchedule } from '../factory.store.ts';
import { metered } from '../../meter/tally.store.ts';
import { recordMemo } from '../../rest/index.ts';
import { engineOf, runWith as runEngine } from '../../runtime-client.ts';
import type { ScheduleRuns } from '../schedule/listed.store.ts';
import { factoryCommandsOf, factoryList, factoryObject } from './factory.verb.ts';
import { hireList } from './hire.verb.ts';
import { mcpServerList } from './mcp-server.verb.ts';
import { scheduleList } from './schedule.verb.ts';

const ROOT = process.env.WF_ROOT ?? '';
const RUNS = path.join(ROOT, 'runs');

const stand = eachTest(testPlace);
const runWith = runOver(runEngine, () => stand().layer);
const engine = eachTest(testEngine);
heldUnasked(engine);
const e = () => engineOf(engine().layer);

/** A record of a run, as a start writes one, `scheduled` where a schedule's fire started it. */
const writeRun = (id: string, createdAt: string, scheduled?: { factory: string; workflow: string; due: string }) => {
  fs.mkdirSync(RUNS, { recursive: true });
  fs.writeFileSync(
    path.join(RUNS, `${id}.json`),
    JSON.stringify({
      id,
      workspace: ROOT,
      brief: 'x',
      workflowDir: path.join(ROOT, 'wf'),
      place: { kind: 'folder' },
      steps: {},
      createdAt,
      ...(scheduled ? { scheduled } : {}),
    }),
  );
};

/** The store's factories: `mill`, which schedules `janitor` and `nightly` and fired `janitor` once, and a file that does not read. */
const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
addFactory({ name: 'mill', repos: [repo] });
attachWorkflow({ factory: 'mill', workflow: 'nightly' });
attachWorkflow({ factory: 'mill', workflow: 'janitor' });
setSchedule({ factory: 'mill', workflow: 'nightly', cron: '0 3 * * *', brief: 'tidy at night' });
setSchedule({ factory: 'mill', workflow: 'janitor', cron: '0 9 * * 1', brief: 'read the stats' });
fs.writeFileSync(path.join(ROOT, 'factories', 'stray.json'), '{ not json');
writeRun('r-fired', '2026-10-16T00:00:00.000Z', { factory: 'mill', workflow: 'janitor', due: '2026-10-15T09:00:00.000Z' });
for (let n = 0; n < 200; n++) writeRun(`fin-${String(n).padStart(3, '0')}`, '2026-10-16T00:00:00.000Z');

/** The factory's repository, on this test's place. */
const placed = () => stand().world.repository(repo, {});

/** A program `counted` runs: one that asks the engine, the place and the store's root. */
type Program<A> = Parameters<typeof runWith<A, unknown>>[1];

/** `program` run over the test place and the store's root, its run records counted, the memo's check off. */
const counted = async <A>(program: Program<A>) => {
  const before = process.env.WF_VERIFY_REST;
  process.env.WF_VERIFY_REST = '0';
  try {
    const { value, tallies } = await metered(() => runWith(e(), program));
    return { value, records: tallies?.records };
  } finally {
    if (before === undefined) delete process.env.WF_VERIFY_REST;
    else process.env.WF_VERIFY_REST = before;
  }
};

test('the factories, one factory, its commands, hires and servers read no run record, however many the store holds', async () => {
  placed();
  const reads: Array<[string, Program<unknown>]> = [
    ['factoryList', factoryList(ROOT, repo, {})],
    ['factoryObject', factoryObject(ROOT, repo, 'mill')],
    ['factoryCommandsOf', factoryCommandsOf(ROOT, repo, 'mill')],
    ['hireList', hireList(ROOT, repo, 'mill', {})],
    ['mcpServerList', mcpServerList(ROOT, repo, 'mill', {})],
  ];
  for (const [name, program] of reads) assert.equal((await counted(program)).records, 0, `${name} reads no run's record`);
});

test("a factory's commands take back each schedule its file holds, by workflow; the default factory's and a stray file's none", async () => {
  placed();
  const of = async (name: string) => Object.keys((await counted(factoryCommandsOf(ROOT, repo, name))).value.unschedule);
  assert.deepEqual(await of('mill'), ['janitor', 'nightly'], "the factory's scheduled workflows, by name");
  assert.deepEqual(await of('default'), [], 'the default factory schedules nothing');
  assert.deepEqual(await of('stray'), [], 'a file that does not read schedules nothing');
});

test("a warm read of the schedules reads no finished run's record, answers a cold read's own, and sees a run fired since", async () => {
  placed();
  const memo = recordMemo() as ScheduleRuns;
  const listed = (kept: ScheduleRuns | undefined) => scheduleList(ROOT, repo, 'mill', {}, kept);
  const last = (list: { items: ReadonlyArray<{ metadata: { name: string }; status: { last?: { run: string } } }> }) =>
    list.items.find((s) => s.metadata.name === 'janitor')?.status.last?.run;

  const first = await counted(listed(memo));
  assert.ok((first.records ?? 0) > 200, 'a cold read reads every record');
  const warm = await counted(listed(memo));
  assert.equal(warm.records, 0, "nothing moved since the last read: no finished run's record is read");
  assert.deepEqual(warm.value, (await counted(listed(undefined))).value, "the warm answer is a cold read's own");
  assert.equal(last(warm.value), 'r-fired');

  writeRun('r-fired-again', '2026-10-23T00:00:00.000Z', { factory: 'mill', workflow: 'janitor', due: '2026-10-22T09:00:00.000Z' });
  const next = await counted(listed(memo));
  assert.equal(last(next.value), 'r-fired-again', 'a run the schedule fired since is its last on the next read');
  assert.equal(next.records, 1, 'the new run alone is read');
  assert.deepEqual(next.value, (await counted(listed(undefined))).value, "and the answer is a cold read's own");
});

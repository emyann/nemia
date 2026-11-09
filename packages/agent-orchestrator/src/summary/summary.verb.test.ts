/**
 * Each step of a run's summary says the agent it is given and since when its task at work runs (`agent`, `since`), as the whole list
 * answers it (`RUNS`), on a run started and advanced over the stand-ins: the agent off the workflow it is judged by, `since` off the step's
 * own task alone, null once it has settled.
 *
 * `WF_ROOT` is set before the package is imported, since the store reads it as it loads; each test empties the store's runs first.
 */
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { testEngine } from 'agent-runtime/testing';
import { scratch } from 'test-kit/scratch';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runGiven, runOver } from '../../test/placed.ts';

const ROOT = scratch('wf-summary-');
const RUNS_DIR = path.join(ROOT, 'runs');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
process.env.WF_DEFAULT_FACTORY_STARTS = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const { howOf } = await import('../command/pages.verb.ts');
const { runsSummarized } = await import('../summary/summary.verb.ts');
const { EngineService: RunsEngine } = await import('../runtime-client.ts');
const { Effect: RunsEffect } = await import('effect');
/** Every run's summary, as the whole list judges it (`runsSummarized`), read through the informer and filings `kept` hands. */
const RUNS = {
  handler: (_args: object, env?: NodeJS.ProcessEnv, home?: string, kept?: Parameters<typeof howOf>[2]) =>
    RunsEffect.gen(function* () {
      return yield* runsSummarized(yield* RunsEngine, howOf(env, home, kept));
    }),
};
const { advanceRun, startRun, runWith: runEngine } = await import('../runner.ts');
const { readRun } = await import('../record/record.store.ts');
const { engineOf } = await import('../runtime-client.ts');
type RunSummary = import('./summary.verb.ts').RunSummary;

const stand = eachTest(testPlace);
const runWith = runOver(runEngine, () => stand().layer);
const runPlaced = runGiven(() => stand().layer);
const engine = eachTest(testEngine);
const e = () => engineOf(engine().layer);

beforeEach(() => {
  fs.rmSync(RUNS_DIR, { recursive: true, force: true });
  fs.mkdirSync(RUNS_DIR, { recursive: true });
});

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };
const AT = '2026-10-14T09:30:00.000Z';

/** A team of two side-by-side steps, `build` given the agent `ada` from the team's agents and `notes` given none. */
const team = (): string => {
  const root = scratch('wf-summary-team-');
  fs.mkdirSync(path.join(root, 'agents'));
  fs.writeFileSync(path.join(root, 'agents', 'ada.md'), '---\ndescription: Use this when a change is to be built.\n---\nBuild it.\n');
  const dir = path.join(root, 'work');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'build.md'), '---\nagent: ada\nplace: git\n---\nbuild it\n');
  fs.writeFileSync(path.join(dir, 'notes.md'), '---\nplace: git\n---\nwrite the notes\n');
  return dir;
};

/** The run started on `team`, from the card `card` where one is given, and advanced one pass, so both its steps are filed. */
const started = async (card?: string): Promise<string> => {
  const repo = scratch('wf-summary-repo-');
  stand().world.repository(repo, {});
  const from = card === undefined ? {} : { from: { inbox: card } };
  const run = await runPlaced(startRun({ brief: 'sum me', repo, workflowDir: team(), isolate: true, ...from }));
  await runWith(e(), advanceRun(readRun(run.id)));
  return run.id;
};

/** The step `name` of the run `id`, as the whole list answers it. */
const stepOf = async (id: string, name: string): Promise<RunSummary['steps'][number]> => {
  const list: RunSummary[] = await runWith(e(), RUNS.handler({}, process.env));
  const step = list.find((run) => run.id === id)?.steps.find((s) => s.name === name);
  assert.ok(step, `the run ${id} has a step ${name}`);
  return step;
};

test('a step at work says its agent and when its own task started; one given no agent says none, and one settled no since', async () => {
  const id = await started();
  engine().settle(`${id}-build`, 'working', { startedAt: AT, spawnedAt: AT });
  engine().settle(`${id}-notes`, 'working', { startedAt: '2026-10-14T09:00:00.000Z', spawnedAt: '2026-10-14T09:00:00.000Z' });

  const build = await stepOf(id, 'build');
  assert.equal(build.agent, 'ada', 'the agent the step names');
  assert.equal(build.since, AT, "the step's own task's start, not the run's earliest");
  assert.equal((await stepOf(id, 'notes')).agent, null, 'a step given no agent');

  engine().settle(`${id}-build`, 'succeeded', { closeout: SIGNED, startedAt: AT, spawnedAt: AT });
  await runWith(e(), advanceRun(readRun(id)));
  const done = await stepOf(id, 'build');
  assert.deepEqual([done.agent, done.since], ['ada', null], 'a settled step keeps its agent and is at work since nothing');
});

test("a run's judged fields: the judgement's run-level words, its time at work and tokens off the views, and the same keys left unjudged", async () => {
  const { judgedFields, unjudgedFields } = await import('./summary.verb.ts');
  const id = await started();
  const run = readRun(id);
  const judged = {
    status: 'running',
    phase: 'running',
    reason: 'Running',
    on: null,
    via: null,
    moving: true,
    cost: null,
    waiting: null,
    holding: null,
    toDecide: null,
  } as const;
  const fields = judgedFields(run, judged, new Map());
  assert.deepEqual(fields, { ...judged, atWork: { ms: 0, since: null, endedAt: null }, tokens: null }, 'no view read: no time, no tokens');
  assert.deepEqual(Object.keys(unjudgedFields()).sort(), Object.keys(fields).sort(), 'a run left unjudged carries the same fields');

  engine().settle(`${id}-build`, 'working', { startedAt: AT, spawnedAt: AT });
  const list: RunSummary[] = await runWith(e(), RUNS.handler({}, process.env));
  const row = list.find((r) => r.id === id);
  assert.ok(row, `the run ${id} is listed`);
  assert.equal(row.atWork?.since, AT, "the list's row carries the judged time at work");
});

test('`cardRuns`: each run started from a card with its phase as the list judges it, read now; a run from no card is not answered, and stays in the informer', async () => {
  const { cardRuns } = await import('./summary.verb.ts');
  const { informerMemo, passStarted } = await import('../rest/informer.verb.ts');
  const fromCard = await started('cache-the-views-k2q9');
  const loose = await started();
  const memo = informerMemo();
  const how = { home: ROOT, memo, filings: { filed: new Map(), cursor: 0 }, verify: false };
  passStarted(memo);
  await runWith(e(), RUNS.handler({}, { ...process.env, WF_VERIFY_REST: '0' }, ROOT, { runs: memo }));
  assert.ok(memo.runs.has(loose), 'the list, within a pass, kept the run from no card');

  assert.deepEqual(await runWith(e(), cardRuns(e(), how)), [{ id: fromCard, from: { inbox: 'cache-the-views-k2q9' }, phase: 'running' }]);
  assert.ok(memo.runs.has(loose), "an inbox read leaves the list's run from no card where it was");

  for (const step of ['build', 'notes'])
    engine().settle(`${fromCard}-${step}`, 'succeeded', { closeout: SIGNED, startedAt: AT, spawnedAt: AT });
  await runWith(e(), advanceRun(readRun(fromCard)));
  passStarted(memo);
  assert.deepEqual(
    (await runWith(e(), cardRuns(e(), how))).map((r) => r.phase),
    ['succeeded'],
    'its run settled, the phase moves with it: nothing was written on the card',
  );
});

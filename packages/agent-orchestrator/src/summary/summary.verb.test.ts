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
import { scratch } from '../../test/scratch.ts';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runGiven, runOver } from '../../test/placed.ts';

const ROOT = scratch('wf-summary-');
const RUNS_DIR = path.join(ROOT, 'runs');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
process.env.WF_DEFAULT_FACTORY_STARTS = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const { RUNS } = await import('../command/pages.verb.ts');
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

/** The run started on `team` and advanced one pass, so both its steps are filed. */
const started = async (): Promise<string> => {
  const repo = scratch('wf-summary-repo-');
  stand().world.repository(repo, {});
  const run = await runPlaced(startRun({ brief: 'sum me', repo, workflowDir: team(), isolate: true }));
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

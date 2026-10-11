/**
 * A step's task is filed with its run, its factory, its workflow, the step and its agent as labels (`stepLabels`), which the runtime hands
 * each of its sessions beside the task's id, by the same keys as its metrics (`stepAttributes`): a ready step, a try and a round alike,
 * walked through the runtime itself over an in-memory journal and a harness that keeps what it was asked to spawn.
 * `WF_ROOT` is set before the runner is imported: it is read as the module loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { Engine as EngineService, nameFor, type Sighting, type SpawnRequest } from 'agent-runtime';
import { asyncOps, asyncStore, plainEngine, type AsyncJournal, type AsyncRunner } from './promised.ts';
import { scratch } from './scratch.ts';
import { testPlace } from '../place/memory/index.ts';
import { runGiven, runOver } from './placed.ts';

const ROOT = scratch('wf-step-labels-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const { addFactory, advanceRun, attachWorkflow, hireAgent, retryRun, startRun, runWith: runEngine } = await import('../src/runner.ts');
const place = testPlace();
const stand = () => place;
const runWith = runOver(runEngine, () => stand().layer);
const runPlaced = runGiven(() => stand().layer);
const { readRun } = await import('../src/record/record.store.ts');
const { stepAttributes } = await import('../src/meter/step.ts');

type Event = Parameters<AsyncJournal['append']>[1];

/** The engine's store, in memory, noting when each attempt began, by its session's name. */
const starts = new Map<string, number>();
const tasks = new Map<string, Event[]>();
const feed: Awaited<ReturnType<AsyncJournal['feed']>>['entries'] = [];
const journal: AsyncJournal = {
  async append(taskId, event) {
    tasks.set(taskId, [...(tasks.get(taskId) ?? []), event]);
    feed.push({ taskId, event });
    if (event.kind === 'starting') starts.set(nameFor(taskId, event.attempt), Date.parse(event.at));
  },
  async read(taskId) {
    return [...(tasks.get(taskId) ?? [])];
  },
  async list() {
    return [...tasks.keys()].sort();
  },
  async feed(after) {
    return { entries: feed.slice(after), cursor: feed.length };
  },
};

const sessions = new Map<string, Sighting>();
/** Every spawn the harness was asked, by session name. */
const spawned = new Map<string, SpawnRequest>();
/** A harness the test signs by hand: every session it starts works until `sign` or `fail` ends it. */
const runner: AsyncRunner = {
  async spawn(r) {
    spawned.set(r.name, r);
    sessions.set(r.name, { sessionId: `s-${spawned.size}`, nativeId: `native-${spawned.size}`, state: 'working', busy: true });
  },
  async observe() {
    return new Map(sessions);
  },
  async stop() {},
  async logs() {
    return '';
  },
};
const engine = plainEngine(
  EngineService.layer({
    root: path.join(ROOT, 'engine'),
    journal: asyncStore(journal),
    harnesses: { claude: asyncOps(runner), check: asyncOps(runner) },
    defaultHarness: 'claude',
  }),
);

/** The engine's pass, then the run's, as the daemon makes them. */
const pass = async (id: string) => {
  await Effect.runPromise(engine.tick());
  return runWith(engine, advanceRun(readRun(id)));
};

/** Passes of `id` until attempt 1 of `taskId` has a session, at most three, and the spawn it was asked. */
const started = async (id: string, taskId: string): Promise<SpawnRequest> => {
  for (let i = 0; i < 3 && !sessions.has(nameFor(taskId, 1)); i++) await pass(id);
  const spawn = spawned.get(nameFor(taskId, 1));
  assert.ok(spawn, `${taskId} started`);
  return spawn;
};

/** Attempt 1 of `taskId` signed off done, with `more` in its closeout. */
const sign = (taskId: string, more: object = {}) => {
  const name = nameFor(taskId, 1);
  sessions.set(name, {
    ...sessions.get(name)!,
    state: 'completed',
    busy: false,
    closeout: { payload: { outcome: 'done', summary: 'did it', artifacts: [], needs: null, ...more }, at: starts.get(name)! + 1 },
  });
};

/** Attempt 1 of `taskId` ended failed, signing nothing. */
const fail = (taskId: string) => {
  const name = nameFor(taskId, 1);
  sessions.set(name, { ...sessions.get(name)!, state: 'failed', busy: false });
};

/** A repository with one commit, so `nemia start` has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stand().world.repository(repo, {});
  return repo;
};

/** A loop: `implement`, then `review`, which may send it back twice (`rounds: 3`). */
const LOOPED = fs.mkdtempSync(path.join(ROOT, 'looped-'));
fs.writeFileSync(path.join(LOOPED, 'implement.md'), '---\nplace: git\n---\nBuild it.\n');
fs.writeFileSync(
  path.join(LOOPED, 'review.md'),
  '---\nafter: implement\nplace: git\noutput: review.schema.json\nloop: implement\nrounds: 3\n---\nReview it.\n',
);
fs.writeFileSync(
  path.join(LOOPED, 'review.schema.json'),
  JSON.stringify({ type: 'object', properties: { again: { type: 'boolean' } }, required: ['again'], additionalProperties: false }),
);

/** The labels a session of `step` in `run` is handed, beside its own `task`: the run's, the default factory's and no agent's. */
const labelled = (run: string, step: string, task: string) =>
  ({ run, factory: 'default', workflow: path.basename(LOOPED), step, agent: 'none', task }) as const;

test("a ready step's, a round's and a try's sessions are each handed their run, factory, workflow, step and agent beside their own task", async () => {
  const run = await runPlaced(startRun({ brief: 'add a flag', repo: aRepo(), workflowDir: LOOPED, isolate: false }));
  const first = `${run.id}-implement`;
  assert.deepEqual((await pass(run.id)).filed, ['implement']);
  assert.deepEqual((await started(run.id, first)).resource, labelled(run.id, 'implement', first), 'a ready step');
  sign(first);
  assert.deepEqual((await pass(run.id)).filed, ['review']);
  const review = `${run.id}-review`;
  assert.deepEqual((await started(run.id, review)).resource, labelled(run.id, 'review', review));
  sign(review, { again: true });
  await pass(run.id);
  const round = readRun(run.id).steps.implement.taskId!;
  assert.notEqual(round, first, 'the round is filed');
  assert.deepEqual((await started(run.id, round)).resource, labelled(run.id, 'implement', round), 'a round');
  fail(round);
  await pass(run.id);
  await runWith(engine, retryRun(run.id, 'implement', { mode: 'fresh' }));
  await pass(run.id);
  const retried = readRun(run.id).steps.implement.taskId!;
  assert.notEqual(retried, round, 'the try is filed');
  assert.deepEqual((await started(run.id, retried)).resource, labelled(run.id, 'implement', retried), 'a try');
});

test("a session of a step in a factory, worked by an agent it hired, is handed that factory and that agent's name", async () => {
  const repo = aRepo();
  const team = fs.mkdtempSync(path.join(ROOT, 'team-'));
  fs.mkdirSync(path.join(team, 'agents'));
  fs.writeFileSync(path.join(team, 'agents', 'worker.md'), '---\nname: worker\n---\nDo the work.\n');
  fs.mkdirSync(path.join(team, 'hired'));
  fs.writeFileSync(path.join(team, 'hired', 'work.md'), '---\nplace: git\n---\nWork it.\n');
  addFactory({ name: 'labelled', repos: [repo] });
  attachWorkflow({ factory: 'labelled', workflow: 'hired' });
  hireAgent({ factory: 'labelled', agent: 'worker', step: 'hired/work' });
  const workflowDir = path.join(team, 'hired');
  const run = await runPlaced(startRun({ brief: 'work it', repo, workflowDir, isolate: false, factory: 'labelled' }));
  const task = `${run.id}-work`;
  assert.deepEqual((await pass(run.id)).filed, ['work']);
  const { resource } = await started(run.id, task);
  assert.deepEqual(resource, { run: run.id, factory: 'labelled', workflow: 'hired', step: 'work', agent: 'worker', task });
  const { outcome, ...keys } = stepAttributes(
    run,
    readRun(run.id).workflow!.find((s) => s.name === 'work')!,
    'done',
  );
  assert.equal(outcome, 'done');
  assert.deepEqual({ run: run.id, ...keys, task }, resource, 'the keys its metrics are kept by, the same');
});

/**
 * A step's task is filed with its run and its step as labels (`stepLabels`), which the runtime hands each of its sessions beside the task's
 * id: a ready step, a try and a round alike, walked through the runtime itself over an in-memory journal and a harness that keeps what it
 * was asked to spawn. And the client's `engine()` hands the runtime the collector the process exports to (`otlpOf`), and none when it
 * exports nowhere. `WF_ROOT` is set before the runner is imported: it is read as the module loads.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Effect } from 'effect';
import { Engine as EngineService, nameFor, type Sighting, type SpawnRequest } from 'agent-runtime';
import { asyncOps, asyncStore, plainEngine, type AsyncJournal, type AsyncRunner } from './promised.ts';
import { scratch } from './scratch.ts';

const ROOT = scratch('wf-step-labels-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const { advanceRun, retryRun, startRun, runWith } = await import('../src/runner.ts');
const { readRun } = await import('../src/record/record.store.ts');
const { engine: clientEngine } = await import('../src/runtime-client.ts');

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
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'init', '-q'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'base'], { cwd: repo });
  return repo;
};

/** A loop: `implement`, then `review`, which may send it back twice (`rounds: 3`). */
const LOOPED = fs.mkdtempSync(path.join(ROOT, 'looped-'));
fs.writeFileSync(path.join(LOOPED, 'implement.md'), 'Build it.\n');
fs.writeFileSync(
  path.join(LOOPED, 'review.md'),
  '---\nafter: implement\noutput: review.schema.json\nloop: implement\nrounds: 3\n---\nReview it.\n',
);
fs.writeFileSync(
  path.join(LOOPED, 'review.schema.json'),
  JSON.stringify({ type: 'object', properties: { again: { type: 'boolean' } }, required: ['again'], additionalProperties: false }),
);

test("a ready step's, a round's and a try's sessions are each handed their run and their step beside their own task", async () => {
  const run = await Effect.runPromise(startRun({ brief: 'add a flag', repo: aRepo(), workflowDir: LOOPED, isolate: false }));
  const first = `${run.id}-implement`;
  assert.deepEqual((await pass(run.id)).filed, ['implement']);
  assert.deepEqual((await started(run.id, first)).resource, { run: run.id, step: 'implement', task: first }, 'a ready step');
  sign(first);
  assert.deepEqual((await pass(run.id)).filed, ['review']);
  const review = `${run.id}-review`;
  assert.deepEqual((await started(run.id, review)).resource, { run: run.id, step: 'review', task: review });
  sign(review, { again: true });
  await pass(run.id);
  const round = readRun(run.id).steps.implement.taskId!;
  assert.notEqual(round, first, 'the round is filed');
  assert.deepEqual((await started(run.id, round)).resource, { run: run.id, step: 'implement', task: round }, 'a round');
  fail(round);
  await pass(run.id);
  await runWith(engine, retryRun(run.id, 'implement', { mode: 'fresh' }));
  await pass(run.id);
  const retried = readRun(run.id).steps.implement.taskId!;
  assert.notEqual(retried, round, 'the try is filed');
  assert.deepEqual((await started(run.id, retried)).resource, { run: run.id, step: 'implement', task: retried }, 'a try');
});

/** Sets `OTEL_EXPORTER_OTLP_ENDPOINT` to `endpoint` for the rest of test `t`. */
const exportingTo = (t: TestContext, endpoint: string) => {
  const before = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = endpoint;
  t.after(() => {
    if (before === undefined) delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    else process.env.OTEL_EXPORTER_OTLP_ENDPOINT = before;
  });
};

/** A task the client's engine files on the shipped `check` harness, never started, and the trace context it was journalled with. */
const filedTrace = async () => {
  const e = clientEngine();
  const id = await Effect.runPromise(
    e.file({ brief: 'b', cwd: ROOT, harness: 'check', config: { command: ['true'] } }).pipe(Effect.withSpan('the pass')),
  );
  return (await Effect.runPromise(e.view(id))).state.traceparent;
};

test("the client's engine is handed the collector the process exports to: its tasks join the filing's trace", async (t) => {
  exportingTo(t, 'http://127.0.0.1:4318/');
  assert.match((await filedTrace()) ?? '', /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
});

test("the client's engine of a process that exports nowhere is handed no collector: its tasks carry no trace", async (t) => {
  exportingTo(t, '');
  assert.equal(await filedTrace(), undefined);
});

/**
 * A step's task is filed with its run, its factory, its workflow, the step and its agent as labels (`stepLabels`), which the runtime hands
 * each of its sessions beside the task's id, by the same keys as its metrics (`stepAttributes`): a ready step, a try and a round alike,
 * walked through the runtime itself over an in-memory journal and a harness that keeps what it was asked to spawn. And the client's
 * `engine()` hands the runtime the collector the process exports to (`otlpOf`), and none when it exports nowhere; and asks its sessions
 * for their tools' inputs only when `NEMIA_TOOL_DETAILS` is `1` (`sessionTelemetryOf`), which a stub harness on PATH reads back, and
 * says on stderr a value that asks nothing (`toolDetailsRefusalOf`).
 * `WF_ROOT` is set before the runner is imported: it is read as the module loads.
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
import { until, WAITED } from './waits.ts';
import { runGiven, runOver } from './placed.ts';

const ROOT = scratch('wf-step-labels-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const {
  addFactory,
  advanceRun,
  attachWorkflow,
  hireAgent,
  retryRun,
  startRun,
  runWith: runEngine,
  gitPlaceLayer,
} = await import('../src/runner.ts');
const runWith = runOver(runEngine, gitPlaceLayer);
const runPlaced = runGiven(gitPlaceLayer);
const { readRun } = await import('../src/record/record.store.ts');
const { engine: clientEngine } = await import('../src/runtime-client.ts');
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
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'init', '-q'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'base'], { cwd: repo });
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

/** Sets each of `vars` in this process's environment for the rest of test `t`, and deletes each given `undefined`. */
const withEnv = (t: TestContext, vars: Record<string, string | undefined>) => {
  const before = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  const put = (all: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(all)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  put(vars);
  t.after(() => put(before));
};

/** Sets `OTEL_EXPORTER_OTLP_ENDPOINT` to `endpoint` for the rest of test `t`. */
const exportingTo = (t: TestContext, endpoint: string) => withEnv(t, { OTEL_EXPORTER_OTLP_ENDPOINT: endpoint });

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

/**
 * The variables the client's engine hands a job of the shipped `claude` harness, with `NEMIA_TOOL_DETAILS` set to `details` (or unset):
 * a stub `claude` first on PATH writes the telemetry variables it was started with and exits, and the engine is ticked until it has.
 */
const jobTelemetry = async (t: TestContext, details: string | undefined) => {
  const bin = scratch('wf-step-labels-bin-');
  const seen = path.join(bin, 'env.json');
  const script = `#!${process.execPath}
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('OTEL_')));
require('node:fs').writeFileSync(${JSON.stringify(seen)}, JSON.stringify(env));
`;
  fs.writeFileSync(path.join(bin, 'claude'), script, { mode: 0o755 });
  withEnv(t, {
    PATH: `${bin}:${process.env.PATH}`,
    OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:9',
    NEMIA_TOOL_DETAILS: details,
    WF_MAX_CONCURRENT: '1',
  });
  const e = clientEngine();
  const id = await Effect.runPromise(e.file({ brief: 'b', cwd: scratch('wf-step-labels-cwd-'), harness: 'claude' }));
  t.after(() => Effect.runPromise(e.stop(id)));
  await until(
    t,
    async () => {
      if (fs.existsSync(seen)) return true;
      await Effect.runPromise(e.tick());
      return false;
    },
    'the stub claude started',
    { everyMs: 50 },
  );
  return JSON.parse(fs.readFileSync(seen, 'utf8')) as Record<string, string>;
};

test(
  "the client's engine asks a session for its tools' details when NEMIA_TOOL_DETAILS is 1, never by default, and says a value that asks nothing",
  WAITED,
  async (t) => {
    await t.test('asked', async (t) => {
      const env = await jobTelemetry(t, '1');
      assert.equal(env.OTEL_EXPORTER_OTLP_ENDPOINT, 'http://127.0.0.1:9');
      assert.equal(env.OTEL_LOG_TOOL_DETAILS, '1');
    });
    await t.test('unset', async (t) => {
      const env = await jobTelemetry(t, undefined);
      assert.equal(env.OTEL_EXPORTER_OTLP_ENDPOINT, 'http://127.0.0.1:9');
      assert.equal(env.OTEL_LOG_TOOL_DETAILS, undefined);
    });
    await t.test('refused', async (t) => {
      const said = t.mock.method(console, 'error', () => {});
      const env = await jobTelemetry(t, 'true');
      assert.equal(env.OTEL_LOG_TOOL_DETAILS, undefined);
      assert.deepEqual(
        said.mock.calls.map((c) => c.arguments).filter((a) => String(a[0]).includes('NEMIA_TOOL_DETAILS')),
        [
          [
            'nemia: NEMIA_TOOL_DETAILS is "true", which asks nothing: set it to 1 for each session to export its tools\' inputs, or unset it. Their tools\' details are left off.',
          ],
        ],
      );
    });
  },
);

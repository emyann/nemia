/**
 * The tick's spans and logs, and the runtime's under them: a pass of the tick (`tickRun`) over the runtime's engine as the client builds
 * it (`engineOf`), traced to a tracer that keeps its spans and logged at `Debug` to a logger that keeps its logs. The runtime's spans nest
 * under the pass's, its filing of a step carries the run and the step (`forStep`), and its journal's log says them beside its own task;
 * what it says of a run outside any filing — the stop of a called-off run's step — carries the run alone (`advancePass`).
 *
 * Told as one story, its two checkpoints sharing the store and the engine. It stays on the runtime's own engine: the journal it traces
 * into is the runtime's, which the engine's stand-in does not keep.
 *
 * `WF_ROOT` is set before the runner is imported, which reads it as the module loads. `WF_VERIFY_REST=1` judges in full every run a pass
 * answers from its memo, sessions enough are admitted for the one run, and no cap is set on runs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Engine as RuntimeEngine, type Event, type Sighting } from 'agent-runtime';
import { Effect, Logger, Option, References, Tracer } from 'effect';
import { scratch } from './scratch.ts';
import { asyncOps, asyncStore, type AsyncJournal, type AsyncRunner } from './promised.ts';
import { runGiven } from './placed.ts';
import { story } from './story.ts';
import { testPlace } from '../place/memory/index.ts';

const place = testPlace();
const stand = () => place;
const ROOT = scratch('wf-telemetry-nesting-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
process.env.WF_MAX_CONCURRENT = '10';
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_RUNS;
const { startRun } = await import('../src/runner.ts');
const runPlaced = runGiven(() => stand().layer);
const { tickRun } = await import('../src/tick/tick.verb.ts');
const { EngineService, engineOf } = await import('../src/runtime-client.ts');
const { runStore } = await import('../src/record/files.store.ts');

const REPO = fs.mkdtempSync(path.join(ROOT, 'repo-'));
stand().world.repository(REPO, {});

const FOLDER = fs.mkdtempSync(path.join(ROOT, 'wf-'));
fs.writeFileSync(path.join(FOLDER, 'work.md'), '---\nplace: git\nharness: codex\n---\nwork it\n');

const tasks = new Map<string, Event[]>();
const journal: AsyncJournal = {
  async append(taskId, event) {
    tasks.set(taskId, [...(tasks.get(taskId) ?? []), event]);
  },
  async read(taskId) {
    return [...(tasks.get(taskId) ?? [])];
  },
  async list() {
    return [...tasks.keys()].sort();
  },
  async feed() {
    return { entries: [], cursor: 0 };
  },
};

const sessions = new Map<string, Sighting>();
const runner: AsyncRunner = {
  async spawn(r) {
    sessions.set(r.name, { sessionId: `s-${sessions.size + 1}`, nativeId: `n-${sessions.size + 1}`, state: 'working', busy: true });
  },
  async observe() {
    return new Map(sessions);
  },
  async stop() {},
  async logs() {
    return '';
  },
};
const e = engineOf(
  RuntimeEngine.layer({
    root: fs.mkdtempSync(path.join(ROOT, 'engine-')),
    journal: asyncStore(journal),
    harnesses: { claude: asyncOps(runner), codex: asyncOps(runner), check: asyncOps(runner) },
    defaultHarness: 'claude',
  }),
);

/** What a capturing logger was handed: each log's message's text and its annotations. */
type Logged = { text: string; annotations: Record<string, unknown> };

/** The names of `span`'s ancestors, its parent first, up to the first that is not this process's own. */
const ancestorsOf = (span: Tracer.Span): string[] => {
  const names: string[] = [];
  let at: Tracer.AnySpan | undefined = Option.getOrUndefined(span.parent);
  while (at?._tag === 'Span') {
    names.push(at.name);
    at = Option.getOrUndefined(at.parent);
  }
  return names;
};

/**
 * Ticks a pass of the store, the engine its service, tracing to a tracer that keeps its spans and logging at `Debug` to one that keeps
 * its logs.
 */
async function tickTraced(): Promise<{ spans: Tracer.NativeSpan[]; logs: Logged[] }> {
  const spans: Tracer.NativeSpan[] = [];
  const logs: Logged[] = [];
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options);
      spans.push(span);
      return span;
    },
  });
  const keeper = Logger.make(({ message, fiber }) => {
    logs.push({
      text: (Array.isArray(message) ? message : [message]).join(' '),
      annotations: { ...fiber.getRef(References.CurrentLogAnnotations) },
    });
  });
  await runPlaced(
    tickRun({ repo: ROOT }).pipe(
      Effect.provide(EngineService.layer(e)),
      Effect.provide(Logger.layer([keeper])),
      Effect.provideService(References.MinimumLogLevel, 'Debug'),
      Effect.withTracer(tracer),
    ),
  );
  return { spans, logs };
}

test("A pass traced down to the runtime's journal: its filing of a step and a called-off run's stop, each said with the run", async (t) => {
  const s = story(t);
  await s.test(
    "a pass's filing of a step is traced under the pass, down to the runtime's journal, each span and log saying the run and the step",
    async () => {
      const run = await runPlaced(startRun({ brief: 'one run', repo: REPO, workflowDir: FOLDER }));
      const { spans, logs } = await tickTraced();
      const append = spans.find((s) => s.name === 'append' && s.attributes.get('kind') === 'filed');
      assert.ok(append, `no append of a filing among ${spans.map((s) => s.name).join(', ')}`);
      const ancestors = ancestorsOf(append);
      assert.deepEqual(
        ['file', 'fileReady', 'advancePass', 'pass', 'tick'].filter((name) => ancestors.includes(name)),
        ['file', 'fileReady', 'advancePass', 'pass', 'tick'],
        `the runtime's append under the tick's pass: ${ancestors.join(' < ')}`,
      );
      assert.equal(ancestors.indexOf('file') < ancestors.indexOf('pass'), true, 'the runtime under the pass, not around it');
      assert.equal(append.attributes.get('run'), run.id);
      assert.equal(append.attributes.get('step'), 'work');
      assert.equal(typeof append.attributes.get('task'), 'string', 'and its own task beside them');
      const advance = spans.find((s) => s.name === 'advancePass');
      assert.equal(advance?.attributes.get('run'), run.id, 'the pass over a run says which');
      const filed = logs.find((l) => l.text === 'filed');
      assert.ok(filed, `no Debug log of the filing among ${logs.map((l) => l.text).join(', ')}`);
      assert.deepEqual(
        { run: filed.annotations.run, step: filed.annotations.step, kind: filed.annotations.kind },
        { run: run.id, step: 'work', kind: 'filed' },
      );
      assert.equal(typeof filed.annotations.task, 'string');
    },
  );

  await s.test("a called-off run's pass says the runtime's stop of its step under the run, though no filing names the step", async () => {
    const run = await runPlaced(startRun({ brief: 'one run called off', repo: REPO, workflowDir: FOLDER }));
    await tickTraced();
    runStore.runs.cancel(run.id);
    const { logs } = await tickTraced();
    const stopped = logs.find((l) => l.text === 'stop-requested' && l.annotations.task === `${run.id}-work`);
    assert.ok(stopped, `no Debug log of the stop among ${logs.map((l) => l.text).join(', ')}`);
    assert.deepEqual(
      { run: stopped.annotations.run, step: stopped.annotations.step },
      { run: run.id, step: undefined },
      'said outside any filing, so with no step, and under the pass over the run, so with the run',
    );
  });
});

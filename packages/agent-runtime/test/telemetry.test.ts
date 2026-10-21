/**
 * A session's telemetry: an engine given a collector (`telemetry`) hands each spawn the collector, the task's labels with its id, and
 * the trace context of the span that filed it; Claude Code's job reads them in its environment and its background session in its
 * `--settings`; and no child of the engine inherits the engine's own telemetry, so a command exports nothing. Against the real worker,
 * a scratch collector and a stub `claude` on PATH that posts what a session would; no real session runs.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { Engine as EngineService, type HarnessConfig, type TaskView } from '../src/index.ts';
import type { SpawnRequest } from '../src/harness/seam.ts';
import { traceparentOf, withoutTelemetry, type Telemetry } from '../src/harness/telemetry.ts';
import { claudeTelemetryEnv, telemeteredFlags } from '../src/harness/claude/telemetry.ts';
import { CLAUDE_JOB_ENV, claudeDetached, claudeJob, claudeJobSpec } from '../src/harness/claude/code.ts';
import { attachedOptions } from '../src/harness/claude/attached-options.ts';
import { STAND_IN } from './attached-held.ts';
import { claudeArgv, claudeOps } from '../src/harness/claude/bg.ts';
import { commandHarness } from '../src/harness/command/command.ts';
import { asyncOps } from './promise-runner.ts';
import { scratch } from './scratch.ts';
import { builtEngine } from './engine.ts';

type Engine = ReturnType<typeof builtEngine>;

const ENDPOINT = 'http://127.0.0.1:4318';
const TRACE = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-01$/;
const JOB_ID = '6f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f';

/** A spawn of task `t-1` labelled `run` and `step`, told where to export. */
const told: SpawnRequest = {
  name: 'ae/t-1/1',
  brief: 'b',
  cwd: '/r',
  resource: { run: 'r,1', step: 'implement', task: 't-1' },
  traceparent: TRACE,
  telemetry: { endpoint: ENDPOINT },
};

/** Sets `vars` in this process's environment for the rest of test `t`. */
const withEnv = (t: TestContext, vars: Record<string, string>) => {
  const before = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  Object.assign(process.env, vars);
  t.after(() => {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
};

/** The telemetry a process running the engine may carry, every one of which a child must not inherit. */
const ENGINE_OWN = {
  OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:9/the-engine-own',
  OTEL_SERVICE_NAME: 'the-engine',
  OTEL_RESOURCE_ATTRIBUTES: 'who=the-engine',
  TRACEPARENT: '00-ffffffffffffffffffffffffffffffff-ffffffffffffffff-01',
  TRACESTATE: 'a=b',
  CLAUDE_CODE_ENABLE_TELEMETRY: '1',
  CLAUDE_CODE_ENHANCED_TELEMETRY_BETA: '1',
};

test("a child's environment is the engine's less its telemetry: OpenTelemetry's variables, trace context and Claude Code's switches", () => {
  assert.deepEqual(withoutTelemetry({ PATH: '/bin', HOME: '/h', OTELX: 'kept', ...ENGINE_OWN }), {
    PATH: '/bin',
    HOME: '/h',
    OTELX: 'kept',
  });
});

test("a Claude Code session told where to export is handed every signal over OTLP/HTTP JSON, its labels and the filing's trace", () => {
  assert.deepEqual(claudeTelemetryEnv(told), {
    CLAUDE_CODE_ENABLE_TELEMETRY: '1',
    CLAUDE_CODE_ENHANCED_TELEMETRY_BETA: '1',
    OTEL_METRICS_EXPORTER: 'otlp',
    OTEL_LOGS_EXPORTER: 'otlp',
    OTEL_TRACES_EXPORTER: 'otlp',
    OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
    OTEL_EXPORTER_OTLP_ENDPOINT: ENDPOINT,
    OTEL_RESOURCE_ATTRIBUTES: 'run=r%2C1,step=implement,task=t-1',
    TRACEPARENT: TRACE,
  });
  assert.deepEqual(claudeTelemetryEnv({ ...told, telemetry: undefined }), {}, 'told nowhere, it is handed nothing');
});

test("a job is handed its telemetry in its session's environment beside the job's own, and nothing more when told nowhere", () => {
  const laid = (r: SpawnRequest) => {
    const env = attachedOptions(r).env!;
    return Object.fromEntries(Object.entries({ ...CLAUDE_JOB_ENV, ...claudeTelemetryEnv(told) }).map(([k]) => [k, env[k]]));
  };
  assert.deepEqual(laid(told), { ...CLAUDE_JOB_ENV, ...claudeTelemetryEnv(told) }, 'laid on `Options.env` by the job’s own process');
  const nowhere = attachedOptions({ ...told, telemetry: undefined }).env!;
  assert.deepEqual(
    Object.keys(claudeTelemetryEnv(told)).filter((k) => nowhere[k] !== undefined && !(k in process.env)),
    [],
    'told nowhere, the session is handed none of it',
  );
  assert.equal(claudeJob.command(told, { requestFile: '/r.json' }).env, undefined, 'and nothing of it is on the engine’s own child');
});

test("a background session is handed its telemetry in its --settings' env, over the settings it was given, and nothing when told nowhere", () => {
  const settingsOf = (r: SpawnRequest) => {
    const argv = claudeArgv(r, []);
    const at = argv.indexOf('--settings');
    return at < 0 ? undefined : JSON.parse(argv[at + 1]);
  };
  const given = { ...told, config: { claude: { settings: JSON.stringify({ env: { PATH: '/x', TRACEPARENT: 'mine' }, model: 'm' }) } } };
  const off = { autoMemoryEnabled: false };
  assert.deepEqual(settingsOf(given), { env: { PATH: '/x', ...claudeTelemetryEnv(told) }, model: 'm', ...off });
  assert.deepEqual(settingsOf({ ...given, telemetry: undefined }), { env: { PATH: '/x', TRACEPARENT: 'mine' }, model: 'm', ...off });
  assert.deepEqual(settingsOf({ ...told, telemetry: undefined }), off, "no settings given: the session's auto-memory off alone");
  assert.deepEqual(telemeteredFlags({ settings: '/a/settings.json' }, told), { settings: '/a/settings.json' }, 'a file is not rewritten');
});

/** `told`, with the engine's collector asking for its tools' details. */
const detailed: SpawnRequest = { ...told, telemetry: { endpoint: ENDPOINT, toolDetails: true } };

test("a Claude Code session told to say its tools' details is handed OTEL_LOG_TOOL_DETAILS, the one variable more", () => {
  assert.deepEqual(claudeTelemetryEnv(detailed), { ...claudeTelemetryEnv(told), OTEL_LOG_TOOL_DETAILS: '1' });
  assert.equal(Object.keys(claudeTelemetryEnv(detailed)).length, Object.keys(claudeTelemetryEnv(told)).length + 1);
  assert.equal(attachedOptions(detailed).env?.OTEL_LOG_TOOL_DETAILS, '1', "a job's session is handed it too");
});

test("a background session told to say its tools' details is handed OTEL_LOG_TOOL_DETAILS in its --settings' env", () => {
  const given = { ...detailed, config: { claude: { settings: JSON.stringify({ env: { PATH: '/x' }, model: 'm' }) } } };
  const argv = claudeArgv(given, []);
  assert.deepEqual(JSON.parse(argv[argv.indexOf('--settings') + 1]), {
    env: { PATH: '/x', ...claudeTelemetryEnv(told), OTEL_LOG_TOOL_DETAILS: '1' },
    model: 'm',
    autoMemoryEnabled: false,
  });
  assert.deepEqual(
    telemeteredFlags({ settings: '/a/settings.json' }, detailed),
    { settings: '/a/settings.json' },
    'a file is not rewritten',
  );
});

test("a span's trace context is W3C's, and a span whose ids are not trace context's has none", () => {
  const ids = { traceId: '0af7651916cd43dd8448eb211c80319c', spanId: 'b7ad6b7169203331' };
  assert.equal(traceparentOf({ ...ids, sampled: true }), TRACE);
  assert.equal(traceparentOf({ ...ids, sampled: false }), TRACE.replace(/01$/, '00'));
  assert.equal(traceparentOf({ ...ids, traceId: '0'.repeat(32), sampled: true }), undefined);
  assert.equal(traceparentOf({ ...ids, spanId: 'b7ad6b71', sampled: true }), undefined);
});

/** An engine over a scratch store whose one harness, `rec`, records each spawn it is asked and starts nothing. */
const recording = (telemetry?: Telemetry) => {
  const spawns: SpawnRequest[] = [];
  const rec: HarnessConfig = asyncOps({
    async spawn(r) {
      spawns.push(r);
    },
    async observe() {
      return new Map();
    },
    async stop() {},
    async logs() {
      return '';
    },
  });
  const engine = builtEngine(
    EngineService.layer({ root: scratch('ae-telemetry-'), harnesses: { rec }, ...(telemetry ? { telemetry } : {}) }),
  );
  return { engine, spawns };
};

/** Files `labels` on `engine` inside a span of the caller's, ticks it once, and answers the caller's trace id and the task's view. */
const filedUnder = async (engine: Engine, labels?: Record<string, string>) => {
  const filing = Effect.gen(function* () {
    const above = yield* Effect.currentSpan;
    const id = yield* engine.file({ brief: 'b', cwd: '/', harness: 'rec', ...(labels ? { labels } : {}) });
    return { traceId: above.traceId, id };
  }).pipe(Effect.withSpan('the layer above'));
  const { traceId, id } = await Effect.runPromise(filing);
  await Effect.runPromise(engine.tick());
  await Effect.runPromise(engine.tick());
  return { traceId, view: await Effect.runPromise(engine.view(id)), id };
};

test("an engine given a collector hands each spawn it, the task's labels with its id, and a trace context in the filing's trace", async () => {
  const { engine, spawns } = recording({ endpoint: ENDPOINT });
  const { traceId, view, id } = await filedUnder(engine, { run: 'r-1', step: 'implement' });
  assert.equal(spawns.length, 1);
  const [spawn] = spawns;
  assert.deepEqual(spawn.telemetry, { endpoint: ENDPOINT });
  assert.deepEqual(spawn.resource, { run: 'r-1', step: 'implement', task: id });
  assert.equal(spawn.traceparent?.match(TRACEPARENT)?.[1], traceId, "the session joins the filing's trace");
  assert.deepEqual(
    view.state.labels,
    { run: 'r-1', step: 'implement' },
    'the labels are journalled with the task, read back through its store',
  );
  assert.equal(view.state.traceparent, spawn.traceparent);
});

test("an engine given a collector that asks for its tools' details hands each spawn both", async () => {
  const { engine, spawns } = recording({ endpoint: ENDPOINT, toolDetails: true });
  await filedUnder(engine);
  assert.deepEqual(spawns[0].telemetry, { endpoint: ENDPOINT, toolDetails: true });
});

test('an engine given no collector hands a spawn none and journals no trace context, the task id still its resource', async () => {
  const { engine, spawns } = recording();
  const { view, id } = await filedUnder(engine);
  assert.equal(spawns[0].telemetry, undefined);
  assert.equal(spawns[0].traceparent, undefined);
  assert.deepEqual(spawns[0].resource, { task: id });
  assert.equal(view.state.traceparent, undefined);
  assert.equal(view.state.labels, undefined);
});

test('REFUSED: labels no session could say, each in words that name the fix, and nothing filed', async () => {
  const { engine } = recording();
  const refusals: [unknown, string][] = [
    ['run', '`labels: "run"` is not a set of labels. Give an object of names to texts, like { "team": "a" }, or leave it out.'],
    [{ task: 't' }, "the label `task` is the runtime's own, the task's id on its session: give the label another name."],
    [
      { 'service.name': 'x' },
      "the label `service.name` is no label's name. Give a lowercase word of letters, digits and `_`, starting with a letter.",
    ],
    [{ run: '' }, 'the label `run` is "", which is no label\'s value. Give a text of 1 to 256 characters with no control character.'],
    [
      { run: `a${String.fromCharCode(10)}b` },
      'the label `run` is "a\\nb", which is no label\'s value. Give a text of 1 to 256 characters with no control character.',
    ],
    [{ run: 1 }, "the label `run` is 1, which is no label's value. Give a text of 1 to 256 characters with no control character."],
    [Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`l${i}`, 'v'])), '`labels` has 17 entries: give at most 16.'],
  ];
  for (const [labels, words] of refusals) {
    await assert.rejects(
      Effect.runPromise(engine.file({ brief: 'b', cwd: '/', harness: 'rec', labels: labels as never })),
      (err: Error) => {
        assert.equal(err.message, words);
        return true;
      },
    );
  }
  assert.deepEqual((await Effect.runPromise(engine.list())).views, [], 'nothing filed');
});

test('REFUSED: a collector that is no absolute http(s) URL, before the engine is built', () => {
  for (const telemetry of [{ endpoint: 'localhost:4318' }, { endpoint: '' }, { endpoint: 'file:///tmp/x' }, 'http://localhost:4318']) {
    assert.throws(
      () => builtEngine(EngineService.layer({ root: scratch('ae-telemetry-'), telemetry: telemetry as never })),
      (err: Error) => {
        assert.equal(
          err.message,
          `\`telemetry: ${JSON.stringify(telemetry)}\` names no collector. Give \`{ endpoint }\`, the absolute http(s) URL of an OTLP/HTTP collector, like http://localhost:4318, or leave it out for no export.`,
        );
        return true;
      },
    );
  }
});

test("REFUSED: a collector's toolDetails that is not true, before the engine is built", () => {
  for (const toolDetails of [false, 1, 'yes']) {
    const telemetry = { endpoint: ENDPOINT, toolDetails };
    assert.throws(
      () => builtEngine(EngineService.layer({ root: scratch('ae-telemetry-'), telemetry: telemetry as never })),
      (err: Error) => {
        assert.equal(
          err.message,
          `\`telemetry: ${JSON.stringify(telemetry)}\` asks for its tools' details with ${JSON.stringify(toolDetails)}. Give \`toolDetails: true\` for a session to export its tools' inputs, or leave it out.`,
        );
        return true;
      },
    );
  }
});

/** Ticks until the task has settled, under a bound of passes. */
const settled = async (e: Engine, id: string): Promise<TaskView> => {
  for (let i = 0; i < 400; i++) {
    await Effect.runPromise(e.tick());
    const v = await Effect.runPromise(e.view(id));
    if (v.state.settled !== null) return v;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`${id} never settled`);
};

/** A collector on a free port of this machine, keeping the body of every request posted to it; closed when test `t` ends. */
const collector = async (t: TestContext) => {
  const posts: { path: string; body: unknown }[] = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      posts.push({ path: req.url ?? '', body: JSON.parse(body) });
      res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const { port } = server.address() as { port: number };
  return { endpoint: `http://127.0.0.1:${port}`, posts };
};

/**
 * The stand-in Claude Code a job's own process runs on the Agent SDK (`fixtures/stand-in-claude.ts`), named as the engine's
 * `claudeExecutable` by the spec this answers: it writes the environment it was started with to `env.json`, and posts one
 * `api_request` log to `$OTEL_EXPORTER_OTLP_ENDPOINT/v1/logs` with the resource `OTEL_RESOURCE_ATTRIBUTES` says and the trace
 * `TRACEPARENT` names, as Claude Code does. `env` answers the telemetry variables and `TASK_FILES` it saw, and nothing else.
 */
const standInClaude = () => {
  const dir = scratch('ae-telemetry-standin-');
  const env = { STANDIN_DIR: dir, STANDIN_PLAN: JSON.stringify({ id: JOB_ID }), STANDIN_POST_LOG: '1' };
  return {
    harness: claudeJobSpec(STAND_IN),
    env,
    saw: () =>
      Object.fromEntries(
        Object.entries(JSON.parse(fs.readFileSync(path.join(dir, 'env.json'), 'utf8')) as Record<string, string>).filter(([k]) =>
          /^(OTEL_|TRACE|CLAUDE_CODE_ENABLE_TELEMETRY$|CLAUDE_CODE_ENHANCED_TELEMETRY_BETA$|CLAUDE_CODE_DISABLE_BACKGROUND_TASKS$|TASK_FILES$)/.test(
            k,
          ),
        ),
      ),
  };
};

test("a job exports to the engine's collector, tagged with its labels and task, in the filing's trace — never as the engine", async (t) => {
  withEnv(t, ENGINE_OWN);
  const { endpoint, posts } = await collector(t);
  const claude = standInClaude();
  const engine = builtEngine(
    EngineService.layer({ root: scratch('ae-telemetry-'), harnesses: { job: claude.harness }, telemetry: { endpoint } }),
  );
  const { id, traceId } = await Effect.runPromise(
    Effect.gen(function* () {
      const above = yield* Effect.currentSpan;
      const filed = yield* engine.file({
        brief: 'b',
        cwd: scratch('ae-telemetry-cwd-'),
        harness: 'job',
        config: { env: claude.env },
        labels: { run: 'r,1', step: 'implement' },
      });
      return { id: filed, traceId: above.traceId };
    }).pipe(Effect.withSpan('the layer above')),
  );
  assert.equal((await settled(engine, id)).state.settled, 'succeeded');
  assert.deepEqual(posts, [
    {
      path: '/v1/logs',
      body: {
        resourceLogs: [
          {
            resource: {
              attributes: [
                { key: 'run', value: { stringValue: 'r,1' } },
                { key: 'step', value: { stringValue: 'implement' } },
                { key: 'task', value: { stringValue: id } },
              ],
            },
            scopeLogs: [{ logRecords: [{ body: { stringValue: 'api_request' }, traceId }] }],
          },
        ],
      },
    },
  ]);
  const seen = claude.saw();
  assert.equal(seen.OTEL_EXPORTER_OTLP_ENDPOINT, endpoint);
  assert.equal(seen.OTEL_SERVICE_NAME, undefined, "the engine's own service name never reaches a session");
  assert.equal(seen.TRACESTATE, undefined);
});

test("a job of an engine given no collector is handed no telemetry, the engine's own included, and posts nothing", async (t) => {
  withEnv(t, ENGINE_OWN);
  const { posts } = await collector(t);
  const claude = standInClaude();
  const engine = builtEngine(EngineService.layer({ root: scratch('ae-telemetry-'), harnesses: { job: claude.harness } }));
  const id = await Effect.runPromise(
    engine.file({ brief: 'b', cwd: scratch('ae-telemetry-cwd-'), harness: 'job', config: { env: claude.env } }),
  );
  assert.equal((await settled(engine, id)).state.settled, 'succeeded');
  assert.deepEqual(claude.saw(), { CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1' });
  assert.deepEqual(posts, []);
});

test("a job's own env reaches its claude, laid under the job's: a task cannot turn background tasks back on", async () => {
  const claude = standInClaude();
  const files = scratch('ae-telemetry-files-');
  const engine = builtEngine(EngineService.layer({ root: scratch('ae-telemetry-'), harnesses: { job: claude.harness } }));
  const id = await Effect.runPromise(
    engine.file({
      brief: 'b',
      cwd: scratch('ae-telemetry-cwd-'),
      harness: 'job',
      config: { env: { ...claude.env, TASK_FILES: files, CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '0' } },
    }),
  );
  assert.equal((await settled(engine, id)).state.settled, 'succeeded');
  assert.deepEqual(claude.saw(), { TASK_FILES: files, CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1' });
});

test("a claude-detached task's own env reaches its command, laid under the job's", () => {
  const env = claudeDetached.command({ ...told, config: { env: { X: '1', CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '0' } } }).env;
  assert.equal(env?.X, '1');
  assert.equal(env?.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS, '1');
});

test("a command of an engine given a collector is handed no telemetry, the engine's own included; its own env still reaches it", async (t) => {
  withEnv(t, ENGINE_OWN);
  const engine = builtEngine(
    EngineService.layer({ root: scratch('ae-telemetry-'), harnesses: { command: commandHarness }, telemetry: { endpoint: ENDPOINT } }),
  );
  const command = ['sh', '-c', 'env | grep -E "^(OTEL_|TRACE|CLAUDE_CODE_ENABLE_TELEMETRY|CLAUDE_CODE_ENHANCED_TELEMETRY_BETA)" | sort'];
  const id = await Effect.runPromise(
    engine.file({
      brief: 'b',
      cwd: scratch('ae-telemetry-cwd-'),
      harness: 'command',
      labels: { run: 'r-1' },
      config: { command, env: { OTEL_OWN: 'mine' } },
    }),
  );
  assert.equal((await settled(engine, id)).state.settled, 'succeeded');
  assert.equal(await Effect.runPromise(engine.output(id, 'stdout')), 'OTEL_OWN=mine\n');
});

test("a background session's claude inherits none of the engine's telemetry: what it exports, its --settings' env alone says", async (t) => {
  withEnv(t, { ...ENGINE_OWN, SPAWN_OWN: 'mine' });
  const bin = scratch('ae-telemetry-bin-');
  const seen = path.join(bin, 'env');
  fs.writeFileSync(path.join(bin, 'claude'), `#!/bin/sh\nif [ "$1" = agents ]; then echo '[]'; exit 0; fi\nenv > '${seen}'\n`, {
    mode: 0o755,
  });
  withEnv(t, { PATH: `${bin}:${process.env.PATH}` });
  await Effect.runPromise(claudeOps({ root: scratch('ae-telemetry-') }).spawn({ ...told, cwd: scratch('ae-telemetry-cwd-') }));
  const keys = fs
    .readFileSync(seen, 'utf8')
    .split('\n')
    .map((line) => line.slice(0, line.indexOf('=')));
  assert.ok(keys.includes('SPAWN_OWN'), "the engine's own environment still reaches it");
  assert.deepEqual(
    keys.filter((k) => k in ENGINE_OWN),
    [],
  );
});

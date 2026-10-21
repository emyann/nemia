/**
 * What the client's engine hands the runtime, walked on the shipped engine: the collector the process exports to (`otlpOf`), none when
 * it exports nowhere, and its sessions' tools' inputs asked for only when `NEMIA_TOOL_DETAILS` is `1` (`sessionTelemetryOf`), which a stub
 * `claude` on PATH reads back, and said on stderr for a value that asks nothing (`toolDetailsRefusalOf`).
 *
 * - the client's engine is handed the collector the process exports to: the shipped engine files a task on the shipped `check` harness.
 * - the client's engine of a process that exports nowhere is handed no collector: the same, with no trace.
 * - the client's engine asks a session for its tools' details when NEMIA_TOOL_DETAILS is 1: a real process, the stub `claude` started.
 *
 * The test place does not model the shipped engine nor a process. `WF_ROOT` is set before the client is imported: it is read as the
 * module loads.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { scratch } from './scratch.ts';
import { until, WAITED } from 'agent-runtime/testing';

const ROOT = scratch('wf-step-labels-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const { engine: clientEngine } = await import('../src/runtime-client.ts');

/** The engine the client builds, as this file's helpers hand it about. */
type ClientEngine = ReturnType<typeof clientEngine>;

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
 * Asks task `id` to stop when test `t` ends, and takes a task that has already settled for the end the stop was asked for: the engine
 * refuses a stop of a settled task by contract, and a teardown that tidies up after a test is no place to fail on it. A `StopRefused`
 * of a task that has not settled still fails the test.
 */
const stoppedAfter = (t: TestContext, e: ClientEngine, id: string) =>
  t.after(() =>
    Effect.runPromise(
      e
        .stop(id)
        .pipe(
          Effect.catchTag('StopRefused', (refused) =>
            e.view(id).pipe(Effect.flatMap((view) => (view.state.settled ? Effect.void : Effect.fail(refused)))),
          ),
        ),
    ),
  );

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
  stoppedAfter(t, e, id);
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
  return { env: JSON.parse(fs.readFileSync(seen, 'utf8')) as Record<string, string>, e, id };
};

/** Ticks engine `e` in test `t` until task `id` has settled, whatever it settled as. */
const settle = (t: TestContext, e: ClientEngine, id: string) =>
  until(
    t,
    async () => {
      await Effect.runPromise(e.tick());
      return (await Effect.runPromise(e.view(id))).state.settled;
    },
    `task ${id} settled`,
    { everyMs: 50 },
  );

test(
  "the client's engine asks a session for its tools' details when NEMIA_TOOL_DETAILS is 1, never by default, and says a value that asks nothing",
  WAITED,
  async (t) => {
    await t.test('asked', async (t) => {
      const { env } = await jobTelemetry(t, '1');
      assert.equal(env.OTEL_EXPORTER_OTLP_ENDPOINT, 'http://127.0.0.1:9');
      assert.equal(env.OTEL_LOG_TOOL_DETAILS, '1');
    });
    await t.test('unset', async (t) => {
      const { env } = await jobTelemetry(t, undefined);
      assert.equal(env.OTEL_EXPORTER_OTLP_ENDPOINT, 'http://127.0.0.1:9');
      assert.equal(env.OTEL_LOG_TOOL_DETAILS, undefined);
    });
    await t.test('settled before its teardown', async (t) => {
      const { env, e, id } = await jobTelemetry(t, '1');
      assert.equal(env.OTEL_LOG_TOOL_DETAILS, '1');
      await settle(t, e, id);
    });
    await t.test('refused', async (t) => {
      const said = t.mock.method(console, 'error', () => {});
      const { env } = await jobTelemetry(t, 'true');
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

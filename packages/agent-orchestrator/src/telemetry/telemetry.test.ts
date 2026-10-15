/**
 * The daemon's telemetry: whether the environment asks for an OTLP export (`otlpOf`), what its sessions export (`sessionTelemetryOf`,
 * `toolDetailsRefusalOf`), a log as `nemia up` prints it (`lineOf`), and the
 * layer (`telemetryLayer`), which exports spans, logs and metrics to a collector only when one is named — proven against a scratch
 * collector that counts what it is posted, and refused with none named by what the layer puts in the context and posts.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { Effect, Logger, Metric } from 'effect';
import { OtlpExporter } from 'effect/observability';
import { TestClock } from 'effect/testing';
import {
  DEFAULT_SERVICE_NAME,
  lineOf,
  logsUrl,
  metricsUrl,
  otlpOf,
  sessionTelemetryOf,
  toolDetailsRefusalOf,
  tracesUrl,
} from './telemetry.ts';
import { PASS_METRICS, recordStepMetrics } from '../meter/meter.verb.ts';
import { EXPORT_BOUND_MS, exportedNow, lineLogger, seriesBorn, telemetryLayer } from './telemetry.store.ts';
import { collector, seriesOf, type Attributes } from '../../test/collector.ts';

test('otlpOf: no export without an endpoint, or with a blank one; its endpoint, and its service: nemia unless named', () => {
  assert.equal(otlpOf({}), undefined);
  assert.equal(otlpOf({ OTEL_EXPORTER_OTLP_ENDPOINT: '' }), undefined);
  assert.equal(otlpOf({ OTEL_EXPORTER_OTLP_ENDPOINT: '  ' }), undefined);
  assert.equal(otlpOf({ OTEL_SERVICE_NAME: 'mine' }), undefined, 'a service name alone asks for no export');
  assert.deepEqual(otlpOf({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318/' }), {
    url: 'http://localhost:4318',
    serviceName: DEFAULT_SERVICE_NAME,
  });
  assert.equal(DEFAULT_SERVICE_NAME, 'nemia');
  const named = otlpOf({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318', OTEL_SERVICE_NAME: 'factory' })!;
  assert.deepEqual(named, { url: 'http://collector:4318', serviceName: 'factory' });
  assert.equal(tracesUrl(named), 'http://collector:4318/v1/traces');
  assert.equal(logsUrl(named), 'http://collector:4318/v1/logs');
  assert.equal(metricsUrl(named), 'http://collector:4318/v1/metrics');
});

test("sessionTelemetryOf: no export without an endpoint; the endpoint alone by default; the tools' details only when asked by 1", () => {
  const endpoint = { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318/' };
  assert.equal(sessionTelemetryOf({}), undefined);
  assert.equal(sessionTelemetryOf({ NEMIA_TOOL_DETAILS: '1' }), undefined, "the tools' details alone ask for no export");
  assert.deepEqual(sessionTelemetryOf(endpoint), { endpoint: 'http://localhost:4318' });
  for (const asked of ['1', ' 1 '])
    assert.deepEqual(sessionTelemetryOf({ ...endpoint, NEMIA_TOOL_DETAILS: asked }), {
      endpoint: 'http://localhost:4318',
      toolDetails: true,
    });
  for (const not of ['0', '', 'true'])
    assert.deepEqual(sessionTelemetryOf({ ...endpoint, NEMIA_TOOL_DETAILS: not }), { endpoint: 'http://localhost:4318' }, not);
});

test('REFUSED: a NEMIA_TOOL_DETAILS that is neither unset, blank, 0 nor 1, in words that name the fix', () => {
  for (const fine of [undefined, '', ' ', '0', '1', ' 1 '])
    assert.equal(toolDetailsRefusalOf({ NEMIA_TOOL_DETAILS: fine }), undefined, fine);
  assert.equal(toolDetailsRefusalOf({}), undefined);
  for (const wrong of ['true', 'yes'])
    assert.equal(
      toolDetailsRefusalOf({ NEMIA_TOOL_DETAILS: wrong }),
      `NEMIA_TOOL_DETAILS is ${JSON.stringify(wrong)}, which asks nothing: set it to 1 for each session to export its tools' inputs, or unset it. Their tools' details are left off.`,
    );
});

test('lineOf: the time in UTC, two spaces, then the message, its parts joined by a space', () => {
  const at = new Date('2026-10-05T08:09:10.123Z');
  assert.equal(lineOf(['r-1  filed implement'], at), '08:09:10  r-1  filed implement');
  assert.equal(lineOf('the store is resumed', at), '08:09:10  the store is resumed');
  assert.equal(lineOf(['passes', 3, { slow: true }], at), '08:09:10  passes 3 {"slow":true}');
});

/** What `fn` printed through `console.log` and `console.error`, each line by line. */
const printed = async (t: TestContext, fn: () => Promise<unknown>): Promise<{ out: string[]; err: string[] }> => {
  const out: string[] = [];
  const err: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => void out.push(args.join(' ')));
  const error = t.mock.method(console, 'error', (...args: unknown[]) => void err.push(args.join(' ')));
  try {
    await fn();
  } finally {
    log.mock.restore();
    error.mock.restore();
  }
  return { out, err };
};

test('the layer prints Info on stdout and Warn and above on stderr, as their lines, the annotations unprinted', async (t) => {
  const said = await printed(t, () =>
    Effect.runPromise(
      Effect.gen(function* () {
        yield* Effect.logInfo('r-1  filed implement');
        yield* Effect.logWarning('left out: a journal');
        yield* Effect.logError('the feed failed');
        yield* Effect.logDebug('below the level');
      }).pipe(Effect.annotateLogs({ run: 'r-1' }), Effect.provide(telemetryLayer({}))),
    ),
  );
  assert.deepEqual(
    said.out.map((l) => l.slice(8)),
    ['  r-1  filed implement'],
  );
  assert.match(said.out[0], /^\d\d:\d\d:\d\d {2}r-1/);
  assert.deepEqual(
    said.err.map((l) => l.slice(8)),
    ['  left out: a journal', '  the feed failed'],
  );
});

test("REFUSED: no endpoint, no export — the tracer is Effect's own, and the line logger is the only logger", async () => {
  const native = await Effect.runPromise(Effect.tracer);
  const read = await Effect.runPromise(
    Effect.gen(function* () {
      return { tracer: yield* Effect.tracer, loggers: yield* Effect.service(Logger.CurrentLoggers) };
    }).pipe(Effect.provide(telemetryLayer({ OTEL_SERVICE_NAME: 'nemia' }))),
  );
  assert.equal(read.tracer, native, 'the tracer is the one a program has with no layer');
  assert.deepEqual([...read.loggers], [lineLogger]);
  const exported = await Effect.runPromise(
    Effect.gen(function* () {
      return { tracer: yield* Effect.tracer, loggers: yield* Effect.service(Logger.CurrentLoggers) };
    }).pipe(Effect.provide(telemetryLayer({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:9' }))),
  );
  assert.notEqual(exported.tracer, native, 'an endpoint puts the OTLP tracer in its place');
  assert.equal(exported.loggers.size, 2, 'and an OTLP logger beside the line logger');
  assert.ok(exported.loggers.has(lineLogger));
});

test('with an endpoint, a span and a log reach the collector, under the service named, and the log is printed too', async (t) => {
  const c = await collector(t);
  const traced = c.posted('/v1/traces', '"tick"');
  const logged = c.posted('/v1/logs', 'a pass said');
  const tick = Effect.fn('tick')(function* () {
    yield* Effect.logInfo('a pass said');
  });
  const said = await printed(t, () =>
    Effect.runPromise(tick().pipe(Effect.provide(telemetryLayer({ OTEL_EXPORTER_OTLP_ENDPOINT: c.url, OTEL_SERVICE_NAME: 'factory' })))),
  );
  assert.deepEqual(
    said.out.map((l) => l.slice(8)),
    ['  a pass said'],
  );
  assert.match(await traced, /"factory"/);
  assert.match(await logged, /"factory"/);
});

/** A pass's time put into `pass.duration`, as the tick does, answering `value`. */
const passed = <A>(value: A) => Metric.update(PASS_METRICS.duration, 42).pipe(Effect.as(value));

test("with an endpoint, the registry's metrics reach the collector's /v1/metrics before the program ends, under the service named", async (t) => {
  const c = await collector(t);
  const env = { OTEL_EXPORTER_OTLP_ENDPOINT: c.url, OTEL_SERVICE_NAME: 'factory' };
  assert.equal(await Effect.runPromise(passed('ran').pipe(Effect.provide(telemetryLayer(env)))), 'ran');
  const body = c.posts.find((p) => p.path === '/v1/metrics' && p.body.includes('"pass.duration"'))?.body;
  assert.ok(body, `pass.duration was posted to /v1/metrics as the layer closed: ${JSON.stringify(c.posts.map((p) => p.path))}`);
  assert.match(body, /"factory"/);
  assert.match(body, /"aggregationTemporality":2/, 'cumulative, as Prometheus behind the collector reads it');
});

test("REFUSED: no endpoint in the env the layer is given, no metric posted — not even to one the process's own environment names", async (t) => {
  const c = await collector(t);
  const before = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = c.url;
  t.after(() => {
    if (before === undefined) delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    else process.env.OTEL_EXPORTER_OTLP_ENDPOINT = before;
  });
  assert.equal(await Effect.runPromise(passed('ran').pipe(Effect.provide(telemetryLayer({ OTEL_SERVICE_NAME: 'nemia' })))), 'ran');
  assert.deepEqual(
    c.posts.filter((p) => p.path === '/v1/metrics'),
    [],
  );
});

test('a collector that does not answer costs the metrics their post, never the program', async () => {
  const env = { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:9' };
  assert.equal(await Effect.runPromise(passed('ran').pipe(Effect.provide(telemetryLayer(env)))), 'ran');
});

/** Whether a point's attributes name `factory`. */
const ofFactory = (factory: string) => (attributes: Attributes) =>
  attributes.some((a) => a.key === 'factory' && a.value.stringValue === factory);

test("a step's first try reaches the collector as two posts: each of its series at zero, then at its value, before the program ends", async (t) => {
  const c = await collector(t);
  const factory = 'born-at-zero';
  const attributes = { factory, workflow: 'build', step: 'work', agent: 'ada', outcome: 'done' };
  const fact = { metric: 'try', attributes, costUsd: 1.25, inputTokens: 1200, outputTokens: 300, ms: 300_000 } as const;
  const posts = await Effect.runPromise(
    recordStepMetrics([fact]).pipe(
      Effect.andThen(Effect.sync(() => c.posts.filter((p) => p.path === '/v1/metrics' && p.body.includes(factory)).map((p) => p.body))),
      Effect.provide(telemetryLayer({ OTEL_EXPORTER_OTLP_ENDPOINT: c.url })),
    ),
  );
  assert.deepEqual(
    posts.map((body) => seriesOf(body, ofFactory(factory))),
    [
      { 'step.tries': 0, 'step.duration': 0, 'step.cost': 0, 'step.tokens.input': 0, 'step.tokens.output': 0 },
      { 'step.tries': 1, 'step.duration': 1, 'step.cost': 1.25, 'step.tokens.input': 1200, 'step.tokens.output': 300 },
    ],
    'both posted by the time its facts are recorded, neither left to the 10 s interval nor to the closing export',
  );
});

test('REFUSED: an export that never ends holds its caller for the bound and no longer, and a process that exports nothing waits for none', async () => {
  await Effect.runPromise(exportedNow);
  const hung = OtlpExporter.Flusher.of({ flush: Effect.never, register: () => Effect.void });
  const ended = await Effect.runPromise(
    Effect.gen(function* () {
      const waiting = yield* Effect.forkChild(exportedNow.pipe(Effect.provideService(OtlpExporter.Flusher, hung)));
      yield* TestClock.adjust(EXPORT_BOUND_MS - 1);
      const before = waiting.pollUnsafe() !== undefined;
      yield* TestClock.adjust(1);
      return { before, after: waiting.pollUnsafe() !== undefined };
    }).pipe(Effect.provide(TestClock.layer())),
  );
  assert.deepEqual(ended, { before: false, after: true });
});

/** A series of a test's own, by `born`, the attribute no other series carries. */
const own = (attributes: Attributes) => attributes.some((a) => a.key === 'born');

/** Each post to `/v1/metrics` that names one of the test's own series, read as `seriesOf` reads it, consecutive repeats collapsed. */
const ownPosts = (posts: readonly { path: string; body: string }[]) =>
  posts
    .filter((p) => p.path === '/v1/metrics' && p.body.includes('"born"'))
    .map((p) => seriesOf(p.body, own))
    .filter((read, i, all) => i === 0 || JSON.stringify(read) !== JSON.stringify(all[i - 1]));

test('a series born reaches the collector at zero, counter and histogram alike, then at its value, both before the program ends', async (t) => {
  const c = await collector(t);
  const counter = Metric.withAttributes(Metric.counter('test.born.counter', { incremental: true }), { born: 'wire' });
  const histogram = Metric.withAttributes(Metric.histogram('test.born.histogram', { boundaries: [1, 10] }), { born: 'wire' });
  const posts = await Effect.runPromise(
    Effect.gen(function* () {
      yield* seriesBorn([counter, histogram]);
      yield* Metric.update(counter, 3);
      yield* Metric.update(histogram, 5);
      yield* exportedNow;
      return ownPosts(c.posts);
    }).pipe(Effect.provide(telemetryLayer({ OTEL_EXPORTER_OTLP_ENDPOINT: c.url }))),
  );
  assert.deepEqual(
    posts,
    [
      { 'test.born.counter': 0, 'test.born.histogram': 0 },
      { 'test.born.counter': 3, 'test.born.histogram': 1 },
    ],
    'both posted by the time the program has asked for them, neither left to the 10 s interval nor to the closing export',
  );
});

test('a process started again brings each series it births back at zero, so a value at or above the last one before is read as a reset', async (t) => {
  const c = await collector(t);
  const series = Metric.withAttributes(Metric.counter('test.born.restarted', { incremental: true }), { born: 'restart' });
  const lived = (values: number) =>
    Effect.gen(function* () {
      yield* seriesBorn([series]);
      for (let i = 0; i < values; i++) yield* Metric.update(series, 1);
      yield* exportedNow;
    }).pipe(
      Effect.provide(telemetryLayer({ OTEL_EXPORTER_OTLP_ENDPOINT: c.url })),
      Effect.provideService(Metric.MetricRegistry, new Map()),
    );
  await Effect.runPromise(lived(5));
  await Effect.runPromise(lived(7));
  assert.deepEqual(
    ownPosts(c.posts).map((read) => read['test.born.restarted']),
    [0, 5, 0, 7],
    'the second process falls to zero before it climbs past the first',
  );
});

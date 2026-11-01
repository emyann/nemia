/**
 * The daemon's telemetry. One story, "Telemetry reaches a collector": a scratch collector in this process that keeps what it is posted
 * (`test/collector.ts`), and the layer (`telemetryLayer`) given an environment with no endpoint — its lines printed, nothing exported, not
 * even to a collector the process's own environment names — then one naming the collector: spans, logs and metrics posted under the
 * service named, a step's series and a series born first at zero then at their value, a process started again born at zero again; and
 * a collector that does not answer, which costs a post and the bound of a wait, never the program. Then a table per pure function:
 * whether an environment asks for an OTLP export and how often (`otlpOf`, `exportIntervalRefusalOf`), what its sessions export
 * (`sessionTelemetryOf`, `toolDetailsRefusalOf`), and a log as `nemia up` prints it (`lineOf`). That the shipped engine is handed them is
 * `test/step-labels.boundary.test.ts`'s.
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
  EXPORT_INTERVALS,
  exportIntervalRefusalOf,
  otlpOf,
  sessionTelemetryOf,
  toolDetailsRefusalOf,
  tracesUrl,
} from './telemetry.ts';
import { PASS_METRICS, recordStepMetrics } from '../meter/meter.verb.ts';
import { EXPORT_BOUND_MS, exportedNow, lineLogger, seriesBorn, telemetryLayer } from './telemetry.store.ts';
import { collector, seriesOf, type Attributes } from '../../test/collector.ts';
import { story } from '../../test/checkpoints.ts';
import { steeredClock } from '../../test/steered.ts';
import { until, WAITED, type Waiter } from 'agent-runtime/testing';

/** A row of a table: its name, and what it holds. */
type Row = { name: string; check: () => void };

/** A collector on a port nobody listens on: every post to it fails. */
const DEAF = 'http://127.0.0.1:9';

/**
 * `program` run to its end on a steered clock: each exporter's flush as its layer closes is bounded by Effect's shutdown timeout, 3 s
 * by default (`OtlpTracer`, `OtlpLogger`, `OtlpMetrics`), which a collector that does not answer waits out; so each such rest is waited
 * for as it is asked, then moved past, a millisecond short and then the millisecond, never waited on the wall clock.
 */
const steered = async <A>(t: Waiter, program: Effect.Effect<A>): Promise<A> => {
  const clock = steeredClock();
  let done = false;
  const ran = Effect.runPromise(program.pipe(Effect.provide(clock.layer))).finally(() => {
    done = true;
    clock.bell.ring();
  });
  for (let moved = 0; ; moved++) {
    await until(t, () => done || clock.asked.filter((ms) => ms === 3000).length > moved, 'an exporter asks its shutdown rest', {
      bell: clock.bell,
    });
    if (done) return ran;
    await clock.adjust(2999);
    await clock.adjust(1);
  }
};

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

/** A pass's time put into `pass.duration`, as the tick does, answering `value`. */
const passed = <A>(value: A) => Metric.update(PASS_METRICS.duration, 42).pipe(Effect.as(value));

/** The tracer and the loggers a program is given. */
const given = Effect.gen(function* () {
  return { tracer: yield* Effect.tracer, loggers: yield* Effect.service(Logger.CurrentLoggers) };
});

/** Whether a point's attributes name `factory`. */
const ofFactory = (factory: string) => (attributes: Attributes) =>
  attributes.some((a) => a.key === 'factory' && a.value.stringValue === factory);

/** Whether a point is of a series born by this story under `born`. */
const bornAs = (born: string) => (attributes: Attributes) => attributes.some((a) => a.key === 'born' && a.value.stringValue === born);

/** Each of `posts` to `/v1/metrics` that names a series born under `born`, read as `seriesOf` reads it, consecutive repeats collapsed. */
const bornPosts = (posts: readonly { path: string; body: string }[], born: string) =>
  posts
    .filter((p) => p.path === '/v1/metrics' && p.body.includes(`"${born}"`))
    .map((p) => seriesOf(p.body, bornAs(born)))
    .filter((read, i, all) => i === 0 || JSON.stringify(read) !== JSON.stringify(all[i - 1]));

test(
  'Telemetry reaches a collector: printed with no endpoint and exported nowhere; spans, logs and metrics posted under the service with one; series born at zero; a deaf collector bounded',
  WAITED,
  async (t) => {
    const s = story(t);
    const c = await collector(t);
    const endpointBefore = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    t.after(() => {
      if (endpointBefore === undefined) delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
      else process.env.OTEL_EXPORTER_OTLP_ENDPOINT = endpointBefore;
    });

    await s.test(
      'with no endpoint, the layer prints Info on stdout and Warn and above on stderr, as their lines, the annotations unprinted',
      async (sub) => {
        const said = await printed(sub, () =>
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
      },
    );

    await s.test(
      "REFUSED: no endpoint in the env the layer is given, no export: Effect's own tracer, the line logger alone, and nothing posted, not even to the collector the process's own environment names",
      async () => {
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT = c.url;
        const native = await Effect.runPromise(Effect.tracer);
        const read = await Effect.runPromise(given.pipe(Effect.provide(telemetryLayer({ OTEL_SERVICE_NAME: 'nemia' }))));
        assert.equal(read.tracer, native, 'the tracer is the one a program has with no layer');
        assert.deepEqual([...read.loggers], [lineLogger]);
        assert.equal(await Effect.runPromise(passed('ran').pipe(Effect.provide(telemetryLayer({ OTEL_SERVICE_NAME: 'nemia' })))), 'ran');
        assert.deepEqual(c.posts, []);
      },
    );

    await s.test(
      'with an endpoint, a span and a log reach the collector, under the service named, and the log is printed too',
      async (sub) => {
        const traced = c.posted('/v1/traces', '"tick"');
        const logged = c.posted('/v1/logs', 'a pass said');
        const tick = Effect.fn('tick')(function* () {
          yield* Effect.logInfo('a pass said');
        });
        const said = await printed(sub, () =>
          Effect.runPromise(
            tick().pipe(Effect.provide(telemetryLayer({ OTEL_EXPORTER_OTLP_ENDPOINT: c.url, OTEL_SERVICE_NAME: 'factory' }))),
          ),
        );
        assert.deepEqual(
          said.out.map((l) => l.slice(8)),
          ['  a pass said'],
        );
        assert.match(await traced, /"factory"/);
        assert.match(await logged, /"factory"/);
      },
    );

    await s.test("the registry's metrics reach its /v1/metrics before the program ends, cumulative, under the service named", async () => {
      const from = c.posts.length;
      const env = { OTEL_EXPORTER_OTLP_ENDPOINT: c.url, OTEL_SERVICE_NAME: 'metered' };
      assert.equal(await Effect.runPromise(passed('ran').pipe(Effect.provide(telemetryLayer(env)))), 'ran');
      const posts = c.posts.slice(from);
      const body = posts.find((p) => p.path === '/v1/metrics' && p.body.includes('"pass.duration"'))?.body;
      assert.ok(body, `pass.duration was posted to /v1/metrics as the layer closed: ${JSON.stringify(posts.map((p) => p.path))}`);
      assert.match(body, /"metered"/);
      assert.match(body, /"aggregationTemporality":2/, 'cumulative, as Prometheus behind the collector reads it');
    });

    await s.test(
      "a step's first try reaches it as two posts: each of its series at zero, then at its value, before the program ends",
      async () => {
        const factory = 'born-at-zero';
        const attributes = { factory, workflow: 'build', step: 'work', agent: 'ada', outcome: 'done' };
        const fact = { metric: 'try', attributes, costUsd: 1.25, inputTokens: 1200, outputTokens: 300, ms: 300_000 } as const;
        const posts = await Effect.runPromise(
          recordStepMetrics([fact]).pipe(
            Effect.andThen(
              Effect.sync(() => c.posts.filter((p) => p.path === '/v1/metrics' && p.body.includes(factory)).map((p) => p.body)),
            ),
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
      },
    );

    await s.test(
      'a series born reaches it at zero, counter and histogram alike, then at its value, both before the program ends',
      async () => {
        const counter = Metric.withAttributes(Metric.counter('test.born.counter', { incremental: true }), { born: 'wire' });
        const histogram = Metric.withAttributes(Metric.histogram('test.born.histogram', { boundaries: [1, 10] }), { born: 'wire' });
        const posts = await Effect.runPromise(
          Effect.gen(function* () {
            yield* seriesBorn([counter, histogram]);
            yield* Metric.update(counter, 3);
            yield* Metric.update(histogram, 5);
            yield* exportedNow;
            return bornPosts(c.posts, 'wire');
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
      },
    );

    await s.test(
      'a process started again brings each series it births back at zero, so a value at or above the last one before is read as a reset',
      async () => {
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
          bornPosts(c.posts, 'restart').map((read) => read['test.born.restarted']),
          [0, 5, 0, 7],
          'the second process falls to zero before it climbs past the first',
        );
      },
    );

    await s.test(
      'a collector that does not answer costs the metrics their post, never the program: its OTLP tracer and logger are given all the same',
      async (sub) => {
        const native = await Effect.runPromise(Effect.tracer);
        const exported = await steered(
          sub,
          passed(given).pipe(Effect.flatten, Effect.provide(telemetryLayer({ OTEL_EXPORTER_OTLP_ENDPOINT: DEAF }))),
        );
        assert.notEqual(exported.tracer, native, 'an endpoint puts the OTLP tracer in its place');
        assert.equal(exported.loggers.size, 2, 'and an OTLP logger beside the line logger');
        assert.ok(exported.loggers.has(lineLogger));
      },
    );

    await s.test(
      'REFUSED: an export that never ends holds its caller for the bound and no longer, and a process that exports nothing waits for none',
      async () => {
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
      },
    );
  },
);

/** The environment that names a collector on loopback, and nothing else. */
const AT = { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:9' };

const OTLP: Row[] = [
  {
    name: 'REFUSED: no export without an endpoint, with a blank one, or with a service name alone',
    check: () => {
      assert.equal(otlpOf({}), undefined);
      assert.equal(otlpOf({ OTEL_EXPORTER_OTLP_ENDPOINT: '' }), undefined);
      assert.equal(otlpOf({ OTEL_EXPORTER_OTLP_ENDPOINT: '  ' }), undefined);
      assert.equal(otlpOf({ OTEL_SERVICE_NAME: 'mine' }), undefined, 'a service name alone asks for no export');
    },
  },
  {
    name: 'an endpoint, its trailing slash left off, under the service nemia unless named',
    check: () => {
      assert.deepEqual(otlpOf({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318/' }), {
        url: 'http://localhost:4318',
        serviceName: DEFAULT_SERVICE_NAME,
        every: {},
      });
      assert.equal(DEFAULT_SERVICE_NAME, 'nemia');
    },
  },
  {
    name: 'a service named, and each signal posted at its own path of the endpoint',
    check: () => {
      const named = otlpOf({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318', OTEL_SERVICE_NAME: 'factory' })!;
      assert.deepEqual(named, { url: 'http://collector:4318', serviceName: 'factory', every: {} });
      assert.equal(tracesUrl(named), 'http://collector:4318/v1/traces');
      assert.equal(logsUrl(named), 'http://collector:4318/v1/logs');
      assert.equal(metricsUrl(named), 'http://collector:4318/v1/metrics');
    },
  },
  {
    name: 'each signal’s interval read off its standard variable, in whole ms, and no refusal said',
    check: () => {
      const given = { ...AT, [EXPORT_INTERVALS.traces]: '100', [EXPORT_INTERVALS.logs]: ' 200 ', [EXPORT_INTERVALS.metrics]: '300' };
      assert.deepEqual(otlpOf(given)?.every, { traces: 100, logs: 200, metrics: 300 });
      assert.equal(exportIntervalRefusalOf(given), undefined);
    },
  },
  {
    name: 'REFUSED: an interval that is no number is left to the exporter, never read as some other number, and said',
    check: () => {
      const wrong = { ...AT, [EXPORT_INTERVALS.traces]: '0.5s' };
      assert.deepEqual(otlpOf(wrong)?.every, {});
      assert.equal(typeof exportIntervalRefusalOf(wrong), 'string');
    },
  },
];

test('`otlpOf` and `exportIntervalRefusalOf`: whether an environment asks for an OTLP export, to where, under what service and how often', async (t) => {
  for (const row of OTLP) await t.test(row.name, row.check);
});

/** The environment that names a collector, with a trailing slash. */
const ENDPOINT = { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318/' };

const SESSIONS: Row[] = [
  {
    name: "REFUSED: no export without an endpoint, the tools' details asked or not",
    check: () => {
      assert.equal(sessionTelemetryOf({}), undefined);
      assert.equal(sessionTelemetryOf({ NEMIA_TOOL_DETAILS: '1' }), undefined, "the tools' details alone ask for no export");
    },
  },
  {
    name: 'the endpoint alone by default',
    check: () => assert.deepEqual(sessionTelemetryOf(ENDPOINT), { endpoint: 'http://localhost:4318' }),
  },
  ...['1', ' 1 '].map((asked) => ({
    name: `the tools' details when NEMIA_TOOL_DETAILS is ${JSON.stringify(asked)}`,
    check: () =>
      assert.deepEqual(sessionTelemetryOf({ ...ENDPOINT, NEMIA_TOOL_DETAILS: asked }), {
        endpoint: 'http://localhost:4318',
        toolDetails: true,
      }),
  })),
  ...['0', '', 'true'].map((not) => ({
    name: `REFUSED: no tools' details when NEMIA_TOOL_DETAILS is ${JSON.stringify(not)}`,
    check: () => assert.deepEqual(sessionTelemetryOf({ ...ENDPOINT, NEMIA_TOOL_DETAILS: not }), { endpoint: 'http://localhost:4318' }),
  })),
  {
    name: 'NEMIA_TOOL_DETAILS unset, blank, 0 or 1 is said nothing of',
    check: () => {
      for (const fine of [undefined, '', ' ', '0', '1', ' 1 '])
        assert.equal(toolDetailsRefusalOf({ NEMIA_TOOL_DETAILS: fine }), undefined, fine);
      assert.equal(toolDetailsRefusalOf({}), undefined);
    },
  },
  ...['true', 'yes'].map((wrong) => ({
    name: `REFUSED: NEMIA_TOOL_DETAILS ${JSON.stringify(wrong)} asks nothing, said naming the variable and its value`,
    check: () => {
      const said = toolDetailsRefusalOf({ NEMIA_TOOL_DETAILS: wrong });
      assert.equal(typeof said, 'string');
      for (const fact of ['NEMIA_TOOL_DETAILS', JSON.stringify(wrong)]) assert.ok(said!.includes(fact), `${said} names ${fact}`);
    },
  })),
];

test('`sessionTelemetryOf` and `toolDetailsRefusalOf`: what the sessions a daemon starts export, and a NEMIA_TOOL_DETAILS that asks nothing', async (t) => {
  for (const row of SESSIONS) await t.test(row.name, row.check);
});

/** The moment every `lineOf` row prints at. */
const AT_LINE = new Date('2026-10-05T08:09:10.123Z');

const LINES: Row[] = [
  {
    name: 'a message logged as one part',
    check: () => assert.equal(lineOf(['r-1  filed implement'], AT_LINE), '08:09:10  r-1  filed implement'),
  },
  {
    name: 'a message logged as a string',
    check: () => assert.equal(lineOf('the store is resumed', AT_LINE), '08:09:10  the store is resumed'),
  },
  {
    name: 'a message of several parts, joined by a space, each not a string as JSON',
    check: () => assert.equal(lineOf(['passes', 3, { slow: true }], AT_LINE), '08:09:10  passes 3 {"slow":true}'),
  },
];

test('`lineOf`: the time in UTC, two spaces, then the message, its parts joined by a space', async (t) => {
  for (const row of LINES) await t.test(row.name, row.check);
});

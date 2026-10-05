/**
 * The daemon's telemetry: whether the environment asks for an OTLP export (`otlpOf`), a log as `nemia up` prints it (`lineOf`), and the
 * layer (`telemetryLayer`), which exports spans and logs to a collector only when one is named — proven against a scratch collector that
 * counts what it is posted, and refused with none named by what the layer puts in the context.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Effect, Logger } from 'effect';
import { DEFAULT_SERVICE_NAME, lineOf, logsUrl, otlpOf, tracesUrl } from './telemetry.ts';
import { lineLogger, telemetryLayer } from './telemetry.store.ts';

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

/** A scratch collector on loopback: each body posted to it, by path, and a wait for the first post to `path` whose body has `word`. */
async function collector(t: TestContext) {
  const posts: { path: string; body: string }[] = [];
  const waiting: { path: string; word: string; found: (body: string) => void }[] = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')));
    req.on('end', () => {
      posts.push({ path: req.url ?? '', body });
      for (const w of waiting) if (w.path === req.url && body.includes(w.word)) w.found(body);
      res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
    });
  });
  await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening));
  t.after(() => new Promise<void>((closed) => server.close(() => closed())));
  const posted = (path: string, word: string) =>
    new Promise<string>((found) => {
      const had = posts.find((p) => p.path === path && p.body.includes(word));
      if (had) found(had.body);
      else waiting.push({ path, word, found });
    });
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, posted };
}

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

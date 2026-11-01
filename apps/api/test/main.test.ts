import './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { MetricRead } from '../src/factory/ceilings.ts';
import { OPENED } from '../src/factory/feed.ts';
import { argsOf, DEFAULT_PORT, portOf, ticksOf, VIEWER_PORT } from '../src/port.ts';
import { scratch } from './scratch.ts';
import { DEFAULT_EVERY_MS } from 'agent-orchestrator';

const API = path.join(import.meta.dirname, '..');

test('PORT unset or empty is 8787, or 8788 for an api that does not tick, 0 is any free port, and a number is that port', () => {
  assert.equal(portOf(undefined), DEFAULT_PORT);
  assert.equal(portOf(''), DEFAULT_PORT);
  assert.equal(portOf(undefined, false), VIEWER_PORT);
  assert.equal(portOf('', false), 8788);
  assert.equal(portOf('9001', false), 9001);
  assert.equal(portOf('0'), 0);
  assert.equal(portOf('9001'), 9001);
  assert.equal(portOf(' 65535 '), 65535);
});

test('a PORT that is not a port is refused with the fix, not read as 8787', () => {
  for (const value of ['abc', '80a', '-1', '65536', '1e3', '0x50', '8787.0', '100000']) {
    assert.throws(
      () => portOf(value),
      (err: Error & { exitCode?: number }) =>
        err.exitCode === 2 && err.message.startsWith(`PORT=${value} is not a port.`) && /0 for any free port/.test(err.message),
      value,
    );
  }
});

test('the api ticks with no argument, and not with --no-tick; any other is refused naming --no-tick', () => {
  assert.equal(ticksOf([]), true);
  assert.equal(ticksOf(['--no-tick']), false);
  assert.deepEqual(argsOf([]), { ticks: true, every: DEFAULT_EVERY_MS }, 'with none, at the shipped interval');
  assert.deepEqual(argsOf(['250']), { ticks: true, every: 250 }, 'an interval, read as nemia up reads it');
  assert.throws(
    () => argsOf(['--no-tick', '250']),
    (err: Error & { exitCode?: number }) => err.exitCode === 2,
    'REFUSED: an interval beside --no-tick, which ticks nothing',
  );
  for (const argv of [['--tick=no'], ['--no-tick', 'x'], ['tick']])
    assert.throws(
      () => ticksOf(argv),
      (err: Error & { exitCode?: number }) => err.exitCode === 2 && /Give --no-tick to serve the board without ticking/.test(err.message),
      argv.join(' '),
    );
});

/**
 * `node src/main.ts` with `PORT` and `args`, in the store `root` (one of its own unless given), exporting no telemetry unless `otel`
 * names a collector, with `more` over that environment: what it printed, and how it ended if it did. It is killed when the test is
 * done, if it still runs, and in any case within a minute.
 */
function startApi(port: string, args: string[] = [], root = scratch('nemia-api-main-'), otel = '', more: NodeJS.ProcessEnv = {}) {
  const { NEMIA_ON_INSTALLED: _set, ...ambient } = process.env;
  const env = {
    ...ambient,
    PORT: port,
    WF_ROOT: root,
    HKB_REPO: root,
    WF_MAX_CONCURRENT: '2',
    WF_MAX_RUNS: '2',
    OTEL_EXPORTER_OTLP_ENDPOINT: otel,
    ...more,
  };
  const child = spawn(process.execPath, ['src/main.ts', ...args], { cwd: API, env, timeout: 60_000 });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  const ended = new Promise<number | null>((resolve) => child.on('exit', (code) => resolve(code)));
  const said = (pattern: RegExp) =>
    new Promise<RegExpMatchArray>((resolve, reject) => {
      const timer = setInterval(() => {
        const m = pattern.exec(output);
        if (m) {
          clearInterval(timer);
          resolve(m);
        }
      }, 20);
      void ended.then(() => {
        clearInterval(timer);
        const m = pattern.exec(output);
        if (m) resolve(m);
        else reject(new Error(`exited without ${pattern}:\n${output}`));
      });
    });
  return { child, ended, said, output: () => output, root };
}

test('PORT=0 starts the api on a free port, and it prints the port it got', async (t) => {
  const api = startApi('0');
  t.after(() => api.child.kill());
  const [, got] = await api.said(/api listening on http:\/\/127\.0\.0\.1:(\d+)/);
  assert.notEqual(Number(got), 0);
  assert.notEqual(Number(got), DEFAULT_PORT);
  const res = await fetch(`http://127.0.0.1:${got}/api/health`);
  assert.deepEqual(await res.json(), { ok: true }, 'and it is listening there');
});

test("REFUSED: the api listens on 127.0.0.1 alone — nothing answers on this machine's other addresses, where anyone on the network could start a run", async (t) => {
  const outward = Object.values(os.networkInterfaces())
    .flat()
    .find((a) => a?.family === 'IPv4' && !a.internal)?.address;
  const api = startApi('0');
  t.after(() => api.child.kill());
  const [, got] = await api.said(/api listening on http:\/\/127\.0\.0\.1:(\d+)/);
  assert.deepEqual(await (await fetch(`http://127.0.0.1:${got}/api/health`)).json(), { ok: true }, 'it answers on loopback');
  if (!outward) return t.skip('this machine has no address but loopback to try');
  await assert.rejects(
    fetch(`http://${outward}:${got}/api/health`),
    (err: Error & { cause?: { code?: string } }) => err.cause?.code === 'ECONNREFUSED',
    `nothing answers on ${outward}:${got}`,
  );
});

test('the api refuses a PORT that is not a port: exit 2, the fix on stderr, nothing listening', async () => {
  const api = startApi('80a');
  assert.equal(await api.ended, 2);
  assert.match(api.output(), /PORT=80a is not a port\. Give a whole number from 0 to 65535/);
  assert.doesNotMatch(api.output(), /listening/);
});

/** A store whose `releases/current` names a built release `v1`: a store that runs an install. */
function installedStore(): string {
  const root = scratch('nemia-api-installed-');
  const release = path.join(root, 'releases', 'v1');
  fs.mkdirSync(release, { recursive: true });
  const file = { tag: 'v1', commit: 'abcdef1234567890', source: '/src', builtAt: '2026-10-06T07:00:00.000Z' };
  fs.writeFileSync(path.join(release, 'release.json'), JSON.stringify(file));
  fs.symlinkSync('v1', path.join(root, 'releases', 'current'));
  return root;
}

test("REFUSED at shipped defaults: the checkout's api on a store that runs an install exits 2, naming the setting; no lease, no port", async () => {
  for (const args of [[], ['--no-tick']]) {
    const api = startApi('0', args, installedStore());
    assert.equal(await api.ended, 2, api.output());
    assert.match(api.output(), /this is the checkout .* runs the installed release v1 \(releases\/current\)/);
    assert.match(api.output(), /NEMIA_ON_INSTALLED=1/);
    assert.doesNotMatch(api.output(), /listening/);
    assert.equal(fs.existsSync(path.join(api.root, 'daemon.json')), false, 'no lease taken');
  }
});

test("the checkout's api serves that store told NEMIA_ON_INSTALLED=1", async (t) => {
  const api = startApi('0', ['--no-tick'], installedStore(), '', { NEMIA_ON_INSTALLED: '1' });
  t.after(() => api.child.kill());
  await api.said(/api listening on http:\/\/127\.0\.0\.1:\d+/);
});

/** The lease of the store at `root`, as the daemon wrote it. */
const leaseOf = (root: string) => JSON.parse(fs.readFileSync(path.join(root, 'daemon.json'), 'utf8')) as Record<string, unknown>;

/** Until the lease at `root` says `pred`: written after the api listens, a moment after it says so. */
const leaseSays = async (root: string, pred: (lease: Record<string, unknown>) => boolean) => {
  while (!(fs.existsSync(path.join(root, 'daemon.json')) && pred(leaseOf(root)))) await new Promise((r) => setTimeout(r, 20));
  return leaseOf(root);
};

test("(a) the api is the store's daemon: it holds the lease as the api, at its url, and /api/daemon says so", async (t) => {
  const api = startApi('0');
  t.after(() => api.child.kill());
  const [url] = await api.said(/http:\/\/127\.0\.0\.1:\d+/);
  const lease = await leaseSays(api.root, (l) => l.url === url);
  assert.deepEqual([lease.pid, lease.by], [api.child.pid, 'api']);
  assert.deepEqual(lease.release, { kind: 'checkout', root: path.resolve(API, '..', '..') }, 'the lease says the api runs this checkout');
  const daemon = (await (await fetch(`${url}/api/daemon`)).json()) as Record<string, unknown>;
  assert.deepEqual([daemon.by, daemon.url, daemon.pid], ['api', url, api.child.pid]);
});

test('REFUSED (b, c): a second api, and a nemia up, on a store the api holds — exit 2 naming it, and the second api binds no port', async (t) => {
  const first = startApi('0');
  t.after(() => first.child.kill());
  const [url] = await first.said(/http:\/\/127\.0\.0\.1:\d+/);
  await leaseSays(first.root, (l) => l.url === url);
  const second = startApi('0', [], first.root);
  assert.equal(await second.ended, 2);
  assert.match(second.output(), new RegExp(`^api: \\S+ is held by the api of pid ${first.child.pid} at ${url}, `));
  assert.doesNotMatch(second.output(), /listening/);
  const wf = spawn(process.execPath, [path.join(API, '../../packages/agent-orchestrator/bin/nemia.ts'), 'up'], {
    env: { ...process.env, WF_ROOT: first.root, WF_MAX_CONCURRENT: '2', WF_MAX_RUNS: '2', OTEL_EXPORTER_OTLP_ENDPOINT: '' },
    timeout: 60_000,
  });
  let said = '';
  wf.stderr.on('data', (c) => (said += c));
  const code = await new Promise((resolve) => wf.on('exit', resolve));
  assert.equal(code, 2);
  assert.match(
    said,
    new RegExp(`nemia up: \\S+ is held by the api of pid ${first.child.pid} at ${url}, .*stop it with kill ${first.child.pid} `),
  );
});

test('REFUSED (d): with a nemia up holding the store, the api exits 2 naming its pid, and binds no port', async (t) => {
  const root = scratch('nemia-api-main-');
  const wf = spawn(process.execPath, [path.join(API, '../../packages/agent-orchestrator/bin/nemia.ts'), 'up', '200'], {
    env: { ...process.env, WF_ROOT: root, WF_MAX_CONCURRENT: '2', WF_MAX_RUNS: '2', OTEL_EXPORTER_OTLP_ENDPOINT: '' },
    cwd: root,
    timeout: 60_000,
  });
  t.after(() => wf.kill());
  await leaseSays(root, (l) => l.pid === wf.pid && l.passedAt !== null);
  const api = startApi('0', [], root);
  assert.equal(await api.ended, 2);
  assert.match(api.output(), new RegExp(`^api: \\S+ is held by the nemia up of pid ${wf.pid}, .*stop it with kill ${wf.pid} `));
  assert.doesNotMatch(api.output(), /listening/);
});

test('(e) SIGTERM ends the api with 143 and lets the lease go, and the next api takes the store', async (t) => {
  const first = startApi('0');
  const [url] = await first.said(/http:\/\/127\.0\.0\.1:\d+/);
  await leaseSays(first.root, (l) => l.url === url);
  first.child.kill('SIGTERM');
  assert.equal(await first.ended, 143, 'its own exit, 128 + 15, once the lease is let go');
  assert.ok(leaseOf(first.root).stoppedAt, 'stoppedAt written');
  const next = startApi('0', [], first.root);
  t.after(() => next.child.kill());
  await leaseSays(first.root, (l) => l.pid === next.child.pid && l.by === 'api');
});

test('REFUSED: a port another process holds ends the daemon with exit 2, naming the port and PORT=, and lets the lease go', async (t) => {
  const holder = net.createServer();
  await new Promise<void>((resolve) => holder.listen(0, '127.0.0.1', resolve));
  t.after(() => holder.close());
  const taken = String((holder.address() as net.AddressInfo).port);
  const api = startApi(taken);
  assert.equal(await api.ended, 2, 'a refusal, not a crash');
  assert.match(
    api.output(),
    new RegExp(`^api: 127\\.0\\.0\\.1:${taken} is in use by another process\\. Stop what listens there, or give PORT= another port`, 'm'),
  );
  assert.doesNotMatch(api.output(), /listening|    at /, 'no stack, and nothing listening');
  assert.ok(leaseOf(api.root).stoppedAt, 'the lease taken before the port is let go, so the next daemon takes it at once');
  const viewer = startApi(taken, ['--no-tick']);
  assert.equal(await viewer.ended, 2, 'a viewer on a held port is refused the same way');
  assert.match(viewer.output(), new RegExp(`^api: 127\\.0\\.0\\.1:${taken} is in use`, 'm'));
});

test('(f) --no-tick serves the board and writes no lease; (g) any other argument is refused naming --no-tick', async (t) => {
  const viewer = startApi('0', ['--no-tick']);
  t.after(() => viewer.child.kill());
  const [url] = await viewer.said(/http:\/\/127\.0\.0\.1:\d+/);
  assert.deepEqual(await (await fetch(`${url}/api/health`)).json(), { ok: true });
  assert.equal(fs.existsSync(path.join(viewer.root, 'daemon.json')), false);
  const wrong = startApi('0', ['--tick=no']);
  assert.equal(await wrong.ended, 2);
  assert.match(wrong.output(), /the api takes no --tick=no\. Give --no-tick /);
  assert.equal(fs.existsSync(path.join(wrong.root, 'daemon.json')), false);
});

/**
 * How often an api a test starts as the daemon passes, given as its `[ms]`, shorter than the shipped `DEFAULT_EVERY_MS`; and how long its
 * exporters hold a span before they post it (`OTEL_BSP_SCHEDULE_DELAY`, the OTel name), shorter than the exporter's own default.
 */
const PASS_MS = 100;
const EXPORT_MS = '100';

/** A collector on loopback that answers each post: its url, and the body of the first post to `path` that has `word`. */
async function collector(t: { after: (fn: () => Promise<void>) => void }) {
  const waiting: { path: string; word: string; found: (body: string) => void }[] = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')));
    req.on('end', () => {
      for (const w of waiting) if (w.path === req.url && body.includes(w.word)) w.found(body);
      res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
    });
  });
  await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening));
  t.after(() => new Promise<void>((closed) => server.close(() => closed())));
  const posted = (path: string, word: string) => new Promise<string>((found) => waiting.push({ path, word, found }));
  return { url: `http://127.0.0.1:${(server.address() as net.AddressInfo).port}`, posted };
}

test("the api's daemon exports its passes' spans to the collector OTEL_EXPORTER_OTLP_ENDPOINT names, as the nemia service", async (t) => {
  const c = await collector(t);
  const pass = c.posted('/v1/traces', '"tick"');
  const api = startApi('0', [], undefined, c.url, { OTEL_BSP_SCHEDULE_DELAY: EXPORT_MS });
  t.after(() => api.child.kill());
  const spans = await Promise.race([pass, api.ended.then((code) => assert.fail(`the api exited ${code}:\n${api.output()}`))]);
  assert.match(spans, /"nemia"/);
});

test('an api started --no-tick exports a server span per request, with the HTTP attributes, to the collector it was given', async (t) => {
  const c = await collector(t);
  const posted = c.posted('/v1/traces', '"GET /api/version"');
  const api = startApi('0', ['--no-tick'], undefined, c.url, { OTEL_BSP_SCHEDULE_DELAY: EXPORT_MS });
  t.after(() => api.child.kill());
  const [, got] = await api.said(/api listening on http:\/\/127\.0\.0\.1:(\d+)/);
  assert.equal((await fetch(`http://127.0.0.1:${got}/api/version`)).status, 200);
  await api.said(/\d\d:\d\d:\d\d {2}GET \/api\/version 200 \d+ms/);
  const spans = await Promise.race([posted, api.ended.then((code) => assert.fail(`the api exited ${code}:\n${api.output()}`))]);
  assert.match(spans, /"nemia"/, 'under the nemia service');
  const span = JSON.parse(spans) as {
    resourceSpans: {
      scopeSpans: {
        spans: { name: string; kind: number; attributes: { key: string; value: { stringValue?: string; intValue?: number | string } }[] }[];
      }[];
    }[];
  };
  const asked = span.resourceSpans.flatMap((r) => r.scopeSpans.flatMap((s) => s.spans)).filter((one) => one.name === 'GET /api/version');
  assert.equal(asked.length, 1, `one span for the one request asked for: ${spans}`);
  const request = asked[0];
  assert.equal(request.kind, 2, 'of kind server');
  assert.deepEqual(Object.fromEntries(request.attributes.map((a) => [a.key, a.value.stringValue ?? a.value.intValue])), {
    'http.request.method': 'GET',
    'http.route': '/api/version',
    'url.path': '/api/version',
    'http.response.status_code': 200,
  });
});

/** Each series a body posted to `/v1/metrics` names, by its metric's name and its attributes' values, with its value or its count. */
const postedSeries = (body: string): Record<string, number> => {
  type Point = { attributes: { value: { stringValue?: string } }[]; asDouble?: number; asInt?: number; count?: number | string };
  type Posted = { name: string; sum?: { dataPoints: Point[] }; histogram?: { dataPoints: Point[] } };
  const { resourceMetrics } = JSON.parse(body) as { resourceMetrics: { scopeMetrics: { metrics: Posted[] }[] }[] };
  return Object.fromEntries(
    resourceMetrics
      .flatMap((r) => r.scopeMetrics.flatMap((s) => s.metrics))
      .flatMap((m) =>
        [...(m.sum?.dataPoints ?? []), ...(m.histogram?.dataPoints ?? [])].map((p) => [
          [m.name, ...p.attributes.map((a) => a.value.stringValue)].join(' '),
          Number(p.asDouble ?? p.asInt ?? p.count),
        ]),
      ),
  );
};

test("the api's daemon posts its own series and the pass's at zero before any request, so a restart is read as a reset", async (t) => {
  const c = await collector(t);
  const born = c.posted('/v1/metrics', '"pass.duration"');
  const api = startApi('0', [], undefined, c.url);
  t.after(() => api.child.kill());
  const body = await Promise.race([born, api.ended.then((code) => assert.fail(`the api exited ${code}:\n${api.output()}`))]);
  const series = postedSeries(body);
  assert.deepEqual(
    [series['api.step.follows'], series['pass.duration'], series['feed.follow.reads']],
    [0, 0, 0],
    `the first post naming the pass's time: ${JSON.stringify(series)}`,
  );
});

/** A metric of the api at `url`, as `GET /api/metrics` answers it, by its name. */
const metricOf = async (url: string, name: string) =>
  ((await (await fetch(`${url}/api/metrics`)).json()) as MetricRead[]).find((m) => m.name === name);

/**
 * A folder run whose one step signed off, written into the store at `root` as `nemia start` and the engine would leave it: the run's
 * record and its task's journal, which the daemon's next pass judges and says on the feed.
 */
function signedOffRun(root: string): void {
  const at = new Date().toISOString();
  const work = path.join(root, 'runs', 'r-hub', 'work', 'write');
  fs.mkdirSync(work, { recursive: true });
  fs.mkdirSync(path.join(root, 'engine', 'tasks'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'engine', 'tasks', 'r-hub-write.jsonl'),
    [
      { kind: 'filed', at, brief: 'Write it.', cwd: work, maxAttempts: 1, harness: 'claude' },
      { kind: 'starting', at, attempt: 1 },
      { kind: 'spawned', at, attempt: 1 },
      {
        kind: 'ended',
        at,
        attempt: 1,
        sessionId: 'ae/r-hub-write/1',
        observed: 'done',
        reason: 'harness',
        closeout: { outcome: 'done', summary: 'Wrote it.', needs: null, artifacts: [] },
      },
      { kind: 'settled', at, outcome: 'succeeded' },
    ]
      .map((e) => `${JSON.stringify(e)}\n`)
      .join(''),
  );
  fs.writeFileSync(
    path.join(root, 'runs', 'r-hub.json'),
    JSON.stringify({
      id: 'r-hub',
      place: { kind: 'folder' },
      workspace: path.dirname(work),
      brief: 'Write a note.',
      createdAt: at,
      workflowDir: path.join(root, 'no-such-workflow'),
      workflow: [{ name: 'write', after: [], body: 'Write it.', harness: 'claude', workspace: 'folder' }],
      steps: { write: { taskId: 'r-hub-write', workspace: work } },
    }),
  );
}

test("REFUSED: a line the api's daemon writes reaches the api's stream from the hub its runtime built, with no read of the file", async (t) => {
  assert.ok(PASS_MS < DEFAULT_EVERY_MS);
  const api = startApi('0', [String(PASS_MS)]);
  t.after(() => api.child.kill());
  const [url] = await api.said(/http:\/\/127\.0\.0\.1:\d+/);
  await leaseSays(api.root, (l) => l.url === url);
  const stream = new AbortController();
  t.after(() => stream.abort());
  const res = await fetch(`${url}/api/feed/stream`, { signal: stream.signal });
  const reader = res.body!.getReader();
  while ((await metricOf(url, 'feed.followers'))?.value !== 1) await new Promise((r) => setTimeout(r, 20));
  const reads = (await metricOf(url, 'feed.follow.reads'))?.count;

  signedOffRun(api.root);
  let said = '';
  while (!/r-hub/.test(said)) {
    const { value, done } = await reader.read();
    if (done) assert.fail(`the stream ended before the run's line:\n${said}\n${api.output()}`);
    said += new TextDecoder().decode(value);
  }
  assert.ok(
    said.startsWith(`${OPENED}event: daemon\n`),
    `the stream opens, after its comment, on the daemon's started line, written before the api listened:\n${said}`,
  );
  assert.equal(
    (await metricOf(url, 'feed.follow.reads'))?.count,
    reads,
    'the line came as an item of the hub the daemon published to, which the reader took without reading the file: the beat found the file where the reader was',
  );
});

test("the api's daemon still says its own pass lines, in the time-first layout, through the logger the app's layer holds", async (t) => {
  const api = startApi('0', [String(PASS_MS)]);
  t.after(() => api.child.kill());
  await api.said(/api listening on/);
  signedOffRun(api.root);
  const [line] = await api.said(/\d\d:\d\d:\d\d {2}r-hub .*/);
  assert.match(line, /r-hub/, `the pass's line about the run it advanced:\n${api.output()}`);
});

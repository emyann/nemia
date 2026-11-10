/**
 * Every request the api answers says one line (`saidRequest`, src/request/request.ts), and a streamed one says two: the shape of the line,
 * the level its status asks for, and the HTTP attributes the line and its span both carry. Read off a logger of the test's own, merged
 * over the app's layer after it (`Layer.merge` keeps the later), so the lines of the app under test are kept rather than printed.
 */
import { root } from './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Layer, Logger, Option, References, Tracer } from 'effect';
import { addFactory, attachWorkflow } from 'agent-orchestrator/testing';
import { appOf, liveOf } from '../src/app.ts';
import { tookOf } from '../src/request/request.ts';
import { until, WAITED } from 'agent-runtime/testing';
import { scratch } from 'test-kit/scratch';

/** A line the app said: its level, its message, and the annotations the fiber carried when it was said. */
type Said = { level: string; text: string; annotations: Record<string, unknown> };

/** An app over the live layer whose lines are kept in `said` rather than printed, its runtime, and the lines it has said so far. */
function appSaying(): { app: ReturnType<typeof appOf>['app']; runtime: ReturnType<typeof appOf>['runtime']; said: Said[] } {
  const said: Said[] = [];
  const keeper = Logger.make<unknown, void>(({ message, logLevel, fiber }) =>
    said.push({
      level: logLevel,
      text: (Array.isArray(message) ? message : [message]).join(' '),
      annotations: { ...fiber.getRef(References.CurrentLogAnnotations) },
    }),
  );
  return { ...appOf(Layer.merge(liveOf(), Logger.layer([keeper]))), said };
}

/** The event loop's pending turns drained, so a rejection Node has not yet reported as unhandled has been. */
const drained = async (): Promise<void> => {
  for (let turn = 0; turn < 3; turn++) await new Promise((done) => setImmediate(done));
};

/** The one line `path` was answered with, the test failing where it said none or more than one. */
async function oneLine(path: string): Promise<Said> {
  const { app, said } = appSaying();
  await app.request(path);
  assert.equal(said.length, 1, `one line for ${path}: ${JSON.stringify(said)}`);
  return said[0];
}

test(
  'saidRequest: the line each request says — an answer, a refusal, a failure, a stream opened and closed, and how long it took',
  WAITED,
  async (t) => {
    await t.test(
      'an answer is one line at Info — the method, the path, the status and how long it took — carrying the HTTP attributes',
      async () => {
        const line = await oneLine('/api/version');
        assert.equal(line.level, 'Info');
        assert.match(line.text, /^GET \/api\/version 200 \d+ms$/);
        assert.deepEqual(line.annotations, {
          'http.request.method': 'GET',
          'http.route': '/api/version',
          'url.path': '/api/version',
          'http.response.status_code': 200,
        });
      },
    );
    await t.test('a refusal is one line at Warn with its status, and one that matched no route carries no http.route', async () => {
      const invalid = await oneLine('/api/passes?last=0');
      assert.equal(invalid.level, 'Warn');
      assert.match(invalid.text, /^GET \/api\/passes 422 \d+ms$/);
      assert.equal(invalid.annotations['http.response.status_code'], 422);
      assert.equal(invalid.annotations['http.route'], '/api/passes');
      const missing = await oneLine('/api/nothing-is-here');
      assert.equal(missing.level, 'Warn');
      assert.match(missing.text, /^GET \/api\/nothing-is-here 404 \d+ms$/);
      assert.deepEqual(missing.annotations, {
        'http.request.method': 'GET',
        'url.path': '/api/nothing-is-here',
        'http.response.status_code': 404,
      });
    });
    await t.test('a failure is one line at Error with 500 in it', async () => {
      fs.mkdirSync(path.join(root, 'daemon.json'), { recursive: true });
      const line = await oneLine('/api/daemon');
      fs.rmSync(path.join(root, 'daemon.json'), { recursive: true });
      assert.equal(line.level, 'Error');
      assert.match(line.text, /^GET \/api\/daemon 500 \d+ms$/);
      assert.equal(line.annotations['http.response.status_code'], 500);
    });
    await t.test('a stream says two lines: one when it opens, and one when it is closed, with how long it was open', async (t) => {
      const { app, said } = appSaying();
      const res = await app.request('/api/feed/stream');
      assert.equal(res.status, 200);
      assert.equal(said.length, 1, `the opening line alone while it is open: ${JSON.stringify(said)}`);
      assert.match(said[0].text, /^GET \/api\/feed\/stream 200 \d+ms stream open$/);
      assert.equal(said[0].annotations['http.route'], '/api/feed/stream');
      await res.body!.cancel();
      await until(
        t,
        () => said.length === 2,
        () => `the closing line: ${JSON.stringify(said)}`,
        { everyMs: 10 },
      );
      assert.match(said[1].text, /^GET \/api\/feed\/stream 200 (?:\d+ms|\d+\.\ds) stream closed$/);
      assert.deepEqual(said[1].annotations, said[0].annotations, 'the closing line carries the same attributes');
    });
    await t.test('how long a request took is said in whole milliseconds under a second, and in seconds to one decimal above it', () => {
      assert.deepEqual([tookOf(0), tookOf(3.4), tookOf(999)], ['0ms', '3ms', '999ms']);
      assert.deepEqual([tookOf(1_000), tookOf(1_240), tookOf(61_000)], ['1.0s', '1.2s', '61.0s']);
    });
  },
);

test("a stream whose relay settles once the runtime is disposed drops its closing line: the api's own shutdown disposes it, and a rejection nobody handles ends the process", async (t) => {
  const { app, runtime, said } = appSaying();
  const res = await app.request('/api/feed/stream');
  assert.equal(said.length, 1, `the opening line: ${JSON.stringify(said)}`);
  const unhandled: unknown[] = [];
  const caught = (err: unknown): void => void unhandled.push(err);
  process.on('unhandledRejection', caught);
  t.after(() => process.off('unhandledRejection', caught));
  await runtime.dispose();
  await assert.rejects(() => runtime.runPromise(Effect.void), 'a disposed runtime says nothing more');
  await res.body!.cancel();
  await drained();
  assert.deepEqual(unhandled, [], 'nothing was left for Node to end the process on');
  assert.equal(said.length, 1, 'and the closing line is dropped rather than said by a runtime that is gone');
});

/** A span the app's tracer was asked for: its name, the span it is a child of, and its trace. */
type Traced = { name: string; spanId: string; traceId: string; parent: string | undefined };

/** An app over the live layer whose spans are kept in `spans` rather than exported: its tracer the test's own, given last. */
function appTracing(): { app: ReturnType<typeof appOf>['app']; spans: Traced[] } {
  const spans: Traced[] = [];
  const recording = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options);
      spans.push({
        name: span.name,
        spanId: span.spanId,
        traceId: span.traceId,
        parent: Option.getOrUndefined(Option.map(span.parent, (p) => p.spanId)),
      });
      return span;
    },
  });
  return { ...appOf(Layer.merge(liveOf(), Layer.succeed(Tracer.Tracer)(recording))), spans };
}

/** The spans one request to `url` exported, on a fresh app (so nothing a request kept is read warm), the request a 200. */
async function spansOf(url: string): Promise<Traced[]> {
  const { app, spans } = appTracing();
  const res = await app.request(url);
  assert.equal(res.status, 200, `${url}: ${await res.text()}`);
  return spans;
}

const repo = scratch('nemia-api-trace-');
fs.mkdirSync(path.join(repo, 'workflows', 'make'), { recursive: true });
fs.writeFileSync(path.join(repo, 'workflows', 'make', 'implement.md'), '---\nplace: git\n---\nImplement it.\n');
addFactory({ name: 'traced', repos: [repo] });
attachWorkflow({ factory: 'traced', workflow: 'make' });

const at = '2026-09-25T09:00:00.000Z';
/** A run of one step that signed off, its card beside it in the inbox: what a store holds by the hundred. */
function aFinishedRun(id: string): void {
  const taskId = `${id}-implement`;
  const journal = path.join(root, 'engine', 'tasks', `${taskId}.jsonl`);
  fs.mkdirSync(path.dirname(journal), { recursive: true });
  const events = [
    { kind: 'filed', at, brief: 'Do it.', cwd: repo, maxAttempts: 1, harness: 'codex' },
    { kind: 'starting', at, attempt: 1 },
    { kind: 'spawned', at, attempt: 1 },
    {
      kind: 'ended',
      at,
      attempt: 1,
      sessionId: `ae/${taskId}/1`,
      observed: 'done',
      reason: 'harness',
      closeout: { outcome: 'done', summary: 'Did it.', needs: null, artifacts: [] },
    },
    { kind: 'settled', at, outcome: 'succeeded' },
  ];
  fs.writeFileSync(journal, events.map((e) => `${JSON.stringify(e)}\n`).join(''));
  fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      repo,
      baseRef: 'main',
      workspace: repo,
      branch: 'main',
      isolate: true,
      brief: `The brief of ${id}`,
      createdAt: at,
      workflowDir: path.join(root, 'no-such-workflow'),
      workflow: [{ name: 'implement', after: [], body: 'Implement it.', harness: 'codex' }],
      steps: { implement: { taskId, branch: `wf/${id}/implement` } },
    }),
  );
  fs.mkdirSync(path.join(root, 'inbox'), { recursive: true });
  fs.writeFileSync(path.join(root, 'inbox', `card-${id}.md`), `Do ${id}.\n`);
}
/** Runs `r-<from>` to `r-<to - 1>` planted. */
const planted = (from: number, to: number): void => {
  for (let n = from; n < to; n++) aFinishedRun(`r-${String(n).padStart(3, '0')}`);
};

/** How many spans of each name `spans` holds, the most first. */
const countsOf = (spans: Traced[]): Record<string, number> => {
  const counts = new Map<string, number>();
  for (const { name } of spans) counts.set(name, (counts.get(name) ?? 0) + 1);
  return Object.fromEntries([...counts].sort((a, b) => b[1] - a[1]));
};

test("a request's trace shows its programs: the package's spans are children of the request's server span", async (t) => {
  await t.test('GET /api/factories/<f>/commands records factoryCommandsOf under the server span, in its trace', async () => {
    const spans = await spansOf('/api/factories/traced/commands');
    const server = spans.find((s) => s.name === 'GET /api/factories/:name/commands');
    assert.ok(server, `the server span: ${JSON.stringify(spans.map((s) => s.name))}`);
    const program = spans.find((s) => s.name === 'factoryCommandsOf');
    assert.ok(program, `the program's span: ${JSON.stringify(spans.map((s) => s.name))}`);
    assert.equal(program.parent, server.spanId, "factoryCommandsOf is a child of the request's span");
    assert.equal(program.traceId, server.traceId, 'in the same trace');
  });
  await t.test('the factories are listed once per request: one factoriesListed span for the commands and for the schedules', async () => {
    for (const url of ['/api/factories/traced/commands', '/api/namespaces/traced/schedules']) {
      const spans = await spansOf(url);
      assert.equal(spans.filter((s) => s.name === 'factoriesListed').length, 1, `${url}: ${JSON.stringify(countsOf(spans))}`);
    }
  });
  await t.test(
    'the spans GET /api/runs and GET /api/cards export are bounded whatever the number of runs, but one judge per run judged',
    async () => {
      planted(0, 5);
      const runsFew = await spansOf('/api/runs');
      const cardsFew = await spansOf('/api/cards');
      planted(5, 50);
      const runsMany = await spansOf('/api/runs');
      const cardsMany = await spansOf('/api/cards');
      t.diagnostic(`GET /api/runs: ${runsFew.length} spans over 5 runs, ${runsMany.length} over 50: ${JSON.stringify(countsOf(runsMany))}`);
      t.diagnostic(
        `GET /api/cards: ${cardsFew.length} spans over 5 runs, ${cardsMany.length} over 50: ${JSON.stringify(countsOf(cardsMany))}`,
      );
      const server = runsMany.find((s) => s.name === 'GET /api/runs');
      assert.ok(server, 'the server span');
      assert.ok(
        runsMany.some((s) => s.parent === server.spanId),
        "the list's programs are children of the request's span",
      );
      const unjudged = (spans: Traced[]) => spans.filter((s) => s.name !== 'judge').length;
      assert.equal(unjudged(runsMany), unjudged(runsFew), `GET /api/runs: ${JSON.stringify(countsOf(runsMany))}`);
      assert.equal(unjudged(cardsMany), unjudged(cardsFew), `GET /api/cards: ${JSON.stringify(countsOf(cardsMany))}`);
    },
  );
});

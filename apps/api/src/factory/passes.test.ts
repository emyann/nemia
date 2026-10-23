/**
 * GET /api/passes (app.ts), the recent passes the tick kept, as `nemia passes --json` prints them (`passesOf`, through the command table);
 * and GET /api/metrics, the api process's metrics (`metricsOf`), where each request `served` counts the files the runtime read for it
 * under its route's pattern (`api.poll.reads`; that the count is the engine's own, runs/resting.test.ts). In the harness's scratch store
 * (`root`), whose `tick-recent.json` is written here as the tick writes it.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import { story } from '../../test/checkpoints.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { app } from '../app.ts';
import { Effect, Metric } from 'effect';
import { PHASES, type PassesRead, type RecentPass } from 'agent-orchestrator';
import { metricsOf, type MetricRead } from './ceilings.ts';

const RECENT = path.join(root, 'tick-recent.json');

/** A pass of `ms` at the `k`th second, all of it in `git`, that saw `runs` runs. */
const recent = (k: number, ms: number, runs: number): RecentPass => ({
  at: new Date(Date.UTC(2026, 9, 5, 10, 0, k)).toISOString(),
  ms,
  records: runs,
  rested: 0,
  reads: 2,
  runs,
  tasks: 1,
  queued: 0,
  admitted: 1,
  phases: Object.fromEntries(PHASES.map((p) => [p, p === 'place' ? ms : 0])) as RecentPass['phases'],
});

const passes = async (query = ''): Promise<{ status: number; body: unknown }> => {
  const res = await app.request(`/api/passes${query}`);
  return { status: res.status, body: await res.json() };
};

test('The board reads the passes the tick kept and the api process metrics: none, then three, the last n, a last refused, and each request counted under its route', async (t) => {
  const s = story(t);
  await s.test(
    'GET /api/passes answers the recent passes kept, oldest first, their histogram, parts and summary; ?last=n the last n',
    async () => {
      fs.rmSync(RECENT, { force: true });
      const none = (await passes()).body as PassesRead;
      assert.deepEqual([none.recent, none.summary, none.parts], [[], null, []], 'no pass kept, none answered');
      fs.writeFileSync(RECENT, JSON.stringify([recent(1, 12, 5), recent(2, 300, 6), recent(3, 40, 7)]));
      const all = await passes();
      assert.equal(all.status, 200);
      const read = all.body as PassesRead;
      assert.deepEqual(
        read.recent.map((p) => p.runs),
        [5, 6, 7],
      );
      assert.deepEqual(
        { passes: read.summary?.passes, medianMs: read.summary?.medianMs, slowestMs: read.summary?.slowestMs, runs: read.summary?.runs },
        { passes: 3, medianMs: 40, slowestMs: 300, runs: 7 },
      );
      assert.equal(read.histogram.length, read.bounds.length + 1);
      assert.equal(read.parts[0].phase, 'place');
      const last = (await passes('?last=1')).body as PassesRead;
      assert.deepEqual(
        last.recent.map((p) => p.runs),
        [7],
      );
    },
  );
  await s.test(
    'REFUSED: GET /api/passes with a last that is not a whole number from 1, as Invalid: 422, naming what it takes',
    async () => {
      for (const last of ['0', 'x']) {
        const { status, body } = await passes(`?last=${last}`);
        assert.equal(status, 422);
        const { error } = body as { error: string };
        assert.ok(error.startsWith('--last takes'), error);
        assert.ok(error.includes('a whole number from 1'), error);
      }
    },
  );
  await s.test("GET /api/metrics counts each request's reads under its route's pattern, never its path", async () => {
    const pollsOf = async (route: string): Promise<number> => {
      const res = await app.request('/api/metrics');
      assert.equal(res.status, 200);
      const metric = ((await res.json()) as MetricRead[]).find((m) => m.name === 'api.poll.reads' && m.attributes.route === route);
      return metric?.count ?? 0;
    };
    const before = await pollsOf('/api/runs/:id');
    assert.equal((await app.request('/api/runs/no-such-run')).status, 404);
    assert.equal(await pollsOf('/api/runs/:id'), before + 1, 'counted on a 404 too');
    assert.equal(await pollsOf('/api/runs/no-such-run'), 0, 'no series a path');
    const metrics = (await (await app.request('/api/metrics')).json()) as MetricRead[];
    const reads = metrics.find((m) => m.name === 'api.poll.reads')!;
    assert.equal(reads.type, 'Histogram');
    assert.ok(reads.buckets && reads.buckets.length > 0, 'its buckets, each the requests at most le');
  });
});

test('a snapshot as JSON: a counter its count, a gauge its value, a histogram its buckets counted from the first; by name, then attributes', async () => {
  const registry = new Map();
  const hist = Metric.histogram('h', { description: 'a histogram', boundaries: [1, 10] });
  const snapshot = await Effect.runPromise(
    Effect.gen(function* () {
      yield* Metric.update(Metric.counter('c'), 3);
      yield* Metric.update(Metric.withAttributes(Metric.gauge('b'), { k: 'y' }), 7);
      yield* Metric.update(Metric.withAttributes(Metric.gauge('b'), { k: 'x' }), 5);
      yield* Metric.update(hist, 0.5);
      yield* Metric.update(hist, 4);
      return yield* Metric.snapshot;
    }).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
  );
  const read = metricsOf(snapshot);
  assert.deepEqual(
    read.map((m) => [m.name, m.attributes.k ?? null]),
    [
      ['b', 'x'],
      ['b', 'y'],
      ['c', null],
      ['h', null],
    ],
  );
  assert.equal(read[0].value, 5);
  assert.equal(read[2].count, 3);
  assert.deepEqual(
    { count: read[3].count, sum: read[3].sum, min: read[3].min, max: read[3].max, description: read[3].description },
    { count: 2, sum: 4.5, min: 0.5, max: 4, description: 'a histogram' },
  );
  assert.deepEqual(read[3].buckets, [
    { le: 1, count: 1 },
    { le: 10, count: 2 },
  ]);
});

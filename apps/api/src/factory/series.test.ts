/**
 * GET /api/series (app.ts), the system's series over a range, as `nemia series --json` prints them (`seriesOf`, through the command
 * table), off the minute and hour lines the ticking process keeps under the harness's scratch store (`root`), written here as it writes
 * them; and GET /api/stats saying the system's health off the hour lines.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import { story } from '../../test/checkpoints.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { app } from '../app.ts';
import type { SeriesRead, Stats } from 'agent-orchestrator';

const METRICS = path.join(root, 'metrics');

/** A line of `s` over the minute or hour starting `t`, of one value `v`. */
const line = (t: string, s: string, v: number) => ({ t, s, l: {}, n: 1, sum: v, min: v, max: v, last: v });

/** `lines` written to their tier's file of their day, as the tick appends them. */
const kept = (tier: 'minute' | 'hour', lines: ReturnType<typeof line>[]) => {
  fs.mkdirSync(path.join(METRICS, tier), { recursive: true });
  for (const x of lines) fs.appendFileSync(path.join(METRICS, tier, `${x.t.slice(0, 10)}.jsonl`), `${JSON.stringify(x)}\n`);
};

const minuteAgo = (n: number) => new Date(Math.floor(Date.now() / 60_000) * 60_000 - n * 60_000).toISOString();

const series = async (query = ''): Promise<{ status: number; body: unknown }> => {
  const res = await app.request(`/api/series${query}`);
  return { status: res.status, body: await res.json() };
};

test("The board reads the system's series and health off the lines the tick keeps: none, a day by the minute, a line since, all of it by the day, a range refused, and health null where no hour was kept", async (t) => {
  const s = story(t);
  await s.test(
    'GET /api/series answers the last day a point a minute by default, all of it a point a day, and a line written since',
    async () => {
      fs.rmSync(METRICS, { recursive: true, force: true });
      const none = (await series()).body as SeriesRead;
      assert.deepEqual([none.range, none.span, none.series], ['24h', 'minute', []], 'nothing kept, nothing answered');
      kept('minute', [line(minuteAgo(3), 'store.runs', 4), line(minuteAgo(2), 'store.runs', 6)]);
      const day = await series();
      assert.equal(day.status, 200);
      const read = day.body as SeriesRead;
      assert.deepEqual(
        read.series.map((x) => [x.s, x.points.map((p) => p.last)]),
        [['store.runs', [4, 6]]],
      );
      kept('minute', [line(minuteAgo(1), 'store.runs', 9)]);
      assert.deepEqual(
        ((await series('?range=24h')).body as SeriesRead).series[0].points.map((p) => p.last),
        [4, 6, 9],
        'a day whose file moved is read again',
      );
      kept('hour', [line('2026-09-01T10:00:00.000Z', 'store.runs', 2), line('2026-09-01T11:00:00.000Z', 'store.runs', 3)]);
      const all = (await series('?range=all')).body as SeriesRead;
      assert.equal(all.span, 'day');
      assert.deepEqual(
        all.series[0].points.map((p) => [p.t, p.n, p.max]),
        [['2026-09-01T00:00:00.000Z', 2, 3]],
      );
    },
  );
  await s.test('REFUSED: GET /api/series with a range it does not take, as Invalid: 422, naming the ranges', async () => {
    const { status, body } = await series('?range=2w');
    assert.equal(status, 422);
    const { error } = body as { error: string };
    for (const fact of ['--range', '24h, 7d, 30d, all', '"2w"']) assert.ok(error.includes(fact), `names ${fact}: ${error}`);
  });
  await s.test("GET /api/stats says the system's health over its days off the hour lines, and null where none was kept", async () => {
    fs.rmSync(METRICS, { recursive: true, force: true });
    const empty = (await (await app.request('/api/stats?from=2026-09-01&to=2026-09-02')).json()) as Stats;
    assert.equal(empty.health.runs, null);
    kept('hour', [line('2026-09-01T10:00:00.000Z', 'store.runs', 2), line('2026-09-02T11:00:00.000Z', 'store.runs', 30)]);
    const one = (await (await app.request('/api/stats?from=2026-09-01&to=2026-09-01')).json()) as Stats;
    assert.equal(one.health.runs, 2);
    fs.rmSync(METRICS, { recursive: true, force: true });
  });
});

/**
 * The series kept and read (`keepSeries`, `seriesRead` in `series.store.ts`): passes rolled into minutes and the minutes into an hour
 * once it is done, a restart rolling nothing twice, the days past their retention deleted, a range read that writes nothing and is
 * answered from a memo while its file has not moved, and `nemia series` with a range it does not take refused. A store of its own:
 * `WF_ROOT` is read as the module loads.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { Engine } from 'agent-runtime';
import { scratch } from '../../test/scratch.ts';

process.env.WF_ROOT = scratch('wf-series-kept-');
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_METRICS_MINUTE_DAYS;
delete process.env.WF_METRICS_HOUR_DAYS;
const { main } = await import('../cli/main.ts');
const { PHASES } = await import('../meter/meter.ts');
const { appendLines, dayFile, days, keepSeries, rangeOf, readDay, seriesHealth, seriesRead, tierDir } = await import('./series.store.ts');
const { seriesMemo } = await import('./series.ts');
type RecentPass = import('../meter/meter.ts').RecentPass;

/** No pass is run: the engine is never asked. */
const NO_ENGINE = {} as Engine;

const pass = (at: string, ms: number): RecentPass => ({
  at,
  ms,
  runs: 40,
  tasks: 0,
  queued: 0,
  admitted: 0,
  records: 0,
  rested: 0,
  reads: 1,
  phases: Object.fromEntries(PHASES.map((p) => [p, 1])) as RecentPass['phases'],
  waitMs: 0,
  load: 0.5,
});

const at = (hhmmss: string) => Date.parse(`2026-10-05T${hhmmss}Z`);

const passMs = (tier: 'minute' | 'hour') =>
  readDay(tier, '2026-10-05')
    .filter((x) => x.s === 'pass.ms')
    .map((x) => [x.t.slice(11, 16), x.n, x.sum]);

const filesNow = () =>
  ['minute', 'hour'].flatMap((tier) =>
    days(tier as 'minute').map((d) => `${tier}/${d}:${fs.statSync(dayFile(tier as 'minute', d)).mtimeMs}`),
  );

test('passes roll into the minutes done, the minutes into the hour once it is done, and a restart rolls nothing twice', () => {
  const ring = [pass('2026-10-05T13:57:10Z', 10), pass('2026-10-05T13:58:05Z', 20)];
  keepSeries(ring, at('13:58:30'));
  assert.deepEqual(passMs('minute'), [['13:57', 1, 10]], 'the minute now is in is not done');
  ring.push(pass('2026-10-05T13:59:10Z', 30), pass('2026-10-05T14:00:05Z', 40));
  keepSeries(ring, at('14:00:30'));
  assert.deepEqual(passMs('minute'), [
    ['13:57', 1, 10],
    ['13:58', 1, 20],
    ['13:59', 1, 30],
  ]);
  assert.deepEqual(passMs('hour'), [['13:00', 3, 60]]);
  ring.push(pass('2026-10-05T14:01:05Z', 50));
  keepSeries(ring, at('14:01:30'));
  keepSeries(ring, at('14:01:40'));
  assert.deepEqual(passMs('minute').at(-1), ['14:00', 1, 40]);
  assert.equal(passMs('minute').length, 4, 'once each');
  assert.deepEqual(passMs('hour'), [['13:00', 3, 60]], 'the hour now is in waits');
});

test('the days past their retention go: minutes after 30 days by default, hours kept until deleted', () => {
  appendLines('minute', [{ t: '2026-09-04T10:00:00.000Z', s: 'store.runs', l: {}, n: 1, sum: 1, min: 1, max: 1, last: 1 }]);
  appendLines('minute', [{ t: '2026-09-05T10:00:00.000Z', s: 'store.runs', l: {}, n: 1, sum: 1, min: 1, max: 1, last: 1 }]);
  appendLines('hour', [{ t: '2020-01-01T10:00:00.000Z', s: 'store.runs', l: {}, n: 1, sum: 1, min: 1, max: 1, last: 1 }]);
  keepSeries([], at('14:02:00'));
  assert.deepEqual(days('minute'), ['2026-09-05', '2026-10-05']);
  assert.deepEqual(days('hour'), ['2020-01-01', '2026-10-05']);
  process.env.WF_METRICS_HOUR_DAYS = '30';
  try {
    keepSeries([], at('14:02:00'));
  } finally {
    delete process.env.WF_METRICS_HOUR_DAYS;
  }
  assert.deepEqual(days('hour'), ['2026-10-05']);
});

test('a range reads its points and writes nothing; a memo answers a day while its file has not moved, and reads it again once it has', () => {
  const before = filesNow();
  const memo = seriesMemo();
  const read = seriesRead('24h', memo, at('14:05:00'));
  assert.deepEqual(filesNow(), before, 'nothing written');
  assert.equal(read.span, 'minute');
  assert.deepEqual(
    read.series.find((x) => x.s === 'pass.ms')!.points.map((p) => p.mean),
    [10, 20, 30, 40],
  );
  const held = memo.get('minute/2026-10-05')!;
  memo.set('minute/2026-10-05', { ...held, lines: held.lines.filter((x) => x.s !== 'pass.ms') });
  assert.equal(
    seriesRead('24h', memo, at('14:05:00')).series.find((x) => x.s === 'pass.ms'),
    undefined,
    'from the memo',
  );
  keepSeries([pass('2026-10-05T14:03:10Z', 70)], at('14:04:00'));
  assert.equal(seriesRead('24h', memo, at('14:05:00')).series.find((x) => x.s === 'pass.ms')!.points.length, 5, 'read again');
  assert.equal(seriesHealth('2026-10-05', '2026-10-05').runs, 40);
  assert.equal(seriesHealth('2026-10-06', '2026-10-07').runs, null);
});

const typed = async (t: TestContext, argv: string[]) => {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.map(String).join(' '));
  });
  try {
    await main(argv, NO_ENGINE);
  } finally {
    log.mock.restore();
  }
  return printed;
};

test('`nemia series --json` is the answer the api serves; REFUSED: a --range it does not take, as Invalid, naming the ranges', async (t) => {
  const answer = JSON.parse((await typed(t, ['series', '--range', 'all', '--json'])).join('\n'));
  assert.deepEqual(answer.series, JSON.parse(JSON.stringify(seriesRead('all').series)));
  assert.equal(rangeOf(undefined), '24h');
  await assert.rejects(main(['series', '--range', '2w'], NO_ENGINE), (err: Error & { exitCode?: number }) => {
    assert.equal(err.exitCode, 2);
    assert.equal(err.message, '--range takes 24h, 7d, 30d, all: nemia series --range 7d, not "2w".');
    return true;
  });
  assert.ok(fs.existsSync(tierDir('minute')));
});

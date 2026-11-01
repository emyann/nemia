/**
 * The series' files (`series.store.ts`), on a scratch store's real disk: two tables and a bound. What a tier's day files hold and what
 * they refuse — a line labelled outside the closed set refused with nothing written, a line that does not read left out and its file
 * said once, a `--range` read or refused (`appendLines`, `readDay`, `rangeOf`, `nemia series`). What is kept and read on a pass —
 * passes rolled into minutes and the minutes into an hour once it is done, a restart rolling nothing twice, the days past their retention
 * deleted, a range read that writes nothing and is answered from a memo while its file has not moved, and `nemia series --json`
 * (`keepSeries`, `seriesRead`, `seriesHealth`). And the last line read off a bounded tail of the latest day (`lastLine`), measured in
 * bytes. Each row starts from tiers with no file (`fresh`). The math beneath them is `series.test.ts`'s.
 *
 * A store of its own: `WF_ROOT` is read as the module loads, so it is set before the import.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { testEngine } from 'agent-runtime/testing';
import { eachTest } from '../../test/placed.ts';
import { heldUnasked } from '../../test/unasked.ts';
import { scratch } from '../../test/scratch.ts';

process.env.WF_ROOT = scratch('wf-series-store-');
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_METRICS_MINUTE_DAYS;
delete process.env.WF_METRICS_HOUR_DAYS;
const { main } = await import('../cli/main.ts');
const { PHASES } = await import('../meter/meter.ts');
const { metered } = await import('../meter/tally.store.ts');
const { appendLines, dayFile, days, dropDay, keepSeries, lastLine, rangeOf, readDay, seriesHealth, seriesRead, tierDir } =
  await import('./series.store.ts');
const { RANGES, seriesMemo } = await import('./series.ts');
const { engineOf } = await import('../runtime-client.ts');
type RecentPass = import('../meter/meter.ts').RecentPass;
type RollupLine = import('./series.ts').RollupLine;

const engine = eachTest(testEngine);
heldUnasked(engine);

/** The engine of this test: the stand-in, which no command here files on, stops, says to or forgets from (`heldUnasked`). */
const noEngine = () => engineOf(engine().layer);

/** Both tiers with no file, as a store that never kept a series. */
const fresh = () => {
  for (const tier of ['minute', 'hour'] as const) fs.rmSync(tierDir(tier), { recursive: true, force: true });
};

/** A `store.runs` line at `t` of one sample `v`, labelled `l`. */
const line = (t: string, v: number, l: Record<string, string> = {}): RollupLine => ({
  t,
  s: 'store.runs',
  l,
  n: 1,
  sum: v,
  min: v,
  max: v,
  last: v,
});

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

/** The `pass.ms` lines of the day the passes are in, in `tier`: each line's minute, count and sum. */
const passMs = (tier: 'minute' | 'hour') =>
  readDay(tier, '2026-10-05')
    .filter((x) => x.s === 'pass.ms')
    .map((x) => [x.t.slice(11, 16), x.n, x.sum]);

/** Each day file of both tiers with the time it last changed. */
const filesNow = () =>
  (['minute', 'hour'] as const).flatMap((tier) => days(tier).map((d) => `${tier}/${d}:${fs.statSync(dayFile(tier, d)).mtimeMs}`));

/** What `nemia argv` printed on stdout, line by line. */
const typed = async (t: TestContext, argv: string[]) => {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.map(String).join(' '));
  });
  try {
    await main(argv, noEngine());
  } finally {
    log.mock.restore();
  }
  return printed;
};

/** That `err` is a refusal of kind `tag` with exit 2. */
const refusedAs =
  (tag: string) =>
  (err: Error & { exitCode?: number; _tag?: string }): true => {
    assert.equal(err._tag, tag, err.message);
    assert.equal(err.exitCode, 2, err.message);
    return true;
  };

/** Four passes rolled into the minutes 13:57 to 14:00, and those of 13:00 into its hour, by three passes of the tick. */
const fourMinutes = () => {
  const ring = [pass('2026-10-05T13:57:10Z', 10), pass('2026-10-05T13:58:05Z', 20)];
  keepSeries(ring, at('13:58:30'));
  ring.push(pass('2026-10-05T13:59:10Z', 30), pass('2026-10-05T14:00:05Z', 40));
  keepSeries(ring, at('14:00:30'));
  ring.push(pass('2026-10-05T14:01:05Z', 50));
  keepSeries(ring, at('14:01:30'));
};

const FILES: { name: string; check: (t: TestContext) => void | Promise<void> }[] = [
  {
    name: 'REFUSED: a line labelled by a run, as Invalid, and none of the lines handed with it written',
    check: () => {
      assert.throws(
        () => appendLines('hour', [line('2026-10-05T10:00:00.000Z', 1), line('2026-10-05T11:00:00.000Z', 2, { factory: 'f', run: 'r-1' })]),
        refusedAs('Invalid'),
      );
      assert.deepEqual(days('hour'), []);
    },
  },
  {
    name: 'lines go to the file of their UTC day, and a line that does not read is left out, its file said once',
    check: (t) => {
      appendLines('minute', [line('2026-10-04T23:59:00.000Z', 1), line('2026-10-05T00:00:00.000Z', 2)]);
      assert.deepEqual(days('minute'), ['2026-10-04', '2026-10-05']);
      fs.appendFileSync(dayFile('minute', '2026-10-05'), '{"t":"x"}\nnot json\n');
      appendLines('minute', [line('2026-10-05T00:01:00.000Z', 3)]);
      const said: string[] = [];
      t.mock.method(process.stderr, 'write', (text: string) => said.push(text) > 0);
      assert.deepEqual(
        readDay('minute', '2026-10-05').map((x) => x.sum),
        [2, 3],
      );
      assert.equal(said.length, 1, said.join(''));
      assert.ok(said[0].startsWith(`${dayFile('minute', '2026-10-05')}: 2 `), said[0]);
    },
  },
  {
    name: "a label's word is read in its closed set: a phase stored under its former word reads as today's, and a word of no set is left out",
    check: (t) => {
      const stored = (v: number, l: Record<string, string>) => `${JSON.stringify(line(`2026-10-06T0${v}:00:00.000Z`, v, l))}\n`;
      fs.mkdirSync(tierDir('hour'), { recursive: true });
      fs.writeFileSync(
        dayFile('hour', '2026-10-06'),
        [
          stored(1, { phase: 'git' }),
          stored(2, { phase: 'nope' }),
          stored(3, { part: 'runs', kind: 'nope' }),
          stored(4, { part: 'nope' }),
          stored(5, { part: 'runs', kind: 'records' }),
        ].join(''),
      );
      const said: string[] = [];
      t.mock.method(process.stderr, 'write', (text: string) => said.push(text) > 0);
      assert.deepEqual(
        readDay('hour', '2026-10-06').map((x) => [x.sum, x.l]),
        [
          [1, { phase: 'place' }],
          [5, { part: 'runs', kind: 'records' }],
        ],
      );
      assert.equal(said.length, 1, 'the three lines of no set are said once, with their file');
    },
  },
  { name: 'no file, no lines', check: () => assert.deepEqual(readDay('minute', '2026-01-01'), []) },
  { name: 'no last line before any is written', check: () => assert.equal(lastLine('hour'), undefined) },
  {
    name: 'a --range given none reads 24h, and each range it takes reads itself',
    check: () => {
      assert.equal(rangeOf(undefined), '24h');
      for (const range of Object.keys(RANGES)) assert.equal(rangeOf(range), range);
    },
  },
  {
    name: 'REFUSED: `nemia series --range 2w`, a range it does not take, as Invalid with exit 2',
    check: () => assert.rejects(main(['series', '--range', '2w'], noEngine()), refusedAs('Invalid')),
  },
];

test('`appendLines`, `readDay`, `lastLine` and `rangeOf`: what the files of a tier hold, and what they refuse', async (t) => {
  for (const row of FILES)
    await t.test(row.name, async (sub) => {
      fresh();
      await row.check(sub);
    });
});

const KEPT: { name: string; check: (t: TestContext) => void | Promise<void> }[] = [
  {
    name: 'passes roll into the minutes done, the minutes into the hour once it is done, and a restart rolls nothing twice',
    check: () => {
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
    },
  },
  {
    name: 'the days past their retention go: minutes after 30 days by default, hours kept until WF_METRICS_HOUR_DAYS says',
    check: (t) => {
      appendLines('minute', [
        line('2026-09-04T10:00:00.000Z', 1),
        line('2026-09-05T10:00:00.000Z', 1),
        line('2026-10-05T10:00:00.000Z', 1),
      ]);
      appendLines('hour', [line('2020-01-01T10:00:00.000Z', 1), line('2026-10-05T10:00:00.000Z', 1)]);
      keepSeries([], at('14:02:00'));
      assert.deepEqual(days('minute'), ['2026-09-05', '2026-10-05']);
      assert.deepEqual(days('hour'), ['2020-01-01', '2026-10-05']);
      process.env.WF_METRICS_HOUR_DAYS = '30';
      t.after(() => delete process.env.WF_METRICS_HOUR_DAYS);
      keepSeries([], at('14:02:00'));
      assert.deepEqual(days('hour'), ['2026-10-05']);
    },
  },
  {
    name: 'a range reads its points and writes nothing; a memo answers a day while its file has not moved, and reads it again once it has',
    check: () => {
      fourMinutes();
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
    },
  },
  {
    name: '`nemia series --json` is the answer the api serves',
    check: async (t) => {
      appendLines('hour', [line('2026-01-02T03:00:00.000Z', 7)]);
      const answer = JSON.parse((await typed(t, ['series', '--range', 'all', '--json'])).join('\n'));
      assert.ok(
        answer.series.some((x: { s: string }) => x.s === 'store.runs'),
        'the line kept is in the answer',
      );
      assert.deepEqual(answer.series, JSON.parse(JSON.stringify(seriesRead('all').series)));
    },
  },
  {
    name: "a memo keeps every day its tier's reads reach, whichever read came last: two readers alternate and neither reads again a day the other kept",
    check: () => {
      appendLines('minute', [line('2026-10-05T10:00:00.000Z', 2), line('2026-10-06T10:00:00.000Z', 2)]);
      appendLines('hour', [line('2026-08-01T10:00:00.000Z', 2), line('2026-10-04T10:00:00.000Z', 2), line('2026-10-05T10:00:00.000Z', 2)]);
      const memo = seriesMemo();
      seriesHealth(null, '2026-10-05', memo, at('14:05:00'));
      const old = memo.get('hour/2026-08-01');
      assert.ok(old, 'health from the first day holds the old day');
      seriesRead('7d', memo, at('14:05:00'));
      const recent = memo.get('hour/2026-10-05');
      assert.ok(recent, 'a 7d read holds the day it read');
      seriesHealth(null, '2026-10-05', memo, at('14:05:00'));
      seriesRead('7d', memo, at('14:05:00'));
      assert.equal(memo.get('hour/2026-08-01'), old, 'the 7d read left the day only health reads, and health did not read it again');
      assert.equal(memo.get('hour/2026-10-05'), recent, 'and neither read the day both read again');
      seriesRead('24h', memo, at('14:05:00'));
      assert.ok(memo.has('minute/2026-10-05'));
      seriesRead('24h', memo, Date.parse('2026-10-07T09:00:00Z'));
      assert.deepEqual(
        [...memo.keys()].filter((k) => k.startsWith('minute/')),
        ['minute/2026-10-06'],
        'a minute day no read of its tier reaches any more is gone',
      );
      assert.deepEqual(
        [...memo.keys()].filter((k) => k.startsWith('hour/')).sort(),
        days('hour').map((d) => `hour/${d}`),
        'every hour day stays',
      );
      dropDay('hour', '2026-08-01');
      seriesRead('7d', memo, at('14:05:00'));
      assert.equal(memo.has('hour/2026-08-01'), false, 'a day whose file is deleted is gone');
    },
  },
];

test('`keepSeries`, `seriesRead` and `seriesHealth`: the series kept on a pass, and read over a range or a period', async (t) => {
  for (const row of KEPT)
    await t.test(row.name, async (sub) => {
      fresh();
      await row.check(sub);
    });
});

test("the last line is read off the latest day's tail alone, however long the day", async () => {
  fresh();
  appendLines('minute', [line('2026-10-04T10:00:00.000Z', 1)]);
  appendLines(
    'minute',
    Array.from({ length: 2000 }, (_, k) => line(new Date(Date.UTC(2026, 9, 5, 0, 0, k)).toISOString(), k)),
  );
  assert.ok(fs.statSync(dayFile('minute', '2026-10-05')).size > 100_000);
  const { value, tallies } = await metered(async () => lastLine('minute'));
  assert.equal(value?.sum, 1999);
  const bytes = Object.values(tallies!.kinds).reduce((sum, k) => sum + k.bytes, 0);
  assert.equal(bytes, 16_384, 'the tail, not the day');
});

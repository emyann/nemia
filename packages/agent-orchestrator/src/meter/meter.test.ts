/**
 * What a pass costs, in words (`meter.ts`): the totals, the heaviest phases, the line `nemia up` says once an interval, the breakdown
 * `--stats` prints, and a cost read back off disk. Pure: the counting is `tally.store.ts`'s, proven on a store in tally.store.test.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addPass,
  breakdownLines,
  heaviest,
  PASS_BOUNDS,
  passCost,
  passesLines,
  passesRead,
  passHistogram,
  passParts,
  passSummary,
  PHASES,
  recentOf,
  sessionsOf,
  STATS_EVERY_MS,
  summaryDue,
  summaryLine,
  type Interval,
  type PassCost,
  type Phase,
  type PhaseCost,
  type RecentPass,
} from './meter.ts';

/** The rows of the meter's math, each a claim of one function of meter.ts, told by the one test at the end. */
const ROWS: Array<[string, () => void]> = [];
const row = (name: string, claim: () => void) => ROWS.push([name, claim]);

const phase = (ms: number, over: Partial<PhaseCost> = {}): PhaseCost => ({ ms, calls: 1, bytes: 0, reads: 0, spawned: 0, ...over });
const phases = (ms: Partial<Record<Phase, number>>, over: Partial<Record<Phase, Partial<PhaseCost>>> = {}) =>
  Object.fromEntries(PHASES.map((p) => [p, phase(ms[p] ?? 0, over[p])])) as Record<Phase, PhaseCost>;

const COST: PassCost = passCost({
  at: '2026-09-25T10:00:00.000Z',
  ms: 212,
  phases: phases(
    { records: 20, asks: 5, journals: 40, observe: 120, runtime: 8, place: 0, assess: 15, act: 3 },
    { records: { bytes: 12_000, reads: 12 }, journals: { bytes: 800_000, reads: 30 }, observe: { spawned: 1 }, place: { calls: 0 } },
  ),
  harnesses: { claude: { calls: 1, ms: 118, listed: 3, spawned: 1 }, check: { calls: 1, ms: 2, listed: 40, spawned: 0 } },
  records: 12,
  overheadMs: 0.4,
  rested: 0,
  runs: 40,
  tasks: 5,
  queued: 2,
  admitted: 3,
  waitMs: 4000,
  load: 0.5,
});

row("a pass's totals are its phases' bytes and processes, summed", () => {
  assert.equal(COST.bytes, 812_000);
  assert.equal(COST.spawned, 1);
});

row('the heaviest phases, longest first, three at most, none that took no time', () => {
  assert.deepEqual(heaviest(COST.phases), [
    { phase: 'observe', ms: 120 },
    { phase: 'journals', ms: 40 },
    { phase: 'records', ms: 20 },
  ]);
  assert.deepEqual(heaviest(phases({ place: 2 })), [{ phase: 'place', ms: 2 }]);
  assert.deepEqual(heaviest(phases({})), []);
});

/** `nemia up`'s loop, as it keeps the interval: a pass every `everyMs`, and the lines it says. */
const loop = (passes: number, everyMs: number): string[] => {
  const said: string[] = [];
  let interval: Interval | undefined;
  for (let k = 0; k < passes; k++) {
    const now = k * everyMs;
    interval = addPass(interval, COST, now);
    if (summaryDue(interval, now)) {
      said.push(summaryLine(interval, now));
      interval = undefined;
    }
  }
  return said;
};

row('`nemia up` says one line an interval, not one a pass: 61 passes four seconds apart are three lines of 16 passes each', () => {
  assert.equal(STATS_EVERY_MS, 60_000);
  assert.deepEqual(loop(15, 4000), [], 'fifteen passes are 56 seconds: nothing said yet');
  const said = loop(61, 4000);
  assert.equal(said.length, 3, said.join('\n'));
  for (const line of said) assert.match(line, /^cost: 16 passes in 60s, 212 ms a pass \(slowest 212\) — /);
  assert.equal(loop(3, 30_000).length, 1, 'a slow daemon says it as often, whatever its interval');
  assert.equal(summaryDue(undefined, 1e12), false, 'no pass, nothing to say');
});

row('the line says the heaviest phases over the interval, the bytes read, the processes started, and what measuring cost', () => {
  const i = addPass(addPass(undefined, COST, 0), COST, 4000);
  assert.equal(
    summaryLine(i, 60_000),
    'cost: 2 passes in 60s, 212 ms a pass (slowest 212) — observe 240, journals 80.0, records 40.0 ms in all — 1.6 MB read, 2 processes started; measuring 0.80 ms',
  );
});

row('the breakdown names every phase, each harness observed, and what measuring cost', () => {
  const lines = breakdownLines(COST);
  assert.equal(lines[0], 'the last pass, at 2026-09-25T10:00:00.000Z: 212 ms, 12 run records read, 812.0 kB read, 1 process started');
  assert.match(lines[1], /^ {2}phase +ms +calls +read +processes$/);
  for (const p of PHASES)
    assert.ok(
      lines.some((l) => new RegExp(`^  ${p} +`).test(l)),
      p,
    );
  assert.ok(lines.includes('  claude: 1 observe, 118 ms, 3 sessions or run files listed, 1 process started'), lines.join('\n'));
  assert.ok(lines.includes('  check: 1 observe, 2.00 ms, 40 sessions or run files listed, 0 processes started'), lines.join('\n'));
  assert.equal(lines.at(-1), 'measuring it: 0.40 ms');
  assert.ok(breakdownLines({ ...COST, harnesses: {} }).includes('no harness was observed'));
  assert.ok(
    breakdownLines({ ...COST, harnesses: { claude: { calls: 2, ms: 118, listed: 0, spawned: 2, unread: 2 } } }).includes(
      '  claude: 2 observes, 118 ms, 0 sessions or run files listed, 2 processes started, 2 could not read it',
    ),
    'an observe that could not read its harness is said beside the rest, and none is said of a harness read in full',
  );
  assert.equal(
    breakdownLines({ ...COST, rested: 200 })[0],
    'the last pass, at 2026-09-25T10:00:00.000Z: 212 ms, 12 run records read, 812.0 kB read, 1 process started, 200 runs at rest answered from memory',
  );
  assert.equal(breakdownLines({ ...COST, rested: 0 })[0], lines[0], 'none answered, nothing said of it');
});

row('a pass keeps what it saw beside its time: the runs listed, the tasks, the sessions queued and admitted', () => {
  const { runs, tasks, queued, admitted } = COST;
  assert.deepEqual({ runs, tasks, queued, admitted }, { runs: 40, tasks: 5, queued: 2, admitted: 3 });
  const kept = recentOf(COST);
  assert.deepEqual(
    { runs: kept.runs, tasks: kept.tasks, queued: kept.queued, admitted: kept.admitted, reads: kept.reads },
    { runs: 40, tasks: 5, queued: 2, admitted: 3, reads: 30 },
    "kept among the recent, with the journals phase's reads",
  );
  assert.equal(kept.phases.observe, 120);
  assert.ok(
    breakdownLines(COST).includes('it saw 40 runs in the store, 5 tasks not settled, 2 queued and 3 admitted, and made 30 journal reads'),
  );
});

row("the sessions a runtime's pass reported: queued off the views, admitted off the views and the sessions at work", () => {
  assert.deepEqual(
    sessionsOf(
      {
        views: [{ admission: 'queued' }, { admission: 'queued' }, { admission: 'admitted' }, {}],
        running: { claude: 2, codex: 1 },
      },
      0,
    ),
    { tasks: 4, queued: 2, admitted: 4, waitMs: 0 },
  );
  assert.deepEqual(sessionsOf({}, 0), { tasks: 0, queued: 0, admitted: 0, waitMs: 0 }, "a fake's report carries neither");
});

row("the wait is the oldest queued session's, since it was filed: never the newest, nor an admitted one, and 0 with none queued", () => {
  const now = Date.parse('2026-10-05T12:00:00.000Z');
  const ago = (s: number) => new Date(now - s * 1000).toISOString();
  const views = [
    { admission: 'queued' as const, state: { filedAt: ago(3) } },
    { admission: 'queued' as const, state: { filedAt: ago(10) } },
    { admission: 'admitted' as const, state: { filedAt: ago(60) } },
  ];
  assert.equal(sessionsOf({ views }, now).waitMs, 10_000);
  assert.equal(sessionsOf({ views: views.slice(2) }, now).waitMs, 0, 'none queued, no wait');
});

row('a pass keeps its wait and load among the recent, and the quota and checks only where it has some', () => {
  const kept = recentOf(COST);
  assert.deepEqual([kept.waitMs, kept.load, 'quota' in kept, 'checks' in kept], [4000, 0.5, false, false]);
  const check = { factory: 'acme', workflow: 'dev', step: 'implement', agent: 'implementer' };
  const also = recentOf(COST, { quota: { h: { w: 40 } }, checks: [check] });
  assert.deepEqual([also.quota, also.checks], [{ h: { w: 40 } }, [check]]);
});

const recent = (ms: number, phases: Partial<Record<Phase, number>> = {}): RecentPass => ({
  ...recentOf(COST),
  ms,
  phases: Object.fromEntries(PHASES.map((p) => [p, phases[p] ?? 0])) as Record<Phase, number>,
});

row('a pass falls in the first bucket whose bound it does not pass: 100 ms in ≤ 100, 100.1 in ≤ 250, past the last in the open one', () => {
  const passes = [100, 100.1, 5000, 5000.5, 0, 9].map((ms) => recent(ms));
  const h = passHistogram(passes);
  assert.equal(h.length, PASS_BOUNDS.length + 1);
  assert.equal(
    h.reduce((n, b) => n + b.count, 0),
    passes.length,
    'the counts add up to the passes',
  );
  const at = (le: number | null) => h.find((b) => b.le === le)!.count;
  assert.equal(at(100), 1, 'exactly 100 ms is ≤ 100');
  assert.equal(at(250), 1, '100.1 ms is past 100');
  assert.equal(at(10), 2);
  assert.equal(at(5000), 1);
  assert.equal(at(null), 1, 'over 5000 ms has no bound');
});

row('the parts are each phase a pass on average, heaviest first, their shares adding up to no more than the whole', () => {
  const passes = [
    recent(100, { place: 40, act: 10, records: 20 }),
    recent(50, { place: 10, act: 30 }),
    recent(30, { act: 20, records: 1 }),
  ];
  const parts = passParts(passes);
  assert.deepEqual(
    parts.slice(0, 3).map((p) => p.phase),
    ['act', 'place', 'records'],
  );
  assert.equal(parts[0].ms, 20);
  assert.ok(parts.reduce((n, p) => n + p.share, 0) <= 1);
  assert.equal(parts[0].share, 60 / 180);
  assert.deepEqual(passParts([]), []);
});

row('the summary is the median and slowest pass, and what the latest saw; none for no pass', () => {
  const s = passSummary([recent(30), { ...recent(10), runs: 7 }, recent(500), { ...recent(20), runs: 9, reads: 4 }])!;
  assert.deepEqual(
    { passes: s.passes, medianMs: s.medianMs, slowestMs: s.slowestMs, runs: s.runs, reads: s.reads },
    { passes: 4, medianMs: 25, slowestMs: 500, runs: 9, reads: 4 },
  );
  assert.equal(passSummary([]), null);
});

row("`nemia passes`' lines: the summary, a row a bucket from the first with passes to the last, and the parts", () => {
  const lines = passesLines(passesRead([recent(30, { act: 30 }), recent(80, { place: 80 })]));
  assert.match(lines[0], /^2 passes since .*: 55\.0 ms a pass \(median\), slowest 80\.0$/);
  assert.equal(lines.filter((l) => /^ +≤ \d+ ms /.test(l)).length, 2, lines.join('\n'));
  assert.ok(lines.includes('  place       40.0 ms  73%'), lines.join('\n'));
  assert.match(passesLines(passesRead([]))[0], /^no pass is kept yet/);
});

test("the meter's math: what a pass costs, in words, a row a claim", async (t) => {
  for (const [name, claim] of ROWS) await t.test(name, claim);
});

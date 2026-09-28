/**
 * What a pass costs, in words (`meter.ts`): the totals, the heaviest phases, the line `wf up` says once an interval, the breakdown `--stats`
 * prints, and a cost read back off disk. Pure: the counting is `tally.ts`'s, proven on a store in meter-store.test.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addPass,
  breakdownLines,
  heaviest,
  passCost,
  PHASES,
  STATS_EVERY_MS,
  summaryDue,
  summaryLine,
  type Interval,
  type PassCost,
  type Phase,
  type PhaseCost,
} from '../src/meter.ts';

const phase = (ms: number, over: Partial<PhaseCost> = {}): PhaseCost => ({ ms, calls: 1, bytes: 0, reads: 0, spawned: 0, ...over });
const phases = (ms: Partial<Record<Phase, number>>, over: Partial<Record<Phase, Partial<PhaseCost>>> = {}) =>
  Object.fromEntries(PHASES.map((p) => [p, phase(ms[p] ?? 0, over[p])])) as Record<Phase, PhaseCost>;

const COST: PassCost = passCost({
  at: '2026-09-25T10:00:00.000Z',
  ms: 212,
  phases: phases(
    { records: 20, asks: 5, journals: 40, observe: 120, runtime: 8, git: 0, assess: 15, act: 3 },
    { records: { bytes: 12_000, reads: 12 }, journals: { bytes: 800_000, reads: 30 }, observe: { spawned: 1 }, git: { calls: 0 } },
  ),
  harnesses: { claude: { calls: 1, ms: 118, listed: 3, spawned: 1 }, check: { calls: 1, ms: 2, listed: 40, spawned: 0 } },
  records: 12,
  overheadMs: 0.4,
});

test("a pass's totals are its phases' bytes and processes, summed", () => {
  assert.equal(COST.bytes, 812_000);
  assert.equal(COST.spawned, 1);
});

test('the heaviest phases, longest first, three at most, none that took no time', () => {
  assert.deepEqual(heaviest(COST.phases), [
    { phase: 'observe', ms: 120 },
    { phase: 'journals', ms: 40 },
    { phase: 'records', ms: 20 },
  ]);
  assert.deepEqual(heaviest(phases({ git: 2 })), [{ phase: 'git', ms: 2 }]);
  assert.deepEqual(heaviest(phases({})), []);
});

/** `wf up`'s loop, as it keeps the interval: a pass every `everyMs`, and the lines it says. */
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

test('`wf up` says one line an interval, not one a pass: 61 passes four seconds apart are three lines of 16 passes each', () => {
  assert.equal(STATS_EVERY_MS, 60_000);
  assert.deepEqual(loop(15, 4000), [], 'fifteen passes are 56 seconds: nothing said yet');
  const said = loop(61, 4000);
  assert.equal(said.length, 3, said.join('\n'));
  for (const line of said) assert.match(line, /^cost: 16 passes in 60s, 212 ms a pass \(slowest 212\) — /);
  assert.equal(loop(3, 30_000).length, 1, 'a slow daemon says it as often, whatever its interval');
  assert.equal(summaryDue(undefined, 1e12), false, 'no pass, nothing to say');
});

test('the line says the heaviest phases over the interval, the bytes read, the processes started, and what measuring cost', () => {
  const i = addPass(addPass(undefined, COST, 0), COST, 4000);
  assert.equal(
    summaryLine(i, 60_000),
    'cost: 2 passes in 60s, 212 ms a pass (slowest 212) — observe 240, journals 80.0, records 40.0 ms in all — 1.6 MB read, 2 processes started; measuring 0.80 ms',
  );
});

test('the breakdown names every phase, each harness observed, and what measuring cost', () => {
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
  // An observe that could not read its harness is said beside the rest, and none is said of a harness read in full.
  assert.ok(
    breakdownLines({ ...COST, harnesses: { claude: { calls: 2, ms: 118, listed: 0, spawned: 2, unread: 2 } } }).includes(
      '  claude: 2 observes, 118 ms, 0 sessions or run files listed, 2 processes started, 2 could not read it',
    ),
  );
  assert.equal(
    breakdownLines({ ...COST, rested: 200 })[0],
    'the last pass, at 2026-09-25T10:00:00.000Z: 212 ms, 12 run records read, 812.0 kB read, 1 process started, 200 runs at rest answered from memory',
  );
  assert.equal(breakdownLines({ ...COST, rested: 0 })[0], lines[0], 'none answered, nothing said of it');
});

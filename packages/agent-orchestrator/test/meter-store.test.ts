/**
 * What a pass costs, counted on a store (`tally.ts`, composed by `tick`): the phases add up to the pass, the run records read are counted,
 * the harnesses' observes are moved out of the runtime's pass, and the cost is written for `wf up --stats` and read back.
 *
 * A file of its own, since `tick` reads every run under `WF_ROOT`: the runs of the other store tests would be counted in it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Engine } from 'agent-runtime';
import type { Run } from '../src/run.ts';
import { breakdownLines, PHASES, type PassCost } from '../src/meter.ts';
import { scratch } from './scratch.ts';

const ROOT = scratch('wf-meter-');
const RUNS = path.join(ROOT, 'runs');
const STATS = path.join(ROOT, 'tick-stats.json');

// WF_ROOT is read as the module loads, so it is set before the import rather than after it.
process.env.WF_ROOT = ROOT;
// Every run a pass answers from its memo of runs at rest is judged in full as well, and a difference throws (`verifyRest` in tick.ts).
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_RUNS;
const { lastPassCost, listRuns, readRun, start, tick } = await import('../src/runner.ts');
const { metered, within } = await import('../src/tally.ts');

/** A spin, so a fake's time is spent on the thread the meter measures, not handed to a timer that may fire late. */
const busy = (ms: number) => { const until = performance.now() + ms; while (performance.now() < until) { /* spin */ } };

/**
 * An engine whose tasks stay pending, and whose pass takes `passMs`, of which `observeMs` is one harness's observe: the runtime's report of
 * it (`io()`) grows by that observe during the pass, as the real one's does, and reading it takes `ioMs`. `withIo: false` is a fake that keeps no
 * totals at all. `queued` names tasks its pass reports waiting to be admitted, and admitting them takes `admitMs`; `admitted` has each word.
 * `unread`, when given, is how many of each pass's observes could not read the harness; not given, the fake is a runtime that counts none.
 */
const fake = ({ passMs = 0, observeMs = 0, withIo = true, ioMs = 0, queued = [] as string[], admitMs = 0, unread = undefined as number | undefined } = {}) => {
  const admitted: string[][] = [];
  const io = { bytesRead: 0, reads: 0, spawned: 0, observed: {} as Record<string, { calls: number; ms: number; listed: number; spawned: number; unread?: number }> };
  const e = {
    tick: async () => {
      busy(passMs);
      const o = io.observed.claude ?? { calls: 0, ms: 0, listed: 0, spawned: 0 };
      io.observed.claude = { calls: o.calls + 1, ms: o.ms + observeMs, listed: o.listed + 4, spawned: o.spawned + 1, ...(unread !== undefined ? { unread: (o.unread ?? 0) + unread } : {}) };
      io.spawned += 1;
      io.bytesRead += 1000;
      io.reads += 2;
      const views = queued.map((id) => ({ id, phase: 'pending', admission: 'queued', state: { harness: 'claude', filedAt: '2026-09-25T10:00:00.000Z' } }));
      return { tasks: queued.length, actions: 0, running: {}, views };
    },
    admit: async (ids: string[]) => { busy(admitMs); admitted.push(ids); return ids; },
    view: async (id: string) => ({ id, phase: 'pending', sessionId: null, state: { brief: '', settled: null, stopRequested: false, said: [], attempts: [] } }),
    file: async (spec: { id: string }) => spec.id,
    stop: async () => {},
    logs: async () => '(no output yet)',
    feed: async () => ({ entries: [], cursor: 0 }),
    ...(withIo ? { io: () => { busy(ioMs); return structuredClone(io); } } : {}),
  } as unknown as Engine;
  return Object.assign(e, { admitted });
};

const emptyStore = () => {
  for (const f of [RUNS, path.join(ROOT, 'feed.jsonl'), path.join(ROOT, 'tick.json'), STATS]) fs.rmSync(f, { recursive: true, force: true });
  fs.mkdirSync(RUNS, { recursive: true });
};

const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo, stdio: 'ignore' });
  git('init', '-q');
  git('commit', '-q', '--allow-empty', '-m', 'base');
  return repo;
};

/** A workflow of one step, whose task the fake keeps pending for ever. */
const oneStep = (() => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'work.md'), 'work\n');
  return dir;
})();

const started = (n: number): Run[] => Array.from({ length: n }, (_, k) => start({ brief: `run ${k}`, repo: aRepo(), workflowDir: oneStep, isolate: false }));

const phaseSum = (c: PassCost) => PHASES.reduce((n, p) => n + c.phases[p].ms, 0);

test('a pass\'s phases add up to its time, less what measuring took, and the time is no more than the pass took seen from outside', async () => {
  emptyStore();
  started(3);
  const e = fake({ passMs: 20, observeMs: 12 });
  for (let k = 0; k < 3; k++) {
    const t0 = performance.now();
    const { cost } = await tick(e);
    const outside = performance.now() - t0;
    assert.ok(cost, 'the pass says what it cost');
    assert.ok(cost.ms <= outside, `the pass's ${cost.ms} ms fit in the ${outside} ms tick took`);
    const sum = phaseSum(cost);
    assert.ok(sum <= cost.ms + 0.01, `the phases (${sum} ms) are no more than the pass (${cost.ms} ms)`);
    assert.ok(cost.ms - sum <= cost.overheadMs + 0.5, `the phases (${sum} ms) and measuring (${cost.overheadMs} ms) cover the pass (${cost.ms} ms)`);
    assert.ok(cost.overheadMs < cost.ms, 'measuring costs less than what it measures');
    for (const p of PHASES) assert.ok(cost.phases[p].ms >= 0, `${p} took no negative time`);
  }
});

test('what measuring took is in no phase: a runtime whose report is slow to read adds to the overhead, and the phases stay the rest', async () => {
  emptyStore();
  started(3);
  // Metered from outside, so the meter's own counts are read: the pass's `overheadMs` also has what came after its time (composing, writing).
  const { ms, tallies } = await metered(() => tick(fake({ passMs: 5, ioMs: 3 })));
  assert.ok(tallies);
  const sum = PHASES.reduce((n, p) => n + tallies.kinds[p].ms, 0);
  const reads = 2 * (tallies.kinds.runtime.calls + tallies.kinds.journals.calls);
  assert.ok(tallies.overheadMs >= 3 * reads, `the report read twice by each of the ${reads / 2} passes and reads, 3 ms a read, is overhead (${tallies.overheadMs} ms)`);
  assert.ok(Math.abs(ms - sum - tallies.overheadMs) <= 0.5, `the phases (${sum} ms) and measuring (${tallies.overheadMs} ms) are the pass (${ms} ms), no more and no less`);
});

test('a pass on a fixture store counts the run records it read: twice as many runs, twice as many records', async () => {
  emptyStore();
  const e = fake();
  const none = (await tick(e)).cost!;
  assert.equal(none.records, 0, 'no runs, no records');

  started(2);
  const two = (await tick(e)).cost!;
  assert.ok(two.records >= 2, `each run's record read at least once (read ${two.records})`);
  const perRun = two.records / 2;
  assert.equal(perRun, Math.round(perRun), `a whole number of reads a run (${two.records} for two)`);

  started(2);
  // Measured before the pass, which may write a record back longer than it read it.
  const recordBytes = listRuns().reduce((n, r) => n + fs.statSync(path.join(RUNS, `${r.id}.json`)).size, 0);
  const four = (await tick(e)).cost!;
  assert.equal(four.records, perRun * 4, `four runs are read ${perRun} times each, as two were`);
  assert.ok(four.phases.records.bytes >= recordBytes, `the records phase read every record's ${recordBytes} bytes (counted ${four.phases.records.bytes})`);
  assert.ok(four.phases.records.calls >= four.records, 'each record read is a call of the records phase');
});

test('a harness\'s observe is moved out of the runtime\'s pass into observe, and the harness is named with what it listed', async () => {
  emptyStore();
  started(1);
  const { cost } = await tick(fake({ passMs: 30, observeMs: 20 }));
  assert.ok(cost);
  assert.deepEqual(cost.harnesses, { claude: { calls: 1, ms: 20, listed: 4, spawned: 1 } });
  // What could not be read is counted per pass, and said only when there was some.
  const e = fake({ observeMs: 20, unread: 1 });
  assert.equal((await tick(e)).cost!.harnesses.claude!.unread, 1, 'an observe that could not read its harness');
  assert.equal((await tick(e)).cost!.harnesses.claude!.unread, 1, 'counted for the pass, not the running total');
  assert.equal(Object.hasOwn((await tick(fake({ unread: 0 }))).cost!.harnesses.claude!, 'unread'), false, 'none unread, nothing said');
  assert.equal(cost.phases.observe.ms, 20, 'the observe\'s time, as the runtime reported it');
  assert.equal(cost.phases.observe.calls, 1);
  assert.equal(cost.phases.observe.spawned, 1, 'the process the observe started is observe\'s');
  assert.equal(cost.phases.runtime.spawned, 0);
  // Its 30 ms is a floor, never a ceiling: a process parked after the spin takes longer, and `< 30` failed at 30.8 under load. Moved
  // and not copied is what the phases adding up to no more than the pass says, whatever the scheduler did.
  assert.ok(cost.phases.runtime.ms >= 9, `the runtime's pass keeps the rest of its 30 ms (${cost.phases.runtime.ms})`);
  assert.ok(phaseSum(cost) <= cost.ms + 0.01, `the observe's 20 ms is counted once: the phases (${phaseSum(cost)} ms) are no more than the pass (${cost.ms} ms)`);
  assert.equal(cost.phases.runtime.bytes, 1000, 'what the runtime read is counted where it was called');
  assert.equal(cost.spawned, cost.phases.observe.spawned + cost.phases.git.spawned + PHASES.filter((p) => p !== 'observe' && p !== 'git').reduce((n, p) => n + cost.phases[p].spawned, 0));
});

test('an engine that keeps no totals is still metered, with no harness named', async () => {
  emptyStore();
  started(1);
  const { cost } = await tick(fake({ withIo: false }));
  assert.ok(cost);
  assert.deepEqual(cost.harnesses, {});
  assert.equal(cost.phases.observe.ms, 0);
  assert.ok(cost.phases.runtime.calls >= 1, 'the runtime\'s pass is still a call');
});

test('the last pass\'s cost is written to the store and read back; a file that does not read as one reads as none', async () => {
  emptyStore();
  assert.equal(lastPassCost(), undefined, 'no pass, no cost');
  started(1);
  const { cost } = await tick(fake());
  const read = lastPassCost();
  assert.ok(read && cost);
  assert.equal(read.at, cost.at);
  assert.equal(read.ms, cost.ms);
  assert.equal(read.records, cost.records);
  assert.ok(read.overheadMs <= cost.overheadMs, 'the file cannot hold its own write; the pass\'s answer does');
  assert.equal(fs.readdirSync(ROOT).filter((f) => f.includes('tick-stats') && f !== 'tick-stats.json').length, 0, 'no temporary file is left');
  fs.writeFileSync(STATS, '{"at":"2026-09-25T10:00:00.000Z","ms":');
  assert.equal(lastPassCost(), undefined);
});

test('outside a pass the readers count nothing, and a pass inside a metered call is counted as part of it', async () => {
  emptyStore();
  const [run] = started(1);
  const outside = await metered(async () => 'none');
  assert.equal(outside.tallies!.records, 0);
  readRun(run!.id); // not metered: nothing is open to count it in
  const outer = await metered(async () => {
    readRun(run!.id);
    within('act', () => busy(2));
    const inner = await tick(fake());
    assert.equal(inner.cost, undefined, 'a pass inside another\'s meter carries no cost of its own');
    return 'done';
  });
  assert.ok(outer.tallies!.records >= 2, 'the outer meter counted its own read and the inner pass\'s');
  assert.ok(outer.tallies!.kinds.act.ms >= 2);
});

test('the word that admits a queued task is charged to act, and `wf tick --stats` says so', async () => {
  emptyStore();
  const e = fake({ queued: ['t-1'], admitMs: 25 });
  const { cost } = await tick(e);
  assert.deepEqual(e.admitted, [['t-1']], 'the pass admitted the task its runtime reported queued, once');
  assert.ok(cost);
  assert.ok(cost.phases.act.ms >= 25, `the admit's 25 ms are act's (act took ${cost.phases.act.ms} ms)`);
  assert.ok(cost.phases.assess.ms < 25, `and not assess's, the time in no phase (${cost.phases.assess.ms} ms)`);
  const row = breakdownLines(cost).find((l) => /^ {2}act /.test(l));
  assert.ok(row, breakdownLines(cost).join('\n'));
  const [, ms] = row.trim().split(/ +/);
  assert.ok(Number(ms) >= 25, `the breakdown's act row carries it: ${row}`);

  const idle = fake({ admitMs: 25 });
  await tick(idle);
  assert.deepEqual(idle.admitted, [], 'nothing queued, no word said');
});

/**
 * What a pass costs, counted on a store (`tally.store.ts`, composed by `tick`): the phases add up to the pass, the run records read are
 * counted, the harnesses' observes are moved out of the runtime's pass, and the cost is written for `nemia up --stats` and read back.
 *
 * A file of its own, since `tick` reads every run under `WF_ROOT`: the runs of the other store tests would be counted in it. `WF_ROOT` is
 * read as the module loads, so it is set before the import. `WF_VERIFY_REST=1` judges in full every run a pass answers from its memo of
 * runs at rest, and a difference throws (`verifyRest` in tick.verb.ts).
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Run } from '../record/record.ts';
import { PHASES, type PassCost } from './meter.ts';
import { scratch } from '../../test/scratch.ts';
import { promised } from '../../test/promised.ts';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runGiven, runOver } from '../../test/placed.ts';
import { storeRootLayer } from '../config/root.store.ts';

const ROOT = scratch('wf-meter-');
const RUNS = path.join(ROOT, 'runs');
const STATS = path.join(ROOT, 'tick-stats.json');

process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_RUNS;
delete process.env.WF_MAX_CONCURRENT;
const { lastPassCost, startRun, tickRun, runWith: runEngine } = await import('../runner.ts');
const stand = eachTest(testPlace);
const runWith = runOver(runEngine, () => stand().layer);
const runPlaced = runGiven(() => stand().layer);
const { EngineService } = await import('../runtime-client.ts');
const { recentFile, recentPasses } = await import('../daemon/daemon.store.ts');
const { listRuns, readRun } = await import('../record/record.store.ts');
const { metered, meteredPass, metering, within } = await import('./tally.store.ts');
const { Effect, Fiber, Metric } = await import('effect');
const { Invalid } = await import('../refusal/refusal.ts');

/** A spin, so a fake's time is spent on the thread the meter measures, not handed to a timer that may fire late. */
const busy = (ms: number) => {
  const until = performance.now() + ms;
  while (performance.now() < until) {}
};

/**
 * An engine whose tasks stay pending, and whose pass takes `passMs`, of which `observeMs` is one harness's observe: the runtime's report of
 * it (`io()`) grows by that observe during the pass, as the real one's does, and reading it takes `ioMs`. `withIo: false` is a fake that
 * keeps no totals at all. `queued` names tasks its pass reports waiting to be admitted, `running` its sessions at work by harness, and
 * `admitted` has each word said to it.
 * `unread`, when given, is how many of each pass's observes could not read the harness; not given, the fake is a runtime that counts none.
 * `unobserved` is what each pass says it could not read, as the runtime words it.
 */
const fake = ({
  passMs = 0,
  observeMs = 0,
  withIo = true,
  ioMs = 0,
  queued = [] as string[],
  running = {},
  unread = undefined as number | undefined,
  unobserved = [] as string[],
} = {}) => {
  const admitted: string[][] = [];
  const io = {
    bytesRead: 0,
    reads: 0,
    spawned: 0,
    observed: {} as Record<string, { calls: number; ms: number; listed: number; spawned: number; unread?: number }>,
  };
  const e = promised({
    tick: async () => {
      busy(passMs);
      const o = io.observed.claude ?? { calls: 0, ms: 0, listed: 0, spawned: 0 };
      io.observed.claude = {
        calls: o.calls + 1,
        ms: o.ms + observeMs,
        listed: o.listed + 4,
        spawned: o.spawned + 1,
        ...(unread !== undefined ? { unread: (o.unread ?? 0) + unread } : {}),
      };
      io.spawned += 1;
      io.bytesRead += 1000;
      io.reads += 2;
      const views = queued.map((id) => ({
        id,
        phase: 'pending',
        admission: 'queued',
        state: { harness: 'claude', filedAt: '2026-09-25T10:00:00.000Z' },
      }));
      return { tasks: queued.length, actions: 0, running, views, unobserved };
    },
    admit: async (ids: string[]) => {
      admitted.push(ids);
      return ids;
    },
    view: async (id: string) => ({
      id,
      phase: 'pending',
      sessionId: null,
      state: { brief: '', settled: null, stopRequested: false, said: [], attempts: [] },
    }),
    file: async (spec: { id: string }) => spec.id,
    stop: async () => {},
    logs: async () => '(no output yet)',
    feed: async () => ({ entries: [], cursor: 0 }),
    ...(withIo
      ? {
          io: () => {
            busy(ioMs);
            return structuredClone(io);
          },
        }
      : {}),
  });
  return Object.assign(e, { admitted });
};

const emptyStore = () => {
  for (const f of [RUNS, path.join(ROOT, 'feed.jsonl'), path.join(ROOT, 'tick.json'), STATS])
    fs.rmSync(f, { recursive: true, force: true });
  fs.mkdirSync(RUNS, { recursive: true });
};

const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stand().world.repository(repo, {});
  return repo;
};

/** A workflow of one step, whose task the fake keeps pending for ever. */
const oneStep = (() => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'work.md'), '---\nplace: git\n---\nwork\n');
  return dir;
})();

const started = async (n: number): Promise<Run[]> => {
  const runs: Run[] = [];
  for (let k = 0; k < n; k++)
    runs.push(await runPlaced(startRun({ brief: `run ${k}`, repo: aRepo(), workflowDir: oneStep, isolate: false })));
  return runs;
};

/** The rows of each table below, a claim each, told by the four tests at the end of the file. */
type Rows = Array<[string, (t: TestContext) => void | Promise<void>]>;
const TIME: Rows = [];
const COUNTS: Rows = [];
const WRITES: Rows = [];
const WHOSE: Rows = [];
const time = (name: string, claim: (t: TestContext) => void | Promise<void>) => TIME.push([name, claim]);
const counts = (name: string, claim: (t: TestContext) => void | Promise<void>) => COUNTS.push([name, claim]);
const writes = (name: string, claim: (t: TestContext) => void | Promise<void>) => WRITES.push([name, claim]);
const whose = (name: string, claim: (t: TestContext) => void | Promise<void>) => WHOSE.push([name, claim]);

const phaseSum = (c: PassCost) => PHASES.reduce((n, p) => n + c.phases[p].ms, 0);

/**
 * The rounding of a sum of doubles, in ms: the phases and the overhead are differences of clock readings that add up to the pass exactly,
 * so this is never time, only the last bits a float loses, far below any stall of the process.
 */
const ROUNDING_MS = 1e-6;

time(
  "a pass's phases add up to its time, less what measuring took, and the time is no more than the pass took seen from outside",
  async () => {
    emptyStore();
    await started(3);
    const e = fake({ passMs: 20, observeMs: 12 });
    for (let k = 0; k < 3; k++) {
      const t0 = performance.now();
      const { cost } = await runWith(e, tickRun());
      const outside = performance.now() - t0;
      assert.ok(cost, 'the pass says what it cost');
      assert.ok(cost.ms <= outside, `the pass's ${cost.ms} ms fit in the ${outside} ms tick took`);
      const sum = phaseSum(cost);
      assert.ok(sum <= cost.ms + ROUNDING_MS, `the phases (${sum} ms) are no more than the pass (${cost.ms} ms)`);
      assert.ok(
        cost.ms - sum <= cost.overheadMs + ROUNDING_MS,
        `the phases (${sum} ms) and measuring (${cost.overheadMs} ms) cover the pass (${cost.ms} ms)`,
      );
      assert.ok(
        sum + cost.overheadMs <= outside + ROUNDING_MS,
        `the phases (${sum} ms) and measuring, the cost's write after the pass included (${cost.overheadMs} ms), fit in the ${outside} ms tick took`,
      );
      for (const p of PHASES) assert.ok(cost.phases[p].ms >= 0, `${p} took no negative time`);
    }
  },
);

time(
  'what measuring took is in no phase: a runtime whose report is slow to read adds to the overhead, and the phases stay the rest',
  async () => {
    emptyStore();
    await started(3);
    const { ms, tallies } = await metered(() => runWith(fake({ passMs: 5, ioMs: 3 }), tickRun()));
    assert.ok(tallies);
    const sum = PHASES.reduce((n, p) => n + tallies.kinds[p].ms, 0);
    const reads = 2 * (tallies.kinds.runtime.calls + tallies.kinds.journals.calls);
    assert.ok(
      tallies.overheadMs >= 3 * reads,
      `the report read twice by each of the ${reads / 2} passes and reads, 3 ms a read, is overhead (${tallies.overheadMs} ms)`,
    );
    assert.ok(
      Math.abs(ms - sum - tallies.overheadMs) <= ROUNDING_MS,
      `metered from outside, so the meter's own counts are read, not the pass's overhead, which also has what came after its time: the phases (${sum} ms) and measuring (${tallies.overheadMs} ms) are the pass (${ms} ms), no more and no less`,
    );
  },
);

time('on a clock that moves at every reading, the phases and measuring are the pass exactly: no reading falls between them', async (t) => {
  emptyStore();
  await started(3);
  let clock = 0;
  t.mock.method(performance, 'now', () => ++clock);
  const { ms, tallies } = await metered(() => runWith(fake({ passMs: 5, observeMs: 2, ioMs: 1 }), tickRun()));
  assert.ok(tallies);
  const sum = PHASES.reduce((n, p) => n + tallies.kinds[p].ms, 0);
  assert.equal(ms, sum + tallies.overheadMs, `the phases (${sum} ms) and measuring (${tallies.overheadMs} ms) are the pass (${ms} ms)`);
  const { cost } = await runWith(fake({ passMs: 20, observeMs: 12 }), tickRun());
  assert.ok(cost);
  assert.ok(phaseSum(cost) <= cost.ms, `the phases (${phaseSum(cost)} ms) are no more than the pass (${cost.ms} ms)`);
  assert.ok(
    cost.ms - phaseSum(cost) <= cost.overheadMs,
    `the phases (${phaseSum(cost)} ms) and measuring (${cost.overheadMs} ms) cover the pass (${cost.ms} ms)`,
  );
});

counts('a pass on a fixture store counts the run records it read: twice as many runs, twice as many records', async () => {
  emptyStore();
  const e = fake();
  const none = (await runWith(e, tickRun())).cost!;
  assert.equal(none.records, 0, 'no runs, no records');

  await started(2);
  const two = (await runWith(e, tickRun())).cost!;
  assert.ok(two.records >= 2, `each run's record read at least once (read ${two.records})`);
  const perRun = two.records / 2;
  assert.equal(perRun, Math.round(perRun), `a whole number of reads a run (${two.records} for two)`);

  await started(2);
  const recordBytes = listRuns().reduce((n, r) => n + fs.statSync(path.join(RUNS, `${r.id}.json`)).size, 0);
  const four = (await runWith(e, tickRun())).cost!;
  assert.equal(four.records, perRun * 4, `four runs are read ${perRun} times each, as two were`);
  assert.ok(
    four.phases.records.bytes >= recordBytes,
    `the records phase read every record's ${recordBytes} bytes, measured before the pass, which may write a record back longer (counted ${four.phases.records.bytes})`,
  );
  assert.ok(four.phases.records.calls >= four.records, 'each record read is a call of the records phase');
});

counts("a harness's observe is moved out of the runtime's pass into observe, and the harness is named with what it listed", async () => {
  emptyStore();
  await started(1);
  const { cost } = await runWith(fake({ passMs: 30, observeMs: 20 }), tickRun());
  assert.ok(cost);
  assert.deepEqual(cost.harnesses, { claude: { calls: 1, ms: 20, listed: 4, spawned: 1 } });
  const e = fake({ observeMs: 20, unread: 1 });
  assert.equal((await runWith(e, tickRun())).cost!.harnesses.claude.unread, 1, 'an observe that could not read its harness');
  assert.equal((await runWith(e, tickRun())).cost!.harnesses.claude.unread, 1, 'counted for the pass, not the running total');
  assert.equal(
    Object.hasOwn((await runWith(fake({ unread: 0 }), tickRun())).cost!.harnesses.claude, 'unread'),
    false,
    'none unread, nothing said',
  );
  assert.equal(cost.phases.observe.ms, 20, "the observe's time, as the runtime reported it");
  assert.equal(cost.phases.observe.calls, 1);
  assert.equal(cost.phases.observe.spawned, 1, "the process the observe started is observe's");
  assert.equal(cost.phases.runtime.spawned, 0);
  assert.ok(
    cost.phases.runtime.ms >= 9,
    `the runtime's pass keeps the rest of its 30 ms, a floor and never a ceiling, since a process parked after the spin takes longer (${cost.phases.runtime.ms})`,
  );
  assert.ok(
    phaseSum(cost) <= cost.ms + ROUNDING_MS,
    `the observe's 20 ms is moved, not copied, whatever the scheduler did: the phases (${phaseSum(cost)} ms) are no more than the pass (${cost.ms} ms)`,
  );
  assert.equal(cost.phases.runtime.bytes, 1000, 'what the runtime read is counted where it was called');
  assert.equal(
    cost.spawned,
    cost.phases.observe.spawned +
      cost.phases.place.spawned +
      PHASES.filter((p) => p !== 'observe' && p !== 'place').reduce((n, p) => n + cost.phases[p].spawned, 0),
  );
});

counts('an engine that keeps no totals is still metered, with no harness named', async () => {
  emptyStore();
  await started(1);
  const { cost } = await runWith(fake({ withIo: false }), tickRun());
  assert.ok(cost);
  assert.deepEqual(cost.harnesses, {});
  assert.equal(cost.phases.observe.ms, 0);
  assert.ok(cost.phases.runtime.calls >= 1, "the runtime's pass is still a call");
});

writes("the last pass's cost is written to the store and read back; a file that does not read as one reads as none", async () => {
  emptyStore();
  assert.equal(lastPassCost(), undefined, 'no pass, no cost');
  await started(1);
  const { cost } = await runWith(fake(), tickRun());
  const read = lastPassCost();
  assert.ok(read && cost);
  assert.equal(read.at, cost.at);
  assert.equal(read.ms, cost.ms);
  assert.equal(read.records, cost.records);
  assert.ok(read.overheadMs <= cost.overheadMs, "the file cannot hold its own write; the pass's answer does");
  assert.equal(
    fs.readdirSync(ROOT).filter((f) => f.includes('tick-stats') && f !== 'tick-stats.json').length,
    0,
    'no temporary file is left',
  );
  fs.writeFileSync(STATS, '{"at":"2026-09-25T10:00:00.000Z","ms":');
  assert.equal(lastPassCost(), undefined);
});

writes(
  "what a pass could not read of a harness is written with its cost, in the runtime's words, and a pass that read it all writes none",
  async () => {
    emptyStore();
    await started(1);
    const unobserved = ['harness `claude`: claude agents: timed out'];
    await runWith(fake({ unobserved }), tickRun());
    assert.deepEqual(lastPassCost()?.unobserved, unobserved);
    await runWith(fake(), tickRun());
    const read = lastPassCost();
    assert.ok(read);
    assert.equal(Object.hasOwn(read, 'unobserved'), false);
  },
);

whose('outside a pass the readers count nothing, and a pass inside a metered call is counted as part of it', async () => {
  emptyStore();
  const [run] = await started(1);
  const outside = await metered(async () => 'none');
  assert.equal(outside.tallies!.records, 0);
  readRun(run.id);
  const outer = await metered(async () => {
    readRun(run.id);
    within('act', () => busy(2));
    const inner = await runWith(fake(), tickRun());
    assert.equal(inner.cost, undefined, "a pass inside another's meter carries no cost of its own");
    return 'done';
  });
  assert.ok(outer.tallies!.records >= 2, "the outer meter counted its own read and the inner pass's");
  assert.ok(outer.tallies!.kinds.act.ms >= 2);
});

counts(
  'a pass says no `admit` of its own: the runtime admits inside its own pass, so a task it reports queued costs `act` nothing',
  async () => {
    emptyStore();
    const idle = fake();
    const base = (await runWith(idle, tickRun())).cost!;
    const e = fake({ queued: ['t-1'] });
    const { cost } = await runWith(e, tickRun());
    assert.deepEqual([idle.admitted, e.admitted], [[], []], 'no word said, the queued task left to the runtime');
    assert.equal(cost?.phases.act.calls, base.phases.act.calls, 'act made the calls the same pass with nothing queued made');
  },
);

whose(
  "a program metered as a pass counts as a Promise metered does: its reads, its kinds, and a program inside another's meter no counts",
  async () => {
    emptyStore();
    const [run] = await started(1);
    const alone = await Effect.runPromise(
      meteredPass(
        Effect.sync(() => {
          readRun(run.id);
          within('act', () => busy(2));
          return 'read';
        }),
      ),
    );
    assert.equal(alone.value, 'read');
    assert.ok(alone.tallies, 'a pass alone is counted');
    assert.equal(alone.tallies.records, 1, 'the one read counted');
    assert.ok(alone.tallies.kinds.act.ms >= 2 && alone.ms >= alone.tallies.kinds.act.ms, 'act charged, within the pass');
    assert.equal(metering(), false, 'the meter closed with the pass');
    const outer = await metered(async () => {
      const inner = await Effect.runPromise(meteredPass(Effect.sync(() => readRun(run.id))));
      assert.equal(inner.tallies, undefined, "a program inside another's meter carries no counts of its own");
      assert.equal(metering(), true, 'and leaves the outer meter open');
      return 'done';
    });
    assert.equal(outer.tallies?.records, 1, 'the outer meter counted the inner read');
  },
);

whose('REFUSED: a metered program leaves no meter open, whether it fails, dies or is interrupted', async () => {
  const refusal = new Invalid({ message: 'x' });
  const failed = await Effect.runPromise(Effect.flip(meteredPass(Effect.fail(refusal))));
  assert.equal(failed, refusal, 'the failure is the one it failed with');
  assert.equal(metering(), false, 'no meter open after a failure');
  const boom = new Error('y');
  const died = await Effect.runPromise(meteredPass(Effect.die(boom))).then(
    () => assert.fail('a defect resolved'),
    (err: unknown) => err,
  );
  assert.equal(died, boom, 'the defect is rethrown as itself');
  assert.equal(metering(), false, 'no meter open after a defect');
  let inside = false;
  const fiber = Effect.runFork(meteredPass(Effect.sync(() => (inside = metering())).pipe(Effect.andThen(Effect.never))));
  await Effect.runPromise(Effect.yieldNow);
  assert.equal(inside, true, 'the meter open while the program runs');
  await Effect.runPromise(Fiber.interrupt(fiber));
  assert.equal(metering(), false, 'no meter open after an interruption');
});

whose(
  "REFUSED: a reader called beside an open pass, by another caller in the process, counts nothing to the pass: only the pass's own",
  async () => {
    emptyStore();
    const [run] = await started(1);
    let go!: () => void;
    const waiting = new Promise<void>((resolve) => (go = resolve));
    const own = Effect.sync(() => readRun(run.id));
    const pass = Effect.runPromise(
      meteredPass(
        Effect.andThen(
          Effect.promise(() => waiting),
          own,
        ),
      ),
    );
    const promised = metered(async () => {
      await waiting;
      readRun(run.id);
    });
    await Effect.runPromise(Effect.sync(() => readRun(run.id)));
    readRun(run.id);
    assert.equal(metering(), false, 'no pass is open to a caller beside them');
    go();
    assert.deepEqual([(await pass).tallies?.records, (await promised).tallies?.records], [1, 1], 'each pass its own read alone');
  },
);

whose(
  'REFUSED: a fiber beside a pass does not run while the pass is at work: the pass yields to the process only where it waits',
  async () => {
    let beside = 0;
    const other = Effect.runFork(
      Effect.forever(
        Effect.andThen(
          Effect.sync(() => beside++),
          Effect.yieldNow,
        ),
      ),
    );
    await Effect.runPromise(Effect.yieldNow);
    const { value } = await Effect.runPromise(
      meteredPass(
        Effect.gen(function* () {
          const from = beside;
          yield* Effect.forEach(Array.from({ length: 20_000 }), () => Effect.void);
          return beside - from;
        }),
      ),
    );
    await Effect.runPromise(Fiber.interrupt(other));
    assert.ok(beside > 0, 'the fiber beside ran');
    assert.equal(value, 0, 'and not once inside the pass');
  },
);

counts(
  'a pass keeps what it saw: the runs listed, the tasks, the sessions queued and at work; and the recent passes grow by it',
  async () => {
    emptyStore();
    fs.rmSync(recentFile(), { force: true });
    await started(2);
    const first = (await runWith(fake({ queued: ['t-q'], running: { claude: 1 } }), tickRun())).cost!;
    assert.deepEqual(
      { runs: first.runs, tasks: first.tasks, queued: first.queued, admitted: first.admitted },
      { runs: 2, tasks: 1, queued: 1, admitted: 1 },
    );
    assert.equal(recentPasses().length, 1);
    await started(1);
    await runWith(fake(), tickRun());
    const kept = recentPasses();
    assert.deepEqual(
      kept.map((p) => [p.runs, p.queued]),
      [
        [2, 1],
        [3, 0],
      ],
      'one entry a pass, oldest first, each with what its own pass saw',
    );
  },
);

writes("a pass's metrics go into the registry of whoever runs it: its time, each phase by name, and what it saw", async () => {
  emptyStore();
  await started(1);
  const registry = new Map();
  const own = <A, E>(program: import('effect').Effect.Effect<A, E>) =>
    Effect.runPromise(program.pipe(Effect.provideService(Metric.MetricRegistry, registry)));
  await own(
    tickRun({}).pipe(
      Effect.provide(storeRootLayer(process.env)),
      Effect.provide(stand().layer),
      Effect.provide(EngineService.layer(fake({ queued: ['t-q', 't-r'], running: { claude: 3 } }))),
    ),
  );
  const snapshot = await own(Metric.snapshot);
  const one = (id: string) => snapshot.filter((m) => m.id === id);
  assert.equal((one('pass.duration')[0].state as { count: number }).count, 1);
  assert.deepEqual(
    PHASES.map((phase) => one('pass.phase.duration').filter((m) => m.attributes?.phase === phase).length),
    PHASES.map(() => 1),
    'a series a phase, each named',
  );
  assert.equal((one('store.runs')[0].state as { value: number }).value, 1);
  assert.equal((one('sessions.queued')[0].state as { value: number }).value, 2);
  assert.equal((one('sessions.admitted')[0].state as { value: number }).value, 3);
  assert.equal(one('pass.journal_reads').length, 1);
});

/** A table's rows, each a subtest of `t`. */
const told = (rows: Rows) => async (t: TestContext) => {
  for (const [name, claim] of rows) await t.test(name, claim);
};

test("a pass's time is its phases and what measuring took, no more and no less", told(TIME));
test('a pass counts what it read and observed, and what it saw', told(COUNTS));
test('a pass writes its cost and its metrics where they are read back', told(WRITES));
test("a meter counts its own pass's reads alone, and leaves no meter open", told(WHOSE));

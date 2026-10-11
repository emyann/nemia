/**
 * `nemia passes` (`passes.verb.ts`): the recent passes the tick kept in `$WF_ROOT/tick-recent.json`, read whole or the last `--last`, as
 * lines or as JSON, and a `--last` that is not a whole number from 1 refused. A store of its own: `WF_ROOT` is read as the module loads, so
 * it is set before the import. No pass is run here: the passes are written as the tick writes them (`recordRecentPass`).
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { testEngine } from 'agent-runtime/testing';
import { eachTest } from '../../test/placed.ts';
import { scratch } from '../../test/scratch.ts';

process.env.WF_ROOT = scratch('wf-passes-');
process.env.WF_VERIFY_REST = '1';
const { main } = await import('../cli/main.ts');
const { recentFile, recordRecentPass } = await import('../daemon/daemon.store.ts');
const { PHASES, passCost, passesRead, recentOf } = await import('./meter.ts');
const { passesOf } = await import('./passes.verb.ts');

const { engineOf } = await import('../runtime-client.ts');
const engine = eachTest(testEngine);

/** The engine of this test, the stand-in none of these commands asks anything of. */
const noEngine = () => engineOf(engine().layer);

/** A pass of `ms`, at the `k`th second, that saw `runs` runs. */
const cost = (k: number, ms: number, runs: number) =>
  passCost({
    at: new Date(Date.UTC(2026, 9, 5, 10, 0, k)).toISOString(),
    ms,
    phases: Object.fromEntries(PHASES.map((p) => [p, { ms: p === 'place' ? ms : 0, calls: 1, bytes: 0, reads: 0, spawned: 0 }])) as never,
    harnesses: {},
    records: runs,
    overheadMs: 0,
    rested: 0,
    runs,
    tasks: 0,
    queued: 0,
    admitted: 0,
    waitMs: 0,
    load: 0,
  });

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

const COSTS = [cost(1, 12, 5), cost(2, 300, 6), cost(3, 40, 7)];

test('`nemia passes` with no pass kept says so, and how one is kept', async (t) => {
  fs.rmSync(recentFile(), { force: true });
  assert.match((await typed(t, ['passes']))[0], /^no pass is kept yet: nemia up, or the api, ticks the store/);
});

test('`nemia passes --json` is the whole answer, the passes oldest first; --last <n> reads the last n of them', async (t) => {
  fs.rmSync(recentFile(), { force: true });
  for (const c of COSTS) recordRecentPass(c);
  const all = JSON.parse((await typed(t, ['passes', '--json'])).join('\n'));
  assert.deepEqual(all, passesRead(COSTS.map((c) => recentOf(c))));
  assert.deepEqual(all, JSON.parse(JSON.stringify(passesOf({}))), 'the answer the api serves, off the same file');
  const last = JSON.parse((await typed(t, ['passes', '--json', '--last', '2'])).join('\n'));
  assert.deepEqual(
    last.recent.map((p: { runs: number }) => p.runs),
    [6, 7],
  );
  assert.equal(last.summary.slowestMs, 300);
  const lines = await typed(t, ['passes']);
  assert.match(lines[0], /^3 passes since 2026-10-05T10:00:01\.000Z: 40\.0 ms a pass \(median\), slowest 300$/);
});

test('REFUSED: a --last that is not a whole number from 1, as Invalid, naming what it takes', async () => {
  for (const last of ['0', 'x', '-1', '1.5']) {
    await assert.rejects(main(['passes', '--last', last], noEngine()), (err: Error & { exitCode?: number }) => {
      assert.equal(err.exitCode, 2);
      assert.equal(
        err.message,
        `--last takes how many of the recent passes to read, a whole number from 1: nemia passes --last <n>, not ${JSON.stringify(last)}.`,
      );
      return true;
    });
  }
});

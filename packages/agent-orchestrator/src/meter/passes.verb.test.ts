/**
 * `nemia passes` (`passes.verb.ts`): the recent passes the tick kept in `$WF_ROOT/tick-recent.json`, read whole or the last `--last`, as
 * lines or as JSON, and a `--last` that is not a whole number from 1 refused. A store of its own, at `ROOT`. No pass is run here: the
 * passes are written as the tick writes them (`recordRecentPass`).
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { testEngine } from 'agent-runtime/testing';
import { eachTest } from '../../test/placed.ts';
import { heldUnasked } from '../../test/unasked.ts';
import { scratch } from 'test-kit/scratch';
import { main as cli } from '../cli/main.ts';
import { recentFile, recordRecentPass } from '../daemon/daemon.store.ts';
import { PHASES, passCost, passesRead, recentOf } from './meter.ts';
import { passesOf } from './passes.verb.ts';
import { engineOf } from '../runtime-client.ts';
import type { Env } from '../config/config.store.ts';

const ROOT = scratch('wf-passes-');
const ENV: Env = { ...process.env, WF_ROOT: ROOT, WF_VERIFY_REST: '1' };
/** The CLI over this file's store, `ENV`. */
const main: typeof cli = (argv, e, demand, place) => cli(argv, e, demand, place, ENV);

const engine = eachTest(testEngine);
heldUnasked(engine);

/** The engine of this test: the stand-in, which no command here files on, stops, says to or forgets from (`heldUnasked`). */
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

/** The rows of `nemia passes`, told by the one test at the end. */
const ROWS: Array<[string, (t: TestContext) => Promise<void>]> = [];
const row = (name: string, claim: (t: TestContext) => Promise<void>) => ROWS.push([name, claim]);

const COSTS = [cost(1, 12, 5), cost(2, 300, 6), cost(3, 40, 7)];

row('`nemia passes` with no pass kept says so, and how one is kept', async (t) => {
  fs.rmSync(recentFile(ROOT), { force: true });
  assert.match((await typed(t, ['passes']))[0], /^no pass is kept yet: nemia up, or the api, ticks the store/);
});

row('`nemia passes --json` is the whole answer, the passes oldest first; --last <n> reads the last n of them', async (t) => {
  fs.rmSync(recentFile(ROOT), { force: true });
  for (const c of COSTS) recordRecentPass(ROOT, c);
  const all = JSON.parse((await typed(t, ['passes', '--json'])).join('\n'));
  assert.deepEqual(all, passesRead(COSTS.map((c) => recentOf(c))));
  assert.deepEqual(all, JSON.parse(JSON.stringify(passesOf(ROOT, {}))), 'the answer the api serves, off the same file');
  const last = JSON.parse((await typed(t, ['passes', '--json', '--last', '2'])).join('\n'));
  assert.deepEqual(
    last.recent.map((p: { runs: number }) => p.runs),
    [6, 7],
  );
  assert.equal(last.summary.slowestMs, 300);
  const lines = await typed(t, ['passes']);
  assert.match(lines[0], /^3 passes since 2026-10-05T10:00:01\.000Z: 40\.0 ms a pass \(median\), slowest 300$/);
});

row('REFUSED: a --last that is not a whole number from 1, as Invalid, naming what it takes', async () => {
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

test('`nemia passes`: the recent passes read whole or the last of them, as lines or JSON, and a --last refused', async (t) => {
  for (const [name, claim] of ROWS) await t.test(name, claim);
});

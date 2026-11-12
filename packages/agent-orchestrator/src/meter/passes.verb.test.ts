/**
 * `nemia passes` (`passes.verb.ts`): the recent passes the tick kept in `$WF_ROOT/tick-recent.json`, read whole or the last `--last`,
 * and a `--last` that is not a whole number from 1 refused, each through the entry's handler (`test/typed.ts`); the lines the client
 * prints of them are `apps/cli`'s `rest-lines.test.ts`'s. A store of its own, at `ROOT`. No pass is run here: the passes are written as
 * the tick writes them (`recordRecentPass`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { testEngine } from 'agent-runtime/testing';
import { eachTest } from '../../test/placed.ts';
import { heldUnasked } from '../../test/unasked.ts';
import { scratch } from 'test-kit/scratch';
import { typed as handledArgv } from '../../test/typed.ts';
import { recentFile, recordRecentPass } from '../daemon/daemon.store.ts';
import { PHASES, passCost, passesRead, recentOf } from './meter.ts';
import { passesOf } from './passes.verb.ts';
import { engineOf } from '../runtime-client.ts';
import type { Env } from '../config/config.store.ts';

const ROOT = scratch('wf-passes-');
const ENV: Env = { ...process.env, WF_ROOT: ROOT, WF_VERIFY_REST: '1' };

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

/** `argv` run on its entry's handler over this file's store, `ENV`: what it answers. */
const typed = (argv: readonly string[]) => handledArgv(argv, noEngine(), undefined, undefined, ENV);

/** The rows of `nemia passes`, told by the one test at the end. */
const ROWS: Array<[string, () => Promise<void>]> = [];
const row = (name: string, claim: () => Promise<void>) => ROWS.push([name, claim]);

const COSTS = [cost(1, 12, 5), cost(2, 300, 6), cost(3, 40, 7)];

row('`nemia passes` with no pass kept answers none and no summary, which the client says as no pass kept yet', async () => {
  fs.rmSync(recentFile(ROOT), { force: true });
  assert.deepEqual(await typed(['passes']), passesRead([]));
});

row('`nemia passes` answers the passes oldest first, as the api serves them; --last <n> reads the last n of them', async () => {
  fs.rmSync(recentFile(ROOT), { force: true });
  for (const c of COSTS) recordRecentPass(ROOT, c);
  const all = JSON.parse(JSON.stringify(await typed(['passes', '--json'])));
  assert.deepEqual(all, passesRead(COSTS.map((c) => recentOf(c))));
  assert.deepEqual(all, JSON.parse(JSON.stringify(passesOf(ROOT, {}))), 'the answer the api serves, off the same file');
  const last = JSON.parse(JSON.stringify(await typed(['passes', '--last', '2'])));
  assert.deepEqual(
    last.recent.map((p: { runs: number }) => p.runs),
    [6, 7],
  );
  assert.equal(last.summary.slowestMs, 300);
  const whole = JSON.parse(JSON.stringify(await typed(['passes'])));
  assert.deepEqual(
    [whole.recent.length, whole.recent[0].at, whole.summary.medianMs, whole.summary.slowestMs],
    [3, '2026-10-05T10:00:01.000Z', 40, 300],
  );
});

row('REFUSED: a --last that is not a whole number from 1, as Invalid, naming --last and what was given', async () => {
  for (const last of ['0', 'x', '-1', '1.5']) {
    await assert.rejects(typed(['passes', '--last', last]), (err: Error & { exitCode?: number }) => {
      assert.equal(err.exitCode, 2);
      assert.match(err.message, /--last/);
      assert.ok(err.message.includes(JSON.stringify(last)), err.message);
      return true;
    });
  }
});

test('`nemia passes`: the recent passes read whole or the last of them, and a --last refused', async (t) => {
  for (const [name, claim] of ROWS) await t.test(name, claim);
});

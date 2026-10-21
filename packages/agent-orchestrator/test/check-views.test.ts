/**
 * What a pass costs in `check` observes, at shipped defaults: the client's `engine()` with the shipped `check` harness, a pass through
 * `tick()`, and the views `taskPhases` makes of a run's tasks — every task of every run, each pass — counted on the runtime's meter, the
 * `observed, by harness` lines of `nemia up --stats`.
 *
 * A view of a settled check is read off its record (`agent-runtime`'s `settled-view.test.ts`), never by observing the check harness,
 * which lists every run file it ever ran: on a live store of 197 runs, one pass that observed it for each view listed 52976 of them in
 * 799 ms. So the count is one for the pass and one for each check in flight.
 *
 * `WF_ROOT` is set before the runner is imported, which reads it as it loads; `WF_VERIFY_REST` has every run a pass answers from its memo
 * of runs at rest judged in full as well, and a difference throws (`verifyRest` in tick.verb.ts).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Run } from '../src/run.ts';
import { checkArgv } from '../src/check/check.ts';
import { scratch } from './scratch.ts';
import { until, WAITED, type Waiter } from 'agent-runtime/testing';
import { Effect } from 'effect';
import { testPlace } from '../place/memory/index.ts';
import { eachTest, runOver } from './placed.ts';

const ROOT = scratch('wf-check-views-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const { engine, tickRun, runWith: runEngine } = await import('../src/runner.ts');
const stand = eachTest(testPlace);
const runWith = runOver(runEngine, () => stand().layer);
const { taskPhasesRead } = await import('../src/views/views.verb.ts');

const e = engine();
const gates = scratch('wf-check-views-gates-');
const calls = async () => (await Effect.runPromise(e.io())).observed.check?.calls ?? 0;

/**
 * A check filed as the tick files one, through the client, its argv in `config`; `held` runs until its gate is opened, and every other
 * exits 0 at once.
 */
const file = (id: string, held = false) =>
  e.file({
    id,
    cwd: scratch('wf-check-views-cwd-'),
    harness: 'check',
    brief: id,
    config: {
      command: checkArgv(
        held ? `n=0; while [ ! -e ${JSON.stringify(path.join(gates, id))} ] && [ $n -lt 400 ]; do sleep 0.05; n=$((n+1)); done` : 'true',
      ),
    },
  });

/** Ticks in test `t`, every 50ms, until every task of `ids` is in a phase `done` accepts, said as `what`. */
const reached = (t: Waiter, ids: string[], done: (phase: string) => boolean, what: string) => {
  let phases: string[] = [];
  return until(
    t,
    async () => {
      phases = await Promise.all(ids.map(async (id) => (await Effect.runPromise(e.view(id))).phase));
      if (phases.every(done)) return true;
      await runWith(e, tickRun());
      return false;
    },
    () => `${ids.join(', ')} ${what}; ${ids.map((id, i) => `${id} ${phases[i] ?? 'not read yet'}`).join(', ')}`,
    { everyMs: 50 },
  );
};

test(
  "a pass that views a run's every check observes the check harness once, and once more for each check in flight — none for a settled one",
  WAITED,
  async (t) => {
    const settled = ['c1', 'c2', 'c3', 'c4', 'c5'];
    for (const id of settled) await Effect.runPromise(file(id));
    await reached(t, settled, (p) => p === 'succeeded', 'succeeded');
    await Effect.runPromise(file('live', true));
    await reached(t, ['live'], (p) => p.startsWith('running'), 'running');

    const run = { steps: Object.fromEntries([...settled, 'live'].map((id) => [id, { check: { taskId: id } }])) } as unknown as Run;
    const before = await calls();
    const { cost } = await runWith(e, tickRun());
    const { phaseOf } = await runWith(e, taskPhasesRead(run));
    assert.equal(cost?.harnesses.check?.calls, 1, 'the pass observes the check harness once, as `nemia up --stats` counts it');
    assert.deepEqual(
      [...settled, 'live'].map(phaseOf),
      [...settled.map(() => 'succeeded'), 'running'],
      "every check a run's steps name is viewed, as advance does every pass, and read right",
    );
    assert.equal((await calls()) - before, 2, 'the pass, and the one check in flight: none for the five settled');

    fs.writeFileSync(path.join(gates, 'live'), '');
    await reached(t, ['live'], (p) => p === 'succeeded', 'succeeded');
    const after = await calls();
    await runWith(e, taskPhasesRead(run));
    assert.equal((await calls()) - after, 0, 'with none in flight, the views observe nothing');
  },
);

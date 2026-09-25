/**
 * What a pass costs in `check` observes, at shipped defaults: the client's `engine()` with the shipped `CHECK` harness, a pass through
 * `tick()`, and the views `taskPhases` makes of a run's tasks — every task of every run, each pass — counted on the runtime's meter, the
 * `observed, by harness` lines of `wf up --stats`.
 *
 * Read by hand on 2026-09-25 before the change, off the live store's last pass (`wf up --stats`, 197 runs): `check: 172 observes, 799 ms,
 * 52976 sessions or run files listed`. A view of a settled check observed the check harness, which lists every run file it ever ran. It is
 * read off its record now (`agent-runtime`'s `settled-view.test.ts`), so the count falls to one for the pass and one for each check in flight.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Run } from '../src/run.ts';
import { checkBrief } from '../src/check.ts';
import { scratch } from './scratch.ts';

const ROOT = scratch('wf-check-views-');
// WF_ROOT is read as the module loads, so it is set before the import rather than after it.
process.env.WF_ROOT = ROOT;
const { engine, tick } = await import('../src/runner.ts');
const { taskPhases } = await import('../src/views.ts');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const e = engine();
const gates = scratch('wf-check-views-gates-');
const calls = () => e.io().observed.check?.calls ?? 0;

/** A check filed as the tick files one, through the client; `held` runs until its gate is opened, and every other exits 0 at once. */
const file = (id: string, held = false) => e.file({
  id, cwd: scratch('wf-check-views-cwd-'), harness: 'check',
  brief: checkBrief(held ? `n=0; while [ ! -e ${JSON.stringify(path.join(gates, id))} ] && [ $n -lt 400 ]; do sleep 0.05; n=$((n+1)); done` : 'true', { WF_RUN: 'r', WF_STEP: id }),
});

const until = async (ids: string[], done: (phase: string) => boolean) => {
  const deadline = Date.now() + 20_000;
  for (;;) {
    const phases = await Promise.all(ids.map(async (id) => (await e.view(id)).phase));
    if (phases.every(done)) return;
    assert.ok(Date.now() < deadline, `never all there: ${ids.map((id, i) => `${id} ${phases[i]}`).join(', ')}`);
    await tick(e);
    await sleep(50);
  }
};

test('a pass that views a run\'s every check observes the check harness once, and once more for each check in flight — none for a settled one', async () => {
  const settled = ['c1', 'c2', 'c3', 'c4', 'c5'];
  for (const id of settled) await file(id);
  await until(settled, (p) => p === 'succeeded');
  await file('live', true);
  await until(['live'], (p) => p.startsWith('running'));

  // A run whose steps name the checks, as a run record does; `taskPhases` views each, as `advance` does every pass.
  const run = { steps: Object.fromEntries([...settled, 'live'].map((id) => [id, { check: { taskId: id } }])) } as unknown as Run;
  const before = calls();
  const { cost } = await tick(e);
  const { phaseOf } = await taskPhases(e, run);
  assert.equal(cost?.harnesses.check?.calls, 1, 'the pass observes the check harness once, as `wf up --stats` counts it');
  assert.deepEqual([...settled, 'live'].map(phaseOf), [...settled.map(() => 'succeeded'), 'running'], 'every check viewed, and read right');
  assert.equal(calls() - before, 2, 'the pass, and the one check in flight: none for the five settled');

  fs.writeFileSync(path.join(gates, 'live'), '');
  await until(['live'], (p) => p === 'succeeded');
  const after = calls();
  await taskPhases(e, run);
  assert.equal(calls() - after, 0, 'with none in flight, the views observe nothing');
});

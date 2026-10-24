/**
 * The line `nemia tick` prints for a run, typed as a person types it: a run stopped on a person alone says what it waits on, and
 * `failed` is kept for a run in which a step broke.
 *
 * A boundary test because a whole pass asks the engine for its own pass (`Engine.tick`) and a tally of it (`Engine.tallied`), which
 * the engine's stand-in does not model: both are given here by hand, as a pass that moved nothing, over the stand-in's tasks.
 *
 * `WF_ROOT` is set before the runner is imported, which reads it as it loads, and `WF_DEFAULT_FACTORY_STARTS` beside it: its runs start
 * in scratch repositories no factory holds.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Engine } from '../src/runtime-client.ts';
import { testEngine } from 'agent-runtime/testing';
import { scratch } from './scratch.ts';
import { Effect } from 'effect';
import { testPlace } from '../place/memory/index.ts';
import { eachTest, runGiven, runOver } from './placed.ts';
import type { EnginePhase } from '../src/views/views-words.ts';

const ROOT = scratch('wf-tick-line-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
process.env.WF_DEFAULT_FACTORY_STARTS = '1';
const { advanceRun, startRun, runWith: runEngine } = await import('../src/runner.ts');
const stand = eachTest(testPlace);
const engine = eachTest(testEngine);
const runWith = runOver(runEngine, () => stand().layer);
const runPlaced = runGiven(() => stand().layer);
const { readRun } = await import('../src/record/record.store.ts');
const { main } = await import('../src/cli/main.ts');
const { engineOf } = await import('../src/runtime-client.ts');

const SIGNED = { outcome: 'done', summary: 'the plan: parse the flag, then store it', artifacts: [], needs: null };

/** A workflow folder of `plan → implement`. */
const planned = (): string => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'plan.md'), '---\nplace: git\n---\nplan it\n');
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nafter: plan\nplace: git\n---\nimplement it\n');
  return dir;
};

test('`nemia tick` prints `awaiting approval` for a run at its gate and `blocked` for one waiting on an answer — REFUSED: `failed` for either, kept for a run in which a step broke', async (t) => {
  const b = engine();
  const e = engineOf(b.layer);
  const stopped = async (gates: string[], phase: EnginePhase, closeout?: unknown) => {
    const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
    stand().world.repository(repo, {});
    const run = await runPlaced(startRun({ brief: 'plan the flag', repo, workflowDir: planned(), isolate: false, gates }));
    await runWith(e, advanceRun(readRun(run.id)));
    b.settle(`${run.id}-plan`, phase, closeout === undefined ? {} : { closeout });
    return run.id;
  };
  const gated = await stopped(['plan'], 'succeeded', SIGNED);
  const asking = await stopped([], 'succeeded', { ...SIGNED, outcome: 'blocked', needs: 'which flag name ships' });
  const broke = await stopped([], 'failed');

  const report = { tasks: 0, actions: 0, running: {}, views: [], ms: 0, observed: {}, refused: [], unreadable: [], unobserved: [] };
  const passing = {
    ...e,
    tick: () => Effect.succeed(report),
    tallied: <A, E, R>(program: Effect.Effect<A, E, R>) => program,
    io: undefined,
  } as unknown as Engine;
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.join(' '));
  });
  try {
    await main(['tick'], passing, undefined, stand().place);
  } finally {
    log.mock.restore();
  }
  const lines = [gated, asking, broke].map((id) => printed.find((l) => l.startsWith(`${id}  `)));
  assert.deepEqual(
    lines,
    [`${gated}  awaiting approval  blocked: implement`, `${asking}  blocked  blocked: implement`, `${broke}  failed  blocked: implement`],
    printed.join('\n'),
  );
  for (const line of lines.slice(0, 2)) assert.ok(!line?.includes('failed'), line);
});

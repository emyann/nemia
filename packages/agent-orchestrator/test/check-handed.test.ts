/**
 * The step after a checked step is handed every `wf <name>:` line of its check's whole stdout, however long the output after it: walked
 * on the client's `engine()` with the shipped `check` harness, a check filed with the `config` `fileCheck` gives it, run by the real
 * detached worker, and read back through `checksHandedRead`, as the pass that files the next step reads it. The engine's log of a task
 * keeps only its end, so the fixture's marked lines sit further from the end than that log reaches; the runtime keeps each stream whole,
 * read through `output`.
 *
 * `WF_ROOT` is set before the runner is imported, which reads it as it loads; `WF_VERIFY_REST` has every run a pass answers from its memo
 * of runs at rest judged in full as well.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Run } from '../src/run.ts';
import type { Workflow } from '../src/step/step.ts';
import { CHECK_NICENESS, checkArgv } from '../src/check/check.ts';
import { scratch } from './scratch.ts';
import { until, WAITED, type Waiter } from 'agent-runtime/testing';
import { Effect } from 'effect';
import { testPlace } from '../place/memory/index.ts';
import { eachTest, runOver } from './placed.ts';

const ROOT = scratch('wf-check-handed-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const { engine, tickRun, runWith: runEngine } = await import('../src/runner.ts');
const stand = eachTest(testPlace);
const runWith = runOver(runEngine, () => stand().layer);
const { checksHandedRead } = await import('../src/views/views.verb.ts');

const e = engine();

/** Ticks in test `t`, every 50ms, until the task has settled; answers how. */
const settled = (t: Waiter, id: string) => {
  let phase = 'not read yet';
  return until(
    t,
    async () => {
      const v = await Effect.runPromise(e.view(id));
      if (v.state.settled) return v.state.settled;
      phase = v.phase;
      await runWith(e, tickRun());
      return undefined;
    },
    () => `${id} settled; phase ${phase}`,
    { everyMs: 50 },
  );
};

const NAMED = Array.from({ length: 10 }, (_, i) => `wf pictures: named #${i + 1} run-dark.png, for apps/web/src/routes/run.tsx`);
const MARKED = [
  'wf pictures: the pages this change touched: run, factory',
  ...NAMED,
  'wf check: no e2e in a round check; it runs once, on the merged tree',
];

/** `workflows/build`'s check, in shape: the pictures' lines, then a web build longer than the log the engine keeps, then the last word. */
const COMMAND = [
  ...MARKED.slice(0, -1).map((line) => `echo ${JSON.stringify(line)}`),
  'i=0; while [ $i -lt 300 ]; do echo "web:build: dist/assets/chunk-$i.js  41.20 kB | gzip: 12.80 kB, and a line long enough"; i=$((i+1)); done',
  `echo ${JSON.stringify(MARKED.at(-1))}`,
].join('\n');

/** File `COMMAND` as `fileCheck` files a check, under `id`, and wait in test `t` for it to settle. */
const checked = async (t: Waiter, id: string) => {
  const workspace = scratch('wf-check-handed-ws-');
  await Effect.runPromise(
    e.file({
      id,
      cwd: workspace,
      harness: 'check',
      brief: COMMAND,
      config: {
        command: checkArgv(COMMAND),
        env: { WF_RUN: 'r-1', WF_STEP: 'implement', WF_WORKSPACE: workspace, WF_ARTIFACTS: '' },
        niceness: CHECK_NICENESS,
      },
    }),
  );
  assert.equal(await settled(t, id), 'succeeded');
};

/** What the step after `implement` is handed of its check `id`, over `engine`. */
const handed = async (id: string, engine = e) => {
  const run = { id: 'r-1', steps: { implement: { taskId: 'r-1-implement', check: { taskId: id } } } } as unknown as Run;
  const steps = [
    { name: 'implement', after: [], check: COMMAND },
    { name: 'review', after: ['implement'] },
  ] as unknown as Workflow[];
  const [said] = await runWith(engine, checksHandedRead(run, steps, steps[1]));
  return said;
};

test(
  'LIVE: the step after a checked step is handed every `wf <name>:` line of the whole stdout, not of the end the engine keeps',
  WAITED,
  async (t) => {
    const id = 'r-1-implement-check';
    await checked(t, id);
    const log = await Effect.runPromise(e.logs(id));
    assert.doesNotMatch(log, /wf pictures: the pages/, 'the marked lines sit before the end the engine keeps, so its log cannot hand them');
    assert.match(log, /wf check: no e2e/);

    const said = await handed(id);
    assert.ok(said && !('unreadable' in said), JSON.stringify(said));
    assert.deepEqual(said.reported, MARKED);
    assert.equal(said.partial, false);
    assert.equal(said.verdict, 0);
    assert.equal(said.stderr, '');
  },
);

test(
  'LIVE: a check whose streams the runtime did not keep — one run before it kept them — is handed the end of its log, as partial',
  WAITED,
  async (t) => {
    const id = 'r-2-implement-check';
    await checked(t, id);
    const dir = path.join(ROOT, 'engine', 'runs', 'check');
    const kept = fs.readdirSync(dir).filter((f) => f.includes(id.replace(/[^a-zA-Z0-9]+/g, '_')) && /\.(stdout|stderr)$/.test(f));
    assert.equal(kept.length, 2, `the runtime keeps both streams in ${dir}: ${kept.join(', ')}`);
    for (const f of kept) fs.rmSync(path.join(dir, f));
    assert.equal(await Effect.runPromise(e.output(id, 'stdout')), undefined);

    const said = await handed(id);
    assert.ok(said && !('unreadable' in said), JSON.stringify(said));
    assert.equal(said.partial, true);
    assert.equal(said.stderr, '');
    assert.deepEqual(said.reported, MARKED.slice(-1), 'only the marked line in the end of the log');
    assert.equal(said.verdict, 0);
  },
);

test('a check whose streams the engine cannot give is handed as unreadable, with why', async () => {
  const refusing = new Proxy(e, {
    get: (target, key, receiver) =>
      key === 'output' ? () => Effect.fail(new Error('the disk is gone') as never) : (Reflect.get(target, key, receiver) as unknown),
  });
  const said = await handed('r-1-implement-check', refusing);
  assert.ok(said && 'unreadable' in said, JSON.stringify(said));
  assert.match(said.unreadable, /r-1-implement-check printed: the disk is gone$/);
});

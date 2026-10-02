/**
 * The step after a checked step is handed every `wf <name>:` line of its check's whole stdout, however long the output after it: walked
 * on the client's `engine()` with the shipped `CHECK` harness, a check filed with the environment `fileCheck` gives it, run by the real
 * detached worker, and read back through `checksHandedOf`, as the pass that files the next step reads it. The engine's log of a task keeps
 * only its end, so the fixture's marked lines sit further from the end than that log reaches.
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
import { checkBrief } from '../src/check/check.ts';
import { scratch } from './scratch.ts';

const ROOT = scratch('wf-check-handed-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const { engine, tick } = await import('../src/runner.ts');
const { checkStderr } = await import('../src/record/record.store.ts');
const { checkStdout } = await import('../src/check/check.store.ts');
const { checksHandedOf } = await import('../src/views/views.verb.ts');

const e = engine();
fs.mkdirSync(path.join(ROOT, 'checks'), { recursive: true });

/** Tick until the task has settled, for 20 s at most. */
const settled = async (id: string) => {
  const deadline = Date.now() + 20_000;
  for (;;) {
    const v = await e.view(id);
    if (v.state.settled) return v.state.settled;
    assert.ok(Date.now() < deadline, `${id} never settled: ${v.phase}`);
    await tick(e);
    await new Promise((r) => setTimeout(r, 50));
  }
};

const KILLED = Array.from({ length: 10 }, (_, i) => `wf mutants: killed #${i + 1} src/a.ts: "x" → "y", by test/a.test.ts (failed)`);
const MARKED = [
  'wf mutants: baseline: test/a.test.ts passes unmutated',
  ...KILLED,
  'wf check: no e2e in a round check; it runs once, on the merged tree',
];

/** `workflows/build`'s check, in shape: the mutants' lines, then a web build longer than the log the engine keeps, then the last word. */
const COMMAND = [
  ...MARKED.slice(0, -1).map((line) => `echo ${JSON.stringify(line)}`),
  'i=0; while [ $i -lt 300 ]; do echo "web:build: dist/assets/chunk-$i.js  41.20 kB | gzip: 12.80 kB, and a line long enough"; i=$((i+1)); done',
  `echo ${JSON.stringify(MARKED.at(-1))}`,
].join('\n');

test('LIVE: the step after a checked step is handed every `wf <name>:` line of the whole stdout, not of the end the engine keeps', async () => {
  const id = 'r-1-implement-check';
  const workspace = scratch('wf-check-handed-ws-');
  await e.file({
    id,
    cwd: workspace,
    harness: 'check',
    brief: checkBrief(COMMAND, {
      WF_RUN: 'r-1',
      WF_STEP: 'implement',
      WF_WORKSPACE: workspace,
      WF_STDERR: checkStderr(id),
      WF_STDOUT: checkStdout(id),
      WF_ARTIFACTS: '',
    }),
  });
  assert.equal(await settled(id), 'succeeded');
  const log = await e.logs(id);
  assert.doesNotMatch(log, /wf mutants: baseline/, 'the marked lines sit before the end the engine keeps, so its log cannot hand them');
  assert.match(log, /wf check: no e2e/);

  const run = { id: 'r-1', steps: { implement: { taskId: 'r-1-implement', check: { taskId: id } } } } as unknown as Run;
  const steps = [
    { name: 'implement', after: [], check: COMMAND },
    { name: 'review', after: ['implement'] },
  ] as unknown as Workflow[];
  const [said] = await checksHandedOf(e, run, steps, steps[1]);
  assert.ok(said && !('unreadable' in said), JSON.stringify(said));
  assert.deepEqual(said.reported, MARKED);
  assert.equal(said.partial, false);
  assert.equal(said.verdict, 0);
});

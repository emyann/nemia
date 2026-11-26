/**
 * A step whose check waits on a condition, walked pass by pass on the stand-ins (`implement → review`, `implement` judged by the
 * condition `ci-green`, one `retries:`): with nothing written it is checking and files no check, and its row says what it waits on; a
 * True written for its try files the check that passes it and the pass after files the review; a False files the check that refuses it,
 * the next try is filed and handed the writer's message, and once the retries are spent the run waits on a person; and a condition written
 * for an earlier try never decides a later one. The store is the file's own, at `ROOT`.
 */
import { runRecord } from '../testing.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { testPlace } from '../place/memory/index.ts';
import { testEngine } from 'agent-runtime/testing';
import { eachTest, runGiven, runOver } from './placed.ts';
import { scratch } from 'test-kit/scratch';
import { teamCopy } from './team.ts';
import { advanceRun, CONDITION, decideRun, startRun, runWith as runEngine } from '../src/runner.ts';
import { runsListed } from '../src/list/list.verb.ts';
import { engineOf } from '../src/runtime-client.ts';
import type { Env } from '../src/config/config.store.ts';

const ROOT = scratch('wf-condition-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
const ENV: Env = { ...process.env, WF_ROOT: ROOT, WF_VERIFY_REST: '1', WF_MAX_CONCURRENT: undefined, WF_MAX_RUNS: undefined };

const stand = eachTest(testPlace);
const engine = eachTest(testEngine);
const runWith = runOver(runEngine, () => stand().layer, ENV);
const runPlaced = runGiven(() => stand().layer, ENV);

/** The steps of the planted workflow: implement, whose check waits on `ci-green` and may be tried twice, then a review. */
const STEPS: Readonly<Record<string, string>> = {
  'implement.md': '---\nplace: git\nagent: implementer\nretries: 1\nchecks:\n  - name: ci\n    condition: ci-green\n---\n',
  'review.md': '---\nafter: implement\nplace: git\nagent: reviewer\n---\n',
};

/** A copy of the tests' team with the workflow planted beside its `dev/`: its folder. */
const folder = () => {
  const dir = path.join(teamCopy('wf-condition-team-'), 'waits');
  fs.mkdirSync(dir);
  for (const [file, text] of Object.entries(STEPS)) fs.writeFileSync(path.join(dir, file), text);
  return dir;
};

/** A run of the workflow with its implement signed off: its id, the engine's stand-in and its client. */
async function signedOff() {
  const b = engine();
  const e = engineOf(b.layer);
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stand().world.repository(repo, { 'a.ts': 'export const a = 1;\n' });
  const run = await runPlaced(startRun({ brief: 'wait on ci', repo, workflowDir: folder() }));
  assert.deepEqual((await runWith(e, advanceRun(runRecord(ROOT, run.id)))).filed, ['implement']);
  const work = runRecord(ROOT, run.id).steps.implement.workspace!;
  fs.appendFileSync(path.join(work, 'a.ts'), 'export const b = 2;\n');
  stand().world.commit(work, 'add b');
  b.settle(`${run.id}-implement`, 'succeeded', { closeout: { outcome: 'done', summary: 'done', artifacts: [], needs: null } });
  return { id: run.id, b, e };
}

type Walk = Awaited<ReturnType<typeof signedOff>>;

/** One pass over the run. */
const pass = ({ id, e }: Walk) => runWith(e, advanceRun(runRecord(ROOT, id)));

/** The tasks filed for a check of the run. */
const checks = ({ b }: Walk) => b.filings.filter((f) => f.includes('-check'));

/** What the writer says of the condition `ci-green` for the try `n` of implement, through the verb a person or a program writes by. */
const write = ({ id, e }: Walk, status: 'True' | 'False' | 'Unknown', n: number, message: string) =>
  runWith(
    e,
    CONDITION.handler({ runId: id, step: 'implement', condition: 'ci-green', status, try: n, message, caller: { kind: 'person' } }),
  );

/** The row `nemia ls` gives the step `implement`. */
const rowOf = async ({ id, e }: Walk) => {
  const { runs } = await runWith(e, runsListed(id));
  return runs[0]?.listed && 'steps' in runs[0].listed ? runs[0].listed.steps.find((s) => s.name === 'implement') : undefined;
};

test('with nothing written the step is checking and files no check, its row naming the condition and what to type', async () => {
  const w = await signedOff();
  await pass(w);
  assert.deepEqual(checks(w), []);
  const row = await rowOf(w);
  assert.equal(row?.message, 'checking');
  const note = row && 'note' in row ? String(row.note) : '';
  assert.match(note, /ci-green/);
  assert.match(note, /nemia condition/);
  await write(w, 'Unknown', 1, 'queued');
  await pass(w);
  assert.deepEqual(checks(w), [], 'Unknown decides nothing');
});

test('a True written for the try files the check that passes the step, and the next pass files the review', async () => {
  const w = await signedOff();
  await write(w, 'True', 1, 'green');
  await pass(w);
  assert.equal(checks(w).length, 1);
  w.b.settle(checks(w)[0] ?? '', 'succeeded', { exitCode: 0 });
  assert.deepEqual((await pass(w)).filed, ['review']);
});

test('a False files the check that refuses the step, the next try is filed, and once the retries are spent the run waits on a person', async () => {
  const w = await signedOff();
  await write(w, 'False', 1, 'the build is red');
  await pass(w);
  w.b.settle(checks(w)[0] ?? '', 'failed', { exitCode: 1, printed: { stdout: 'the build is red\n' } });
  assert.deepEqual((await pass(w)).tried, ['implement']);
  const second = w.b.specs.find((s) => s.id === `${w.id}-implement-try2`);
  assert.ok(second, `try 2 is filed: ${w.b.filings.join(', ')}`);
  assert.match(second.brief, /the build is red/, 'and handed the writer’s message as the check’s refusal');

  const before = checks(w).length;
  await pass(w);
  assert.equal(checks(w).length, before, 'the False of try 1 decides nothing of try 2');
  const work = runRecord(ROOT, w.id).steps.implement.workspace!;
  stand().world.commit(work, 'again');
  w.b.settle(`${w.id}-implement-try2`, 'succeeded', { closeout: { outcome: 'done', summary: 'again', artifacts: [], needs: null } });
  await pass(w);
  await write(w, 'False', 2, 'still red');
  await pass(w);
  w.b.settle(checks(w).at(-1) ?? '', 'failed', { exitCode: 1 });
  assert.deepEqual((await pass(w)).tried, [], 'no try is left');
  const { decision } = await runWith(w.e, decideRun(w.id));
  assert.equal(decision.kind, 'awaiting');
});

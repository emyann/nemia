/**
 * A wait node (`waitsFor:`), walked pass by pass on the stand-ins (`work → ready → review`, `ready` waiting on the condition `ready`):
 * once `work` signs off the pass files no task for it and it reads `checking`, its row naming the condition and what writes it; a True
 * written for its try files the check that passes it and the pass after files the review; a False refuses it, files no try on the run's
 * word and waits on a person, whose recheck is a new try that reads the False of the one before no more. The store is the file's own.
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
import { advanceRun, CONDITION, decideRun, retryRun, startRun, runWith as runEngine } from '../src/runner.ts';
import { runsListed } from '../src/list/list.verb.ts';
import { engineOf } from '../src/runtime-client.ts';
import type { Env } from '../src/config/config.store.ts';

const ROOT = scratch('wf-wait-node-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
const ENV: Env = { ...process.env, WF_ROOT: ROOT, WF_VERIFY_REST: '1', WF_MAX_CONCURRENT: undefined, WF_MAX_RUNS: undefined };

const stand = eachTest(testPlace);
const engine = eachTest(testEngine);
const runWith = runOver(runEngine, () => stand().layer, ENV);
const runPlaced = runGiven(() => stand().layer, ENV);

/** The steps of the planted workflow: work, a wait node on the condition `ready`, then a review. */
const STEPS: Readonly<Record<string, string>> = {
  'work.md': '---\nplace: git\nagent: implementer\n---\n',
  'ready.md': '---\nafter: work\nwaitsFor: [ready]\n---\n',
  'review.md': '---\nafter: ready\nplace: git\nagent: reviewer\n---\n',
};

/** A copy of the tests' team with the workflow planted beside its `dev/`: its folder. */
const folder = () => {
  const dir = path.join(teamCopy('wf-wait-node-team-'), 'waits');
  fs.mkdirSync(dir);
  for (const [file, text] of Object.entries(STEPS)) fs.writeFileSync(path.join(dir, file), text);
  return dir;
};

/** A run of the workflow with its work signed off: its id, the engine's stand-in and its client. */
async function signedOff() {
  const b = engine();
  const e = engineOf(b.layer);
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stand().world.repository(repo, { 'a.ts': 'export const a = 1;\n' });
  const run = await runPlaced(startRun({ brief: 'wait on ready', repo, workflowDir: folder() }));
  assert.deepEqual((await runWith(e, advanceRun(runRecord(ROOT, run.id)))).filed, ['work']);
  b.settle(`${run.id}-work`, 'succeeded', { closeout: { outcome: 'done', summary: 'done', artifacts: [], needs: null } });
  return { id: run.id, b, e };
}

type Walk = Awaited<ReturnType<typeof signedOff>>;

/** One pass over the run. */
const pass = ({ id, e }: Walk) => runWith(e, advanceRun(runRecord(ROOT, id)));

/** The tasks filed for a check of the wait node. */
const checks = ({ b }: Walk) => b.filings.filter((f) => f.includes('-ready-check') || f.includes('-ready-try'));

/** What the writer says of the condition `ready` for the try `n` of the wait node. */
const write = ({ id, e }: Walk, status: 'True' | 'False' | 'Unknown', n: number, message: string) =>
  runWith(e, CONDITION.handler({ runId: id, step: 'ready', condition: 'ready', status, try: n, message, caller: { kind: 'person' } }));

/** The row `nemia ls` gives the wait node. */
const rowOf = async ({ id, e }: Walk) => {
  const { runs } = await runWith(e, runsListed(id));
  return runs[0]?.listed && 'steps' in runs[0].listed ? runs[0].listed.steps.find((s) => s.name === 'ready') : undefined;
};

test('a wait node files no task: it reads checking, its row naming the condition and what to type', async () => {
  const w = await signedOff();
  await pass(w);
  const record = runRecord(ROOT, w.id).steps.ready;
  assert.equal(record?.taskId, null);
  assert.ok(record?.check, 'its checks are laid on its record');
  assert.deepEqual(checks(w), []);
  assert.ok(!w.b.filings.some((f) => f.includes('-ready') && !f.includes('check')), 'no session nor command is filed for it');
  const row = await rowOf(w);
  assert.equal(row?.message, 'checking');
  const note = row && 'note' in row ? String(row.note) : '';
  assert.match(note, /ready/);
  assert.match(note, /nemia condition/);
  await write(w, 'Unknown', 1, 'queued');
  await pass(w);
  assert.deepEqual(checks(w), [], 'Unknown decides nothing');
});

test('a True written for its try passes it, and the pass after files the review', async () => {
  const w = await signedOff();
  await pass(w);
  await write(w, 'True', 1, 'go');
  await pass(w);
  assert.equal(checks(w).length, 1);
  w.b.settle(checks(w)[0] ?? '', 'succeeded', { exitCode: 0 });
  assert.deepEqual((await pass(w)).filed, ['review']);
});

test('a False refuses it, files no try on the run’s word, and a person’s recheck is a new try the False of the one before does not decide', async () => {
  const w = await signedOff();
  await pass(w);
  await write(w, 'False', 1, 'not yet');
  await pass(w);
  w.b.settle(checks(w)[0] ?? '', 'failed', { exitCode: 1 });
  assert.deepEqual((await pass(w)).tried, []);
  assert.match(String((await rowOf(w))?.message), /failed/);
  assert.equal((await runWith(w.e, decideRun(w.id))).decision.kind, 'awaiting');
  await runWith(w.e, retryRun(w.id, 'ready', { mode: 'recheck' }));
  await pass(w);
  const record = runRecord(ROOT, w.id).steps.ready;
  assert.deepEqual([record?.tries?.length, record?.tries?.[0]?.taskId, record?.taskId], [1, null, null]);
  assert.equal((await rowOf(w))?.message, 'checking', 'the False written for try 1 decides nothing of try 2');
  await write(w, 'True', 2, 'go');
  await pass(w);
  w.b.settle(checks(w).at(-1) ?? '', 'succeeded', { exitCode: 0 });
  assert.deepEqual((await pass(w)).filed, ['review']);
});

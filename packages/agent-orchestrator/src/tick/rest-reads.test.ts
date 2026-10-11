/**
 * What a pass at rest reads as the store grows: on a store of 5 finished runs and of 50, beside three in flight, a second pass reads as
 * many journals and run records — the runtime's journal is its own on disk, whose reads it counts (`io`), so a read is a read here, which
 * an in-memory journal (rest-store.test.ts) never makes. What a pass reads is what is in flight, never what has finished. The runtime
 * reads a journal for what was appended to it since it last read it, so before the measured pass each run in flight is said a word,
 * which its task's journal takes as a line: what a session at work appends.
 *
 * A file of its own, since `tick` reads every run under `WF_ROOT`, set before the import with no cap on runs in flight; a fake harness
 * whose sessions work until `signAll` signs them. Every pass but the measured ones judges again the runs the memo answered
 * (`verifyRest`), and throws where the two differ.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Sighting } from 'agent-runtime';
import { asyncOps, type AsyncRunner } from '../../test/promised.ts';
import { Effect } from 'effect';
import { Engine } from 'agent-runtime';
import type { Run } from '../run.ts';
import type { PassCost } from '../meter/meter.ts';
import { scratch } from '../../test/scratch.ts';
import { plainEngine } from '../../test/promised.ts';
import { runGiven, runOver } from '../../test/placed.ts';

const ROOT = scratch('wf-rest-reads-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
process.env.WF_ROOT = ROOT;
process.env.WF_MAX_CONCURRENT = '10000';
delete process.env.WF_MAX_RUNS;
const { runWith: runEngine, gitPlaceLayer, startRun, tickRun } = await import('../runner.ts');
const runWith = runOver(runEngine, gitPlaceLayer);
const runPlaced = runGiven(gitPlaceLayer);
const { listRuns } = await import('../record/record.store.ts');
const { freshRestMemo } = await import('./tick.verb.ts');

const REPO = fs.mkdtempSync(path.join(ROOT, 'repo-'));
execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'base'], {
  cwd: (execFileSync('git', ['init', '-q'], { cwd: REPO }), REPO),
  stdio: 'ignore',
});
const ONE = fs.mkdtempSync(path.join(ROOT, 'wf-'));
fs.writeFileSync(path.join(ONE, 'work.md'), '---\nplace: git\nharness: codex\n---\nwork it\n');

/**
 * The runtime over its own journal on disk, with a harness whose sessions work until `signAll` signs all but those of `keep`, and take
 * what they are said.
 */
const engine = () => {
  const sessions = new Map<string, Sighting>();
  let n = 0;
  const runner: AsyncRunner = {
    async spawn(r) {
      n++;
      sessions.set(r.name, { sessionId: `s-${n}`, nativeId: `native-${n}`, state: 'working', busy: true });
    },
    async observe() {
      return new Map(sessions);
    },
    async stop() {},
    async logs() {
      return '';
    },
    async say() {},
  };
  const e = plainEngine(
    Engine.layer({ root: fs.mkdtempSync(path.join(ROOT, 'engine-')), harnesses: { codex: asyncOps(runner) }, defaultHarness: 'codex' }),
  );
  const signAll = (keep: readonly Run[]) => {
    for (const [name, s] of sessions)
      if (s.state === 'working' && !keep.some((r) => name.startsWith(`ae/${r.id}-`)))
        sessions.set(name, {
          ...s,
          state: 'completed',
          busy: false,
          closeout: { payload: { outcome: 'done', summary: 'did it', artifacts: [], needs: null }, at: Date.now() },
        });
  };
  return { e, signAll };
};

const h = engine();
const MEMO = freshRestMemo();
const inFlight: Run[] = [];
for (let k = 0; k < 3; k++)
  inFlight.push(await runPlaced(startRun({ brief: `in flight ${k}`, repo: REPO, workflowDir: ONE, isolate: false })));
const measured = async (): Promise<PassCost> => (await runWith(h.e, tickRun({ repo: ROOT, memo: MEMO, verifyRest: false }))).cost!;

/** A word said to the task of each run in flight, which the runtime appends to its journal. */
const saidToInFlight = async () => {
  for (const run of listRuns().filter((r) => inFlight.some((f) => f.id === r.id)))
    await Effect.runPromise(h.e.say(run.steps.work.taskId!, 'Keep going.'));
};

/**
 * `n` runs more, passed until every run but those in flight is answered from memory; then, each run in flight said a word, the second
 * pass at rest, measured.
 */
const atRest = async (n: number): Promise<PassCost> => {
  for (let k = 0; k < n; k++) await runPlaced(startRun({ brief: `run ${k}`, repo: REPO, workflowDir: ONE, isolate: false }));
  for (let k = 0; k < 12; k++) {
    await runWith(h.e, tickRun({ repo: ROOT, memo: MEMO, verifyRest: true }));
    h.signAll(inFlight);
    if ((await measured()).rested === listRuns().length - inFlight.length) {
      await measured();
      await saidToInFlight();
      return measured();
    }
  }
  assert.fail('the store did not come to rest in twelve passes');
};

/** Every read a pass made through the runtime's readers or the store's, and the journals' alone, with the calls that asked for them. */
const reads = (c: PassCost) => ({
  journals: c.phases.journals.reads,
  asked: c.phases.journals.calls,
  runtime: c.phases.runtime.reads,
  records: c.records,
});

test('a second pass at rest reads as many journals and run records over 50 finished runs as over 5: what is in flight sets it', async () => {
  const five = await atRest(5);
  const fifty = await atRest(45);
  assert.deepEqual([five.rested, fifty.rested], [5, 50], 'every finished run answered from memory');
  assert.ok(reads(five).runtime > 0, `the runtime's pass reads its journals on disk, for what was said (${reads(five).runtime} reads)`);
  assert.equal(five.records, inFlight.length, 'the records of the runs in flight alone');
  assert.deepEqual(reads(fifty), reads(five));
});

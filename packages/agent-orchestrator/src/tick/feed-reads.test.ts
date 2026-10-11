/**
 * What a pass reads of the runtime's feed as it grows: a store at rest beside three runs in flight, its runtime's store copied twice and
 * one copy's feed lengthened by lines of tasks long gone, as a feed that was never rotated grows through the day. An engine made afresh
 * on each copy, as a restarted daemon makes one, and a tick with a fresh memo, read as much on every pass over the long feed as over the
 * short one: the first pass takes where the feed ends, and each after it reads on from where the last stopped, the orchestrator's
 * (`followedFeed`) and the runtime's (`forgetNamed`) alike. Before the third pass each run in flight is said a word, so that pass reads
 * the lines it appended, and only them. And what another caller reads of the engine while a pass waits on its harness, as the api's
 * reads do in the daemon's process, counts nothing to that pass.
 *
 * A file of its own, since `tick` reads every run under `WF_ROOT`, set before the import with no cap on runs in flight; a fake harness
 * whose sessions work until `signAll` signs them. The passes that bring the store to rest judge again the runs the memo answered
 * (`verifyRest`), and throw where the two differ.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { Engine, type Sighting } from 'agent-runtime';
import { asyncOps, plainEngine, type AsyncRunner } from '../../test/promised.ts';
import type { Run } from '../run.ts';
import type { PassCost } from '../meter/meter.ts';
import { scratch } from '../../test/scratch.ts';
import { testPlace } from '../../place/memory/index.ts';
import { runGiven, runOver } from '../../test/placed.ts';

const ROOT = scratch('wf-feed-reads-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
process.env.WF_MAX_CONCURRENT = '10000';
delete process.env.WF_MAX_RUNS;
const { runWith: runEngine, startRun, tickRun } = await import('../runner.ts');
const place = testPlace();
const stand = () => place;
const runWith = runOver(runEngine, () => stand().layer);
const runPlaced = runGiven(() => stand().layer);
const { listRuns } = await import('../record/record.store.ts');
const { freshRestMemo } = await import('./tick.verb.ts');
const { filingsRead } = await import('../views/views.verb.ts');

const REPO = fs.mkdtempSync(path.join(ROOT, 'repo-'));
stand().world.repository(REPO, {});
const ONE = fs.mkdtempSync(path.join(ROOT, 'wf-'));
fs.writeFileSync(path.join(ONE, 'work.md'), '---\nplace: git\nharness: codex\n---\nwork it\n');

/** The lines a long feed carries before the store's own: each a task admitted and long gone. */
const LONG_BY = 20_000;

const sessions = new Map<string, Sighting>();
let spawned = 0;
/** When set, the next observe says so (`entered`) and waits for `gate` before it answers; every observe after it answers at once. */
let holding: { entered: () => void; gate: Promise<void> } | undefined;
const runner: AsyncRunner = {
  async spawn(r) {
    spawned++;
    sessions.set(r.name, { sessionId: `s-${spawned}`, nativeId: `native-${spawned}`, state: 'working', busy: true });
  },
  async observe() {
    const held = holding;
    holding = undefined;
    if (held) {
      held.entered();
      await held.gate;
    }
    return new Map(sessions);
  },
  async stop() {},
  async logs() {
    return '';
  },
  async say() {},
};

/** An engine over the runtime's store at `root`, made afresh, with the harness every engine here shares. */
const engineOn = (root: string) => plainEngine(Engine.layer({ root, harnesses: { codex: asyncOps(runner) }, defaultHarness: 'codex' }));

/** Every session signed but those of `keep`. */
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

const ORIGIN = path.join(ROOT, 'engine');
fs.mkdirSync(ORIGIN);
const inFlight: Run[] = [];
for (let k = 0; k < 3; k++)
  inFlight.push(await runPlaced(startRun({ brief: `in flight ${k}`, repo: REPO, workflowDir: ONE, isolate: false })));
for (let k = 0; k < 10; k++) await runPlaced(startRun({ brief: `run ${k}`, repo: REPO, workflowDir: ONE, isolate: false }));

/** The store passed until every run but those in flight is answered from memory. */
const toRest = async () => {
  const e = engineOn(ORIGIN);
  const memo = freshRestMemo();
  for (let k = 0; k < 12; k++) {
    await runWith(e, tickRun({ repo: ROOT, memo, verifyRest: true }));
    signAll(inFlight);
    const { cost } = await runWith(e, tickRun({ repo: ROOT, memo, verifyRest: false }));
    if (cost!.rested === listRuns().length - inFlight.length) return;
  }
  assert.fail('the store did not come to rest in twelve passes');
};

/** A copy of the runtime's store at rest, its feed lengthened by `by` lines before its own. */
const copied = (name: string, by: number) => {
  const root = path.join(ROOT, name);
  fs.cpSync(ORIGIN, root, { recursive: true });
  const feed = path.join(root, 'feed.jsonl');
  const at = new Date(0).toISOString();
  const gone = Array.from({ length: by }, (_, k) => `${JSON.stringify({ taskId: `gone-${k}`, event: { kind: 'admitted', at } })}\n`);
  fs.writeFileSync(feed, gone.join('') + fs.readFileSync(feed, 'utf8'));
  return { root, feedBytes: fs.statSync(feed).size };
};

/** What a pass read of journals and through the runtime, each by its reads and bytes, and the calls that asked for the journals. */
const reads = (c: PassCost) => ({
  journals: { calls: c.phases.journals.calls, reads: c.phases.journals.reads, bytes: c.phases.journals.bytes },
  runtime: { reads: c.phases.runtime.reads, bytes: c.phases.runtime.bytes },
  records: c.records,
});

/** Three passes of a fresh engine and memo over the store at `root`, the runs in flight said a word before the third. */
const passesOn = async (root: string) => {
  const e = engineOn(root);
  const memo = freshRestMemo();
  const pass = async () => reads((await runWith(e, tickRun({ repo: ROOT, memo, verifyRest: false }))).cost!);
  const first = await pass();
  const second = await pass();
  for (const run of listRuns().filter((r) => inFlight.some((f) => f.id === r.id)))
    await Effect.runPromise(e.say(run.steps.work.taskId!, 'Keep going.'));
  return [first, second, await pass()];
};

test("every pass of a restarted tick reads as much over a feed 20,000 lines longer as over the store's own: none of it grows with the feed", async () => {
  await toRest();
  const short = copied('engine-short', 0);
  const long = copied('engine-long', LONG_BY);
  assert.ok(long.feedBytes - short.feedBytes > 1_000_000, `the long feed is ${long.feedBytes - short.feedBytes} bytes longer`);
  const shortReads = await passesOn(short.root);
  const longReads = await passesOn(long.root);
  assert.ok(shortReads[2].runtime.bytes > 0 && shortReads[2].journals.bytes > 0, 'the third pass reads the lines the words appended');
  assert.deepEqual(longReads, shortReads);
});

/** Each harness's observes in a pass, by what they listed and started: their time is the machine's. */
const observes = (c: PassCost) =>
  Object.fromEntries(Object.entries(c.harnesses).map(([name, h]) => [name, { calls: h.calls, listed: h.listed, spawned: h.spawned }]));

test('REFUSED: what another caller reads of the engine while a pass waits on its harness counts nothing to the pass: it reads as much as the pass before it', async () => {
  await toRest();
  const { root } = copied('engine-beside', 0);
  const e = engineOn(root);
  const memo = freshRestMemo();
  const pass = async () => (await runWith(e, tickRun({ repo: ROOT, memo, verifyRest: false }))).cost!;
  await pass();
  const quiet = await pass();
  let entered = () => {};
  const waiting = new Promise<void>((r) => (entered = r));
  let release = () => {};
  holding = { entered, gate: new Promise<void>((r) => (release = r)) };
  const besideIt = pass();
  await waiting;
  const io0 = Effect.runSync(e.io());
  await runWith(e, filingsRead(0));
  for (const run of listRuns().filter((r) => inFlight.some((f) => f.id === r.id))) await Effect.runPromise(e.view(run.steps.work.taskId!));
  const io1 = Effect.runSync(e.io());
  release();
  const beside = await besideIt;
  const observed = (io: typeof io0) => io.observed.codex?.calls ?? 0;
  assert.ok(io1.bytesRead > io0.bytesRead && observed(io1) > observed(io0), 'the reads beside the pass read the feed and observed');
  assert.deepEqual([reads(beside), observes(beside)], [reads(quiet), observes(quiet)]);
});

/**
 * The informer (`Informer`, informer.verb.ts): a run's judgement made once per pass and served from memory. The tick's pass judges each run
 * it reads and keeps it; the run's object (`runObject`) and the runs list (`runsSummarized`) then answer from that judgement with no
 * `judge` of their own, until a write moves what it was judged on — an approval marker beside the record, a line of its task on the
 * engine's feed — or, for a run still moving, the next pass begins. A process given none judges on demand, and a cold informer answers as
 * a warm one does. Over the stand-ins: the test engine and the test place.
 *
 * On a store of its own at `ROOT`, given as `ENV`, with `WF_VERIFY_REST=1`, as every test that ticks a store, and a read that counts
 * what it judged turns it off for itself (`unverified`), since a verified read judges each answer afresh.
 */
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Tracer } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { scratch } from 'test-kit/scratch';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runGiven, runOver } from '../../test/placed.ts';
import { advanceRun, approveRun, startRun, tickRun, runWith as runEngine } from '../runner.ts';
import { runObject } from '../object/run.verb.ts';
import { runsSummarized } from '../summary/summary.verb.ts';
import { Informer, informerMemo, passStarted, type InformerMemo } from './informer.verb.ts';
import { runRecord } from '../record/record.store.ts';
import { engineOf } from '../runtime-client.ts';

const ROOT = scratch('wf-informer-');
const RUNS_DIR = path.join(ROOT, 'runs');
/** The test's store and settings; `unverified` turns `WF_VERIFY_REST` off in it for a read, and the settings are read as they are asked. */
const ENV: Record<string, string | undefined> = {
  ...process.env,
  WF_ROOT: ROOT,
  WF_VERIFY_REST: '1',
  WF_DEFAULT_FACTORY_STARTS: '1',
  WF_MAX_CONCURRENT: undefined,
  WF_MAX_RUNS: undefined,
};

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };
const AT = '2026-10-14T09:30:00.000Z';

const stand = eachTest(testPlace);
const runWith = runOver(runEngine, () => stand().layer, ENV);
const runPlaced = runGiven(() => stand().layer, ENV);
const engine = eachTest(testEngine);
/**
 * The engine's feed, which the stand-in keeps none of: each line a test appends with `fed`, as every append to a task's journal writes
 * one on the runtime's.
 */
const lines: Array<{ taskId: string; event: { kind: 'settled'; at: string; outcome: 'succeeded' } }> = [];
const fed = (taskId: string) => lines.push({ taskId, event: { kind: 'settled', at: AT, outcome: 'succeeded' } });
const e = () => ({
  ...engineOf(engine().layer),
  feed: (after = 0) => Effect.succeed({ entries: lines.slice(after), cursor: lines.length } as never),
});

beforeEach(() => {
  lines.length = 0;
  fs.rmSync(RUNS_DIR, { recursive: true, force: true });
  fs.mkdirSync(RUNS_DIR, { recursive: true });
});

/** A run of one step, `work`, started in a repository of its own and advanced one pass, so its step is filed; gated where asked. */
const started = async (gates: string[] = []): Promise<string> => {
  const dir = scratch('wf-informer-team-');
  fs.writeFileSync(path.join(dir, 'work.md'), '---\nplace: git\n---\nwork it\n');
  const repo = scratch('wf-informer-repo-');
  stand().world.repository(repo, {});
  const run = await runPlaced(startRun({ brief: 'inform me', repo, workflowDir: dir, gates }));
  await runWith(e(), advanceRun(runRecord(ROOT, run.id)));
  return run.id;
};

/** A run whose step signed off and now waits at its gate for a person's approval: at rest. */
const atItsGate = async (): Promise<string> => {
  const id = await started(['work']);
  engine().settle(`${id}-work`, 'succeeded', { closeout: SIGNED, startedAt: AT, spawnedAt: AT });
  await runWith(e(), advanceRun(runRecord(ROOT, id)));
  return id;
};

/** A run whose step's session is at work: a run still moving. */
const atWork = async (): Promise<string> => {
  const id = await started();
  engine().settle(`${id}-work`, 'working', { startedAt: AT, spawnedAt: AT });
  return id;
};

/** `program` over `informer`, as a daemon gives one; over none where it is undefined. */
const informed = <A, E, R>(program: Effect.Effect<A, E, R>, informer: InformerMemo | undefined) =>
  Effect.provideService(program, Informer, informer);

/** What the runtime's own pass answers here: nothing admitted, nothing started, no view — every task is read off the stand-in. */
const QUIET = { tasks: 0, actions: 0, running: {}, views: [], ms: 0, observed: {}, refused: [], unreadable: [], unobserved: [] };

/**
 * A pass of the tick, filling `informer`, over the stand-in given what it keeps none of: the runtime's own pass, which reports nothing
 * (`QUIET`), and no tally.
 */
const tick = (informer: InformerMemo) =>
  runWith(
    Object.assign({ ...e() }, { tick: () => Effect.succeed(QUIET), tallied: undefined }),
    informed(tickRun({ repo: ROOT }), informer),
  );

/** A program as it is run: traced by a test's tracer where `judges` counts it, else as it is. */
type Wrap = <A, E, R>(program: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;
const asIs: Wrap = (program) => program;

/** The run `id` as one object, through `informer`. */
const objectOf = (id: string, informer: InformerMemo | undefined, wrap: Wrap = asIs) =>
  runWith(e(), wrap(informed(runObject(runRecord(ROOT, id), { memo: { said: new Map() } }), informer)));

/** Every run's row, through `informer`. */
const listOf = (informer: InformerMemo, wrap: Wrap = asIs) =>
  runWith(e(), wrap(runsSummarized(e(), { home: ROOT, memo: informer, verify: false })));

/** `f` with `WF_VERIFY_REST` off: what the informer alone answers, no answer judged afresh beside it. */
async function unverified<T>(f: () => Promise<T>): Promise<T> {
  ENV.WF_VERIFY_REST = '0';
  try {
    return await f();
  } finally {
    ENV.WF_VERIFY_REST = '1';
  }
}

/** How many times `f` judged a run: the `judge` spans it made (`judge` in summary/judged.verb.ts), each one run judged. */
async function judges(f: (traced: Wrap) => Promise<unknown>) {
  const spans: Tracer.NativeSpan[] = [];
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options);
      spans.push(span);
      return span;
    },
  });
  await unverified(() => f((p) => Effect.withTracer(p, tracer)));
  return spans.filter((span) => span.name === 'judge').length;
}

test('after a pass, the run object and the runs list answer a run at its gate from what the pass judged, judging nothing', async () => {
  const id = await atItsGate();
  const informer = informerMemo();
  await tick(informer);
  assert.ok(informer.runs.has(id), 'the pass kept its judgement of the run');
  assert.equal(await judges((traced) => objectOf(id, informer, traced)), 0, "the object reads the pass's judgement");
  assert.equal(await judges((traced) => listOf(informer, traced)), 0, 'and so does the list');
  assert.equal(
    await judges((traced) => objectOf(id, undefined, traced)),
    1,
    'with no informer the object judges the run on demand, as an in-process read does',
  );
});

test('an approval written in-process after the pass is seen at once: its marker moves the stamp, and the next read judges the run again', async () => {
  const id = await atItsGate();
  const informer = informerMemo();
  await tick(informer);
  const before = await objectOf(id, informer);
  assert.ok(!('unjudged' in before));
  assert.deepEqual(before.status.waitingOnYou, ['work'], 'the fixture waits at its gate');
  await runWith(e(), approveRun(id, 'work'));
  const judged = await judges((traced) => objectOf(id, informer, traced));
  assert.equal(judged, 1, 'judged again');
  const after = await objectOf(id, informer);
  assert.ok(!('unjudged' in after));
  assert.deepEqual(after.status.waitingOnYou, [], 'no longer waiting at its gate, with no pass between');
});

test("a task settled after the pass is seen at once: its line on the engine's feed takes the run out", async () => {
  const id = await atWork();
  const informer = informerMemo();
  await tick(informer);
  assert.equal(await judges((traced) => objectOf(id, informer, traced)), 0, 'served within the pass that judged it');
  engine().settle(`${id}-work`, 'succeeded', { closeout: SIGNED, startedAt: AT, spawnedAt: AT });
  fed(`${id}-work`);
  assert.equal(await judges((traced) => objectOf(id, informer, traced)), 1, 'judged again');
});

test('a moving run is served within the pass that judged it, and judged again on the first read once the next pass begins', async () => {
  const id = await atWork();
  const informer = informerMemo();
  await tick(informer);
  assert.equal(await judges((traced) => objectOf(id, informer, traced)), 0, 'the first read within the pass');
  assert.equal(await judges((traced) => objectOf(id, informer, traced)), 0, 'and a second');
  passStarted(informer);
  assert.equal(await judges((traced) => objectOf(id, informer, traced)), 1, 'the next pass began: its sightings of the harness are stale');
  assert.equal(await judges((traced) => objectOf(id, informer, traced)), 0, 'what that read judged is served within this pass');
  assert.equal(await judges((traced) => listOf(informer, traced)), 0, 'to the list too');
});

test('a restart rebuilds it: a cold informer answers the object and the list as the warm one does', async () => {
  const id = await atItsGate();
  await atWork();
  const warm = informerMemo();
  await tick(warm);
  const cold = informerMemo();
  assert.deepEqual(await objectOf(id, cold), await objectOf(id, warm));
  assert.deepEqual(await listOf(cold), await listOf(warm));
});

test('REFUSED: a judgement the informer holds otherwise than a fresh one makes a verified read die naming the run (WF_VERIFY_REST)', async () => {
  const id = await atItsGate();
  const informer = informerMemo();
  await tick(informer);
  const entry = informer.runs.get(id);
  assert.ok(entry);
  informer.runs.set(id, { ...entry, value: { ...entry.value, judged: { ...entry.value.judged, waitingOnYou: [] } } });
  const served = await unverified(() => objectOf(id, informer));
  assert.ok(!('unjudged' in served));
  assert.deepEqual(served.status.waitingOnYou, [], 'unverified, the informer answers what it holds');
  await assert.rejects(objectOf(id, informer), (err: Error) => err.message.includes(id) && /WF_VERIFY_REST/.test(err.message));
});

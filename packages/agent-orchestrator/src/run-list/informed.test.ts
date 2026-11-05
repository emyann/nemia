/**
 * The RunList through the informer (`runList`, run-list.verb.ts): each run's listed object kept beside its judgement and served from
 * memory while every input it was built on holds, and its parts no stamp watches read on every request. A warm list answers as a cold
 * one does — a fresh informer, which is a restart — after each input that changes a run's object is planted; an object built on a check
 * output the engine did not give is not kept; and a kept object that differs from a fresh one is refused under `WF_VERIFY_REST`. Over the
 * stand-ins: the test engine, with a feed the test appends to, and the test place.
 *
 * `WF_ROOT` is set before the package is imported, since the store reads it as it loads; `WF_VERIFY_REST=1`, as every test that ticks a
 * store, and a read that counts what it served turns it off for itself (`unverified`).
 */
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Tracer } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { scratch } from '../../test/scratch.ts';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runGiven, runOver } from '../../test/placed.ts';

const ROOT = scratch('wf-runlist-informed-');
const RUNS_DIR = path.join(ROOT, 'runs');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
process.env.WF_DEFAULT_FACTORY_STARTS = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const { advanceRun, approveRun, cancelRun, startRun, runWith: runEngine } = await import('../runner.ts');
const { runList } = await import('./run-list.verb.ts');
const { informerMemo, passStarted } = await import('../rest/informer.verb.ts');
const { readRun, pruneFile } = await import('../record/record.store.ts');
const { writeLabels } = await import('../record/files.store.ts');
const { artifactsDir } = await import('../record/record.store.ts');
const { verifiesRest } = await import('../config/config.store.ts');
const { engineOf } = await import('../runtime-client.ts');
type InformerMemo = import('../rest/informer.verb.ts').InformerMemo;
type RunList = import('objects').RunList;

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };
const AT = '2026-10-14T09:30:00.000Z';

const stand = eachTest(testPlace);
const runWith = runOver(runEngine, () => stand().layer);
const runPlaced = runGiven(() => stand().layer);
const engine = eachTest(testEngine);
const lines: Array<{ taskId: string; event: { kind: 'settled'; at: string; outcome: 'succeeded' } }> = [];
const fed = (taskId: string) => lines.push({ taskId, event: { kind: 'settled', at: AT, outcome: 'succeeded' } });
/** Whether the engine's `output` refuses, as an engine that cannot give a check's stream does. */
let outputRefused = false;
const e = () => {
  const base = engineOf(engine().layer);
  return {
    ...base,
    feed: (after = 0) => Effect.succeed({ entries: lines.slice(after), cursor: lines.length } as never),
    output: ((...args: Parameters<typeof base.output>) =>
      outputRefused ? Effect.fail(new Error('the engine is not answering')) : base.output(...args)) as typeof base.output,
  };
};

beforeEach(() => {
  lines.length = 0;
  outputRefused = false;
  fs.rmSync(RUNS_DIR, { recursive: true, force: true });
  fs.mkdirSync(RUNS_DIR, { recursive: true });
});

/** A workflow folder of the one step `work`, with the frontmatter `front`. */
const team = (front: string): string => {
  const dir = scratch('wf-runlist-team-');
  fs.writeFileSync(path.join(dir, 'work.md'), `---\n${front}\n---\nwork it\n`);
  return dir;
};

/** A run of one step, `work`, advanced one pass so its step is filed: in a repository of its own, or a folder run's (`place: folder`). */
const started = async (front = 'place: git', gates: string[] = []): Promise<{ id: string; dir: string }> => {
  const dir = team(front);
  const repo = scratch('wf-runlist-repo-');
  stand().world.repository(repo, {});
  const run = await runPlaced(startRun({ brief: 'list me', repo, workflowDir: dir, gates }));
  await runWith(e(), advanceRun(readRun(run.id)));
  return { id: run.id, dir };
};

/** A run whose step signed off, advanced: at its gate where it has one, else finished. At rest either way. */
const signed = async (front?: string, gates: string[] = []) => {
  const run = await started(front, gates);
  engine().settle(`${run.id}-work`, 'succeeded', { closeout: SIGNED, startedAt: AT, spawnedAt: AT });
  await runWith(e(), advanceRun(readRun(run.id)));
  return run;
};

/** A run at rest: its step signed off, waiting at its gate (a finished run of a repository still owes its hand-off, and moves). */
const resting = () => signed(undefined, ['work']);

/** A run whose step's session is at work: a run still moving. */
const atWork = async () => {
  const run = await started();
  engine().settle(`${run.id}-work`, 'working', { startedAt: AT, spawnedAt: AT });
  return run;
};

/** The whole RunList through `memo`, verified as `WF_VERIFY_REST` says. */
const listOf = (memo: InformerMemo, wrap: <A, E, R>(p: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R> = (p) => p) =>
  runWith(
    e(),
    wrap(
      runList(
        e(),
        { home: ROOT, memo, filings: { filed: new Map(), cursor: 0 }, verify: verifiesRest() },
        { memo: { filings: { filed: new Map(), cursor: 0 }, said: new Map() } },
        {},
      ),
    ),
  );

/** `f` with `WF_VERIFY_REST` off: what the informer alone answers. */
async function unverified<T>(f: () => Promise<T>): Promise<T> {
  process.env.WF_VERIFY_REST = '0';
  try {
    return await f();
  } finally {
    process.env.WF_VERIFY_REST = '1';
  }
}

/** The object of `id` in `list`. */
const itemOf = (list: RunList, id: string) => list.items.find((item) => item.metadata.name === id);

/** How many runs `f` judged: its `judge` spans (summary/judged.verb.ts). */
async function judges(f: (wrap: <A, E, R>(p: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>) => Promise<unknown>) {
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

test('a warm RunList serves each run at rest from memory, judging only the run still moving, and answers as a cold one does', async () => {
  await signed('place: folder');
  await resting();
  await resting();
  await atWork();
  const memo = informerMemo();
  await unverified(() => listOf(memo));
  const before = memo.objectHits;
  assert.equal(await judges((wrap) => listOf(memo, wrap)), 1, 'the moving run alone is judged again');
  assert.equal(memo.objectHits - before, 3, 'each run at rest is served its kept object');
  assert.deepEqual(await unverified(() => listOf(memo)), await listOf(informerMemo()), 'a restart answers alike');
});

type Made = { id: string; dir: string };
/** A row: the run it plants on (`make`), and the input planted (`plant`), with the informer it was served from. */
type Row = { name: string; make: () => Promise<Made>; plant: (run: Made, memo: InformerMemo) => unknown; pass?: true };

const ROWS: Row[] = [
  {
    name: 'a record write: the run called off, as nemia cancel writes it',
    make: () => started(),
    plant: (run) => runWith(e(), cancelRun(run.id)),
    pass: true,
  },
  { name: 'the labels file, as nemia label run writes it', make: () => resting(), plant: (run) => writeLabels(run.id, { team: 'core' }) },
  {
    name: 'an ask written by another process, no informer told: the gate approved',
    make: () => signed(undefined, ['work']),
    plant: (run) => runWith(e(), approveRun(run.id, 'work')),
  },
  {
    name: 'a prune from the CLI: its marker written, its worktrees removed',
    make: () => resting(),
    plant: (run) => {
      fs.writeFileSync(pruneFile(run.id), JSON.stringify({ at: AT, worktrees: [] }));
      fs.rmSync(path.join(ROOT, 'worktrees', run.id), { recursive: true, force: true });
    },
  },
  {
    name: "a line of its task on the engine's feed: the session settled",
    make: () => atWork(),
    plant: (run) => {
      engine().settle(`${run.id}-work`, 'succeeded', { closeout: SIGNED, startedAt: AT, spawnedAt: AT });
      fed(`${run.id}-work`);
    },
    pass: true,
  },
  {
    name: 'a new pass for a moving run, its session signed off since with no line fed',
    make: () => atWork(),
    plant: (run, memo) => {
      engine().settle(`${run.id}-work`, 'succeeded', { closeout: SIGNED, startedAt: AT, spawnedAt: AT });
      passStarted(memo);
    },
    pass: true,
  },
  {
    name: 'its worktree folder removed by hand, no stamp moved',
    make: async () => {
      const run = await resting();
      fs.mkdirSync(path.join(ROOT, 'worktrees', run.id), { recursive: true });
      return run;
    },
    plant: (run) => fs.rmSync(path.join(ROOT, 'worktrees', run.id), { recursive: true, force: true }),
  },
  {
    name: 'its files folder removed',
    make: async () => {
      const run = await resting();
      fs.mkdirSync(artifactsDir(readRun(run.id), 'work'), { recursive: true });
      return run;
    },
    plant: (run) => fs.rmSync(path.dirname(artifactsDir(readRun(run.id), '_')), { recursive: true, force: true }),
  },
  {
    name: "a folder run's step folder gaining a file",
    make: () => signed('place: folder'),
    plant: (run) => {
      const dir = readRun(run.id).steps.work?.workspace;
      assert.ok(dir, 'a folder run works in a folder of its own');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'made.txt'), 'made\n');
    },
  },
  { name: 'the workflow folder losing its step file', make: () => resting(), plant: (run) => fs.rmSync(path.join(run.dir, 'work.md')) },
];

test('each input that changes a run object, planted, is served fresh', async (t) => {
  for (const { name, make, plant, pass } of ROWS)
    await t.test(name, async () => {
      fs.rmSync(RUNS_DIR, { recursive: true, force: true });
      fs.mkdirSync(RUNS_DIR, { recursive: true });
      const run = await make();
      const memo = informerMemo();
      if (pass) passStarted(memo);
      await unverified(() => listOf(memo));
      const hits = memo.objectHits;
      const was = itemOf(await unverified(() => listOf(memo)), run.id);
      assert.ok(was, 'the fixture is listed');
      assert.equal(memo.objectHits - hits, 1, 'and served from memory before the plant');
      await plant(run, memo);
      const warm = await unverified(() => listOf(memo));
      assert.deepEqual(warm, await unverified(() => listOf(informerMemo())), 'the warm list answers as a cold one');
      assert.notDeepEqual(itemOf(warm, run.id), was, 'the planted input moved the object');
    });
});

test('an object built on a check output the engine did not give is not kept: the next read serves the output once it reads', async () => {
  const run = await started('place: git\ncheck: false');
  engine().settle(`${run.id}-work`, 'succeeded', { closeout: SIGNED, startedAt: AT, spawnedAt: AT });
  await runWith(e(), advanceRun(readRun(run.id)));
  engine().settle(`${run.id}-work-check`, 'failed', { exitCode: 1, startedAt: AT, spawnedAt: AT });
  await runWith(e(), advanceRun(readRun(run.id)));
  const memo = informerMemo();
  outputRefused = true;
  const first = itemOf(await unverified(() => listOf(memo)), run.id);
  const check = first?.status.steps.find((s) => s.name === 'work')?.check;
  assert.equal(typeof check?.refused?.unreadable, 'string', 'the check refused, and its output did not read');
  outputRefused = false;
  const hits = memo.objectHits;
  const second = itemOf(await unverified(() => listOf(memo)), run.id);
  assert.equal(memo.objectHits, hits, 'nothing was kept to serve');
  assert.equal(second?.status.steps.find((s) => s.name === 'work')?.check?.refused?.unreadable, null, 'the output reads now');
});

test('REFUSED: a kept object that differs from one built afresh makes a verified list die (WF_VERIFY_REST)', async () => {
  const run = await signed(undefined, ['work']);
  const memo = informerMemo();
  await unverified(() => listOf(memo));
  const entry = memo.runs.get(run.id);
  assert.ok(entry?.object, 'the list kept the run object');
  entry.object = { ...entry.object, status: { ...entry.object.status, phase: 'running' } };
  const served = itemOf(await unverified(() => listOf(memo)), run.id);
  assert.equal(served?.status.phase, 'running', 'unverified, the informer serves what it holds');
  await assert.rejects(listOf(memo), (err: Error) => err.message.includes(run.id) && err.message.includes('WF_VERIFY_REST'));
});


test('an object is kept only on the entry holding the judgement it was built on: one a newer judgement replaced meanwhile is given none', async () => {
  const { keepObject, keptObject } = await import('../rest/informer.verb.ts');
  const memo = informerMemo<object, string>();
  const [older, newer] = [{ judged: 'older' }, { judged: 'newer' }];
  const entry = { stamp: 's', run: {} as never, tips: {}, atRest: true, pass: undefined };
  memo.runs.set('r', { ...entry, value: newer });
  keepObject(memo, 'r', older, 'built on the older');
  assert.equal(keptObject(memo, 'r', newer), undefined, 'the newer judgement is served no object built on the older');
  keepObject(memo, 'r', newer, 'built on the newer');
  assert.equal(keptObject(memo, 'r', newer), 'built on the newer');
  assert.equal(keptObject(memo, 'r', older), undefined, 'and an older judgement in hand is served none');
});

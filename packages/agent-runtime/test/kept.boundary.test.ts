/**
 * `Engine.kept` on the files store and a real harness folder: what a task keeps on the disk, in bytes as the file system counts
 * them — its journal, the bodies it is first to name, its harness's files and the harness's own record of each session its
 * journal names — and what it never counts: a person's own session in the same folder, a body twice, a forgotten task's record.
 * The harness is Claude Code's detached one, whose folder is `CLAUDE_CONFIG_DIR`, set before `src` loads; no session is started.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import type { Event, RunnerOps } from '../src/index.ts';
import { scratch } from './scratch.ts';

const config = scratch('ae-kept-config-');
process.env.CLAUDE_CONFIG_DIR = config;
const { Engine, Journal, RunnerError, claudeDetached } = await import('../src/index.ts');
const { diskBytesOf, ioCounts } = await import('../src/core/engine/index.ts');
const { asyncOps } = await import('./promise-runner.ts');
const { builtEngine } = await import('./engine.ts');

const HARNESS = 'claude-detached';
const at = '2026-10-12T10:00:00.000Z';

/** The bytes `file` takes on the disk, read by the test itself. */
const blocksOf = (file: string): number => fs.lstatSync(file).blocks * 512;

/** A file of `bytes` bytes at `file`, its folder made: at least a block, so no file system keeps it inline. */
const plant = (file: string, bytes = 8192): string => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'x'.repeat(bytes));
  assert.ok(blocksOf(file) > 0, `${file} takes blocks`);
  return file;
};

/** Where Claude Code keeps the transcript of the session `id`, in the project folder `project`. */
const transcriptAt = (project: string, id: string): string => path.join(config, 'projects', project, `${id}.jsonl`);

/** A journal of one attempt under `taskId`, written through the store: filed on `harness`, started, and ended by `nativeId` when given. */
const journalled = async (
  root: string,
  taskId: string,
  {
    harness = HARNESS,
    nativeId,
    brief = `do ${taskId}`,
    settled = true,
  }: { harness?: string; nativeId?: string; brief?: string; settled?: boolean } = {},
) => {
  const events: Event[] = [
    { kind: 'filed', at, brief, cwd: '/r', harness },
    { kind: 'starting', at, attempt: 1 },
    { kind: 'spawned', at, attempt: 1 },
    ...(settled
      ? ([
          {
            kind: 'ended',
            at,
            attempt: 1,
            sessionId: `job-${taskId}`,
            observed: 'done',
            reason: 'harness',
            ...(nativeId ? { nativeId } : {}),
          },
          { kind: 'settled', at, outcome: 'succeeded' },
        ] satisfies Event[])
      : []),
  ];
  const append = Effect.forEach(events, (event) => Effect.flatMap(Journal, (j) => j.append(taskId, event)), { discard: true });
  await Effect.runPromise(append.pipe(Effect.provide(Journal.files(root))));
};

/** A real engine over the files store under `root`, with the shipped harnesses and `more`. */
const engineOn = (root: string, more: Record<string, RunnerOps> = {}) =>
  builtEngine(Engine.layer({ root, harnesses: { [HARNESS]: claudeDetached, ...more }, defaultHarness: HARNESS }));

/** What `kept` answers of the task `taskId`. */
const keptOf = async (engine: ReturnType<typeof engineOn>, taskId: string) =>
  (await Effect.runPromise(engine.kept())).tasks.find((t) => t.taskId === taskId);

const nothing = asyncOps({ spawn: async () => {}, observe: async () => new Map(), stop: async () => {}, logs: async () => '' });

test("a task's records are the transcript its journal names by id, and the folder beside it, in bytes on disk", async () => {
  const root = scratch('ae-kept-root-');
  await journalled(root, 't1', { nativeId: 'sess-1' });
  const transcript = plant(transcriptAt('-r', 'sess-1'));
  const beside = plant(path.join(config, 'projects', '-r', 'sess-1', 'subagents', 'a.jsonl'), 4096);
  const runFile = plant(path.join(root, 'runs', HARNESS, 'ae_t1_1.stdout'), 4096);
  const kept = await keptOf(engineOn(root), 't1');
  const folder = blocksOf(path.dirname(path.dirname(beside))) + blocksOf(path.dirname(beside)) + blocksOf(beside);
  assert.deepEqual(kept, {
    taskId: 't1',
    journal: blocksOf(path.join(root, 'tasks', 't1.jsonl')),
    bodies: 0,
    files: blocksOf(runFile),
    records: blocksOf(transcript) + folder,
  });
  assert.ok(kept.records > 0 && kept.journal > 0 && kept.files > 0, 'each part was measured');
});

test("REFUSED, a person's own: a transcript in the same project folder under an id no journal names changes no number", async () => {
  const root = scratch('ae-kept-root-');
  await journalled(root, 't1', { nativeId: 'sess-own-1' });
  plant(transcriptAt('-shared', 'sess-own-1'));
  const engine = engineOn(root);
  const before = await Effect.runPromise(engine.kept());
  assert.ok(before.tasks[0].records! > 0, "the task's own transcript is counted");
  plant(transcriptAt('-shared', 'a-persons-own-session'), 65536);
  plant(path.join(root, 'runs', HARNESS, 'ae_t10_1.stdout'), 4096);
  assert.deepEqual(await Effect.runPromise(engine.kept()), before);
});

test('a body two journals name is counted once, for the first task in list order, and no body is read to measure', async () => {
  const root = scratch('ae-kept-root-');
  const brief = 'b'.repeat(20000);
  await journalled(root, 'b2', { brief });
  await journalled(root, 'b1', { brief });
  const [body] = fs.readdirSync(path.join(root, 'bodies'));
  const engine = engineOn(root);
  const reads = ioCounts().reads;
  const { tasks } = await Effect.runPromise(engine.kept());
  assert.deepEqual(
    tasks.map((t) => [t.taskId, t.bodies]),
    [
      ['b1', blocksOf(path.join(root, 'bodies', body))],
      ['b2', 0],
    ],
  );
  assert.ok(tasks[0].bodies >= 20000, 'the body was measured');
  assert.equal(ioCounts().reads - reads, 2, 'two journals were read, and no body');
});

test('the parts of every task add up to no more than a walk of the root in the same measure', async () => {
  const root = scratch('ae-kept-root-');
  await journalled(root, 'i1', { brief: 'c'.repeat(30000), nativeId: 'sess-i1' });
  await journalled(root, 'i2', { brief: 'c'.repeat(30000) });
  await journalled(root, 'i3', { brief: 'd'.repeat(5000) });
  plant(path.join(root, 'runs', HARNESS, 'ae_i1_1.stdout'), 50000);
  plant(path.join(root, 'runs', HARNESS, 'ae_i2_1.json'), 100);
  const { tasks } = await Effect.runPromise(engineOn(root).kept());
  const parts = tasks.reduce((sum, t) => sum + t.journal + t.bodies + t.files, 0);
  assert.ok(parts > 80000, `the parts were measured: ${parts}`);
  assert.ok(parts <= diskBytesOf(root)!, `${parts} is no more than the root's ${diskBytesOf(root)}`);
});

test('a task at work is answered, where forget would refuse it, and the record of an attempt still at work is in no byte yet', async () => {
  const root = scratch('ae-kept-root-');
  await journalled(root, 'w1', { settled: false });
  const running = plant(path.join(root, 'runs', HARNESS, 'ae_w1_1.stdout'));
  plant(transcriptAt('-r', 'sess-w1'));
  const engine = engineOn(root);
  const kept = await keptOf(engine, 'w1');
  assert.deepEqual(kept, { taskId: 'w1', journal: blocksOf(path.join(root, 'tasks', 'w1.jsonl')), bodies: 0, files: blocksOf(running) });
  const refused = await Effect.runPromise(Effect.flip(engine.forget(['w1'])));
  assert.equal(refused._tag, 'ForgetRefused');
});

test('an attempt left open is counted by the id its task settled with: a session stopped by a person', async () => {
  const root = scratch('ae-kept-root-');
  const events: Event[] = [
    { kind: 'filed', at, brief: 'do o1', cwd: '/r', harness: HARNESS },
    { kind: 'starting', at, attempt: 1 },
    { kind: 'settled', at, outcome: 'stopped', nativeId: 'sess-o1' },
  ];
  const append = Effect.forEach(events, (event) => Effect.flatMap(Journal, (j) => j.append('o1', event)), { discard: true });
  await Effect.runPromise(append.pipe(Effect.provide(Journal.files(root))));
  const transcript = plant(transcriptAt('-r', 'sess-o1'));
  assert.equal((await keptOf(engineOn(root), 'o1'))?.records, blocksOf(transcript));
});

test('REFUSED: a name of the run folder with no dot is no file of a session whose name it starts with', async () => {
  const root = scratch('ae-kept-root-');
  await journalled(root, 'd1');
  const own = plant(path.join(root, 'runs', HARNESS, 'ae_d1_1.stdout'), 4096);
  const dotless = plant(path.join(root, 'runs', HARNESS, 'ae_d1_12'), 65536);
  const engine = engineOn(root);
  assert.equal((await keptOf(engine, 'd1'))?.files, blocksOf(own));
  await Effect.runPromise(engine.forget(['d1'], { yes: true }));
  assert.deepEqual([fs.existsSync(own), fs.existsSync(dotless)], [false, true], 'forget removes the session file, and leaves the other');
});

test("Claude Code's harness names what either mode keeps of a session once: a job's run file, a background session's file, the transcript", async () => {
  const root = scratch('ae-kept-root-');
  await journalled(root, 'c1', { harness: 'claude', nativeId: 'sess-c1' });
  const job = plant(path.join(root, 'runs', 'claude', 'ae_c1_1.stdout'), 4096);
  const parent = plant(path.join(root, 'parent', 'ae_c1_1.json'), 12000);
  const transcript = plant(transcriptAt('-r', 'sess-c1'), 20000);
  const engine = builtEngine(Engine.layer({ root, harnesses: { claude: 'claude' }, defaultHarness: 'claude' }));
  assert.deepEqual(await keptOf(engine, 'c1'), {
    taskId: 'c1',
    journal: blocksOf(path.join(root, 'tasks', 'c1.jsonl')),
    bodies: 0,
    files: blocksOf(job) + blocksOf(parent),
    records: blocksOf(transcript),
  });
});

test("a remote harness names a session's entry, open or let go of, and no record", async () => {
  const root = scratch('ae-kept-root-');
  await journalled(root, 'r1', { harness: 'far', nativeId: 'context-1' });
  await journalled(root, 'r2', { harness: 'far', nativeId: 'context-2' });
  const open = plant(path.join(root, 'remote', `${encodeURIComponent('ae/r1/1')}.json`), 4096);
  const done = plant(path.join(root, 'remote', 'done', `${encodeURIComponent('ae/r2/1')}.json`), 12000);
  const engine = builtEngine(Engine.layer({ root, harnesses: { far: { url: 'http://127.0.0.1:9/' } }, defaultHarness: 'far' }));
  const { tasks } = await Effect.runPromise(engine.kept());
  assert.deepEqual(
    tasks.map((t) => [t.taskId, t.files, Object.hasOwn(t, 'records'), t.unread]),
    [
      ['r1', blocksOf(open), false, undefined],
      ['r2', blocksOf(done), false, undefined],
    ],
  );
});

test('a harness with no kept answers no records and no files, and its task is still named with its journal', async () => {
  const root = scratch('ae-kept-root-');
  await journalled(root, 'n1', { harness: 'bare', nativeId: 'sess-n1' });
  plant(transcriptAt('-r', 'sess-n1'));
  const kept = await keptOf(engineOn(root, { bare: nothing }), 'n1');
  assert.deepEqual(kept, { taskId: 'n1', journal: blocksOf(path.join(root, 'tasks', 'n1.jsonl')), bodies: 0, files: 0 });
  assert.equal(Object.hasOwn(kept, 'records'), false, 'no record is no key, never zero');
});

test("a harness's kept reaches the answer through the Engine service, and one whose kept fails is said on its own tasks alone", async () => {
  const root = scratch('ae-kept-root-');
  const file = plant(path.join(scratch('ae-kept-far-'), 'kept-by-the-harness'));
  const record = plant(path.join(scratch('ae-kept-far-'), 'its-own-record'), 12000);
  const asked: unknown[] = [];
  const keeping: RunnerOps = {
    ...nothing,
    kept: (sessions) => {
      asked.push(sessions);
      return Effect.succeed({ 'ae/s1/1': { files: [file], records: [record] }, 'ae/s2/1': { files: [file], records: [] } });
    },
  };
  const failing: RunnerOps = { ...nothing, kept: () => Effect.fail(new RunnerError({ verb: 'kept', message: 'fake: no disk today' })) };
  await journalled(root, 's1', { harness: 'keeping', nativeId: 'n-1' });
  await journalled(root, 's2', { harness: 'keeping' });
  await journalled(root, 'f1', { harness: 'failing' });
  const { tasks } = await Effect.runPromise(engineOn(root, { keeping, failing }).kept());
  const journal = (id: string) => blocksOf(path.join(root, 'tasks', `${id}.jsonl`));
  assert.deepEqual(asked, [[{ name: 'ae/s1/1', nativeId: 'n-1' }, { name: 'ae/s2/1' }]]);
  assert.deepEqual(tasks.slice(1), [
    { taskId: 's1', journal: journal('s1'), bodies: 0, files: blocksOf(file), records: blocksOf(record) },
    { taskId: 's2', journal: journal('s2'), bodies: 0, files: 0 },
  ]);
  assert.deepEqual(
    { ...tasks[0], unread: tasks[0].unread?.length },
    { taskId: 'f1', journal: journal('f1'), bodies: 0, files: 0, unread: 1 },
  );
  assert.match(tasks[0].unread![0], /^the `failing` harness did not say what it keeps: .*fake: no disk today/);
});

test('what a forgotten task leaves: its transcript stays on the disk, and no task counts it', async () => {
  const root = scratch('ae-kept-root-');
  await journalled(root, 'g1', { nativeId: 'sess-g1' });
  await journalled(root, 'g2', { nativeId: 'sess-g2' });
  const left = plant(transcriptAt('-gone', 'sess-g1'));
  const stays = plant(transcriptAt('-gone', 'sess-g2'), 4096);
  const engine = engineOn(root);
  assert.equal((await keptOf(engine, 'g1'))?.records, blocksOf(left));
  assert.equal((await Effect.runPromise(engine.forget(['g1'], { yes: true }))).forgotten, true);
  assert.ok(fs.existsSync(left), 'forget leaves the record of the session');
  assert.deepEqual(
    (await Effect.runPromise(engine.kept())).tasks.map((t) => [t.taskId, t.records]),
    [['g2', blocksOf(stays)]],
  );
});

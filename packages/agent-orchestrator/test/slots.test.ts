/**
 * The cap on runs in flight between passes (`slotsOf`): the runs that count against it in the order a pass admits them, the runs it holds,
 * and one look at the harnesses for the whole store — never a view per task — with `runSlots` its held runs, as one table. The cap's
 * pure judgement is `src/cap/cap.test.ts`, and the cap over a store as the tick runs it `queue-store.test.ts`. Walked through the runtime
 * itself, `plainEngine` over an in-memory journal, whose `list` and `view` the test counts. And the board's read of it (`slotsRead`)
 * through an informer: a run it served ended at rest left out unlisted, the answer unchanged, and a wrong judgement refused on a
 * verified read.
 *
 * The store is the file's own at `ROOT`, given as `ENV`; each test names its `WF_MAX_RUNS` on a copy of it, and no pass has written a cap.
 */
import { configGiven } from './config-given.ts';
import { settingsOf, type Env } from '../src/config/config.store.ts';
import { test } from 'node:test';
import { Effect } from 'effect';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { asyncStore, type AsyncJournal, asyncOps, type AsyncRunner } from './promised.ts';
import { Engine } from 'agent-runtime';
import { scratch } from 'test-kit/scratch';
import { plainEngine } from './promised.ts';
import { runOver } from './placed.ts';
import { testPlace } from '../place/memory/index.ts';
import { runWith, runSlots, slotsOf } from '../src/runner.ts';
import { runRecord } from '../src/record/record.store.ts';
import { passParents } from '../src/views/views.verb.ts';
import { NOTHING_READ, standingReader } from '../src/standing/standing.verb.ts';
import { slotsRead } from '../src/cap/slots-read.verb.ts';
import { Informer, informerMemo, informerRead, informedJudgements, passStarted } from '../src/rest/informer.verb.ts';
import { sameJudgement } from '../src/summary/judgement.verb.ts';
import { filesStoreAt } from '../src/record/files.store.ts';

const ROOT = scratch('wf-slots-');
const ENV: Env = { ...process.env, WF_ROOT: ROOT };
const rooted = filesStoreAt(ROOT);
/** The runs waited on as a read with no standing reads them: none of their branches asked. */
const noParents = () => passParents(standingReader(NOTHING_READ));

const at = (minute: number) => `2026-10-02T09:0${minute}:00.000Z`;
const tasks = new Map<string, unknown[]>();
const signedOff = (taskId: string) =>
  tasks.set(taskId, [
    { kind: 'filed', at: at(0), brief: 'Do it.', cwd: ROOT, maxAttempts: 1, harness: 'codex' },
    { kind: 'starting', at: at(0), attempt: 1 },
    { kind: 'spawned', at: at(0), attempt: 1 },
    {
      kind: 'ended',
      at: at(0),
      attempt: 1,
      sessionId: `ae/${taskId}/1`,
      observed: 'done',
      reason: 'harness',
      closeout: { outcome: 'done', summary: 'Did it.', needs: null, artifacts: [] },
    },
    { kind: 'settled', at: at(0), outcome: 'succeeded' },
  ]);

const journal: AsyncJournal = {
  async append(taskId, event) {
    tasks.set(taskId, [...(tasks.get(taskId) ?? []), event]);
  },
  async read(taskId) {
    return [...(tasks.get(taskId) ?? [])] as Awaited<ReturnType<AsyncJournal['read']>>;
  },
  async list() {
    return [...tasks.keys()].sort();
  },
  async feed() {
    return { entries: [], cursor: 0 };
  },
};
const runner: AsyncRunner = {
  async spawn() {},
  async observe() {
    return new Map();
  },
  async stop() {},
  async logs() {
    return '';
  },
};
const engine = plainEngine(
  Engine.layer({
    root: scratch('wf-slots-engine-'),
    journal: asyncStore(journal),
    harnesses: { claude: asyncOps(runner), codex: asyncOps(runner), check: asyncOps(runner) },
    defaultHarness: 'claude',
  }),
);
const calls = { list: 0, view: 0 };
/** The tasks each `list` was asked for, in order. */
const listedTasks: string[][] = [];
const e = {
  ...engine,
  list: (...args: Parameters<typeof engine.list>) => (calls.list++, listedTasks.push([...(args[0] ?? [])]), engine.list(...args)),
  view: (taskId: string) => (calls.view++, engine.view(taskId)),
};

const WORKFLOW = [
  { name: 'implement', after: [], body: 'Implement it.', harness: 'codex' },
  { name: 'review', after: ['implement'], body: 'Review it.', harness: 'codex' },
];
function writeRun(id: string, minute: number, steps: Record<string, object>) {
  fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
  fs.writeFileSync(
    path.join(ROOT, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      workspace: ROOT,
      brief: `The brief of ${id}`,
      createdAt: at(minute),
      workflowDir: path.join(ROOT, 'no-such-workflow'),
      place: { kind: 'folder' },
      workflow: WORKFLOW,
      steps,
    }),
  );
}

signedOff('r-a-implement');
writeRun('r-a', 2, { implement: { taskId: 'r-a-implement' } });
signedOff('r-bad-implement');
tasks.get('r-bad-implement')!.push({ kind: 'measured', at: at(0), attempt: 1, usage: { responses: 'three' } });
writeRun('r-bad', 1, { implement: { taskId: 'r-bad-implement' } });
writeRun('r-new', 4, {});
writeRun('r-old', 3, {});
const RUNS = () => ['r-a', 'r-bad', 'r-new', 'r-old'].map((id) => runRecord(ROOT, id));

test('`slotsOf` and `runSlots`: what the cap counts and holds between passes, off one look at the harnesses or none', async (t) => {
  await t.test(
    'the runs in flight in the order a pass admits them, one unreadable among them, and the runs the cap holds — off one list',
    async () => {
      const capped: Env = { ...ENV, WF_MAX_RUNS: '2' };
      calls.list = calls.view = 0;
      const slots = await runWith(e, Effect.provide(slotsOf(e, RUNS(), settingsOf(capped), noParents()), configGiven(ROOT)));
      assert.deepEqual(
        { ...slots, held: [...slots.held] },
        {
          cap: 2,
          inFlight: ['r-bad', 'r-a'],
          held: [
            ['r-old', { inFlight: 2, cap: 2 }],
            ['r-new', { inFlight: 2, cap: 2 }],
          ],
        },
      );
      assert.deepEqual(calls, { list: 1, view: 0 }, 'one look at the harnesses for the whole store, and no task viewed again');
      assert.deepEqual(
        [...(await runWith(e, Effect.provide(runSlots(e, RUNS(), settingsOf(capped), noParents()), configGiven(ROOT))))],
        [...slots.held],
        'runSlots answers slotsOf’s held runs',
      );
    },
  );

  await t.test('with no cap slotsOf reads nothing, and runSlots reads nothing on a store with no run waiting to start', async () => {
    calls.list = calls.view = 0;
    const uncapped: Env = { ...ENV, WF_MAX_RUNS: '0' };
    assert.deepEqual(await runWith(e, Effect.provide(slotsOf(e, RUNS(), settingsOf(uncapped), noParents()), configGiven(ROOT))), {
      cap: 0,
      inFlight: null,
      held: new Map(),
    });
    assert.deepEqual(
      [
        ...(await runWith(
          e,
          Effect.provide(
            runSlots(
              e,
              RUNS().filter((r) => Object.keys(r.steps).length),
              settingsOf({ ...ENV, WF_MAX_RUNS: '2' }),
              noParents(),
            ),
            configGiven(ROOT),
          ),
        )),
      ],
      [],
    );
    assert.deepEqual(calls, { list: 0, view: 0 });
  });
});

signedOff('r-done-implement');
signedOff('r-done-review');
writeRun('r-done', 0, { implement: { taskId: 'r-done-implement' }, review: { taskId: 'r-done-review' } });

/** An informer filled as a pass fills it: every run of the store judged and kept, the pass started so a moving run is kept too. */
const filledInformer = async (env: Env) => {
  const memo = informerMemo();
  passStarted(memo);
  const git = standingReader(NOTHING_READ);
  await runOver(
    runWith,
    () => testPlace().layer,
    env,
  )(
    e,
    Effect.gen(function* () {
      const read = yield* informerRead(e, memo, false, git, sameJudgement);
      yield* informedJudgements(e, ROOT, rooted.runs.list(), read, git);
      yield* read.commit();
    }),
  );
  return memo;
};

test('`slotsRead` through an informer: a run it serves ended at rest is left out, unlisted, and a wrong judgement of one refused when verified', async (t) => {
  const capped: Env = { ...ENV, WF_MAX_RUNS: '2' };

  await t.test('the tasks of no ended run are listed, and the answer is the one read with no informer', async () => {
    const unverified: Env = { ...capped, WF_VERIFY_REST: '0' };
    const memo = await filledInformer(unverified);
    assert.equal(memo.runs.get('r-done')?.value.judged.status, 'succeeded', 'the informer serves r-done as ended');
    const plain = await runWith(e, slotsRead().pipe(Effect.provide(configGiven(ROOT, unverified))));
    listedTasks.length = 0;
    const informed = await runWith(
      e,
      slotsRead()
        .pipe(Effect.provide(configGiven(ROOT, unverified)))
        .pipe(Effect.provideService(Informer, memo)),
    );
    assert.deepEqual(listedTasks.length, 1, 'one look at the harnesses');
    assert.ok(listedTasks[0]?.includes('r-a-implement'), 'a run still open is listed');
    assert.ok(!listedTasks[0]?.some((id) => id.startsWith('r-done-')), 'no task of the ended run is listed');
    assert.deepEqual({ ...informed, held: [...informed.held] }, { ...plain, held: [...plain.held] });
  });

  await t.test('verified, a run served as ended at rest whose tasks are in flight dies naming it', async () => {
    const verified: Env = { ...capped, WF_VERIFY_REST: '1' };
    const memo = await filledInformer(verified);
    const entry = memo.runs.get('r-a');
    assert.ok(entry, 'the informer keeps r-a');
    entry.value = { ...entry.value, judged: { ...entry.value.judged, status: 'succeeded', moving: false } };
    entry.atRest = true;
    await assert.rejects(
      runWith(
        e,
        slotsRead()
          .pipe(Effect.provide(configGiven(ROOT, verified)))
          .pipe(Effect.provideService(Informer, memo)),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /\br-a\b/);
        return true;
      },
    );
  });
});

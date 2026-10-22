/**
 * The cap on runs in flight between passes (`slotsOf`): the runs that count against it in the order a pass admits them, the runs it holds,
 * and one look at the harnesses for the whole store — never a view per task — with `runSlots` its held runs, as one table. The cap's
 * pure judgement is `src/cap/cap.test.ts`, and the cap over a store as the tick runs it `queue-store.test.ts`. Walked through the runtime
 * itself, `plainEngine` over an in-memory journal, whose `list` and `view` the test counts.
 *
 * `WF_ROOT` is set before the package is imported; `WF_MAX_RUNS` is set by each test, and no pass has written a cap.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { asyncStore, type AsyncJournal, asyncOps, type AsyncRunner } from './promised.ts';
import { Engine } from 'agent-runtime';
import { scratch } from './scratch.ts';
import { plainEngine } from './promised.ts';

const ROOT = scratch('wf-slots-');
process.env.WF_ROOT = ROOT;
const { runWith, runSlots, slotsOf } = await import('../src/runner.ts');
const { readRun } = await import('../src/record/record.store.ts');
const { passParents } = await import('../src/views/views.verb.ts');
const { NOTHING_READ, standingReader } = await import('../src/standing/standing.verb.ts');
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
const e = {
  ...engine,
  list: (...args: Parameters<typeof engine.list>) => (calls.list++, engine.list(...args)),
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
tasks.get('r-bad-implement')!.push({ kind: 'measured', at: at(0), attempt: 1, usage: { turns: 'three' } });
writeRun('r-bad', 1, { implement: { taskId: 'r-bad-implement' } });
writeRun('r-new', 4, {});
writeRun('r-old', 3, {});
const RUNS = () => ['r-a', 'r-bad', 'r-new', 'r-old'].map(readRun);

test('`slotsOf` and `runSlots`: what the cap counts and holds between passes, off one look at the harnesses or none', async (t) => {
  await t.test(
    'the runs in flight in the order a pass admits them, one unreadable among them, and the runs the cap holds — off one list',
    async () => {
      process.env.WF_MAX_RUNS = '2';
      calls.list = calls.view = 0;
      const slots = await runWith(e, slotsOf(e, RUNS(), process.env, noParents()));
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
        [...(await runWith(e, runSlots(e, RUNS(), process.env, noParents())))],
        [...slots.held],
        'runSlots answers slotsOf’s held runs',
      );
    },
  );

  await t.test('with no cap slotsOf reads nothing, and runSlots reads nothing on a store with no run waiting to start', async () => {
    process.env.WF_MAX_RUNS = '0';
    calls.list = calls.view = 0;
    assert.deepEqual(await runWith(e, slotsOf(e, RUNS(), process.env, noParents())), { cap: 0, inFlight: null, held: new Map() });
    process.env.WF_MAX_RUNS = '2';
    assert.deepEqual(
      [
        ...(await runWith(
          e,
          runSlots(
            e,
            RUNS().filter((r) => Object.keys(r.steps).length),
            process.env,
            noParents(),
          ),
        )),
      ],
      [],
    );
    assert.deepEqual(calls, { list: 0, view: 0 });
  });
});

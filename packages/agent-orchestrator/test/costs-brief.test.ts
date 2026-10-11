/**
 * A step whose `reads:` names `costs` is told, on each new session's brief, what the newest finished runs of its workflow in its factory
 * cost (`costsRead`, `costsSection`): read off the store's records, newest first by when they were started, as many as the window holds
 * (`RECENT_RUNS`), a run unfinished or whose journal does not read passed over, and a run of another workflow or factory never counted. A
 * step without the line is told none, and a try or a round that continues the last session neither reads them nor is told them again.
 *
 * Walked through the runtime itself, `plainEngine` over an in-memory journal: the finished runs are journalled by hand, as the stats read
 * them, and the run filed is the tick's. `WF_ROOT` is set before the runner is imported: it is read as the module loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { Engine as EngineService, nameFor, type Sighting, type SpawnRequest } from 'agent-runtime';
import { asyncOps, asyncStore, plainEngine, type AsyncJournal, type AsyncRunner } from './promised.ts';
import type { Engine } from '../src/runtime-client.ts';
import { scratch } from './scratch.ts';
import { runGiven, runOver } from './placed.ts';
import { testPlace } from '../place/memory/index.ts';

const place = testPlace();
const stand = () => place;
const ROOT = scratch('wf-costs-brief-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
const { advanceRun, retryRun, startRun, runWith: runEngine } = await import('../src/runner.ts');
const runWith = runOver(runEngine, () => stand().layer);
const runPlaced = runGiven(() => stand().layer);
const { readRun } = await import('../src/record/record.store.ts');
const { RECENT_RUNS } = await import('../src/costs/index.ts');

type Event = Parameters<AsyncJournal['append']>[1];

/** Every task whose journal does not read. */
const spoiled = new Set<string>();

/** The engine's store, in memory, noting when each attempt began, by its session's name; a task in `spoiled` does not read. */
const memoryJournal = (starts: Map<string, number>): AsyncJournal => {
  const tasks = new Map<string, Event[]>();
  const feed: Awaited<ReturnType<AsyncJournal['feed']>>['entries'] = [];
  return {
    async append(taskId, event) {
      tasks.set(taskId, [...(tasks.get(taskId) ?? []), event]);
      feed.push({ taskId, event });
      if (event.kind === 'starting') starts.set(nameFor(taskId, event.attempt), Date.parse(event.at));
    },
    async read(taskId) {
      if (spoiled.has(taskId)) throw new Error(`the journal of ${taskId} does not read`);
      return [...(tasks.get(taskId) ?? [])];
    },
    async list() {
      return [...tasks.keys()].sort();
    },
    async feed(after) {
      return { entries: feed.slice(after), cursor: feed.length };
    },
  };
};

const starts = new Map<string, number>();
const journal = memoryJournal(starts);
const sessions = new Map<string, Sighting>();
const spawned: SpawnRequest[] = [];
/** The sessions the harness never names: a try after one has nothing to continue. */
const nameless = new Set<string>();
/** A harness the test signs by hand: every session it starts works until `sign` ends it. */
const runner: AsyncRunner = {
  async spawn(r) {
    spawned.push(r);
    const named = nameless.has(r.name) ? {} : { nativeId: `native-${spawned.length}` };
    sessions.set(r.name, { sessionId: `s-${spawned.length}`, ...named, state: 'working', busy: true });
  },
  async observe() {
    return new Map(sessions);
  },
  async stop(id) {
    for (const [name, s] of sessions) if (s.sessionId === id) sessions.set(name, { ...s, state: 'canceled', busy: false });
  },
  async logs() {
    return '';
  },
};
const engine = plainEngine(
  EngineService.layer({
    root: path.join(ROOT, 'engine'),
    journal: asyncStore(journal),
    harnesses: { claude: asyncOps(runner), codex: asyncOps(runner), check: asyncOps({ ...runner, output: async () => undefined }) },
    defaultHarness: 'claude',
  }),
);
/** Every brief the run filed, by task id. */
const briefs = new Map<string, string>();
/** Every task the run viewed, in order. */
const viewed: string[] = [];
const e: Engine = {
  ...engine,
  view: (taskId) => {
    viewed.push(taskId);
    return engine.view(taskId);
  },
  file: (spec) => {
    if (spec.id) briefs.set(spec.id, spec.brief);
    return engine.file(spec);
  },
};

/** Attempt `n` of `taskId` ended failed, signing nothing. */
const fail = (taskId: string, n: number) => {
  const name = nameFor(taskId, n);
  sessions.set(name, { ...sessions.get(name)!, state: 'failed', busy: false });
};

/** Attempt `n` of `taskId` signed off done, with `more` in its closeout. */
const sign = (taskId: string, n: number, more: object = {}) => {
  const name = nameFor(taskId, n);
  sessions.set(name, {
    ...sessions.get(name)!,
    state: 'completed',
    busy: false,
    closeout: { payload: { outcome: 'done', summary: 'did it', artifacts: [], needs: null, ...more }, at: starts.get(name)! + 1 },
  });
};

/** The engine's pass, then the run's, as the daemon makes them. */
const pass = async (id: string) => {
  await Effect.runPromise(engine.tick());
  return runWith(e, advanceRun(readRun(id)));
};

/**
 * Passes of `id` until attempt 1 of `taskId` has a session, at most three: the engine admits a try on one pass and starts it on the
 * next.
 */
const started = async (id: string, taskId: string) => {
  for (let i = 0; i < 3 && !sessions.has(nameFor(taskId, 1)); i++) await pass(id);
  assert.ok(sessions.has(nameFor(taskId, 1)), `${taskId} started`);
};

/** A repository with one commit, so `nemia start` has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stand().world.repository(repo, {});
  return repo;
};

/** The workflow folder `costed`: `design`, reading `costs`, then `implement`, reading nothing. */
const WORKFLOW = path.join(ROOT, 'costed');
fs.mkdirSync(WORKFLOW);
fs.writeFileSync(path.join(WORKFLOW, 'design.md'), '---\nplace: git\nreads: costs\n---\nDesign it.\n');
fs.writeFileSync(path.join(WORKFLOW, 'implement.md'), '---\nafter: design\nplace: git\n---\nBuild it.\n');

/**
 * The same workflow `costed`, in another folder, as a loop: `implement`, reading `costs`, then `review`, which may send it back twice
 * (`rounds: 3`).
 */
const LOOPED = path.join(ROOT, 'looped', 'costed');
fs.mkdirSync(LOOPED, { recursive: true });
fs.writeFileSync(path.join(LOOPED, 'implement.md'), '---\nplace: git\nreads: costs\n---\nBuild it.\n');
fs.writeFileSync(
  path.join(LOOPED, 'review.md'),
  '---\nafter: implement\nplace: git\noutput: review.schema.json\nloop: implement\nrounds: 3\n---\nReview it.\n',
);
fs.writeFileSync(
  path.join(LOOPED, 'review.schema.json'),
  JSON.stringify({ type: 'object', properties: { again: { type: 'boolean' } }, required: ['again'], additionalProperties: false }),
);

/** The hour `i` from the first run's start, as a record and a journal stamp it. */
const hour = (i: number) => new Date(Date.UTC(2026, 8, 1, i)).toISOString();

/**
 * A run of `costed`'s one step `design`, started at hour `i` and, where `settled`, ended an hour later measured at `costUsd`: its record
 * frozen as `nemia start` writes one, of `workflowDir` and in `factory`.
 */
async function aRun(id: string, i: number, costUsd: number, more: { settled?: boolean; workflowDir?: string; factory?: string } = {}) {
  const taskId = `${id}-design`;
  const events: object[] = [{ kind: 'filed', at: hour(i), brief: 'Design it.', cwd: ROOT, maxAttempts: 1, harness: 'codex' }];
  if (more.settled !== false)
    events.push(
      { kind: 'starting', at: hour(i), attempt: 1 },
      { kind: 'spawned', at: hour(i), attempt: 1 },
      {
        kind: 'ended',
        at: hour(i + 1),
        attempt: 1,
        sessionId: `ae/${taskId}/1`,
        observed: 'done',
        reason: 'harness',
        closeout: { outcome: 'done', summary: 'Did it.', needs: null, artifacts: [] },
      },
      { kind: 'measured', at: hour(i + 1), attempt: 1, usage: { costUsd } },
      { kind: 'settled', at: hour(i + 1), outcome: 'succeeded' },
    );
  for (const event of events) await journal.append(taskId, event as Event);
  fs.writeFileSync(
    path.join(ROOT, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      repo: '/repos/home',
      baseRef: 'abc',
      workspace: '/repos/home',
      branch: 'main',
      isolate: true,
      brief: `The brief of ${id}`,
      createdAt: hour(i),
      workflowDir: more.workflowDir ?? '/elsewhere/costed',
      ...(more.factory ? { factory: more.factory } : {}),
      workflow: [{ name: 'design', after: [], body: 'Design it.', harness: 'codex', reads: ['costs'] }],
      steps: { design: { taskId } },
    }),
  );
}

/**
 * Twenty-five finished runs of `costed`, c00 the oldest at $1 to c24 the newest at $25, so the store lists them oldest first; and,
 * newer than all of them, one unfinished, one whose journal does not read, and one each of another workflow and another factory at $1000.
 */
async function seed(): Promise<void> {
  for (let i = 0; i < RECENT_RUNS + 5; i++) await aRun(`c${String(i).padStart(2, '0')}`, i, i + 1);
  await aRun('z-moving', 40, 1000, { settled: false });
  await aRun('z-spoiled', 41, 1000);
  spoiled.add('z-spoiled-design');
  await aRun('z-intake', 42, 1000, { workflowDir: '/elsewhere/intake' });
  await aRun('z-other', 43, 1000, { factory: 'other' });
}
await seed();

const SECTION = '## What runs of this workflow cost';

test('a step that reads `costs` is told what the newest finished runs of its workflow in its factory cost; the step after it is told none', async () => {
  const run = await runPlaced(startRun({ brief: 'add a flag', repo: aRepo(), workflowDir: WORKFLOW, isolate: false }));
  viewed.length = 0;
  assert.deepEqual((await pass(run.id)).filed, ['design']);
  const oldest = ['c00', 'c01', 'c02', 'c03', 'c04'].map((id) => `${id}-design`);
  assert.ok(viewed.includes('c05-design'), 'the oldest run in the window is read');
  assert.deepEqual(
    viewed.filter((taskId) => oldest.includes(taskId)),
    [],
    'the reader stops at the window: no run older than it is read',
  );
  const brief = briefs.get(`${run.id}-design`)!;
  assert.ok(brief.includes(SECTION), brief);
  assert.ok(brief.includes(`Over the last ${RECENT_RUNS} finished runs of \`costed\` in this factory, since 2026-09-01,`), brief);
  assert.ok(
    brief.includes('- design: median 15.50, p90 23.00; tries a run median 1, max 1\n'),
    `the newest twenty, $6 to $25, and none of the rest:\n${brief}`,
  );
  assert.ok(brief.includes('- the whole run: median 15.50, p90 23.00; no loop ran to acceptance'), brief);

  await pass(run.id);
  sign(`${run.id}-design`, 1);
  assert.deepEqual((await pass(run.id)).filed, ['implement']);
  assert.equal(briefs.get(`${run.id}-implement`)!.includes(SECTION), false, 'implement reads no costs');
});

test("a fresh try of the step is told the costs again, and one that continues the last session neither reads nor is told them: it was, on that session's first brief", async () => {
  const run = await runPlaced(startRun({ brief: 'add a flag', repo: aRepo(), workflowDir: WORKFLOW, isolate: false }));
  await pass(run.id);
  await pass(run.id);
  fail(`${run.id}-design`, 1);
  await pass(run.id);
  await runWith(e, retryRun(run.id, 'design', { mode: 'fresh' }));
  viewed.length = 0;
  await pass(run.id);
  assert.ok(viewed.includes('c24-design'), 'the pass that files a fresh try reads the newest run');
  const fresh = readRun(run.id).steps.design.taskId!;
  assert.notEqual(fresh, `${run.id}-design`);
  assert.ok(briefs.get(fresh)!.includes(SECTION), briefs.get(fresh));
  await pass(run.id);
  fail(fresh, 1);
  await pass(run.id);
  await runWith(e, retryRun(run.id, 'design', { mode: 'nudge', message: 'once more' }));
  viewed.length = 0;
  await pass(run.id);
  assert.deepEqual(
    viewed.filter((taskId) => !taskId.startsWith(run.id)),
    [],
    'the pass that files a continued session reads no other run',
  );
  const nudged = readRun(run.id).steps.design.taskId!;
  assert.notEqual(nudged, fresh);
  assert.equal(briefs.get(nudged)!.includes(SECTION), false, briefs.get(nudged));
});

test('a round whose target starts a new session is told the costs, and one that continues the last session neither reads nor is told them', async () => {
  const run = await runPlaced(startRun({ brief: 'add a flag', repo: aRepo(), workflowDir: LOOPED, isolate: false }));
  const first = `${run.id}-implement`;
  nameless.add(nameFor(first, 1));
  assert.deepEqual((await pass(run.id)).filed, ['implement']);
  await started(run.id, first);
  sign(first, 1);
  assert.deepEqual((await pass(run.id)).filed, ['review']);
  await started(run.id, `${run.id}-review`);
  sign(`${run.id}-review`, 1, { again: true });
  viewed.length = 0;
  await pass(run.id);
  const cold = readRun(run.id).steps.implement.taskId!;
  assert.notEqual(cold, first, 'the round is filed');
  assert.ok(viewed.includes('c24-design'), 'the pass that files a round on a new session reads the newest run');
  assert.ok(briefs.get(cold)!.includes(SECTION), briefs.get(cold));

  await started(run.id, cold);
  sign(cold, 1, { replies: [{ finding: 'review', answer: 'fixed', why: 'did it' }] });
  assert.deepEqual((await pass(run.id)).filed, ['review']);
  const review = readRun(run.id).steps.review.taskId!;
  await started(run.id, review);
  sign(review, 1, { again: true });
  viewed.length = 0;
  await pass(run.id);
  const continued = readRun(run.id).steps.implement.taskId!;
  assert.notEqual(continued, cold, 'the second round is filed');
  assert.deepEqual(
    viewed.filter((taskId) => !taskId.startsWith(run.id)),
    [],
    'the pass that files a round on a continued session reads no other run',
  );
  assert.equal(briefs.get(continued)!.includes(SECTION), false, briefs.get(continued));
});

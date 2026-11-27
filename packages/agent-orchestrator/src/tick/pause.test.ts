/**
 * The store's pause, as the tick honours it: while `$WF_ROOT/cordon` stands no pass starts new work — no step, try or check filed, no
 * queued task admitted, no queued card started, nothing of a run `nemia start` wrote meanwhile — and what is at work goes on (this pause
 * carries no timeout, so no session is parked); a person's retry
 * and approval written meanwhile wait on their files; and the pass after the lift files what waits. Every pass judges afresh what the memo
 * of runs at rest answers (`verifyRest`), and one in the middle starts with no memo at all, as a restarted daemon does.
 *
 * Walked through the runtime itself over an in-memory journal and a harness the test signs by hand, as rest-store.test.ts does, and every
 * filing `queued` as the store's own engine files it (`engineOf`), under the store's own admission (`storeAdmission`), so admission is
 * the runtime's: a task filed waits until a pass admits it, and none is admitted while the pause stands — what the engine's stand-in,
 * which has no pass that admits, cannot say. The pause put, put at once and resumed, as a
 * person tells it, is on the stand-ins in `test/pause.test.ts`. A store of its own, since
 * `tick` reads every run of its store: at `ROOT`, given as `ENV`.
 */
import { approvalKey, askNames, recordText, runKey, runRecord } from '../../testing.ts';
import { type Env, settingsOf, type StoreConfig } from '../config/config.store.ts';
import { storeGiven } from '../../test/config-given.ts';
import type { StoreRoot } from '../config/root.store.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { nameFor, type Sighting } from 'agent-runtime';
import { asyncStore, type AsyncJournal, asyncOps, type AsyncRunner } from '../../test/promised.ts';
import { Engine } from 'agent-runtime';
import type { Run } from '../run.ts';
import { scratch } from 'test-kit/scratch';
import { testEngine } from 'agent-runtime/testing';
import { Effect } from 'effect';
import { testPlace } from '../../place/memory/index.ts';
import { runGiven, runOver } from '../../test/placed.ts';
import * as verbs from '../runner.ts';
import { approveRun, retryRun, startRun } from '../runner.ts';
import { tickRun, freshRestMemo } from './tick.verb.ts';
import { engineOf, runWith as runEngine, storeAdmission } from '../runtime-client.ts';
import { resumePause, putPause } from '../pause/pause.store.ts';
import { pausedRead, runsListed } from '../list/list.verb.ts';
import { PAUSE_WAIT } from '../list/list.ts';
import { pausedLines, pausedWords, type Finishing } from '../pause/pause.ts';

const ROOT = scratch('wf-pause-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

const ENV: Env = { ...process.env, WF_ROOT: ROOT, WF_MAX_CONCURRENT: '10000', WF_VERIFY_REST: '1', WF_MAX_RUNS: undefined };
/** An inbox verb run at this test's store root, as `nemia` gives it one: its answer, or its refusal thrown. */
const atRoot = <A, E>(program: Effect.Effect<A, E, StoreRoot | StoreConfig>) => Effect.runSync(storeGiven(ROOT, ENV)(program)) satisfies A;
const addToInbox = (opts: Parameters<typeof verbs.addToInbox>[0]) => atRoot(verbs.addToInbox(opts));
const queueInInbox = (...args: Parameters<typeof verbs.queueInInbox>) => atRoot(verbs.queueInInbox(...args));
const readInbox = () => atRoot(verbs.readInbox());
const place = testPlace();
const stand = () => place;
const runWith = runOver(runEngine, () => stand().layer, ENV);
const runPlaced = runGiven(() => stand().layer, ENV);

/** A repository with one commit, so `nemia start` has a base to record. */
const aRepo = () => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stand().world.repository(repo, {});
  return repo;
};

/**
 * A workflow folder of the steps given, each `after` the one before it, with the frontmatter lines `more` gives each: on codex, unless
 * they name a harness.
 */
const folder = (steps: readonly string[], more: (name: string) => string = () => '') => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  steps.forEach((name, k) =>
    fs.writeFileSync(
      path.join(dir, `${name}.md`),
      `---\nplace: git\n${more(name).includes('harness:') ? '' : 'harness: codex\n'}${k ? `after: ${steps[k - 1]}\n` : ''}${more(name)}---\n${name} it\n`,
    ),
  );
  return dir;
};

/** Each task's journal, as the engine's store holds it: what a test spoils by hand, out of the feed. */
type Tasks = Map<string, Parameters<AsyncJournal['append']>[1][]>;

/** The engine's store, in memory, in `tasks`, noting in `starts` when each attempt began, by its session's name. */
const memoryJournal = (tasks: Tasks, starts: Map<string, number>) => {
  const feed: Awaited<ReturnType<AsyncJournal['feed']>>['entries'] = [];
  return {
    async append(taskId, event) {
      tasks.set(taskId, [...(tasks.get(taskId) ?? []), event]);
      feed.push({ taskId, event });
      if (event.kind === 'starting') starts.set(nameFor(taskId, event.attempt), Date.parse(event.at));
    },
    async read(taskId) {
      return [...(tasks.get(taskId) ?? [])];
    },
    async list() {
      return [...tasks.keys()].sort();
    },
    async feed(after) {
      return { entries: feed.slice(after), cursor: feed.length };
    },
  } satisfies AsyncJournal;
};

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };
const BLOCKED = { outcome: 'blocked', summary: 'two flags could be meant', artifacts: [], needs: 'which flag?' };

/**
 * The runtime, with a harness whose sessions work until `signAll` ends them, and the sessions it was asked to start, by name. `signAll`
 * signs every session at work but those of the runs `keep` names, with `BLOCKED` for those of the runs `blocking` names, each closeout
 * stamped a millisecond after its attempt's journalled start, so a wall clock stepped back between the start and the signing drops none.
 */
const engine = () => {
  const sessions = new Map<string, Sighting>();
  const spawned: string[] = [];
  const runner: AsyncRunner = {
    async spawn(r) {
      spawned.push(r.name);
      sessions.set(r.name, { sessionId: `s-${spawned.length}`, nativeId: `native-${spawned.length}`, state: 'working', busy: true });
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
  const starts = new Map<string, number>();
  const tasks: Tasks = new Map();
  const e = engineOf(
    Engine.layer({
      root: fs.mkdtempSync(path.join(ROOT, 'engine-')),
      journal: asyncStore(memoryJournal(tasks, starts)),
      harnesses: { claude: asyncOps(runner), codex: asyncOps(runner), check: asyncOps(runner) },
      defaultHarness: 'claude',
      ...storeAdmission(ROOT, settingsOf(ENV), () => 64 * 2 ** 30),
      machine: () => ({ totalBytes: 64 * 2 ** 30, availableBytes: 64 * 2 ** 30 }),
    }),
  );
  const of = (name: string, runs: readonly Run[]) => runs.some((r) => name.startsWith(`ae/${r.id}-`));
  const signAll = (keep: readonly Run[] = [], blocking: readonly Run[] = []) => {
    for (const [name, s] of sessions) {
      if (s.state !== 'working' || of(name, keep)) continue;
      const payload = of(name, blocking) ? BLOCKED : SIGNED;
      const started = starts.get(name);
      assert.ok(started !== undefined, `${name} has its start journalled, to stamp its closeout from`);
      sessions.set(name, { ...s, state: 'completed', busy: false, closeout: { payload, at: started + 1 } });
    }
  };
  return { e, spawned, signAll, tasks };
};

const h = engine();
const REPO = aRepo();
const MEMO = freshRestMemo();
/** A pass as the daemon makes one, with the memo it keeps — or with none, as a restarted daemon's first pass. */
const pass = (memo = MEMO) => runWith(h.e, tickRun({ repo: ROOT, memo, verifyRest: true }));
const begun = async (workflowDir: string, more: Partial<Parameters<typeof startRun>[0]> = {}) =>
  await runPlaced(startRun({ brief: 'paused', repo: REPO, workflowDir, isolate: false, ...more }));
const taskOf = (run: Run, step: string) => (runRecord(ROOT, run.id).steps[step]?.taskId ?? undefined) satisfies string | undefined;
/** The row `nemia ls` lists for `step` of `run`: its word and its note. */
const rowOf = async (run: Run, step: string) => {
  const [{ listed }] = (await runWith(h.e, runsListed(run.id))).runs;
  const row = listed.steps.find((s) => s.name === step);
  assert.ok(row, `${run.id} lists ${step}`);
  return row as { message: string; note?: string; reason?: string; on?: string; verdict?: unknown };
};

const TWO = folder(['plan', 'work']);
const ONE = folder(['work']);
const CHECKED = folder(['work'], () => 'check: "true"\n');

test('while the store is paused nothing new starts and the work goes on; the pass after the lift files what waits', async () => {
  const running = await begun(TWO);
  const checked = await begun(CHECKED);
  const refused = await begun(ONE);
  const gated = await begun(TWO, { gates: ['plan'] });
  for (let k = 0; k < 6; k++) {
    await pass();
    h.signAll([running, checked], [refused]);
  }
  for (let k = 0; k < 3; k++) await pass();
  assert.ok(taskOf(running, 'plan') && taskOf(checked, 'work'), "running's plan and checked's work at work as the pause is put");
  assert.ok(taskOf(gated, 'plan') && !taskOf(gated, 'work'), "gated's plan signed, its work waiting at the gate");
  assert.equal(taskOf(refused, 'work'), `${refused.id}-work`, "refused's work signed blocked, on its first try");
  const queued = begun(ONE);
  await pass();
  const queuedTask = taskOf(await queued, 'work')!;
  assert.equal((await Effect.runPromise(h.e.view(queuedTask))).admission, 'queued', 'a task filed and not yet admitted');

  const pause = putPause(ROOT, { why: 'merging by hand', by: 'ann' });
  const born = begun(ONE);
  await runWith(h.e, retryRun(refused.id, 'work', { mode: 'fresh' }));
  await runWith(h.e, approveRun(gated.id, 'plan'));
  const { card } = addToInbox({ text: 'an idea queued meanwhile', workflow: path.basename(ONE) });
  queueInInbox(card.name);
  const before = h.spawned.length;

  const first = await pass();
  const byStep = (a: Finishing, b: Finishing) => `${a.run}${a.step}`.localeCompare(`${b.run}${b.step}`);
  const sorted = <P extends { finishing: Finishing[] }>(p: P) => ({ ...p, finishing: [...p.finishing].sort(byStep) }) satisfies P;
  const atWork = (
    [
      { run: running.id, step: 'plan', kind: 'session' },
      { run: checked.id, step: 'work', kind: 'session' },
    ] satisfies Finishing[]
  ).sort(byStep);
  assert.deepEqual(
    sorted(first.pause!),
    { pause, finishing: atWork, parked: [], held: [] },
    'the pass says the pause it read, and what still finishes under it: neither the queued task nor one settled',
  );
  assert.match(pausedLines(first.pause!)[0], /^Pausing: 2 finishing/);
  assert.equal(first.queue, undefined, 'and started no queued card');
  const listedAtWork = (await runWith(h.e, runsListed())).paused!;
  assert.deepEqual(sorted(listedAtWork), { pause, finishing: atWork, parked: [], held: [] }, 'nemia ls names each task still finishing');
  assert.deepEqual(sorted(await runWith(h.e, pausedRead())), sorted(listedAtWork), 'and the api reads the same');
  h.signAll();
  await pass(freshRestMemo());
  await pass();
  const last = await pass();
  const checks = [{ run: checked.id, step: 'work' }];
  assert.deepEqual(
    last.pause,
    { pause, finishing: [], parked: [], held: checks },
    "once what ran has finished, nothing finishes; checked's check held, once",
  );
  assert.deepEqual(pausedLines(last.pause), [
    pausedWords(last.pause),
    `   ${checked.id}'s work has signed off, and its check waits on nemia resume`,
  ]);
  assert.match(pausedLines(last.pause)[0], /^Paused since .* nothing new starts, 1 check held; /);
  const waits = await rowOf(checked, 'work');
  assert.notEqual(waits.message, 'checking', 'a check the pause keeps from being filed is not checking');
  assert.equal(waits.message, PAUSE_WAIT);
  assert.deepEqual(
    [waits.reason, waits.on, waits.verdict],
    ['Waiting', 'pause', { result: 'running', exit: null }],
    'its code says the pause holds it, and its check has no verdict yet',
  );
  assert.match(waits.note ?? '', /its check is filed on nemia resume/);

  assert.deepEqual(h.spawned.slice(before), [], 'no session started while the store is paused');
  assert.equal((await Effect.runPromise(h.e.view(queuedTask))).admission, 'queued', 'the queued task not admitted');
  assert.equal((await Effect.runPromise(h.e.view(taskOf(running, 'plan')!))).phase, 'succeeded', "running's plan finished");
  assert.equal(taskOf(running, 'work'), undefined, "running's work, ready, not filed");
  assert.equal(runRecord(ROOT, checked.id).steps.work?.check, undefined, "checked's work signed, its check not filed");
  assert.equal(taskOf(refused, 'work'), `${refused.id}-work`, "refused's try asked, not filed");
  assert.deepEqual(
    askNames(ROOT, refused.id).filter((f) => !f.startsWith('done/')),
    ['retry-work-2'],
    'and the ask kept',
  );
  assert.ok(recordText(ROOT, approvalKey(gated.id, 'plan', 1)) !== undefined, "gated's approval kept");
  assert.equal(taskOf(gated, 'work'), undefined, "gated's work not filed on it");
  assert.equal(taskOf(await born, 'work'), undefined, 'nothing filed of the run started while paused');
  assert.equal(last.queue, undefined, 'no queued card started');
  assert.equal(readInbox().find((l) => l.name === card.name)?.tried, undefined, 'nor tried');
  assert.ok(!('pause' in JSON.parse(recordText(ROOT, runKey(running.id)) ?? '')), 'no record holds the pause');

  const listed = await runWith(h.e, runsListed());
  assert.deepEqual(
    listed.paused,
    { pause, finishing: [], parked: [], held: checks },
    'nemia ls names the pause and the check it holds, not filed',
  );
  assert.deepEqual(await runWith(h.e, pausedRead()), listed.paused, 'and the api reads the same');

  resumePause(ROOT);
  const lifted = await pass();
  assert.equal(lifted.pause, undefined, 'the pass after the lift says no pause');
  assert.ok(taskOf(running, 'work'), "running's work filed");
  assert.ok(runRecord(ROOT, checked.id).steps.work?.check, "checked's check filed");
  assert.equal((await rowOf(checked, 'work')).message, 'checking', 'and checking, once its check is filed');
  putPause(ROOT, { why: 'again', by: 'ann' });
  try {
    assert.equal((await rowOf(checked, 'work')).message, 'checking', 'a check filed before the pause is checking under it');
    assert.equal(
      (await runWith(h.e, pausedRead())).held.some((c) => c.run === checked.id),
      false,
      'and the pause holds it not',
    );
  } finally {
    resumePause(ROOT);
  }
  assert.equal(taskOf(refused, 'work'), `${refused.id}-work-try2`, "refused's try filed");
  assert.ok(taskOf(gated, 'work'), "gated's work filed on the approval");
  assert.ok(taskOf(await born, 'work'), 'the run started while paused filed');
  assert.ok(lifted.queue, 'the queued card tried');
  assert.equal((await runWith(h.e, runsListed())).paused, undefined, 'and nemia ls says no pause');
  assert.deepEqual(await runWith(h.e, pausedRead()), { pause: null, finishing: [], parked: [], held: [] });
  await pass();
  assert.ok(h.spawned.length > before, 'and sessions started again');
  assert.notEqual((await Effect.runPromise(h.e.view(queuedTask))).admission, 'queued', 'the queued task admitted');
});

test("each pass sets the sessions' drain from the pause before the engine's tick: a timed pause puts it, no pause lifts it, a pause with no timeout leaves it", async () => {
  const stand = testEngine();
  const seenAtTick: number[] = [];
  const e = engineOf(stand.layer);
  Object.assign(e, {
    tick: () =>
      Effect.sync(() => {
        seenAtTick.push(stand.sessionDrains.length);
        return { tasks: 0, actions: [], running: {}, views: [] };
      }),
    tallied: undefined,
  });
  const pass = () => runWith(e, tickRun());
  putPause(ROOT, { by: 'ann' }, new Date(), 900_000);
  try {
    await pass();
    assert.deepEqual(stand.sessionDrains, [{ graceMs: 900_000 }], 'a timed pause puts the drain at its timeout');
    assert.deepEqual(seenAtTick, [1], "before the engine's tick");
  } finally {
    resumePause(ROOT);
  }
  await pass();
  assert.deepEqual(stand.sessionDrains, [{ graceMs: 900_000 }, null], 'no pause lifts it');
  putPause(ROOT, { by: 'the take-over' });
  try {
    await pass();
    assert.deepEqual(stand.sessionDrains, [{ graceMs: 900_000 }, null], 'a pause with no timeout leaves the drain as it stands');
  } finally {
    resumePause(ROOT);
  }
});

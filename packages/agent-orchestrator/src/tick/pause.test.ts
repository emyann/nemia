/**
 * The store's pause, as the tick honours it: while `$WF_ROOT/cordon` stands no pass starts new work — no step, try or check filed, no
 * queued task admitted, no queued card started, nothing of a run `nemia start` wrote meanwhile — and what runs finishes; a person's retry
 * and approval written meanwhile wait on their files; and the pass after the lift files what waits. Every pass judges afresh what the memo
 * of runs at rest answers (`verifyRest`), and one in the middle starts with no memo at all, as a restarted daemon does.
 *
 * Walked through the runtime itself over an in-memory journal and a harness the test signs by hand, as rest-store.test.ts does, and every
 * filing `queued` as the store's own engine files it (`engineOf`), under the store's own admission (`storeAdmission`), so admission is
 * the runtime's: a task filed waits until a pass admits it, and none is admitted while the pause stands — what the engine's stand-in,
 * which has no pass that admits, cannot say, nor a landing whose journal does not read. The pause put, put at once and resumed, as a
 * person tells it, is on the stand-ins in `test/pause.test.ts`. A store of its own, since
 * `tick` reads every run under `WF_ROOT`, which is read as the module loads and so set before the import.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { nameFor, type Sighting } from 'agent-runtime';
import { asyncStore, type AsyncJournal, asyncOps, type AsyncRunner } from '../../test/promised.ts';
import { Engine } from 'agent-runtime';
import type { Run } from '../run.ts';
import type { Finishing } from '../pause/pause.ts';
import { scratch } from '../../test/scratch.ts';
import { until, WAITED } from 'agent-runtime/testing';
import { Effect } from 'effect';
import { testPlace } from '../../place/memory/index.ts';
import { runGiven, runOver } from '../../test/placed.ts';

const ROOT = scratch('wf-pause-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
process.env.WF_MAX_CONCURRENT = '10000';
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_RUNS;
const { addToInbox, approveRun, queueInInbox, readInbox, retryRun, startRun } = await import('../runner.ts');
const { approvalFile, asksDir, readRun } = await import('../record/record.store.ts');
const { tickRun, freshRestMemo } = await import('./tick.verb.ts');
const { engineOf, runWith: runEngine, storeAdmission } = await import('../runtime-client.ts');
const place = testPlace();
const stand = () => place;
const runWith = runOver(runEngine, () => stand().layer);
const runPlaced = runGiven(() => stand().layer);
const { resumePause, putPause } = await import('../pause/pause.store.ts');
const { pausedRead, runsListed } = await import('../list/list.verb.ts');
const { PAUSE_WAIT } = await import('../list/list.ts');
const { COMMANDS } = await import('../command/commands.verb.ts');
const { pausedLines, pausedWords } = await import('../pause/pause.ts');

/** A repository with one commit, so `nemia start` has a base to record. */
const aRepo = (): string => {
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
const memoryJournal = (tasks: Tasks, starts: Map<string, number>): AsyncJournal => {
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
  };
};

/** What no runtime writes: a `measured` whose responses are a word. */
const MISWRITTEN = { kind: 'measured', at: '2026-10-04T00:00:00Z', attempt: 1, usage: { responses: 'three' } };

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
      ...storeAdmission(),
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
const taskOf = (run: Run, step: string): string | undefined => readRun(run.id).steps[step]?.taskId ?? undefined;
/** The row `nemia ls` lists for `step` of `run`: its word and its note. */
const rowOf = async (run: Run, step: string) => {
  const [{ listed }] = (await runWith(h.e, runsListed(run.id))).runs;
  const row = listed.steps.find((s) => s.name === step);
  assert.ok(row, `${run.id} lists ${step}`);
  return row as { message: string; note?: string; reason?: string; on?: string; verdict?: unknown };
};

/** Passes until `step` of `run` waits at its gate, as `nemia ls` lists it: the state an approval asks before it is taken. */
const atGate = async (t: TestContext, run: Run, step: string) => {
  let seen = 'not read yet';
  await until(
    t,
    async () => {
      seen = (await rowOf(run, step)).message;
      if (seen === 'awaiting approval') return true;
      await pass();
      return false;
    },
    () => `${run.id}'s ${step} at its gate; it lists ${seen}`,
    { everyMs: 50 },
  );
};

const TWO = folder(['plan', 'work']);
const ONE = folder(['work']);
const CHECKED = folder(['work'], () => 'check: "true"\n');
const SHIP = folder(['work', 'ship'], (name) => (name === 'ship' ? 'harness: claude\ngate: true\nworkspace: base\ncheck: "true"\n' : ''));
const LANDS = aRepo();

/** A file left in the workspace of `run`'s step `work`, for the step at work there to hand off, as a session leaves its work. */
const worked = (run: string) => {
  const { workspace } = readRun(run).steps.work;
  assert.ok(workspace, `${run} has a workspace`);
  fs.writeFileSync(path.join(workspace, 'work.txt'), 'work\n');
};

/** The merge staged in `repo`'s checkout, uncommitted, as a landing's session leaves it for its check. */
const staged = (repo: string) => {
  stand().world.branch(repo, 'side', { 'side.txt': 'side\n' });
  stand().world.stage(repo, 'side');
};

test('while the store is paused nothing new starts and what runs finishes; the pass after the lift files what waits', WAITED, async (t) => {
  const running = await begun(TWO);
  const checked = await begun(CHECKED);
  const refused = await begun(ONE);
  const gated = await begun(TWO, { gates: ['plan'] });
  const landing = await begun(SHIP, { repo: LANDS, isolate: true });
  for (let k = 0; k < 6; k++) {
    await pass();
    if (k === 0) worked(landing.id);
    h.signAll([running, checked], [refused]);
  }
  await atGate(t, landing, 'ship');
  await runWith(h.e, approveRun(landing.id, 'ship'));
  for (let k = 0; k < 3; k++) await pass();
  assert.ok(taskOf(landing, 'ship'), "landing's ship at work as the pause is put");
  assert.ok(taskOf(running, 'plan') && taskOf(checked, 'work'), "running's plan and checked's work at work as the pause is put");
  assert.ok(taskOf(gated, 'plan') && !taskOf(gated, 'work'), "gated's plan signed, its work waiting at the gate");
  assert.equal(taskOf(refused, 'work'), `${refused.id}-work`, "refused's work signed blocked, on its first try");
  const queued = begun(ONE);
  await pass();
  const queuedTask = taskOf(await queued, 'work')!;
  assert.equal((await Effect.runPromise(h.e.view(queuedTask))).admission, 'queued', 'a task filed and not yet admitted');

  const pause = putPause({ why: 'merging by hand', by: 'ann' });
  const born = begun(ONE);
  await runWith(h.e, retryRun(refused.id, 'work', { mode: 'fresh' }));
  await runWith(h.e, approveRun(gated.id, 'plan'));
  const { card } = addToInbox({ text: 'an idea queued meanwhile', workflow: ONE, repo: REPO });
  queueInInbox(card.name);
  const before = h.spawned.length;
  staged(LANDS);

  const first = await pass();
  const byStep = (a: Finishing, b: Finishing) => `${a.run}${a.step}`.localeCompare(`${b.run}${b.step}`);
  const sorted = <P extends { finishing: Finishing[] }>(p: P): P => ({ ...p, finishing: [...p.finishing].sort(byStep) });
  const atWork = (
    [
      { run: running.id, step: 'plan', kind: 'session' },
      { run: checked.id, step: 'work', kind: 'session' },
      { run: landing.id, step: 'ship', kind: 'session' },
    ] satisfies Finishing[]
  ).sort(byStep);
  assert.deepEqual(
    sorted(first.pause!),
    { pause, finishing: atWork, staged: [], held: [] },
    'the pass says the pause it read, and what still finishes under it: neither the queued task nor one settled; no landing held yet',
  );
  assert.match(pausedLines(first.pause!)[0], /^Pausing: 3 finishing/);
  assert.equal(first.queue, undefined, 'and started no queued card');
  const listedAtWork = (await runWith(h.e, runsListed())).paused!;
  assert.deepEqual(sorted(listedAtWork), { pause, finishing: atWork, staged: [], held: [] }, 'nemia ls names each task still finishing');
  assert.deepEqual(sorted(await runWith(h.e, pausedRead())), sorted(listedAtWork), 'and the api reads the same');
  h.signAll();
  await pass(freshRestMemo());
  await pass();
  const last = await pass();
  const repo = readRun(landing.id).repo!;
  const held = [{ run: landing.id, step: 'ship', repo }];
  const checks = [{ run: checked.id, step: 'work' }];
  assert.deepEqual(
    last.pause,
    { pause, finishing: [], staged: held, held: checks },
    "once what ran has finished, nothing finishes; the landing is held staged, and checked's check held, each named once",
  );
  assert.deepEqual(pausedLines(last.pause), [
    pausedWords(last.pause),
    `   ${landing.id}'s ship has its merge staged in ${repo} (MERGE_HEAD), and its check waits on nemia resume`,
    `   ${checked.id}'s work has signed off, and its check waits on nemia resume`,
  ]);
  assert.match(pausedLines(last.pause)[0], /^Paused since .* nothing new starts, 2 checks held; /);
  const waits = await rowOf(checked, 'work');
  assert.notEqual(waits.message, 'checking', 'a check the pause keeps from being filed is not checking');
  assert.equal(waits.message, PAUSE_WAIT);
  assert.deepEqual(
    [waits.reason, waits.on, waits.verdict],
    ['Waiting', 'pause', { result: 'running', exit: null }],
    'its code says the pause holds it, and its check has no verdict yet',
  );
  assert.match(waits.note ?? '', /its check is filed on nemia resume/);
  assert.equal((await rowOf(landing, 'ship')).message, PAUSE_WAIT, 'nor is the landing whose check it holds');

  assert.deepEqual(h.spawned.slice(before), [], 'no session started while the store is paused');
  assert.equal((await Effect.runPromise(h.e.view(queuedTask))).admission, 'queued', 'the queued task not admitted');
  assert.equal((await Effect.runPromise(h.e.view(taskOf(running, 'plan')!))).phase, 'succeeded', "running's plan finished");
  assert.equal(taskOf(running, 'work'), undefined, "running's work, ready, not filed");
  assert.equal(readRun(checked.id).steps.work?.check, undefined, "checked's work signed, its check not filed");
  assert.equal(taskOf(refused, 'work'), `${refused.id}-work`, "refused's try asked, not filed");
  assert.deepEqual(
    fs.readdirSync(asksDir(refused.id)).filter((f) => f !== 'done'),
    ['retry-work-2'],
    'and the ask kept',
  );
  assert.ok(fs.existsSync(approvalFile(gated.id, 'plan', 1)), "gated's approval kept");
  assert.equal(taskOf(gated, 'work'), undefined, "gated's work not filed on it");
  assert.equal(taskOf(await born, 'work'), undefined, 'nothing filed of the run started while paused');
  assert.equal(last.queue, undefined, 'no queued card started');
  assert.equal(readInbox().find((l) => l.name === card.name)?.tried, undefined, 'nor tried');
  assert.ok(!('pause' in JSON.parse(fs.readFileSync(path.join(ROOT, 'runs', `${running.id}.json`), 'utf8'))), 'no record holds the pause');

  const listed = await runWith(h.e, runsListed());
  assert.deepEqual(
    listed.paused,
    { pause, finishing: [], staged: held, held: checks },
    'nemia ls names the pause, and the landing whose merge it holds staged in the checkout, its check not filed',
  );
  assert.equal(readRun(landing.id).steps.ship?.check, undefined);
  assert.deepEqual(await runWith(h.e, pausedRead()), listed.paused, 'and the api reads the same');
  const ls = COMMANDS.find((c) => c.name === 'ls')!;
  assert.deepEqual(ls.print(listed, {}).slice(0, 3), pausedLines(listed.paused), 'nemia ls says it first');

  const spoiled = h.tasks.get(taskOf(landing, 'ship')!)!;
  spoiled.push(MISWRITTEN as never);
  const unread = await pass();
  assert.deepEqual(
    unread.pause,
    { pause, finishing: [], staged: [], held: checks },
    'a landing whose journal does not read is left out, and the pass goes on',
  );
  assert.ok(
    unread.unreadable?.some((w) => w.startsWith(`${landing.id} is not advanced`)),
    JSON.stringify(unread.unreadable),
  );
  spoiled.pop();

  resumePause();
  const lifted = await pass();
  assert.equal(lifted.pause, undefined, 'the pass after the lift says no pause');
  assert.ok(taskOf(running, 'work'), "running's work filed");
  assert.ok(readRun(checked.id).steps.work?.check, "checked's check filed");
  assert.equal((await rowOf(checked, 'work')).message, 'checking', 'and checking, once its check is filed');
  putPause({ why: 'again', by: 'ann' });
  try {
    assert.equal((await rowOf(checked, 'work')).message, 'checking', 'a check filed before the pause is checking under it');
    assert.equal(
      (await runWith(h.e, pausedRead())).held.some((c) => c.run === checked.id),
      false,
      'and the pause holds it not',
    );
  } finally {
    resumePause();
  }
  assert.equal(taskOf(refused, 'work'), `${refused.id}-work-try2`, "refused's try filed");
  assert.ok(taskOf(gated, 'work'), "gated's work filed on the approval");
  assert.ok(taskOf(await born, 'work'), 'the run started while paused filed');
  assert.ok(lifted.queue, 'the queued card tried');
  assert.ok(readRun(landing.id).steps.ship?.check, "landing's check filed");
  assert.equal((await runWith(h.e, runsListed())).paused, undefined, 'and nemia ls says no pause');
  assert.deepEqual(await runWith(h.e, pausedRead()), { pause: null, finishing: [], staged: [], held: [] });
  await pass();
  assert.ok(h.spawned.length > before, 'and sessions started again');
  assert.notEqual((await Effect.runPromise(h.e.view(queuedTask))).admission, 'queued', 'the queued task admitted');
});

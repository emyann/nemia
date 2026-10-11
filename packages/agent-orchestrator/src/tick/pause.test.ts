/**
 * The store's pause, as the tick honours it: while `$WF_ROOT/cordon` stands no pass starts new work — no step, try or check filed, no
 * queued task admitted, no queued card started, nothing of a run `nemia start` wrote meanwhile — and what runs finishes; a person's retry
 * and approval written meanwhile wait on their files; and the pass after the lift files what waits. Every pass judges afresh what the memo
 * of runs at rest answers (`verifyRest`), and one in the middle starts with no memo at all, as a restarted daemon does.
 *
 * Walked through the runtime itself over an in-memory journal and a harness the test signs by hand, as rest-store.test.ts does, and every
 * filing `queued` as the store's own engine files it (`engineOf`), under the store's own admission (`storeAdmission`), so admission is
 * the runtime's: a task filed waits until a pass admits it, and none is admitted while the pause stands. A store of its own, since
 * `tick` reads every run under `WF_ROOT`, which is read as the module loads and so set before the import.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { nameFor, type Sighting } from 'agent-runtime';
import { asyncStore, type AsyncJournal, asyncOps, type AsyncRunner } from '../../test/promised.ts';
import { Engine } from 'agent-runtime';
import type { Run } from '../run.ts';
import type { Finishing } from '../pause/pause.ts';
import { scratch } from '../../test/scratch.ts';
import { until, WAITED } from '../../test/waits.ts';
import { Effect } from 'effect';
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
const { gitPlaceLayer } = await import('../place/shipped.store.ts');
const runWith = runOver(runEngine, gitPlaceLayer);
const runPlaced = runGiven(gitPlaceLayer);
const { resumePause, putPause } = await import('../pause/pause.store.ts');
const { pauseNow } = await import('../pause/pause.verb.ts');
const { pausedRead, runsListed } = await import('../list/list.verb.ts');
const { PAUSE_WAIT } = await import('../list/list.ts');
const { COMMANDS } = await import('../command/commands.verb.ts');
const { pausedLines, pausedWords } = await import('../pause/pause.ts');

const git = (repo: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

/** A repository with one commit, so `nemia start` has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  git(repo, 'init', '-q');
  git(repo, 'commit', '-q', '--allow-empty', '-m', 'base');
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

/** What no runtime writes: a `measured` whose turns are a word. */
const MISWRITTEN = { kind: 'measured', at: '2026-10-04T00:00:00Z', attempt: 1, usage: { turns: 'three' } };

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
  return row as { status: string; note?: string };
};

/** Passes until `step` of `run` waits at its gate, as `nemia ls` lists it: the state an approval asks before it is taken. */
const atGate = async (t: TestContext, run: Run, step: string) => {
  let seen = 'not read yet';
  await until(
    t,
    async () => {
      seen = (await rowOf(run, step)).status;
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
const SHIP = folder(['work', 'ship'], (name) => (name === 'ship' ? 'harness: claude\ngate: true\nworkspace: main\ncheck: "true"\n' : ''));
const LANDS = aRepo();

/** A file left in the worktree of `branch` of `repo`, for the step at work there to hand off, as a session leaves its work. */
const worked = (repo: string, branch: string) => {
  const lines = git(repo, 'worktree', 'list', '--porcelain').split('\n');
  const at = lines.indexOf(`branch refs/heads/${branch}`);
  assert.ok(at > 0, `${branch} has a worktree`);
  fs.writeFileSync(path.join(lines[at - 2].replace(/^worktree /, ''), 'work.txt'), 'work\n');
};

/** The merge staged in `repo`'s checkout, uncommitted, as a landing's session leaves it for its check. */
const staged = (repo: string) => {
  git(repo, 'checkout', '-q', '-b', 'side');
  fs.writeFileSync(path.join(repo, 'side.txt'), 'side\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'side');
  git(repo, 'checkout', '-q', '-');
  git(repo, 'merge', '-q', '--no-ff', '--no-commit', 'side');
};

test('while the store is paused nothing new starts and what runs finishes; the pass after the lift files what waits', WAITED, async (t) => {
  const running = await begun(TWO);
  const checked = await begun(CHECKED);
  const refused = await begun(ONE);
  const gated = await begun(TWO, { gates: ['plan'] });
  const landing = await begun(SHIP, { repo: LANDS, isolate: true });
  for (let k = 0; k < 6; k++) {
    await pass();
    if (k === 0) worked(LANDS, readRun(landing.id).steps.work.branch!);
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
  assert.notEqual(waits.status, 'checking', 'a check the pause keeps from being filed is not checking');
  assert.equal(waits.status, PAUSE_WAIT);
  assert.match(waits.note ?? '', /its check is filed on nemia resume/);
  assert.equal((await rowOf(landing, 'ship')).status, PAUSE_WAIT, 'nor is the landing whose check it holds');

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
  assert.equal((await rowOf(checked, 'work')).status, 'checking', 'and checking, once its check is filed');
  putPause({ why: 'again', by: 'ann' });
  try {
    assert.equal((await rowOf(checked, 'work')).status, 'checking', 'a check filed before the pause is checking under it');
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

test(
  'a pause at once stops each session and check at work but a landing, and the resume continues each; one that ended first is not tried',
  WAITED,
  async (t) => {
    for (let k = 0; k < 6; k++) {
      h.signAll();
      await pass();
    }
    const lands = aRepo();
    const session = await begun(ONE);
    const checking = await begun(CHECKED);
    const ended = await begun(ONE);
    const landing = await begun(SHIP, { repo: lands, isolate: true });
    await pass();
    worked(lands, readRun(landing.id).steps.work.branch!);
    await pass();
    await pass();
    h.signAll([session, ended]);
    await atGate(t, landing, 'ship');
    await runWith(h.e, approveRun(landing.id, 'ship'));
    for (let k = 0; k < 3; k++) await pass();
    const sessionTask = taskOf(session, 'work')!;
    const checkTask = readRun(checking.id).steps.work?.check?.taskId;
    assert.ok(
      checkTask && (await Effect.runPromise(h.e.view(checkTask))).phase.startsWith('running'),
      "checking's check runs as the pause is put",
    );
    assert.ok(taskOf(landing, 'ship'), "landing's ship at work as the pause is put");
    const before = h.spawned.length;

    const endedTask = taskOf(ended, 'work')!;
    const racing = new Proxy(h.e, {
      get: (target, key) =>
        key === 'stop'
          ? (taskId: string) =>
              Effect.gen(function* () {
                if (taskId === endedTask) {
                  h.signAll([session, checking, landing]);
                  yield* Effect.promise(() => pass());
                }
                return yield* target.stop(taskId);
              })
          : Reflect.get(target, key),
    });
    const now = await runWith(racing, pauseNow({ why: 'the bill', by: 'ann' }));
    const mine = (i: { run: string }) => [session.id, checking.id, ended.id, landing.id].includes(i.run);
    assert.deepEqual(
      now.interrupted
        .filter(mine)
        .map((i) => `${i.run} ${i.step} ${i.kind}`)
        .sort(),
      [`${checking.id} work check`, `${ended.id} work session`, `${session.id} work session`].sort(),
      'the landing is left to finish',
    );
    for (let k = 0; k < 3; k++) await pass();
    assert.equal((await Effect.runPromise(h.e.view(sessionTask))).phase, 'stopped');
    assert.equal((await Effect.runPromise(h.e.view(checkTask))).phase, 'stopped');
    assert.equal((await Effect.runPromise(h.e.view(endedTask))).phase, 'succeeded', 'a session that ended before its stop was taken');
    assert.notEqual((await Effect.runPromise(h.e.view(taskOf(landing, 'ship')!))).phase, 'stopped', 'the landing finishes');
    assert.deepEqual(
      fs.readdirSync(asksDir(landing.id)).filter((f) => f.startsWith('retry-')),
      [],
      'and is asked no try',
    );
    assert.deepEqual(
      fs.readdirSync(asksDir(ended.id)).filter((f) => f !== 'done'),
      [],
      'its ask set aside',
    );
    assert.deepEqual(fs.readdirSync(path.join(asksDir(ended.id), 'done')), ['retry-work-2']);
    await pass(freshRestMemo());
    assert.deepEqual(h.spawned.slice(before), [], 'a restarted daemon files nothing while paused');
    assert.equal(taskOf(session, 'work'), sessionTask);

    resumePause();
    await pass();
    const resumed = readRun(session.id).steps.work;
    assert.notEqual(resumed.taskId, sessionTask, "session's try 2 filed");
    assert.deepEqual(resumed.tries, [{ taskId: sessionTask, then: 'nudge', paused: true }]);
    const stoppedAttempt = (await Effect.runPromise(h.e.view(sessionTask))).state.attempts.at(-1)!;
    assert.equal(
      (await Effect.runPromise(h.e.view(resumed.taskId!))).state.resumeFrom,
      stoppedAttempt.nativeId,
      'continuing the session it stopped',
    );
    const rechecked = readRun(checking.id).steps.work;
    assert.notEqual(rechecked.check?.taskId, checkTask, "checking's check filed again");
    assert.deepEqual(rechecked.tries?.at(-1), { taskId: rechecked.taskId, check: { taskId: checkTask }, then: 'recheck', paused: true });
    assert.equal(readRun(ended.id).steps.work?.tries, undefined, 'the run whose session ended first is not tried');
  },
);

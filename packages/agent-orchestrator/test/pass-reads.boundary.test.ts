/**
 * What one pass of the tick reads, counted on a store of runs not at rest: each task's view once a pass (`reportedEngine`), the cap's slots
 * once a pass and only where a claim on a repository's checkout waits on one (`passRead`, `checkoutHold`), each run another waits on once a
 * pass (`Parents`), one `standing` for each repository, place and base branch (`passStanding`), and a run's asks folder listed once a read
 * (`readAsks`, `readRun`). Identities on the reads, never a time.
 *
 * The store: on one repository, three runs whose ending ended failed, a run whose ending works in the checkout, two whose approved endings
 * wait for it, two runs started `--after` the first of those and a run held until it, a run at its third try, and ten finished runs. The
 * engine is a board settled by hand that counts each task it is asked to view or list, and each write naming one, and reports every task
 * not settled on its pass, as the runtime does.
 *
 * The tests share the store, in order: a test that adds to it comes after those that only read it.
 *
 * `WF_ROOT` is set before the runner is imported: the module reads it as it loads. `WF_VERIFY_REST=1` judges in full every run a pass
 * answers from its memo of runs at rest; each pass here is handed a fresh memo, so none is.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Effect } from 'effect';
import type { Run, TaskPhase } from '../src/run.ts';
import { promised } from './promised.ts';
import { scratch } from './scratch.ts';
import { TEAM, TEAM_DEV } from './team.ts';
import { columnsListed, plantedGit } from './planted-git.ts';
import { runGiven, runOver } from './placed.ts';
import { steeredClock } from './steered.ts';
import { until, WAITED } from './waits.ts';
import { placeOver, placeSplit, unreadBy } from './place-over.ts';
import { gitPlace } from '../place/git/place.ts';

const ROOT = scratch('wf-pass-reads-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
process.env.WF_MAX_RUNS = '40';
delete process.env.WF_MAX_CONCURRENT;
const {
  advanceRun,
  approveRun,
  hold,
  retryRun,
  runWith: runEngine,
  gitPlaceLayer,
  shippedGitPlace,
  startRun,
  tickRun,
} = await import('../src/runner.ts');
const runWith = runOver(runEngine, gitPlaceLayer);
const runPlaced = runGiven(gitPlaceLayer);
const { acceptFile, askFile, asksDir, pruneFile, readAsks, readRun, roundAskFile, stepsOf } = await import('../src/record/record.store.ts');
const { passRead } = await import('../src/cap/cap.verb.ts');
const { passRevisions } = await import('../src/revisions/pin.verb.ts');
const { checkoutHold } = await import('../src/ending/ending.verb.ts');
const { passParents, reportedEngine } = await import('../src/views/views.verb.ts');
const { metered } = await import('../src/meter/tally.store.ts');
const { runStore } = await import('../src/record/files.store.ts');
const { freshRestMemo } = await import('../src/tick/tick.verb.ts');
const { readStanding, standingFile } = await import('../src/standing/standing.store.ts');
const { runsListed } = await import('../src/list/list.verb.ts');
const { lsLines } = await import('../src/list/list.ts');
const { NOTHING_READ, standingReader, standingSnapshot } = await import('../src/standing/standing.verb.ts');
const { statusMemo } = await import('../src/place/landing.store.ts');
const { PlaceService } = await import('../src/place/place.store.ts');

const SIGNED = { outcome: 'done', summary: 'did the work', artifacts: [], needs: null };
const SHIP_MD = fs.readFileSync(path.join(TEAM_DEV, 'ship.md'), 'utf8');
fs.cpSync(path.join(TEAM, 'agents'), path.join(ROOT, 'agents'), { recursive: true });
fs.cpSync(path.join(TEAM, 'skills'), path.join(ROOT, 'skills'), { recursive: true });

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** A repository with one file committed on main. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  git(repo, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(repo, 'add.ts'), 'export const add = (a, b) => a + b;\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'base');
  return repo;
};

/** `implement → ship`, the team's `dev/ship.md` its ending, after implement. */
const shipFolder = (() => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-ship-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  fs.writeFileSync(path.join(dir, 'ship.md'), SHIP_MD.replace(/^after: review$/m, 'after: implement'));
  return dir;
})();

/** One step, `implement`. */
const oneStep = (() => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-one-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  return dir;
})();

/** Whether a task's phase is one it has settled in. */
const settledPhase = (p: TaskPhase) => ['succeeded', 'failed', 'stopped'].includes(p);

/**
 * An engine board a test settles by hand, which counts each task it is asked to view or list (`reads`), each write that names one
 * (`writes`) and each `list` (`lists`). Its pass reports every task not settled, as the runtime's does, and those are not reads.
 */
const board = () => {
  const tasks = new Map<string, { spec: { id: string; brief: string }; phase: TaskPhase; closeout?: unknown }>();
  const reads = new Map<string, number>();
  const writes = new Map<string, number>();
  const lists = { calls: 0 };
  const counted = (into: Map<string, number>, id: string) => into.set(id, (into.get(id) ?? 0) + 1);
  const viewOf = (id: string) => {
    const t = tasks.get(id);
    return {
      id,
      phase: t?.phase ?? 'unknown',
      sessionId: t ? 's' : null,
      state: {
        brief: t?.spec.brief ?? '',
        settled: t && settledPhase(t.phase) ? t.phase : null,
        stopRequested: false,
        said: [],
        attempts:
          !t || t.phase === 'pending'
            ? []
            : [{ n: 1, ended: null, nativeId: `native-${id}`, closeout: t.closeout, exitCode: null, usage: null }],
      },
    };
  };
  const e = {
    tick: async () => ({
      tasks: tasks.size,
      actions: [],
      running: {},
      views: [...tasks].filter(([, t]) => !settledPhase(t.phase)).map(([id]) => viewOf(id)),
    }),
    view: async (id: string) => {
      counted(reads, id);
      return viewOf(id);
    },
    list: async (ids: readonly string[]) => {
      lists.calls++;
      for (const id of ids) counted(reads, id);
      return { views: ids.filter((id) => tasks.has(id)).map(viewOf), unreadable: [] };
    },
    file: async (spec: { id: string; brief: string }) => {
      counted(writes, spec.id);
      tasks.set(spec.id, { spec, phase: 'pending' });
      return spec.id;
    },
    admit: async (ids: readonly string[]) => {
      for (const id of ids) counted(writes, id);
      return [];
    },
    stop: async (id: string) => void counted(writes, id),
    close: async (id: string) => void counted(writes, id),
    answer: async (id: string) => void counted(writes, id),
    logs: async () => '(no output yet)',
    output: async () => '',
    feed: async () => ({ entries: [], cursor: 0 }),
  };
  const settle = (id: string, phase: TaskPhase, closeout?: unknown) => Object.assign(tasks.get(id)!, { phase, closeout });
  return { e: promised(e), reads, writes, lists, settle };
};

/** A run of `implement → ship` on `repo`, implement committed and signed: at the ending's gate. */
const atTheGate = async (b: ReturnType<typeof board>, repo: string): Promise<Run> => {
  const run = await runPlaced(startRun({ brief: 'add sub', repo, workflowDir: shipFolder }));
  await runWith(b.e, advanceRun(readRun(run.id)));
  const work = readRun(run.id).steps.implement;
  fs.appendFileSync(path.join(work.workspace!, 'add.ts'), `export const sub${run.id.slice(-4)} = 1;\n`);
  git(work.workspace!, 'add', '-A');
  git(work.workspace!, 'commit', '-q', '-m', 'add sub');
  b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(run.id)));
  return readRun(run.id);
};

/** A run of one step on `repo`, filed and settled `phase`. */
const settledOne = async (b: ReturnType<typeof board>, repo: string, phase: TaskPhase): Promise<Run> => {
  const run = await runPlaced(startRun({ brief: 'one', repo, workflowDir: oneStep }));
  await runWith(b.e, advanceRun(readRun(run.id)));
  b.settle(`${run.id}-implement`, phase, phase === 'succeeded' ? SIGNED : undefined);
  await runWith(b.e, advanceRun(readRun(run.id)));
  return readRun(run.id);
};

/** Two runs started `--after` `parent`, and one held until it. */
const waitingOn = async (b: ReturnType<typeof board>, repo: string, parent: string) => {
  for (let i = 0; i < 2; i++) await runPlaced(startRun({ brief: `after ${i}`, repo, workflowDir: oneStep, after: [parent] }));
  const held = await runPlaced(startRun({ brief: 'held', repo, workflowDir: oneStep }));
  await runWith(b.e, hold(held.id, [parent]));
};

/** The store of runs not at rest the header names, on one repository and one board. */
const store = async () => {
  const b = board();
  const repo = aRepo();
  for (let i = 0; i < 3; i++) {
    const failed = await atTheGate(b, repo);
    await runWith(b.e, approveRun(failed.id, 'ship'));
    assert.deepEqual((await runWith(b.e, advanceRun(readRun(failed.id)))).filed, ['ship'], 'the checkout is free for it');
    b.settle(`${failed.id}-ship`, 'failed');
    await runWith(b.e, advanceRun(readRun(failed.id)));
  }
  const working = await atTheGate(b, repo);
  await runWith(b.e, approveRun(working.id, 'ship'));
  assert.deepEqual(
    (await runWith(b.e, advanceRun(readRun(working.id)))).filed,
    ['ship'],
    "its ending is filed into the repository's checkout",
  );
  const waiting = await atTheGate(b, repo);
  await runWith(b.e, approveRun(waiting.id, 'ship'));
  const second = await atTheGate(b, repo);
  await runWith(b.e, approveRun(second.id, 'ship'));
  await waitingOn(b, repo, waiting.id);
  const trying = await settledOne(b, repo, 'failed');
  for (const n of [2, 3]) {
    await runWith(b.e, retryRun(trying.id, 'implement', { mode: 'fresh' }));
    await runWith(b.e, advanceRun(readRun(trying.id)));
    if (n === 2) b.settle(readRun(trying.id).steps.implement.taskId!, 'failed');
  }
  for (let i = 0; i < 10; i++) await settledOne(b, repo, 'succeeded');
  return { b, repo, waiting, second };
};

/** The one store every test reads, built on first use: a board settles only the tasks it filed, so each test's store is the same. */
let built: ReturnType<typeof store> | undefined;
const theStore = () => (built ??= store());

/** One pass of the tick over the store, metered, a fresh memo of runs at rest given so every run is judged in full. */
const onePass = async (b: ReturnType<typeof board>) => {
  b.reads.clear();
  b.writes.clear();
  const { value, tallies } = await metered(() => runWith(b.e, tickRun({ memo: freshRestMemo() })));
  assert.ok(tallies, 'the pass was metered');
  return { pass: value, tallies };
};

test("a pass reads each task's view once, and once more after a write of the pass names it", async () => {
  const { b, waiting } = await theStore();
  await onePass(b);
  assert.equal(readRun(waiting.id).steps.ship?.taskId ?? undefined, undefined, 'the approved ending still waits for the checkout');
  assert.ok(b.reads.size > 20, `the pass read the store's tasks (${b.reads.size})`);
  const over = [...b.reads].filter(([id, n]) => n > 1 + (b.writes.get(id) ?? 0));
  assert.deepEqual(over, [], 'no task is read twice with no write of the pass naming it between');
});

test("the cap's slots are read once for the pass, however many claims ask", async () => {
  const { b } = await theStore();
  const read = passRead(b.e, runStore.runs.list(), process.env, NOTHING_READ);
  b.lists.calls = 0;
  const first = await Effect.runPromise(read.slots);
  const second = await Effect.runPromise(read.slots);
  assert.equal(b.lists.calls, 1, 'one look at the tasks');
  assert.equal(second, first, 'the same slots, not read again');
});

test('a pass resolves one workflow folder once, however many runs wait on it', async () => {
  const { b, repo, waiting } = await theStore();
  const unfiled = () => runStore.runs.list().filter((r) => !r.steps.implement?.taskId && !r.cancelledAt).length;
  const { tallies: before } = await onePass(b);
  assert.ok(before.kinds.revisions.calls > 0, 'the pass resolved the kinds of the runs that have filed nothing');
  const was = unfiled();
  for (let i = 0; i < 6; i++)
    await runPlaced(startRun({ brief: `on the one folder ${i}`, repo, workflowDir: oneStep, after: [waiting.id] }));
  assert.equal(unfiled() - was, 6, 'six more runs wait on the one folder, each having filed nothing');
  const { tallies: after } = await onePass(b);
  assert.equal(
    after.kinds.revisions.calls,
    before.kinds.revisions.calls,
    'and the folder is loaded, digested and numbered once between them: a resolve is shared by every run on one folder, never paid per run',
  );
});

test('a one-off verb, handed no pass, resolves the folder for itself', async () => {
  const { b, repo } = await theStore();
  const run = await runPlaced(startRun({ brief: 'resolved for itself', repo, workflowDir: oneStep }));
  const { tallies } = await metered(() => runWith(b.e, advanceRun(readRun(run.id))));
  assert.ok(tallies, 'the verb was metered');
  assert.ok(
    tallies.kinds.revisions.calls > 0,
    'nemia start, nemia refresh and advanceRun read the world themselves: a pass is what shares one read, and a verb is no pass',
  );
});

test("a run's own claim on the checkout reads the slot its pass gave it, and the cap for no one", async () => {
  const { b, waiting } = await theStore();
  const run = readRun(waiting.id);
  let asked = 0;
  const slots = Effect.sync(() => {
    asked++;
    return new Map();
  });
  const hold = await Effect.runPromise(
    checkoutHold(
      b.e,
      run,
      stepsOf(run),
      {
        read: {
          runs: [run],
          slots,
          parents: passParents(standingReader(NOTHING_READ)),
          standing: NOTHING_READ,
          revisions: passRevisions(),
        },
        slot: undefined,
      },
      process.env,
      statusMemo(() => undefined, shippedGitPlace),
    ),
  );
  assert.equal(hold, undefined, 'no other run claims the checkout in what the pass listed');
  assert.equal(asked, 0, "the cap's slots are not read for the run's own claim");
});

test('a pass spends no git process more for more runs waiting on runs of the same repository', async () => {
  const { b, repo, waiting, second } = await theStore();
  const runs = () => runStore.runs.list().length;
  const was = runs();
  const { tallies: before } = await onePass(b);
  await waitingOn(b, repo, waiting.id);
  await waitingOn(b, repo, second.id);
  const added = runs() - was;
  const { tallies: after } = await onePass(b);
  assert.ok(before.kinds.place.spawned > 0, 'the pass asked the place');
  assert.equal(after.kinds.place.spawned, before.kinds.place.spawned, 'over one listing of branches per repository');
  assert.equal(
    after.records - before.records,
    added + 1,
    'each run waited on read once for the pass: the runs added cost their own records, and the one they newly wait on its, once',
  );
});

test("a pass's one standing for the repository asks of a finished run, a pruned one, a pruned run handed to one not started and one held until", async () => {
  const { b, repo } = await theStore();
  const done = await settledOne(b, repo, 'succeeded');
  const pruned = await settledOne(b, repo, 'succeeded');
  const handed = await settledOne(b, repo, 'succeeded');
  const until = await atTheGate(b, repo);
  await runPlaced(startRun({ brief: 'handed one', repo, workflowDir: oneStep, context: [handed.id] }));
  const held = await runPlaced(startRun({ brief: 'held until one', repo, workflowDir: oneStep }));
  await runWith(b.e, hold(held.id, [until.id]));
  for (const r of [handed, until, pruned])
    fs.writeFileSync(pruneFile(r.id), JSON.stringify({ at: new Date().toISOString(), worktrees: [] }));
  await onePass(b);
  const { value: git, tallies } = await metered(() => runWith(b.e, standingSnapshot().pipe(Effect.map(standingReader))));
  for (const r of [done, handed, until, pruned]) {
    const branch = r.steps.implement.branch!;
    assert.equal(git.unread(readRun(r.id) as never, branch), undefined, `${r.id}'s ${branch} answered off the pass`);
  }
  assert.equal(
    Object.values(tallies!.kinds).reduce((n, k) => n + k.spawned, 0),
    0,
    'read off standing.json',
  );
});

test('nemia ls reads where branches stand off standing.json and starts no process; with none, it says not read, never a verdict', async () => {
  const { b } = await theStore();
  await onePass(b);
  const spawned = async () => {
    const { value, tallies } = await metered(() => runWith(b.e, runsListed()));
    return { lines: lsLines(value, Date.now()).join('\n'), spawned: Object.values(tallies!.kinds).reduce((n, k) => n + k.spawned, 0) };
  };
  assert.equal((await spawned()).spawned, 0, 'read off the snapshot');
  fs.rmSync(standingFile());
  const { lines, spawned: none } = await spawned();
  assert.equal(none, 0, 'no snapshot, and still no process');
  assert.match(lines, /where branches stand: not read/);
  for (const verdict of ['shipped', ' is on ', 'ahead of', 'is gone']) assert.ok(!lines.includes(verdict), `nemia ls says ${verdict}`);
});

test("a run's asks are listed once a read, and each file in them read once", async () => {
  const { waiting } = await theStore();
  const id = waiting.id;
  const at = new Date().toISOString();
  fs.writeFileSync(acceptFile(id, 'implement', 1), JSON.stringify({ at, message: 'good enough' }));
  fs.writeFileSync(askFile(id, 'implement', 2), JSON.stringify({ mode: 'fresh', at }));
  fs.writeFileSync(roundAskFile(id, 'implement', 2), JSON.stringify({ at }));
  const files = fs.readdirSync(asksDir(id)).filter((f) => /^(approve|accept|retry|round)-/.test(f)).length;
  assert.equal(files, 4, 'an approval, an acceptance, a retry and a round');
  const asks = (await metered(async () => readAsks(id))).tallies!.kinds.asks;
  assert.deepEqual({ calls: asks.calls, reads: asks.reads }, { calls: 1, reads: files }, 'one walk of the folder, each file read once');
  const record = (await metered(async () => readRun(id))).tallies!.kinds.asks;
  assert.deepEqual({ calls: record.calls, reads: record.reads }, { calls: 1, reads: 2 }, 'the approval and the acceptance, off one walk');
});

/**
 * An engine that answers a view of any task, records each task it is asked to view or list, holds a view of `slow` until let go, and
 * answers a filing, an answer and a forget with nothing.
 */
const askedEngine = () => {
  const asked: string[] = [];
  const held: { go?: () => void } = {};
  const view = async (id: string) => {
    asked.push(id);
    if (id === 'slow') await new Promise<void>((go) => (held.go = go));
    return { id } as never;
  };
  const list = async (ids: string[]) => {
    asked.push(...ids);
    return { views: ids.map((id) => ({ id })), unreadable: [] };
  };
  const wrote = async () => undefined;
  return { e: promised({ view, list, file: wrote, answer: wrote, forget: wrote }), asked, held };
};

test('a view kept for the pass is read again once a write names its task, and the views of the tasks it does not name are kept', async () => {
  const { e: engine, asked } = askedEngine();
  const e = reportedEngine(engine, []);
  await Effect.runPromise(e.view('t-1'));
  await Effect.runPromise(e.list(['t-1', 't-2']));
  await Effect.runPromise(e.view('t-2'));
  assert.deepEqual(asked, ['t-1', 't-2'], 'each read once');
  await Effect.runPromise(e.file({ id: 't-1' } as never));
  await Effect.runPromise(e.list(['t-1', 't-2']));
  assert.deepEqual(asked, ['t-1', 't-2', 't-1'], 'the task filed is read again, and the other kept');
  await Effect.runPromise(e.answer('t-2', 'yes'));
  await Effect.runPromise(e.view('t-2'));
  assert.deepEqual(asked, ['t-1', 't-2', 't-1', 't-2'], 'the task answered is read again');
});

test('a view the engine was still reading when a write of the pass went through is not kept', async () => {
  const { e: engine, asked, held } = askedEngine();
  const e = reportedEngine(engine, []);
  const slow = Effect.runPromise(e.view('slow'));
  await Effect.runPromise(e.file({ id: 'other' } as never));
  held.go?.();
  await slow;
  const again = Effect.runPromise(e.view('slow'));
  held.go?.();
  await again;
  assert.deepEqual(asked, ['slow', 'slow'], 'read again: what it read may be from before the write');
});

test('a forget drops the views of the tasks it forgets, and keeps the others the pass read', async () => {
  const { e: engine, asked } = askedEngine();
  const e = reportedEngine(engine, []);
  await Effect.runPromise(e.view('a'));
  await Effect.runPromise(e.view('b'));
  await Effect.runPromise(e.forget(['a'], { yes: true }));
  await Effect.runPromise(e.view('a'));
  await Effect.runPromise(e.view('b'));
  assert.deepEqual(asked, ['a', 'b', 'a'], 'the task forgotten is read again, and the other kept');
});

/** The place the package ships, its `standing` not heard, in `said`. */
const standingUnread = (said: string) => PlaceService.layer(placeOver(shippedGitPlace, { standing: () => unreadBy('standing', said) }));

test('a pass asks one standing for each repository, place and base branch: a run on a second base branch adds exactly one', async () => {
  const { b, repo } = await theStore();
  const { tallies: before } = await onePass(b);
  assert.deepEqual(
    readStanding()?.places.map((p) => [p.repo, p.base]),
    [[path.resolve(repo), 'main']],
  );
  git(repo, 'switch', '-q', '-c', 'other');
  try {
    await settledOne(b, repo, 'succeeded');
  } finally {
    git(repo, 'switch', '-q', 'main');
  }
  const { tallies: after } = await onePass(b);
  assert.deepEqual(
    readStanding()
      ?.places.map((p) => p.base)
      .sort(),
    ['main', 'other'],
  );
  assert.equal(after.kinds.place.spawned, before.kinds.place.spawned + 1, 'one process more, for the second base');
});

test('REFUSED: a run waits on one whose standing is unread, though it has shipped, says why, and is filed once standing answers', async () => {
  const { b, repo } = await theStore();
  const parent = await atTheGate(b, repo);
  const child = await runPlaced(startRun({ brief: 'after it', repo, workflowDir: oneStep, after: [parent.id] }));
  git(repo, 'merge', '-q', '--no-ff', '-m', 'land it', parent.steps.implement.branch!);
  const unread = standingUnread('the standing broke');
  const held = await runWith(b.e, tickRun({ memo: freshRestMemo() }).pipe(Effect.provide(unread)));
  assert.equal(readRun(child.id).steps.implement.taskId ?? undefined, undefined, 'nothing of it filed while its parent reads unread');
  assert.deepEqual(held.runs.find((r) => r.run.id === child.id)?.waiting, [
    { run: parent.id, unread: 'the place was not heard: the standing broke' },
  ]);
  const places = readStanding()?.places ?? [];
  assert.ok(places.length > 0 && places.every((p) => 'unread' in p), JSON.stringify(places));
  await runWith(b.e, tickRun({ memo: freshRestMemo() }));
  assert.ok(readRun(child.id).steps.implement.taskId, 'filed once its parent reads shipped');
  assert.equal(readRun(child.id).baseRef, git(repo, 'rev-parse', 'main').trim(), 'cut from the base as the pass read it, the merge on it');
});

test('REFUSED: a standing.json that is not the one the tick writes is refused, naming the file and what to do', async () => {
  await onePass((await theStore()).b);
  const { standingFile } = await import('../src/standing/standing.store.ts');
  const was = fs.readFileSync(standingFile(), 'utf8');
  const refused = (): string => {
    try {
      readStanding();
    } catch (err) {
      return (err as Error).message;
    }
    return 'read';
  };
  try {
    fs.writeFileSync(standingFile(), JSON.stringify({ ...JSON.parse(was), v: 2 }));
    assert.match(refused(), /standing\.json: its v .*: only the tick writes it, and its next pass writes it whole/);
    fs.writeFileSync(standingFile(), was.slice(0, -1));
    assert.match(refused(), /standing\.json is not JSON: only the tick writes it/);
  } finally {
    fs.writeFileSync(standingFile(), was);
  }
  assert.equal(readStanding()?.v, 1);
});

test('a step that left its work uncommitted is handed off on the pass that finishes its run, and the tip that pass keeps is the hand-off', async () => {
  const { b, repo } = await theStore();
  const run = await runPlaced(startRun({ brief: 'left uncommitted', repo, workflowDir: oneStep }));
  await runWith(b.e, advanceRun(readRun(run.id)));
  const work = readRun(run.id).steps.implement;
  fs.writeFileSync(path.join(work.workspace!, 'left.ts'), 'export const left = 1;\n');
  b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await runWith(b.e, tickRun({ memo: freshRestMemo() }));
  const tip = git(repo, 'rev-parse', work.branch!).trim();
  assert.notEqual(tip, readRun(run.id).baseRef, 'the hand-off committed the work on its branch');
  assert.deepEqual(readRun(run.id).tips, { [work.branch!]: tip }, 'the tip kept is the one git has after the hand-off');
});

test('REFUSED: a run filed on a pass whose standing read no head of its base keeps the base it was started on, its parent read shipped', async () => {
  const { b, repo } = await theStore();
  const parent = await atTheGate(b, repo);
  const child = await runPlaced(startRun({ brief: 'after it, no head', repo, workflowDir: oneStep, after: [parent.id] }));
  git(repo, 'merge', '-q', '--no-ff', '-m', 'land it', parent.steps.implement.branch!);
  const headless = PlaceService.layer(
    placeOver(shippedGitPlace, {
      standing: (request) => {
        const read = shippedGitPlace.askNow('standing', request);
        if (!('answer' in read)) return read;
        const { main: _base, ...heads } = read.answer.heads;
        return { answer: { ...read.answer, heads } };
      },
    }),
  );
  await runWith(b.e, tickRun({ memo: freshRestMemo() }).pipe(Effect.provide(headless)));
  assert.ok(readRun(child.id).steps.implement.taskId, 'filed: its parent reads shipped');
  assert.notEqual(git(repo, 'rev-parse', 'main').trim(), child.baseRef, 'the base moved past where the child was started');
  assert.equal(readRun(child.id).baseRef, child.baseRef, 'and the child keeps the base it was started on: the pass read no head of it');
});

test(
  'REFUSED at the shipped deadline: a standing whose git never answers is stopped at 15 s, and its repository reads unread on that pass',
  WAITED,
  async (t) => {
    const { b } = await theStore();
    const bin = scratch('wf-pass-reads-hung-');
    fs.writeFileSync(path.join(bin, 'git'), '#!/bin/sh\nexec sleep 600\n', { mode: 0o755 });
    const deaf = gitPlace({ env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}` } });
    const hung = PlaceService.layer(placeSplit(shippedGitPlace, deaf, ['standing']));
    const clock = steeredClock();
    let ended = false;
    const pass = runWith(b.e, tickRun({ memo: freshRestMemo() }).pipe(Effect.provide(hung), Effect.provide(clock.layer))).then(
      () => void (ended = true),
    );
    const drained = async (): Promise<void> => {
      if (ended) return;
      await clock.adjust(1_000);
      return drained();
    };
    t.after(drained);
    await until(t, () => clock.asked.length > 0, 'the standing is asked under its deadline', { bell: clock.bell });
    assert.deepEqual([...new Set(clock.asked)], [15_000], 'the deadline is the shipped fifteen seconds, for each repository');
    await clock.adjust(14_999);
    assert.deepEqual([clock.woken, ended], [[], false], 'a millisecond before the deadline, the pass still waits on its git');
    await clock.adjust(1);
    assert.ok(clock.woken.includes(15_000), 'at 15 s the deadline fires');
    await until(t, () => ended || clock.adjust(20).then(() => ended), 'the pass ends once its git is stopped', { everyMs: 5 });
    await pass;
    const places = readStanding()?.places ?? [];
    assert.ok(places.length > 0, 'the pass read a repository');
    for (const p of places)
      assert.match('unread' in p ? p.unread : 'answered', /^the place was not heard: it gave no answer within 15 s, its deadline/);
  },
);

test("a pass where no branch moved asks no distance from a run's base: a kept memo lists base's alone, a restart each base once", async () => {
  const { b, repo } = await theStore();
  await settledOne(b, repo, 'succeeded');
  git(repo, 'commit', '-q', '--allow-empty', '-m', 'main moves on');
  await settledOne(b, repo, 'succeeded');
  await onePass(b);
  const planted = plantedGit(process.env);
  const was = process.env.PATH;
  process.env.PATH = planted.env.PATH;
  try {
    const columns = async (memo: ReturnType<typeof freshRestMemo>) => {
      const before = planted.said().length;
      await runWith(b.e, tickRun({ memo }));
      return columnsListed(planted.said().slice(before))
        .filter((n) => n > 0)
        .sort((a, b) => a - b);
    };
    const kept = freshRestMemo();
    const cold = await columns(kept);
    const read = readStanding()?.places.map((p) => ({ ...p, at: undefined }));
    assert.ok(cold.length > 0 && cold.every((n) => n > 1), `base's column and one for each base of the runs: ${cold}`);
    assert.ok(Math.max(...cold) > 2, `the runs on main were cut at more than one base: ${cold}`);
    assert.deepEqual(
      await columns(kept),
      cold.map(() => 1),
      "nothing moved: base's column alone, for each standing",
    );
    assert.deepEqual(
      readStanding()?.places.map((p) => ({ ...p, at: undefined })),
      read,
      'and the same reading',
    );
    assert.deepEqual(await columns(freshRestMemo()), cold, 'a restart asks each base once');
  } finally {
    process.env.PATH = was;
  }
});

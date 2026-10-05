/**
 * What one pass of the tick reads, counted on a store of runs not at rest: each task's view once a pass (`reportedEngine`), the cap's slots
 * once a pass and only where a claim on a repository's checkout waits on one (`passRead`, `checkoutHold`), each run another waits on once a
 * pass (`Parents`), and a run's asks folder listed once a read (`readAsks`, `readRun`). Identities on the reads, never a time.
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
import type { Engine } from 'agent-runtime';
import type { Run, TaskPhase } from '../src/run.ts';
import { scratch } from './scratch.ts';
import { TEAM, TEAM_DEV } from './team.ts';

const ROOT = scratch('wf-pass-reads-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
process.env.WF_MAX_RUNS = '40';
delete process.env.WF_MAX_CONCURRENT;
const { advance, approve, hold, retry, start, tick } = await import('../src/runner.ts');
const { acceptFile, askFile, asksDir, readAsks, readRun, roundAskFile, stepsOf } = await import('../src/record/record.store.ts');
const { passRead } = await import('../src/cap/cap.verb.ts');
const { checkoutHold } = await import('../src/ending/ending.verb.ts');
const { passParents } = await import('../src/views/views.verb.ts');
const { metered } = await import('../src/meter/tally.store.ts');
const { runStore } = await import('../src/record/files.store.ts');
const { freshRestMemo } = await import('../src/tick/tick.verb.ts');

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
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\n---\nimplement it\n');
  fs.writeFileSync(path.join(dir, 'ship.md'), SHIP_MD.replace(/^after: review$/m, 'after: implement'));
  return dir;
})();

/** One step, `implement`. */
const oneStep = (() => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-one-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\n---\nimplement it\n');
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
  } as unknown as Engine;
  const settle = (id: string, phase: TaskPhase, closeout?: unknown) => Object.assign(tasks.get(id)!, { phase, closeout });
  return { e, reads, writes, lists, settle };
};

/** A run of `implement → ship` on `repo`, implement committed and signed: at the ending's gate. */
const atTheGate = async (b: ReturnType<typeof board>, repo: string): Promise<Run> => {
  const run = start({ brief: 'add sub', repo, workflowDir: shipFolder });
  await advance(b.e, readRun(run.id));
  const work = readRun(run.id).steps.implement;
  fs.appendFileSync(path.join(work.workspace!, 'add.ts'), `export const sub${run.id.slice(-4)} = 1;\n`);
  git(work.workspace!, 'add', '-A');
  git(work.workspace!, 'commit', '-q', '-m', 'add sub');
  b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await advance(b.e, readRun(run.id));
  return readRun(run.id);
};

/** A run of one step on `repo`, filed and settled `phase`. */
const settledOne = async (b: ReturnType<typeof board>, repo: string, phase: TaskPhase): Promise<Run> => {
  const run = start({ brief: 'one', repo, workflowDir: oneStep });
  await advance(b.e, readRun(run.id));
  b.settle(`${run.id}-implement`, phase, phase === 'succeeded' ? SIGNED : undefined);
  await advance(b.e, readRun(run.id));
  return readRun(run.id);
};

/** Two runs started `--after` `parent`, and one held until it. */
const waitingOn = async (b: ReturnType<typeof board>, repo: string, parent: string) => {
  for (let i = 0; i < 2; i++) start({ brief: `after ${i}`, repo, workflowDir: oneStep, after: [parent] });
  const held = start({ brief: 'held', repo, workflowDir: oneStep });
  await hold(b.e, held.id, [parent]);
};

/** The store of runs not at rest the header names, on one repository and one board. */
const store = async () => {
  const b = board();
  const repo = aRepo();
  for (let i = 0; i < 3; i++) {
    const failed = await atTheGate(b, repo);
    await approve(b.e, failed.id, 'ship');
    assert.deepEqual((await advance(b.e, readRun(failed.id))).filed, ['ship'], 'the checkout is free for it');
    b.settle(`${failed.id}-ship`, 'failed');
    await advance(b.e, readRun(failed.id));
  }
  const working = await atTheGate(b, repo);
  await approve(b.e, working.id, 'ship');
  assert.deepEqual((await advance(b.e, readRun(working.id))).filed, ['ship'], "its ending is filed into the repository's checkout");
  const waiting = await atTheGate(b, repo);
  await approve(b.e, waiting.id, 'ship');
  const second = await atTheGate(b, repo);
  await approve(b.e, second.id, 'ship');
  await waitingOn(b, repo, waiting.id);
  const trying = await settledOne(b, repo, 'failed');
  for (const n of [2, 3]) {
    await retry(b.e, trying.id, 'implement', { mode: 'fresh' });
    await advance(b.e, readRun(trying.id));
    if (n === 2) b.settle(readRun(trying.id).steps.implement.taskId!, 'failed');
  }
  for (let i = 0; i < 10; i++) await settledOne(b, repo, 'succeeded');
  return { b, repo, waiting };
};

/** The one store every test reads, built on first use: a board settles only the tasks it filed, so each test's store is the same. */
let built: ReturnType<typeof store> | undefined;
const theStore = () => (built ??= store());

/** One pass of the tick over the store, metered, a fresh memo of runs at rest given so every run is judged in full. */
const onePass = async (b: ReturnType<typeof board>) => {
  b.reads.clear();
  b.writes.clear();
  const { value, tallies } = await metered(() => tick(b.e, { memo: freshRestMemo() }));
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
  const read = passRead(b.e, runStore.runs.list());
  b.lists.calls = 0;
  const first = await read.slots();
  const second = await read.slots();
  assert.equal(b.lists.calls, 1, 'one look at the tasks');
  assert.equal(second, first, 'the same slots, not read again');
});

test("a run's own claim on the checkout reads the slot its pass gave it, and the cap for no one", async () => {
  const { b, waiting } = await theStore();
  const run = readRun(waiting.id);
  let asked = 0;
  const slots = async () => {
    asked++;
    return new Map();
  };
  const hold = await checkoutHold(b.e, run, stepsOf(run), { read: { runs: [run], slots, parents: passParents() }, slot: undefined });
  assert.equal(hold, undefined, 'no other run claims the checkout in what the pass listed');
  assert.equal(asked, 0, "the cap's slots are not read for the run's own claim");
});

test('a pass spends no git process more for more runs waiting on the same run', async () => {
  const { b, repo, waiting } = await theStore();
  const before = (await onePass(b)).tallies.kinds.git.spawned;
  await waitingOn(b, repo, waiting.id);
  await waitingOn(b, repo, waiting.id);
  const after = (await onePass(b)).tallies.kinds.git.spawned;
  assert.ok(before > 0, 'the pass asked git');
  assert.equal(after, before, 'each run waited on is read once for the pass, over one listing of branches per repository');
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

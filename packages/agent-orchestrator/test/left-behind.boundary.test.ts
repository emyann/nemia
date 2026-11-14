/**
 * The daemon's free sweep as the backstop behind the runtime (`freeOnce`, `endLeftBehind`): a process a finished run's session started
 * and left running is ended by one sweep, a SIGTERM it ignores followed by a SIGKILL once the grace passed, and the feed holds one store
 * line saying so (`LeftEnded`); a process no session of the run started, working in a finished run's worktree, is never ended, and holds
 * the worktree, which is not freed while it runs, said once; a process of a run in flight is none of the sweep's. Real processes and
 * real signals, on this host's `/proc`.
 *
 * A process is told a run's by a folder of this store its environment names (`WF_STEP_FILES`, a check's `WF_ARTIFACTS`), never by a
 * bare `WF_RUN`, which names no store: one carrying the finished run's id alone, as another store's check of a run of that id would,
 * is never ended. Each child is ended by its pid in `t.after`.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { Logger, Effect, References } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { scratch } from 'test-kit/scratch';
import { eachTest, runOver } from './placed.ts';
import { runWith as runEngine, gitPlaceLayer } from '../src/runner.ts';
import { engineOf } from '../src/runtime-client.ts';
import { freeOnce, freshFreeMemory } from '../src/forget/prune/free.verb.ts';
import { readFeed } from '../src/feed/feed.store.ts';
import type { Answered } from '../src/forget/prune/prune.ts';
import type { Env } from '../src/config/config.store.ts';

const ROOT = fs.realpathSync(scratch('wf-left-'));
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

const ENV: Env = { ...process.env, WF_ROOT: ROOT, WF_KEEP_WORKTREES: undefined };
const engine = eachTest(testEngine);
const runWith = runOver(runEngine, gitPlaceLayer, ENV);

/** A short grace, the parameter the shipped `LEFT_GRACE` is the default of. */
const GRACE = '100 millis';

/** A run id of this test alone. */
const runId = (name: string): string => `${name}-${randomUUID().slice(0, 8)}`;

/** A run a pass answered, as far as the sweep reads it: its id, its status, and whether the pass found it at rest. */
const answered = (id: string, status: Answered['status'], atRest: boolean): Answered => ({
  run: { id, steps: {} } as never,
  status,
  feed: atRest ? { atRest: true } : {},
});

/**
 * A detached `node` that ignores SIGTERM, working in `cwd` with the variables `marks` (and none of the run's that the test process
 * carries), ended by its pid when the test ends. Answers once it has taken its SIGTERM handler, so a SIGTERM that ends it is a bug.
 */
async function leftChild(t: TestContext, cwd: string, marks: Record<string, string>): Promise<ChildProcess> {
  const env: Record<string, string | undefined> = {
    ...process.env,
    WF_RUN: undefined,
    WF_STEP_FILES: undefined,
    WF_ARTIFACTS: undefined,
    ...marks,
  };
  const child = spawn(
    process.execPath,
    ['-e', "process.on('SIGTERM', () => {}); process.stdout.write('ready\\n'); setInterval(() => {}, 1000);"],
    { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'ignore'] },
  );
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  });
  const [chunk] = (await once(child.stdout ?? child, 'data')) as [Buffer];
  assert.match(String(chunk), /ready/);
  return child;
}

/** Whether `pid` runs no more: gone from `/proc`, or a zombie left for its parent to reap. */
const ended = (pid: number): boolean => {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    return stat.slice(stat.lastIndexOf(')') + 2).startsWith('Z');
  } catch {
    return true;
  }
};

/** One sweep over `answers`, with what it logged. */
async function sweep(answers: readonly Answered[], memory: ReturnType<typeof freshFreeMemory>) {
  const logged: string[] = [];
  const keeper = Logger.make(({ message }) => void logged.push((Array.isArray(message) ? message : [message]).join(' ')));
  const done = await runWith(
    engineOf(engine().layer),
    freeOnce(answers, memory, GRACE).pipe(
      Effect.provide(Logger.layer([keeper])),
      Effect.provideService(References.MinimumLogLevel, 'Info'),
    ),
  );
  return { ...done, logged };
}

test("a finished run's left process is ended; a stranger in a finished worktree holds it; a run in flight is untouched", async (t) => {
  const left = runId('left');
  const held = runId('held');
  const busy = runId('busy');

  const leftTree = path.join(ROOT, 'worktrees', left, 'repo');
  fs.mkdirSync(leftTree, { recursive: true });
  const orphan = await leftChild(t, leftTree, { WF_STEP_FILES: path.join(ROOT, 'runs', left, 'artifacts', 'x') });
  const check = await leftChild(t, ROOT, { WF_RUN: left, WF_ARTIFACTS: path.join(ROOT, 'runs', left, 'artifacts', 'review') });
  const otherStore = await leftChild(t, ROOT, { WF_RUN: left });
  fs.rmSync(path.join(ROOT, 'worktrees', left), { recursive: true, force: true });

  const heldTree = path.join(ROOT, 'worktrees', held, 'repo');
  fs.mkdirSync(heldTree, { recursive: true });
  const stranger = await leftChild(t, heldTree, {});

  const busyTree = path.join(ROOT, 'worktrees', busy, 'repo');
  fs.mkdirSync(busyTree, { recursive: true });
  const working = await leftChild(t, busyTree, { WF_STEP_FILES: path.join(ROOT, 'runs', busy, 'artifacts', 'x') });

  const answers = [answered(left, 'succeeded', true), answered(held, 'cancelled', true), answered(busy, 'running', false)];
  const memory = freshFreeMemory();
  const first = await sweep(answers, memory);

  assert.ok(orphan.pid !== undefined && stranger.pid !== undefined && working.pid !== undefined);
  assert.ok(check.pid !== undefined && otherStore.pid !== undefined);
  assert.equal(ended(orphan.pid), true, "the finished run's left process, which ignores SIGTERM, is ended within the sweep");
  assert.equal(ended(check.pid), true, "what its check left, told by the check's WF_ARTIFACTS under this store, is ended too");
  assert.equal(ended(otherStore.pid), false, 'a bare WF_RUN of the same id, which names no store, is never ended');
  assert.equal(ended(stranger.pid), false, 'a process no session of the run started is never ended');
  assert.equal(ended(working.pid), false, 'a process of a run in flight is none of the sweep');

  const lines = readFeed(ROOT).lines.filter((l) => l.reason === 'LeftEnded');
  assert.equal(lines.length, 1, 'one store line for the one run whose processes were ended');
  const [line] = lines;
  assert.equal(line?.involved?.kind, 'Store');
  assert.equal(line?.type, 'Warning');
  assert.equal(line?.source, 'daemon');
  assert.equal(line?.labels?.run, left);
  assert.ok(line?.note?.includes(left), 'the note names the run');
  assert.ok(line?.note?.includes(String(orphan.pid)), 'the note names the pid it ended');
  assert.ok(line?.note?.includes(String(check.pid)), "and the check's");

  assert.ok(fs.existsSync(path.join(ROOT, 'worktrees', held)), 'a worktree a process works in is not freed');
  assert.deepEqual(first.freed, []);
  const heldSaid = first.said.filter((s) => s.startsWith(held));
  assert.equal(heldSaid.length, 1, 'the held worktree is said');
  assert.ok(heldSaid[0]?.includes(String(stranger.pid)), 'its words name the process that holds it');

  const second = await sweep(answers, memory);
  assert.deepEqual(
    second.said.filter((s) => s.startsWith(held)),
    [],
    'said once while its words stand',
  );
  assert.equal(readFeed(ROOT).lines.filter((l) => l.reason === 'LeftEnded').length, 1, 'nothing more is ended, nor written');
  assert.ok(fs.existsSync(path.join(ROOT, 'worktrees', held)), 'still held');
  assert.equal(ended(stranger.pid), false);
});

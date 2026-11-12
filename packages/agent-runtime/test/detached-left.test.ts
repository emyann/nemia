/**
 * A detached run whose worker is slow is not dead, and what a run the runtime calls ended leaves behind is stopped — against the REAL
 * worker, with `sh` as the harness.
 *
 * What the tests below rest on:
 * - A worker held before it starts stands for one slow to write its first beat under load: the memory scope's program is stood in by a
 *   script (`scopeProgram`) that answers the probe as a scope would, and runs the worker, as itself (`exec`), only once a gate file is
 *   there. Until then the run file is the spawn's (`pid: 0`), and the spawn's `.launched` names the held process.
 * - The lease is passed by stepping this process's monotonic clock (`stepMono`), never waited out; a stop's grace is the runner's
 *   short `stopGraceMs`, passed by a longer step once the first is taken back: a step taken over another is undone at the test's end
 *   to the first, so steps are never stacked.
 * - A harness that leaves processes behind in its group (`sleep 600`) is bounded by the test: its group is killed when the test ends.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import { detachedOps, STALE_MS, type HarnessSpec } from '../src/harness/detached/detached.ts';
import { Engine } from '../src/index.ts';
import { RunnerError } from '../src/harness/seam.ts';
import type { SessionState } from '../src/core/session.ts';
import type { Sighting } from '../src/core/domain.ts';
import { processStart } from '../src/process/alive.ts';
import { monoNow } from '../src/core/engine/now.ts';
import { scratch } from 'test-kit/scratch';
import { stepMono } from './clock.ts';
import { builtEngine } from './engine.ts';
import { until, WAITED, type Waiter } from '../src/waits/index.ts';

const sh = (script: string): HarnessSpec => ({ name: 'sh', can: [], command: () => ({ cmd: 'sh', args: ['-c', script] }) });
const safe = (name: string) => name.replace(/[^a-zA-Z0-9]+/g, '_');
const fileOf = (dir: string, name: string, end: string) => path.join(dir, 'runs', 'sh', `${safe(name)}${end}`);
const QUICK = { stopGraceMs: 300, beatMs: 200 } as const;

type Written = { pid: number; state: string; harness?: { pid: number; start?: string } };
const runOf = (dir: string, name: string): Written | undefined => {
  try {
    return JSON.parse(fs.readFileSync(fileOf(dir, name, '.json'), 'utf8')) as Written;
  } catch {
    return undefined;
  }
};

/** Whether `pid`, or the group it leads (`-pid`), still holds a process: signal 0 reaches it. */
const there = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** Kills the group `pid` leads when the test ends, whatever became of it: a test that fails leaves no `sleep 600` behind. */
const bounded = (t: TestContext, pid: number) =>
  t.after(() => {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {}
  });

const observed = async (ops: ReturnType<typeof detachedOps>, name: string) => (await Effect.runPromise(ops.observe)).get(name);

const settle = (t: Waiter, ops: ReturnType<typeof detachedOps>, name: string, want: SessionState) => {
  let last: Sighting | undefined;
  return until(
    t,
    async () => {
      last = await observed(ops, name);
      return last?.state === want && last;
    },
    () => `${name} ${want}; last was ${last?.state ?? 'nothing'}`,
    { everyMs: 100 },
  );
};

/** The harness's group as its worker wrote it on the run file, once it has. */
const harnessOf = async (t: Waiter, dir: string, name: string) => {
  let harness = 0;
  let worker = 0;
  await until(
    t,
    () => {
      const run = runOf(dir, name);
      harness = run?.harness?.pid ?? 0;
      worker = run?.pid ?? 0;
      return harness > 0 && worker > 0;
    },
    `${name}'s worker writes its harness`,
    { everyMs: 50 },
  );
  return { harness, worker };
};

/**
 * A scope's program stood in (`scopeProgram`): it answers the probe a scope's `memory.max` of 256Mi, and runs anything else as itself,
 * once `gate` is there.
 */
const heldScope = (dir: string) => {
  const gate = path.join(dir, 'gate');
  const program = path.join(dir, 'scope.sh');
  fs.writeFileSync(
    program,
    [
      '#!/bin/sh',
      'while [ "$1" != "--" ]; do shift; done; shift',
      'if [ "$1" = sh ] && [ "$2" = -c ]; then echo 268435456; exit 0; fi',
      `while [ ! -e '${gate}' ]; do sleep 0.05; done`,
      'exec "$@"',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  return { program, open: () => fs.writeFileSync(gate, '') };
};

/** A run of `script` spawned under a held scope: its store, ops, the gate's opener, and the pid of the held worker the spawn recorded. */
const spawnHeld = async (t: TestContext, name: string, script: string) => {
  const dir = scratch('ae-left-');
  const scope = heldScope(dir);
  const ops = detachedOps(sh(script), dir, { ...QUICK, scopeProgram: scope.program });
  await Effect.runPromise(ops.spawn({ name, brief: 'x', cwd: dir, resources: { limits: { memory: '256Mi' } } }));
  const launched = JSON.parse(fs.readFileSync(fileOf(dir, name, '.launched'), 'utf8')) as { pid: number };
  t.after(() => {
    scope.open();
    try {
      process.kill(launched.pid, 'SIGKILL');
    } catch {}
  });
  return { dir, ops, open: scope.open, held: launched.pid };
};

test('slow is not dead: a stale beat is failed only once the worker the spawn launched is gone', WAITED, async (t) => {
  await t.test('a worker whose first beat comes 40 s late on a live pid stays working, then completes', async (sub) => {
    const { dir, ops, open, held } = await spawnHeld(sub, 'ae/l1/1', 'exit 0');
    assert.equal(runOf(dir, 'ae/l1/1')?.pid, 0, 'the worker is held: the run file is the spawn’s');
    assert.ok(there(held), 'and the process the spawn launched is there');
    const undo = stepMono(sub, STALE_MS + 10_000);
    assert.equal((await observed(ops, 'ae/l1/1'))?.state, 'working', 'a beat 40 s late on a live worker is slow, not dead');
    undo();
    open();
    await settle(sub, ops, 'ae/l1/1', 'completed');
  });

  await t.test('a worker whose process is gone with a stale beat reads failed', async (sub) => {
    const { ops, held } = await spawnHeld(sub, 'ae/l2/1', 'exit 0');
    process.kill(held, 'SIGKILL');
    await until(sub, () => !there(held), 'the held worker is gone', { everyMs: 20 });
    stepMono(sub, STALE_MS + 10_000);
    assert.equal((await observed(ops, 'ae/l2/1'))?.state, 'failed');
  });

  await t.test('a stale beat whose recorded worker is another process now, or of another boot, reads failed', async () => {
    const dir = scratch('ae-left-');
    const ops = detachedOps(sh('true'), dir);
    fs.mkdirSync(path.join(dir, 'runs', 'sh'), { recursive: true });
    const name = 'ae/l3/1';
    fs.writeFileSync(
      fileOf(dir, name, '.json'),
      JSON.stringify({
        name,
        state: 'working',
        pid: 0,
        logFile: '/dev/null',
        heartbeatAt: new Date(Date.now() - STALE_MS - 60_000).toISOString(),
      }),
    );
    const boot = monoNow()?.boot;
    const start = processStart(process.pid);
    assert.ok(boot && start, 'this machine says its boot and a process’s start');
    const rows: Array<[string, object, SessionState]> = [
      ['the very process, in this boot', { pid: process.pid, start, boot }, 'working'],
      ['its pid taken by a process that started at another time', { pid: process.pid, start: `${start}0`, boot }, 'failed'],
      ['another boot', { pid: process.pid, start, boot: `${boot}-another` }, 'failed'],
    ];
    for (const [why, launched, want] of rows) {
      fs.writeFileSync(fileOf(dir, name, '.launched'), JSON.stringify(launched));
      assert.equal((await observed(ops, name))?.state, want, why);
    }
  });
});

test('what is called dead is stopped: what an ended run left in its harness group is ended', WAITED, async (t) => {
  await t.test('a person’s stop of a run whose worker is gone ends its harness group', async (sub) => {
    const dir = scratch('ae-left-');
    const ops = detachedOps(sh('sleep 600 & sleep 600'), dir, QUICK);
    await Effect.runPromise(ops.spawn({ name: 'ae/l4/1', brief: 'x', cwd: dir }));
    const { harness, worker } = await harnessOf(sub, dir, 'ae/l4/1');
    bounded(sub, harness);
    process.kill(worker, 'SIGKILL');
    await until(sub, () => !there(worker), 'the worker is gone', { everyMs: 20 });
    stepMono(sub, STALE_MS + 10_000);
    assert.equal((await observed(ops, 'ae/l4/1'))?.state, 'failed');
    assert.ok(there(-harness), 'its harness runs on, orphaned');
    await Effect.runPromise(ops.stop('ae/l4/1'));
    await until(sub, () => !there(-harness), 'the harness group is gone', { everyMs: 20 });
  });

  await t.test('a harness group that ignores SIGTERM is killed by a stop asked again past the stop grace', async (sub) => {
    const dir = scratch('ae-left-');
    const ops = detachedOps(sh("trap '' TERM; sleep 600 & sleep 600"), dir, QUICK);
    await Effect.runPromise(ops.spawn({ name: 'ae/l5/1', brief: 'x', cwd: dir }));
    const { harness, worker } = await harnessOf(sub, dir, 'ae/l5/1');
    bounded(sub, harness);
    process.kill(worker, 'SIGKILL');
    await until(sub, () => !there(worker), 'the worker is gone', { everyMs: 20 });
    const undo = stepMono(sub, STALE_MS + 10_000);
    await Effect.runPromise(ops.stop('ae/l5/1'));
    await Effect.runPromise(ops.stop('ae/l5/1'));
    assert.ok(there(-harness), 'within the grace it is asked again with SIGTERM, which it ignores');
    undo();
    stepMono(sub, STALE_MS + 10_000 + QUICK.stopGraceMs + 1_000);
    await Effect.runPromise(ops.stop('ae/l5/1'));
    await until(sub, () => !there(-harness), 'the harness group is killed', { everyMs: 20 });
  });

  await t.test('release of a run that ended leaving a child fails while the child lives, ends it, and then succeeds', async (sub) => {
    const dir = scratch('ae-left-');
    const ops = detachedOps(sh('(trap "" HUP; sleep 600) & exit 0'), dir, QUICK);
    await Effect.runPromise(ops.spawn({ name: 'ae/l6/1', brief: 'x', cwd: dir }));
    const { harness } = await harnessOf(sub, dir, 'ae/l6/1');
    bounded(sub, harness);
    const ended = await settle(sub, ops, 'ae/l6/1', 'completed');
    assert.ok(there(-harness), 'the child it left runs on');
    const refused = await Effect.runPromise(Effect.flip(ops.release!(ended, {})));
    assert.ok(refused instanceof RunnerError, 'a release that left a process is asked again');
    await until(sub, () => !there(-harness), 'the child is gone', { everyMs: 20 });
    await Effect.runPromise(ops.release!(ended, {}));
  });

  await t.test('release of a run whose worker still runs sends nothing: its harness ends on its own, completed', async (sub) => {
    const dir = scratch('ae-left-');
    const go = path.join(dir, 'go');
    const ops = detachedOps(sh(`while [ ! -e '${go}' ]; do sleep 0.05; done; exit 0`), dir, QUICK);
    await Effect.runPromise(ops.spawn({ name: 'ae/l7/1', brief: 'x', cwd: dir }));
    const { harness } = await harnessOf(sub, dir, 'ae/l7/1');
    bounded(sub, harness);
    const working = await settle(sub, ops, 'ae/l7/1', 'working');
    await Effect.runPromise(ops.release!(working, {}));
    assert.ok(there(-harness), 'its harness runs on');
    fs.writeFileSync(go, '');
    const done = await settle(sub, ops, 'ae/l7/1', 'completed');
    assert.equal(done.exitCode, 0);
  });
});

test('an attempt the engine settles failed with its worker gone leaves no process of its harness group', WAITED, async (t) => {
  const store = scratch('ae-left-');
  const engine = builtEngine(Engine.layer({ root: store, harnesses: { sh: sh('sleep 600 & sleep 600') } }));
  const cwd = scratch('ae-left-cwd-');
  const id = await Effect.runPromise(engine.file({ brief: 'x', cwd, harness: 'sh' }));
  let pids: { harness: number; worker: number } | undefined;
  await until(
    t,
    async () => {
      await Effect.runPromise(engine.tick());
      const runs = path.join(store, 'runs', 'sh');
      const file = fs.existsSync(runs) ? fs.readdirSync(runs).find((f) => f.endsWith('.json')) : undefined;
      const run = file && (JSON.parse(fs.readFileSync(path.join(runs, file), 'utf8')) as Written);
      if (run && run.pid > 0 && run.harness) pids = { harness: run.harness.pid, worker: run.pid };
      return pids !== undefined;
    },
    'the attempt’s worker writes its harness',
    { everyMs: 50 },
  );
  if (!pids) throw new Error('unreachable: the wait above returns once the harness is written');
  const { harness, worker } = pids;
  bounded(t, harness);
  process.kill(worker, 'SIGKILL');
  await until(t, () => !there(worker), 'the worker is gone', { everyMs: 20 });
  stepMono(t, STALE_MS + 10_000);
  await until(
    t,
    async () => {
      await Effect.runPromise(engine.tick());
      return (await Effect.runPromise(engine.view(id))).state.settled !== null;
    },
    `${id} settled`,
    { everyMs: 50 },
  );
  const { state } = await Effect.runPromise(engine.view(id));
  assert.deepEqual([state.settled, state.attempts[0]?.reason], ['failed', 'harness']);
  await until(
    t,
    async () => {
      await Effect.runPromise(engine.tick());
      return !there(-harness);
    },
    'no process of its harness group is left',
    { everyMs: 50 },
  );
});

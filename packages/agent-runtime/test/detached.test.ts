/**
 * The detached runner, against the REAL worker — using `sh` as the harness, so it costs nothing. The worker needs a command and
 * an exit code, so anything that runs and exits is a harness to it.
 *
 * What the tests below rest on:
 * - A worker frozen by an `--import` hook, `SIGSTOP` around its first rename, stands for a stop that lands in a narrow window:
 *   the engine re-issues its stop every pass, and under load one can land the moment the worker has published its pid, or
 *   before. A worker that heard SIGTERM only later would die of it, and its harness run on under a run file that says
 *   `working` until the lease calls it dead. A worker continued before it has frozen freezes for good, so each test sees it
 *   stopped (`ps -o stat=`) first.
 * - A stop that finds no pid leaves its marker on disk, and the worker reads it before it starts the harness; a stop whose
 *   marker lands after the worker looked for it reads the pid again after it. That test holds the marker's write until the
 *   worker has gone on and started its harness, by which time the stop has read `pid: 0`.
 * - `stop` finds a worker by its run file, so a worker whose run file or store is taken away ends its harness itself. A harness
 *   that dies on SIGTERM can leave a child that ignores it holding its stdout past the worker's two-second drain: the worker
 *   kills it too, on a stop as on a run file taken away, within a heartbeat and five seconds of SIGTERM.
 * - Half a line, as a writer caught mid-append leaves it, is never written on as a line of its own; a wait longer than the
 *   worker's look at the inbox can only let that test pass wrongly under load, never fail it.
 * - A test that ticks the engine puts a fake `claude` on PATH: the `claude` harness is observed on every tick, and must not
 *   read this machine's registry.
 * - A resumed `claude -p` prints a `usage` of its own process, a cache rebuilt from nothing, beside a `modelUsage` that carries
 *   its parent's counts on.
 * - A filesystem's clock may keep time to the second, so a time read off a file is compared with a second's slack either side.
 * - A process a test kills in its `finally` may be gone already, and a file it polls may be mid-write or not there yet: the
 *   kill or the read that fails is passed over.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  detachedFind,
  detachedOps,
  STALE_MS,
  type HarnessIO,
  type HarnessOutput,
  type HarnessSpec,
} from '../src/harness/detached/detached.ts';
import { claudeResultOutput, claudeStreamOutput } from '../src/harness/detached/output.ts';
import { codex, trustedProjects } from '../src/harness/codex/codex.ts';
import { Engine } from '../src/index.ts';
import { execFileSync } from 'node:child_process';
import { composite } from '../src/harness/seam.ts';
import { RunnerError, testOps, type Observation } from '../src/harness/seam.ts';
import type { SessionState } from '../src/core/session.ts';
import type { Sighting } from '../src/core/domain.ts';
import { runningIn, scratch } from './scratch.ts';
import { warned } from './warned.ts';
import { stepClock } from './clock.ts';
import { FILES_STREAM, resultLine, SESSION, SKILLS_STREAM, stream } from './reader-streams.ts';
import { ioCounts } from '../src/core/engine/tally.ts';
import { monoNow } from '../src/core/engine/now.ts';
import { builtEngine } from './engine.ts';
import { until, WAITED, type Waiter } from './waits.ts';

const root = () => scratch('ae-detached-');
const sh = (script: string): HarnessSpec => ({ name: 'sh', command: () => ({ cmd: 'sh', args: ['-c', script] }) });
const req = (name: string, cwd: string) => ({ name, brief: 'x', cwd });

/** Looks at `name` in test `t`, every 150ms, until it is `want`; answers its sighting then. */
const settle = (t: Waiter, ops: ReturnType<typeof detachedOps>, name: string, want: SessionState) => {
  let last: Sighting | undefined;
  return until(
    t,
    async () => {
      last = (await Effect.runPromise(ops.observe)).get(name);
      return last?.state === want && last;
    },
    () => `${name} ${want}; last was ${last?.state ?? 'nothing'}`,
    { everyMs: 150 },
  );
};

/** Ticks `engine` in test `t`, every 100ms, until task `id` has settled. */
const ticked = (t: Waiter, engine: ReturnType<typeof builtEngine>, id: string) =>
  until(
    t,
    async () => {
      if ((await Effect.runPromise(engine.view(id))).state.settled) return true;
      await Effect.runPromise(engine.tick());
      return false;
    },
    `${id} settled`,
    { everyMs: 100 },
  );

test('a detached session runs, is observable while running, and reports success', WAITED, async (t) => {
  const dir = root();
  const ops = detachedOps(sh('sleep 1; echo done > out.txt; exit 0'), dir);
  await Effect.runPromise(ops.spawn(req('ae/t1/1', dir)));

  const running = (await Effect.runPromise(ops.observe)).get('ae/t1/1');
  assert.equal(running?.state, 'working', 'visible immediately, before it finishes');

  await settle(t, ops, 'ae/t1/1', 'completed');
  assert.equal(fs.readFileSync(path.join(dir, 'out.txt'), 'utf8').trim(), 'done');
});

test('a non-zero exit is a failure — the only signal a generic harness has to give', WAITED, async (t) => {
  const dir = root();
  const ops = detachedOps(sh('exit 3'), dir);
  await Effect.runPromise(ops.spawn(req('ae/t2/1', dir)));
  await settle(t, ops, 'ae/t2/1', 'failed');
});

test('the worker outlives the process that spawned it', WAITED, async (t) => {
  const dir = root();
  const ops = detachedOps(sh('sleep 2; exit 0'), dir);
  await Effect.runPromise(ops.spawn(req('ae/t3/1', dir)));

  await new Promise((r) => setTimeout(r, 500));
  assert.equal(
    (await Effect.runPromise(ops.observe)).get('ae/t3/1')?.state,
    'working',
    "`spawn` returns as soon as the child is unref'd: a worker tied to this process could not still be working",
  );
  await settle(t, ops, 'ae/t3/1', 'completed');
});

test('stop reaches the detached worker, which kills the harness and says so', WAITED, async (t) => {
  const dir = root();
  const ops = detachedOps(sh('sleep 30'), dir);
  await Effect.runPromise(ops.spawn(req('ae/t4/1', dir)));
  await settle(t, ops, 'ae/t4/1', 'working');

  await until(
    t,
    async () => {
      await Effect.runPromise(ops.stop('ae/t4/1'));
      return (await Effect.runPromise(ops.observe)).get('ae/t4/1')?.state === 'canceled';
    },
    'ae/t4/1 canceled, its stop re-issued',
    { everyMs: 200 },
  );
  assert.equal(
    (await Effect.runPromise(ops.observe)).get('ae/t4/1')?.state,
    'canceled',
    'a stop re-issued every pass, as the engine issues it, is heard',
  );
});

test('a stop that lands the moment the worker has published its pid is heard, not taken for a kill', WAITED, async (t) => {
  const dir = root();
  const hook = path.join(dir, 'freeze-after-publish.mjs');
  fs.writeFileSync(
    hook,
    [
      "import fs from 'node:fs';",
      "if (process.argv[1]?.endsWith('ae-worker.ts')) {",
      '  const rename = fs.renameSync;',
      "  fs.renameSync = (...a) => { fs.renameSync = rename; rename(...a); process.kill(process.pid, 'SIGSTOP'); };",
      '}',
    ].join('\n'),
  );
  const ops = detachedOps(sh('sleep 30'), dir);
  const was = process.env.NODE_OPTIONS;
  process.env.NODE_OPTIONS = `${was ?? ''} --import=${pathToFileURL(hook).href}`.trim();
  try {
    await Effect.runPromise(ops.spawn(req('ae/t4/2', dir)));
  } finally {
    if (was === undefined) delete process.env.NODE_OPTIONS;
    else process.env.NODE_OPTIONS = was;
  }

  const runFile = path.join(dir, 'runs', 'sh', 'ae_t4_2.json');
  const pidOf = () => {
    try {
      return (JSON.parse(fs.readFileSync(runFile, 'utf8')) as { pid: number }).pid;
    } catch {
      return 0;
    }
  };
  const frozen = (pid: number) => {
    try {
      return execFileSync('ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8' })
        .trim()
        .startsWith('T');
    } catch {
      return false;
    }
  };
  let pid = 0;
  let heard = false;
  try {
    await until(t, () => (pid = pidOf()) > 0, 'the worker publishes its pid', { everyMs: 20 });
    await until(t, () => frozen(pid), 'the worker freezes after its first write', { everyMs: 20 });
    await Effect.runPromise(ops.stop('ae/t4/2'));
    process.kill(pid, 'SIGCONT');
    await settle(t, ops, 'ae/t4/2', 'canceled');
    heard = true;
  } finally {
    if (pid > 0 && !heard)
      for (const sig of ['SIGCONT', 'SIGKILL'] as const)
        try {
          process.kill(pid, sig);
        } catch {}
  }
});

/** Alive: in the process table, and not a zombie waiting on its parent. */
const alive = (pid: number) => {
  try {
    return !execFileSync('ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8' })
      .trim()
      .startsWith('Z');
  } catch {
    return false;
  }
};
/** Until `ok` holds, in test `t`, looked at every 50ms. */
const within = (t: Waiter, ok: () => boolean, what: string) => until(t, ok, what, { everyMs: 50 });

for (const [what, takeAway] of [
  ['its run file', (_dir: string, file: string) => fs.rmSync(file)],
  ['the whole store', (dir: string) => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 })],
] as const) {
  test(
    `a worker whose session is taken away — ${what} removed — ends its harness and exits, and makes no run file again`,
    WAITED,
    async (t) => {
      const dir = root();
      const cwd = scratch('ae-harness-');
      const ops = detachedOps(sh('echo $$ > pid; exec sleep 30'), dir);
      await Effect.runPromise(ops.spawn(req('ae/g1/1', cwd)));
      const file = path.join(dir, 'runs', 'sh', 'ae_g1_1.json');
      let worker = 0;
      let harness = 0;
      await within(
        t,
        () => {
          try {
            worker = (JSON.parse(fs.readFileSync(file, 'utf8')) as { pid: number }).pid;
          } catch {}
          try {
            harness = Number(fs.readFileSync(path.join(cwd, 'pid'), 'utf8'));
          } catch {}
          return worker > 0 && harness > 0;
        },
        'the worker and its harness started',
      );

      takeAway(dir, file);
      await within(t, () => !alive(worker) && !alive(harness), 'the worker and its harness ended');
      assert.equal(fs.existsSync(file), false, 'the run file is not made again');
    },
  );
}

test(
  'a worker whose run file is taken away kills what of its harness ignored SIGTERM before it exits, holding its output or not',
  WAITED,
  async (t) => {
    const dir = root();
    const cwd = scratch('ae-harness-');
    const ops = detachedOps(sh("(trap '' TERM; : > started; while :; do sleep 1; done) & wait"), dir);
    await Effect.runPromise(ops.spawn(req('ae/g3/1', cwd)));
    await within(t, () => fs.existsSync(path.join(cwd, 'started')), 'the harness started');
    const worker = runningIn([dir]).find((p) => /\bae-worker\.ts\b/.test(p.args))!.pid;
    fs.rmSync(path.join(dir, 'runs', 'sh', 'ae_g3_1.json'));
    await within(t, () => !alive(worker) && runningIn([cwd]).length === 0, 'the worker and all of its harness ended');
  },
);

test('a stop kills what of its harness ignored SIGTERM before the worker exits, holding its output or not', WAITED, async (t) => {
  const dir = root();
  const cwd = scratch('ae-harness-');
  const ops = detachedOps(sh("(trap '' TERM; : > started; while :; do sleep 1; done) & wait"), dir);
  await Effect.runPromise(ops.spawn(req('ae/g3/2', cwd)));
  await within(t, () => fs.existsSync(path.join(cwd, 'started')), 'the harness started');
  const worker = runningIn([dir]).find((p) => /\bae-worker\.ts\b/.test(p.args))!.pid;
  await Effect.runPromise(ops.stop('ae/g3/2'));
  await within(t, () => !alive(worker) && runningIn([cwd]).length === 0, 'the worker and all of its harness ended');
  await settle(t, ops, 'ae/g3/2', 'canceled');
});

test('a worker whose run file is taken away while it writes words on ends its harness too — and a listener with it', WAITED, async (t) => {
  const dir = root();
  const ops = detachedOps(listener(dir), dir);
  await Effect.runPromise(ops.spawn({ name: 'ae/g2/1', brief: 'b', cwd: dir }));
  await within(t, () => heardIn(dir).length === 1, 'the brief read');
  assert.equal(runningIn([dir]).length, 2, 'the worker and the listener');
  fs.rmSync(path.join(dir, 'runs', 'in', 'ae_g2_1.json'));
  await within(t, () => runningIn([dir]).length === 0, 'the worker and the listener ended');
  assert.equal(fs.existsSync(path.join(dir, 'runs', 'in', 'ae_g2_1.json')), false, 'the run file is not made again');
});

/**
 * A worker spawned under a hook that freezes it just BEFORE its first rename: its status, pid and all, is in the run
 * file's `.tmp`, and the run file still says `pid: 0`. Answers the worker's pid, read off that `.tmp`, once it is seen frozen:
 * continued before it has frozen, it would freeze for good.
 */
const spawnFrozenBeforePublish = async (t: Waiter, ops: ReturnType<typeof detachedOps>, dir: string, name: string) => {
  const hook = path.join(dir, 'freeze-before-publish.mjs');
  fs.writeFileSync(
    hook,
    [
      "import fs from 'node:fs';",
      "if (process.argv[1]?.endsWith('ae-worker.ts')) {",
      '  const rename = fs.renameSync;',
      "  fs.renameSync = (...a) => { fs.renameSync = rename; process.kill(process.pid, 'SIGSTOP'); rename(...a); };",
      '}',
    ].join('\n'),
  );
  const was = process.env.NODE_OPTIONS;
  process.env.NODE_OPTIONS = `${was ?? ''} --import=${pathToFileURL(hook).href}`.trim();
  try {
    await Effect.runPromise(ops.spawn(req(name, dir)));
  } finally {
    if (was === undefined) delete process.env.NODE_OPTIONS;
    else process.env.NODE_OPTIONS = was;
  }
  const runFile = path.join(dir, 'runs', 'sh', `${name.replace(/[^a-zA-Z0-9]+/g, '_')}.json`);
  const read = (f: string) => {
    try {
      return (JSON.parse(fs.readFileSync(f, 'utf8')) as { pid: number }).pid;
    } catch {
      return 0;
    }
  };
  let pid = 0;
  await until(t, () => (pid = read(`${runFile}.tmp`)) > 0, 'the worker writes its status', { everyMs: 25 });
  await until(t, () => isFrozen(pid), 'the worker freezes before it publishes its pid', { everyMs: 25 });
  assert.equal(read(runFile), 0, 'the run file has no pid while the worker is frozen');
  return pid;
};
const isFrozen = (pid: number) => {
  try {
    return execFileSync('ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8' })
      .trim()
      .startsWith('T');
  } catch {
    return false;
  }
};
const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test('a stop that lands before the worker has published its pid is heard: the harness never starts', WAITED, async (t) => {
  const dir = root();
  const ran = path.join(dir, 'ran');
  const ops = detachedOps(sh(`touch ${ran}; sleep 30`), dir);
  const pid = await spawnFrozenBeforePublish(t, ops, dir, 'ae/t4/3');
  let heard = false;
  try {
    await Effect.runPromise(ops.stop('ae/t4/3'));
    process.kill(pid, 'SIGCONT');
    await settle(t, ops, 'ae/t4/3', 'canceled');
    await until(t, () => !isAlive(pid), 'the worker exits', { everyMs: 25 });
    heard = true;
  } finally {
    if (!heard) {
      for (const sig of ['SIGCONT', 'SIGKILL'] as const)
        try {
          process.kill(pid, sig);
        } catch {}
      await Effect.runPromise(ops.stop('ae/t4/3'));
    }
  }
  assert.equal(fs.existsSync(ran), false, 'the harness never ran');
  const seen = (await Effect.runPromise(ops.observe)).get('ae/t4/3')!;
  assert.equal(seen.exitCode, undefined, 'a harness never started has no exit code');
  const again = detachedOps(sh(`touch ${ran}; exit 0`), dir);
  await Effect.runPromise(again.spawn(req('ae/t4/3', dir)));
  await settle(t, again, 'ae/t4/3', 'completed');
  assert.equal(fs.existsSync(ran), true, 'a run spawned again after a stop starts its harness');
});

test('a stop whose marker lands after the worker looked for it finds the pid it published, and is heard', WAITED, async (t) => {
  const dir = root();
  const ran = path.join(dir, 'ran');
  const ops = detachedOps(sh(`touch ${ran}; sleep 30`), dir);
  const pid = await spawnFrozenBeforePublish(t, ops, dir, 'ae/t4/4');
  const write = fs.writeFileSync;
  let held = false;
  (fs as { writeFileSync: typeof fs.writeFileSync }).writeFileSync = (f: fs.PathOrFileDescriptor, ...rest: unknown[]) => {
    if (typeof f === 'string' && f.endsWith('.stop') && !held) {
      held = true;
      process.kill(pid, 'SIGCONT');
      const wait = new Int32Array(new SharedArrayBuffer(4));
      for (const bound = performance.now() + 10_000; !fs.existsSync(ran);) {
        if (performance.now() > bound) break;
        Atomics.wait(wait, 0, 0, 20);
      }
    }
    return (write as (...a: unknown[]) => void)(f, ...rest);
  };
  let heard = false;
  try {
    try {
      await Effect.runPromise(ops.stop('ae/t4/4'));
    } finally {
      fs.writeFileSync = write;
    }
    assert.equal(held, true, 'the stop wrote its marker');
    assert.equal(fs.existsSync(ran), true, 'the harness started before the marker was written');
    await settle(t, ops, 'ae/t4/4', 'canceled');
    heard = true;
  } finally {
    if (!heard) {
      for (const sig of ['SIGCONT', 'SIGKILL'] as const)
        try {
          process.kill(pid, sig);
        } catch {}
      await Effect.runPromise(ops.stop('ae/t4/4'));
    }
  }
});

test('THE LEASE: a run file whose heartbeat stopped is reported dead, not running', async () => {
  const dir = root();
  const ops = detachedOps(sh('true'), dir);
  const runs = path.join(dir, 'runs', 'sh');
  fs.mkdirSync(runs, { recursive: true });

  const write = (heartbeatAgoMs: number) =>
    fs.writeFileSync(
      path.join(runs, 'ae_t5_1.json'),
      JSON.stringify({
        name: 'ae/t5/1',
        state: 'working',
        pid: 999999,
        logFile: '/dev/null',
        heartbeatAt: new Date(Date.now() - heartbeatAgoMs).toISOString(),
      }),
    );

  write(1_000);
  assert.equal((await Effect.runPromise(ops.observe)).get('ae/t5/1')?.state, 'working', 'a fresh beat is alive');

  write(STALE_MS + 10 * 60_000);
  assert.equal((await Effect.runPromise(ops.observe)).get('ae/t5/1')?.state, 'failed', 'a stopped beat is dead');
});

test('THE LEASE runs on the monotonic clock: a live worker is working whatever the wall clock stepped', WAITED, async (t) => {
  const dir = root();
  const ops = detachedOps(sh('sleep 30'), dir);
  await Effect.runPromise(ops.spawn(req('ae/m1/1', dir)));
  await settle(t, ops, 'ae/m1/1', 'working');
  stepClock(t, STALE_MS + 30_000);
  assert.equal((await Effect.runPromise(ops.observe)).get('ae/m1/1')?.state, 'working', 'a wall clock stepped forward ends no lease');
  await Effect.runPromise(ops.stop('ae/m1/1'));
  await settle(t, ops, 'ae/m1/1', 'canceled');
});

test('THE LEASE refused on the monotonic clock: a beat 31s old in this boot is dead under a fresh heartbeatAt; one of another boot is read off heartbeatAt', async () => {
  const dir = root();
  const ops = detachedOps(sh('true'), dir);
  const runs = path.join(dir, 'runs', 'sh');
  fs.mkdirSync(runs, { recursive: true });
  const here = monoNow();
  assert.ok(here, 'this machine says its boot id');
  const write = (heartbeatAgoMs: number, beat: { boot: string; ms: number }) =>
    fs.writeFileSync(
      path.join(runs, 'ae_m2_1.json'),
      JSON.stringify({
        name: 'ae/m2/1',
        state: 'working',
        pid: 999999,
        logFile: '/dev/null',
        heartbeatAt: new Date(Date.now() - heartbeatAgoMs).toISOString(),
        beat,
      }),
    );
  const seen = async () => (await Effect.runPromise(ops.observe)).get('ae/m2/1')?.state;

  write(0, { boot: here.boot, ms: monoNow()!.ms - STALE_MS - 1_000 });
  assert.equal(await seen(), 'failed', 'a beat past the lease in this boot is dead, however fresh its heartbeatAt');
  write(0, { boot: here.boot, ms: monoNow()!.ms });
  assert.equal(await seen(), 'working', 'a fresh beat in this boot is alive');
  write(STALE_MS + 10 * 60_000, { boot: `${here.boot}-another`, ms: monoNow()!.ms });
  assert.equal(await seen(), 'failed', 'a beat of another boot is not compared: its heartbeatAt answers, and it is stale');
  write(0, { boot: `${here.boot}-another`, ms: 0 });
  assert.equal(await seen(), 'working', 'a beat of another boot is not compared: its heartbeatAt answers, and it is fresh');
});

test(
  'the spawn and the worker each beat on the monotonic clock of this boot, and every write of the worker beats again',
  WAITED,
  async (t) => {
    const dir = root();
    const ops = detachedOps(sh('sleep 30'), dir);
    await Effect.runPromise(ops.spawn(req('ae/m3/1', dir)));
    const file = path.join(dir, 'runs', 'sh', 'ae_m3_1.json');
    const read = () =>
      JSON.parse(fs.readFileSync(file, 'utf8')) as { pid: number; heartbeatAt: string; beat?: { boot: string; ms: number } };
    const spawned = read();
    assert.equal(spawned.pid, 0, 'read as the spawn wrote it, before the worker');
    assert.equal(spawned.beat?.boot, monoNow()?.boot, 'the spawn beats in this boot');
    await settle(t, ops, 'ae/m3/1', 'working');
    let worker = read();
    await until(
      t,
      () => {
        try {
          worker = read();
        } catch {}
        return worker.pid !== 0;
      },
      'the worker publishes its pid',
      { everyMs: 50 },
    );
    assert.equal(worker.beat?.boot, monoNow()?.boot, 'the worker beats in this boot');
    assert.ok(worker.beat!.ms > spawned.beat!.ms, 'the worker writes a beat of its own, not the one the spawn left');
    let later = worker;
    await until(
      t,
      () => {
        try {
          later = read();
        } catch {}
        return later.heartbeatAt !== worker.heartbeatAt;
      },
      'the worker writes its run file again',
      { everyMs: 100 },
    );
    assert.ok(later.beat!.ms > worker.beat!.ms, 'a later write beats again, not only the first');
    await Effect.runPromise(ops.stop('ae/m3/1'));
    await settle(t, ops, 'ae/m3/1', 'canceled');
  },
);

test('logs come back from the worker capture', WAITED, async (t) => {
  const dir = root();
  const ops = detachedOps(sh('echo hello-from-the-harness; exit 0'), dir);
  await Effect.runPromise(ops.spawn(req('ae/t6/1', dir)));
  await settle(t, ops, 'ae/t6/1', 'completed');
  assert.match(await Effect.runPromise(ops.logs('ae/t6/1')), /hello-from-the-harness/);
});

/**
 * A harness that reads its messages on its stdin: each line it reads is appended to `heard` in its cwd; `end` makes it
 * print its closing line, and `end and linger` the same, after which it runs on for a minute once its stdin ends; its
 * stdin ended, it writes `EOF` and exits. Nothing ending its stdin, it exits after two minutes all the same: a test killed
 * before its hooks run leaves nobody to stop it.
 */
const listener = (dir: string): HarnessSpec => {
  const script = path.join(dir, 'listener.cjs');
  fs.writeFileSync(
    script,
    `
const fs = require('node:fs');
setTimeout(() => process.exit(0), 120_000).unref();
let got = '', linger = false;
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => {
  got += d;
  for (let nl = got.indexOf('\\n'); nl !== -1; nl = got.indexOf('\\n')) {
    const line = got.slice(0, nl);
    got = got.slice(nl + 1);
    fs.appendFileSync('heard', line + '\\n');
    const said = JSON.parse(line).said;
    if (said === 'end' || said === 'end and linger') {
      linger = said === 'end and linger';
      process.stdout.write(JSON.stringify({ n: 1, kind: 'end' }) + '\\n');
    }
  }
});
process.stdin.on('end', () => { fs.appendFileSync('heard', 'EOF\\n'); setTimeout(() => process.exit(0), linger ? 60_000 : 0); });
`,
  );
  return {
    name: 'in',
    command: () => ({ cmd: process.execPath, args: [script] }),
    input: { line: (text) => JSON.stringify({ said: text }), closesOn: { key: 'kind', value: 'end' } },
  };
};

const heardIn = (cwd: string) => {
  try {
    return fs
      .readFileSync(path.join(cwd, 'heard'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => (l === 'EOF' ? l : (JSON.parse(l).said as string)));
  } catch {
    return [];
  }
};
/** Until `ok` holds, in test `t`, looked at every 25ms. */
const listened = (t: Waiter, ok: () => boolean, what: string) => until(t, ok, what, { everyMs: 25 });
const runOf = (dir: string, name: string) =>
  JSON.parse(fs.readFileSync(path.join(dir, 'runs', 'in', `${name.replace(/[^a-zA-Z0-9]+/g, '_')}.json`), 'utf8')) as {
    state: string;
    inputAt?: number;
    inputClosed?: true;
    input?: { from: number };
  };
const inboxOf = (dir: string, name: string) => path.join(dir, 'runs', 'in', `${name.replace(/[^a-zA-Z0-9]+/g, '_')}.inbox.jsonl`);
const say = (ops: ReturnType<typeof detachedOps>, name: string, text: string) =>
  Effect.runPromise(ops.say!({ name, sessionId: name }, text));
/** Says `text` to `name`, and asserts it is refused with a message that matches `pattern`, for the reason `why`. */
const sayRefused = async (ops: ReturnType<typeof detachedOps>, name: string, text: string, pattern: RegExp, why?: string) => {
  const e = await Effect.runPromise(Effect.flip(ops.say!({ name, sessionId: name }, text)));
  assert.match(e.message, pattern, why);
};
const stopped = async (t: Waiter, ops: ReturnType<typeof detachedOps>, name: string) => {
  await Effect.runPromise(ops.stop(name));
  await settle(t, ops, name, 'canceled');
};

test(
  "a harness that reads its stdin is given its brief's line first, then each word said, in order — and a line half appended waits for its end",
  WAITED,
  async (t) => {
    const dir = root();
    const ops = detachedOps(listener(dir), dir);
    await Effect.runPromise(ops.spawn({ name: 'ae/i1/1', brief: 'the brief', cwd: dir }));
    await listened(t, () => heardIn(dir).length === 1, 'the brief read');
    await say(ops, 'ae/i1/1', 'first');
    await say(ops, 'ae/i1/1', 'second');
    await listened(t, () => heardIn(dir).length === 3, 'the words read');
    assert.deepEqual(heardIn(dir), ['the brief', 'first', 'second']);
    assert.equal(runOf(dir, 'ae/i1/1').inputAt, fs.statSync(inboxOf(dir, 'ae/i1/1')).size, 'how far it has written on, on the run file');

    fs.appendFileSync(inboxOf(dir, 'ae/i1/1'), '{"said":"par');
    await new Promise((r) => setTimeout(r, 1_200));
    fs.appendFileSync(inboxOf(dir, 'ae/i1/1'), 'ted"}\n');
    await listened(t, () => heardIn(dir).length === 4, 'the line once whole');
    assert.equal(heardIn(dir)[3], 'parted', 'written on whole, once');
    await stopped(t, ops, 'ae/i1/1');
  },
);

test(
  'the closing line closes its input: said on the run file, its stdin ended, and nothing appended after it written on — nor taken by say',
  WAITED,
  async (t) => {
    const dir = root();
    const ops = detachedOps(listener(dir), dir);
    await Effect.runPromise(ops.spawn({ name: 'ae/i2/1', brief: 'b', cwd: dir }));
    await listened(t, () => heardIn(dir).length === 1, 'the brief read');
    await say(ops, 'ae/i2/1', 'end and linger');
    await listened(t, () => heardIn(dir).includes('EOF'), 'its stdin ended at its closing line');
    const run = runOf(dir, 'ae/i2/1');
    assert.equal(run.inputClosed, true);
    assert.equal(run.state, 'working', 'still running: it ends when it likes');

    await sayRefused(ops, 'ae/i2/1', 'more', /^in: `ae\/i2\/1` has given its result and reads no more words/);
    const size = fs.statSync(inboxOf(dir, 'ae/i2/1')).size;
    fs.appendFileSync(inboxOf(dir, 'ae/i2/1'), '{"said":"behind its back"}\n');
    await new Promise((r) => setTimeout(r, 1_200));
    assert.deepEqual(heardIn(dir), ['b', 'end and linger', 'EOF'], 'nothing written on after the close');
    assert.equal(runOf(dir, 'ae/i2/1').inputAt, size, 'nor counted as written');
    await stopped(t, ops, 'ae/i2/1');
  },
);

test('a harness closing its input on its own words ends its run: done, its stdin ended by the worker', WAITED, async (t) => {
  const dir = root();
  const ops = detachedOps(listener(dir), dir);
  await Effect.runPromise(ops.spawn({ name: 'ae/i3/1', brief: 'end', cwd: dir }));
  await settle(t, ops, 'ae/i3/1', 'completed');
  assert.deepEqual(heardIn(dir), ['end', 'EOF']);
  await sayRefused(ops, 'ae/i3/1', 'late', /has given its result and reads no more words/);
});

test(
  'a worker started again on its run file writes no word twice: it goes on from where the one before had written on',
  WAITED,
  async (t) => {
    const dir = root();
    const first = path.join(dir, 'first');
    const again = path.join(dir, 'again');
    fs.mkdirSync(first);
    fs.mkdirSync(again);
    const ops = detachedOps(listener(dir), dir);
    await Effect.runPromise(ops.spawn({ name: 'ae/i4/1', brief: 'b', cwd: first }));
    await listened(t, () => heardIn(first).length === 1, 'the brief read');
    await say(ops, 'ae/i4/1', 'one');
    await listened(t, () => heardIn(first).length === 2, 'one read');
    await stopped(t, ops, 'ae/i4/1');

    const file = path.join(dir, 'runs', 'in', 'ae_i4_1.json');
    fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), cwd: again }));
    const worker = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'bin', 'ae-worker.ts');
    execFileSync(process.execPath, [
      '-e',
      `require('node:child_process').spawn(process.execPath, [${JSON.stringify(worker)}, ${JSON.stringify(file)}], { detached: true, stdio: 'ignore' }).unref()`,
    ]);
    await listened(t, () => heardIn(again).length === 1, 'the brief read again');
    assert.equal(runOf(dir, 'ae/i4/1').inputClosed, undefined, 'its worker started again by hand on the same run file: its input open');
    await say(ops, 'ae/i4/1', 'two');
    await listened(t, () => heardIn(again).length === 2, 'two read');
    assert.deepEqual(heardIn(again), ['b', 'two'], 'the words the one before wrote on are not written again');
    await stopped(t, ops, 'ae/i4/1');
  },
);

test('a run spawned again under the name starts past what was said to the one before it', WAITED, async (t) => {
  const dir = root();
  const first = path.join(dir, 'first');
  const again = path.join(dir, 'again');
  fs.mkdirSync(first);
  fs.mkdirSync(again);
  const ops = detachedOps(listener(dir), dir);
  await Effect.runPromise(ops.spawn({ name: 'ae/i5/1', brief: 'b', cwd: first }));
  await listened(t, () => heardIn(first).length === 1, 'the brief read');
  await say(ops, 'ae/i5/1', 'one');
  await listened(t, () => heardIn(first).length === 2, 'one read');
  await stopped(t, ops, 'ae/i5/1');
  await sayRefused(
    ops,
    'ae/i5/1',
    'between',
    /is `stopped`, not running/,
    'said while nothing ran: nothing appended for the next run to read',
  );

  await Effect.runPromise(ops.spawn({ name: 'ae/i5/1', brief: 'b2', cwd: again }));
  assert.equal(runOf(dir, 'ae/i5/1').input?.from, fs.statSync(inboxOf(dir, 'ae/i5/1')).size, 'from the end of the inbox as it was');
  await listened(t, () => heardIn(again).length === 1, 'the brief read');
  await say(ops, 'ae/i5/1', 'two');
  await listened(t, () => heardIn(again).length === 2, 'two read');
  assert.deepEqual(heardIn(again), ['b2', 'two']);
  await stopped(t, ops, 'ae/i5/1');
});

test('say is refused, with nothing appended, where no worker would write the words on', async () => {
  const dir = root();
  const ops = detachedOps(listener(dir), dir);
  assert.equal(detachedOps(sh('true'), dir).say, undefined, 'a harness that reads nothing on its stdin has no say');

  await sayRefused(ops, 'ae/i6/1', 'hello', /^in: no session `ae\/i6\/1` is running to hear anything: there is no run of it/);
  const runs = path.join(dir, 'runs', 'in');
  fs.mkdirSync(runs, { recursive: true });
  fs.writeFileSync(
    path.join(runs, 'ae_i6_1.json'),
    JSON.stringify({ name: 'ae/i6/1', state: 'working', pid: 999999, logFile: '/dev/null', heartbeatAt: new Date().toISOString() }),
  );
  await sayRefused(
    ops,
    'ae/i6/1',
    'hello',
    /was started with no way in/,
    'a run started before its harness took words: working, beating, and nothing on it to write words on with',
  );
  await sayRefused(ops, 'ae-i6/1', 'hello', /there is no run of it/, 'a run file another name folds onto is not the run asked for');
  fs.writeFileSync(
    path.join(runs, 'ae_i6_1.json'),
    JSON.stringify({
      name: 'ae/i6/1',
      state: 'working',
      pid: 999999,
      logFile: '/dev/null',
      heartbeatAt: new Date(Date.now() - STALE_MS - 10 * 60_000).toISOString(),
      input: { first: '', inbox: '', from: 0, closesOn: { key: 'kind', value: 'end' } },
    }),
  );
  await sayRefused(ops, 'ae/i6/1', 'hello', /is `failed`, not running/, 'a run whose worker stopped beating is not working');

  const raw = detachedOps({ ...listener(dir), input: { line: (t) => t, closesOn: { key: 'kind', value: 'end' } } }, dir);
  fs.writeFileSync(
    path.join(runs, 'ae_i6_1.json'),
    JSON.stringify({
      name: 'ae/i6/1',
      state: 'working',
      pid: 999999,
      logFile: '/dev/null',
      heartbeatAt: new Date().toISOString(),
      input: { first: '', inbox: '', from: 0, closesOn: { key: 'kind', value: 'end' } },
    }),
  );
  const e = await Effect.runPromise(Effect.flip(raw.say!({ name: 'ae/i6/1', sessionId: 'ae/i6/1' }, 'one\ntwo')));
  assert.match(e.message, /a line break in it/, "a line break the harness's line keeps would reach it as two lines");
  await Effect.runPromise(raw.say!({ name: 'ae/i6/1', sessionId: 'ae/i6/1' }, 'one line'));
  assert.equal(fs.readFileSync(inboxOf(dir, 'ae/i6/1'), 'utf8'), 'one line\n', 'only the words that make one line were appended');
});

test('a run file in no shape a worker writes is no session: not seen, not found, and told nothing, with the field that is wrong', async () => {
  const dir = root();
  const ops = detachedOps(listener(dir), dir);
  const runs = path.join(dir, 'runs', 'in');
  fs.mkdirSync(runs, { recursive: true });
  const whole = {
    name: 'ae/i7/1',
    state: 'working',
    pid: 999999,
    logFile: '/dev/null',
    heartbeatAt: new Date().toISOString(),
    input: { first: '', inbox: '', from: 0, closesOn: { key: 'kind', value: 'end' } },
  };
  fs.writeFileSync(path.join(runs, 'ae_i7_1.json'), JSON.stringify(whole));
  assert.equal((await Effect.runPromise(ops.observe)).get('ae/i7/1')?.state, 'working', 'the whole file is a session');
  assert.deepEqual(await Effect.runPromise(detachedFind(listener(dir), dir)('ae/i7/1')), { sessionId: 'ae/i7/1' }, 'and found');
  for (const [broken, field] of [
    [{ ...whole, pid: 'x' }, 'pid'],
    [{ ...whole, heartbeatAt: undefined }, 'heartbeatAt'],
    [{ ...whole, input: { ...whole.input, from: '0' } }, 'input.from'],
  ] as const) {
    fs.writeFileSync(path.join(runs, 'ae_i7_1.json'), JSON.stringify(broken));
    assert.equal((await Effect.runPromise(ops.observe)).get('ae/i7/1'), undefined, `a run file whose ${field} is wrong is not seen`);
    assert.equal(await Effect.runPromise(detachedFind(listener(dir), dir)('ae/i7/1')), undefined, 'nor found');
    await sayRefused(
      ops,
      'ae/i7/1',
      'hello',
      new RegExp(`is unreadable — its \`${field.replace('.', '\\.')}\` is not what a worker writes`),
    );
  }
  fs.writeFileSync(path.join(runs, 'ae_i7_1.json'), '{"name": "ae/i7/1", "sta');
  await sayRefused(ops, 'ae/i7/1', 'hello', /is unreadable — it is not JSON yet .*say it again in a moment\. Nothing was said\./);
  assert.equal(fs.existsSync(inboxOf(dir, 'ae/i7/1')), false, 'and nothing was appended');
});

test('the composite sends each task to the harness it asked for', async () => {
  const a = new Map<string, Sighting>();
  const b = new Map<string, Sighting>();
  const ops = composite({ alpha: testOps({ sessions: a }), beta: testOps({ sessions: b }) }, 'alpha');

  await Effect.runPromise(ops.spawn({ name: 'ae/x/1', brief: '', cwd: '/', harness: 'beta' }));
  await Effect.runPromise(ops.spawn({ name: 'ae/y/1', brief: '', cwd: '/' }));

  assert.deepEqual([...a.keys()], ['ae/y/1'], 'a task that names no harness goes to the fallback');
  assert.deepEqual([...b.keys()], ['ae/x/1']);
});

test('the composite merges what every harness sees into one map', async () => {
  const a = new Map<string, Sighting>([['ae/x/1', { sessionId: 's-a', state: 'working' }]]);
  const b = new Map<string, Sighting>([['ae/y/1', { sessionId: 's-b', state: 'completed' }]]);
  const ops = composite({ alpha: testOps({ sessions: a }), beta: testOps({ sessions: b }) }, 'alpha');

  const merged = await Effect.runPromise(ops.observe);
  assert.deepEqual([...merged.keys()].sort(), ['ae/x/1', 'ae/y/1']);
  assert.equal(merged.get('ae/y/1')?.state, 'completed');
});

test('the composite tells each harness only the sessions routed to it, and lists one that cannot be told in full', async () => {
  const a = new Map<string, Sighting>([['ae/x/1', { sessionId: 's-a', state: 'working' }]]);
  const b = new Map<string, Sighting>([['ae/y/1', { sessionId: 's-b', state: 'completed' }]]);
  const told: Record<string, string[]> = {};
  const telling = (name: string, sessions: Map<string, Sighting>) => ({
    ...testOps({ sessions }),
    observeFor: (expected: readonly { name: string }[]) =>
      Effect.sync(() => {
        told[name] = expected.map((e) => e.name);
        return { seen: new Map(sessions), unread: new Set<string>() };
      }),
  });
  const plain = new Map<string, Sighting>([['ae/z/1', { sessionId: 's-c', state: 'working' }]]);
  const ops = composite({ alpha: telling('alpha', a), beta: telling('beta', b), gamma: testOps({ sessions: plain }) }, 'alpha');

  const merged = await Effect.runPromise(
    ops.observeFor!([
      { name: 'ae/x/1', harness: 'alpha' },
      { name: 'ae/y/1', harness: 'beta' },
      { name: 'ae/w/1' },
      { name: 'ae/v/1', harness: 'gone' },
    ]),
  );
  assert.deepEqual(told, { alpha: ['ae/x/1', 'ae/w/1'], beta: ['ae/y/1'] }, 'no harness is the fallback, where its spawn went');
  assert.deepEqual([...merged.seen.keys()].sort(), ['ae/x/1', 'ae/y/1', 'ae/z/1'], 'a harness without the verb is observed all the same');
  assert.deepEqual(merged.unread, new Set(['ae/v/1']), 'a harness not here is read by nobody: its name is neither there nor gone');
  await Effect.runPromise(ops.stop('s-b'));
  assert.equal(b.get('ae/y/1')?.state, 'canceled', 'and who owns what is learned from it, as from observe');
});

test('a task on a harness the composite does not have is spawned nowhere: refused, and never on the fallback', async () => {
  const a = new Map<string, Sighting>();
  const ops = composite({ alpha: testOps({ sessions: a }) }, 'alpha');

  const e = await Effect.runPromise(Effect.flip(ops.spawn({ name: 'ae/v/1', brief: '', cwd: '/', harness: 'a2a:reviewer' })));
  assert.equal(e.refused, true, 'nothing started, which the harness vouches for, so the attempt ends `unstartable` and is never adopted');
  assert.match(e.message, /^`harness: a2a:reviewer` is not a harness this engine has, so nothing was started.*Its harnesses are: alpha\./);
  assert.deepEqual([...a.keys()], [], 'the fallback was not handed it');
  assert.equal(
    ops.refuses?.({ brief: '', cwd: '/', harness: 'a2a:reviewer' }),
    undefined,
    "and no other harness's vocabulary is asked of it",
  );
});

/** A finished Codex run `name` written into `dir` as its worker leaves it, its output `lines`. */
const codexRun = (dir: string, name: string, lines: object[]) => {
  const runs = path.join(dir, 'runs', 'codex');
  fs.mkdirSync(runs, { recursive: true });
  const base = path.join(runs, name.replace(/[^a-zA-Z0-9]+/g, '_'));
  const run = { name, state: 'done', pid: 999999, exitCode: 0, logFile: `${base}.log`, heartbeatAt: new Date().toISOString() };
  fs.writeFileSync(`${base}.json`, JSON.stringify(run));
  fs.writeFileSync(`${base}.log`, ['Reading additional input from stdin...', ...lines.map((l) => JSON.stringify(l))].join('\n'));
  return `${base}.log`;
};
const CODEX_USED = { input_tokens: 1200, cached_input_tokens: 1000, cache_write_input_tokens: 0, output_tokens: 80 };

test('REFUSED: a Codex run whose stream does not decode is read as failed alone, and why is said in words naming the session, the line, the event, the field and the fix', async () => {
  const dir = root();
  const log = codexRun(dir, 'ae/c1/1', [
    { type: 'turn.started' },
    { type: 'turn.completed', usage: { ...CODEX_USED, input_tokens: 'many' } },
  ]);
  codexRun(dir, 'ae/c0/1', [{ type: 'turn.started' }, { type: 'turn.completed', usage: CODEX_USED }]);
  const { value, warnings } = await warned(detachedOps(codex, dir).observe);
  assert.deepEqual(
    value.get('ae/c1/1'),
    { sessionId: 'ae/c1/1', state: 'failed', nativeId: undefined, closeout: undefined, exitCode: 0 },
    'ended, so failed: never completed, and nothing its output says',
  );
  assert.equal(value.get('ae/c0/1')?.state, 'completed', 'the harness’s other run is read');
  assert.deepEqual(warnings, [
    `codex: \`ae/c1/1\`'s output, ${log}, cannot be read: line 3 of the \`codex exec --json\` stream is a \`turn.completed\` event whose \`usage.input_tokens\` is "many", where Codex prints number. Run a Codex whose \`exec --json\` stream this runtime reads, or a runtime whose \`CodexEventSchema\` (\`harness/codex/stream.ts\`) reads this one. It is unread while its process runs, and read as failed once it has ended; the other sessions of codex are read. Once its task has settled, \`ae forget\` lets this session go.`,
  ]);

  codexRun(dir, 'ae/c1/1', [{ type: 'turn.started' }, { type: 'turn.completed', usage: CODEX_USED }]);
  const seen = (await Effect.runPromise(detachedOps(codex, dir).observe)).get('ae/c1/1');
  assert.deepEqual(
    seen,
    {
      sessionId: 'ae/c1/1',
      state: 'completed',
      nativeId: undefined,
      closeout: undefined,
      exitCode: 0,
      usage: { toolCalls: 0, inputTokens: 1200, uncachedTokens: 200, cacheWriteTokens: 0, cacheReadTokens: 1000, outputTokens: 80 },
    },
    'a stream that decodes is observed as ever, field for field',
  );
});

test('a Codex stream that does not decode is never an absence: through the composite, a run at work is unread, the other harness’s read, and failed once it has ended', async () => {
  const dir = root();
  const bad = [{ type: 'turn.started' }, { type: 'item.completed', item: { id: '', type: 'agent_message' } }];
  const log = codexRun(dir, 'ae/c2/1', bad);
  const file = log.replace(/\.log$/, '.json');
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), state: 'working', exitCode: undefined }));
  const other = new Map<string, Sighting>([['ae/x/1', { sessionId: 's-a', state: 'working' }]]);
  const ops = composite({ codex: detachedOps(codex, dir), alpha: testOps({ sessions: other }) }, 'alpha');
  const expected = [
    { name: 'ae/c2/1', harness: 'codex' },
    { name: 'ae/x/1', harness: 'alpha' },
  ];
  const working = await Effect.runPromise(ops.observeFor!(expected));
  assert.deepEqual([...working.seen.keys()], ['ae/x/1']);
  assert.deepEqual(working.unread, new Set(['ae/c2/1']), 'neither there nor gone');
  assert.deepEqual([...(working.unreadWhy?.keys() ?? [])], ['ae/c2/1'], 'why, as its harness said it, through the composite');
  assert.ok(working.unreadWhy?.get('ae/c2/1')?.includes(log), working.unreadWhy?.get('ae/c2/1'));

  codexRun(dir, 'ae/c2/1', bad);
  const ended = await Effect.runPromise(ops.observeFor!(expected));
  assert.deepEqual(ended.unread, new Set(), 'once ended it is read');
  assert.equal(ended.seen.get('ae/c2/1')?.state, 'failed');
  assert.equal(ended.seen.get('ae/x/1')?.state, 'working');
  assert.equal(ended.unreadWhy, undefined, 'read, so nothing said of why it is not');
});

test('a Codex stream refused is refused once per change of its output: an unchanged log is not decoded again on every pass', async () => {
  const dir = root();
  const log = codexRun(dir, 'ae/c3/1', [{ type: 'turn.started' }, { type: 'turn.completed', usage: { output_tokens: 5 } }]);
  let reads = 0;
  const counted: HarnessSpec = { ...codex, readOutput: (text) => (reads++, codex.readOutput!(text)) };
  const ops = detachedOps(counted, dir);
  for (const pass of [1, 2]) {
    const { value, warnings } = await warned(ops.observe);
    assert.equal(value.get('ae/c3/1')?.state, 'failed', `pass ${pass}`);
    assert.match(warnings[0] ?? '', /`usage\.input_tokens` is missing\./, `pass ${pass}: said on every look`);
  }
  assert.equal(reads, 1, 'read once, and the refusal kept');
  fs.appendFileSync(log, '\n');
  await Effect.runPromise(ops.observe);
  assert.equal(reads, 2, 'read again once its output changed');
});

/** The words `read` throws, or a failure of the test when it reads the output instead. */
const refusedWith = (read: () => HarnessOutput): string => {
  try {
    assert.fail(`read as ${JSON.stringify(read())}, never refused`);
  } catch (e) {
    if (e instanceof assert.AssertionError) throw e;
    return e instanceof Error ? e.message : String(e);
  }
};

/** `claude -p`'s refusal of a line, as `printedLinesOf` words it: the line, its kind, its field and what is there, and the fix. */
const printedRefusal = (line: number, kind: string, field: string, found: string) =>
  `line ${line} of the \`claude -p\` output is ${kind} line whose \`${field}\` ${found}. An output that holds it is refused, never read` +
  ' as saying nothing: run a Claude Code whose `claude -p` output this runtime reads, or a runtime whose schema for the line in' +
  ' `PRINTED` (`harness/claude/print.ts`) reads this one.';

/** A Claude Code job `name` written into `dir` as its worker leaves it, in `state`: its output a line of stderr, then `lines`. */
const claudeRun = (dir: string, name: string, lines: string[], state: 'working' | 'done' = 'done') => {
  const runs = path.join(dir, 'runs', 'claude');
  fs.mkdirSync(runs, { recursive: true });
  const base = path.join(runs, name.replace(/[^a-zA-Z0-9]+/g, '_'));
  const ended = state === 'done' ? { exitCode: 0 } : {};
  const run = { name, state, pid: 999999, ...ended, logFile: `${base}.log`, heartbeatAt: new Date().toISOString() };
  fs.writeFileSync(`${base}.json`, JSON.stringify(run));
  fs.writeFileSync(`${base}.log`, ['a warning on stderr', ...lines].join('\n'));
  return `${base}.log`;
};

/**
 * A Claude Code job whose output `lines` holds a line that does not decode, looked at while it works and once it has ended,
 * beside a job that reads: through the composite, unread at work and failed once ended, with no closeout; and the warning, which
 * is `outputRefusalOf`'s sentence over the refusal `words`.
 */
const refusedClaudeRun = async (lines: string[], words: string) => {
  const { claudeJob } = await import('../src/harness/claude/code.ts');
  const dir = root();
  const log = claudeRun(dir, 'ae/j1/1', lines, 'working');
  claudeRun(dir, 'ae/j0/1', [stream.init, resultLine({ structured_output: { outcome: 'done' } })]);
  const other = new Map<string, Sighting>([['ae/x/1', { sessionId: 's-a', state: 'working' }]]);
  const ops = composite({ claude: detachedOps(claudeJob, dir), alpha: testOps({ sessions: other }) }, 'alpha');
  const expected = [
    { name: 'ae/j1/1', harness: 'claude' },
    { name: 'ae/j0/1', harness: 'claude' },
    { name: 'ae/x/1', harness: 'alpha' },
  ];
  const working = await Effect.runPromise(ops.observeFor!(expected));
  assert.deepEqual(working.unread, new Set(['ae/j1/1']), 'at work: neither there nor gone, never a job that said nothing');
  assert.deepEqual([...working.seen.keys()].sort(), ['ae/j0/1', 'ae/x/1']);

  claudeRun(dir, 'ae/j1/1', lines);
  const { value, warnings } = await warned(detachedOps(claudeJob, dir).observe);
  assert.deepEqual(
    value.get('ae/j1/1'),
    { sessionId: 'ae/j1/1', state: 'failed', nativeId: undefined, closeout: undefined, exitCode: 0 },
    'ended, so failed: never completed, and nothing its output says',
  );
  assert.deepEqual(value.get('ae/j0/1')?.closeout?.payload, { outcome: 'done' }, 'the harness’s other run is read');
  assert.deepEqual(warnings, [
    `claude: \`ae/j1/1\`'s output, ${log}, cannot be read: ${words} It is unread while its process runs, and read as failed once it` +
      ' has ended; the other sessions of claude are read. Once its task has settled, `ae forget` lets this session go.',
  ]);
  const ended = await Effect.runPromise(ops.observeFor!(expected));
  assert.deepEqual(ended.unread, new Set(), 'once ended it is read');
  assert.equal(ended.seen.get('ae/j1/1')?.state, 'failed');
};

test('REFUSED: a claude job whose result line says a cost that is no number is unread at work and failed once ended, in words naming the line, the field and the fix', async () => {
  await refusedClaudeRun(
    [stream.init, resultLine({ structured_output: { outcome: 'done' }, total_cost_usd: 'a lot' })],
    printedRefusal(3, 'a `result`', 'total_cost_usd', 'is "a lot", where Claude Code prints number'),
  );
});

test('REFUSED: a claude job whose result line says its denials as no list is unread at work and failed once ended, never a job denied nothing', async () => {
  await refusedClaudeRun(
    [stream.init, resultLine({ structured_output: { outcome: 'done' }, permission_denials: 'Write' })],
    printedRefusal(3, 'a `result`', 'permission_denials', 'is "Write", where Claude Code prints array'),
  );
});

test('REFUSED: a claude job whose permission_denied event names its call by a number is unread at work and failed once ended', async () => {
  const denied = { ...JSON.parse(stream.denied('toolu_w', 'Write')), tool_use_id: 7 };
  await refusedClaudeRun(
    [
      stream.init,
      stream.calls(['toolu_w', 'Write', { file_path: '/tmp/outside/x.txt', content: 'hi' }]),
      JSON.stringify(denied),
      resultLine({ structured_output: { outcome: 'done' } }),
    ],
    printedRefusal(4, 'a `system` `permission_denied`', 'tool_use_id', 'is 7, where Claude Code prints string'),
  );
});

test('a claude job whose output has stderr before its result and a line torn mid-write after it still says what its result says', async () => {
  const { claudeJob } = await import('../src/harness/claude/code.ts');
  const dir = root();
  const torn = stream.calls(['toolu_r', 'Read', { file_path: '/w/a.ts' }]).slice(0, -12);
  const lines = [stream.init, resultLine({ structured_output: { outcome: 'done' }, total_cost_usd: 0.2 }), torn];
  claudeRun(dir, 'ae/j2/1', lines);
  assert.deepEqual(claudeStreamOutput(['a warning on stderr', ...lines].join('\n')), {
    closeout: { payload: { outcome: 'done' } },
    usage: { costUsd: 0.2 },
    skills: [],
  });
  const { value, warnings } = await warned(detachedOps(claudeJob, dir).observe);
  assert.deepEqual(warnings, [], 'nothing refused: stderr and a torn line are no lines Claude Code printed whole');
  assert.equal(value.get('ae/j2/1')?.state, 'completed');
  assert.deepEqual(value.get('ae/j2/1')?.closeout?.payload, { outcome: 'done' });
  assert.deepEqual(value.get('ae/j2/1')?.usage, { costUsd: 0.2 });
});

test('a harness the composite cannot read leaves the names routed to it unread, and the others are read as ever', async () => {
  const a = new Map<string, Sighting>([['ae/x/1', { sessionId: 's-a', state: 'working' }]]);
  const failing = (verb: string) => Effect.fail(new RunnerError({ verb, message: 'claude agents: timed out' }));
  const broken = { ...testOps({ sessions: new Map() }), observe: failing('observe'), observeFor: () => failing('observeFor') };
  const plain = { ...testOps({ sessions: new Map() }), observe: failing('observe') };
  const ops = composite({ alpha: testOps({ sessions: a }), beta: broken, gamma: plain }, 'alpha');

  const o = await Effect.runPromise(
    ops.observeFor!([
      { name: 'ae/x/1', harness: 'alpha' },
      { name: 'ae/w/1', harness: 'alpha' },
      { name: 'ae/y/1', harness: 'beta' },
      { name: 'ae/z/1', harness: 'gamma' },
    ]),
  );
  assert.deepEqual([...o.seen.keys()], ['ae/x/1'], 'the harnesses that answered still arrive');
  assert.deepEqual(
    o.unread,
    new Set(['ae/y/1', 'ae/z/1']),
    'each unread harness leaves its own names unread, by either verb; one that answered leaves none',
  );
  assert.equal(o.unreadWhy, undefined, 'a harness whose look failed says why on `why`, of no session alone');
  assert.deepEqual(
    [...(await Effect.runPromise(ops.observe)).keys()],
    ['ae/x/1'],
    'a full listing reads an unread harness as nothing, as views do',
  );
});

test('the composite routes stop to whichever harness owns that session', async () => {
  const a = new Map<string, Sighting>([['ae/x/1', { sessionId: 's-a', state: 'working' }]]);
  const b = new Map<string, Sighting>([['ae/y/1', { sessionId: 's-b', state: 'working' }]]);
  const ops = composite({ alpha: testOps({ sessions: a }), beta: testOps({ sessions: b }) }, 'alpha');

  await Effect.runPromise(ops.observe);
  await Effect.runPromise(ops.stop('s-b'));

  assert.equal(b.get('ae/y/1')?.state, 'canceled', 'beta was told');
  assert.equal(a.get('ae/x/1')?.state, 'working', 'alpha was not');
});

test('one harness failing to answer does not blind the engine to the others', async () => {
  const good = new Map<string, Sighting>([['ae/x/1', { sessionId: 's-a', state: 'working' }]]);
  const broken = { ...testOps(), observe: Effect.die(new Error('harness is down')) };
  const ops = composite({ alpha: testOps({ sessions: good }), beta: broken }, 'alpha');

  const merged = await Effect.runPromise(ops.observe);
  assert.deepEqual([...merged.keys()], ['ae/x/1']);
});

test('the composite sends a release only to the harness that reported the session — never to the fallback', async () => {
  const released: string[] = [];
  const a = new Map<string, Sighting>([['ae/x/1', { sessionId: 's-a', state: 'completed' }]]);
  const b = new Map<string, Sighting>([['ae/y/1', { sessionId: 's-b', state: 'completed' }]]);
  const alpha = {
    ...testOps({ sessions: a }),
    release: (s: Sighting) =>
      Effect.sync(() => {
        released.push(s.sessionId);
      }),
  };
  const ops = composite({ alpha, beta: testOps({ sessions: b }) }, 'alpha');

  await Effect.runPromise(ops.release!({ sessionId: 's-b', state: 'completed' }, {}));
  assert.deepEqual(released, [], 'no pass has said whose it is: nobody is asked, the fallback least of all');
  await Effect.runPromise(ops.observe);
  await Effect.runPromise(ops.release!({ sessionId: 's-b', state: 'completed' }, {}));
  assert.deepEqual(released, [], 'beta has no release, so there is nothing to do');
  await Effect.runPromise(ops.release!({ sessionId: 's-a', state: 'completed' }, {}));
  assert.deepEqual(released, ['s-a']);
});

test('a worktree is always NAMED for Claude — a bare --worktree would eat the prompt', async () => {
  const { claudeDetached } = await import('../src/harness/claude/code.ts');
  const args = claudeDetached.command({ name: 'ae/t-abc/2', brief: 'the prompt', cwd: '/r', config: { worktree: true } }).args;
  const i = args.indexOf('--worktree');
  assert.notEqual(i, -1);
  assert.equal(args[i + 1], 'ae-t-abc-2', 'derived from the session name, never absent');
  assert.ok(args.includes('the prompt'), 'and the prompt survives');
});

test('a task may name its own worktree', async () => {
  const { claudeDetached } = await import('../src/harness/claude/code.ts');
  const args = claudeDetached.command({ name: 'ae/t-abc/2', brief: 'b', cwd: '/r', config: { worktree: 'my-branch' } }).args;
  assert.equal(args[args.indexOf('--worktree') + 1], 'my-branch');
});

test("codex's worktree flag takes no value, so the prompt still follows it safely", async () => {
  const { codex } = await import('../src/harness/codex/codex.ts');
  const args = codex.command({ name: 'ae/t-abc/1', brief: 'the prompt', cwd: '/r', config: { worktree: true } }).args;
  assert.equal(args[args.indexOf('--worktree') + 1], 'the prompt', 'the prompt, not a name');
  assert.equal(args.at(-1), 'the prompt');
});

test('the default permission mode is `auto` — a fleet cannot wait for a person', async () => {
  const { claudeDetached } = await import('../src/harness/claude/code.ts');
  const args = claudeDetached.command({ name: 'ae/t/1', brief: 'b', cwd: '/r' }).args;
  assert.equal(
    args[args.indexOf('--permission-mode') + 1],
    'auto',
    '`acceptEdits` approves edits but not `npm test`: an unattended session would block the moment it runs its own tests',
  );

  const chosen = claudeDetached.command({ name: 'ae/t/1', brief: 'b', cwd: '/r', config: { permissionMode: 'dontAsk' } }).args;
  assert.equal(chosen[chosen.indexOf('--permission-mode') + 1], 'dontAsk', 'and a task may still choose');
});

test('codex runs read-only when the task says read-only — never widened to workspace-write', async () => {
  const { codex } = await import('../src/harness/codex/codex.ts');
  const sandbox = (permissionMode?: string) => {
    const args = codex.command({ name: 'ae/t/1', brief: 'b', cwd: '/r', config: { permissionMode } }).args;
    return args[args.indexOf('-s') + 1];
  };
  assert.equal(sandbox('read-only'), 'read-only');
  assert.equal(sandbox(), 'workspace-write', 'the shipped default is unchanged');
  assert.equal(sandbox('bypassPermissions'), 'danger-full-access');
  assert.equal(sandbox('danger-full-access'), 'danger-full-access', "Codex's own words are its own sandboxes");
  assert.equal(sandbox('workspace-write'), 'workspace-write');
});

test("codex refuses a permission mode that is not one of its sandboxes; Claude's harnesses refuse Codex's", async () => {
  const { codex } = await import('../src/harness/codex/codex.ts');
  const { claudeDetached } = await import('../src/harness/claude/code.ts');
  const task = (permissionMode: string) => ({ brief: 'b', cwd: '/r', config: { permissionMode } });
  assert.match(codex.refuses!(task('acceptEdits')) ?? '', /not a sandbox Codex has.*read-only, workspace-write, danger-full-access/);
  assert.match(claudeDetached.refuses!(task('read-only')) ?? '', /not a mode Claude Code has/);
  assert.equal(codex.refuses!(task('read-only')), undefined);
  assert.equal(claudeDetached.refuses!(task('auto')), undefined);
});

test('codex is given the schema and an output file, and the prompt still comes last', async () => {
  const { codex } = await import('../src/harness/codex/codex.ts');
  const args = codex.command(
    { name: 'ae/t/1', brief: 'the prompt', cwd: '/r', closeoutSchema: {} },
    { closeoutSchemaFile: '/board/s.schema.json', closeoutFile: '/board/s.closeout.json' },
  ).args;
  assert.equal(args[args.indexOf('--output-schema') + 1], '/board/s.schema.json');
  assert.equal(args[args.indexOf('-o') + 1], '/board/s.closeout.json');
  assert.equal(args.at(-1), 'the prompt');
  assert.ok(!codex.command({ name: 'ae/t/1', brief: 'b', cwd: '/r' }).args.includes('--output-schema'), 'no schema, no flag');
});

test("a detached harness's final answer is its closing statement — and nothing lands in the workspace", WAITED, async (t) => {
  const dir = root();
  const workspace = scratch('ae-ws-');
  const answers: HarnessSpec = {
    name: 'sh',
    command: (_r, io) => ({ cmd: 'sh', args: ['-c', `printf '%s' '{"outcome":"done"}' > '${io?.closeoutFile}'`] }),
  };
  const ops = detachedOps(answers, dir);
  await Effect.runPromise(ops.spawn({ name: 'ae/t9/1', brief: 'x', cwd: workspace, closeoutSchema: { type: 'object' } }));

  const seen = await settle(t, ops, 'ae/t9/1', 'completed');
  assert.deepEqual(seen.closeout?.payload, { outcome: 'done' });
  assert.equal(
    seen.closeout && 'at' in seen.closeout,
    false,
    'no time: its own process wrote the file, after the spawn cleared the last one, whatever the clock says',
  );
  assert.deepEqual(fs.readdirSync(workspace), [], 'the workspace is the one place it must not be');
});

test('a re-spawn of the same attempt does not find the last answer waiting for it', async () => {
  const dir = root();
  const quiet: HarnessSpec = { name: 'sh', command: () => ({ cmd: 'sh', args: ['-c', 'sleep 2'] }) };
  const ops = detachedOps(quiet, dir);
  const leftover = path.join(dir, 'runs', 'sh', 'ae_t10_1.closeout.json');
  fs.mkdirSync(path.dirname(leftover), { recursive: true });
  fs.writeFileSync(leftover, '{"outcome":"done"}');

  await Effect.runPromise(ops.spawn({ name: 'ae/t10/1', brief: 'x', cwd: dir, closeoutSchema: {} }));
  assert.equal((await Effect.runPromise(ops.observe)).get('ae/t10/1')?.closeout, undefined);
});

test('a resumed codex task puts every flag before `resume`, then the id, then the prompt', async () => {
  const { codex } = await import('../src/harness/codex/codex.ts');
  const args = codex.command(
    { name: 'ae/t/2', brief: 'answer the review', cwd: '/wt', resumeFrom: 'abc-123', config: { worktree: true }, closeoutSchema: {} },
    { closeoutSchemaFile: '/b/s.json', closeoutFile: '/b/o.json' },
  ).args;
  const at = args.indexOf('resume');
  assert.notEqual(at, -1, '`codex exec resume` takes only `[SESSION_ID] [PROMPT]`: a flag after it fails to parse');
  assert.deepEqual(args.slice(at), ['resume', 'abc-123', 'answer the review'], 'nothing but the id and the prompt after it');
  for (const flag of ['-C', '-s', '--output-schema', '-o', '--worktree']) {
    assert.ok(args.indexOf(flag) !== -1 && args.indexOf(flag) < at, `${flag} before resume`);
  }
});

test('trusted projects are read the way Codex writes them, and only those', () => {
  const toml = [
    '[projects."/home/u/repo"]',
    'trust_level = "trusted"',
    '',
    '[projects."/home/u/other"]',
    'trust_level = "untrusted"',
    '',
    '[model_providers.x]',
    'trust_level = "trusted"',
  ].join('\n');
  assert.deepEqual([...trustedProjects(toml)], ['/home/u/repo']);
});

/** A repository with one linked worktree, and a Codex home that does or does not trust it. */
const repoWithWorktree = (trust: boolean) => {
  const repo = scratch('ae-trust-repo-');
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'root'], { cwd: repo });
  const wt = path.join(scratch('ae-trust-wt-'), 'step');
  execFileSync('git', ['worktree', 'add', '-q', wt], { cwd: repo, stdio: 'ignore' });
  const home = scratch('ae-codex-home-');
  if (trust) fs.writeFileSync(path.join(home, 'config.toml'), `[projects."${repo}"]\ntrust_level = "trusted"\n`);
  return { repo, wt, home };
};

const inCodexHome = <T>(home: string, f: () => T): T => {
  const prev = process.env.CODEX_HOME;
  process.env.CODEX_HOME = home;
  try {
    return f();
  } finally {
    if (prev === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = prev;
  }
};

test('a worktree of a repository you trust in Codex, which the task names, is trusted for the run, repository included', async () => {
  const { codex } = await import('../src/harness/codex/codex.ts');
  const { repo, wt, home } = repoWithWorktree(true);
  const io = inCodexHome(home, () => codex.prepare!({ name: 'ae/t/1', brief: 'b', cwd: wt, config: { codex: { trustFrom: repo } } }));
  assert.deepEqual(io.trustedDirs, [repo, wt]);
});

test('a repository you never trusted gets no trust from the engine', async () => {
  const { codex } = await import('../src/harness/codex/codex.ts');
  const { repo, wt, home } = repoWithWorktree(false);
  const io = inCodexHome(home, () => codex.prepare!({ name: 'ae/t/1', brief: 'b', cwd: wt, config: { codex: { trustFrom: repo } } }));
  assert.equal(io.trustedDirs, undefined, "trusting it would also load whatever Codex settings it ships: not the engine's call");
});

test('a worktree of a repository you trust in Codex gets no trust unless the task names the directory, and no git is spawned', async () => {
  const { codex } = await import('../src/harness/codex/codex.ts');
  const { ioCounts } = await import('../src/core/engine/tally.ts');
  const { wt, home } = repoWithWorktree(true);
  const before = ioCounts().spawned;
  const io = inCodexHome(home, () => codex.prepare!({ name: 'ae/t/1', brief: 'b', cwd: wt }));
  assert.equal(io.trustedDirs, undefined);
  assert.equal(ioCounts().spawned, before, 'the repository behind the cwd is never asked of git');
});

/** A directory the task names as the one to extend trust from, and a Codex home that does or does not trust it. */
const namedDir = (trust: boolean) => {
  const dir = scratch('ae-trust-from-');
  const home = scratch('ae-codex-home-');
  if (trust) fs.writeFileSync(path.join(home, 'config.toml'), `[projects."${dir}"]\ntrust_level = "trusted"\n`);
  else fs.writeFileSync(path.join(home, 'config.toml'), '');
  return { dir, home };
};

test('a directory the task names, which you trust in Codex, extends its trust to the cwd, with no repository and no git', async () => {
  const { codex } = await import('../src/harness/codex/codex.ts');
  const { ioCounts } = await import('../src/core/engine/tally.ts');
  const { dir, home } = namedDir(true);
  const cwd = scratch('ae-trust-cwd-');
  const before = ioCounts().spawned;
  const io = inCodexHome(home, () => codex.prepare!({ name: 'ae/t/1', brief: 'b', cwd, config: { codex: { trustFrom: dir } } }));
  assert.deepEqual(io.trustedDirs, [dir, cwd]);
  assert.equal(ioCounts().spawned, before, 'no git is spawned for a directory the task names');
});

test('a directory the task names, which you never trusted, gets no trust from the engine', async () => {
  const { codex } = await import('../src/harness/codex/codex.ts');
  const { dir, home } = namedDir(false);
  const cwd = scratch('ae-trust-cwd-');
  const io = inCodexHome(home, () => codex.prepare!({ name: 'ae/t/1', brief: 'b', cwd, config: { codex: { trustFrom: dir } } }));
  assert.equal(io.trustedDirs, undefined);
});

test('a directory the task names decides alone: a worktree of a trusted repository is not trusted from an untrusted one, and no git is asked', async () => {
  const { codex } = await import('../src/harness/codex/codex.ts');
  const { ioCounts } = await import('../src/core/engine/tally.ts');
  const { wt, home } = repoWithWorktree(true);
  const untrusted = scratch('ae-trust-from-');
  const before = ioCounts().spawned;
  const io = inCodexHome(home, () => codex.prepare!({ name: 'ae/t/1', brief: 'b', cwd: wt, config: { codex: { trustFrom: untrusted } } }));
  assert.equal(io.trustedDirs, undefined, 'the repository behind the cwd is not asked for');
  assert.equal(ioCounts().spawned, before);
});

test('a directory the task names is resolved before it is looked up, and named once when it is the cwd', async () => {
  const { codex } = await import('../src/harness/codex/codex.ts');
  const { dir, home } = namedDir(true);
  const cwd = scratch('ae-trust-cwd-');
  const slashed = inCodexHome(home, () => codex.prepare!({ name: 'ae/t/1', brief: 'b', cwd, config: { codex: { trustFrom: `${dir}/` } } }));
  assert.deepEqual(slashed.trustedDirs, [dir, cwd]);
  const itself = inCodexHome(home, () => codex.prepare!({ name: 'ae/t/1', brief: 'b', cwd: dir, config: { codex: { trustFrom: dir } } }));
  assert.deepEqual(itself.trustedDirs, [dir]);
});

test('trust reaches codex as config overrides, every one before `resume`', async () => {
  const { codex } = await import('../src/harness/codex/codex.ts');
  const args = codex.command(
    { name: 'ae/t/2', brief: 'the prompt', cwd: '/wt', resumeFrom: 'abc' },
    { trustedDirs: ['/repo', '/wt'] },
  ).args;
  const overrides = args.flatMap((a, i) => (a === '-c' ? [args[i + 1]] : []));
  assert.deepEqual(overrides, ['projects."/repo".trust_level="trusted"', 'projects."/wt".trust_level="trusted"']);
  assert.ok(args.lastIndexOf('-c') < args.indexOf('resume'));
  assert.equal(args.at(-1), 'the prompt');
});

test('the runner merges what a spec prepares into what its command is given', async () => {
  let given: HarnessIO | undefined;
  const spy: HarnessSpec = {
    name: 'sh',
    prepare: () => ({ trustedDirs: ['/somewhere'] }),
    command: (_r, io) => {
      given = io;
      return { cmd: 'sh', args: ['-c', 'exit 0'] };
    },
  };
  await Effect.runPromise(detachedOps(spy, root()).spawn({ name: 'ae/t13/1', brief: 'x', cwd: root(), closeoutSchema: {} }));
  assert.deepEqual(given?.trustedDirs, ['/somewhere']);
  assert.ok(given?.closeoutFile, 'alongside what the runner chose itself');
});

test('at shipped defaults neither detached harness is given a tool list or an effort', async () => {
  const { codex } = await import('../src/harness/codex/codex.ts');
  const { claudeDetached } = await import('../src/harness/claude/code.ts');
  const c = codex.command({ name: 'ae/t/1', brief: 'b', cwd: '/r' }).args;
  assert.equal(
    c.some((a) => a.startsWith('model_reasoning_effort')),
    false,
  );
  assert.equal(c[c.indexOf('-s') + 1], 'workspace-write');
  const d = claudeDetached.command({ name: 'ae/t/1', brief: 'b', cwd: '/r' }).args;
  assert.equal(d.includes('--tools'), false);
  assert.equal(d.includes('--disallowedTools'), false);
  assert.equal(d.includes('--effort'), false);
});

test('codex runs read-only when its tools have none of Bash, Write or Edit — whatever sandbox it named', async () => {
  const { codex } = await import('../src/harness/codex/codex.ts');
  const sandbox = (r: { tools?: string[]; permissionMode?: string }) => {
    const args = codex.command({ name: 'ae/t/1', brief: 'b', cwd: '/r', config: r }).args;
    return args[args.indexOf('-s') + 1];
  };
  assert.equal(sandbox({ tools: ['Read', 'Grep', 'Glob'] }), 'read-only');
  assert.equal(sandbox({ tools: ['Read', 'Grep', 'Glob'], permissionMode: 'danger-full-access' }), 'read-only', 'the narrower fence wins');
  assert.equal(sandbox({ tools: [] }), 'read-only', 'no tools at all');
  assert.equal(sandbox({ tools: ['Read', 'Bash'] }), 'workspace-write', 'a list with a shell does not narrow codex');
  assert.equal(sandbox({ tools: ['Read', 'Bash'], permissionMode: 'read-only' }), 'read-only', 'and the mode it named still holds');
});

test('effort reaches codex as a config override before `resume`, and claude-detached as --effort', async () => {
  const { codex } = await import('../src/harness/codex/codex.ts');
  const { claudeDetached } = await import('../src/harness/claude/code.ts');
  const c = codex.command({ name: 'ae/t/2', brief: 'the prompt', cwd: '/wt', config: { effort: 'high' }, resumeFrom: 'abc' }).args;
  const i = c.indexOf('model_reasoning_effort="high"');
  assert.ok(i > 0 && c[i - 1] === '-c', '-c model_reasoning_effort="high"');
  assert.ok(i < c.indexOf('resume'), 'before resume, which rejects flags after its id');
  assert.equal(c.at(-1), 'the prompt');

  const d = claudeDetached.command({
    name: 'ae/t/1',
    brief: 'the prompt',
    cwd: '/r',
    config: { effort: 'max', tools: ['Read', 'Grep'] },
  }).args;
  assert.equal(d[d.indexOf('--effort') + 1], 'max');
  assert.equal(d[d.indexOf('--tools') + 1], 'Read,Grep');
  assert.equal(d[d.indexOf('--tools') + 2], '--settings', 'a flag ends the variadic list');
});

test('an effort a harness does not have is refused by that harness, in its own words', async () => {
  const { codex } = await import('../src/harness/codex/codex.ts');
  const { claudeDetached } = await import('../src/harness/claude/code.ts');
  const task = (effort: string) => ({ brief: 'b', cwd: '/r', config: { effort } });
  assert.match(codex.refuses!(task('extreme')) ?? '', /not a reasoning effort Codex has.*none, minimal, low, medium, high, xhigh, max/);
  assert.match(
    claudeDetached.refuses!(task('minimal')) ?? '',
    /not an effort Claude Code has.*low, medium, high, xhigh, max/,
    'Claude Code would only warn and run at its default: the engine refuses what the CLI ignores',
  );
  assert.equal(codex.refuses!(task('minimal')), undefined);
  assert.equal(claudeDetached.refuses!(task('xhigh')), undefined);
});

test("a detached session's exit code is on its sighting, and no usage is invented beside it", WAITED, async (t) => {
  const dir = root();
  const ops = detachedOps(sh('exit 3'), dir);
  await Effect.runPromise(ops.spawn(req('ae/t14/1', dir)));
  const seen = await settle(t, ops, 'ae/t14/1', 'failed');
  assert.equal(seen?.exitCode, 3);
  assert.equal(seen?.usage, undefined, 'a generic harness measures no usage, and reports none rather than 0');
});

test("no exit code yet, or the worker's -1 for none, is reported as no code at all", async () => {
  const dir = root();
  const ops = detachedOps(sh('true'), dir);
  const runs = path.join(dir, 'runs', 'sh');
  fs.mkdirSync(runs, { recursive: true });
  const write = (name: string, patch: object) =>
    fs.writeFileSync(
      path.join(runs, `${name.replace(/\//g, '_')}.json`),
      JSON.stringify({
        name,
        pid: 999999,
        logFile: '/dev/null',
        heartbeatAt: new Date().toISOString(),
        ...patch,
      }),
    );
  write('ae/t15/1', { state: 'working' });
  write('ae/t16/1', { state: 'stopped', exitCode: -1 });
  const seen = await Effect.runPromise(ops.observe);
  assert.equal('exitCode' in seen.get('ae/t15/1')!, false, 'still running: no code');
  assert.equal('exitCode' in seen.get('ae/t16/1')!, false, 'killed by a signal: no code, not -1');
});

test('a detached spawn that throws says nothing started — the worker is never launched', async () => {
  const broken: HarnessSpec = {
    name: 'sh',
    command: () => {
      throw new Error('no command for this');
    },
  };
  const e = await Effect.runPromise(
    detachedOps(broken, root())
      .spawn(req('ae/t17/1', root()))
      .pipe(
        Effect.as(undefined),
        Effect.catchTag('RunnerError', (err) => Effect.succeed(err)),
      ),
  );
  assert.equal(e?.refused, true);
});

test('a detached worker aimed at a directory that is not there is refused, and cannot take the engine down', async () => {
  const e = await Effect.runPromise(
    detachedOps(sh('true'), root())
      .spawn(req('ae/t18/1', path.join(root(), 'gone')))
      .pipe(
        Effect.as(undefined),
        Effect.catchTag('RunnerError', (err) => Effect.succeed(err)),
      ),
  );
  assert.equal(e?.refused, true, 'refused before the worker is launched: no ENOENT arrives later, unheard, to take its launcher down');
  assert.match(e?.message ?? '', /is not a directory/);
  await new Promise((r) => setTimeout(r, 300));
});

test('a relative cwd is resolved where the worker is launched — the harness runs in repo, not repo/repo', WAITED, async (t) => {
  const was = process.cwd();
  const parent = root();
  fs.mkdirSync(path.join(parent, 'repo'));
  let given: string | undefined;
  const where: HarnessSpec = {
    name: 'sh',
    command: (r) => {
      given = r.cwd;
      return { cmd: 'sh', args: ['-c', 'pwd > where.txt'] };
    },
  };
  const ops = detachedOps(where, root());
  process.chdir(parent);
  try {
    await Effect.runPromise(ops.spawn(req('ae/t19/1', 'repo')));
  } finally {
    process.chdir(was);
  }

  await settle(t, ops, 'ae/t19/1', 'completed');
  const repo = fs.realpathSync(path.join(parent, 'repo'));
  assert.equal(given && fs.realpathSync(given), repo, 'the spec is handed the resolved directory, so a `-C` names it too');
  assert.equal(
    fs.realpathSync(fs.readFileSync(path.join(repo, 'where.txt'), 'utf8').trim()),
    repo,
    '`file()` refuses a relative cwd; a caller of the runner itself has it resolved once, as `claude --bg` resolves one',
  );
});

test('claude-detached is asked for JSON, and for the schema as --json-schema when the task gives one', async () => {
  const { claudeDetached } = await import('../src/harness/claude/code.ts');
  const schema = { type: 'object', properties: { outcome: { type: 'string' } }, required: ['outcome'] };
  const args = claudeDetached.command({
    name: 'ae/t/1',
    brief: 'the prompt',
    cwd: '/r',
    closeoutSchema: schema,
    resumeFrom: 'abc',
    config: { worktree: true },
  }).args;
  assert.deepEqual(args.slice(0, 2), ['-p', 'the prompt'], "the prompt is -p's own value");
  assert.equal(args[args.indexOf('--output-format') + 1], 'json');
  assert.deepEqual(JSON.parse(args[args.indexOf('--json-schema') + 1]), schema);
  assert.equal(args[args.indexOf('--worktree') + 1], 'ae-t-1', 'and the worktree is still named');

  const plain = claudeDetached.command({ name: 'ae/t/1', brief: 'b', cwd: '/r' }).args;
  assert.equal(plain.includes('--json-schema'), false, 'no schema, no flag');
  assert.equal(plain[plain.indexOf('--output-format') + 1], 'json', 'JSON either way: the session id is in it');
});

test("claude -p's answer is its result object's structured_output, and nothing else in its output is one", () => {
  assert.deepEqual(
    claudeResultOutput(['a warning on stderr', resultLine({ structured_output: { outcome: 'done' } }), ''].join('\n')),
    {
      closeout: { payload: { outcome: 'done' } },
    },
    '`-p --output-format json --json-schema` prints one line, a result whose structured_output holds the answer',
  );
  assert.deepEqual(claudeResultOutput(resultLine({})), {}, 'a result without it: no schema was given, or none was answered');
  assert.deepEqual(claudeResultOutput(resultLine({ structured_output: null })), {}, 'null is no answer');
  assert.deepEqual(
    claudeResultOutput(JSON.stringify({ type: 'assistant', result: 'x', structured_output: { outcome: 'done' } })),
    {},
    'only a result answers',
  );
  assert.deepEqual(claudeResultOutput(resultLine({ structured_output: { outcome: 'done' } }).slice(0, -8)), {}, 'half a line is not one');
  assert.deepEqual(claudeResultOutput('The result: {"outcome":"done"}'), {}, 'prose is not one');
  assert.deepEqual(claudeResultOutput(''), {});
});

test('a budget reaches claude-detached as --max-budget-usd, and REFUSED on codex, which has no spend cap — in its own words', async () => {
  const { codex } = await import('../src/harness/codex/codex.ts');
  const { claudeDetached } = await import('../src/harness/claude/code.ts');
  const d = claudeDetached.command({ name: 'ae/t/1', brief: 'the prompt', cwd: '/r', config: { budgetUsd: 0.25 }, resumeFrom: 'abc' }).args;
  assert.equal(d[d.indexOf('--max-budget-usd') + 1], '0.25');
  assert.equal(
    claudeDetached.command({ name: 'ae/t/1', brief: 'b', cwd: '/r' }).args.includes('--max-budget-usd'),
    false,
    'no budget, no flag',
  );
  assert.equal(claudeDetached.refuses!({ brief: 'b', cwd: '/r', config: { budgetUsd: 0.25 } }), undefined, 'claude -p keeps one');

  assert.match(
    codex.refuses!({ brief: 'b', cwd: '/r', config: { budgetUsd: 0.25 } }) ?? '',
    /`budgetUsd: 0\.25` is a spend cap in dollars, and `codex exec` has none.*`claude-detached`/,
  );
  assert.equal(codex.refuses!({ brief: 'b', cwd: '/r' }), undefined, 'no budget, nothing refused');
  assert.equal(
    codex.command({ name: 'ae/t/1', brief: 'b', cwd: '/r', config: { budgetUsd: 0.25 } }).args.some((a) => a.includes('budget')),
    false,
    'a direct caller is given no flag codex does not have',
  );
});

test('a context window reaches claude -p as --autocompact, which it keeps — and codex declares none, so file() refuses one there', async () => {
  const { codex } = await import('../src/harness/codex/codex.ts');
  const { claudeDetached } = await import('../src/harness/claude/code.ts');
  const d = claudeDetached.command({
    name: 'ae/t/1',
    brief: 'the prompt',
    cwd: '/r',
    config: { contextTokens: 150000, tools: ['Read'] },
    resumeFrom: 'abc',
  }).args;
  assert.equal(d[d.indexOf('--autocompact') + 1], '150000');
  assert.ok(d.indexOf('--autocompact') > d.indexOf('--permission-mode'), 'past the variadic lists');
  assert.equal(
    claudeDetached.command({ name: 'ae/t/1', brief: 'b', cwd: '/r' }).args.includes('--autocompact'),
    false,
    'no window, no flag',
  );
  assert.deepEqual(claudeDetached.contextTokens, { least: 100_000, most: 1_000_000 });
  assert.equal(codex.contextTokens, undefined, 'codex exec has no such knob');
  assert.equal(
    codex
      .command({ name: 'ae/t/1', brief: 'b', cwd: '/r', config: { contextTokens: 200000 } })
      .args.some((a) => a.includes('compact') || a === '200000'),
    false,
  );
});

test('claude -p that stopped at its budget says so in its result — the limit `budget`, a fact — and one that failed another way does not', () => {
  const spent = resultLine({
    subtype: 'error_max_budget_usd',
    is_error: true,
    terminal_reason: 'budget_exhausted',
    errors: ['Reached maximum budget ($0.01)'],
    total_cost_usd: 0.01804,
    duration_api_ms: 718,
  });
  assert.deepEqual(
    claudeResultOutput(spent),
    { usage: { costUsd: 0.01804, apiMs: 718 }, limit: 'budget' },
    '`claude -p` at its `--max-budget-usd` exits 1 with this result (keys trimmed)',
  );
  assert.equal(
    claudeResultOutput(resultLine({ subtype: 'error_max_turns', is_error: true })).limit,
    undefined,
    'another error is not a spent budget',
  );
  assert.equal(
    claudeResultOutput(resultLine({ terminal_reason: 'budget_exhausted' })).limit,
    undefined,
    'the subtype says it, as the SDK documents it',
  );
});

test("claude -p's tokens are its result's usage, in their three classes, and none from a usage that counted nothing", () => {
  const resumed = {
    input_tokens: 10,
    cache_creation_input_tokens: 21392,
    cache_read_input_tokens: 0,
    output_tokens: 36,
    iterations: [{ input_tokens: 10 }],
  };
  assert.deepEqual(
    claudeResultOutput(
      resultLine({
        usage: resumed,
        modelUsage: {
          'claude-haiku-4-5': { inputTokens: 36, cacheCreationInputTokens: 42481, cacheReadInputTokens: 21875, outputTokens: 569 },
        },
      }),
    ).usage,
    { inputTokens: 21402, uncachedTokens: 10, cacheWriteTokens: 21392, cacheReadTokens: 0, outputTokens: 36 },
    'no peak: iterations holds the last response alone',
  );
  assert.equal(
    'usage' in
      claudeResultOutput(
        resultLine({ usage: { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 } }),
      ),
    false,
    'a usage whose input is 0 counted nothing: every response reads its prompt',
  );
  assert.equal(
    'usage' in claudeResultOutput(resultLine({ usage: { input_tokens: 10, output_tokens: 5 } })),
    false,
    'a class it left out: none of them, not a 0',
  );
});

test("what claude -p cost is its result's total_cost_usd, and its API time duration_api_ms — measured or absent, never 0", () => {
  assert.deepEqual(
    claudeResultOutput(resultLine({ total_cost_usd: 0.01804, duration_api_ms: 718, usage: { input_tokens: 0, output_tokens: 0 } })),
    { usage: { costUsd: 0.01804, apiMs: 718 } },
    'a result carries both, beside a usage whose token counts can read 0 where modelUsage counts thousands',
  );
  assert.deepEqual(
    claudeResultOutput(resultLine({ structured_output: { outcome: 'done' }, total_cost_usd: 0.2 })),
    { closeout: { payload: { outcome: 'done' } }, usage: { costUsd: 0.2 } },
    'beside the answer, and a count it does not give is not given',
  );
  assert.deepEqual(claudeResultOutput(JSON.stringify({ type: 'assistant', total_cost_usd: 1 })), {}, 'only a result says it');
});

test('REFUSED: a cost or an API time that is not a number of 0 or more is no absence: the output is refused, naming the line, the field and the fix', () => {
  assert.equal(
    refusedWith(() => claudeResultOutput(resultLine({ total_cost_usd: 'a lot', duration_api_ms: null }))),
    printedRefusal(1, 'a `result`', 'total_cost_usd', 'is "a lot", where Claude Code prints number'),
    'what is not a number is not read as no measurement',
  );
  assert.match(
    refusedWith(() => claudeResultOutput(resultLine({ total_cost_usd: -1 }))),
    /^line 1 of the `claude -p` output is a `result` line whose `total_cost_usd` is -1, where /,
  );
  assert.match(
    refusedWith(() => claudeStreamOutput(['a warning on stderr', resultLine({ duration_api_ms: null })].join('\n'))),
    /^line 2 of the `claude -p` output is a `result` line whose `duration_api_ms` is null, where Claude Code prints number\. /,
    'the stream reads the same result, and counts its lines from the first, stderr included',
  );
});

test('REFUSED: a call or an init line a stream reads that does not decode refuses the stream, naming its line and field; a line of a kind it does not read passes', () => {
  const block = (o: object) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'so' }, o] } });
  assert.equal(
    refusedWith(() => claudeStreamOutput([stream.init, block({ type: 'tool_use', id: 5, name: 'Bash', input: {} })].join('\n'))),
    printedRefusal(2, 'an `assistant`', 'message.content.1.id', 'is 5, where Claude Code prints string'),
  );
  assert.equal(
    refusedWith(() => claudeStreamOutput([stream.init, block({ type: 'tool_use', id: 'toolu_n', input: {} })].join('\n'))),
    printedRefusal(2, 'an `assistant`', 'message.content.1.name', 'is missing'),
  );
  const badInit = JSON.stringify({ ...JSON.parse(stream.init), cwd: 5 });
  assert.equal(
    refusedWith(() => claudeStreamOutput([badInit, resultLine({})].join('\n'))),
    printedRefusal(1, 'a `system` `init`', 'cwd', 'is 5, where Claude Code prints string'),
  );
  assert.deepEqual(
    claudeResultOutput([badInit, resultLine({ total_cost_usd: 0.2 })].join('\n')),
    { usage: { costUsd: 0.2 } },
    'json reads results alone',
  );
  const passing = [
    stream.init,
    JSON.stringify({ type: 'system', subtype: 'compact_boundary', cwd: 5, tool_use_id: 7, compact_metadata: { pre_tokens: 'x' } }),
    JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_use', id: 5 }] }, total_cost_usd: 'a lot' }),
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'no call' }] } }),
    resultLine({}),
  ];
  assert.deepEqual(claudeStreamOutput(passing.join('\n')), { skills: [] }, 'another subtype, another type, and a line with no call');
});

test("what claude -p was denied is its result's permission_denials, each by what a rule would name — and nothing when it was denied nothing", () => {
  const denials = [
    { tool_name: 'Write', tool_use_id: 'toolu_1', tool_input: { file_path: '/tmp/outside/x.txt', content: 'hi' } },
    { tool_name: 'WebFetch', tool_use_id: 'toolu_2', tool_input: { url: 'https://example.com', prompt: 'the title?' } },
    { tool_name: 'Bash', tool_use_id: 'toolu_3', tool_input: { command: "  python3 -c 'import os; print(42)'", description: 'make it' } },
    { tool_name: 'Skill', tool_use_id: 'toolu_4', tool_input: { skill: 'look' } },
    { tool_name: 'NotebookEdit', tool_use_id: 'toolu_5', tool_input: { notebook_path: '/r/n.ipynb' } },
    { tool_name: 'Bash', tool_use_id: 'toolu_6', tool_input: { command: '' } },
    { tool_name: 'WebFetch', tool_use_id: 'toolu_2', tool_input: { url: 'https://example.com' } },
  ];
  assert.deepEqual(
    claudeResultOutput(resultLine({ permission_denials: denials })).denials,
    [
      { tool: 'Write', what: '/tmp/outside/x.txt' },
      { tool: 'WebFetch' },
      { tool: 'Bash', what: 'python3' },
      { tool: 'Skill', what: 'look' },
      { tool: 'NotebookEdit', what: '/r/n.ipynb' },
      { tool: 'Bash' },
    ],
    'one per call, in order: a URL is not guessed at, an empty command is the tool alone',
  );
  assert.deepEqual(
    claudeResultOutput(
      resultLine({ permission_denials: [...denials.slice(0, 1), { tool_name: 'Read', tool_input: { file_path: '/r/a' } }] }),
    ).denials,
    [
      { tool: 'Write', what: '/tmp/outside/x.txt' },
      { tool: 'Read', what: '/r/a' },
    ],
    'a denial with no id is a call of its own',
  );
  assert.equal('denials' in claudeResultOutput(resultLine({ permission_denials: [] })), false, 'none denied: no key');
  assert.equal(
    refusedWith(() =>
      claudeResultOutput(
        resultLine({
          permission_denials: [...denials.slice(0, 6), { tool_use_id: 'toolu_7', tool_input: { command: 'ls' } }, ...denials.slice(6)],
        }),
      ),
    ),
    printedRefusal(1, 'a `result`', 'permission_denials.6.tool_name', 'is missing'),
    'a denial that names no tool is refused, never skipped',
  );
  assert.equal(
    refusedWith(() => claudeResultOutput(resultLine({ permission_denials: 'Write' }))),
    printedRefusal(1, 'a `result`', 'permission_denials', 'is "Write", where Claude Code prints array'),
    'not a list: refused, never read as no denial',
  );
  assert.deepEqual(
    claudeStreamOutput(resultLine({ permission_denials: denials.slice(0, 1) })).denials,
    [{ tool: 'Write', what: '/tmp/outside/x.txt' }],
    'the stream reads the same result',
  );
});

test("claude -p's stream says what it was denied as it happens, the input off the call of the same id — once each beside its result", () => {
  const log = [
    stream.init,
    stream.calls(['toolu_w', 'Write', { file_path: '/tmp/outside/x.txt', content: 'hi' }]),
    stream.denied('toolu_w', 'Write', {
      decision_reason_type: 'workingDir',
      decision_reason: 'Path is outside allowed working directories',
    }),
    stream.toolResult('toolu_w'),
    stream.calls(['toolu_u', 'Bash', { command: 'uname -a' }]),
    stream.toolResult('toolu_u'),
    stream.calls(['toolu_s', 'Skill', { skill: 'look' }], ['toolu_f', 'WebFetch', { url: 'https://example.com' }]),
    stream.denied('toolu_f', 'WebFetch', {}),
    stream.toolResult('toolu_f'),
    resultLine({
      total_cost_usd: 0.02,
      structured_output: { outcome: 'done' },
      permission_denials: [
        { tool_name: 'Write', tool_use_id: 'toolu_w', tool_input: { file_path: '/tmp/outside/x.txt', content: 'hi' } },
        { tool_name: 'WebFetch', tool_use_id: 'toolu_f', tool_input: { url: 'https://example.com' } },
      ],
    }),
  ].join('\n');
  assert.deepEqual(
    claudeStreamOutput(log),
    {
      closeout: { payload: { outcome: 'done' } },
      usage: { costUsd: 0.02 },
      denials: [{ tool: 'Write', what: '/tmp/outside/x.txt' }, { tool: 'WebFetch' }],
      skills: ['look'],
    },
    'a call allowed (uname, the skill) is not a denial, and each denied one is named once, not once per line that names it',
  );

  const killed = log.split('\n').slice(0, -1).join('\n');
  assert.deepEqual(
    claudeStreamOutput(killed),
    { denials: [{ tool: 'Write', what: '/tmp/outside/x.txt' }, { tool: 'WebFetch' }], skills: ['look'] },
    'killed before its result, by a stop or a signal, the events are all it says: every denial is still read',
  );
  assert.equal('denials' in claudeResultOutput(killed), false, '--output-format json has no events: it says nothing until its result');
});

test('a denial event whose call is not in the stream is the tool alone — and takes what its result says of it', () => {
  const lone = [stream.init, stream.denied('toolu_b', 'Bash')].join('\n');
  assert.deepEqual(claudeStreamOutput(lone), { denials: [{ tool: 'Bash' }], skills: [] });
  assert.deepEqual(
    claudeStreamOutput([lone, stream.denied('toolu_b', 'Bash'), 'not json "permission_denied"'].join('\n')),
    { denials: [{ tool: 'Bash' }], skills: [] },
    'named twice, once; a line that is not an event is skipped',
  );
  const withResult = [
    lone,
    stream.calls(['toolu_x', 'Read', { file_path: '/r/a' }]),
    resultLine({
      permission_denials: [
        { tool_name: 'Bash', tool_use_id: 'toolu_b', tool_input: { command: 'pytest -q' } },
        { tool_name: 'Read', tool_use_id: 'toolu_x', tool_input: { file_path: '/r/a' } },
      ],
    }),
  ].join('\n');
  assert.deepEqual(
    claudeStreamOutput(withResult).denials,
    [
      { tool: 'Bash', what: 'pytest' },
      { tool: 'Read', what: '/r/a' },
    ],
    "its place is the event's, its input the result's; what only the result names comes after",
  );
  assert.deepEqual(
    claudeStreamOutput(
      [stream.init, stream.calls(['toolu_q', 'Bash', { command: 'ls' }]), stream.toolResult('toolu_q'), resultLine({})].join('\n'),
    ),
    { skills: [] },
    'a stream that denied nothing says nothing of it',
  );
});

test("claude -p's stream says each skill its session loaded, once per call, by its name without the plugin's, beside what it was denied", () => {
  const read = claudeStreamOutput(SKILLS_STREAM);
  assert.deepEqual(read.skills, ['write-a-spec', 'look'], 'a call named again is one load; a load denied, or naming no skill, is none');
  assert.deepEqual(read.denials, [{ tool: 'Skill', what: 'grill-me' }], 'the denied load is a denial');
  assert.deepEqual(read.closeout?.payload, { outcome: 'done' });
});

test('a skill denied only in the result is no load', () => {
  const log = [
    stream.init,
    stream.calls(['toolu_k1', 'Skill', { skill: 'look' }], ['toolu_k2', 'Skill', { skill: 'grill-me' }]),
    resultLine({ permission_denials: [{ tool_name: 'Skill', tool_use_id: 'toolu_k2', tool_input: { skill: 'grill-me' } }] }),
  ].join('\n');
  assert.deepEqual(claudeStreamOutput(log).skills, ['look']);
});

test('a stream that started says the skills its session loaded even when it loaded none; one with no init line cannot say', () => {
  const none = [stream.init, stream.calls(['toolu_q', 'Bash', { command: 'ls' }]), resultLine({})].join('\n');
  assert.deepEqual(claudeStreamOutput(none), { skills: [] }, 'measured: none loaded');
  const unstarted = SKILLS_STREAM.split('\n').slice(1).join('\n');
  assert.equal('skills' in claudeStreamOutput(unstarted), false, 'no init line: no session known to have started, nothing measured');
  assert.equal('skills' in claudeResultOutput(SKILLS_STREAM), false, '--output-format json has no events: it cannot say');
});

test("claude -p's stream says each file its session read or wrote through its file tools, once, relative to its folder", () => {
  assert.deepEqual(
    claudeStreamOutput(FILES_STREAM).files,
    ['apps/web/a.tsx', 'b.ts', 'n.ipynb'],
    'a file read again is one; one outside its folder, one denied, and a call naming no file are none',
  );
});

test('a stream says the files its session touched only when its init line names its folder', () => {
  const none = [JSON.parse(FILES_STREAM.split('\n')[0]), { type: 'result', subtype: 'success' }].map((l) => JSON.stringify(l)).join('\n');
  assert.deepEqual(claudeStreamOutput(none).files, [], 'measured: none touched');
  assert.equal('files' in claudeStreamOutput(FILES_STREAM.split('\n').slice(1).join('\n')), false, 'no init line: nothing measured');
  assert.equal('files' in claudeStreamOutput(SKILLS_STREAM), false, 'an init line with no folder: no path can be made relative to it');
  assert.equal('files' in claudeResultOutput(FILES_STREAM), false, '--output-format json has no events: it cannot say');
});

test(
  "a spec that reads its harness's output reports the answer found there, with no time — nothing in the workspace",
  WAITED,
  async (t) => {
    const dir = root();
    const workspace = scratch('ae-ws-');
    const prints: HarnessSpec = {
      name: 'sh',
      readOutput: claudeResultOutput,
      command: () => ({
        cmd: 'sh',
        args: ['-c', `echo noise >&2; printf '%s\\n' '${resultLine({ structured_output: { outcome: 'done' } })}'`],
      }),
    };
    const ops = detachedOps(prints, dir);
    await Effect.runPromise(ops.spawn({ name: 'ae/t20/1', brief: 'x', cwd: workspace, closeoutSchema: { type: 'object' } }));

    const seen = await settle(t, ops, 'ae/t20/1', 'completed');
    assert.deepEqual(seen.closeout?.payload, { outcome: 'done' });
    assert.equal(
      'at' in seen.closeout,
      false,
      'no time: its own process wrote the log, after the spawn cleared the last one, whatever the clock says',
    );
    assert.deepEqual(fs.readdirSync(workspace), []);
  },
);

test(
  "what a harness's output says it denied the session is on the session's sighting, as the spec read it — and nothing when it denied nothing",
  WAITED,
  async (t) => {
    const dir = root();
    const denials = [{ tool: 'Bash', what: 'pytest' }, { tool: 'WebFetch' }];
    const says = (read: HarnessOutput): HarnessSpec => ({
      name: 'sh',
      readOutput: () => read,
      command: () => ({ cmd: 'sh', args: ['-c', 'echo out'] }),
    });
    const denied = detachedOps(says({ denials }), dir);
    await Effect.runPromise(denied.spawn(req('ae/t23/1', dir)));
    assert.deepEqual((await settle(t, denied, 'ae/t23/1', 'completed')).denials, denials);
    const none = detachedOps(says({ denials: [] }), dir);
    await Effect.runPromise(none.spawn(req('ae/t24/1', dir)));
    assert.equal('denials' in (await settle(t, none, 'ae/t24/1', 'completed')), false, 'an empty list is no key');
  },
);

test(
  "a run is not called over before the harness's last output is in its log — the answer read from it would be lost",
  WAITED,
  async (t) => {
    const dir = root();
    const late: HarnessSpec = {
      name: 'sh',
      readOutput: claudeResultOutput,
      command: () => ({
        cmd: 'sh',
        args: ['-c', `(sleep 0.4; printf '%s\\n' '${resultLine({ structured_output: { outcome: 'done' } })}') & exit 0`],
      }),
    };
    const ops = detachedOps(late, dir);
    await Effect.runPromise(ops.spawn({ name: 'ae/t21/1', brief: 'x', cwd: dir, closeoutSchema: {} }));

    let seen: Sighting | undefined;
    await until(
      t,
      async () => {
        seen = (await Effect.runPromise(ops.observe)).get('ae/t21/1');
        return seen && seen.state !== 'working';
      },
      () => `ae/t21/1 past working; last was ${seen?.state ?? 'nothing'}`,
      { everyMs: 20 },
    );
    assert.equal(
      seen?.state,
      'completed',
      'a child still prints when the harness exits: `exit` comes before the pipes drain, and the engine records the end on the first pass that sees done',
    );
    assert.deepEqual(seen?.closeout?.payload, { outcome: 'done' }, 'the first sighting that says done already has the answer');
  },
);

test('...and a child that holds a pipe open for good does not keep the run working', WAITED, async (t) => {
  const dir = root();
  const ops = detachedOps(sh('(sleep 30) & exit 0'), dir);
  const started = performance.now();
  await Effect.runPromise(ops.spawn(req('ae/t22/1', dir)));
  await settle(t, ops, 'ae/t22/1', 'completed');
  assert.ok(performance.now() - started < 10_000, 'ended within the drain bound, not when the child let go');
});

test('a re-spawn of the same attempt does not find the last answer in the output either', async () => {
  const dir = root();
  const quiet: HarnessSpec = { name: 'sh', readOutput: claudeResultOutput, command: () => ({ cmd: 'sh', args: ['-c', 'sleep 2'] }) };
  const ops = detachedOps(quiet, dir);
  const leftover = path.join(dir, 'runs', 'sh', 'ae_t23_1.log');
  fs.mkdirSync(path.dirname(leftover), { recursive: true });
  fs.writeFileSync(leftover, `${resultLine({ structured_output: { outcome: 'done' } })}\n`);

  await Effect.runPromise(ops.spawn({ name: 'ae/t23/1', brief: 'x', cwd: dir, closeoutSchema: {} }));
  assert.equal((await Effect.runPromise(ops.observe)).get('ae/t23/1')?.closeout, undefined);
});

test(
  'claude-detached at shipped defaults: a task that asked for a closeout gets the one it printed, and its session id',
  WAITED,
  async (t) => {
    const bin = scratch('ae-fake-claude-');
    fs.writeFileSync(
      path.join(bin, 'claude'),
      [
        '#!/bin/sh',
        `if [ "$1" = agents ]; then echo '[]'; exit 0; fi`,
        `printf '%s\\n' "$@" > '${bin}/argv'`,
        'echo "a warning" >&2',
        `printf '%s\\n' '${resultLine({ structured_output: { outcome: 'done' }, total_cost_usd: 0.0123, duration_api_ms: 850 })}'`,
      ].join('\n'),
      { mode: 0o755 },
    );
    const prev = process.env.PATH;
    process.env.PATH = `${bin}:${prev}`;
    try {
      const cwd = root();
      const engine = builtEngine(Engine.layer({ root: root() }));
      const schema = { type: 'object', properties: { outcome: { type: 'string' } } };
      const id = await Effect.runPromise(engine.file({ brief: 'the prompt', cwd, harness: 'claude-detached', closeoutSchema: schema }));
      await ticked(t, engine, id);
      const { state } = await Effect.runPromise(engine.view(id));
      assert.equal(state.settled, 'succeeded');
      assert.deepEqual(state.attempts[0]?.closeout, { outcome: 'done' }, 'the answer it printed, on the record');
      assert.equal(state.attempts[0]?.nativeId, SESSION, 'and the session id, from the same JSON');
      assert.deepEqual(state.attempts[0]?.usage, { costUsd: 0.0123, apiMs: 850 }, 'and what it cost, from the same JSON');
      const argv = fs.readFileSync(path.join(bin, 'argv'), 'utf8').split('\n');
      assert.deepEqual(JSON.parse(argv[argv.indexOf('--json-schema') + 1]), schema);
      assert.equal(argv[argv.indexOf('--output-format') + 1], 'json');
      assert.deepEqual(fs.readdirSync(cwd), [], 'nothing in the workspace');
    } finally {
      process.env.PATH = prev;
    }
  },
);

/** File a task on `spec` through an engine, tick it until it settles, and give back its state. */
const settledOn = async (t: Waiter, spec: HarnessSpec, task: { resumeFrom?: string } = {}) => {
  const engine = builtEngine(Engine.layer({ root: root(), harnesses: { sh: spec } }));
  const id = await Effect.runPromise(engine.file({ brief: 'x', cwd: root(), harness: 'sh', closeoutSchema: { type: 'object' }, ...task }));
  await ticked(t, engine, id);
  return (await Effect.runPromise(engine.view(id))).state;
};

/** This process's clock 10 s ahead of the files': the attempt is journalled after the moment its statement's file was written. */
const AHEAD_MS = 10_000;

test(
  "a detached statement it printed is on the record when this process's clock runs ahead of its files'",
  WAITED,
  async (t: TestContext) => {
    stepClock(t, AHEAD_MS);
    const prints: HarnessSpec = {
      name: 'sh',
      readOutput: claudeResultOutput,
      command: () => ({ cmd: 'sh', args: ['-c', `printf '%s\\n' '${resultLine({ structured_output: { outcome: 'done' } })}'`] }),
    };
    const state = await settledOn(t, prints);
    assert.equal(state.settled, 'succeeded');
    assert.deepEqual(state.attempts[0]?.closeout, { outcome: 'done' }, 'the answer it printed, on the record');
    assert.notEqual(state.attempts[0]?.stated, false);
  },
);

test(
  "a detached statement written to its closeout file is on the record when this process's clock runs ahead of its files'",
  WAITED,
  async (t: TestContext) => {
    stepClock(t, AHEAD_MS);
    const answers: HarnessSpec = {
      name: 'sh',
      command: (_r, io) => ({ cmd: 'sh', args: ['-c', `printf '%s' '{"outcome":"done"}' > '${io?.closeoutFile}'`] }),
    };
    const state = await settledOn(t, answers);
    assert.equal(state.settled, 'succeeded');
    assert.deepEqual(state.attempts[0]?.closeout, { outcome: 'done' }, 'the answer it wrote, on the record');
    assert.notEqual(state.attempts[0]?.stated, false);
  },
);

test("a resumed detached run that says nothing is not handed its parent's statement, from its file or its output", WAITED, async (t) => {
  const line = (o: object) => `printf '%s\\n' '${resultLine(o)}'`;
  const spec: HarnessSpec = {
    name: 'sh',
    readOutput: claudeResultOutput,
    command: (r, io) => ({
      cmd: 'sh',
      args: [
        '-c',
        r.resumeFrom
          ? line({ result: 'nothing to say' })
          : `printf '%s' '{"outcome":"parent"}' > '${io?.closeoutFile}'; ${line({ structured_output: { outcome: 'parent' } })}`,
      ],
    }),
  };
  const parent = await settledOn(t, spec);
  assert.deepEqual(parent.attempts[0]?.closeout, { outcome: 'parent' }, 'the parent stated');
  const child = await settledOn(t, spec, { resumeFrom: SESSION });
  assert.equal(child.attempts[0]?.closeout, undefined, "the parent's statement is not the child's");
  assert.equal(child.attempts[0]?.stated, false, 'and the child is on the record as not having stated');
});

test(
  'claude-detached, filed through the engine with disallowedTools, spawns claude with --disallowedTools and the rules',
  WAITED,
  async (t) => {
    const bin = scratch('ae-fake-claude-');
    fs.writeFileSync(
      path.join(bin, 'claude'),
      [
        '#!/bin/sh',
        `if [ "$1" = agents ]; then echo '[]'; exit 0; fi`,
        `printf '%s\\n' "$@" > '${bin}/argv'`,
        `printf '%s\\n' '${resultLine({ structured_output: { outcome: 'done' } })}'`,
      ].join('\n'),
      { mode: 0o755 },
    );
    const prev = process.env.PATH;
    process.env.PATH = `${bin}:${prev}`;
    try {
      const engine = builtEngine(Engine.layer({ root: root() }));
      const rules = ['Bash(npm run build)', 'Bash(npm run e2e)'];
      const allow = ['Write(**)'];
      const id = await Effect.runPromise(
        engine.file({
          brief: 'the prompt',
          cwd: root(),
          harness: 'claude-detached',
          config: { tools: ['Read', 'Bash'], disallowedTools: rules, allowedTools: allow },
        }),
      );
      await ticked(t, engine, id);
      assert.deepEqual((await Effect.runPromise(engine.view(id))).state.config?.disallowedTools, rules, 'on the record');
      const argv = fs.readFileSync(path.join(bin, 'argv'), 'utf8').split('\n');
      const i = argv.indexOf('--disallowedTools');
      assert.notEqual(i, -1, argv.join(' '));
      assert.equal(argv[i + 1], 'Bash(npm run build),Bash(npm run e2e)');
      assert.match(argv[i + 2], /^--/, 'a flag ends the variadic list');
      assert.deepEqual(
        (await Effect.runPromise(engine.view(id))).state.config?.allowedTools,
        allow,
        'and the allow list beside it, on the record',
      );
      const a = argv.indexOf('--allowedTools');
      assert.notEqual(a, -1, argv.join(' '));
      assert.equal(argv[a + 1], 'Write(**)');
      assert.equal(argv[a + 2], '--settings', 'a flag ends this variadic list too');
    } finally {
      process.env.PATH = prev;
    }
  },
);

test('REFUSED: a deny list on codex, which has no tool list to take from — in its own words, naming the sandbox', async () => {
  const { codex } = await import('../src/harness/codex/codex.ts');
  assert.match(
    codex.refuses!({ brief: 'b', cwd: '/r', config: { disallowedTools: ['Bash(git push)'] } }) ?? '',
    /is a deny list, and Codex has no tool list to take from.*`permissionMode`/,
  );
  assert.equal(codex.refuses!({ brief: 'b', cwd: '/r', config: { disallowedTools: [] } }), undefined, 'an empty list denies nothing');
  const args = codex.command({ name: 'ae/t/1', brief: 'b', cwd: '/r', config: { disallowedTools: ['SendMessage'] } }).args;
  assert.equal(
    args.some((a) => a.includes('SendMessage')),
    false,
    'a direct caller is given no flag codex does not have',
  );
});

test('REFUSED: an allow list on codex, for the same reason and in the same shape — one shell, fenced by its sandbox', async () => {
  const { codex } = await import('../src/harness/codex/codex.ts');
  assert.match(
    codex.refuses!({ brief: 'b', cwd: '/r', config: { allowedTools: ['Write(**)'] } }) ?? '',
    /is an allow list, and Codex has no tool list to allow from.*`permissionMode`/,
  );
  assert.equal(codex.refuses!({ brief: 'b', cwd: '/r', config: { allowedTools: [] } }), undefined, 'an empty list allows nothing extra');
  const args = codex.command({ name: 'ae/t/1', brief: 'b', cwd: '/r', config: { allowedTools: ['Write(**)'] } }).args;
  assert.equal(
    args.some((a) => a.includes('Write(**)')),
    false,
    'a direct caller is given no flag codex does not have',
  );
});

test('codex at shipped defaults: what the attempt consumed is read from its exec --json stream and recorded on it', WAITED, async (t) => {
  const bin = scratch('ae-fake-codex-');
  const stream = [
    { type: 'thread.started', thread_id: '01a09996-d343-7932-8971-b2f209ba315b' },
    { type: 'turn.started' },
    { type: 'item.started', item: { id: 'item_1', type: 'command_execution', command: 'ls', status: 'in_progress' } },
    { type: 'item.completed', item: { id: 'item_1', type: 'command_execution', exit_code: 0, status: 'completed' } },
    {
      type: 'turn.completed',
      usage: { input_tokens: 1200, cached_input_tokens: 1000, cache_write_input_tokens: 0, output_tokens: 80, reasoning_output_tokens: 8 },
    },
  ];
  fs.writeFileSync(
    path.join(bin, 'codex'),
    ['#!/bin/sh', 'echo "Reading additional input from stdin..." >&2', ...stream.map((e) => `printf '%s\\n' '${JSON.stringify(e)}'`)].join(
      '\n',
    ),
    { mode: 0o755 },
  );
  fs.writeFileSync(path.join(bin, 'claude'), `#!/bin/sh\nif [ "$1" = agents ]; then echo '[]'; fi\n`, { mode: 0o755 });
  const prev = { PATH: process.env.PATH, CODEX_HOME: process.env.CODEX_HOME };
  process.env.PATH = `${bin}:${prev.PATH}`;
  process.env.CODEX_HOME = root();
  try {
    const engine = builtEngine(Engine.layer({ root: root() }));
    const id = await Effect.runPromise(engine.file({ brief: 'the prompt', cwd: root(), harness: 'codex' }));
    await ticked(t, engine, id);
    const { state } = await Effect.runPromise(engine.view(id));
    assert.equal(state.settled, 'succeeded');
    assert.deepEqual(
      state.attempts[0]?.usage,
      { toolCalls: 1, inputTokens: 1200, uncachedTokens: 200, cacheWriteTokens: 0, cacheReadTokens: 1000, outputTokens: 80 },
      'measured, and nothing it did not measure',
    );
    assert.equal(state.attempts[0]?.exitCode, 0);
    assert.equal(state.attempts[0]?.nativeId, '01a09996-d343-7932-8971-b2f209ba315b');
  } finally {
    process.env.PATH = prev.PATH;
    if (prev.CODEX_HOME === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = prev.CODEX_HOME;
  }
});

test("a resumed run of a spec whose totals carry the parent's reports its own cost and API time — the parent's taken off, the last run before it under that id", async () => {
  const dir = root();
  const spec: HarnessSpec = { ...sh('true'), readOutput: claudeResultOutput, resumeCostCarried: true };
  const ops = detachedOps(spec, dir);
  const runs = path.join(dir, 'runs', 'sh');
  fs.mkdirSync(runs, { recursive: true });
  const t0 = Date.parse('2026-09-23T12:00:00Z');
  const write = (name: string, at: number, patch: object, result: object) => {
    const file = name.replace(/\//g, '_');
    fs.writeFileSync(
      path.join(runs, `${file}.json`),
      JSON.stringify({
        name,
        state: 'done',
        exitCode: 0,
        pid: 999999,
        logFile: '/dev/null',
        nativeId: SESSION,
        startedAt: new Date(at).toISOString(),
        heartbeatAt: new Date(at).toISOString(),
        ...patch,
      }),
    );
    fs.writeFileSync(path.join(runs, `${file}.log`), resultLine(result));
  };
  const tokens = { input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 5 };
  write('ae/r/3', t0 + 2_000, { resumeFrom: SESSION }, { total_cost_usd: 0.0284121, duration_api_ms: 8132, usage: tokens });
  write('ae/r/2', t0 + 1_000, { resumeFrom: SESSION }, { total_cost_usd: 0.0257381, duration_api_ms: 7142, usage: tokens });
  write('ae/r/1', t0, {}, { total_cost_usd: 0.0209649, duration_api_ms: 6069, usage: tokens });
  const seen = await Effect.runPromise(ops.observe);
  const near = (got: number | undefined, want: number) =>
    assert.ok(got !== undefined && Math.abs(got - want) < 1e-9, `${got} is not ${want}`);
  const told = await Effect.runPromise(detachedOps(spec, dir).observeFor!([{ name: 'ae/r/3' }, { name: 'ae/r/2' }]));
  assert.deepEqual(
    [told.seen.get('ae/r/3')?.usage, told.seen.get('ae/r/2')?.usage],
    [seen.get('ae/r/3')?.usage, seen.get('ae/r/2')?.usage],
    "a run file spawned before its parent's totals were carried on it has them found among the run files, asked for by name too",
  );
  assert.equal(seen.get('ae/r/1')?.usage?.costUsd, 0.0209649, 'a run that resumed nothing is its own total');
  near(seen.get('ae/r/2')?.usage?.costUsd, 0.0047732);
  near(seen.get('ae/r/3')?.usage?.costUsd, 0.002674);
  assert.equal(
    seen.get('ae/r/2')?.usage?.apiMs,
    1073,
    "a session, its resume and a resume of that, all under one id, as Claude Code prints their totals: the parent's taken off each",
  );
  assert.equal(
    seen.get('ae/r/3')?.usage?.apiMs,
    990,
    'written latest first: the parent taken off is the run started last before it, whatever order the directory lists',
  );
  assert.equal(seen.get('ae/r/2')?.usage?.inputTokens, 10, "tokens are the process's own already, and kept as printed");
});

test("a resume whose parent is not a run of this spec, or printed no total, carries no cost — never its parent's too", async () => {
  const dir = root();
  const spec: HarnessSpec = { ...sh('true'), readOutput: claudeResultOutput, resumeCostCarried: true };
  const ops = detachedOps(spec, dir);
  const runs = path.join(dir, 'runs', 'sh');
  fs.mkdirSync(runs, { recursive: true });
  const write = (name: string, patch: object, result: object) => {
    const file = name.replace(/\//g, '_');
    fs.writeFileSync(
      path.join(runs, `${file}.json`),
      JSON.stringify({
        name,
        state: 'done',
        exitCode: 0,
        pid: 999999,
        logFile: '/dev/null',
        startedAt: '2026-09-23T12:00:01Z',
        heartbeatAt: '2026-09-23T12:00:01Z',
        ...patch,
      }),
    );
    fs.writeFileSync(path.join(runs, `${file}.log`), resultLine(result));
  };
  const OTHER = '11111111-2222-3333-4444-555555555555';
  write(
    'ae/u/2',
    { nativeId: OTHER, resumeFrom: OTHER },
    {
      total_cost_usd: 0.03,
      duration_api_ms: 7000,
      usage: { input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 5 },
    },
  );
  write('ae/v/1', { nativeId: SESSION, startedAt: '2026-09-23T12:00:00Z' }, { usage: { input_tokens: 1, output_tokens: 1 } });
  write('ae/v/2', { nativeId: SESSION, resumeFrom: SESSION }, { total_cost_usd: 0.03, duration_api_ms: 7000 });
  const seen = await Effect.runPromise(ops.observe);
  assert.deepEqual(
    seen.get('ae/u/2')?.usage,
    { inputTokens: 10, uncachedTokens: 10, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 5 },
    'no parent: no cost and no API time, the tokens kept',
  );
  assert.equal(seen.get('ae/v/2')?.usage, undefined, 'a parent with no total: nothing left to say');

  const plain = detachedOps({ ...spec, resumeCostCarried: undefined }, dir);
  assert.equal(
    (await Effect.runPromise(plain.observe)).get('ae/u/2')?.usage?.costUsd,
    0.03,
    'a spec whose harness prints its own totals keeps them, resumed or not',
  );
});

test("the id a run resumed is kept on its run file only by a spec whose totals carry the parent's", async () => {
  const dir = root();
  const read = (spec: HarnessSpec, name: string) => {
    const ops = detachedOps(spec, dir);
    return Effect.runPromise(ops.spawn({ ...req(name, dir), resumeFrom: SESSION })).then(() =>
      JSON.parse(fs.readFileSync(path.join(dir, 'runs', spec.name, `${name.replace(/\//g, '_')}.json`), 'utf8')),
    );
  };
  assert.equal((await read({ ...sh('true'), resumeCostCarried: true }, 'ae/w/1')).resumeFrom, SESSION);
  assert.equal('resumeFrom' in (await read({ ...sh('true'), name: 'other' }, 'ae/w/2')), false);
});

/** A run file in `dir`'s `sh` runs, as a worker leaves it once its harness has exited 0, with `log` as its output. */
const doneRun = (dir: string, name: string, patch: object = {}, log = resultLine({ total_cost_usd: 0.01 })) => {
  const runs = path.join(dir, 'runs', 'sh');
  fs.mkdirSync(runs, { recursive: true });
  const file = name.replace(/[^a-zA-Z0-9]+/g, '_');
  const at = '2026-09-23T12:00:00Z';
  fs.writeFileSync(
    path.join(runs, `${file}.json`),
    JSON.stringify({ name, state: 'done', exitCode: 0, pid: 999999, logFile: '/dev/null', startedAt: at, heartbeatAt: at, ...patch }),
  );
  fs.writeFileSync(path.join(runs, `${file}.log`), log);
};

/** How many files `f` reads through the runtime's readers. */
const readsOf = async (f: () => Promise<unknown>) => {
  const before = ioCounts().reads;
  await f();
  return ioCounts().reads - before;
};

test('a detached look reads the run file and output of each session it is asked about and no other', async () => {
  const dir = root();
  const spec: HarnessSpec = { ...sh('true'), readOutput: claudeResultOutput };
  for (let i = 0; i < 200; i++) doneRun(dir, `ae/s${i}/1`, { nativeId: SESSION });
  doneRun(dir, 'ae/asked/1', { nativeId: SESSION }, resultLine({ total_cost_usd: 0.25, duration_api_ms: 900 }));
  const full = await Effect.runPromise(detachedOps(spec, dir).observe);
  assert.equal(full.size, 201, 'listed in full, and what each output said kept beside it');

  const ops = detachedOps(spec, dir);
  let told: Observation | undefined;
  const reads = await readsOf(async () => {
    told = await Effect.runPromise(ops.observeFor!([{ name: 'ae/asked/1' }]));
  });
  assert.ok(reads <= 3, `read ${reads} files: its run file, what its output said and its closeout, and no other run's`);
  assert.deepEqual([...told!.seen.keys()], ['ae/asked/1']);
  assert.deepEqual(told!.unread, new Set());
  assert.deepEqual(told!.seen.get('ae/asked/1'), full.get('ae/asked/1'), 'the sighting the full listing gives');
});

test("a name asked for with no run file is absent, one whose run file is there and unreadable is unread, and a name whose path holds another name's run is absent", async () => {
  const dir = root();
  const ops = detachedOps(sh('true'), dir);
  doneRun(dir, 'ae/a/b/1');
  const runs = path.join(dir, 'runs', 'sh');
  fs.writeFileSync(path.join(runs, 'ae_h_1.json'), '{"name":');
  fs.writeFileSync(
    path.join(runs, 'ae_p_1.json'),
    JSON.stringify({ name: 'ae/p/1', state: 'done', logFile: '/dev/null', heartbeatAt: new Date().toISOString() }),
  );
  const told = await Effect.runPromise(
    ops.observeFor!([{ name: 'ae/none/1' }, { name: 'ae/h/1' }, { name: 'ae/p/1' }, { name: 'ae/a_b/1' }, { name: 'ae/a/b/1' }]),
  );
  assert.deepEqual([...told.seen.keys()], ['ae/a/b/1'], 'a run file is the run under its own name alone');
  assert.deepEqual(told.unread, new Set(['ae/h/1', 'ae/p/1']), 'half written, or with no pid: neither there nor gone');
});

test('REFUSED: a run asked for whose output the spec refuses is unread at work and failed once ended, naming the run and its output; through the composite, the names routed there are unread while they run', async () => {
  const dir = root();
  const spec: HarnessSpec = {
    ...sh('true'),
    readOutput: () => {
      throw new Error('no result line in it');
    },
  };
  doneRun(dir, 'ae/w/1', { state: 'working', heartbeatAt: new Date().toISOString() });
  doneRun(dir, 'ae/d/1');
  const ops = detachedOps(spec, dir);
  const { value, warnings } = await warned(ops.observeFor!([{ name: 'ae/w/1' }, { name: 'ae/d/1' }]));
  assert.deepEqual(value.unread, new Set(['ae/w/1']), 'at work: neither there nor gone');
  assert.equal(value.seen.get('ae/d/1')?.state, 'failed', 'ended: failed, never completed');
  assert.deepEqual(
    warnings.map((w) => w.split(' It is unread')[0]),
    ['ae_w_1', 'ae_d_1'].map(
      (f) => `sh: \`${f.replace(/_/g, '/')}\`'s output, ${path.join(dir, 'runs', 'sh', `${f}.log`)}, cannot be read: no result line in it.`,
    ),
  );
  const other = new Map<string, Sighting>([['ae/o/1', { sessionId: 'o', state: 'working' }]]);
  const both = composite({ sh: ops, other: testOps({ sessions: other }) }, 'other');
  const told = await Effect.runPromise(
    both.observeFor!([
      { name: 'ae/w/1', harness: 'sh' },
      { name: 'ae/o/1', harness: 'other' },
    ]),
  );
  assert.deepEqual(told.unread, new Set(['ae/w/1']));
  assert.deepEqual([...told.seen.keys()], ['ae/o/1']);
});

test(
  "a resumed run's spawn carries its parent's totals on its run file, and a look by name takes them off reading no parent",
  WAITED,
  async (t) => {
    const dir = root();
    const OTHER = '11111111-2222-3333-4444-555555555555';
    const t0 = Date.parse('2026-09-23T12:00:00Z');
    const parent = (name: string, at: number, result: object, nativeId = SESSION) =>
      doneRun(dir, name, { nativeId, startedAt: new Date(at).toISOString() }, resultLine(result));
    parent('ae/r/1', t0, { total_cost_usd: 0.0209649, duration_api_ms: 6069 });
    parent('ae/r/3', t0 + 2_000, { total_cost_usd: 0.0284121, duration_api_ms: 8132 });
    parent('ae/r/2', t0 + 1_000, { total_cost_usd: 0.0257381, duration_api_ms: 7142 });
    parent('ae/v/1', t0, { usage: { input_tokens: 1, output_tokens: 1 } }, OTHER);
    const printing = (result: object): HarnessSpec => ({
      ...sh(`echo '${resultLine(result)}'`),
      readOutput: claudeResultOutput,
      resumeCostCarried: true,
    });
    const runOn = (name: string) => JSON.parse(fs.readFileSync(path.join(dir, 'runs', 'sh', `${name.replace(/\//g, '_')}.json`), 'utf8'));
    const spec = printing({ total_cost_usd: 0.031, duration_api_ms: 9000 });
    await Effect.runPromise(detachedOps(spec, dir).spawn({ ...req('ae/r/4', dir), resumeFrom: SESSION }));
    assert.deepEqual(runOn('ae/r/4').carried, { costUsd: 0.0284121, apiMs: 8132 }, 'the latest run before it under the id');
    await settle(t, detachedOps(spec, dir), 'ae/r/4', 'completed');
    assert.deepEqual(runOn('ae/r/4').carried, { costUsd: 0.0284121, apiMs: 8132 }, 'kept by its worker');

    for (const n of [1, 2, 3]) fs.rmSync(path.join(dir, 'runs', 'sh', `ae_r_${n}.json`));
    const ops = detachedOps(spec, dir);
    let told: Observation | undefined;
    const reads = await readsOf(async () => {
      told = await Effect.runPromise(ops.observeFor!([{ name: 'ae/r/4' }]));
    });
    assert.ok(reads <= 3, `read ${reads} files, none of its parent's`);
    const usage = told!.seen.get('ae/r/4')?.usage;
    assert.ok(usage?.costUsd !== undefined && Math.abs(usage.costUsd - 0.0025879) < 1e-9, `cost ${usage?.costUsd}`);
    assert.equal(usage?.apiMs, 868, 'its own API time, its parent gone from the folder');

    await Effect.runPromise(detachedOps(spec, dir).spawn({ ...req('ae/u/1', dir), resumeFrom: '00000000-0000-4000-8000-000000000000' }));
    assert.deepEqual(runOn('ae/u/1').carried, {}, 'no parent: nothing carried');
    await Effect.runPromise(detachedOps(spec, dir).spawn({ ...req('ae/v/2', dir), resumeFrom: OTHER }));
    assert.deepEqual(runOn('ae/v/2').carried, {}, 'a parent that printed no total: nothing carried');
    await Effect.runPromise(
      detachedOps({ ...spec, resumeCostCarried: undefined }, dir).spawn({ ...req('ae/n/1', dir), resumeFrom: SESSION }),
    );
    assert.equal('carried' in runOn('ae/n/1'), false, 'a spec whose harness prints its own totals carries none');
    for (const name of ['ae/r/4', 'ae/u/1', 'ae/v/2', 'ae/n/1']) await settle(t, detachedOps(spec, dir), name, 'completed');
  },
);

test('find and stop read the one run file of the session they are given, among many', async () => {
  const dir = root();
  const spec = sh('true');
  for (let i = 0; i < 50; i++) doneRun(dir, `ae/s${i}/1`);
  const ops = detachedOps(spec, dir);
  assert.equal(await readsOf(() => Effect.runPromise(detachedFind(spec, dir)('ae/s7/1'))), 1, 'found off its run file');
  assert.equal(await readsOf(() => Effect.runPromise(ops.stop('ae/s7/1'))), 1, 'a run over is not stopped, read off its run file');
  assert.equal(await readsOf(() => Effect.runPromise(ops.stop('ae/none/1'))), 0, 'no run file: nothing read, nothing stopped');
});

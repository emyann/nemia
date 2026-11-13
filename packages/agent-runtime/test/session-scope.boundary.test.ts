/**
 * A session's scope is its Pod, on a real systemd user manager: whatever a session's commands started, wherever from, is ended with
 * the session. A detached command job, unlimited and limited, whose command leaves a child that left its process group and session
 * (`setsid`) and ignores SIGTERM, ends `succeeded`; the release of its finished session is refused while the child runs, and once the
 * passes have sent it SIGTERM and then, past the runner's stop grace (shortened here), killed its scope, the child is gone and so is the
 * scope's folder. A held session on the stand-in Claude Code that leaves the same child loses it when the session is stopped.
 *
 * Skipped, with the probe's words, on a host that cannot make a scope (`scopeRefusal`). The rows of a host whose probe passed and whose
 * later `systemd-run` fails stand a program in for it (`scopeProgram`), so they run anywhere: the session runs bare, as it would with no
 * scope, and its run file says why.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { Engine as EngineService } from '../src/index.ts';
import { commandHarness } from '../src/harness/command/command.ts';
import { detachedOps } from '../src/harness/detached/detached.ts';
import { scopeRefusal } from '../src/harness/cgroup.ts';
import { RunnerError } from '../src/harness/seam.ts';
import { scratch } from 'test-kit/scratch';
import { builtEngine } from './engine.ts';
import { until, WAITED } from '../src/waits/index.ts';
import { holder, kept, NAME, run } from './attached-held.ts';
import { filesOf, writeRun } from '../src/harness/claude/attached-file.ts';
import { spawn } from 'node:child_process';

const refused = scopeRefusal();
const SKIP = refused ? { skip: refused } : {};
/** The runner's stop grace, shortened from the shipped `WORKER_STOP_GRACE_MS`; the heartbeat with it. */
const QUICK = { stopGraceMs: 300, beatMs: 200 } as const;

/** Whether the process `pid` is still there: signal 0 reaches it. */
const there = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** Kills the process `pid` when the test ends, whatever became of it: a test that fails leaves no `sleep 600` behind. */
const bounded = (t: TestContext, pid: number) =>
  t.after(() => {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {}
  });

/** The pid written in `file`, once it is there. */
const pidIn = async (t: TestContext, file: string, what: string): Promise<number> => {
  let pid = 0;
  await until(
    t,
    () => {
      pid = fs.existsSync(file) ? Number(fs.readFileSync(file, 'utf8').trim()) : 0;
      return pid > 0;
    },
    what,
    { everyMs: 20 },
  );
  return pid;
};

/** A command that leaves a child out of its group and session, deaf to SIGTERM and SIGHUP, its pid in `file`, and exits 0. */
const leaving = (file: string) => ['sh', '-c', `setsid sh -c "trap '' TERM HUP; echo \\$\\$ > '${file}'; exec sleep 600" & exit 0`];

/** The run file of the detached run of the task `id` under `root`, as the worker wrote it. */
const runFileOf = (root: string, id: string, end = 'json'): { cgroup?: string; unscoped?: string; pid?: number } | undefined => {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, 'runs', 'command', `ae_${id.replace(/[^a-zA-Z0-9]+/g, '_')}_1.${end}`), 'utf8'));
  } catch {
    return undefined;
  }
};

for (const limited of [false, true])
  test(
    `${limited ? 'a limited' : 'an unlimited'} job's child that left its group and ignores SIGTERM is ended with its scope, and the release waits for it`,
    { ...WAITED, ...SKIP },
    async (t) => {
      const root = scratch('ae-scope-');
      const cwd = scratch('ae-scope-cwd-');
      const ops = detachedOps(commandHarness, root, QUICK);
      const engine = builtEngine(EngineService.layer({ root, harnesses: { command: ops } }));
      const left = path.join(cwd, 'left');
      const id = await Effect.runPromise(
        engine.file({
          brief: 'leave a child',
          cwd,
          harness: 'command',
          config: { command: leaving(left) },
          ...(limited ? { resources: { limits: { memory: '256Mi' } } } : {}),
        }),
      );
      const state = async () => (await Effect.runPromise(engine.view(id))).state;
      await until(
        t,
        async () => {
          await Effect.runPromise(engine.tick());
          return (await state()).settled !== null;
        },
        'the job settled',
        { everyMs: 50 },
      );
      assert.equal((await state()).settled, 'succeeded');
      const child = await pidIn(t, left, 'the child wrote its pid');
      bounded(t, child);
      const sighting = (await Effect.runPromise(ops.observe)).get(`ae/${id}/1`);
      assert.ok(sighting, 'the runner still lists the finished session');
      if (there(child)) {
        const release = ops.release;
        assert.ok(release, 'the detached runner releases');
        const again = await Effect.runPromise(Effect.flip(release(sighting, {})));
        assert.ok(again instanceof RunnerError, 'a release while the child runs is refused, so the next pass asks again');
      } else assert.fail('the child was gone before any release asked: nothing was left to show the scope ends it');

      await until(
        t,
        async () => {
          await Effect.runPromise(engine.tick());
          return !there(child);
        },
        'the child is gone after the passes that release the session',
        { everyMs: 50 },
      );
      assert.equal(runFileOf(root, id, 'launched')?.pid, runFileOf(root, id)?.pid, 'the worker the spawn names is the one in the scope');
      const scope = runFileOf(root, id)?.cgroup;
      assert.match(scope ?? '', /^\/sys\/fs\/cgroup\/.+\.scope$/, `the worker recorded its scope: ${String(scope)}`);
      await until(t, () => !fs.existsSync(scope ?? ''), 'the scope is collected', { everyMs: 20 });
    },
  );

test(
  'a held session’s child that left its group is ended with its scope when the session is stopped',
  { ...WAITED, ...SKIP },
  async (t) => {
    const { root, dir, request } = kept({ leave: true });
    const h = await holder(root);
    t.after(async () => {
      fs.writeFileSync(path.join(dir, 'end'), '');
      await h.close();
    });
    await Effect.runPromise(h.attached.ops.spawn(request));
    await until(t, () => run(root)?.state === 'idle', 'the session idle after its first turn', { everyMs: 50 });
    const child = await pidIn(t, path.join(dir, 'left'), 'the stand-in’s child wrote its pid');
    bounded(t, child);
    await Effect.runPromise(h.attached.ops.stop(NAME));
    await until(t, () => run(root)?.state === 'canceled', 'the session ended canceled', { everyMs: 50 });
    await until(t, () => !there(child), 'its child is gone with its scope', { everyMs: 20 });
    const scope = run(root)?.cgroup;
    assert.match(String(scope), /^\/sys\/fs\/cgroup\/.+\.scope$/, `the holder recorded the session's scope: ${String(scope)}`);
  },
);

test(
  'a held session that ended with its scope still holding a process is released only once the holder has killed what was left',
  { ...WAITED, ...SKIP },
  async (t) => {
    const { root, dir, request } = kept({});
    const left = path.join(dir, 'left');
    const scoped = spawn(
      'systemd-run',
      ['--user', '--scope', '--quiet', '--collect', '--', 'sh', '-c', `echo $$ > '${left}'; exec sleep 600`],
      {
        stdio: 'ignore',
      },
    );
    t.after(() => void scoped.kill('SIGKILL'));
    const child = await pidIn(t, left, 'the scoped sleep wrote its pid');
    bounded(t, child);
    const scope = `/sys/fs/cgroup${fs.readFileSync(`/proc/${child}/cgroup`, 'utf8').trim().slice(3)}`;
    fs.mkdirSync(path.dirname(filesOf(root, NAME).run), { recursive: true });
    writeRun(root, {
      name: NAME,
      state: 'completed',
      owner: process.pid,
      startedAt: new Date().toISOString(),
      sessionId: 'ended',
      cgroup: scope,
      request: { ...request, brief: undefined },
    });
    const h = await holder(root);
    t.after(h.close);
    const seen = (await Effect.runPromise(h.attached.ops.observe)).get(NAME);
    assert.ok(seen, 'the holder lists the ended session');
    const release = h.attached.ops.release;
    assert.ok(release, 'the holder releases');
    const again = await Effect.runPromise(Effect.flip(release(seen, {})));
    assert.ok(again instanceof RunnerError, 'refused while its scope held a process, so the next pass asks again');
    await until(t, () => !there(child), 'what its scope held is killed', { everyMs: 20 });
    await until(t, () => !fs.existsSync(scope), 'the scope is collected', { everyMs: 20 });
    await Effect.runPromise(release(seen, {}));
  },
);

/**
 * A scope's program stood in (`scopeProgram`) for a host whose probe passed and whose later `systemd-run` fails: it answers the probe a
 * scope's `memory.max` of 256Mi, and refuses anything else, as `systemd-run` does when it cannot reach the user manager.
 */
const failingScope = () => {
  const program = path.join(scratch('ae-scope-program-'), 'scope.sh');
  fs.writeFileSync(
    program,
    [
      '#!/bin/sh',
      'while [ "$1" != "--" ]; do shift; done; shift',
      'if [ "$1" = sh ] && [ "$2" = -c ]; then echo 268435456; exit 0; fi',
      'echo "Failed to start transient scope unit: stood in" >&2',
      'exit 1',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  return program;
};

test('an unlimited session whose scope cannot be made runs bare, as with no scope, and says why', WAITED, async (t) => {
  await t.test('a detached job', async (sub) => {
    const root = scratch('ae-scope-');
    const cwd = scratch('ae-scope-cwd-');
    const ops = detachedOps(commandHarness, root, { ...QUICK, scopeProgram: failingScope() });
    await Effect.runPromise(ops.spawn({ name: 'ae/t1/1', brief: 'x', cwd, config: { command: ['sh', '-c', 'exit 0'] } }));
    let last: string | undefined;
    await until(
      sub,
      async () => {
        last = (await Effect.runPromise(ops.observe)).get('ae/t1/1')?.state;
        return last === 'completed';
      },
      () => `the job completed; last was ${last ?? 'nothing'}`,
      { everyMs: 50 },
    );
    const written = runFileOf(root, 't1');
    assert.equal(typeof written?.unscoped, 'string', 'its run file says why it ran bare');
    assert.equal(written?.cgroup, undefined, 'and records no scope');
  });

  await t.test('a held session', async (sub) => {
    const { root, dir, request } = kept({});
    const h = await holder(root, undefined, undefined, { scopeProgram: failingScope() });
    sub.after(async () => {
      fs.writeFileSync(path.join(dir, 'end'), '');
      await h.close();
    });
    await Effect.runPromise(h.attached.ops.spawn(request));
    await until(sub, () => run(root)?.state === 'idle', 'the session idle after its first turn', { everyMs: 50 });
    assert.equal(typeof run(root)?.unscoped, 'string', 'its run file says why it ran bare');
    assert.equal(run(root)?.cgroup, undefined, 'and records no scope');
  });
});

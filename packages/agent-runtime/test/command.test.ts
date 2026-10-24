/**
 * The command harness, against the REAL worker: a task's `config.command` run in its folder, its stdout and its stderr each read
 * back whole through `output`, its exit code on the attempt, its `env` and its `niceness` as the process sees them.
 *
 * What the tests below rest on:
 * - The engine is given the command harness alone, so no tick observes this machine's `claude` registry.
 * - One attempt per start: a task's end is its only attempt's, and `output` reads that attempt's streams.
 * - The story files its tasks together on one engine and ticks them to their ends at once: each command's worker is its own
 *   process, so one task's streams are never another's.
 * - `ionice -c3` runs on some machines and not others: a test asks `nice -n 10 ionice -c3 true`, as the harness does, and holds
 *   the harness to the answer either way.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Engine as EngineService } from '../src/index.ts';
import { commandHarness } from '../src/harness/command/command.ts';
import { detachedOps } from '../src/harness/detached/detached.ts';
import { codex } from '../src/harness/codex/codex.ts';
import { scratch } from './scratch.ts';
import { builtEngine } from './engine.ts';
import { story } from './checkpoints.ts';
import { until, WAITED } from '../src/waits/index.ts';

/**
 * This process's own niceness, which a worker it spawns inherits: a test runs at whatever niceness and IO class its parent gave it, so
 * a niceness is read relative to this one, and an argv the IO class would hide is proven by calling the harness's `command`.
 */
const ownNiceness = (): number => Number(spawnSync('ps', ['-o', 'ni=', '-p', String(process.pid)], { encoding: 'utf8' }).stdout.trim());

/** Whether this machine runs the idle IO class under a niceness, as the harness's `prepare` asks it. */
const idleRuns = () => spawnSync('nice', ['-n', '10', 'ionice', '-c3', 'true'], { stdio: 'ignore' }).status === 0;

test(
  'command tasks run on one engine: their streams read back whole and apart, their exit code the verdict, in their folder, env and niceness; a stop leaves no code',
  WAITED,
  async (t) => {
    const s = story(t);
    const root = scratch('ae-command-');
    const cwd = scratch('ae-command-cwd-');
    const engine = builtEngine(EngineService.layer({ root, harnesses: { command: commandHarness } }));
    const started = path.join(cwd, 'started');
    const file = (command: string[], config: { env?: Record<string, string>; niceness?: number } = {}) =>
      Effect.runPromise(engine.file({ brief: 'run it', cwd, harness: 'command', config: { command, ...config } }));
    const ids = {
      seq: await file(['seq', '1', '200000']),
      split: await file(['sh', '-c', 'echo out; echo err >&2; echo more; exit 5']),
      env: await file(['sh', '-c', 'printf "%s|%s|%s" "$NEMIA_A" "$PWD" "${PATH:+path}"'], { env: { NEMIA_A: 'a b' } }),
      nice: await file(['sh', '-c', 'ps -o ni= -p $$; ionice -p $$ 2>/dev/null || echo none'], { niceness: 10 }),
      plain: await file(['sh', '-c', 'ps -o ni= -p $$'], { niceness: 0 }),
      held: await file(['sh', '-c', 'echo first; sleep 30 & echo last']),
      stopped: await file(['sh', '-c', `trap 'exit 7' TERM; : > ${started}; while :; do sleep 0.1; done`]),
      printed: await file(['sh', '-c', 'echo out; echo err >&2']),
    };
    const stdout = async (id: string) => Effect.runPromise(engine.output(id, 'stdout'));
    const attempt = async (id: string) => (await Effect.runPromise(engine.view(id))).state;
    const ae = (...args: string[]) => {
      const r = spawnSync(process.execPath, [fileURLToPath(new URL('../bin/ae.ts', import.meta.url)), 'output', ...args], {
        env: { ...process.env, AE_ROOT: root },
        encoding: 'utf8',
      });
      return { status: r.status, stdout: r.stdout, stderr: r.stderr };
    };

    await s.test('`ae output` says on stderr, and exits 0, when no stream is kept: no attempt has run yet', () => {
      const before = ae(ids.printed);
      assert.deepEqual([before.status, before.stdout], [0, '']);
      assert.ok(before.stderr.startsWith(`${ids.printed}: no stdout kept`), before.stderr);
    });

    await s.test('every command runs to its end, the one asked to stop once it has started', async (sub) => {
      let asked = false;
      await until(
        sub,
        async () => {
          await Effect.runPromise(engine.tick());
          if (!asked && fs.existsSync(started)) {
            await Effect.runPromise(engine.stop(ids.stopped));
            asked = true;
          }
          for (const id of Object.values(ids)) if ((await attempt(id)).settled === null) return false;
          return true;
        },
        'every task settled',
        { everyMs: 50 },
      );
    });

    await s.test('a command runs to its end: its stdout read back whole, 200,000 lines, and its last bytes alone', async () => {
      const lines = Array.from({ length: 200_000 }, (_, i) => `${i + 1}\n`).join('');
      assert.equal((await attempt(ids.seq)).attempts[0].exitCode, 0);
      const whole = await stdout(ids.seq);
      assert.equal(whole?.length, lines.length);
      assert.ok(whole === lines, 'every byte, in order');
      assert.equal(await Effect.runPromise(engine.output(ids.seq, 'stdout', 14)), '199999\n200000\n');
      assert.equal(await Effect.runPromise(engine.output(ids.seq, 'stderr')), '', 'a stream it wrote nothing on is empty, not absent');
    });

    await s.test('stderr is kept apart from stdout, and the exit code is the verdict', async () => {
      const state = await attempt(ids.split);
      assert.deepEqual([state.attempts[0].exitCode, state.settled], [5, 'failed']);
      assert.equal(await stdout(ids.split), 'out\nmore\n');
      assert.equal(await Effect.runPromise(engine.output(ids.split, 'stderr')), 'err\n');
    });

    await s.test("the command runs in the task's folder, with its env laid over the worker's own", async () => {
      assert.equal(await stdout(ids.env), `a b|${fs.realpathSync(cwd)}|path`);
    });

    await s.test(
      "a niceness lowers the priority the command runs at from the worker's own, and gives it the idle IO class where the machine has one",
      async () => {
        const [ni, io] = (await stdout(ids.nice))!.trim().split('\n');
        assert.equal(ni.trim(), String(Math.min(19, ownNiceness() + 10)), 'ten below its own, as low as the kernel goes');
        if (idleRuns()) assert.equal(io, 'idle');
        else assert.notEqual(io, 'idle');
        assert.equal((await stdout(ids.plain))!.trim(), String(ownNiceness()), "niceness 0 is the worker's own");
      },
    );

    await s.test('a command a stop ended has no exit code, whatever it exited with', async () => {
      const state = await attempt(ids.stopped);
      assert.deepEqual([state.settled, state.attempts[0].exitCode], ['stopped', null]);
    });

    await s.test(
      'a child the command left holding its stdout ends neither the run nor the streams late: what it wrote first is kept',
      async () => {
        assert.equal((await attempt(ids.held)).attempts[0].exitCode, 0);
        assert.equal(await stdout(ids.held), 'first\nlast\n');
      },
    );

    await s.test('`ae output` prints a stream whole, stdout unless told stderr, and refuses another stream with exit 2', () => {
      assert.deepEqual(ae(ids.printed), { status: 0, stdout: 'out\n', stderr: '' });
      assert.deepEqual(ae(ids.printed, 'stderr'), { status: 0, stdout: 'err\n', stderr: '' });
      const other = ae(ids.printed, 'both');
      assert.deepEqual([other.status, other.stdout], [2, '']);
      assert.match(other.stderr, /`both` is not a stream/);
    });
  },
);

test('a niceness puts `nice -n` before the command, and `ionice -c3` after it only where prepare found the idle class runs', () => {
  const asked = (niceness: number) => ({ name: 'ae/n/1', brief: 'b', cwd: '/', config: { command: ['npm', 'test'], niceness } });
  assert.deepEqual(commandHarness.prepare!(asked(10)), idleRuns() ? { idleIo: true } : {});
  assert.deepEqual(commandHarness.prepare!(asked(0)), {}, "a command at the worker's own priority keeps its IO class");
  assert.deepEqual(commandHarness.command(asked(10), { idleIo: true }), {
    cmd: 'nice',
    args: ['-n', '10', 'ionice', '-c3', 'npm', 'test'],
  });
  assert.deepEqual(commandHarness.command(asked(10), {}), { cmd: 'nice', args: ['-n', '10', 'npm', 'test'] });
  assert.deepEqual(commandHarness.command(asked(0), { idleIo: true }), { cmd: 'npm', args: ['test'] });
});

test('a run spawned again under its name starts with empty streams, and a cut inside a character starts after it', WAITED, async (t) => {
  const root = scratch('ae-command-');
  const cwd = scratch('ae-command-cwd-');
  const ops = detachedOps(commandHarness, root);
  const name = 'ae/again/1';
  const done = () =>
    until(t, async () => (await Effect.runPromise(ops.observe)).get(name)?.state === 'completed', 'the run completed', { everyMs: 50 });
  await Effect.runPromise(ops.spawn({ name, brief: 'x', cwd, config: { command: ['sh', '-c', 'printf "aé"; echo old >&2'] } }));
  await done();
  assert.equal(await Effect.runPromise(ops.output!(name, 'stdout', 1)), '', 'the one byte left of `é` is no character');
  assert.equal(await Effect.runPromise(ops.output!(name, 'stdout', 2)), 'é');
  assert.equal(await Effect.runPromise(ops.output!(name, 'stderr')), 'old\n');
  await Effect.runPromise(ops.spawn({ name, brief: 'x', cwd, config: { command: ['true'] } }));
  assert.ok(
    [undefined, ''].includes(await Effect.runPromise(ops.output!(name, 'stderr'))),
    'the run before is gone before its worker has started',
  );
  await done();
  assert.deepEqual([await Effect.runPromise(ops.output!(name, 'stdout')), await Effect.runPromise(ops.output!(name, 'stderr'))], ['', '']);
  assert.equal(await Effect.runPromise(ops.output!('ae/never/1', 'stdout')), undefined, 'a run that never was has no stream');
});

/** Asserts `got` is a `FileRefused` whose message names each of `names`. */
const refusedNaming = (got: { tag?: string; message: string }, ...names: string[]) => {
  assert.equal(got.tag, 'FileRefused', got.message);
  for (const name of names) assert.ok(got.message.includes(name), `${name} named in: ${got.message}`);
};

test('file(): command, niceness, env and projectMcp go to the harnesses that take them, and are refused by name where the session would start without them', async (t) => {
  const root = scratch('ae-command-');
  const harnesses = {
    codex,
    claude: 'claude',
    bg: 'claude-bg',
    remote: { url: 'https://agent.example' },
    command: commandHarness,
  } as const;
  const engine = builtEngine(EngineService.layer({ root, harnesses }));
  const filed = (harness: string, config: object, more: object = {}) =>
    Effect.runPromise(engine.file({ brief: 'b', cwd: root, harness, config, ...more })).then(
      () => ({ tag: 'filed', message: '' }),
      (err: Error & { _tag?: string }) => ({ tag: err._tag, message: err.message }),
    );

  await t.test('a spawn of a run that names no command is refused before anything runs, naming the field to give', async () => {
    const ops = detachedOps(commandHarness, root);
    for (const config of [{}, { command: [] }]) {
      const err = await Effect.runPromise(Effect.flip(ops.spawn({ name: 'ae/bare/1', brief: 'x', cwd: root, config })));
      assert.deepEqual([err._tag, err.refused], ['RunnerError', true]);
      assert.match(err.message, /^command: .*`ae\/bare\/1` names no `config\.command`/);
      assert.equal((await Effect.runPromise(ops.observe)).get('ae/bare/1'), undefined, 'no worker was started');
    }
  });

  await t.test(
    'the command harness refuses, at file(), a task without a command, one carrying an argument of an agent, a statement or a session to resume',
    async () => {
      refusedNaming(await filed('command', {}), '`config.command`');
      refusedNaming(await filed('command', { command: ['true'], model: 'opus' }), '`model`');
      assert.match((await filed('command', { command: ['true'], model: 'opus' })).message, /^`model` is an argument of an agent's harness/);
      assert.match(
        (await filed('command', { command: ['true'], permissionMode: 'auto' })).message,
        /^`permissionMode` is an argument of an agent's harness/,
      );
      const schema = await filed('command', { command: ['true'] }, { closeoutSchema: { type: 'object' } });
      assert.equal(schema.tag, 'FileRefused', schema.message);
      assert.match(schema.message, /writes no closing statement/);
      const resumed = await filed('command', { command: ['true'] }, { resumeFrom: 'ae/x/1' });
      assert.equal(resumed.tag, 'FileRefused', resumed.message);
      assert.match(resumed.message, /`resumeFrom: ae\/x\/1` continues a session/);
    },
  );

  for (const harness of ['codex', 'claude', 'remote'])
    await t.test(`command and niceness are refused on ${harness}, a harness that runs no command, naming the one that does`, async () => {
      for (const config of [{ command: ['true'] }, { niceness: 5 }]) {
        const key = Object.keys(config)[0];
        refusedNaming(await filed(harness, config), `\`${key}\``, `the \`${harness}\` harness`, 'File the task on `command`');
      }
    });

  await t.test("env is filed on every harness that spawns the session's process", async () => {
    const env = { CI: '1' };
    assert.equal((await filed('codex', { env })).tag, 'filed');
    assert.equal((await filed('claude', { env })).tag, 'filed');
    assert.equal((await filed('command', { command: ['true'], env })).tag, 'filed');
  });

  for (const [harness, config, runs] of [
    ['claude', { env: { CI: '1' }, background: true }, 'background session'],
    ['bg', { env: { CI: '1' } }, 'background session'],
    ['remote', { env: { CI: '1' } }, 'spawns none of its own'],
  ] as const)
    await t.test(
      `env is refused on ${harness}, which ${runs === 'background session' ? 'runs a background session' : 'spawns no process'}, naming the harnesses that take it`,
      async () => {
        refusedNaming(
          await filed(harness, config),
          '`env`',
          `the \`${harness}\` harness`,
          runs,
          '`codex` or `claude` as a job or `command`',
        );
      },
    );

  await t.test("a Codex task's env reaches the command that runs its session", () => {
    const r = { name: 'ae/t/1', brief: 'b', cwd: '/r' };
    assert.deepEqual(codex.command({ ...r, config: { env: { CI: '1' } } }).env, { CI: '1' });
    assert.equal(codex.command(r).env, undefined, 'none given, none laid');
  });

  await t.test(
    'projectMcp is refused on the command harness, which loads no server to leave out, naming the harnesses that hold it',
    async () => {
      refusedNaming(
        await filed('command', { command: ['true'], projectMcp: [] }),
        '`projectMcp`',
        'the `command` harness',
        '`codex` or `claude`',
      );
      assert.equal((await filed('codex', { projectMcp: [] })).tag, 'filed');
      assert.equal((await filed('claude', { projectMcp: ['a'] })).tag, 'filed');
    },
  );
});

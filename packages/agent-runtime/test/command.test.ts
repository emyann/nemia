/**
 * The command harness, against the REAL worker: a task's `config.command` run in its folder, its stdout and its stderr each read
 * back whole through `output`, its exit code on the attempt, its `env` and its `niceness` as the process sees them.
 *
 * What the tests below rest on:
 * - The engine is given the command harness alone, so no tick observes this machine's `claude` registry.
 * - One attempt per start: a task's end is its only attempt's, and `output` reads that attempt's streams.
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
import { Engine as EngineService, type TaskView } from '../src/index.ts';
import { commandHarness } from '../src/harness/command/command.ts';
import { detachedOps } from '../src/harness/detached/detached.ts';
import { codex } from '../src/harness/codex/codex.ts';
import { scratch } from './scratch.ts';
import { builtEngine } from './engine.ts';

type Engine = ReturnType<typeof builtEngine>;

const board = () => {
  const root = scratch('ae-command-');
  const cwd = scratch('ae-command-cwd-');
  const engine = builtEngine(EngineService.layer({ root, harnesses: { command: commandHarness } }));
  return { root, cwd, engine };
};

/** Tick until the task's view meets `ok`, under a bound of passes, each waiting on the worker's next write at most. */
const until = async (e: Engine, id: string, ok: (v: TaskView) => boolean, what: string, passes = 400): Promise<TaskView> => {
  let v: TaskView | undefined;
  for (let i = 0; i < passes; i++) {
    await Effect.runPromise(e.tick());
    v = await Effect.runPromise(e.view(id));
    if (ok(v)) return v;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`${id} never ${what}: last seen ${v?.phase}`);
};
const settled = (e: Engine, id: string) => until(e, id, (v) => v.state.settled !== null, 'settled');

/** A task on the command harness running `command`, filed and ticked to its end. */
const ran = async (command: string[], config: { env?: Record<string, string>; niceness?: number } = {}) => {
  const b = board();
  const id = await Effect.runPromise(b.engine.file({ brief: 'run it', cwd: b.cwd, harness: 'command', config: { command, ...config } }));
  const view = await settled(b.engine, id);
  return { ...b, id, view, attempt: view.state.attempts[0] };
};

test('a command runs to its end: its stdout read back whole, 200,000 lines, and its last bytes alone', async () => {
  const { engine, id, attempt } = await ran(['seq', '1', '200000']);
  const lines = Array.from({ length: 200_000 }, (_, i) => `${i + 1}\n`).join('');
  assert.equal(attempt.exitCode, 0);
  const whole = await Effect.runPromise(engine.output(id, 'stdout'));
  assert.equal(whole?.length, lines.length);
  assert.ok(whole === lines, 'every byte, in order');
  assert.equal(await Effect.runPromise(engine.output(id, 'stdout', 14)), '199999\n200000\n');
  assert.equal(await Effect.runPromise(engine.output(id, 'stderr')), '', 'a stream it wrote nothing on is empty, not absent');
});

test('stderr is kept apart from stdout, and the exit code is the verdict', async () => {
  const { engine, id, attempt, view } = await ran(['sh', '-c', 'echo out; echo err >&2; echo more; exit 5']);
  assert.deepEqual([attempt.exitCode, view.state.settled], [5, 'failed']);
  assert.equal(await Effect.runPromise(engine.output(id, 'stdout')), 'out\nmore\n');
  assert.equal(await Effect.runPromise(engine.output(id, 'stderr')), 'err\n');
});

test("the command runs in the task's folder, with its env laid over the worker's own", async () => {
  const { engine, id, cwd } = await ran(['sh', '-c', 'printf "%s|%s|%s" "$NEMIA_A" "$PWD" "${PATH:+path}"'], {
    env: { NEMIA_A: 'a b' },
  });
  assert.equal(await Effect.runPromise(engine.output(id, 'stdout')), `a b|${fs.realpathSync(cwd)}|path`);
});

test("a niceness lowers the priority the command runs at from the worker's own, and gives it the idle IO class where the machine has one", async () => {
  const idle = spawnSync('nice', ['-n', '10', 'ionice', '-c3', 'true'], { stdio: 'ignore' }).status === 0;
  const { engine, id } = await ran(['sh', '-c', 'ps -o ni= -p $$; ionice -p $$ 2>/dev/null || echo none'], { niceness: 10 });
  const [ni, io] = (await Effect.runPromise(engine.output(id, 'stdout')))!.trim().split('\n');
  assert.equal(ni.trim(), String(Math.min(19, ownNiceness() + 10)), 'ten below its own, as low as the kernel goes');
  if (idle) assert.equal(io, 'idle');
  else assert.notEqual(io, 'idle');
  const plain = await ran(['sh', '-c', 'ps -o ni= -p $$'], { niceness: 0 });
  assert.equal(
    (await Effect.runPromise(plain.engine.output(plain.id, 'stdout')))!.trim(),
    String(ownNiceness()),
    "niceness 0 is the worker's own",
  );
});

test('a niceness puts `nice -n` before the command, and `ionice -c3` after it only where prepare found the idle class runs', () => {
  const asked = (niceness: number) => ({ name: 'ae/n/1', brief: 'b', cwd: '/', config: { command: ['npm', 'test'], niceness } });
  const idle = spawnSync('nice', ['-n', '10', 'ionice', '-c3', 'true'], { stdio: 'ignore' }).status === 0;
  assert.deepEqual(commandHarness.prepare!(asked(10)), idle ? { idleIo: true } : {});
  assert.deepEqual(commandHarness.prepare!(asked(0)), {}, "a command at the worker's own priority keeps its IO class");
  assert.deepEqual(commandHarness.command(asked(10), { idleIo: true }), {
    cmd: 'nice',
    args: ['-n', '10', 'ionice', '-c3', 'npm', 'test'],
  });
  assert.deepEqual(commandHarness.command(asked(10), {}), { cmd: 'nice', args: ['-n', '10', 'npm', 'test'] });
  assert.deepEqual(commandHarness.command(asked(0), { idleIo: true }), { cmd: 'npm', args: ['test'] });
});

/** This process's own niceness, which a worker it spawns inherits. */
const ownNiceness = (): number => Number(spawnSync('ps', ['-o', 'ni=', '-p', String(process.pid)], { encoding: 'utf8' }).stdout.trim());

test('a command a stop ended has no exit code, whatever it exited with', async () => {
  const b = board();
  const started = path.join(b.cwd, 'started');
  const id = await Effect.runPromise(
    b.engine.file({
      brief: 'run it',
      cwd: b.cwd,
      harness: 'command',
      config: { command: ['sh', '-c', `trap 'exit 7' TERM; : > ${started}; while :; do sleep 0.1; done`] },
    }),
  );
  await until(b.engine, id, () => fs.existsSync(started), 'started');
  await Effect.runPromise(b.engine.stop(id));
  const view = await settled(b.engine, id);
  assert.deepEqual([view.state.settled, view.state.attempts[0].exitCode], ['stopped', null]);
});

test('a child the command left holding its stdout ends neither the run nor the streams late: what it wrote first is kept', async () => {
  const { engine, id, attempt } = await ran(['sh', '-c', 'echo first; sleep 30 & echo last']);
  assert.equal(attempt.exitCode, 0);
  assert.equal(await Effect.runPromise(engine.output(id, 'stdout')), 'first\nlast\n');
});

test('a run spawned again under its name starts with empty streams, and a cut inside a character starts after it', async () => {
  const root = scratch('ae-command-');
  const cwd = scratch('ae-command-cwd-');
  const ops = detachedOps(commandHarness, root);
  const name = 'ae/again/1';
  const done = async () => {
    for (let i = 0; i < 400; i++) {
      const seen = (await Effect.runPromise(ops.observe)).get(name);
      if (seen?.state === 'completed') return;
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.fail('the run never completed');
  };
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

test('`ae output` prints a stream whole, stdout unless told stderr, says on stderr when none is kept, and refuses another stream', async () => {
  const { root, cwd, engine } = board();
  const ae = (...args: string[]) => {
    const r = spawnSync(process.execPath, [fileURLToPath(new URL('../bin/ae.ts', import.meta.url)), 'output', ...args], {
      env: { ...process.env, AE_ROOT: root },
      encoding: 'utf8',
    });
    return [r.status, r.stdout, r.stderr];
  };
  const id = await Effect.runPromise(
    engine.file({ brief: 'b', cwd, harness: 'command', config: { command: ['sh', '-c', 'echo out; echo err >&2'] } }),
  );
  assert.deepEqual(ae(id), [0, '', `${id}: no stdout kept: no attempt has run yet, or its run kept no streams\n`]);
  await settled(engine, id);
  assert.deepEqual(ae(id), [0, 'out\n', '']);
  assert.deepEqual(ae(id, 'stderr'), [0, 'err\n', '']);
  assert.deepEqual(ae(id, 'both'), [2, '', 'output: `both` is not a stream: ask for `stdout` or `stderr`.\n']);
});

test('a spawn of a run that names no command is refused before anything runs, saying the harness runs only the one a task gives', async () => {
  const root = scratch('ae-command-');
  const cwd = scratch('ae-command-cwd-');
  const ops = detachedOps(commandHarness, root);
  for (const config of [{}, { command: [] }]) {
    const err = await Effect.runPromise(Effect.flip(ops.spawn({ name: 'ae/bare/1', brief: 'x', cwd, config })));
    assert.equal(err.refused, true);
    assert.equal(err.message, 'command: Error: `ae/bare/1` names no `config.command`: the command harness runs only the one a task gives.');
    assert.equal((await Effect.runPromise(ops.observe)).get('ae/bare/1'), undefined, 'no worker was started');
  }
});

test('the command harness refuses, at file(), a task without a command, one carrying an argument of an agent, a statement or a session to resume', async () => {
  const { engine, cwd } = board();
  const refused = async (config: object, words: RegExp) => {
    const e = await Effect.runPromise(engine.file({ brief: 'b', cwd, harness: 'command', config })).then(
      () => assert.fail('it filed'),
      (err: Error & { _tag?: string }) => err,
    );
    assert.equal(e._tag, 'FileRefused', e.message);
    assert.match(e.message, words);
  };
  await refused({}, /names its process: give `config.command`/);
  await refused({ command: ['true'], model: 'opus' }, /^`model` is an argument of an agent's harness/);
  await refused({ command: ['true'], permissionMode: 'auto' }, /^`permissionMode` is an argument of an agent's harness/);
  const schema = await Effect.runPromise(
    engine.file({ brief: 'b', cwd, harness: 'command', config: { command: ['true'] }, closeoutSchema: { type: 'object' } }),
  ).catch((err: Error) => err.message);
  assert.match(String(schema), /writes no closing statement/);
  const resumed = await Effect.runPromise(
    engine.file({ brief: 'b', cwd, harness: 'command', config: { command: ['true'] }, resumeFrom: 'ae/x/1' }),
  ).catch((err: Error) => err.message);
  assert.match(String(resumed), /`resumeFrom: ae\/x\/1` continues a session, and a command keeps none/);
});

test('command, env and niceness are refused on Codex, Claude Code and a remote agent, harnesses that run no command, naming the one that does', async () => {
  const root = scratch('ae-command-');
  const harnesses = { codex, claude: 'claude', remote: { url: 'https://agent.example' }, command: commandHarness } as const;
  const engine = builtEngine(EngineService.layer({ root, harnesses }));
  for (const harness of ['codex', 'claude', 'remote']) {
    for (const config of [{ command: ['true'] }, { env: { CI: '1' } }, { niceness: 5 }]) {
      const key = Object.keys(config)[0];
      const message = await Effect.runPromise(engine.file({ brief: 'b', cwd: root, harness, config })).then(
        () => 'filed',
        (err: Error) => err.message,
      );
      assert.equal(
        message,
        `\`${key}\` names a process to run, and the \`${harness}\` harness runs a session of its own: it would start without it. File the task on \`command\`, or leave \`${key}\` off.`,
      );
    }
  }
});

test("checkoutMcp is refused on the command harness, which loads no server to leave out, naming the harnesses that hold it", async () => {
  const root = scratch('ae-command-');
  const harnesses = { codex, claude: 'claude', command: commandHarness } as const;
  const engine = builtEngine(EngineService.layer({ root, harnesses }));
  const filed = (harness: string, config: object) =>
    Effect.runPromise(engine.file({ brief: 'b', cwd: root, harness, config })).then(
      () => 'filed',
      (err: Error) => err.message,
    );
  assert.equal(
    await filed('command', { command: ['true'], checkoutMcp: [] }),
    "`checkoutMcp` says which servers of the checkout's `.mcp.json` the session loads, and the `command` harness loads no MCP server it could leave out: it would run as if nothing were asked. File the task on `codex` or `claude`, or leave `checkoutMcp` off.",
  );
  assert.equal(await filed('codex', { checkoutMcp: [] }), 'filed');
  assert.equal(await filed('claude', { checkoutMcp: ['a'] }), 'filed');
});

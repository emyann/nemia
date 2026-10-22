/**
 * Pools by subscription, at shipped defaults, through the client's `engine()`, which files every task `queued` and hands the runtime its
 * ceiling and pools, and `tick()`, whose engine pass admits. `WF_MAX_CONCURRENT` is unset, so the ceiling is 2 on every pass. `WF_ROOT`
 * is read as the module loads, so it is set before the import; `WF_VERIFY_REST=1` judges in full every run a pass answers from its memo
 * of runs at rest, and a difference throws (`verifyRest` in tick.verb.ts).
 *
 * A fake `claude` and `codex` first on PATH run until the test opens their gate — a file named for the task's id, which is its brief — and
 * `claude agents` prints a registry and counts itself. The tasks are filed straight through the client, with no run record, so `advance`
 * views none of them: every `claude agents` call a pass makes is the runtime's observe, which asks it only for a session expected that
 * is not a job (`agents-calls.boundary.test.ts` has a run's steps, a background session and a restart).
 *
 * Told as one story on `story(t)`, its checkpoints the four things a pool does, each leaving the board drained for the next. Not on
 * `staged`: the stand-in engine admits into no pool, so this keeps the client's real `engine()` and the fakes. An admitted task starts
 * on the runtime's next pass, so a freed slot is taken one pass after it is admitted into: each checkpoint ticks once to admit and once
 * to start.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkArgv } from '../src/check/check.ts';
import { scratch } from './scratch.ts';
import { until, WAITED, type Waiter } from 'agent-runtime/testing';
import { Effect } from 'effect';
import { testPlace } from '../place/memory/index.ts';
import { eachTest, runOver } from './placed.ts';
import { story } from './story.ts';

const ROOT = scratch('wf-pool-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const { engine, tickRun, runWith: runEngine } = await import('../src/runner.ts');
const stand = eachTest(testPlace);
const runWith = runOver(runEngine, () => stand().layer);

/** The fakes, their gates, and the count of `claude agents` calls. */
const fakes = () => {
  const bin = scratch('wf-pool-bin-');
  const gates = scratch('wf-pool-gates-');
  const registry = path.join(bin, 'registry.json');
  const counter = path.join(bin, 'agents-calls');
  fs.writeFileSync(registry, '[]');
  fs.writeFileSync(counter, '');
  const runUntilGate = (prompt: string) => `
const gate = require('node:path').join(${JSON.stringify(gates)}, ${prompt});
const wait = () => (fs.existsSync(gate) ? process.exit(0) : setTimeout(wait, 50));
wait();
`;
  fs.writeFileSync(
    path.join(bin, 'claude'),
    `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] === 'agents') {
  fs.appendFileSync(${JSON.stringify(counter)}, 'agents\\n');
  process.stdout.write(fs.readFileSync(${JSON.stringify(registry)}, 'utf8'));
  process.exit(0);
}
// A job reads its brief as the first line on its stdin; \`claude-detached\` takes it as \`-p\`'s value.
if (args.includes('--input-format')) {
  let got = '';
  process.stdin.on('data', (c) => {
    got += c;
    const nl = got.indexOf('\\n');
    if (nl === -1) return;
    process.stdin.pause();
    const prompt = JSON.parse(got.slice(0, nl)).message.content;
    ${runUntilGate('prompt')}
  });
} else {
  const prompt = args[args.indexOf('-p') + 1];
  ${runUntilGate('prompt')}
}
`,
    { mode: 0o755 },
  );
  fs.writeFileSync(
    path.join(bin, 'codex'),
    `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
${runUntilGate('args.at(-1)')}
`,
    { mode: 0o755 },
  );
  process.env.PATH = `${bin}:${process.env.PATH}`;
  process.env.CODEX_HOME = scratch('wf-pool-codex-home-');
  return {
    gates,
    open: (id: string) => fs.writeFileSync(path.join(gates, id), ''),
    agentsCalls: () => fs.readFileSync(counter, 'utf8').split('\n').filter(Boolean).length,
  };
};

const fake = fakes();
const e = engine();
const cwd = scratch('wf-pool-cwd-');

/**
 * A task filed as the tick files one, through the client: its brief is its id, the gate that ends it. A check runs the gate loop, its
 * argv in `config`, as `fileCheck` files one.
 */
const file = (id: string, harness: string) =>
  e.file({
    id,
    cwd,
    harness,
    brief: id,
    ...(harness === 'check'
      ? { config: { command: checkArgv(`while [ ! -e ${JSON.stringify(path.join(fake.gates, id))} ]; do sleep 0.05; done`) } }
      : {}),
  });

/**
 * Files `tasks` in their order, a millisecond apart on a seeded clock: the runtime's admission takes the earlier filing first of one
 * priority, and it stamps a filing with the clock, which a step back between two filings would turn round.
 */
const fileInOrder = async (t: TestContext, tasks: ReadonlyArray<readonly [string, string]>) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  try {
    for (const [id, harness] of tasks) {
      await Effect.runPromise(file(id, harness));
      t.mock.timers.tick(1);
    }
  } finally {
    t.mock.timers.reset();
  }
};

const attempts = async (id: string) => (await Effect.runPromise(e.view(id))).state.attempts.length;

/** Waits in test `t`, every 50ms, until every task is `phase` — a detached worker publishes a moment after the pass spawns it. */
const reached = (t: Waiter, ids: string[], phase: string) => {
  let phases: string[] = [];
  return until(
    t,
    async () => {
      phases = await Promise.all(ids.map(async (id) => (await Effect.runPromise(e.view(id))).phase));
      return phases.every((p) => p === phase);
    },
    () => `${ids.join(', ')} ${phase}; ${ids.map((id, i) => `${id} ${phases[i] ?? 'not read yet'}`).join(', ')}`,
    { everyMs: 50 },
  );
};

/** Every task on the board stopped and settled in test `t`, so the next case starts on an empty pool. */
const drain = async (t: Waiter) => {
  for (const v of (await Effect.runPromise(e.list())).views) if (!v.state.settled) await Effect.runPromise(e.stop(v.id));
  await until(
    t,
    async () => {
      if ((await Effect.runPromise(e.list())).views.every((v) => v.state.settled)) return true;
      await Effect.runPromise(e.tick());
      return false;
    },
    'the board drained',
    { everyMs: 50 },
  );
};

test(
  'pools by subscription, at shipped defaults: each harness fills a pool of its own, a pass admits without asking `claude agents`, and a ceiling that does not read admits nothing',
  WAITED,
  async (top) => {
    const s = story(top);
    await s.test(
      "REFUSED at shipped defaults: a claude-detached session counts against claude's ceiling, the third claude task waits, and codex keeps its own",
      async (t) => {
        try {
          await fileInOrder(t, [
            ['a1', 'claude-detached'],
            ['a2', 'claude'],
          ]);
          await runWith(e, tickRun());
          assert.equal((await attempts('a1')) + (await attempts('a2')), 0, 'admitted on this pass, started on the next');
          assert.deepEqual(
            [(await Effect.runPromise(e.view('a1'))).admission, (await Effect.runPromise(e.view('a2'))).admission],
            ['admitted', 'admitted'],
          );
          await runWith(e, tickRun());
          await reached(t, ['a1', 'a2'], 'running (working)');

          await fileInOrder(t, [
            ['b1', 'claude'],
            ['b2', 'claude-detached'],
            ['c1', 'codex'],
            ['c2', 'codex'],
            ['c3', 'codex'],
          ]);
          await runWith(e, tickRun());
          await runWith(e, tickRun());
          assert.equal(await attempts('b1'), 0, 'a claude task waits: one claude and one claude-detached session fill the pool');
          assert.equal(await attempts('b2'), 0, 'and so does a claude-detached one');
          assert.equal((await Effect.runPromise(e.view('b1'))).admission, 'queued');
          assert.equal((await attempts('c1')) + (await attempts('c2')), 2, 'codex is not counted in that pool');
          assert.equal(await attempts('c3'), 0, 'and has a ceiling of its own');

          fake.open('a1');
          await reached(t, ['a1'], 'running (done)');
          await runWith(e, tickRun());
          assert.equal((await Effect.runPromise(e.view('a1'))).state.settled, 'succeeded');
          assert.equal(
            (await Effect.runPromise(e.view('b1'))).admission,
            'admitted',
            "the claude-detached session ended, and the slot it freed is the pool's: b1, filed first, is admitted into it",
          );
          assert.equal(await attempts('b1'), 0, 'and starts a pass later');
          await runWith(e, tickRun());
          assert.equal(await attempts('b1'), 1, 'b1 took the slot');
          assert.equal(await attempts('b2'), 0, 'and the pool is full again');
          assert.equal((await Effect.runPromise(e.view('b2'))).admission, 'queued');
        } finally {
          await drain(t);
        }
      },
    );

    await s.test(
      'REFUSED at shipped defaults: a check keeps its own pool beside a full Claude Code one, and a third check waits',
      async (t) => {
        try {
          await fileInOrder(t, [
            ['p1', 'claude'],
            ['p2', 'claude-detached'],
          ]);
          await runWith(e, tickRun());
          await runWith(e, tickRun());
          await reached(t, ['p1', 'p2'], 'running (working)');

          await fileInOrder(t, [
            ['q1', 'claude-detached'],
            ['d1', 'check'],
            ['d2', 'check'],
            ['d3', 'check'],
          ]);
          await runWith(e, tickRun());
          await runWith(e, tickRun());
          assert.equal(await attempts('q1'), 0, 'the Claude Code pool is full');
          assert.equal((await attempts('d1')) + (await attempts('d2')), 2, 'a check is not counted in it');
          assert.equal(await attempts('d3'), 0, 'and has a ceiling of its own');
        } finally {
          await drain(t);
        }
      },
    );

    await s.test(
      "one pass — the runtime's tick, which admits — asks `claude agents` nothing, with claude jobs at work and waiting",
      async (t) => {
        try {
          await fileInOrder(
            t,
            ['s1', 's2', 's3', 's4'].map((id) => [id, 'claude'] as const),
          );
          const admitting = fake.agentsCalls();
          const first = (await runWith(e, tickRun())).cost;
          assert.equal(
            fake.agentsCalls() - admitting,
            0,
            'no `claude agents` for the pass that admits s1 and s2: an admission is a word to the journals, and nothing has started',
          );
          assert.deepEqual(
            [(await Effect.runPromise(e.view('s1'))).admission, (await Effect.runPromise(e.view('s3'))).admission],
            ['admitted', 'queued'],
          );
          assert.equal(first?.harnesses.claude?.calls, 1, 'and the meter counts the observe, which listed the jobs alone');
          assert.equal(first?.harnesses.claude?.spawned, 0);
          await runWith(e, tickRun());
          await reached(t, ['s1', 's2'], 'running (working)');
          assert.equal((await Effect.runPromise(e.view('s3'))).admission, 'queued');

          const before = fake.agentsCalls();
          const { cost } = await runWith(e, tickRun());
          assert.equal(
            fake.agentsCalls() - before,
            0,
            "no `claude agents` for the whole pass: admission reads the views the runtime's pass built, not a list or a view that asks the harness again, and the observe is told the jobs it expects, listed off their run files",
          );
          assert.ok(cost, 'the pass says what it cost');
          assert.equal(cost.harnesses.claude?.calls, 1, 'one observe of claude, as the meter counts the pass');
          for (const [name, o] of Object.entries(cost.harnesses)) assert.equal(o.calls, 1, `${name} observed once`);
          assert.equal(
            cost.spawned,
            0,
            "no process started in the whole pass: a process one observe starts is counted against every harness observing in that moment (`ObserveCount`), so the count is the pass's own",
          );
          assert.equal(await attempts('s3'), 0, 'and s3 still waits');
        } finally {
          await drain(t);
        }
      },
    );

    await s.test(
      'REFUSED: `WF_MAX_CONCURRENT=abc` refuses the pass, and the engine `engine()` builds under it has no ceiling, so it admits nothing',
      async (t) => {
        process.env.WF_MAX_CONCURRENT = 'abc';
        try {
          const refused = engine();
          await Effect.runPromise(refused.file({ id: 'r1', cwd, harness: 'claude', brief: 'r1' }));
          const err = await runWith(refused, tickRun()).then(
            () => assert.fail('a pass under a ceiling that does not read resolved'),
            (x: unknown) => x as Error,
          );
          assert.match(err.message, /^WF_MAX_CONCURRENT=abc is not a count from 1/);
          for (let i = 0; i < 2; i++) await Effect.runPromise(refused.tick());
          assert.equal(
            (await Effect.runPromise(refused.view('r1'))).admission,
            'queued',
            "the runtime's own passes admit nothing with no ceiling",
          );
          assert.equal((await Effect.runPromise(refused.view('r1'))).state.attempts.length, 0);
        } finally {
          delete process.env.WF_MAX_CONCURRENT;
          await drain(t);
        }
      },
    );
  },
);

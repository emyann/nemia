/**
 * Which Claude Code the quota ask drives, and what it leaves behind, over the Agent SDK itself and a stand-in Claude Code
 * (`fixtures/stand-in-claude.ts`, which answers the usage control request from a recorded answer, after the wait `STANDIN_USAGE_MS` asks
 * for): the one the sessions run — the engine's `claudeExecutable`, else the `AE_CLAUDE_EXECUTABLE` a job inherits — and never a
 * `claude` on PATH; one named that is not there is `missing`; and however an ask ends, its claude is gone by the time it returns.
 * A boundary test: it builds the real engine, and its ask starts a real process through the SDK.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Exit } from 'effect';
import { claudeQuota } from '../src/harness/claude/index.ts';
import { Engine } from '../src/index.ts';
import { scratch } from 'test-kit/scratch';
import { asyncOps, type AsyncRunner } from './promise-runner.ts';
import { builtEngine } from './engine.ts';
import { until } from '../src/waits/index.ts';
import { story } from 'test-kit/checkpoints';

/** A harness in Promises, which the engine spawns nothing on: this test is about the quota alone. */
const idle: AsyncRunner = {
  spawn: async () => {},
  observe: async () => new Map(),
  stop: async () => {},
  logs: async () => '',
};

/** The real engine over its own `claude` harness, whose sessions — and so its quota — run the Claude Code `claudeExecutable` names. */
const engineRunning = (claudeExecutable: string) =>
  builtEngine(Engine.layer({ root: scratch('ae-quota-boundary-'), harnesses: { claude: 'claude' }, claudeExecutable }));

/** The real engine over a `claude` whose quota is the Agent SDK's own ask, named no Claude Code by the engine. */
const engineNamingNone = () =>
  builtEngine(Engine.layer({ root: scratch('ae-quota-boundary-'), harnesses: { claude: { ...asyncOps(idle), quota: claudeQuota() } } }));

/** The stand-in Claude Code, and the recorded answer it serves the usage request from. */
const STAND_IN = path.join(import.meta.dirname, 'fixtures', 'stand-in-claude.ts');
const RECORDED = path.join(import.meta.dirname, 'fixtures', 'get-usage-2.1.278.json');

/**
 * How long the stand-in waits before it answers the usage request, where the test wants it to answer: long enough that a query whose
 * input ended at once would have closed its child's stdin, and the child exited, before the answer came.
 */
const ANSWERS_IN_MS = 400;

/** How long the stand-in waits where the test wants it never to answer within the ask's own bound. */
const NEVER_MS = 60_000;

/** Whether the process `pid` is gone. */
const gone = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return false;
  } catch {
    return true;
  }
};

/** A stand-in Claude Code in a folder of its own, answering the usage request after `usageMs`: its path, and what it wrote of starts. */
const aStandIn = (usageMs: number) => {
  const dir = scratch('ae-quota-standin-');
  const bin = scratch('ae-quota-bin-');
  const claude = path.join(bin, 'claude');
  fs.writeFileSync(
    claude,
    `#!/bin/sh\nSTANDIN_DIR='${dir}' STANDIN_USAGE='${RECORDED}' STANDIN_USAGE_MS=${usageMs} STANDIN_NO_BRIDGE=1 exec node '${STAND_IN}' "$@"\n`,
    { mode: 0o755 },
  );
  const pid = path.join(dir, 'pid');
  const argv = path.join(dir, 'argv.jsonl');
  return {
    bin,
    claude,
    pidOf: (): number | null => (fs.existsSync(pid) ? Number(fs.readFileSync(pid, 'utf8')) : null),
    starts: (): string[] => (fs.existsSync(argv) ? fs.readFileSync(argv, 'utf8').split('\n').filter(Boolean) : []),
  };
};

/** `body` run with `env` set on this process, each variable put back as it was once it ends. */
const withEnv = async <A>(env: Record<string, string>, body: () => Promise<A>): Promise<A> => {
  const before = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  try {
    return await body();
  } finally {
    for (const [key, was] of Object.entries(before)) {
      if (was === undefined) delete process.env[key];
      else process.env[key] = was;
    }
  }
};

/** The plan the recorded answer holds, as the quota reads it. */
const PLAN = {
  kind: 'windows',
  limits: [
    { key: 'five_hour', usedPercentage: 3, resetsAt: '2026-09-19T15:10:00.048Z' },
    { key: 'seven_day', usedPercentage: 50, resetsAt: '2026-09-23T11:00:00.048Z' },
    { key: 'extra_usage', usedPercentage: 0, resetsAt: null },
    { key: 'nimbus_quill', usedPercentage: 0, resetsAt: null },
  ],
  subscription: 'max',
};

test("the quota asks the Claude Code the sessions run — the engine's, else the one a job inherits, never a `claude` on PATH — reads the plan and lets its claude go; one named that is not there is `missing`; and an ask timed out or interrupted leaves no claude behind", async (t) => {
  const s = story(t);

  await s.test(
    "the engine's quota drives the Claude Code its `claudeExecutable` names, not the `claude` on PATH, holding its query's input open until it answers, and reads the plan",
    async () => {
      const named = aStandIn(ANSWERS_IN_MS);
      const onPath = aStandIn(ANSWERS_IN_MS);
      const came = await withEnv({ PATH: `${onPath.bin}${path.delimiter}${process.env.PATH ?? ''}` }, () =>
        Effect.runPromise(engineRunning(named.claude).quota()),
      );
      assert.deepEqual(
        [named.starts().length, onPath.starts().length],
        [1, 0],
        'the Claude Code the engine names was started once, and the `claude` on PATH never',
      );
      assert.deepEqual(
        came,
        PLAN,
        `the stand-in answered ${ANSWERS_IN_MS} ms in: a query whose input ended at once would have closed its stdin, and the answer would have been lost to the exit`,
      );
      const pid = named.pidOf();
      assert.ok(
        pid !== null && gone(pid),
        `the answered ask let its claude go (pid ${pid}): no process is left behind by the time it returns`,
      );
    },
  );

  await s.test(
    'with no Claude Code named by the engine, the quota drives the one `AE_CLAUDE_EXECUTABLE` names, which every job inherits, not the `claude` on PATH',
    async () => {
      const inherited = aStandIn(0);
      const onPath = aStandIn(0);
      const came = await withEnv(
        { AE_CLAUDE_EXECUTABLE: inherited.claude, PATH: `${onPath.bin}${path.delimiter}${process.env.PATH ?? ''}` },
        () => Effect.runPromise(engineNamingNone().quota()),
      );
      assert.deepEqual(came, PLAN);
      assert.deepEqual([inherited.starts().length, onPath.starts().length], [1, 0], "the inherited one was asked, and PATH's never");
    },
  );

  await s.test('REFUSED: a Claude Code named that is not there is `missing`, as the SDK says there is no executable to start', async () => {
    const nowhere = path.join(scratch('ae-quota-nothing-'), 'claude');
    assert.deepEqual(await Effect.runPromise(engineRunning(nowhere).quota()), { kind: 'missing' });
  });

  await s.test('REFUSED: an ask that timed out leaves no claude behind, however long its claude would have taken', async () => {
    const silent = aStandIn(NEVER_MS);
    const timed = await Effect.runPromise(claudeQuota({ command: silent.claude, timeoutMs: 300 }));
    assert.deepEqual(timed, { kind: 'timeout', ms: 300, program: silent.claude }, 'the silent claude outlasted the ask, which names it');
    const pid = silent.pidOf();
    assert.ok(pid !== null && gone(pid), `the timed-out ask let its claude go (pid ${pid})`);
  });

  await s.test('REFUSED: an ask that was interrupted leaves no claude behind', async (sub) => {
    const silent = aStandIn(NEVER_MS);
    const stop = new AbortController();
    const exit = Effect.runPromiseExit(claudeQuota({ command: silent.claude }), { signal: stop.signal });
    await until(sub, silent.pidOf, 'the ask started its claude, which wrote its pid before it was interrupted', { everyMs: 20 });
    stop.abort();
    assert.ok(Exit.hasInterrupts(await exit), 'the ask was interrupted, not answered');
    const pid = silent.pidOf();
    assert.ok(pid !== null && gone(pid), `the interrupted ask let its claude go (pid ${pid})`);
  });
});

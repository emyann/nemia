/**
 * Which Claude Code the quota ask drives, and what it leaves behind, over the Agent SDK itself and a stand-in Claude Code on PATH
 * (`fixtures/stand-in-claude.ts`, which answers the usage control request from a recorded answer, after the wait
 * `STANDIN_USAGE_MS` asks for): the ask names `claude` and the SDK resolves it on PATH, so the plan is read by the Claude Code the
 * harness runs its sessions with; a PATH without one is `missing`; and however an ask ends, its claude is gone by the time it returns.
 * A boundary test: it builds the real engine, and its ask starts a real process through the SDK.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Exit } from 'effect';
import { claudeQuota } from '../src/harness/claude/index.ts';
import { Engine } from '../src/index.ts';
import { scratch } from './scratch.ts';
import { asyncOps, type AsyncRunner } from './promise-runner.ts';
import { builtEngine } from './engine.ts';
import { until } from '../src/waits/index.ts';
import { story } from './checkpoints.ts';

/** A harness in Promises, which the engine spawns nothing on: this test is about the quota alone. */
const idle: AsyncRunner = {
  spawn: async () => {},
  observe: async () => new Map(),
  stop: async () => {},
  logs: async () => '',
};

/** The real engine over a `claude` whose quota is the Agent SDK's own ask, which drives the `claude` on PATH. */
const engineAsking = () =>
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

/**
 * A folder holding a `claude` that is the stand-in, first on PATH for the length of `asked`, answering the usage request after
 * `usageMs`: what the stand-in wrote of its starts, and the pid of the last of them, are answered beside what the ask came to.
 */
const overStandIn = async <A>(
  usageMs: number,
  asked: (pidOf: () => number | null) => Promise<A>,
): Promise<{ came: A; starts: string[]; pid: number | null }> => {
  const dir = scratch('ae-quota-standin-');
  const bin = scratch('ae-quota-bin-');
  fs.writeFileSync(
    path.join(bin, 'claude'),
    `#!/bin/sh\nSTANDIN_DIR='${dir}' STANDIN_USAGE='${RECORDED}' STANDIN_USAGE_MS=${usageMs} STANDIN_NO_BRIDGE=1 exec node '${STAND_IN}' "$@"\n`,
    { mode: 0o755 },
  );
  const pid = path.join(dir, 'pid');
  const pidOf = (): number | null => (fs.existsSync(pid) ? Number(fs.readFileSync(pid, 'utf8')) : null);
  const before = process.env.PATH;
  process.env.PATH = `${bin}${path.delimiter}${before ?? ''}`;
  try {
    const came = await asked(pidOf);
    const argv = path.join(dir, 'argv.jsonl');
    return { came, starts: fs.existsSync(argv) ? fs.readFileSync(argv, 'utf8').split('\n').filter(Boolean) : [], pid: pidOf() };
  } finally {
    process.env.PATH = before;
  }
};

test('the quota asked of the default harness drives the `claude` on PATH, reads the plan and lets its claude go; a PATH with none is `missing`; and an ask timed out or interrupted leaves no claude behind', async (t) => {
  const s = story(t);

  await s.test(
    "the engine's quota drives the `claude` on PATH, holding its query's input open until it answers, and reads the plan",
    async () => {
      const engine = engineAsking();
      const { came, starts, pid } = await overStandIn(ANSWERS_IN_MS, () => Effect.runPromise(engine.quota()));
      assert.equal(starts.length, 1, "the `claude` on PATH was started once, and not the SDK's own bundled CLI");
      assert.deepEqual(
        came,
        {
          kind: 'windows',
          limits: [
            { key: 'five_hour', usedPercentage: 3, resetsAt: '2026-09-19T15:10:00.048Z' },
            { key: 'seven_day', usedPercentage: 50, resetsAt: '2026-09-23T11:00:00.048Z' },
            { key: 'extra_usage', usedPercentage: 0, resetsAt: null },
            { key: 'nimbus_quill', usedPercentage: 0, resetsAt: null },
          ],
          subscription: 'max',
        },
        `the stand-in answered ${ANSWERS_IN_MS} ms in: a query whose input ended at once would have closed its stdin, and the answer would have been lost to the exit`,
      );
      assert.ok(
        pid !== null && gone(pid),
        `the answered ask let its claude go (pid ${pid}): no process is left behind by the time it returns`,
      );
    },
  );

  await s.test('REFUSED: a PATH with no `claude` on it is `missing`, as the SDK says there is no executable to start', async () => {
    const before = process.env.PATH;
    process.env.PATH = scratch('ae-quota-nothing-');
    try {
      assert.deepEqual(await Effect.runPromise(engineAsking().quota()), { kind: 'missing' });
    } finally {
      process.env.PATH = before;
    }
  });

  await s.test('REFUSED: an ask that timed out leaves no claude behind, however long its claude would have taken', async () => {
    const timed = await overStandIn(NEVER_MS, () => Effect.runPromise(claudeQuota({ timeoutMs: 300 })));
    assert.deepEqual(timed.came, { kind: 'timeout', ms: 300 }, 'the silent claude outlasted the ask');
    assert.ok(timed.pid !== null && gone(timed.pid), `the timed-out ask let its claude go (pid ${timed.pid})`);
  });

  await s.test('REFUSED: an ask that was interrupted leaves no claude behind', async (sub) => {
    const stop = new AbortController();
    const cut = await overStandIn(NEVER_MS, async (pidOf) => {
      const exit = Effect.runPromiseExit(claudeQuota(), { signal: stop.signal });
      await until(sub, pidOf, 'the ask started its claude, which wrote its pid before it was interrupted', { everyMs: 20 });
      stop.abort();
      return exit;
    });
    assert.ok(Exit.hasInterrupts(cut.came), 'the ask was interrupted, not answered');
    assert.ok(cut.pid !== null && gone(cut.pid), `the interrupted ask let its claude go (pid ${cut.pid})`);
  });
});

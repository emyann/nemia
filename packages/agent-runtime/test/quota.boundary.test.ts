/**
 * Which Claude Code the quota ask drives, over the Agent SDK itself and a stand-in Claude Code on PATH
 * (`fixtures/stand-in-claude.ts`, which answers the usage control request from a recorded answer): the ask names `claude` and the SDK
 * resolves it on PATH, so the plan is read by the Claude Code the harness runs its sessions with, and a PATH without one is `missing`.
 * A boundary test: it builds the real engine, and its ask starts a real process through the SDK.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { claudeQuota } from '../src/harness/claude/index.ts';
import { Engine } from '../src/index.ts';
import { scratch } from './scratch.ts';
import { asyncOps, type AsyncRunner } from './promise-runner.ts';
import { builtEngine } from './engine.ts';

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
 * A folder holding a `claude` that is the stand-in, first on PATH for the length of `asked`: what the stand-in wrote of its starts is
 * answered beside the quota it gave.
 */
const overStandIn = async (asked: () => Promise<unknown>): Promise<{ quota: unknown; starts: string[] }> => {
  const dir = scratch('ae-quota-standin-');
  const bin = scratch('ae-quota-bin-');
  fs.writeFileSync(
    path.join(bin, 'claude'),
    `#!/bin/sh\nSTANDIN_DIR='${dir}' STANDIN_USAGE='${RECORDED}' STANDIN_NO_BRIDGE=1 exec node '${STAND_IN}' "$@"\n`,
    { mode: 0o755 },
  );
  const before = process.env.PATH;
  process.env.PATH = `${bin}${path.delimiter}${before ?? ''}`;
  try {
    const quota = await asked();
    const argv = path.join(dir, 'argv.jsonl');
    return { quota, starts: fs.existsSync(argv) ? fs.readFileSync(argv, 'utf8').split('\n').filter(Boolean) : [] };
  } finally {
    process.env.PATH = before;
  }
};

test("the engine's quota drives the `claude` on PATH, and reads the plan it answers: the Claude Code the harness runs its sessions with", async () => {
  const engine = engineAsking();
  const { quota, starts } = await overStandIn(() => Effect.runPromise(engine.quota()));
  assert.equal(starts.length, 1, "the `claude` on PATH was started once, and not the SDK's own bundled CLI");
  assert.deepEqual(quota, {
    kind: 'windows',
    limits: [
      { key: 'five_hour', usedPercentage: 3, resetsAt: '2026-09-19T15:10:00.048Z' },
      { key: 'seven_day', usedPercentage: 50, resetsAt: '2026-09-23T11:00:00.048Z' },
      { key: 'extra_usage', usedPercentage: 0, resetsAt: null },
      { key: 'nimbus_quill', usedPercentage: 0, resetsAt: null },
    ],
    subscription: 'max',
  });
});

test('REFUSED: a PATH with no `claude` on it is `missing`, as the SDK says there is no executable to start', async () => {
  const before = process.env.PATH;
  process.env.PATH = scratch('ae-quota-nothing-');
  try {
    assert.deepEqual(await Effect.runPromise(engineAsking().quota()), { kind: 'missing' });
  } finally {
    process.env.PATH = before;
  }
});

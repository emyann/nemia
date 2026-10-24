/**
 * A bridged session's web link on the api, off the one field every task's view has (`bridge`, through the package's `bridgeOf`): a step
 * that says `remote: true` answers it on its detail (`filed.bridge`), a step that does not answers null, and Nemia's level answers it as
 * her `bridge` and her second `reach` line, from the same field of her task's view.
 *
 * A boundary test: at shipped defaults, through the engine itself, since the link is read off the run file the holder of a session on
 * the Agent SDK writes, which the test engine has no model of: each task is journalled as filed and spawned — a step's as a job, Nemia's
 * as a long-lived session — and its session's run file written as its holder writes it, held by a process of this machine.
 */
import { root } from './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';
import type { RunDetail } from '../src/detail/detail.ts';
import { app } from '../src/app.ts';
import { Effect } from 'effect';
import { engine } from 'agent-orchestrator';

const at = '2026-10-06T08:00:00.000Z';
const BRIDGED = { claude: { remoteControl: true } };

/**
 * A task on Claude Code filed with `taskConfig` and spawned once — a job, or a long-lived session where `restartPolicy` says `Always`:
 * its journal, as the engine writes.
 */
const spawned = (taskId: string, taskConfig: object, restartPolicy?: 'Always') => {
  const file = path.join(root, 'engine', 'tasks', `${taskId}.jsonl`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const events = [
    {
      kind: 'filed',
      at,
      brief: 'Work.',
      cwd: '/code/app',
      maxAttempts: 1,
      harness: 'claude',
      config: taskConfig,
      ...(restartPolicy ? { restartPolicy } : {}),
    },
    { kind: 'starting', at, attempt: 1 },
    { kind: 'spawned', at, attempt: 1 },
  ];
  fs.writeFileSync(file, events.map((e) => `${JSON.stringify(e)}\n`).join(''));
};

/**
 * The run file a holder writes for the session `ae/<task>/1` it runs on the Agent SDK, as the daemon runs every Claude Code session it
 * spawns: held by this test's parent, a process that is there, with Claude Code's id `sessionId`, and the bridge the SDK's
 * `enableRemoteControl` answered — its link, or no link and why — where one is given.
 */
const held = (taskId: string, sessionId: string, bridge?: { url: string } | { why: string }) => {
  const name = `ae/${taskId}/1`;
  const dir = path.join(root, 'engine', 'runs', 'attached');
  fs.mkdirSync(dir, { recursive: true });
  const run = { name, state: 'working', owner: process.ppid, startedAt: at, sessionId, ...(bridge ? { bridge } : {}), request: {} };
  fs.writeFileSync(path.join(dir, `${name.replace(/[^A-Za-z0-9._-]/g, '_')}.json`), JSON.stringify(run));
};

/** A run of one workflow whose steps are `steps`, each filed as the task `<run>-<step>`. */
const writeRun = (id: string, steps: Array<{ name: string } & Record<string, unknown>>) => {
  fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
  const record = {
    id,
    repo: '/code/app',
    workspace: '/code/app',
    baseRef: 'def456',
    branch: 'main',
    isolate: false,
    brief: 'Bridge it.',
    workflowDir: path.join(scratch('nemia-api-bridge-'), 'no-such-workflow'),
    createdAt: at,
    workflow: steps.map((s) => ({ after: [], body: 'Work.', harness: 'claude', ...s })),
    steps: Object.fromEntries(steps.map((s) => [s.name, { taskId: `${id}-${s.name}` }])),
  };
  fs.writeFileSync(path.join(root, 'runs', `${id}.json`), JSON.stringify(record));
};

test("a step that says remote: true answers its session's web link on its detail while its job runs, and one that does not answers null", async () => {
  spawned('r-70-implement', BRIDGED);
  spawned('r-70-review', {});
  held('r-70-implement', 'aaaaaaaa-0000-4000-8000-000000000001', { url: 'https://claude.ai/code/session_01StepLink' });
  held('r-70-review', 'aaaaaaaa-0000-4000-8000-000000000002', { url: 'https://claude.ai/code/session_01NotAsked' });
  writeRun('r-70', [{ name: 'implement', remote: true }, { name: 'review' }]);

  const res = await app.request('/api/runs/r-70');
  assert.equal(res.status, 200);
  const [implement, review] = ((await res.json()) as RunDetail).steps;
  assert.deepEqual(implement.filed?.bridge, { url: 'https://claude.ai/code/session_01StepLink', why: null });
  assert.equal(
    (await Effect.runPromise(engine().view('r-70-implement'))).bridge?.url,
    implement.filed?.bridge?.url,
    "the link is the engine's own, off the run file its session's holder wrote",
  );
  assert.equal(review.filed?.bridge, null, 'not bridged: null, whatever its run file holds');

  held('r-70-implement', 'aaaaaaaa-0000-4000-8000-000000000001');
  const down = ((await (await app.request('/api/runs/r-70')).json()) as RunDetail).steps[0].filed?.bridge;
  assert.equal(down?.url, null, 'asked and not up: no link');
  assert.ok(down?.why, 'and why, in the runtime’s words');
});

test("Nemia's level answers her web link as her bridge and her second reach line, from her task's view's same field", async () => {
  const task = 'nemia-20261006T080000Z';
  spawned(task, BRIDGED, 'Always');
  held(task, 'bbbbbbbb-0000-4000-8000-000000000001', { url: 'https://claude.ai/code/session_01HerLink' });
  fs.mkdirSync(path.join(root, 'nemia'), { recursive: true });
  fs.writeFileSync(path.join(root, 'nemia', 'level.json'), JSON.stringify({ level: 'semi-auto', since: at, task }));

  const res = await app.request('/api/level');
  assert.equal(res.status, 200);
  const level = (await res.json()) as { bridge: unknown; reach: string[] };
  assert.deepEqual(level.bridge, { url: 'https://claude.ai/code/session_01HerLink', why: null });
  assert.equal(level.reach[1], 'https://claude.ai/code/session_01HerLink', 'after the attach line');
});

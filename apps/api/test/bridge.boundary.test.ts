/**
 * A bridged session's web link on the api, off the one field every task's view has (`bridge`, through the package's `bridgeOf`): a step
 * that says `remote: true` answers it on its detail (`filed.bridge`), a step that does not answers null, and Nemia's level answers it as
 * her `bridge` and her second `reach` line, from the same field of her task's view.
 *
 * A boundary test: at shipped defaults, through the engine itself, since the link is read off Claude Code's own files, which the test
 * engine has no model of: each task is journalled as filed and spawned, its session listed by the harness's
 * registry with a process of this machine, and the registration Claude Code writes for it put in the harness's folder (`config`).
 */
import { config, registry, root } from './harness.ts';
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
const BRIDGED = { background: true, claude: { remoteControl: true } };

/**
 * When the process `pid` started, as `/proc/<pid>/stat` counts it, which a registration holds as `procStart`; undefined where there is
 * no `/proc`, where the runtime checks none.
 */
const startOf = (pid: number): string | undefined => {
  if (!fs.existsSync(`/proc/${pid}/stat`)) return undefined;
  const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
  return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
};

/** A long-lived task on Claude Code's background harness, filed with `taskConfig` and spawned once: its journal, as the engine writes. */
const spawned = (taskId: string, taskConfig: object) => {
  const file = path.join(root, 'engine', 'tasks', `${taskId}.jsonl`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const events = [
    { kind: 'filed', at, brief: 'Work.', cwd: '/code/app', maxAttempts: 1, harness: 'claude', config: taskConfig, restartPolicy: 'Always' },
    { kind: 'starting', at, attempt: 1 },
    { kind: 'spawned', at, attempt: 1 },
  ];
  fs.writeFileSync(file, events.map((e) => `${JSON.stringify(e)}\n`).join(''));
};

/** The sessions the harness lists, `ae/<task>/1` each, held by the process `pid` with the session id `sessionId`. */
const listed = (sessions: Array<{ taskId: string; sessionId: string; pid: number }>) =>
  fs.writeFileSync(
    registry,
    JSON.stringify(
      sessions.map(({ taskId, sessionId, pid }) => ({
        name: `ae/${taskId}/1`,
        sessionId,
        state: 'working',
        status: 'busy',
        kind: 'background',
        startedAt: Date.parse(at),
        pid,
      })),
    ),
  );

/** The registration Claude Code writes for the session `sessionId` under `pid`, with `bridgeSessionId` where one is given. */
const registered = (pid: number, sessionId: string, bridgeSessionId?: string) => {
  fs.mkdirSync(path.join(config, 'sessions'), { recursive: true });
  const r = { pid, sessionId, kind: 'bg', procStart: startOf(pid), ...(bridgeSessionId ? { bridgeSessionId } : {}) };
  fs.writeFileSync(path.join(config, 'sessions', `${pid}.json`), JSON.stringify(r));
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
    workflow: steps.map((s) => ({ after: [], body: 'Work.', harness: 'claude', background: true, ...s })),
    steps: Object.fromEntries(steps.map((s) => [s.name, { taskId: `${id}-${s.name}` }])),
  };
  fs.writeFileSync(path.join(root, 'runs', `${id}.json`), JSON.stringify(record));
};

test("a step that says remote: true answers its session's web link on its detail, and one that does not answers null", async () => {
  spawned('r-70-implement', BRIDGED);
  spawned('r-70-review', { background: true });
  listed([
    { taskId: 'r-70-implement', sessionId: 'aaaaaaaa-0000-4000-8000-000000000001', pid: process.pid },
    { taskId: 'r-70-review', sessionId: 'aaaaaaaa-0000-4000-8000-000000000002', pid: process.ppid },
  ]);
  registered(process.pid, 'aaaaaaaa-0000-4000-8000-000000000001', 'session_01StepLink');
  registered(process.ppid, 'aaaaaaaa-0000-4000-8000-000000000002', 'session_01NotAsked');
  writeRun('r-70', [{ name: 'implement', remote: true }, { name: 'review' }]);

  const res = await app.request('/api/runs/r-70');
  assert.equal(res.status, 200);
  const [implement, review] = ((await res.json()) as RunDetail).steps;
  assert.deepEqual(implement.filed?.bridge, { url: 'https://claude.ai/code/session_01StepLink', why: null });
  assert.equal(
    (await Effect.runPromise(engine().view('r-70-implement'))).bridge?.url,
    implement.filed?.bridge?.url,
    "the link is the engine's own, off the registration Claude Code wrote",
  );
  assert.equal(review.filed?.bridge, null, 'not bridged: null, whatever its registration holds');

  registered(process.pid, 'aaaaaaaa-0000-4000-8000-000000000001');
  const down = ((await (await app.request('/api/runs/r-70')).json()) as RunDetail).steps[0].filed?.bridge;
  assert.equal(down?.url, null, 'asked and not up: no link');
  assert.match(down?.why ?? '', /`bridgeSessionId` yet/, 'and why, in the runtime’s words');
});

test("Nemia's level answers her web link as her bridge and her second reach line, from her task's view's same field", async () => {
  const task = 'nemia-20261006T080000Z';
  spawned(task, BRIDGED);
  listed([{ taskId: task, sessionId: 'bbbbbbbb-0000-4000-8000-000000000001', pid: process.pid }]);
  registered(process.pid, 'bbbbbbbb-0000-4000-8000-000000000001', 'session_01HerLink');
  fs.mkdirSync(path.join(root, 'nemia'), { recursive: true });
  fs.writeFileSync(path.join(root, 'nemia', 'level.json'), JSON.stringify({ level: 'semi-auto', since: at, task }));

  const res = await app.request('/api/level');
  assert.equal(res.status, 200);
  const level = (await res.json()) as { bridge: unknown; reach: string[] };
  assert.deepEqual(level.bridge, { url: 'https://claude.ai/code/session_01HerLink', why: null });
  assert.equal(level.reach[1], 'https://claude.ai/code/session_01HerLink', 'after the attach line');
});

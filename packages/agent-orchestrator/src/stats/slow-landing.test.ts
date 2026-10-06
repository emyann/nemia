/**
 * The slow landings of `nemia stats` (`statsRun`, stats.verb.ts) read the deadline each landing check's task was filed with off the
 * engine's view, walked through the runtime itself over an in-memory journal. A file of its own, since `stats` reads every run under
 * `WF_ROOT`, read as the store loads, so it is set before the import.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Engine } from 'agent-runtime';
import { asyncOps, asyncStore, plainEngine, type AsyncJournal, type AsyncRunner } from '../../test/promised.ts';
import { scratch } from '../../test/scratch.ts';

const ROOT = scratch('wf-slow-landing-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
process.env.WF_ROOT = ROOT;
const { statsRun } = await import('./stats.verb.ts');
const { runWith } = await import('../runtime-client.ts');

type Event = Parameters<AsyncJournal['append']>[1];

const tasks = new Map<string, Event[]>();
const journal: AsyncJournal = {
  async append(taskId, event) {
    tasks.set(taskId, [...(tasks.get(taskId) ?? []), event]);
  },
  async read(taskId) {
    return [...(tasks.get(taskId) ?? [])];
  },
  async list() {
    return [...tasks.keys()].sort();
  },
  async feed() {
    return { entries: [], cursor: 0 };
  },
};

/** A harness no task here reaches: every task is journalled by hand. */
const idle: AsyncRunner = {
  async spawn() {},
  async observe() {
    return new Map();
  },
  async stop() {},
  async logs() {
    return '';
  },
};

const e = plainEngine(
  Engine.layer({
    root: path.join(ROOT, 'engine'),
    journal: asyncStore(journal),
    harnesses: { codex: asyncOps(idle), check: asyncOps(idle) },
    defaultHarness: 'codex',
  }),
);

const START = Date.parse('2026-10-01T09:00:00.000Z');
const NOW = new Date('2026-10-02T12:00:00.000Z');
const iso = (ms: number): string => new Date(START + ms).toISOString();

/** A task filed on `harness`, with `deadlineSeconds` where given, that ran from `from` to `to` ms after the start and succeeded. */
async function journalled(taskId: string, harness: string, from: number, to: number, deadlineSeconds?: number): Promise<void> {
  const events: object[] = [
    { kind: 'filed', at: iso(from), brief: 'Do it.', cwd: ROOT, maxAttempts: 1, harness, ...(deadlineSeconds ? { deadlineSeconds } : {}) },
    { kind: 'starting', at: iso(from), attempt: 1 },
    { kind: 'spawned', at: iso(from), attempt: 1 },
    { kind: 'ended', at: iso(to), attempt: 1, sessionId: `ae/${taskId}/1`, observed: 'done', reason: 'harness' },
    { kind: 'settled', at: iso(to), outcome: 'succeeded' },
  ];
  for (const event of events) await journal.append(taskId, event as Event);
}

/** A run whose one step lands it on its check: a session of a minute, then a check that ran `checkSeconds`, filed with `deadline`. */
async function aLanding(id: string, checkSeconds: number, deadline: number): Promise<void> {
  await journalled(`${id}-land`, 'codex', 0, 60_000);
  await journalled(`${id}-land-check`, 'check', 60_000, 60_000 + checkSeconds * 1000, deadline);
  const workflow = [{ name: 'land', after: [], body: 'Land it.', harness: 'codex', workspace: 'main', gate: true, check: 'npm test' }];
  fs.writeFileSync(
    path.join(ROOT, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      repo: '/repos/home',
      baseRef: 'abc',
      workspace: '/repos/home',
      branch: 'main',
      isolate: true,
      brief: `The brief of ${id}`,
      createdAt: iso(0),
      workflowDir: '/repos/home/workflows/build',
      workflow,
      steps: { land: { taskId: `${id}-land`, check: { taskId: `${id}-land-check` } } },
    }),
  );
}

await aLanding('s-old', 1033, 1200);
await aLanding('s-new', 1033, 2700);

test('a landing check is judged against the deadline its task was filed with, read off the engine', async () => {
  const s = await runWith(e, statsRun({}, NOW));
  assert.deepEqual(
    s.all.slowLandings.map((x) => [x.run, x.step, x.checkMs, x.deadlineMs, Math.round(x.share * 100)]),
    [['s-old', 'land', 1_033_000, 1_200_000, 86]],
    'the same 1033 s is over half of 1200 and under half of 2700',
  );
});

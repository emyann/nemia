/**
 * Why one step's session alone could not be read, on its run's detail (`sessionUnread`): at shipped defaults, the api's own
 * engine over a store this file seeds, a Claude Code job at work — its run file as its worker writes it, held by this process — and
 * the capture its own process prints the Agent SDK's messages to, with a line that does not decode. The words are the runtime's, read
 * afresh on every request. A boundary test: the run file and the capture are the job's own files, which the test engine has no model of.
 */
import { root } from './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { app } from '../src/app.ts';
import { Effect } from 'effect';
import { engine } from 'agent-orchestrator';

type RunDetail = import('../src/detail/detail.ts').RunDetail;

const NOW = Date.now();
const at = (s: number) => new Date(NOW + s * 1000).toISOString();
const jsonl = (lines: object[]) => lines.map((line) => `${JSON.stringify(line)}\n`).join('');
const write = (file: string, text: string): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

/** Where the job of `taskId`'s first attempt keeps its files, as its runner names them: its run file and its capture beside it. */
const jobOf = (taskId: string) => path.join(root, 'engine', 'runs', 'claude', `ae_${taskId.replace(/[^a-zA-Z0-9]+/g, '_')}_1`);

/** A task filed on `claude`, spawned once and not ended: a job at work, its run file held by this process, its capture `said`. */
const atWork = (taskId: string, said: object[]): void => {
  write(
    path.join(root, 'engine', 'tasks', `${taskId}.jsonl`),
    jsonl([
      { kind: 'filed', at: at(-9), brief: 'Build it.', cwd: '/code/app', maxAttempts: 1, harness: 'claude' },
      { kind: 'starting', at: at(-8), attempt: 1 },
      { kind: 'spawned', at: at(-8), attempt: 1 },
    ]),
  );
  const job = jobOf(taskId);
  write(
    `${job}.json`,
    JSON.stringify({ name: `ae/${taskId}/1`, state: 'working', pid: process.pid, logFile: `${job}.log`, heartbeatAt: at(0) }),
  );
  write(`${job}.log`, jsonl(said));
};

/** A `result` line, as the job's process prints the SDK's: its cost as given. */
const result = (cost: unknown) => ({ type: 'result', subtype: 'success', total_cost_usd: cost });

const RUN = 'r-unread';
write(
  path.join(root, 'runs', `${RUN}.json`),
  JSON.stringify({
    id: RUN,
    place: { kind: 'folder' },
    workspace: root,
    brief: 'Build it',
    workflowDir: path.join(root, 'no-such-workflow'),
    createdAt: at(-10),
    workflow: ['build', 'review'].map((name) => ({ name, after: [], body: 'Build it.', workspace: 'folder' })),
    steps: { build: { taskId: 't-build' }, review: { taskId: 't-review' } },
  }),
);

const stepsOf = async (): Promise<Map<string, RunDetail['steps'][number]>> => {
  const res = await app.request(`/api/runs/${RUN}`);
  assert.equal(res.status, 200);
  return new Map(((await res.json()) as RunDetail).steps.map((s) => [s.name, s]));
};

test("REFUSED: a run's detail says why one step's session alone could not be read, in the runtime's words, and nothing once a request reads it", async () => {
  atWork('t-build', [result('yesterday')]);
  atWork('t-review', [result(0.01)]);

  const unread = await stepsOf();
  const words = unread.get('build')?.sessionUnread;
  assert.ok(words?.includes('`ae/t-build/1`'), `the runtime's words, naming the session: ${words}`);
  assert.ok(words?.includes('"yesterday"'), `naming what did not decode: ${words}`);
  assert.equal(unread.get('review')?.sessionUnread, null, 'the step read beside it says nothing');
  assert.equal((await Effect.runPromise(engine().view('t-build'))).unreadWhy, words, "the engine's own words");

  write(`${jobOf('t-build')}.log`, jsonl([result(0.02)]));
  assert.equal((await stepsOf()).get('build')?.sessionUnread, null, 'the first request whose look reads it says nothing: none is kept');
});

/**
 * Why one step's session alone could not be read, on its run's detail (`sessionUnread`): at shipped defaults, the api's own
 * engine over a store this file seeds, a background session the harness's fake `claude` lists at work, and its transcript where Claude
 * Code keeps one (`config`), with a line that does not decode. The words are the runtime's, read afresh on every request. A boundary
 * test: the transcript is Claude Code's own file, which the test engine has no model of.
 */
import { config, registry, root } from './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
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

/** A background task spawned once and not ended, listed working and idle by `claude agents`. Returns its session's id. */
const atWork = (taskId: string): string => {
  const sessionId = randomUUID();
  write(
    path.join(root, 'engine', 'tasks', `${taskId}.jsonl`),
    jsonl([
      { kind: 'filed', at: at(-9), brief: 'Build it.', cwd: '/code/app', maxAttempts: 1, harness: 'claude', config: { background: true } },
      { kind: 'starting', at: at(-8), attempt: 1 },
      { kind: 'spawned', at: at(-8), attempt: 1 },
    ]),
  );
  const rows = JSON.parse(fs.readFileSync(registry, 'utf8')) as object[];
  rows.push({ name: `ae/${taskId}/1`, sessionId, kind: 'background', state: 'working', status: 'idle', startedAt: NOW - 8000 });
  fs.writeFileSync(registry, JSON.stringify(rows));
  return sessionId;
};

/** A session's transcript, as Claude Code writes one: the prompt and an answer, the answer's `timestamp` as given. */
const transcript = (sessionId: string, timestamp: string): void => {
  const line = { sessionId, isSidechain: false, userType: 'external', cwd: '/code/app', version: '2.1.291', gitBranch: 'main' };
  write(
    path.join(config, 'projects', '-code-app', `${sessionId}.jsonl`),
    jsonl([
      { ...line, type: 'user', uuid: 'u-1', timestamp: at(-7), message: { role: 'user', content: 'Build it.' } },
      {
        ...line,
        type: 'assistant',
        uuid: 'a-1',
        timestamp,
        message: { role: 'assistant', content: [{ type: 'text', text: 'Building.' }] },
      },
    ]),
  );
};

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
  const build = atWork('t-build');
  const review = atWork('t-review');
  transcript(build, 'yesterday');
  transcript(review, at(-1));

  const unread = await stepsOf();
  const words = unread.get('build')?.sessionUnread;
  assert.ok(words?.includes("`ae/t-build/1`'s transcript cannot be read"), `the runtime's words: ${words}`);
  assert.ok(words?.includes('"yesterday"'), `naming what did not decode: ${words}`);
  assert.equal(unread.get('review')?.sessionUnread, null, 'the step read beside it says nothing');
  assert.equal((await Effect.runPromise(engine().view('t-build'))).unreadWhy, words, "the engine's own words");

  transcript(build, at(-1));
  const file = path.join(config, 'projects', '-code-app', `${build}.jsonl`);
  const later = new Date(fs.statSync(file).mtimeMs + 5_000);
  fs.utimesSync(file, later, later);
  assert.equal((await stepsOf()).get('build')?.sessionUnread, null, 'the first request whose look reads it says nothing: none is kept');
});

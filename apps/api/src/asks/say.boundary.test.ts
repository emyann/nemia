/**
 * A person's words to a step's running session over HTTP, as far as the harness: POST /api/runs/:id/steps/:step/say on the real engine,
 * whose Claude Code harness puts the words on the session's inbox and journals them, or journals nothing and answers 502 when the inbox
 * is not there. The route's refusals and its reads on the stand-ins are `say.test.ts`'s.
 *
 * At shipped defaults: the api's own engine over a store this file seeds; the harness's fake `claude` (test/harness.ts) first on PATH,
 * listing the sessions this file says are running, each with a pid, so the registry of the sessions on this machine is never asked; and a
 * real Unix socket standing in for a session's inbox, registered where Claude Code registers one
 * (`<CLAUDE_CONFIG_DIR>/sessions/<pid>.json`). So words the api takes are on that socket, as given, and on the task's journal; words it
 * refuses are on neither.
 *
 * The tasks it seeds: `t-implement`, at work, its inbox listening; `t-deaf`, at work, its registration naming an inbox that is not there;
 * `t-settled`, ran once and signed off; and `t-cancelled`, the cancelled run's step, at work with its inbox listening: only the run's mark
 * refuses it.
 */
import { config, registry, root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { scratch } from '../../test/scratch.ts';
import type { Said } from 'agent-orchestrator';
import { app } from '../app.ts';
import { engine } from 'agent-orchestrator';

const tmp = (label: string) => scratch(`nemia-api-say-${label}-`);

const T0 = Date.parse('2026-09-14T06:00:00.000Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const jsonl = (lines: object[]) => lines.map((line) => `${JSON.stringify(line)}\n`).join('');
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const tasksDir = path.join(root, 'engine', 'tasks');
const journalFile = (taskId: string) => path.join(tasksDir, `${taskId}.jsonl`);
const journal = (taskId: string, events: object[]) => write(journalFile(taskId), jsonl(events));
const started = [
  { kind: 'filed', at: at(0), brief: 'Do it.', cwd: '/code/app', maxAttempts: 1, harness: 'claude' },
  { kind: 'starting', at: at(1), attempt: 1 },
  { kind: 'spawned', at: at(1), attempt: 1 },
];

/**
 * A session's inbox: a Unix socket that keeps each line it is sent, answers nothing, and closes its end once the sender has, as Claude
 * Code's does.
 */
const inbox = async () => {
  const socket = path.join(tmp('sock'), 'in.sock');
  const lines: unknown[] = [];
  const server = net.createServer({ allowHalfOpen: true }, (c) => {
    let got = '';
    c.setEncoding('utf8');
    c.on('data', (d) => {
      got += d;
    });
    c.on('end', () => {
      for (const line of got.split('\n')) if (line.trim()) lines.push(JSON.parse(line));
      c.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(socket, resolve));
  server.unref();
  return { path: socket, lines };
};

let pid = 424_200;
/**
 * A Claude Code task whose session the harness lists at work, with a pid, and registered as Claude Code registers one, its inbox at
 * `socket`.
 */
const runningSession = (taskId: string, socket: string): string => {
  const sessionId = randomUUID();
  journal(taskId, started);
  pid += 1;
  const rows = JSON.parse(fs.readFileSync(registry, 'utf8')) as object[];
  rows.push({ name: `ae/${taskId}/1`, sessionId, kind: 'background', state: 'working', status: 'busy', startedAt: T0, pid });
  fs.writeFileSync(registry, JSON.stringify(rows));
  write(
    path.join(config, 'sessions', `${pid}.json`),
    JSON.stringify({ pid, sessionId, name: `ae/${taskId}/1`, kind: 'bg', messagingSocketPath: socket }),
  );
  return sessionId;
};

const box = await inbox();
const R = 'r-say';
const C = 'r-say-cancelled';
const implementSession = runningSession('t-implement', box.path);
runningSession('t-deaf', path.join(tmp('gone'), 'in.sock'));
journal('t-settled', [
  ...started,
  {
    kind: 'ended',
    at: at(9),
    attempt: 1,
    sessionId: 'ae/t-settled/1',
    observed: 'done',
    reason: 'harness',
    closeout: { outcome: 'done', summary: 'Done.', needs: null, artifacts: [] },
  },
  { kind: 'settled', at: at(9), outcome: 'succeeded' },
]);
runningSession('t-cancelled', box.path);

const record = (id: string, steps: Record<string, { taskId: string | null }>) =>
  write(
    path.join(root, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      repo: '/code/app',
      workspace: '/code/app',
      baseRef: 'abc123',
      branch: 'main',
      isolate: true,
      brief: 'Say something to it',
      workflowDir: path.join(root, 'no-such-workflow'),
      createdAt: at(0),
      workflow: Object.keys(steps).map((name) => ({ name, after: [], body: `${name} it.` })),
      steps,
    }),
  );
record(R, { implement: { taskId: 't-implement' }, deaf: { taskId: 't-deaf' }, settled: { taskId: 't-settled' }, review: { taskId: null } });
record(C, { implement: { taskId: 't-cancelled' } });
write(path.join(root, 'runs', `${C}.cancelled`), at(5));

/** What the board sends, through vite's proxy: JSON, same-origin, and Host rewritten to the api's. */
const BOARD = {
  'content-type': 'application/json',
  'sec-fetch-site': 'same-origin',
  origin: 'http://localhost:5173',
  host: '127.0.0.1:8787',
};

const sayTo = (step: string, body: unknown, headers: Record<string, string> = BOARD, run = R) =>
  app.request(`/api/runs/${run}/steps/${step}/say`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

/** Every file the api could have written: the runs' records and marks, and the engine's journals. */
const written = () =>
  Object.fromEntries(
    [path.join(root, 'runs'), tasksDir].flatMap((dir) =>
      fs
        .readdirSync(dir)
        .sort()
        .map((f) => [path.join(dir, f), fs.readFileSync(path.join(dir, f), 'utf8')]),
    ),
  );

test("words the harness could not be given come back in the engine's words, 502 — nothing journalled, so asking again may work", async () => {
  const before = written();
  const res = await sayTo('deaf', { text: 'Widen the scope.' });
  assert.equal(res.status, 502);
  const { error } = (await res.json()) as { error: string };
  assert.match(error, /^say: ae\/t-deaf\/1 was not given the words \([\s\S]*is not there[\s\S]*\)\. Nothing was journalled\.$/);
  assert.deepEqual(written(), before, 'nothing written');
});

test("words as the board sends them reach the session's inbox as given, and the engine's entry the route answers is the last line of the task's journal; nothing else written", async () => {
  const records = Object.fromEntries(Object.entries(written()).filter(([file]) => !file.startsWith(tasksDir)));
  const words = 'Widen the scope to apps/api too.\n\nAnd keep `--flag` as it is.';
  const res = await sayTo('implement', { text: words });
  assert.equal(res.status, 202, await res.clone().text());
  const said = (await res.json()) as Said;
  assert.deepEqual(Object.keys(said).sort(), ['after', 'at', 'attempt', 'text']);
  assert.deepEqual(
    [said.attempt, said.text, said.after],
    [1, words, null],
    'no transcript is seeded for the session: no event to stand after',
  );
  assert.equal(new Date(said.at).toISOString(), said.at, 'the time the package recorded, an ISO time');

  assert.deepEqual(
    box.lines,
    [{ type: 'user', session_id: implementSession, message: { role: 'user', content: words } }],
    'the words on the inbox, as given',
  );
  assert.deepEqual((await Effect.runPromise(engine().view('t-implement'))).state.said, [said], "the engine's journal of the task");
  assert.deepEqual(
    JSON.parse(fs.readFileSync(journalFile('t-implement'), 'utf8').trim().split('\n').at(-1)!),
    { kind: 'said', ...said },
    "the last line of the task's journal: the entry the package's say recorded",
  );
  assert.deepEqual(
    Object.fromEntries(Object.entries(written()).filter(([file]) => !file.startsWith(tasksDir))),
    records,
    "the runs' records untouched, and no file of the api's",
  );
});

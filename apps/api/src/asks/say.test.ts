/**
 * A person's words to a step's running session over HTTP: POST /api/runs/:id/steps/:step/say, which calls the package's `sayRun` —
 * `nemia say`'s own — and the `said` on the step's detail, read back off the engine's journal.
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
import type { RunDetail } from '../detail/detail.ts';
import { app } from '../app.ts';
import { engine, list, runStore, runShipped as runWith, sayRun, type RunSummary } from 'agent-orchestrator';

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

/** What the package's `sayRun` refuses the words for, word for word: what `nemia say` prints. */
const sayRefuses = async (step: string, text: string, run = R): Promise<string> => {
  try {
    await runWith(engine(), sayRun(run, step, text));
  } catch (err) {
    return (err as Error).message;
  }
  return assert.fail(`say() took ${JSON.stringify(text)} for ${run} ${step}, and should have refused`);
};

const detailSteps = async (id = R): Promise<RunDetail['steps']> =>
  ((await (await app.request(`/api/runs/${id}`)).json()) as RunDetail).steps;

test('REFUSED at shipped defaults: words another site could send — a page on another site (403), a name that is not this machine (403), a body not sent as application/json (415) — and JSON that is not the words (400): nothing said, nothing written', async () => {
  const before = written();
  const body = { text: 'Widen the scope to apps/api too.' };
  for (const site of ['cross-site', 'same-site', 'none']) {
    const res = await sayTo('implement', body, { ...BOARD, 'sec-fetch-site': site });
    assert.equal(res.status, 403, site);
    assert.equal(
      ((await res.json()) as { error: string }).error,
      `POST /api/runs/${R}/steps/implement/say refuses a request made by a page on another site (Sec-Fetch-Site: ${site}): the words go into the session of a step at work in this repository, as a person's, and its agent acts on them. Say it from the step's session page on the board, or with \`nemia say ${R} implement "<words>"\`.`,
    );
  }
  for (const host of ['evil.example', 'evil.example:8787', 'localhost.evil.example:8787']) {
    const res = await sayTo('implement', body, { ...BOARD, host });
    assert.equal(res.status, 403, host);
    assert.ok(
      ((await res.json()) as { error: string }).error.startsWith(
        `POST /api/runs/${R}/steps/implement/say refuses a request addressed to ${host}: the api hands a person's words to a step's running session only for a request to this machine`,
      ),
    );
  }
  for (const type of ['text/plain;charset=UTF-8', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x']) {
    const res = await sayTo('implement', body, { ...BOARD, 'content-type': type });
    assert.equal(res.status, 415, type);
    assert.ok(
      ((await res.json()) as { error: string }).error.startsWith(
        `POST /api/runs/${R}/steps/implement/say takes its body as \`content-type: application/json\``,
      ),
    );
  }
  const bodies: Array<[unknown, RegExp]> = [
    ['Widen the scope to apps/api too.', /^POST …\/say takes a JSON body: `\{ "text": "<words>" \}`\.$/],
    [['Widen the scope'], /^POST …\/say takes a JSON object: /],
    [{}, /^`text` is the words to hand the step's session[\s\S]*This request's was left out/],
    [{ text: 42 }, /^`text` is the words to hand the step's session[\s\S]*This request's was 42/],
    [{ message: 'Widen the scope' }, /^`text` is the words[\s\S]*was left out/],
  ];
  for (const [sent, words] of bodies) {
    const res = await sayTo('implement', sent);
    assert.equal(res.status, 400, JSON.stringify(sent));
    assert.match(((await res.json()) as { error: string }).error, words);
  }
  assert.deepEqual(box.lines, [], 'nothing reached the inbox');
  assert.deepEqual(written(), before, 'nothing written');
});

test("REFUSED at shipped defaults: empty words (the engine's sentence), a settled step, a step not filed, a cancelled run — 409s in the package's words and the engine's, verbatim, as `nemia say` prints them — and no such run or step, 404: nothing said, nothing written", async () => {
  const before = written();
  const cases: Array<[string, string, string, RegExp]> = [
    [R, 'implement', '', /^say: `text` is empty\. Give the words the session should hear\.$/],
    [R, 'implement', ' \n\t', /^say: `text` is empty\. Give the words the session should hear\.$/],
    [
      R,
      'settled',
      'Widen the scope.',
      /^settled is not running: try 1's task settled `succeeded`, so no session of it is there to hear anything\. .*: nemia retry r-say settled --message "<words>"\.$/,
    ],
    [R, 'review', 'Look at the parser first.', /^review has not been filed yet, so there is no session to hear anything\./],
    [
      C,
      'implement',
      'Widen the scope.',
      /^r-say-cancelled was cancelled at 2026-09-14T06:00:05\.000Z: its sessions are being stopped, not steered/,
    ],
  ];
  for (const [run, step, text, words] of cases) {
    const res = await sayTo(step, { text }, BOARD, run);
    assert.equal(res.status, 409, `${run} ${step} ${JSON.stringify(text)}`);
    const { error } = (await res.json()) as { error: string };
    assert.match(error, words);
    assert.equal(error, await sayRefuses(step, text, run), "the package's words, as `nemia say` prints them");
  }
  const noRun = await sayTo('implement', { text: 'Widen the scope.' }, BOARD, 'r-nope');
  assert.equal(noRun.status, 404);
  assert.match(((await noRun.json()) as { error: string }).error, /^No run 'r-nope' in this store/);
  const noStep = await sayTo('deploy', { text: 'Ship it.' });
  assert.equal(noStep.status, 404);
  assert.match(((await noStep.json()) as { error: string }).error, /^Run 'r-say' has no step 'deploy'/);
  assert.deepEqual(box.lines, [], 'nothing reached the inbox');
  assert.deepEqual(written(), before, 'nothing written');
});

test("words the harness could not be given come back in the engine's words, 502 — nothing journalled, so asking again may work", async () => {
  const before = written();
  const res = await sayTo('deaf', { text: 'Widen the scope.' });
  assert.equal(res.status, 502);
  const { error } = (await res.json()) as { error: string };
  assert.match(error, /^say: ae\/t-deaf\/1 was not given the words \([\s\S]*is not there[\s\S]*\)\. Nothing was journalled\.$/);
  assert.deepEqual(written(), before, 'nothing written');
});

test("words as the board sends them are the package's `sayRun`: 202 with the engine's entry — `at`, `attempt`, `text`, `after` — the words on the session's inbox as given, the entry on the task's journal, and on the step's detail and in its note, as `nemia ls` words it; nothing else written", async () => {
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
  const steps = await detailSteps();
  const implement = steps.find((s) => s.name === 'implement')!;
  assert.deepEqual([implement.said, implement.note], [[said], 'said to 1×']);
  for (const other of steps.filter((s) => s.name !== 'implement'))
    assert.deepEqual(other.said, [], `${other.name}: nobody told it anything`);
  assert.equal(
    (await runWith(engine(), list(engine(), runStore.runs.read(R)))).steps.find((s) => s.name === 'implement')!.note,
    'said to 1×',
    "`nemia ls`'s words",
  );
  const summary = ((await (await app.request('/api/runs')).json()) as RunSummary[]).find((r) => r.id === R)!;
  assert.equal(summary.steps.find((s) => s.name === 'implement')!.note, 'said to 1×', 'and on the list');
  assert.deepEqual(
    Object.fromEntries(Object.entries(written()).filter(([file]) => !file.startsWith(tasksDir))),
    records,
    "the runs' records untouched, and no file of the api's",
  );
});

/**
 * A step's conversation over HTTP: GET …/transcript, and …/transcript/stream as server-sent events.
 *
 * At shipped defaults: the api's own engine over a store this file seeds, reading a transcript file where Claude Code keeps
 * one (CLAUDE_CONFIG_DIR). What the routes give is held to what the engine gives for the same task. A fake `claude` is first
 * on PATH, so the registry of the sessions on this machine is never asked: it lists what a test says is running, and notes
 * every call, so a test can count what the stream costs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

const tmp = (label: string) => fs.mkdtempSync(path.join(os.tmpdir(), `hkb-api-transcript-${label}-`));

// agent-workflows locates its store, and the Claude runner where transcripts are, as their modules load: both are set first.
const root = tmp('root');
process.env.WF_ROOT = root;
const config = tmp('claude');
process.env.CLAUDE_CONFIG_DIR = config;

const bin = tmp('bin');
const registry = path.join(bin, 'registry.json');
const calls = path.join(bin, 'calls');
fs.writeFileSync(registry, '[]');
fs.writeFileSync(calls, '');
fs.writeFileSync(path.join(bin, 'claude'), `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(calls)}, args.join(' ') + '\\n');
if (args[0] === 'agents') process.stdout.write(fs.readFileSync(${JSON.stringify(registry)}, 'utf8'));
`, { mode: 0o755 });
process.env.PATH = `${bin}${path.delimiter}${process.env.PATH}`;

const { app } = await import('../src/app.ts');
const { engine } = await import('agent-workflows');

/** How many times `claude agents` has been run. */
const observations = () => fs.readFileSync(calls, 'utf8').split('\n').filter((line) => line.startsWith('agents')).length;

const T0 = Date.parse('2026-09-13T08:00:00.000Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const jsonl = (lines: object[]) => lines.map((line) => `${JSON.stringify(line)}\n`).join('');

const journalFile = (taskId: string) => path.join(root, 'engine', 'tasks', `${taskId}.jsonl`);
/** Events on a task's journal, as the engine appends them. */
const journal = (taskId: string, events: object[]) => {
  fs.mkdirSync(path.dirname(journalFile(taskId)), { recursive: true });
  fs.appendFileSync(journalFile(taskId), jsonl(events));
};
const filed = { kind: 'filed', at: at(0), brief: 'Write the word to WORD.txt, then give your closeout.', cwd: '/code/app', maxAttempts: 1, harness: 'claude' };
const started = [filed, { kind: 'starting', at: at(0), attempt: 1 }, { kind: 'spawned', at: at(0), attempt: 1 }];
/** The end of a task's one attempt, with the session's id as the engine records it, and the task settled. */
const ending = (taskId: string, sessionId: string) => [
  { kind: 'ended', at: at(9), attempt: 1, sessionId: `ae/${taskId}/1`, nativeId: sessionId, observed: 'done', reason: 'harness' },
  { kind: 'settled', at: at(9), outcome: 'succeeded' },
];

const transcriptFile = (sessionId: string) => path.join(config, 'projects', '-code-app', `${sessionId}.jsonl`);
const writeTranscript = (sessionId: string, lines: object[]) => {
  fs.mkdirSync(path.dirname(transcriptFile(sessionId)), { recursive: true });
  fs.appendFileSync(transcriptFile(sessionId), jsonl(lines));
};

/**
 * A conversation as Claude Code 2.1.270 writes one: a title, the prompt, a thought, words, a Bash call and its failed result,
 * the StructuredOutput call and its result, and a system line. Nine lines, eight events: a title line is none.
 */
const conversation = (sessionId: string): object[] => {
  const line = { sessionId, isSidechain: false, userType: 'external', cwd: '/code/app', version: '2.1.270', gitBranch: 'main' };
  const said = (type: string, uuid: string, s: number, content: unknown) => ({ ...line, type, uuid, timestamp: at(s), message: { role: type, content } });
  return [
    { type: 'custom-title', customTitle: 'ae/t/1', sessionId },
    said('user', 'u-1', 1, 'Write the word to WORD.txt, then give your closeout.'),
    said('assistant', 'a-1', 2, [{ type: 'thinking', thinking: 'The word goes in a file.', signature: 'sig' }]),
    said('assistant', 'a-2', 3, [{ type: 'text', text: 'Writing it **now**.' }]),
    said('assistant', 'a-3', 4, [{ type: 'tool_use', id: 'toolu_bash', name: 'Bash', input: { command: 'echo word > WORD.txt' } }]),
    said('user', 'u-2', 5, [{ type: 'tool_result', tool_use_id: 'toolu_bash', content: 'WORD.txt: Permission denied', is_error: true }]),
    said('assistant', 'a-4', 6, [{ type: 'tool_use', id: 'toolu_closeout', name: 'StructuredOutput', input: { outcome: 'blocked', summary: 'WORD.txt is not writable' } }]),
    said('user', 'u-3', 7, [{ type: 'tool_result', tool_use_id: 'toolu_closeout', content: [{ type: 'text', text: 'Structured output provided successfully' }] }]),
    { ...line, type: 'system', uuid: 's-1', subtype: 'informational', content: 'Background session idle', timestamp: at(8) },
  ];
};

/** A task that ran once and settled, with its session's whole conversation on disk. Returns the session's id. */
const settledTask = (taskId: string, lines = conversation) => {
  const sessionId = randomUUID();
  writeTranscript(sessionId, lines(sessionId));
  journal(taskId, [...started, ...ending(taskId, sessionId)]);
  return sessionId;
};

/** A task whose attempt runs: journalled as spawned, and listed working by `claude agents`. Returns the session's id. */
const runningTask = (taskId: string) => {
  const sessionId = randomUUID();
  journal(taskId, started);
  const rows = JSON.parse(fs.readFileSync(registry, 'utf8')) as object[];
  rows.push({ name: `ae/${taskId}/1`, sessionId, kind: 'background', state: 'working', status: 'busy', startedAt: T0 });
  fs.writeFileSync(registry, JSON.stringify(rows));
  return sessionId;
};

const RUN = 'r-talk';
fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
fs.writeFileSync(path.join(root, 'runs', `${RUN}.json`), JSON.stringify({
  id: RUN, repo: '/code/app', workspace: '/code/app', baseRef: 'abc123', branch: 'main', isolate: true, brief: 'Talk it through',
  workflowDir: path.join(root, 'no-such-workflow'), createdAt: at(0),
  workflow: ['implement', 'resumed', 'live', 'gone', 'lost', 'review'].map((name) => ({ name, after: [], body: `${name} it.` })),
  steps: {
    implement: { taskId: 't-implement' },
    resumed: { taskId: 't-resumed' },
    live: { taskId: 't-live' },
    gone: { taskId: 't-gone' },
    // Filed, and the engine has no record of its task.
    lost: { taskId: 't-lost' },
    review: { taskId: null },
  },
}));
settledTask('t-implement');

const url = (step: string, query = '') => `/api/runs/${RUN}/steps/${step}/transcript${query}`;
const streamUrl = (step: string, query = '') => `/api/runs/${RUN}/steps/${step}/transcript/stream${query}`;

type Block = { event?: string; data?: string; id?: string };
/** Server-sent events as a reader gets them: the fields of each block. */
const blocks = (text: string): Block[] =>
  text.split('\n\n').filter((block) => block.trim()).map((block) => Object.fromEntries(block.split('\n').map((line) => {
    const colon = line.indexOf(': ');
    return [line.slice(0, colon), line.slice(colon + 2)];
  })));
const eventsIn = (said: Block[]) => said.filter((b) => b.event === 'transcript').map((b) => JSON.parse(b.data!));

test("a step's transcript is the engine's read of its task's session — its events and cursor — and not live once the task settled", async () => {
  const res = await app.request(url('implement'));
  assert.equal(res.status, 200);
  const body = await res.json();
  const engines = await engine().transcript('t-implement');
  assert.deepEqual(body, { ...engines, live: false });
  assert.deepEqual(body.events.map((e: { kind: string }) => e.kind), ['text', 'thinking', 'text', 'tool_use', 'tool_result', 'tool_use', 'tool_result', 'system']);
  assert.equal(body.events[4].id, body.events[3].id, "a result carries its call's id");

  const again = await app.request(url('implement', `?after=${encodeURIComponent(body.cursor)}`));
  assert.equal(again.status, 200);
  assert.deepEqual(await again.json(), { events: [], cursor: body.cursor, live: false }, 'read again from the cursor it gave: nothing new');
});

test('a cursor no read gave is refused with a 400 that says what to pass — on the read and on the stream', async () => {
  for (const [route, headers] of [[url('implement', '?after=page-2'), {}], [streamUrl('implement', '?after=page-2'), {}], [streamUrl('implement'), { 'Last-Event-ID': 'page-2' }]] as const) {
    const res = await app.request(route, { headers });
    assert.equal(res.status, 400, route);
    assert.match(res.headers.get('content-type') ?? '', /^application\/json/, `${route}: an answer, not a stream`);
    const { error } = await res.json();
    assert.match(error, /^`page-2` is not a cursor a read of this conversation gave\. Pass the `cursor` the last read returned/, route);
    assert.match(error, /or none to read from the start\.$/, route);
  }
  const fromStart = await app.request(url('implement', '?after='));
  assert.equal(fromStart.status, 200, 'an empty `after` is none: read from the start');
  assert.equal((await fromStart.json()).events.length, 8);
});

test('a run or a step that does not exist is a 404, worded as the log route words it; a task the engine lost is a 404 that names it', async () => {
  const log = await (await app.request(`/api/runs/${RUN}/steps/nope/log`)).json();
  for (const route of [url('nope'), streamUrl('nope')]) {
    const res = await app.request(route);
    assert.equal(res.status, 404, route);
    assert.deepEqual(await res.json(), log, route);
  }
  for (const route of [`/api/runs/r-nope/steps/implement/transcript`, `/api/runs/r-nope/steps/implement/transcript/stream`]) {
    const res = await app.request(route);
    assert.equal(res.status, 404, route);
    assert.match((await res.json()).error, /^No run 'r-nope' in this store\./, route);
  }
  for (const route of [url('lost'), streamUrl('lost')]) {
    const res = await app.request(route);
    assert.equal(res.status, 404, route);
    assert.match((await res.json()).error, /^Step 'lost' of run 'r-talk' was filed as task t-lost, and the engine has no record of it/, route);
  }
});

test('a step not filed yet has no conversation and nothing live to follow', async () => {
  const res = await app.request(url('review'));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { events: [], cursor: null, live: false });
  const stream = await app.request(streamUrl('review'));
  assert.equal(stream.status, 404);
  assert.match((await stream.json()).error, /^Step 'review' of run 'r-talk' is not filed yet, so it has no session to follow\./);
});

test("the stream of a settled task sends each event, the read's cursor as the id of the last, then `settled` — and closes", async () => {
  const engines = await engine().transcript('t-implement');
  const res = await app.request(streamUrl('implement'));
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /^text\/event-stream/);
  // Resolves only once the api closes the stream.
  const said = blocks(await res.text());
  assert.deepEqual(eventsIn(said), engines.events);
  const sent = said.filter((b) => b.event === 'transcript');
  assert.deepEqual(sent.map((b) => b.id), [...Array(sent.length - 1).fill(undefined), engines.cursor], 'the cursor rides on the last event of the read only');
  assert.deepEqual(said.at(-1), { event: 'settled', data: JSON.stringify({ cursor: engines.cursor }), id: engines.cursor });
  assert.equal(said.length, engines.events.length + 1, 'nothing else is sent');
});

test('a stream reconnected with Last-Event-ID resumes from that cursor, over any `after` in its address', async () => {
  const sessionId = randomUUID();
  const lines = conversation(sessionId);
  journal('t-resumed', [...started, ...ending('t-resumed', sessionId)]);
  writeTranscript(sessionId, lines.slice(0, 4));
  // The first connection was sent up to here, and was cut off; the session's transcript went on.
  const first = await engine().transcript('t-resumed');
  assert.equal(first.events.length, 3);
  writeTranscript(sessionId, lines.slice(4));

  const whole = await engine().transcript('t-resumed');
  const res = await app.request(streamUrl('resumed', '?after=not-a-cursor'), { headers: { 'Last-Event-ID': first.cursor } });
  assert.equal(res.status, 200);
  const said = blocks(await res.text());
  assert.deepEqual(eventsIn(said), whole.events.slice(3), 'only what came after the last event it was sent');
  assert.equal(said.filter((b) => b.id).at(-1)?.id, whole.cursor);
  assert.equal(said.at(-1)?.event, 'settled');
});

/** Read a stream until `until` holds for what it has sent, or it ends. */
async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, text: { value: string }, until: (said: Block[]) => boolean): Promise<Block[]> {
  const decoder = new TextDecoder();
  for (;;) {
    const complete = text.value.slice(0, text.value.lastIndexOf('\n\n') + 2);
    if (until(blocks(complete))) return blocks(complete);
    const { done, value } = await reader.read();
    if (done) return blocks(text.value);
    text.value += decoder.decode(value, { stream: true });
  }
}

test('the stream of a live task follows it: what the session writes next is sent as it is written, and `settled` once the task settles', { timeout: 30_000 }, async () => {
  const sessionId = runningTask('t-live');
  const lines = conversation(sessionId);
  writeTranscript(sessionId, lines.slice(0, 4));

  const res = await app.request(streamUrl('live'));
  assert.equal(res.status, 200);
  const reader = res.body!.getReader();
  const text = { value: '' };
  const early = await readUntil(reader, text, (said) => eventsIn(said).length >= 3);
  assert.deepEqual(eventsIn(early).map((e) => e.id), ['u-1:0', 'a-1:0', 'a-2:0'], 'what was written when it connected');
  assert.ok(!early.some((b) => b.event === 'settled'), 'and the task has not settled');

  // The session goes on, and its task settles.
  writeTranscript(sessionId, lines.slice(4));
  await sleep(1_500);
  journal('t-live', ending('t-live', sessionId));

  const said = await readUntil(reader, text, () => false);
  const whole = await engine().transcript('t-live');
  assert.deepEqual(eventsIn(said), whole.events, 'every event, once each');
  assert.equal(said.at(-1)?.event, 'settled', 'and then settled, and the stream closed');
});

test('the stream stops asking the engine once its reader goes away', { timeout: 30_000 }, async () => {
  const sessionId = runningTask('t-gone');
  writeTranscript(sessionId, conversation(sessionId).slice(0, 2));
  const res = await app.request(streamUrl('gone'));
  const reader = res.body!.getReader();
  await readUntil(reader, { value: '' }, (said) => eventsIn(said).length >= 1);
  await reader.cancel();
  // A read already under way when the reader left may finish; after it, nothing.
  await sleep(1_500);
  const before = observations();
  await sleep(3_000);
  assert.equal(observations(), before, 'no `claude agents` call once the reader has gone: the task is still live, and nobody is reading');
});

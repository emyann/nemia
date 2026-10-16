/**
 * A step's conversation over HTTP: GET …/transcript, and …/transcript/stream as server-sent events.
 *
 * At shipped defaults: the api's own engine over a store this file seeds, reading a transcript file where Claude Code keeps
 * one (CLAUDE_CONFIG_DIR). What the routes give is held to what the engine gives for the same task. The harness's fake `claude`
 * (test/harness.ts) is first on PATH, so the registry of the sessions on this machine is never asked: it lists what a test says is running,
 * and notes every call, so a test can count what the stream costs. The store and CLAUDE_CONFIG_DIR are the harness's
 * scratch ones (`root`, `config`).
 */
import { config, observations, registry, root } from '../../test/harness.ts';
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { Effect, Layer, Logger } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import type { StepTranscript } from './steps.ts';
import { app, appOf, liveOf } from '../app.ts';
import { Engine } from '../store.ts';
import { emitFeed, engine } from 'agent-orchestrator';

const T0 = Date.parse('2026-09-13T08:00:00.000Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const jsonl = (lines: object[]) => lines.map((line) => `${JSON.stringify(line)}\n`).join('');

const journalFile = (taskId: string) => path.join(root, 'engine', 'tasks', `${taskId}.jsonl`);
/** Events on a task's journal, as the engine appends them. */
const journal = (taskId: string, events: object[]) => {
  fs.mkdirSync(path.dirname(journalFile(taskId)), { recursive: true });
  fs.appendFileSync(journalFile(taskId), jsonl(events));
};
const filed = {
  kind: 'filed',
  at: at(0),
  brief: 'Write the word to WORD.txt, then give your closeout.',
  cwd: '/code/app',
  maxAttempts: 1,
  harness: 'claude',
};
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
  const said = (type: string, uuid: string, s: number, content: unknown) => ({
    ...line,
    type,
    uuid,
    timestamp: at(s),
    message: { role: type, content },
  });
  return [
    { type: 'custom-title', customTitle: 'ae/t/1', sessionId },
    said('user', 'u-1', 1, 'Write the word to WORD.txt, then give your closeout.'),
    said('assistant', 'a-1', 2, [{ type: 'thinking', thinking: 'The word goes in a file.', signature: 'sig' }]),
    said('assistant', 'a-2', 3, [{ type: 'text', text: 'Writing it **now**.' }]),
    said('assistant', 'a-3', 4, [{ type: 'tool_use', id: 'toolu_bash', name: 'Bash', input: { command: 'echo word > WORD.txt' } }]),
    said('user', 'u-2', 5, [{ type: 'tool_result', tool_use_id: 'toolu_bash', content: 'WORD.txt: Permission denied', is_error: true }]),
    said('assistant', 'a-4', 6, [
      {
        type: 'tool_use',
        id: 'toolu_closeout',
        name: 'StructuredOutput',
        input: { outcome: 'blocked', summary: 'WORD.txt is not writable' },
      },
    ]),
    said('user', 'u-3', 7, [
      { type: 'tool_result', tool_use_id: 'toolu_closeout', content: [{ type: 'text', text: 'Structured output provided successfully' }] },
    ]),
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

/** The row `claude agents` lists for the attempt of `taskId`, changed by `change`. */
const listed = (taskId: string, change: object) => {
  const rows = JSON.parse(fs.readFileSync(registry, 'utf8')) as { name: string }[];
  fs.writeFileSync(registry, JSON.stringify(rows.map((r) => (r.name === `ae/${taskId}/1` ? { ...r, ...change } : r))));
};

const RUN = 'r-talk';
fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'runs', `${RUN}.json`),
  JSON.stringify({
    id: RUN,
    repo: '/code/app',
    workspace: '/code/app',
    baseRef: 'abc123',
    branch: 'main',
    isolate: true,
    brief: 'Talk it through',
    workflowDir: path.join(root, 'no-such-workflow'),
    createdAt: at(0),
    workflow: ['implement', 'held', 'closed', 'answered', 'resumed', 'live', 'gone', 'broken', 'unpushed', 'unread', 'lost', 'review'].map(
      (name) => ({ name, after: [], body: `${name} it.` }),
    ),
    steps: {
      implement: { taskId: 't-implement' },
      /** `held`, `closed` and `answered`: held open, their one turn signed, and waiting on a person's word, closed on it, and answered. */
      held: { taskId: 't-held' },
      closed: { taskId: 't-closed' },
      answered: { taskId: 't-answered' },
      resumed: { taskId: 't-resumed' },
      live: { taskId: 't-live' },
      gone: { taskId: 't-gone' },
      broken: { taskId: 't-broken' },
      unpushed: { taskId: 't-unpushed' },
      unread: { taskId: 't-unread' },
      /** Filed, and the engine has no record of its task. */
      lost: { taskId: 't-lost' },
      review: { taskId: null },
    },
  }),
);
settledTask('t-implement');

/** A task filed held open whose one turn signed, its conversation on disk, and nothing settled; then `after`, a person's word on it. */
const heldTask = (taskId: string, after: object[]) => {
  const sessionId = randomUUID();
  writeTranscript(sessionId, conversation(sessionId));
  journal(taskId, [{ ...filed, holdOpen: true }, ...started.slice(1), ending(taskId, sessionId)[0], ...after]);
};
heldTask('t-held', []);
heldTask('t-closed', [{ kind: 'closed', at: at(20) }]);
heldTask('t-answered', [{ kind: 'input', at: at(20), text: 'Warm colours.' }]);

const url = (step: string, query = '') => `/api/runs/${RUN}/steps/${step}/transcript${query}`;
const streamUrl = (step: string, query = '') => `/api/runs/${RUN}/steps/${step}/transcript/stream${query}`;

type Block = { event?: string; data?: string; id?: string };
/** Server-sent events as a reader gets them: the fields of each block. */
const blocks = (text: string): Block[] =>
  text
    .split('\n\n')
    .filter((block) => block.trim())
    .map((block) =>
      Object.fromEntries(
        block.split('\n').map((line) => {
          const colon = line.indexOf(': ');
          return [line.slice(0, colon), line.slice(colon + 2)];
        }),
      ),
    );
const eventsIn = (said: Block[]) => said.filter((b) => b.event === 'transcript').map((b) => JSON.parse(b.data!));

test("a step's transcript is the engine's read of its task's session — its events and cursor — and not live once the task settled", async () => {
  const res = await app.request(url('implement'));
  assert.equal(res.status, 200);
  const body = await res.json();
  const engines = await Effect.runPromise(engine().transcript('t-implement'));
  assert.deepEqual(body, { ...engines, live: false });
  assert.deepEqual(
    body.events.map((e: { kind: string }) => e.kind),
    ['text', 'thinking', 'text', 'tool_use', 'tool_result', 'tool_use', 'tool_result', 'system'],
  );
  assert.equal(body.events[4].id, body.events[3].id, "a result carries its call's id");

  const again = await app.request(url('implement', `?after=${encodeURIComponent(body.cursor)}`));
  assert.equal(again.status, 200);
  assert.deepEqual(await again.json(), { events: [], cursor: body.cursor, live: false }, 'read again from the cursor it gave: nothing new');
});

test('a held step that signed waits on a person, and nothing of it runs: its conversation is read, and not live — and its stream, followed for its next turn, sends it and stays open', async () => {
  assert.equal((await Effect.runPromise(engine().view('t-held'))).phase, 'input-required', "the seed is the engine's held task, waiting");
  assert.equal(
    (await Effect.runPromise(engine().view('t-closed'))).phase,
    'between attempts',
    'closed and not yet settled: the engine calls it between attempts until its next pass',
  );
  for (const step of ['held', 'closed']) {
    const engines = await Effect.runPromise(engine().transcript(`t-${step}`));
    assert.equal(engines.events.length, 8, step);
    assert.deepEqual(await (await app.request(url(step))).json(), { ...engines, live: false }, step);
    const reader = (await app.request(streamUrl(step))).body!.getReader();
    const said = await readUntil(reader, { value: '' }, (got) => eventsIn(got).length >= engines.events.length);
    assert.deepEqual(said[0], { event: 'following', data: JSON.stringify({ streamed: true }) }, `${step}: its harness streams a turn`);
    assert.deepEqual(eventsIn(said), engines.events, step);
    assert.ok(!said.some((b) => b.event === 'settled'), `${step}: not settled, the stream open for the next turn`);
    await reader.cancel();
  }
});

test('a held step a person answered is live again, under the same task: its next turn is to run', async () => {
  assert.equal((await Effect.runPromise(engine().view('t-answered'))).phase, 'between attempts');
  const body = (await (await app.request(url('answered'))).json()) as StepTranscript;
  assert.equal(body.live, true);
  assert.equal(body.events.length, 8);
});

test('a cursor no read gave is refused with a 400 that says what to pass — on the read and on the stream', async () => {
  for (const [route, headers] of [
    [url('implement', '?after=page-2'), {}],
    [streamUrl('implement', '?after=page-2'), {}],
    [streamUrl('implement'), { 'Last-Event-ID': 'page-2' }],
  ] as const) {
    const res = await app.request(route, { headers });
    assert.equal(res.status, 400, route);
    assert.match(res.headers.get('content-type') ?? '', /^application\/json/, `${route}: an answer, not a stream`);
    const { error } = (await res.json()) as { error: string };
    assert.match(error, /^`page-2` is not a cursor a read of this conversation gave\. Pass the `cursor` the last read returned/, route);
    assert.match(error, /or none to read from the start\.$/, route);
  }
  const fromStart = await app.request(url('implement', '?after='));
  assert.equal(fromStart.status, 200, 'an empty `after` is none: read from the start');
  assert.equal(((await fromStart.json()) as StepTranscript).events.length, 8);
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
    assert.match(((await res.json()) as { error: string }).error, /^No run 'r-nope' in this store\./, route);
  }
  for (const route of [url('lost'), streamUrl('lost')]) {
    const res = await app.request(route);
    assert.equal(res.status, 404, route);
    assert.match(
      ((await res.json()) as { error: string }).error,
      /^Step 'lost' of run 'r-talk' was filed as task t-lost, and the engine has no record of it/,
      route,
    );
  }
});

test('a step not filed yet has no conversation and nothing live to follow', async () => {
  const res = await app.request(url('review'));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { events: [], cursor: null, live: false });
  const stream = await app.request(streamUrl('review'));
  assert.equal(stream.status, 404);
  assert.match(
    ((await stream.json()) as { error: string }).error,
    /^Step 'review' of run 'r-talk' is not filed yet, so it has no session to follow\./,
  );
});

test("the stream of a settled task sends each event, the read's cursor as the id of the last, then `settled` — and closes", async () => {
  const engines = await Effect.runPromise(engine().transcript('t-implement'));
  const res = await app.request(streamUrl('implement'));
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /^text\/event-stream/);
  const said = blocks(await res.text());
  assert.deepEqual(eventsIn(said), engines.events, 'every event, off a body that resolves only once the api closes the stream');
  const sent = said.filter((b) => b.event === 'transcript');
  assert.deepEqual(
    sent.map((b) => b.id),
    [...Array(sent.length - 1).fill(undefined), engines.cursor],
    'the cursor rides on the last event of the read only',
  );
  assert.deepEqual(said.at(-1), { event: 'settled', data: JSON.stringify({ cursor: engines.cursor }), id: engines.cursor });
  assert.equal(said.length, engines.events.length + 1, 'nothing else is sent');
});

test('a stream reconnected with Last-Event-ID resumes from that cursor, over any `after` in its address', async () => {
  const sessionId = randomUUID();
  const lines = conversation(sessionId);
  journal('t-resumed', [...started, ...ending('t-resumed', sessionId)]);
  writeTranscript(sessionId, lines.slice(0, 4));
  const first = await Effect.runPromise(engine().transcript('t-resumed'));
  assert.equal(first.events.length, 3, "the first connection was sent up to here, and was cut off; the session's transcript went on");
  writeTranscript(sessionId, lines.slice(4));

  const whole = await Effect.runPromise(engine().transcript('t-resumed'));
  const res = await app.request(streamUrl('resumed', '?after=not-a-cursor'), { headers: { 'Last-Event-ID': first.cursor } });
  assert.equal(res.status, 200);
  const said = blocks(await res.text());
  assert.deepEqual(eventsIn(said), whole.events.slice(3), 'only what came after the last event it was sent');
  assert.equal(said.filter((b) => b.id).at(-1)?.id, whole.cursor);
  assert.equal(said.at(-1)?.event, 'settled');
});

/** Read a stream until `until` holds for what it has sent, or it ends. */
async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  text: { value: string },
  until: (said: Block[]) => boolean,
): Promise<Block[]> {
  const decoder = new TextDecoder();
  for (;;) {
    const complete = text.value.slice(0, text.value.lastIndexOf('\n\n') + 2);
    if (until(blocks(complete))) return blocks(complete);
    const { done, value } = await reader.read();
    if (done) return blocks(text.value);
    text.value += decoder.decode(value, { stream: true });
  }
}

test(
  'the stream of a live background session follows it, pushed: what the session writes next is sent as it is written, once each, and `settled` once its task settles',
  { timeout: 30_000 },
  async () => {
    const sessionId = runningTask('t-live');
    const lines = conversation(sessionId);
    writeTranscript(sessionId, lines.slice(0, 4));

    const res = await app.request(streamUrl('live'));
    assert.equal(res.status, 200);
    const reader = res.body!.getReader();
    const text = { value: '' };
    const early = await readUntil(reader, text, (said) => eventsIn(said).length >= 3);
    assert.deepEqual(
      early[0],
      { event: 'following', data: JSON.stringify({ streamed: true }) },
      'first, that a background session is pushed: followed from its transcript, not read again every second',
    );
    assert.deepEqual(
      eventsIn(early).map((e) => e.id),
      ['u-1:0', 'a-1:0', 'a-2:0'],
      'what was written when it connected',
    );
    assert.ok(!early.some((b) => b.event === 'settled'), 'and the task has not settled');

    writeTranscript(sessionId, lines.slice(4));
    await readUntil(reader, text, (said) => eventsIn(said).length >= 8);
    journal('t-live', ending('t-live', sessionId));
    listed('t-live', { state: 'done', status: 'idle' });
    await Effect.runPromise(
      emitFeed(new Map([[RUN, { run: { word: 'running' }, steps: [{ name: 'live', word: 'succeeded' }] }]])).pipe(
        Effect.provide(Logger.layer([])),
      ),
    );

    const said = await readUntil(reader, text, () => false);
    const whole = await Effect.runPromise(engine().transcript('t-live'));
    assert.deepEqual(eventsIn(said), whole.events, 'every event, once each');
    assert.equal(said.at(-1)?.event, 'settled', 'and then settled, and the stream closed');
  },
);

test('the stream stops asking the engine once its reader goes away', { timeout: 30_000 }, async () => {
  const sessionId = runningTask('t-gone');
  writeTranscript(sessionId, conversation(sessionId).slice(0, 2));
  const res = await app.request(streamUrl('gone'));
  const reader = res.body!.getReader();
  await readUntil(reader, { value: '' }, (said) => eventsIn(said).length >= 1);
  await reader.cancel();
  await sleep(1_500);
  const before = observations();
  await sleep(3_000);
  assert.equal(
    observations(),
    before,
    'no `claude agents` call once the reader has gone, past a read already under way when it left: the task is still live, and nobody is reading',
  );
});

test("a conversation the engine cannot read is a 502 that says how to read the step's output from the command line", async () => {
  const sessionId = settledTask('t-broken');
  fs.rmSync(transcriptFile(sessionId));
  fs.mkdirSync(transcriptFile(sessionId));
  const res = await app.request(url('broken'));
  assert.equal(res.status, 502, 'a directory where the transcript should be: found, opened, and not read');
  const { error } = (await res.json()) as { error: string };
  assert.match(error, /^Could not read the conversation of step 'broken' \(task t-broken\): /);
  assert.match(error, /`nemia logs r-talk broken` reads its output from the command line\.$/);
});

/**
 * An app over the api's own engine but for `follow`, refused as a harness that does not stream its sessions refuses it, until `streams`
 * says yes — a harness that starts pushing its sessions under a reader. Its runtime is let go once the test `t` ends.
 */
function unstreamedApp(t: TestContext, streams: { yes: boolean } = { yes: false }) {
  const real = engine();
  const unstreamed = {
    ...real,
    follow: (taskId: string) =>
      streams.yes ? real.follow(taskId) : Effect.fail({ _tag: 'FollowRefused', message: 'the `x` harness does not stream its sessions' }),
  } as unknown as ReturnType<typeof engine>;
  const own = appOf(Layer.merge(liveOf(), Layer.succeed(Engine)(unstreamed)));
  t.after(() => own.runtime.dispose());
  return own.app;
}

const UNPUSHED =
  "Step 'unpushed' of run 'r-talk' runs a session its harness does not push as it is written: what it said so far is sent, and it is read again every few seconds.";

test(
  'the stream of a live step whose session is not pushed sends `following` false and what it has said, then `unreadable` retrying: it stays open, reads the conversation again on a beat, and takes to the live relay once the harness starts pushing it',
  { timeout: 60_000 },
  async (t) => {
    const streams = { yes: false };
    const app = unstreamedApp(t, streams);
    const sessionId = runningTask('t-unpushed');
    const lines = conversation(sessionId);
    writeTranscript(sessionId, lines.slice(0, 4));
    const res = await app.request(streamUrl('unpushed'));
    const reader = res.body!.getReader();
    const text = { value: '' };
    const said = await readUntil(reader, text, (got) => got.some((b) => b.event === 'unreadable'));
    assert.deepEqual(said[0], { event: 'following', data: JSON.stringify({ streamed: false }) }, 'not pushed');
    assert.deepEqual(eventsIn(said), (await Effect.runPromise(engine().transcript('t-unpushed'))).events, 'what it has said, once each');
    assert.deepEqual(
      JSON.parse(said.at(-1)!.data!),
      { error: UNPUSHED, retrying: true },
      'it says why it cannot be streamed, and that it reads it again',
    );
    assert.ok(!said.some((b) => b.event === 'settled'), 'and the stream is not ended');

    writeTranscript(sessionId, lines.slice(4));
    const whole = (await Effect.runPromise(engine().transcript('t-unpushed'))).events;
    const after = await readUntil(reader, text, (got) => eventsIn(got).length >= whole.length);
    assert.deepEqual(
      eventsIn(after).map((e) => e.id),
      whole.map((e) => e.id),
      'what the session said after the give-up used to be arrives on the same stream, one beat later',
    );
    assert.equal(after.filter((b) => b.event === 'unreadable').length, 1, 'said once, not once a beat');

    streams.yes = true;
    const live = await readUntil(reader, text, (got) => got.some((b) => b.event === 'readable'));
    assert.deepEqual(
      live.filter((b) => b.event === 'following').at(-1),
      { event: 'following', data: JSON.stringify({ streamed: true }) },
      'a harness that starts pushing its session is followed live on the next beat',
    );

    journal('t-unpushed', ending('t-unpushed', sessionId));
    listed('t-unpushed', { state: 'done', status: 'idle' });
    await Effect.runPromise(
      emitFeed(new Map([[RUN, { run: { word: 'running' }, steps: [{ name: 'unpushed', word: 'succeeded' }] }]])).pipe(
        Effect.provide(Logger.layer([])),
      ),
    );
    const over = await readUntil(reader, text, () => false);
    assert.equal(over.at(-1)?.event, 'settled', 'and the beat does not hold the stream open past the task settling');
  },
);

test('a live task whose journal cannot be read is a 502 on the read and on the stream, which says where the same record is read', async (t) => {
  const app = unstreamedApp(t);
  runningTask('t-unread');
  fs.rmSync(journalFile('t-unread'));
  fs.mkdirSync(journalFile('t-unread'));
  for (const route of [url('unread'), streamUrl('unread')]) {
    const res = await app.request(route);
    assert.equal(res.status, 502, `${route}: a directory where the journal should be, read before any stream opens`);
    assert.match(
      ((await res.json()) as { error: string }).error,
      /^Could not read task t-unread of step 'unread': .*`nemia ls` reads the same record/,
    );
  }
});

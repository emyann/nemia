/**
 * A session's conversation as events — a transcript file where Claude Code keeps one, and a rollout where
 * Codex keeps one, each written by the test.
 *
 * The board shows a step's session as it happens by polling `transcript` with the cursor each read gives.
 * So what is checked is what a poller sees: every event dated by the harness's own record and
 * given a role; a tool result paired to its call; the closeout a call like any other; a second read
 * emitting only what was appended; and a cursor from a file that shrank, or was replaced, reading again
 * rather than nothing for ever. Then the same through the engine at shipped defaults, with a fake
 * `claude` or `codex` on PATH: `logs` beside it, and each refusal made to refuse.
 *
 * Where Claude Code keeps transcripts is read when the runner is loaded, so `CLAUDE_CONFIG_DIR` is set before the
 * import; where Codex keeps rollouts is read when one is looked for, so `CODEX_HOME` is set once, for the whole file.
 */
import { type TestContext, test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { TranscriptEvent } from '../src/harness/seam.ts';
import { scratch } from './scratch.ts';
import { warned } from './warned.ts';
import { until, WAITED, type Waiter } from '../src/waits/index.ts';
import type { AsyncRunner } from './promise-runner.ts';

const tmp = (label: string) => scratch(`ae-transcript-${label}-`);

const config = tmp('config');
process.env.CLAUDE_CONFIG_DIR = config;
const codexHome = tmp('codex-home');
process.env.CODEX_HOME = codexHome;
const { claudeOps, QUIESCENT_AFTER_MS } = await import('../src/harness/claude/bg.ts');
const { asyncOps } = await import('./promise-runner.ts');
const { RunnerError } = await import('../src/harness/error.ts');
const { readTranscript } = await import('../src/harness/transcript.ts');
const { claudeTranscriptEvents, transcriptWrittenAt } = await import('../src/harness/claude/transcript.ts');
const { noCounts, tallied } = await import('../src/core/engine/tally.ts');
const { detachedOps } = await import('../src/harness/detached/detached.ts');
const { codex } = await import('../src/harness/codex/codex.ts');
const { codexRolloutEvents } = await import('../src/harness/codex/transcript.ts');
const { claudeDetached } = await import('../src/harness/claude/code.ts');

/** When the fixture's conversation happened: an hour ago, as a resumed session's inherited turns are. */
const T0 = Date.now() - 3_600_000;
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const jsonl = (lines: object[]) => lines.map((l) => `${JSON.stringify(l)}\n`).join('');

const claudeFile = (sessionId: string) => path.join(config, 'projects', 'fake-project', `${sessionId}.jsonl`);
const writeClaude = (sessionId: string, text: string) => {
  fs.mkdirSync(path.dirname(claudeFile(sessionId)), { recursive: true });
  fs.writeFileSync(claudeFile(sessionId), text);
};

/**
 * A transcript as Claude Code writes one: a title line, the prompt, an attachment, then one line
 * per content block — thinking, text, a Bash call and its failed result, the StructuredOutput call and its
 * result — and a system line. Chained by `parentUuid`, as the SDK's reader (`logs`) follows them.
 */
const claudeLines = (sessionId: string): object[] => {
  const line = {
    sessionId,
    isSidechain: false,
    userType: 'external',
    entrypoint: 'cli',
    cwd: '/repo',
    version: '2.1.270',
    gitBranch: 'main',
  };
  return [
    { type: 'custom-title', customTitle: 'ae/t/1', sessionId },
    {
      ...line,
      type: 'user',
      uuid: 'u-1',
      parentUuid: null,
      timestamp: at(0),
      message: { role: 'user', content: 'Write the word to WORD.txt, then give your closeout.' },
    },
    { ...line, type: 'attachment', uuid: 'att-1', parentUuid: 'u-1', timestamp: at(0), attachment: { type: 'environment' } },
    {
      ...line,
      type: 'assistant',
      uuid: 'a-1',
      parentUuid: 'u-1',
      timestamp: at(1),
      message: { id: 'msg_1', role: 'assistant', content: [{ type: 'thinking', thinking: 'The word goes in a file.', signature: 'sig' }] },
    },
    {
      ...line,
      type: 'assistant',
      uuid: 'a-2',
      parentUuid: 'a-1',
      timestamp: at(2),
      message: { id: 'msg_1', role: 'assistant', content: [{ type: 'text', text: 'Writing it now.' }] },
    },
    {
      ...line,
      type: 'assistant',
      uuid: 'a-3',
      parentUuid: 'a-2',
      timestamp: at(3),
      message: {
        id: 'msg_1',
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'toolu_bash', name: 'Bash', input: { command: 'echo word > WORD.txt' } }],
      },
    },
    {
      ...line,
      type: 'user',
      uuid: 'u-2',
      parentUuid: 'a-3',
      timestamp: at(5),
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'toolu_bash', content: 'WORD.txt: Permission denied', is_error: true }],
      },
    },
    {
      ...line,
      type: 'assistant',
      uuid: 'a-4',
      parentUuid: 'u-2',
      timestamp: at(6),
      message: {
        id: 'msg_2',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_closeout',
            name: 'StructuredOutput',
            input: { outcome: 'blocked', summary: 'WORD.txt is not writable' },
          },
        ],
      },
    },
    {
      ...line,
      type: 'user',
      uuid: 'u-3',
      parentUuid: 'a-4',
      timestamp: at(7),
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_closeout',
            content: [{ type: 'text', text: 'Structured output provided successfully' }],
          },
        ],
      },
    },
    {
      ...line,
      type: 'system',
      uuid: 's-1',
      parentUuid: 'u-3',
      subtype: 'informational',
      content: 'Background session idle',
      level: 'info',
      timestamp: at(8),
      isMeta: false,
    },
  ];
};

/** What that transcript says, as events. */
const CLAUDE_EVENTS: TranscriptEvent[] = [
  { id: 'u-1:0', at: at(0), role: 'user', kind: 'text', text: 'Write the word to WORD.txt, then give your closeout.' },
  { id: 'a-1:0', at: at(1), role: 'assistant', kind: 'thinking', text: 'The word goes in a file.' },
  { id: 'a-2:0', at: at(2), role: 'assistant', kind: 'text', text: 'Writing it now.' },
  { id: 'toolu_bash', at: at(3), role: 'assistant', kind: 'tool_use', tool: { name: 'Bash', input: { command: 'echo word > WORD.txt' } } },
  { id: 'toolu_bash', at: at(5), role: 'user', kind: 'tool_result', result: { text: 'WORD.txt: Permission denied', isError: true } },
  {
    id: 'toolu_closeout',
    at: at(6),
    role: 'assistant',
    kind: 'tool_use',
    tool: { name: 'StructuredOutput', input: { outcome: 'blocked', summary: 'WORD.txt is not writable' } },
  },
  {
    id: 'toolu_closeout',
    at: at(7),
    role: 'user',
    kind: 'tool_result',
    result: { text: 'Structured output provided successfully', isError: false },
  },
  { id: 's-1', at: at(8), role: 'system', kind: 'system', text: 'Background session idle' },
];

/** Every event carries a time that parses and a role, whatever else it has. */
const datedWithRoles = (events: TranscriptEvent[]) => {
  assert.ok(events.length > 0, 'there are events to check');
  for (const e of events) {
    assert.ok(typeof e.at === 'string' && Number.isFinite(Date.parse(e.at)), `${e.id} has a time: ${e.at}`);
    assert.ok(['assistant', 'user', 'system'].includes(e.role), `${e.id} has a role: ${e.role}`);
  }
};

const claudeRead = (sessionId: string, after?: string) => Effect.runPromise(claudeOps({ root: tmp('root') }).transcript!(sessionId, after));

test("the Claude runner reads a session's conversation from its transcript: dated by it, each result paired to its call, the closeout a call like any other", async () => {
  const sessionId = randomUUID();
  writeClaude(sessionId, jsonl(claudeLines(sessionId)));

  const { events } = await claudeRead(sessionId);
  assert.deepEqual(events, CLAUDE_EVENTS);
  datedWithRoles(events);
  assert.ok(
    events.every((e) => Date.parse(e.at) >= T0 && Date.parse(e.at) <= T0 + 8_000),
    "each at the transcript's own time, between its first line and its last, not the read's",
  );
  const calls = events.filter((e) => e.kind === 'tool_use');
  assert.deepEqual(
    events.filter((e) => e.kind === 'tool_result').map((e) => e.id),
    calls.map((e) => e.id),
    "each result carries its call's id",
  );
  assert.deepEqual(
    calls.find((e) => e.tool?.name === 'StructuredOutput')?.tool?.input,
    { outcome: 'blocked', summary: 'WORD.txt is not writable' },
    'the closeout is not hidden: a call, with what it said',
  );
});

test('a line of a Claude transcript: the harness speaking is system, a subagent is left to its own, a block not read is named, a line with no time gives nothing', () => {
  const base = { sessionId: 's', timestamp: at(0) };
  assert.deepEqual(
    claudeTranscriptEvents(
      {
        ...base,
        type: 'user',
        uuid: 'm',
        isMeta: true,
        message: { content: [{ type: 'text', text: 'Continue from where you left off.' }] },
      },
      0,
    ),
    [{ id: 'm:0', at: at(0), role: 'system', kind: 'system', text: 'Continue from where you left off.' }],
  );
  assert.deepEqual(
    claudeTranscriptEvents(
      { ...base, type: 'assistant', uuid: 'x', isSidechain: true, message: { content: [{ type: 'text', text: 'a subagent' }] } },
      0,
    ),
    [],
  );
  assert.deepEqual(
    claudeTranscriptEvents(
      {
        ...base,
        type: 'user',
        uuid: 'i',
        message: {
          content: [
            { type: 'image', source: {} },
            { type: 'tool_result', tool_use_id: 't', content: [{ type: 'text', text: 'shot' }, { type: 'image' }] },
          ],
        },
      },
      0,
    ),
    [
      { id: 'i:0', at: at(0), role: 'user', kind: 'text', text: '[image]' },
      { id: 't', at: at(0), role: 'user', kind: 'tool_result', result: { text: 'shot\n[image]', isError: false } },
    ],
  );
  assert.deepEqual(
    claudeTranscriptEvents(
      { ...base, type: 'assistant', uuid: 'r', message: { content: [{ type: 'thinking', thinking: '', signature: 'sig' }] } },
      0,
    ),
    [{ id: 'r:0', at: at(0), role: 'assistant', kind: 'thinking' }],
    'thinking written with no text is a thinking event with no text, not an invented one',
  );
  assert.deepEqual(
    claudeTranscriptEvents({ type: 'assistant', uuid: 'n', message: { content: [{ type: 'text', text: 'when?' }] } }, 0),
    [],
    'no time, no event',
  );
  assert.deepEqual(
    claudeTranscriptEvents({ ...base, type: 'system', subtype: 'turn_duration', durationMs: 5 }, 120),
    [{ id: '@120', at: at(0), role: 'system', kind: 'system', text: 'turn_duration' }],
    'no uuid: its place in the file',
  );
});

test('words another process sent a working session — a peer, or `say` — are a system event with those words; any other attachment gives nothing', () => {
  const line = {
    parentUuid: 'p',
    isSidechain: false,
    type: 'attachment',
    uuid: 'att-peer',
    timestamp: at(0),
    sessionId: 's',
    attachment: {
      type: 'queued_command',
      prompt: 'The file to write is SAID-bc11750e.txt',
      source_uuid: 'src',
      commandMode: 'prompt',
      origin: { kind: 'peer', from: 'unknown', verifiedPeerPid: 4165162, verifiedPeerProcStart: '13623112' },
      timestamp: at(0),
      isMeta: true,
    },
  };
  assert.deepEqual(
    claudeTranscriptEvents(line, 0),
    [{ id: 'att-peer', at: at(0), role: 'system', kind: 'system', text: 'The file to write is SAID-bc11750e.txt' }],
    "a line posted to a `--bg` session's inbox while it works, as Claude Code writes it into the transcript",
  );
  assert.deepEqual(
    claudeTranscriptEvents({ ...line, attachment: { ...line.attachment, origin: { kind: 'other' } } }, 0),
    [],
    'a queued command of any other origin is not read as words sent in',
  );
  assert.deepEqual(claudeTranscriptEvents({ ...line, attachment: { type: 'environment' } }, 0), [], 'nor is any other attachment');
  assert.deepEqual(
    claudeTranscriptEvents(
      {
        type: 'user',
        uuid: 'idle',
        timestamp: at(1),
        isMeta: true,
        origin: { kind: 'peer', from: 'unknown' },
        message: { role: 'user', content: 'Another Claude session sent a message:\nIdle check' },
      },
      0,
    ),
    [{ id: 'idle:0', at: at(1), role: 'system', kind: 'system', text: 'Another Claude session sent a message:\nIdle check' }],
    'arriving while the session is idle, the words start a turn as an `isMeta` user line, read as any such line is',
  );
});

test("words the session's own user said while it worked — typed into it, or a job's next line on its stdin, which Claude Code writes into a `claude -p --input-format stream-json` job's transcript as a queued command with no origin — are the user's; a notice of a background task is nothing", () => {
  const line = {
    parentUuid: 'p',
    isSidechain: false,
    type: 'attachment',
    uuid: 'att-stdin',
    timestamp: at(0),
    sessionId: 's',
    entrypoint: 'sdk-cli',
    attachment: {
      type: 'queued_command',
      prompt: 'The file to write is SAID-fcfc71ec.txt',
      source_uuid: 'src',
      commandMode: 'prompt',
      timestamp: at(0),
    },
  };
  const theirs = [{ id: 'att-stdin', at: at(0), role: 'user', kind: 'text', text: 'The file to write is SAID-fcfc71ec.txt' }];
  assert.deepEqual(claudeTranscriptEvents(line, 0), theirs, "no origin: the job's own user");
  assert.deepEqual(
    claudeTranscriptEvents({ ...line, attachment: { ...line.attachment, origin: { kind: 'human' } } }, 0),
    theirs,
    'a person typing into it',
  );
  assert.deepEqual(
    claudeTranscriptEvents(
      {
        ...line,
        attachment: { ...line.attachment, commandMode: 'task-notification', prompt: '<task-notification>done</task-notification>' },
      },
      0,
    ),
    [],
    "Claude Code's notice that a background task ended is not anyone's words",
  );
});

/** A Claude transcript as `claudeLines` writes it, with the line at `at` replaced by `line`. */
const claudeWith = (sessionId: string, at: number, line: object) => {
  const lines = claudeLines(sessionId);
  lines[at] = { ...lines[at], ...line };
  return jsonl(lines);
};

test("REFUSED: a Claude transcript's conversation line that does not decode, a subagent's included, refuses the read by its file, its offset, its field and the fix", async () => {
  const sessionId = randomUUID();
  const text = claudeWith(sessionId, 3, { message: { id: 'msg_1', content: [{ type: 'thinking', thinking: 7 }] } });
  writeClaude(sessionId, text);
  const offset = Buffer.byteLength(text.split('\n').slice(0, 3).join('\n')) + 1;
  const words =
    `the line at byte ${offset} of the transcript \`${claudeFile(sessionId)}\` is an \`assistant\` line whose` +
    ' `message.content.0.thinking` is 7, where Claude Code writes string.';
  await assert.rejects(readTranscript(claudeFile(sessionId), undefined, claudeTranscriptEvents), (e: Error) => e.message.startsWith(words));
  await assert.rejects(claudeRead(sessionId), (e: unknown) => {
    assert.ok(e instanceof RunnerError, String(e));
    assert.equal(e.verb, 'transcript');
    assert.ok(e.message.startsWith(words), e.message);
    assert.ok(e.message.includes('`harness/claude/lines.ts`'), e.message);
    return true;
  });

  const aside = randomUUID();
  writeClaude(aside, claudeWith(aside, 3, { isSidechain: true, message: { content: [{ type: 'tool_use', id: 7 }] } }));
  await assert.rejects(
    claudeRead(aside),
    (e: Error) => e.message.includes('is an `assistant` line whose `message.content.0.id` is 7'),
    "a subagent's line is decoded before it is left out",
  );
});

test('a torn line, a line that is no JSON object, and a line of a type not read pass the Claude transcript unchecked', async () => {
  const sessionId = randomUUID();
  const lines = claudeLines(sessionId).map((l) => JSON.stringify(l));
  const unread = [
    '{"type":"assistant","message":{"content":[{"type":"text","text":7',
    '["assistant"]',
    JSON.stringify({ type: 'file-history-snapshot', timestamp: 'never', snapshot: 7 }),
    JSON.stringify({ type: 'summary', summary: 3, leafUuid: 4 }),
  ];
  writeClaude(sessionId, `${[...lines.slice(0, 2), ...unread, ...lines.slice(2)].join('\n')}\n`);
  assert.deepEqual((await claudeRead(sessionId)).events, CLAUDE_EVENTS);
});

test('read again with its cursor, a transcript gives only what was appended; a line still being written waits for the next read', async () => {
  const sessionId = randomUUID();
  const lines = claudeLines(sessionId).map((l) => JSON.stringify(l));
  writeClaude(sessionId, `${lines.slice(0, 5).join('\n')}\n`);

  const first = await claudeRead(sessionId);
  assert.deepEqual(first.events, CLAUDE_EVENTS.slice(0, 3));

  const third = lines[7];
  fs.appendFileSync(claudeFile(sessionId), `${lines[5]}\n${lines[6]}\n${third.slice(0, 40)}`);
  const second = await claudeRead(sessionId, first.cursor);
  assert.deepEqual(second.events, CLAUDE_EVENTS.slice(3, 5), 'only the two appended lines; not the half-written one');

  const again = await claudeRead(sessionId, second.cursor);
  assert.deepEqual(again, { events: [], cursor: second.cursor }, 'nothing new: nothing, and the same cursor');

  fs.appendFileSync(claudeFile(sessionId), `${third.slice(40)}\n`);
  assert.deepEqual((await claudeRead(sessionId, again.cursor)).events, CLAUDE_EVENTS.slice(5, 6), 'the line, once written whole');
});

test('read in two pieces, cut at any byte, a transcript gives what it gives read whole', async () => {
  const sessionId = randomUUID();
  const text = jsonl(claudeLines(sessionId));
  const cuts = new Set<number>();
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) {
    cuts.add(i + 1);
    cuts.add(i - 7);
  }
  for (const cut of cuts) {
    writeClaude(sessionId, text.slice(0, cut));
    const first = await claudeRead(sessionId);
    fs.appendFileSync(claudeFile(sessionId), text.slice(cut));
    const second = await claudeRead(sessionId, first.cursor);
    assert.deepEqual([...first.events, ...second.events], CLAUDE_EVENTS, `cut at byte ${cut}`);
  }
});

test('a cursor past the end of a file that shrank reads again from the start; so does one from a file replaced by a longer one', async () => {
  const sessionId = randomUUID();
  const lines = claudeLines(sessionId);
  writeClaude(sessionId, jsonl(lines));
  const whole = await claudeRead(sessionId);
  assert.equal(whole.events.length, CLAUDE_EVENTS.length);

  writeClaude(sessionId, jsonl(lines.slice(0, 5)));
  const shrunk = await claudeRead(sessionId, whole.cursor);
  assert.deepEqual(shrunk.events, CLAUDE_EVENTS.slice(0, 3), 'read from the start, not nothing for ever');

  const other = lines.map((l) => JSON.parse(JSON.stringify(l).replaceAll('Writing it now.', 'Writing it now, differently.')) as object);
  writeClaude(sessionId, jsonl([...other, ...other]));
  const replaced = await claudeRead(sessionId, shrunk.cursor);
  assert.equal(replaced.events[0]?.id, 'u-1:0', 'read from the start');
  assert.equal(
    replaced.events.length,
    CLAUDE_EVENTS.length * 2,
    'a conversation grown past the old offset, where the offset alone would read mid-line: all of it',
  );

  assert.deepEqual(
    await claudeRead(randomUUID(), whole.cursor),
    { events: [], cursor: (await claudeRead(randomUUID())).cursor },
    'no transcript at all: nothing, from the start',
  );
});

test('a cursor no read gave is refused, naming it', async () => {
  const sessionId = randomUUID();
  writeClaude(sessionId, jsonl(claudeLines(sessionId)));
  for (const bad of ['12', 'abc.0123456789abcdef', '-1.0123456789abcdef', '12.xyz']) {
    await assert.rejects(claudeRead(sessionId, bad), (e: Error) => e.message.includes(`\`${bad}\` is not a cursor a transcript read gave`));
  }
});

const rolloutFile = (thread: string) => path.join(codexHome, 'sessions', '2026', '09', '13', `rollout-2026-09-13T06-00-00-${thread}.jsonl`);
const writeRollout = (thread: string, text: string) => {
  fs.mkdirSync(path.dirname(rolloutFile(thread)), { recursive: true });
  fs.writeFileSync(rolloutFile(thread), text);
};

/** A run file as the worker leaves one, written by hand: what `detachedOps` reads a run's `nativeId` from. */
const runFile = (root: string, harness: string, name: string, run: object) => {
  const dir = path.join(root, 'runs', harness);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${name.replace(/[^a-zA-Z0-9]+/g, '_')}.json`),
    JSON.stringify({ name, state: 'done', pid: 0, heartbeatAt: new Date().toISOString(), logFile: '/dev/null', exitCode: 0, ...run }),
  );
};

/**
 * A rollout as Codex writes one: the session's metadata, the instructions and context Codex
 * gives the model, then each thing both as the model was given it (`response_item`) and as a thread item
 * (`event_msg` / `item_completed`) — the prompt, reasoning, a message, a command that failed, a file
 * change, an item of a type the reader does not know (`NotMeasuredYet`), the final answer — and the task's end.
 */
const rolloutLines = (thread: string): object[] => [
  {
    timestamp: at(0),
    type: 'session_meta',
    payload: { id: thread, session_id: thread, cwd: '/repo', cli_version: '0.154.0', base_instructions: { text: 'You are Codex.' } },
  },
  { timestamp: at(0), type: 'event_msg', payload: { type: 'task_started', turn_id: 'turn-1' } },
  {
    timestamp: at(1),
    type: 'response_item',
    payload: { type: 'message', role: 'developer', content: [{ type: 'input_text', text: '<permissions instructions>' }] },
  },
  {
    timestamp: at(1),
    type: 'response_item',
    payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<recommended_plugins>' }] },
  },
  {
    timestamp: at(1),
    type: 'response_item',
    payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Review the change.' }] },
  },
  {
    timestamp: at(1),
    type: 'event_msg',
    payload: {
      type: 'item_completed',
      thread_id: thread,
      turn_id: 'turn-1',
      item: { type: 'UserMessage', id: 'user-1', content: [{ type: 'text', text: 'Review the change.', text_elements: [] }] },
    },
  },
  {
    timestamp: at(2),
    type: 'event_msg',
    payload: { type: 'item_completed', turn_id: 'turn-1', item: { type: 'Reasoning', id: 'rs_1', summary_text: [], raw_content: [] } },
  },
  { timestamp: at(2), type: 'response_item', payload: { type: 'reasoning', id: 'rs_1', summary: [], encrypted_content: 'gAAAA' } },
  {
    timestamp: at(3),
    type: 'event_msg',
    payload: {
      type: 'item_completed',
      turn_id: 'turn-1',
      item: { type: 'AgentMessage', id: 'msg_1', content: [{ type: 'Text', text: 'I will run the tests.' }], phase: 'commentary' },
    },
  },
  {
    timestamp: at(3),
    type: 'response_item',
    payload: { type: 'message', role: 'assistant', phase: 'commentary', content: [{ type: 'output_text', text: 'I will run the tests.' }] },
  },
  {
    timestamp: at(4),
    type: 'response_item',
    payload: {
      type: 'custom_tool_call',
      call_id: 'call_1',
      name: 'exec',
      input: 'text((await tools.exec_command({cmd:"npm test"})).output)',
    },
  },
  {
    timestamp: at(9),
    type: 'event_msg',
    payload: {
      type: 'item_completed',
      turn_id: 'turn-1',
      item: {
        type: 'CommandExecution',
        id: 'exec-1',
        command: ['/bin/bash', '-lc', 'npm test'],
        cwd: 'file:///repo',
        status: 'failed',
        exit_code: 1,
        aggregated_output: '1 failing',
        stdout: '1 failing',
        stderr: '',
      },
    },
  },
  {
    timestamp: at(9),
    type: 'response_item',
    payload: { type: 'custom_tool_call_output', call_id: 'call_1', output: [{ type: 'input_text', text: 'Script completed\n' }] },
  },
  { timestamp: at(10), type: 'event_msg', payload: { type: 'token_count', info: null } },
  {
    timestamp: at(11),
    type: 'event_msg',
    payload: {
      type: 'item_completed',
      turn_id: 'turn-1',
      item: {
        type: 'FileChange',
        id: 'exec-2',
        changes: { '/repo/REVIEW.md': { type: 'add', content: '- one finding' } },
        status: 'completed',
        stdout: 'Success. Updated the following files:\nA /repo/REVIEW.md',
        stderr: '',
      },
    },
  },
  {
    timestamp: at(12),
    type: 'event_msg',
    payload: { type: 'item_completed', turn_id: 'turn-1', item: { type: 'NotMeasuredYet', id: 'item-9' } },
  },
  {
    timestamp: at(13),
    type: 'event_msg',
    payload: {
      type: 'item_completed',
      turn_id: 'turn-1',
      item: {
        type: 'AgentMessage',
        id: 'msg_2',
        content: [{ type: 'Text', text: '{"outcome":"done","summary":"one finding"}' }],
        phase: 'final_answer',
      },
    },
  },
  {
    timestamp: at(14),
    type: 'event_msg',
    payload: { type: 'task_complete', turn_id: 'turn-1', last_agent_message: '{"outcome":"done","summary":"one finding"}', error: null },
  },
];

/** What that rollout says, as events: the same shape as Claude Code's, as far as the records allow. */
const CODEX_EVENTS: TranscriptEvent[] = [
  { id: 'user-1', at: at(1), role: 'user', kind: 'text', text: 'Review the change.' },
  { id: 'rs_1', at: at(2), role: 'assistant', kind: 'thinking' },
  { id: 'msg_1', at: at(3), role: 'assistant', kind: 'text', text: 'I will run the tests.' },
  {
    id: 'exec-1',
    at: at(9),
    role: 'assistant',
    kind: 'tool_use',
    tool: { name: 'CommandExecution', input: { command: ['/bin/bash', '-lc', 'npm test'], cwd: 'file:///repo' } },
  },
  { id: 'exec-1', at: at(9), role: 'user', kind: 'tool_result', result: { text: '1 failing', isError: true } },
  {
    id: 'exec-2',
    at: at(11),
    role: 'assistant',
    kind: 'tool_use',
    tool: { name: 'FileChange', input: { changes: { '/repo/REVIEW.md': { type: 'add', content: '- one finding' } } } },
  },
  {
    id: 'exec-2',
    at: at(11),
    role: 'user',
    kind: 'tool_result',
    result: { text: 'Success. Updated the following files:\nA /repo/REVIEW.md', isError: false },
  },
  { id: 'item-9', at: at(12), role: 'system', kind: 'system', text: '[NotMeasuredYet]' },
  { id: 'msg_2', at: at(13), role: 'assistant', kind: 'text', text: '{"outcome":"done","summary":"one finding"}' },
  { id: 'turn-1:complete', at: at(14), role: 'system', kind: 'system', text: 'task_complete' },
];

const detachedRead = (ops: ReturnType<typeof detachedOps>, sessionId: string, after?: string) =>
  Effect.runPromise(ops.transcript!(sessionId, after));

test("the Codex runner reads a thread's conversation from its rollout, found by the thread id its worker kept — the same shape as Claude Code's", async () => {
  const root = tmp('root');
  const thread = randomUUID();
  writeRollout(thread, jsonl(rolloutLines(thread)));
  runFile(root, 'codex', 'ae/c1/1', { nativeId: thread });

  const { events } = await detachedRead(detachedOps(codex, root), 'ae/c1/1');
  assert.deepEqual(events, CODEX_EVENTS);
  datedWithRoles(events);
  assert.equal(events.find((e) => e.kind === 'text' && e.text?.startsWith('{"outcome"'))?.id, 'msg_2', 'the final answer is not hidden');
});

test('a Codex run whose worker has no thread id yet has nothing to read; the id an ended attempt recorded reads its rollout with no run file', async () => {
  const root = tmp('root');
  const thread = randomUUID();
  writeRollout(thread, jsonl(rolloutLines(thread)));
  runFile(root, 'codex', 'ae/c2/1', {});
  const ops = detachedOps(codex, root);

  const none = await detachedRead(ops, 'ae/c2/1');
  assert.deepEqual(none.events, []);
  assert.deepEqual((await detachedRead(ops, thread, none.cursor)).events, CODEX_EVENTS, 'by the id itself, from the start');
  assert.deepEqual((await detachedRead(ops, '../../etc/passwd')).events, [], 'a name that is no thread id is looked up as nothing');
});

test('read again with its cursor, a rollout gives only what was appended, cut at any line', async () => {
  const root = tmp('root');
  const thread = randomUUID();
  runFile(root, 'codex', 'ae/c3/1', { nativeId: thread });
  const ops = detachedOps(codex, root);
  const text = jsonl(rolloutLines(thread));
  for (let cut = text.indexOf('\n') + 1; cut > 0; cut = text.indexOf('\n', cut) + 1) {
    writeRollout(thread, text.slice(0, cut));
    const first = await detachedRead(ops, 'ae/c3/1');
    fs.appendFileSync(rolloutFile(thread), text.slice(cut));
    const second = await detachedRead(ops, 'ae/c3/1', first.cursor);
    assert.deepEqual([...first.events, ...second.events], CODEX_EVENTS, `cut at byte ${cut}`);
  }
});

test("a Codex record: a failed task's end is its error; a command that exited 0 is no error; a record with no time gives nothing", () => {
  assert.deepEqual(
    codexRolloutEvents(
      {
        timestamp: at(0),
        type: 'event_msg',
        payload: { type: 'task_complete', turn_id: 't', error: { message: 'Invalid value: banana' } },
      },
      0,
    ),
    [{ id: 't:complete', at: at(0), role: 'system', kind: 'system', text: 'Invalid value: banana' }],
  );
  assert.deepEqual(
    codexRolloutEvents(
      {
        timestamp: at(0),
        type: 'event_msg',
        payload: {
          type: 'item_completed',
          item: { type: 'CommandExecution', id: 'x', command: ['ls'], status: 'completed', exit_code: 0, aggregated_output: 'a' },
        },
      },
      0,
    )[1]?.result,
    { text: 'a', isError: false },
  );
  assert.deepEqual(
    codexRolloutEvents({ type: 'event_msg', payload: { type: 'item_completed', item: { type: 'AgentMessage', id: 'm', content: [] } } }, 0),
    [],
  );
  assert.deepEqual(
    codexRolloutEvents(
      {
        timestamp: at(0),
        type: 'response_item',
        payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'context' }] },
      },
      0,
    ),
    [],
    'the model-facing copy is not read',
  );
});

/** A record of the kind `payload.type` names, at `at(0)`, carrying `payload`. */
const eventMsg = (payload: object): object => ({ timestamp: at(0), type: 'event_msg', payload });

/** The words `codexRolloutEvents` refuses `record` with, read alone as the line at byte 9 of `/r.jsonl`. */
const refusedWith = (record: object): string => {
  try {
    codexRolloutEvents(record, 9, '/r.jsonl');
  } catch (e) {
    return (e as Error).message;
  }
  return 'not refused';
};

test("REFUSED: a Codex rollout's record of a kind the runtime reads with a field that is there in another shape refuses the read by its file, its offset, its field and the fix", async () => {
  const fix = '`ROLLOUT` (`harness/codex/rollout.ts`)';
  const thread = randomUUID();
  const lines = rolloutLines(thread);
  lines.splice(2, 0, eventMsg({ type: 'task_complete', turn_id: 't' }));
  (lines[2] as { timestamp: string }).timestamp = 'yesterday';
  const text = jsonl(lines);
  writeRollout(thread, text);
  const offset = Buffer.byteLength(text.split('\n').slice(0, 2).join('\n')) + 1;
  await assert.rejects(readTranscript(rolloutFile(thread), undefined, codexRolloutEvents), (e: Error) => {
    assert.ok(
      e.message.startsWith(
        `the line at byte ${offset} of the rollout \`${rolloutFile(thread)}\` is an \`event_msg\` \`task_complete\` record whose \`timestamp\` is "yesterday"`,
      ),
      e.message,
    );
    assert.ok(e.message.includes(fix), e.message);
    return true;
  });

  const content = refusedWith(eventMsg({ type: 'item_completed', item: { type: 'AgentMessage', id: 'm', content: 'hello' } }));
  assert.ok(
    content.startsWith(
      'the line at byte 9 of the rollout `/r.jsonl` is an `event_msg` `item_completed` record whose `payload.item.content` is "hello"',
    ),
    content,
  );
  assert.ok(content.includes(fix), content);

  const error = refusedWith(eventMsg({ type: 'task_complete', turn_id: 't', error: { message: 7 } }));
  assert.ok(
    error.startsWith(
      'the line at byte 9 of the rollout `/r.jsonl` is an `event_msg` `task_complete` record whose `payload.error.message` is 7',
    ),
    error,
  );
  assert.ok(error.includes(fix), error);
});

test('REFUSED: a Codex command whose exit code is no number refuses the `transcript` verb, never reads as a failed command', async () => {
  const root = tmp('root');
  const thread = randomUUID();
  const lines = rolloutLines(thread);
  const bad = eventMsg({
    type: 'item_completed',
    item: { type: 'CommandExecution', id: 'x', command: ['ls'], status: 'completed', exit_code: '0', aggregated_output: 'a' },
  });
  const text = jsonl(lines) + jsonl([bad]);
  writeRollout(thread, text);
  runFile(root, 'codex', 'ae/c4/1', { nativeId: thread });
  const offset = Buffer.byteLength(jsonl(lines));
  await assert.rejects(detachedRead(detachedOps(codex, root), 'ae/c4/1'), (e: unknown) => {
    assert.ok(e instanceof RunnerError, String(e));
    assert.equal(e.verb, 'transcript');
    assert.ok(
      e.message.startsWith(
        `codex: the line at byte ${offset} of the rollout \`${rolloutFile(thread)}\` is an \`event_msg\` \`item_completed\` record whose \`payload.item.exit_code\` is "0"`,
      ),
      e.message,
    );
    assert.ok(e.message.includes('`harness/codex/rollout.ts`'), e.message);
    return true;
  });
});

test('a Codex record of a kind the runtime reads with a field left out reads as it always has; a record of any other kind passes undecoded', () => {
  const system = (id: string, text: string) => [{ id, at: at(0), role: 'system', kind: 'system', text }];
  const item = (fields: object) => codexRolloutEvents(eventMsg({ type: 'item_completed', item: fields }), 9);
  assert.deepEqual(codexRolloutEvents(eventMsg({ type: 'task_complete' }), 9), system('@9', 'task_complete'));
  assert.deepEqual(codexRolloutEvents(eventMsg({ type: 'task_complete', error: null }), 9), system('@9', 'task_complete'));
  assert.deepEqual(codexRolloutEvents(eventMsg({ type: 'task_complete', error: {} }), 9), system('@9', 'task_complete'));
  assert.deepEqual(codexRolloutEvents({ type: 'event_msg', payload: { type: 'task_complete', turn_id: 't' } }, 9), [], 'no time');
  assert.deepEqual(codexRolloutEvents(eventMsg({ type: 'item_completed' }), 9), []);
  assert.deepEqual(item({ type: 'AgentMessage' }), [{ id: '@9', at: at(0), role: 'assistant', kind: 'text', text: '' }]);
  assert.deepEqual(item({ type: 'UserMessage', id: '' }), [{ id: '@9', at: at(0), role: 'user', kind: 'text', text: '' }]);
  assert.deepEqual(item({ type: 'Reasoning' }), [{ id: '@9', at: at(0), role: 'assistant', kind: 'thinking' }]);
  assert.deepEqual(item({ type: 'CommandExecution' }), [
    {
      id: '@9',
      at: at(0),
      role: 'assistant',
      kind: 'tool_use',
      tool: { name: 'CommandExecution', input: { command: undefined, cwd: undefined } },
    },
    { id: '@9', at: at(0), role: 'user', kind: 'tool_result', result: { text: '', isError: true } },
  ]);
  assert.deepEqual(item({ type: 'CommandExecution', exit_code: null, aggregated_output: null, status: 'completed' })[1]?.result, {
    text: '',
    isError: true,
  });
  assert.deepEqual(item({ type: 'FileChange' }), [
    { id: '@9', at: at(0), role: 'assistant', kind: 'tool_use', tool: { name: 'FileChange', input: { changes: undefined } } },
    { id: '@9', at: at(0), role: 'user', kind: 'tool_result', result: { text: '', isError: true } },
  ]);
  assert.deepEqual(item({ type: 'WebSearch', id: 'w', query: 7 }), system('w', '[WebSearch]'));
  assert.deepEqual(item({ id: 'n' }), system('n', '[undefined]'));
  for (const other of [
    { timestamp: at(0), type: 'response_item', payload: 7 },
    { timestamp: 'yesterday', type: 'session_meta', payload: { id: 7 } },
    eventMsg({ type: 'token_count', info: 'x' }),
    { timestamp: at(0), type: 'event_msg', payload: 'task_complete' },
    { timestamp: at(0), type: 'turn_context', payload: { type: 'task_complete', error: 7 } },
    'event_msg',
    null,
  ]) {
    assert.deepEqual(codexRolloutEvents(other, 9, '/r.jsonl'), [], JSON.stringify(other));
  }
});

test("claude-detached reads the transcript `claude --bg` would, once its run has the session's id; a spec that keeps no record has no transcript", async () => {
  const root = tmp('root');
  const sessionId = randomUUID();
  writeClaude(sessionId, jsonl(claudeLines(sessionId)));
  runFile(root, 'claude-detached', 'ae/d1/1', { nativeId: sessionId });
  assert.deepEqual((await detachedRead(detachedOps(claudeDetached, root), 'ae/d1/1')).events, CLAUDE_EVENTS);

  assert.equal(detachedOps({ name: 'sh', command: () => ({ cmd: 'sh', args: ['-c', 'true'] }) }, root).transcript, undefined);
});

const { Engine } = await import('../src/index.ts');
const { builtEngine } = await import('./engine.ts');
type Sighting = import('../src/index.ts').Sighting;

const onPath = async <T>(bin: string, f: () => Promise<T>): Promise<T> => {
  const prev = process.env.PATH;
  process.env.PATH = `${bin}:${prev}`;
  try {
    return await f();
  } finally {
    process.env.PATH = prev;
  }
};

/**
 * A fake `claude`: `agents` prints its rows, `--bg --name <n>` adds one, working and idle, under a new session id, and `rm <id>` drops
 * the row of the session whose id starts so; anything else succeeds and does nothing. While `<bin>/agents-fails` exists, `agents`
 * fails, as a registry under contention does. Every call is written down.
 */
const fakeClaude = () => {
  const bin = tmp('bin');
  const registry = path.join(bin, 'registry.json');
  const calls = path.join(bin, 'calls.jsonl');
  const agentsFails = path.join(bin, 'agents-fails');
  fs.writeFileSync(registry, '[]');
  fs.writeFileSync(calls, '');
  fs.writeFileSync(
    path.join(bin, 'claude'),
    `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify(args) + '\\n');
const rows = JSON.parse(fs.readFileSync(${JSON.stringify(registry)}, 'utf8'));
if (args[0] === 'agents' && fs.existsSync(${JSON.stringify(agentsFails)})) { process.stderr.write('registry unavailable\\n'); process.exit(1); }
if (args[0] === 'agents') { process.stdout.write(JSON.stringify(rows)); process.exit(0); }
if (args[0] === '--bg') {
  rows.push({ name: args[args.indexOf('--name') + 1], sessionId: require('node:crypto').randomUUID(), state: 'working', status: 'idle', kind: 'background', startedAt: Date.now() });
  fs.writeFileSync(${JSON.stringify(registry)}, JSON.stringify(rows));
}
if (args[0] === 'rm') fs.writeFileSync(${JSON.stringify(registry)}, JSON.stringify(rows.filter((r) => !r.sessionId.startsWith(args[1]))));
`,
    { mode: 0o755 },
  );
  type Row = { name: string; sessionId: string; state: string; pid?: number };
  const rows = () => JSON.parse(fs.readFileSync(registry, 'utf8')) as Row[];
  return {
    bin,
    rows,
    set: (name: string, change: Partial<Row>) =>
      fs.writeFileSync(registry, JSON.stringify(rows().map((r) => (r.name === name ? { ...r, ...change } : r)))),
    agentsFail: (fails: boolean) => (fails ? fs.writeFileSync(agentsFails, '') : fs.rmSync(agentsFails, { force: true })),
    /** How many times `claude agents` has been run. */
    agentsCalls: () =>
      fs
        .readFileSync(calls, 'utf8')
        .split('\n')
        .filter((l) => l.startsWith('["agents"')).length,
  };
};

/** A fake `codex` that prints a thread's first events and exits, beside a `claude` whose registry is empty. */
const fakeCodex = (thread: string) => {
  const bin = tmp('bin');
  fs.writeFileSync(path.join(bin, 'claude'), `#!/bin/sh\nif [ "$1" = agents ]; then echo '[]'; fi\n`, { mode: 0o755 });
  fs.writeFileSync(
    path.join(bin, 'codex'),
    `#!/bin/sh\necho '{"type":"thread.started","thread_id":"${thread}"}'\necho '{"type":"turn.started"}'\n`,
    { mode: 0o755 },
  );
  return bin;
};

test("at shipped defaults, a Claude background session's transcript is its session's, read through its own harness from the cursor given — and logs is as it was", async () => {
  const claude = fakeClaude();
  await onPath(claude.bin, async () => {
    const engine = builtEngine(Engine.layer({ root: tmp('root') }));
    const id = await Effect.runPromise(
      engine.file({
        brief: 'Write the word to WORD.txt, then give your closeout.',
        cwd: tmp('cwd'),
        config: { background: true },
      }),
    );

    const before = await Effect.runPromise(engine.transcript(id));
    assert.deepEqual(before.events, [], 'no session yet: nothing to read');

    await Effect.runPromise(engine.tick());
    const [row] = claude.rows();
    assert.equal(row?.name, `ae/${id}/1`, 'spawned');
    const lines = claudeLines(row.sessionId);
    writeClaude(row.sessionId, jsonl(lines.slice(0, 7)));

    const first = await Effect.runPromise(engine.transcript(id, before.cursor));
    assert.deepEqual(first.events, CLAUDE_EVENTS.slice(0, 5), 'from the start, with the cursor a read of nothing gave');
    datedWithRoles(first.events);
    const started = Date.parse((await Effect.runPromise(engine.view(id))).state.attempts[0].startedAt);
    assert.ok(
      first.events.every((e) => Date.parse(e.at) < started),
      'turns older than the attempt keep their own times: the caller decides what to show',
    );

    fs.appendFileSync(claudeFile(row.sessionId), jsonl(lines.slice(7)));
    const second = await Effect.runPromise(engine.transcript(id, first.cursor));
    assert.deepEqual(second.events, CLAUDE_EVENTS.slice(5), 'only what was appended');
    assert.deepEqual(
      await Effect.runPromise(engine.transcript(id, second.cursor)),
      { events: [], cursor: second.cursor },
      'and then nothing, from the same cursor',
    );

    assert.equal(
      await Effect.runPromise(engine.logs(id)),
      [
        'user      Write the word to WORD.txt, then give your closeout.',
        'assistant [thinking]',
        'assistant Writing it now.',
        'assistant [Bash]',
        'user      [tool_result]',
        'assistant [StructuredOutput]',
        'user      [tool_result]',
      ].join('\n'),
      "logs: the SDK's reading of the same transcript, flattened to text, as it was",
    );
  });
});

test(
  "at shipped defaults, a Codex task's transcript is read from its rollout, by the thread id its worker saw — and logs is its output, as it was",
  WAITED,
  async (t) => {
    const thread = randomUUID();
    writeRollout(thread, jsonl(rolloutLines(thread)));
    await onPath(fakeCodex(thread), async () => {
      const engine = builtEngine(Engine.layer({ root: tmp('root') }));
      const id = await Effect.runPromise(engine.file({ brief: 'Review the change.', cwd: tmp('cwd'), harness: 'codex' }));
      await Effect.runPromise(engine.tick());
      let read = await Effect.runPromise(engine.transcript(id));
      await until(t, async () => (read = await Effect.runPromise(engine.transcript(id))).events.length > 0, `${id}'s transcript read`, {
        everyMs: 50,
      });
      assert.deepEqual(
        read.events,
        CODEX_EVENTS,
        'the worker runs the harness a moment after the tick returns, and keeps the thread id it prints',
      );
      let logs = '';
      await until(
        t,
        async () => /"thread\.started"/.test((logs = await Effect.runPromise(engine.logs(id)))),
        `${id}'s logs show its thread`,
        {
          everyMs: 50,
        },
      );
      assert.match(
        logs,
        /"thread\.started"/,
        'the worker keeps the thread id the moment it reads it, and its capture of the output reaches the disk after',
      );
    });
  },
);

test('refused, each naming what to do: a task the engine has no record of, a cursor no read gave, a harness that keeps no conversation', async () => {
  const refusal = (pattern: RegExp) => (e: Error & { _tag?: string }) => e._tag === 'TranscriptRefused' && pattern.test(e.message);

  const claude = fakeClaude();
  await onPath(claude.bin, async () => {
    const engine = builtEngine(Engine.layer({ root: tmp('root') }));
    await assert.rejects(
      Effect.runPromise(engine.transcript('t-nope')),
      refusal(/^`t-nope` is not a task on this board\. `ae ls`, or `list\(\)`, gives the ones it has\.$/),
    );
    const id = await Effect.runPromise(engine.file({ brief: 'the prompt', cwd: tmp('cwd') }));
    await assert.rejects(
      Effect.runPromise(engine.transcript(id, 'from-the-top')),
      refusal(/^`from-the-top` is not a cursor a transcript read gave\. Pass the `cursor`/),
    );
    assert.deepEqual((await Effect.runPromise(engine.transcript(id))).events, [], 'the same task, asked without one, is read');
    const codexId = await Effect.runPromise(engine.file({ brief: 'the prompt', cwd: tmp('cwd'), harness: 'codex' }));
    await assert.rejects(
      Effect.runPromise(engine.transcript(codexId, 'page-2')),
      refusal(/^`page-2` is not a cursor a transcript read gave\./),
      "a HarnessSpec's reader is the engine's too, and refuses the same",
    );
  });

  const sessions = new Map<string, Sighting>();
  const plain: AsyncRunner = {
    async spawn(r) {
      sessions.set(r.name, { sessionId: 's-1', state: 'working' });
    },
    async observe() {
      return new Map(sessions);
    },
    async stop() {},
    async logs() {
      return 'what it printed';
    },
  };
  const own = builtEngine(Engine.layer({ root: tmp('root'), harnesses: { plain: asyncOps(plain) }, defaultHarness: 'plain' }));
  const ownId = await Effect.runPromise(own.file({ brief: 'the prompt', cwd: '/repo' }));
  await assert.rejects(
    Effect.runPromise(own.transcript(ownId)),
    refusal(/^the `plain` harness keeps no conversation this engine can read\. `logs` gives what its session printed\.$/),
    'a harness brought as an AsyncRunner with no `transcript`',
  );
  const sh = builtEngine(
    Engine.layer({ root: tmp('root'), harnesses: { sh: { name: 'sh', command: () => ({ cmd: 'sh', args: ['-c', 'true'] }) } } }),
  );
  await assert.rejects(
    Effect.runPromise(sh.transcript(await Effect.runPromise(sh.file({ brief: 'the prompt', cwd: '/repo' })))),
    refusal(/^the `sh` harness keeps no conversation/),
    'a HarnessSpec with none',
  );
});

test("an AsyncRunner's cursor is its own: passed through as it gave it, and never replaced by the engine's", async () => {
  const sessions = new Map<string, Sighting>();
  const asked: Array<[string, string | undefined]> = [];
  const said = (n: number) => ({ id: `e-${n}`, at: at(n), role: 'assistant', kind: 'text', text: `line ${n}` }) as const;
  const talking: AsyncRunner = {
    async spawn(r) {
      sessions.set(r.name, { sessionId: 's-1', state: 'working' });
    },
    async observe() {
      return new Map(sessions);
    },
    async stop() {},
    async logs() {
      return 'what it printed';
    },
    async transcript(sessionId, after) {
      asked.push([sessionId, after]);
      const page = after === undefined ? 1 : Number(after.replace('page-', ''));
      return { events: [said(page)], cursor: `page-${page + 1}` };
    },
  };
  const engine = builtEngine(Engine.layer({ root: tmp('root'), harnesses: { talking: asyncOps(talking) }, defaultHarness: 'talking' }));
  const id = await Effect.runPromise(engine.file({ brief: 'the prompt', cwd: '/repo' }));

  const nothing = await Effect.runPromise(engine.transcript(id));
  assert.deepEqual(nothing.events, [], 'no session yet: not asked');
  assert.deepEqual(
    await Effect.runPromise(engine.transcript(id, 'page-9')),
    { events: [], cursor: 'page-9' },
    'no session yet, asked with its own cursor: that cursor back',
  );

  await Effect.runPromise(engine.tick());
  const first = await Effect.runPromise(engine.transcript(id, nothing.cursor));
  assert.deepEqual(first, { events: [said(1)], cursor: 'page-2' }, "the engine's start is asked as no cursor");
  const second = await Effect.runPromise(engine.transcript(id, first.cursor));
  assert.deepEqual(second, { events: [said(2)], cursor: 'page-3' }, 'its own cursor, not refused');
  assert.deepEqual(
    asked,
    [
      ['s-1', undefined],
      ['s-1', 'page-2'],
    ],
    'pages, in a shape no file reader gives, passed through as the runner gave them',
  );
});

test("a registry that cannot be read: an ended attempt's transcript is read by the id on the record, with no registry asked; one in flight reads as nothing new, from the cursor given", async () => {
  const claude = fakeClaude();
  await onPath(claude.bin, async () => {
    const engine = builtEngine(Engine.layer({ root: tmp('root') }));
    const id = await Effect.runPromise(
      engine.file({
        brief: 'Write the word to WORD.txt, then give your closeout.',
        cwd: tmp('cwd'),
        config: { background: true },
      }),
    );
    await Effect.runPromise(engine.tick());
    const [row] = claude.rows();
    assert.equal(row?.name, `ae/${id}/1`, 'spawned');
    writeClaude(row.sessionId, jsonl(claudeLines(row.sessionId)));
    const first = await Effect.runPromise(engine.transcript(id));
    assert.deepEqual(first.events, CLAUDE_EVENTS, 'in flight, found by observing its harness');

    claude.agentsFail(true);
    assert.deepEqual(
      await Effect.runPromise(engine.transcript(id, first.cursor)),
      { events: [], cursor: first.cursor },
      'in flight, registry unread: nothing new, and the cursor given back — not a rejection',
    );
    assert.deepEqual((await Effect.runPromise(engine.transcript(id))).events, [], 'and from the start, nothing observed either');

    claude.agentsFail(false);
    claude.set(row.name, { state: 'done' });
    await Effect.runPromise(engine.tick());
    const ended = (await Effect.runPromise(engine.view(id))).state.attempts[0];
    assert.equal(ended.nativeId, row.sessionId, "the attempt ended, its session's id on the record");

    claude.agentsFail(true);
    const before = claude.agentsCalls();
    assert.deepEqual((await Effect.runPromise(engine.transcript(id))).events, CLAUDE_EVENTS, 'ended, registry unread: read all the same');
    assert.deepEqual(
      await Effect.runPromise(engine.transcript(id, first.cursor)),
      { events: [], cursor: first.cursor },
      'from the cursor given',
    );
    assert.equal(claude.agentsCalls(), before, 'and the registry was not asked');
    assert.match(await Effect.runPromise(engine.logs(id)), /Write the word to WORD\.txt/, 'as logs reads it');
  });
});

/**
 * A `--bg` runner under a scratch root whose transcripts were last written at 0 and whose monotonic clock reads `mono.ms`: a test
 * steps it past the floor to make a session that cannot be read cold.
 */
const steppedOps = () => {
  const mono = { boot: 'boot-1', ms: 0 };
  return { mono, ops: claudeOps({ root: tmp('root'), mono: () => mono, transcriptTime: async () => 0 }) };
};

/** Rows listing `bad` as `ae/t/1` and `good` as `ae/u/1`, both done and idle. */
const badAndGood = (bad: string, good: string) => [
  { name: 'ae/t/1', sessionId: bad, state: 'done', status: 'idle', kind: 'background', startedAt: T0 - 1_000 },
  { name: 'ae/u/1', sessionId: good, state: 'done', status: 'idle', kind: 'background', startedAt: T0 - 1_000 },
];

test("REFUSED: a finished background session whose statement's line does not decode, at shipped readers, is unread alone, the other read beside it, and failed once cold, its warning naming the transcript, its line and field", async () => {
  const [bad, good] = [randomUUID(), randomUUID()];
  const lines = claudeLines(bad);
  const call = lines.findIndex((l) => JSON.stringify(l).includes('StructuredOutput'));
  writeClaude(bad, claudeWith(bad, call, { timestamp: 'yesterday' }));
  writeClaude(good, jsonl(claudeLines(good)));
  const { mono, ops } = steppedOps();
  const words = [
    "`ae/t/1`'s transcript cannot be read",
    `line ${call + 1} of the transcript \`${claudeFile(bad)}\` is an \`assistant\` line whose \`timestamp\` is "yesterday"`,
  ];

  await listing(badAndGood(bad, good), async () => {
    const first = await warned(ops.observeFor!([{ name: 'ae/t/1' }, { name: 'ae/u/1' }]));
    assert.deepEqual([...first.value.unread], ['ae/t/1'], 'first seen within the floor: unread, neither there nor gone');
    assert.deepEqual(first.value.seen.get('ae/u/1')?.closeout?.payload, { outcome: 'blocked', summary: 'WORD.txt is not writable' });
    assert.equal(first.warnings.length, 1);
    for (const said of words) assert.ok(first.warnings[0].includes(said), first.warnings[0]);

    mono.ms += QUIESCENT_AFTER_MS;
    const cold = await warned(ops.observe);
    assert.equal(cold.value.get('ae/t/1')?.state, 'failed', 'cold for the floor: failed, never completed with no statement');
    assert.equal(cold.value.get('ae/t/1')?.closeout, undefined);
    assert.equal(cold.value.get('ae/u/1')?.state, 'completed');
    assert.equal(cold.warnings.length, 1);
    for (const said of words) assert.ok(cold.warnings[0].includes(said), cold.warnings[0]);
  });
});

/**
 * `fs.promises.readFile`, as the runtime reads a transcript through it (`readTextAsync`), failing on demand for one file: rejected
 * as the OS rejects it with the code `fails` gives, or read as it is while that gives `undefined`. `asked` counts that file's reads.
 */
const failingReads = (t: TestContext, file: string) => {
  let code: string | undefined;
  let asked = 0;
  const readFile = fs.promises.readFile.bind(fs.promises);
  t.mock.method(fs.promises, 'readFile', (async (...args: Parameters<typeof readFile>) => {
    if (args[0] !== file) return readFile(...args);
    asked++;
    if (code === undefined) return readFile(...args);
    throw Object.assign(new Error(`${code}: cannot read, open '${file}'`), { code, syscall: 'open', path: file });
  }) as typeof readFile);
  return { fails: (c: string | undefined) => (code = c), asked: () => asked };
};

/** A fake `claude` whose `agents` lists `rows`, on PATH while `f` runs. */
const listing = <T>(rows: object[], f: () => Promise<T>) => {
  const bin = tmp('bin');
  fs.writeFileSync(path.join(bin, 'claude'), `#!/bin/sh\ncat <<'JSON'\n${JSON.stringify(rows)}\nJSON\n`, { mode: 0o755 });
  return onPath(bin, f);
};

test('REFUSED: a finished background session whose transcript was found and cannot be read is unread alone, each look, the other read beside it, and is read again on the next look; cold, it reads failed; readable again, it gives the statement', async (t: TestContext) => {
  const [bad, good] = [randomUUID(), randomUUID()];
  writeClaude(bad, jsonl(claudeLines(bad)));
  writeClaude(good, jsonl(claudeLines(good)));
  const reads = failingReads(t, claudeFile(bad));
  const { mono, ops } = steppedOps();
  const expected = [{ name: 'ae/t/1' }, { name: 'ae/u/1' }];

  await listing(badAndGood(bad, good), async () => {
    for (const code of ['EACCES', 'EIO', 'ENOENT']) {
      reads.fails(code);
      for (const look of [1, 2]) {
        const before = reads.asked();
        const { value, warnings } = await warned(ops.observeFor!(expected));
        assert.deepEqual([...value.unread], ['ae/t/1'], `${code}, look ${look}`);
        assert.equal(value.seen.get('ae/u/1')?.state, 'completed', `${code}, look ${look}: the other session is read`);
        assert.equal(warnings.length, 1, `${code}, look ${look}`);
        for (const said of ["`ae/t/1`'s transcript cannot be read", code, claudeFile(bad)])
          assert.ok(warnings[0].includes(said), `${code}, look ${look}: ${warnings[0]}`);
        assert.ok(reads.asked() > before, `${code}, look ${look}: the transcript is read again, its failure never kept`);
      }
    }
    mono.ms += QUIESCENT_AFTER_MS;
    const before = reads.asked();
    const cold = await warned(ops.observeFor!(expected));
    assert.equal(cold.value.seen.get('ae/t/1')?.state, 'failed', 'cold for the floor and still not read: failed');
    assert.ok(cold.warnings[0]?.includes('ENOENT'), cold.warnings.join(' | '));
    assert.ok(reads.asked() > before, 'read again all the same');

    reads.fails(undefined);
    const seen = await Effect.runPromise(ops.observe);
    assert.deepEqual(seen.get('ae/t/1')?.closeout?.payload, { outcome: 'blocked', summary: 'WORD.txt is not writable' });
  });
});

/**
 * A transcript of `claudeLines` padded with prompts of filler to at least `bytes`, its conversation dated from `T0` and its closeout
 * the last call in it.
 */
const longClaude = (sessionId: string, bytes: number) => {
  const lines = claudeLines(sessionId);
  const filler = { ...lines[1], uuid: 'u-pad', message: { role: 'user', content: 'x'.repeat(10_000) } };
  const pad = jsonl([filler]);
  return pad.repeat(Math.ceil(bytes / pad.length)) + jsonl(lines);
};

/** A StructuredOutput call and its result, made at `s` seconds into the fixture's conversation, saying `input`. */
const closeoutAt = (sessionId: string, s: number, input: object) => {
  const [call, result] = claudeLines(sessionId).slice(7, 9) as Record<string, unknown>[];
  const id = `toolu_closeout_${s}`;
  return jsonl([
    {
      ...call,
      uuid: `a-${s}`,
      timestamp: at(s),
      message: { id: `msg_${s}`, role: 'assistant', content: [{ type: 'tool_use', id, name: 'StructuredOutput', input }] },
    },
    {
      ...result,
      uuid: `u-${s}`,
      timestamp: at(s + 1),
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] },
    },
  ]);
};

/** The file's mtime set `ago` milliseconds before now. */
const writtenAgo = (file: string, ago: number) => {
  const when = new Date(Date.now() - ago);
  fs.utimesSync(file, when, when);
};

test("at shipped readers, a working idle session's transcript is read once per change of its mtime: once a look for its closeout and its usage together, and not at all while it is unchanged", async () => {
  const sessionId = randomUUID();
  writeClaude(sessionId, longClaude(sessionId, 2_000_000));
  const file = claudeFile(sessionId);
  writtenAgo(file, 10_000);
  const rows = [{ name: 'ae/t/1', sessionId, state: 'working', status: 'idle', kind: 'background', startedAt: T0 - 1_000 }];
  const ops = claudeOps({ root: tmp('root') });
  const look = async () => {
    const tally = { counts: noCounts(), observed: {} };
    const seen = await tallied(tally, () => Effect.runPromise(ops.observe));
    return { seen: seen.get('ae/t/1'), bytes: tally.counts.bytesRead };
  };

  await listing(rows, async () => {
    const size = fs.statSync(file).size;
    const first = await look();
    assert.deepEqual(first.seen?.closeout?.payload, { outcome: 'blocked', summary: 'WORD.txt is not writable' });
    assert.ok(first.seen?.usage, 'its usage read');
    assert.ok(first.bytes >= size && first.bytes < 2 * size, `one read of ${size} bytes for both, not two: ${first.bytes}`);

    let idle = 0;
    for (let i = 0; i < 5; i++) idle += (await look()).bytes;
    assert.ok(idle < size / 100, `five looks over a transcript nothing wrote read none of it: ${idle} bytes`);

    fs.appendFileSync(file, closeoutAt(sessionId, 100, { outcome: 'done', summary: 'written' }));
    writtenAgo(file, 5_000);
    const grown = fs.statSync(file).size;
    const next = await look();
    assert.deepEqual(next.seen?.closeout?.payload, { outcome: 'done', summary: 'written' }, 'the closeout given since is seen');
    assert.ok(next.bytes >= grown && next.bytes < 2 * grown, `written since: read once again, ${next.bytes} bytes`);
  });
});

test("a transcript's mtime is its file's, in whole milliseconds, read by a stat; a session with no transcript has none", async () => {
  const sessionId = randomUUID();
  writeClaude(sessionId, jsonl(claudeLines(sessionId)));
  const tally = { counts: noCounts(), observed: {} };
  const written = await tallied(tally, () => transcriptWrittenAt(sessionId));
  assert.equal(written, Math.trunc(fs.statSync(claudeFile(sessionId)).mtimeMs));
  assert.equal(tally.counts.bytesRead, 0, 'no byte of it read');
  assert.equal(await transcriptWrittenAt(randomUUID()), undefined);
});

test('a background session with no transcript at all still reads as none: no statement, no usage, and no read asked', async (t: TestContext) => {
  const sessionId = randomUUID();
  const reads = failingReads(t, claudeFile(sessionId));
  reads.fails('EACCES');
  const rows = [{ name: 'ae/t/1', sessionId, state: 'done', status: 'idle', kind: 'background', startedAt: Date.now() }];
  const seen = await listing(rows, () => Effect.runPromise(claudeOps({ root: tmp('root'), transcriptTime: async () => 0 }).observe));
  const sighting = seen.get('ae/t/1');
  assert.ok(sighting, 'listed');
  assert.equal(sighting.closeout, undefined);
  assert.equal(sighting.usage, undefined);
  assert.equal(reads.asked(), 0);
});

test('at shipped defaults, a finished background session whose transcript cannot be read stays in flight and unread, never unsigned; read on the next pass, it ends stated', async (t: TestContext) => {
  const claude = fakeClaude();
  await onPath(claude.bin, async () => {
    const engine = builtEngine(Engine.layer({ root: tmp('root') }));
    const id = await Effect.runPromise(
      engine.file({ brief: 'Write the word.', cwd: tmp('cwd'), config: { background: true }, closeoutSchema: { type: 'object' } }),
    );
    await Effect.runPromise(engine.tick());
    const [row] = claude.rows();
    assert.equal(row?.name, `ae/${id}/1`, 'spawned');
    const now = new Date().toISOString();
    writeClaude(row.sessionId, jsonl(claudeLines(row.sessionId).map((l) => ('timestamp' in l ? { ...l, timestamp: now } : l))));
    const reads = failingReads(t, claudeFile(row.sessionId));
    claude.set(row.name, { state: 'done' });

    for (const code of ['EACCES', 'EIO', 'ENOENT']) {
      reads.fails(code);
      const report = await Effect.runPromise(engine.tick());
      const attempt = (await Effect.runPromise(engine.view(id))).state.attempts[0];
      assert.equal(attempt.ended, null, `${code}: still in flight`);
      assert.equal(attempt.reason, null, `${code}: no end`);
      const unread = Object.values(report.observed).reduce((n, o) => n + o.unread, 0);
      assert.ok(unread >= 1, `${code}: the observe is unread: ${JSON.stringify(report.observed)}`);
    }

    reads.fails(undefined);
    await Effect.runPromise(engine.tick());
    const ended = (await Effect.runPromise(engine.view(id))).state.attempts[0];
    assert.notEqual(ended.ended, null, 'ended once read');
    assert.deepEqual(ended.closeout, { outcome: 'blocked', summary: 'WORD.txt is not writable' });
    assert.equal(ended.stated, true);
  });
});

/**
 * An engine over a fake `claude` (`fakeClaude`) whose one harness, `bg`, is the `--bg` runner, reading every transcript as last written
 * when it was, its wall and monotonic clocks `shift` ahead: a test steps it past the floor to make a session cold.
 */
const shiftedEngine = (claude: ReturnType<typeof fakeClaude>) => {
  const clock = { shift: 0 };
  const written = new Map<string, number>();
  const ops = claudeOps({
    root: tmp('root'),
    sessionsDir: tmp('sessions'),
    now: () => Date.now() + clock.shift,
    mono: () => ({ boot: 'boot-1', ms: performance.now() + clock.shift }),
    transcriptTime: async (sessionId) => written.get(sessionId),
  });
  const engine = builtEngine(Engine.layer({ root: tmp('root'), harnesses: { bg: ops }, defaultHarness: 'bg' }));
  const transcriptOf = (sessionId: string) => {
    const now = new Date().toISOString();
    writeClaude(sessionId, jsonl(claudeLines(sessionId).map((l) => ('timestamp' in l ? { ...l, timestamp: now } : l))));
    written.set(sessionId, Date.now());
  };
  const verbs = () =>
    fs
      .readFileSync(path.join(claude.bin, 'calls.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as string[])
      .filter((a) => a[0] === 'stop' || a[0] === 'rm');
  return { clock, engine, transcriptOf, verbs };
};

/** Ticks `engine` until the task `id` has settled, and answers its state; `t`'s test fails if it never does. */
const settledOf = async (t: Waiter, engine: ReturnType<typeof builtEngine>, id: string) => {
  let state = (await Effect.runPromise(engine.view(id))).state;
  await until(
    t,
    async () => {
      state = (await Effect.runPromise(engine.view(id))).state;
      if (state.settled) return true;
      await Effect.runPromise(engine.tick());
      return false;
    },
    () => `${id} settled: its last attempt is ${JSON.stringify(state.attempts.at(-1))}`,
    { everyMs: 50 },
  );
  return state;
};

/** How many names `report` says a harness left unread. */
const unreadIn = (report: { observed: Record<string, { unread: number }> }) =>
  Object.values(report.observed).reduce((n, o) => n + o.unread, 0);

test(
  'REFUSED: a background session whose transcript cannot be read stays in flight and unread while its sibling ends stated; cold, it settles failed, its session stopped and removed, and is forgotten',
  WAITED,
  async (t: TestContext) => {
    const claude = fakeClaude();
    await onPath(claude.bin, async () => {
      const { clock, engine, transcriptOf, verbs } = shiftedEngine(claude);
      const file = () => Effect.runPromise(engine.file({ brief: 'Write the word.', cwd: tmp('cwd'), closeoutSchema: { type: 'object' } }));
      const [bad, good] = [await file(), await file()];
      await Effect.runPromise(engine.tick());
      const row = (id: string) => claude.rows().find((r) => r.name === `ae/${id}/1`)!;
      for (const id of [bad, good]) transcriptOf(row(id).sessionId);
      const short = row(bad).sessionId.split('-')[0];
      const reads = failingReads(t, claudeFile(row(bad).sessionId));
      reads.fails('EACCES');
      claude.set(row(bad).name, { pid: 999999 });
      claude.set(row(good).name, { state: 'done' });

      const report = await Effect.runPromise(engine.tick());
      assert.ok(unreadIn(report) >= 1, JSON.stringify(report.observed));
      const ended = (await Effect.runPromise(engine.view(good))).state.attempts[0];
      assert.equal(ended.stated, true, 'the sibling is read on the same pass and ends stated');
      for (const pass of [1, 2]) {
        await Effect.runPromise(engine.tick());
        assert.equal((await Effect.runPromise(engine.view(bad))).state.attempts[0].ended, null, `pass ${pass}: in flight while unread`);
      }

      clock.shift += QUIESCENT_AFTER_MS;
      const state = await settledOf(t, engine, bad);
      assert.equal(state.settled, 'failed');
      assert.deepEqual(
        verbs().filter((v) => v[1] === short),
        [
          ['stop', short],
          ['rm', short],
        ],
        'its held process stopped, and the session removed',
      );
      assert.equal(
        claude.rows().some((r) => r.sessionId.startsWith(short)),
        false,
        'no longer listed',
      );
      assert.equal((await Effect.runPromise(engine.forget([bad], { yes: true }))).forgotten, true);
    });
  },
);

test(
  'REFUSED: a stop asked while a background session is unread settles its task once the session reads as ended, and it is forgotten',
  WAITED,
  async (t: TestContext) => {
    const claude = fakeClaude();
    await onPath(claude.bin, async () => {
      const { clock, engine, transcriptOf } = shiftedEngine(claude);
      const id = await Effect.runPromise(engine.file({ brief: 'Write the word.', cwd: tmp('cwd') }));
      await Effect.runPromise(engine.tick());
      const [row] = claude.rows();
      transcriptOf(row.sessionId);
      failingReads(t, claudeFile(row.sessionId)).fails('EIO');

      assert.ok(unreadIn(await Effect.runPromise(engine.tick())) >= 1, 'unread');
      await Effect.runPromise(engine.stop(id));
      for (const pass of [1, 2]) {
        await Effect.runPromise(engine.tick());
        assert.equal((await Effect.runPromise(engine.view(id))).state.settled, null, `pass ${pass}: unsettled while it is unread`);
      }

      clock.shift += QUIESCENT_AFTER_MS;
      assert.ok((await settledOf(t, engine, id)).settled, 'settled');
      assert.equal((await Effect.runPromise(engine.forget([id], { yes: true }))).forgotten, true);
    });
  },
);

test("REFUSED: at shipped defaults, a background task whose transcript does not decode carries why on its task's view — the pass's, list's and view's — in the harness's words, and loses it on the first look that reads the transcript", async () => {
  const claude = fakeClaude();
  await onPath(claude.bin, async () => {
    const engine = builtEngine(Engine.layer({ root: tmp('root') }));
    const id = await Effect.runPromise(engine.file({ brief: 'the prompt', cwd: tmp('cwd'), config: { background: true } }));
    await Effect.runPromise(engine.tick());
    const [row] = claude.rows();
    assert.equal(row.state, 'working', 'listed working and idle, its transcript fresh: it has not ended');
    const lines = claudeLines(row.sessionId);
    const call = lines.findIndex((l) => JSON.stringify(l).includes('StructuredOutput'));
    writeClaude(row.sessionId, claudeWith(row.sessionId, call, { timestamp: 'yesterday' }));
    const words = [`\`ae/${id}/1\`'s transcript cannot be read`, `is an \`assistant\` line whose \`timestamp\` is "yesterday"`];

    const pass = (await Effect.runPromise(engine.tick())).views.find((v) => v.id === id);
    const listed = (await Effect.runPromise(engine.list([id]))).views[0];
    const viewed = await Effect.runPromise(engine.view(id));
    for (const [where, v] of [
      ['pass', pass],
      ['list', listed],
      ['view', viewed],
    ] as const) {
      assert.equal(v?.state.settled, null, `${where}: unread, never settled`);
      for (const said of words) assert.ok(v?.unreadWhy?.includes(said), `${where}: ${v?.unreadWhy}`);
    }

    writeClaude(row.sessionId, jsonl(lines.slice(0, call)));
    const later = new Date(fs.statSync(claudeFile(row.sessionId)).mtimeMs + 5_000);
    fs.utimesSync(claudeFile(row.sessionId), later, later);
    const read = (await Effect.runPromise(engine.tick())).views.find((v) => v.id === id);
    assert.ok(read, 'still in flight');
    assert.equal(Object.hasOwn(read, 'unreadWhy'), false, `the pass that reads it says nothing: ${read.unreadWhy}`);
    assert.equal(Object.hasOwn((await Effect.runPromise(engine.list([id]))).views[0], 'unreadWhy'), false, 'nor does list');
    assert.equal(Object.hasOwn(await Effect.runPromise(engine.view(id)), 'unreadWhy'), false, 'nor does view');
  });
});

test("a `user` line's own origin is carried: words a person wrote into the session itself say `human`, and words the host pushed on its input say nothing", () => {
  const line = (origin?: object) => ({
    parentUuid: null,
    isSidechain: false,
    type: 'user',
    uuid: 'said',
    timestamp: at(0),
    sessionId: 's',
    ...(origin ? { origin } : {}),
    message: { role: 'user', content: 'what is left to land?' },
  });
  assert.deepEqual(claudeTranscriptEvents(line({ kind: 'human', from: 'web' }), 0), [
    { id: 'said:0', at: at(0), role: 'user', kind: 'text', text: 'what is left to land?', origin: { kind: 'human' } },
  ]);
  assert.deepEqual(
    claudeTranscriptEvents(line(), 0),
    [{ id: 'said:0', at: at(0), role: 'user', kind: 'text', text: 'what is left to land?' }],
    'a line with no origin says none: the host that pushed the words knows it did',
  );
  assert.deepEqual(
    claudeTranscriptEvents({ ...line({ kind: 'human' }), message: { role: 'user', content: [{ type: 'text', text: 'and this?' }] } }, 0),
    [{ id: 'said:0', at: at(0), role: 'user', kind: 'text', text: 'and this?', origin: { kind: 'human' } }],
    'and a line written in blocks carries it onto each',
  );
  assert.deepEqual(
    claudeTranscriptEvents({ ...line({ kind: 'human' }), isMeta: true }, 0).map((e) => e.origin),
    [undefined],
    "a line the harness itself put in is the system's, and carries no origin of a person",
  );
});

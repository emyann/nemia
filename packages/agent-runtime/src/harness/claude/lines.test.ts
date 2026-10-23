/**
 * Claude Code's transcript lines as they enter (`decodeLine`, `lineOf` and `writtenAt` in `harness/claude/lines.ts`): each line of
 * a kind the runtime reads decoded, every other line passed over undecoded, and a line refused in words that name where it is, its
 * kind, its first wrong field and the fix. The fixtures are shaped as this machine's transcripts are; the refusals as the readers
 * give them are `test/transcript.test.ts`'s, `test/completion.test.ts`'s and `test/usage.test.ts`'s.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeLine, type LineKind, LINES, lineOf, writtenAt } from './lines.ts';

const KINDS = Object.keys(LINES) as LineKind[];
const WHERE = 'line 3 of the transcript';
const AT = '2026-09-30T05:05:34.253Z';
const SAID = { parentUuid: 'p', isSidechain: false, userType: 'external', uuid: 'u-1', timestamp: AT, sessionId: 's', version: '2.1.270' };

const USER = {
  ...SAID,
  type: 'user',
  message: {
    role: 'user',
    content: [
      { type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok', is_error: false },
      {
        type: 'tool_result',
        tool_use_id: 'toolu_2',
        content: [
          { type: 'text', text: 'shot' },
          { type: 'image', source: {} },
        ],
      },
      { type: 'text', text: 'carry on' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AA==' } },
    ],
  },
};
const ASSISTANT = {
  ...SAID,
  type: 'assistant',
  requestId: 'req_1',
  message: {
    id: 'msg_1',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: [
      { type: 'thinking', thinking: '', signature: 'sig' },
      { type: 'redacted_thinking', data: 'x' },
      { type: 'text', text: 'Writing it now.' },
      { type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'ls' }, caller: { type: 'direct' } },
      { type: 'fallback', from: {}, to: {} },
    ],
    usage: {
      input_tokens: 3,
      cache_creation_input_tokens: 1200,
      cache_read_input_tokens: 18000,
      output_tokens: 40,
      service_tier: 'standard',
    },
  },
};
const SYSTEM = {
  ...SAID,
  type: 'system',
  subtype: 'compact_boundary',
  content: 'Conversation compacted',
  isMeta: false,
  compactMetadata: { trigger: 'auto', preTokens: 83770, postTokens: 17465, durationMs: 1, preservedSegment: {} },
};
const ATTACHMENT = {
  ...SAID,
  type: 'attachment',
  attachment: {
    type: 'queued_command',
    prompt: 'the words',
    source_uuid: 'x',
    commandMode: 'prompt',
    origin: { kind: 'peer', from: 'unknown' },
  },
};
const COST = {
  type: 'cost-state',
  sessionId: 's',
  totalCostUSD: 4.1704,
  totalAPIDuration: 900,
  totalToolDuration: 10,
  totalDuration: 1,
  startTime: 1_758_000_000_000,
  hasUnknownModelCost: false,
  modelUsage: {
    'claude-opus-5-5': {
      inputTokens: 10,
      outputTokens: 5,
      cacheReadInputTokens: 1000,
      cacheCreationInputTokens: 100,
      costUSD: 0.5,
      thinkingTokens: 0,
      webSearchRequests: 0,
    },
  },
};
const NAME = { type: 'agent-name', agentName: 'ae/t/1', sessionId: 's' };

type Row = { name: string; holds: () => void };

/** The words `entry` is refused in, read at `WHERE` as one of every kind. */
const wrong = (entry: unknown): string => {
  const read = decodeLine(entry, KINDS, WHERE);
  assert.ok(read && 'wrong' in read, `${JSON.stringify(entry)} was taken`);
  return read.wrong;
};

/** `entry`, read as one of every kind, decoded: the line. */
const decoded = (entry: { type: string }) => {
  const read = decodeLine(entry, KINDS, WHERE);
  assert.ok(read && 'line' in read, read && 'wrong' in read ? read.wrong : `${entry.type} was passed over`);
  return read.line;
};

/** Each of `pieces` found in `message`, each after the one before it. */
const inOrder = (message: string, pieces: string[]) => {
  let from = 0;
  for (const piece of pieces) {
    const at = message.indexOf(piece, from);
    assert.ok(at >= 0, `${piece} after character ${from} of: ${message}`);
    from = at + piece.length;
  }
};

/** The names the fix every refusal ends with needs: the program to run, and the file whose schema reads the line. */
const FIX_NAMES = ['run a Claude Code', '`harness/claude/lines.ts`'];

/** What `entry` holds at the dotted `field`, as a row's name says it. */
const found = (entry: unknown, field: string): string => {
  const value = field.split('.').reduce<unknown>((at, key) => (at as Record<string, unknown> | null | undefined)?.[key], entry);
  return value === undefined ? 'missing' : JSON.stringify(value);
};

const REFUSED = [
  [{ ...USER, timestamp: 'yesterday' }, 'timestamp'],
  [{ ...USER, timestamp: 1_758_000_000_000 }, 'timestamp'],
  [{ ...USER, uuid: 7 }, 'uuid'],
  [{ ...USER, isMeta: 'true' }, 'isMeta'],
  [{ ...USER, isSidechain: 1 }, 'isSidechain'],
  [{ type: 'user' }, 'message'],
  [{ type: 'user', message: null }, 'message'],
  [{ type: 'user', message: { content: 7 } }, 'message.content'],
  [{ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 1 }] } }, 'message.content.0.tool_use_id'],
  [{ type: 'user', message: { content: [{ type: 'tool_result', is_error: 'no' }] } }, 'message.content.0.is_error'],
  [
    { type: 'user', message: { content: [{ type: 'tool_result', content: [{ type: 'text', text: 4 }] }] } },
    'message.content.0.content.0.text',
  ],
  [{ type: 'user', message: { content: [{ type: 'tool_result', content: 4 }] } }, 'message.content.0.content'],
  [
    {
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'a' },
          { type: 'tool_use', id: 7, name: 'Bash' },
        ],
      },
    },
    'message.content.1.id',
  ],
  [{ type: 'assistant', message: { content: [{ type: 'tool_use', name: ['Bash'] }] } }, 'message.content.0.name'],
  [{ type: 'assistant', message: { content: [{ type: 'text', text: null }] } }, 'message.content.0.text'],
  [{ type: 'assistant', message: { content: [{ type: 'thinking', thinking: 3 }] } }, 'message.content.0.thinking'],
  [{ type: 'assistant', message: { content: [{ text: 'no type' }] } }, 'message.content.0.type'],
  [{ type: 'assistant', message: { id: 1 } }, 'message.id'],
  [{ type: 'assistant', message: { usage: { input_tokens: -1 } } }, 'message.usage.input_tokens'],
  [{ type: 'assistant', message: { usage: { input_tokens: '12' } } }, 'message.usage.input_tokens'],
  [{ type: 'assistant', message: { usage: { output_tokens: 1.5 } } }, 'message.usage.output_tokens'],
  [{ type: 'assistant', message: { usage: { input_tokens: null } } }, 'message.usage.input_tokens'],
  [{ type: 'assistant', message: { usage: { cache_creation_input_tokens: -1 } } }, 'message.usage.cache_creation_input_tokens'],
  [{ type: 'assistant', message: { usage: { cache_read_input_tokens: '9' } } }, 'message.usage.cache_read_input_tokens'],
  [{ type: 'system', subtype: 4 }, 'subtype'],
  [{ type: 'system', content: ['compacted'] }, 'content'],
  [{ type: 'system', compactMetadata: { preTokens: '83770' } }, 'compactMetadata.preTokens'],
  [{ type: 'attachment', attachment: { type: 'queued_command', prompt: 'p', origin: { kind: 3 } } }, 'attachment.origin.kind'],
  [{ type: 'attachment', attachment: { type: 'queued_command', prompt: 12 } }, 'attachment.prompt'],
  [{ type: 'attachment', attachment: { type: 'queued_command', commandMode: true } }, 'attachment.commandMode'],
  [{ type: 'attachment', attachment: { type: 7 } }, 'attachment.type'],
  [{ type: 'cost-state', modelUsage: { 'claude-x': { inputTokens: '3' } } }, 'modelUsage.claude-x.inputTokens'],
  [{ type: 'cost-state', modelUsage: { 'claude-x': { outputTokens: -2 } } }, 'modelUsage.claude-x.outputTokens'],
  [{ type: 'cost-state', modelUsage: { 'claude-x': { cacheReadInputTokens: 0.5 } } }, 'modelUsage.claude-x.cacheReadInputTokens'],
  [
    { type: 'cost-state', modelUsage: { 'claude-x': { cacheCreationInputTokens: 'none' } } },
    'modelUsage.claude-x.cacheCreationInputTokens',
  ],
  [{ type: 'cost-state', modelUsage: [] }, 'modelUsage'],
  [{ type: 'cost-state', totalCostUSD: '4.17' }, 'totalCostUSD'],
  [{ type: 'cost-state', totalAPIDuration: null }, 'totalAPIDuration'],
  [{ type: 'cost-state', totalToolDuration: '10' }, 'totalToolDuration'],
  [{ type: 'cost-state', startTime: 'then' }, 'startTime'],
  [{ type: 'cost-state', hasUnknownModelCost: 'false' }, 'hasUnknownModelCost'],
  [{ type: 'agent-name', agentName: 3 }, 'agentName'],
] as const;

const BARE = [
  { type: 'user', message: {} },
  { type: 'assistant', message: {} },
  { type: 'assistant', message: { usage: { cache_creation_input_tokens: null, cache_read_input_tokens: null } } },
  { type: 'system' },
  { type: 'attachment' },
  { type: 'attachment', attachment: { type: 'queued_command' } },
  {
    type: 'attachment',
    attachment: {
      type: 'queued_command',
      prompt: [
        { type: 'text', text: 'a' },
        { type: 'image', source: {} },
      ],
    },
  },
  { type: 'cost-state' },
  { type: 'cost-state', modelUsage: { m: {} } },
  { type: 'agent-name' },
];

const DECODE_ROWS: Row[] = [
  ...[USER, ASSISTANT, SYSTEM, ATTACHMENT, COST, NAME].map((entry) => ({
    name: `a \`${entry.type}\` line as Claude Code writes it decodes, as its own kind`,
    holds: () => assert.equal(decoded(entry).type, entry.type),
  })),
  ...BARE.map((entry) => ({
    name: `a line decodes with every optional field absent: ${JSON.stringify(entry)}`,
    holds: () => assert.equal(decoded(entry).type, entry.type),
  })),
  {
    name: 'a `tool_use` block keeps its id, its name and its input, and nothing the runtime does not read',
    holds: () => {
      const line = decoded(ASSISTANT);
      assert.ok(line.type === 'assistant');
      assert.deepEqual(line.message.content?.[3], { type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'ls' } });
    },
  },
  ...REFUSED.map(([entry, field]) => ({
    name: `REFUSED: ${entry.type.startsWith('a') ? 'an' : 'a'} \`${entry.type}\` line whose \`${field}\` is ${found(entry, field)}, by its line, its kind and its field, with the fix`,
    holds: () => {
      const message = wrong(entry);
      const a = entry.type.startsWith('a') ? 'an' : 'a';
      assert.ok(message.startsWith(`${WHERE} is ${a} \`${entry.type}\` line whose \`${field}\` `), `${field}: ${message}`);
      assert.ok(message.includes('`harness/claude/lines.ts`'), `the fix is named: ${message}`);
    },
  })),
  {
    name: 'REFUSED: the refusal says what is there and what Claude Code writes, then the fix, or that the field is missing',
    holds: () => {
      const message = wrong({ ...USER, timestamp: 'yesterday' });
      assert.ok(message.startsWith(`${WHERE} is a \`user\` line whose \`timestamp\` `), message);
      inOrder(message, ['is "yesterday", where Claude Code writes a date and time. ', ...FIX_NAMES]);
      assert.ok(wrong({ type: 'user' }).startsWith(`${WHERE} is a \`user\` line whose \`message\` is missing.`));
    },
  },
  {
    name: 'REFUSED: a value is quoted to at most 60 characters, however large',
    holds: () => {
      const huge = wrong({ type: 'agent-name', agentName: ['x'.repeat(500)] });
      assert.ok(huge.includes(`is ["${'x'.repeat(58)}…`), huge);
      assert.ok(!huge.includes('x'.repeat(61)), 'cut at 60');
    },
  },
];

test('decodeLine: each kind the runtime reads decodes as Claude Code writes it and with every optional field absent, and a field there in a shape it does not read is refused by its line, its kind, its field and the fix', async (t) => {
  for (const row of DECODE_ROWS) await t.test(row.name, row.holds);
});

const MALFORMED = JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: -1 } } });

const READ_ROWS: Row[] = [
  ...[
    '{"type":"assistant","message":{"id":"msg_1","usage":{"input_tok',
    'not JSON at all',
    '["assistant"]',
    '"assistant"',
    'null',
    '{"type":3}',
    JSON.stringify({ type: 'file-history-snapshot', timestamp: 'never', snapshot: 7 }),
    JSON.stringify({ type: 'summary', summary: 3, leafUuid: 4 }),
    JSON.stringify({ type: 'custom-title', customTitle: 1 }),
  ].map((text) => ({
    name: `lineOf passes undecoded a line torn mid-write, no JSON object, or of a type the reader does not read: ${text}`,
    holds: () => assert.equal(lineOf(text, KINDS, WHERE), undefined, text),
  })),
  {
    name: 'lineOf checks only the kinds its reader reads: another reader passes the line, the reader of its kind refuses it, and a line that decodes is read',
    holds: () => {
      assert.equal(lineOf(MALFORMED, ['cost-state', 'agent-name'], WHERE), undefined, 'a reader checks only the kinds it reads');
      assert.throws(
        () => lineOf(MALFORMED, ['assistant'], WHERE),
        (e: Error) => e.message.startsWith(`${WHERE} is an \`assistant\` line whose \`message.usage.input_tokens\` is -1`),
        'the reader of that kind refuses it',
      );
      assert.deepEqual(lineOf(JSON.stringify(NAME), ['agent-name'], WHERE), { type: 'agent-name', agentName: 'ae/t/1' });
    },
  },
  {
    name: "writtenAt reads a line's time on a kind the runtime reads and on any other, and none where there is none or the line is torn",
    holds: () => {
      assert.equal(writtenAt(JSON.stringify(USER), WHERE), Date.parse(AT));
      assert.equal(writtenAt(JSON.stringify({ type: 'file-history-snapshot', timestamp: AT }), WHERE), Date.parse(AT));
      assert.equal(writtenAt(JSON.stringify({ type: 'file-history-snapshot', timestamp: 'never' }), WHERE), undefined);
      assert.equal(writtenAt(JSON.stringify({ type: 'user', message: {} }), WHERE), undefined, 'no time: none');
      assert.equal(writtenAt('{"type":"user","timestamp":"2026-09-30T05:05', WHERE), undefined, 'torn: none');
      assert.equal(writtenAt(JSON.stringify({ ...USER, message: 7 }), WHERE), Date.parse(AT), 'only the time is checked here');
    },
  },
  {
    name: 'REFUSED: writtenAt refuses a time that is no date and time on a kind the runtime reads, by its line, its kind and its field',
    holds: () => {
      assert.throws(
        () => writtenAt(JSON.stringify({ ...USER, timestamp: 'yesterday' }), WHERE),
        (e: Error) => {
          assert.ok(e.message.startsWith(`${WHERE} is a \`user\` line whose \`timestamp\` `), e.message);
          inOrder(e.message, ['is "yesterday", where Claude Code writes a date and time. ', ...FIX_NAMES]);
          return true;
        },
      );
    },
  },
];

test("lineOf and writtenAt: a line torn, no JSON object or of another type passes undecoded, a reader checks only its own kinds, and a line's time is checked where its kind is one the runtime reads", async (t) => {
  for (const row of READ_ROWS) await t.test(row.name, row.holds);
});

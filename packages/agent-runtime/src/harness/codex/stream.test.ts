/**
 * What a Codex session prints under `codex exec --json` as it enters (`codexEventsOf` in `harness/codex/stream.ts`): each event
 * of a type the runtime reads decoded strictly, every other line passed over undecoded, and a stream refused in words that name
 * the line, the event, the first wrong field and the fix. Pure, so each rule is a stream here; the refusal as `observe` gives it
 * is `test/detached.test.ts`'s.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codexEventsOf, codexOutput } from './stream.ts';

const stream = (...lines: Array<object | string>) =>
  ['Reading additional input from stdin...', ...lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l)))].join('\n');
const THREAD = { type: 'thread.started', thread_id: '01a09996-d343-7932-8971-b2f209ba315b' };
const TURN = { type: 'turn.started' };
const USED = { input_tokens: 1200, cached_input_tokens: 1000, cache_write_input_tokens: 0, output_tokens: 80, reasoning_output_tokens: 8 };
const completed = (usage: unknown = USED) => ({ type: 'turn.completed', usage });
const item = (phase: 'started' | 'completed', value: unknown) => ({ type: `item.${phase}`, item: value });

const wrong = (output: string): string => {
  const read = codexEventsOf(output);
  assert.ok('wrong' in read, `${output} was taken`);
  return read.wrong;
};

test('a stream decodes into the events the runtime reads, in order, each as Codex printed it', () => {
  const read = codexEventsOf(
    stream(
      THREAD,
      TURN,
      item('started', { id: 'item_1', type: 'command_execution', command: 'ls', status: 'in_progress' }),
      item('completed', { id: 'item_1', type: 'command_execution', exit_code: 0 }),
      completed(),
    ),
  );
  assert.ok('events' in read, 'wrong' in read ? read.wrong : '');
  assert.deepEqual(
    read.events.map((e) => e.type),
    ['turn.started', 'item.started', 'item.completed', 'turn.completed'],
  );
  const [, started, , turn] = read.events;
  assert.deepEqual(started?.type === 'item.started' && started.item, { id: 'item_1', type: 'command_execution' });
  assert.deepEqual(turn?.type === 'turn.completed' && turn.usage, USED);
});

test('a line of a type the runtime does not read, or no JSON object, passes undecoded', () => {
  const read = codexEventsOf(
    stream(
      THREAD,
      { type: 'item.updated', item: { id: 7 } },
      { type: 'turn.failed', error: { message: 'boom' } },
      { type: 'error', message: 'stream disconnected' },
      { type: 'turn.reshaped', usage: 'none' },
      'Error: not logged in',
      '["turn.started"]',
      '{"type": 3}',
      TURN,
      '{"type":"turn.completed","usage":{"input_tok',
    ),
  );
  assert.ok('events' in read, 'wrong' in read ? read.wrong : '');
  assert.deepEqual(read.events, [{ type: 'turn.started' }], 'a torn last line is passed over, as a write caught mid-way');
});

test('REFUSED: each field the runtime reads that is not what Codex prints, by its line, its event and its field', () => {
  for (const [event, field] of [
    [{ type: 'turn.completed' }, 'usage'],
    [completed({ cached_input_tokens: 0, output_tokens: 1 }), 'usage.input_tokens'],
    [completed({ ...USED, output_tokens: '80' }), 'usage.output_tokens'],
    [completed({ ...USED, cached_input_tokens: -1 }), 'usage.cached_input_tokens'],
    [completed({ ...USED, cache_write_input_tokens: 1.5 }), 'usage.cache_write_input_tokens'],
    [completed({ ...USED, reasoning_output_tokens: null }), 'usage.reasoning_output_tokens'],
    [{ type: 'item.completed' }, 'item'],
    [item('started', { id: '', type: 'agent_message' }), 'item.id'],
    [item('completed', { id: 'item_1', type: 3 }), 'item.type'],
  ] as const) {
    const type = event.type;
    const message = wrong(stream(THREAD, TURN, event));
    assert.ok(message.startsWith(`line 4 of the \`codex exec --json\` stream is a \`${type}\` event whose \`${field}\` `), `${field}: ${message}`);
  }
  assert.match(wrong(stream(TURN, completed({ ...USED, input_tokens: 'many' }))), /`usage\.input_tokens` is "many", where Codex prints /);
  assert.match(wrong(stream(TURN, { type: 'turn.completed' }))!, /`usage` is missing\./);
});

test('REFUSED: the first line that does not decode is the one named, and nothing after it is read', () => {
  const message = wrong(stream(TURN, item('completed', { id: '', type: 'x' }), completed({ output_tokens: 'no' })));
  assert.ok(message.startsWith('line 3 of the `codex exec --json` stream is a `item.completed` event whose `item.id` '), message);
});

test('a refusal names the fix, and says every Codex session is unread until it is made', () => {
  assert.match(
    wrong(stream(TURN, completed({}))),
    /Every Codex session stays unread, neither there nor gone, until its stream decodes: run a Codex whose `exec --json` stream this runtime reads, or a runtime whose `CodexEventSchema` \(`harness\/codex\/stream\.ts`\) reads this one\.$/,
  );
});

test('a refused value is quoted to 60 characters, however large', () => {
  const huge = 'x'.repeat(10_000);
  const message = wrong(stream(TURN, completed({ ...USED, input_tokens: huge })));
  assert.ok(message.includes(`is "${'x'.repeat(59)}…, where`), message);
  assert.ok(message.length < 500, `${message.length} characters`);
});

test('codexOutput refuses a stream that does not decode by throwing its words, and reads one that does as ever', () => {
  assert.throws(
    () => codexOutput(stream(TURN, completed({ output_tokens: 5 }))),
    (err: Error) => err.message.startsWith('line 3 of the `codex exec --json` stream is a `turn.completed` event whose `usage.input_tokens` is missing.'),
  );
  assert.deepEqual(codexOutput(stream(THREAD, TURN, completed())).usage, {
    toolCalls: 0,
    inputTokens: 1200,
    uncachedTokens: 200,
    cacheWriteTokens: 0,
    cacheReadTokens: 1000,
    outputTokens: 80,
  });
});

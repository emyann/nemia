/**
 * What a Codex session prints under `codex exec --json` as it enters (`codexEventsOf` in `harness/codex/stream.ts`): each event
 * of a type the runtime reads decoded strictly, every other line passed over undecoded, and a stream refused in words that name
 * the line, the event, the first wrong field and the fix. Pure, so each rule is a stream here; the refusal as `observe` gives it
 * is `test/detached.test.ts`'s. What it says of text being written (`codexPartials`) is nothing, its lines decoded as a follow reads
 * them: from where the last read stopped.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codexEventsOf, codexOutput, codexPartials } from './stream.ts';

const stream = (...lines: Array<object | string>) =>
  ['Reading additional input from stdin...', ...lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l)))].join('\n');
const THREAD = { type: 'thread.started', thread_id: '01a09996-d343-7932-8971-b2f209ba315b' };
const TURN = { type: 'turn.started' };
const USED = { input_tokens: 1200, cached_input_tokens: 1000, cache_write_input_tokens: 0, output_tokens: 80, reasoning_output_tokens: 8 };
const completed = (usage: unknown = USED) => ({ type: 'turn.completed', usage });
const item = (phase: 'started' | 'completed', value: unknown) => ({ type: `item.${phase}`, item: value });

type Row = { name: string; holds: () => void };

const wrong = (output: string): string => {
  const read = codexEventsOf(output);
  assert.ok('wrong' in read, `${output} was taken`);
  return read.wrong;
};

/** How a refusal opens: the line, by its number in the whole output, the event's type, and its first wrong field. */
const refusing = (line: number, type: string, field: string) =>
  `line ${line} of the \`codex exec --json\` stream` + ` is a \`${type}\` event` + ` whose \`${field}\` `;

/** Each of `pieces` found in `message`, each after the one before it. */
const inOrder = (message: string, pieces: string[]) => {
  let from = 0;
  for (const piece of pieces) {
    const at = message.indexOf(piece, from);
    assert.ok(at >= 0, `${piece} after character ${from} of: ${message}`);
    from = at + piece.length;
  }
};

/** The names the fix every refusal ends with needs: the program to run, and the schema and file that read the line. */
const FIX_NAMES = ['Run a Codex', '`CodexEventSchema`', '`harness/codex/stream.ts`'];

const REFUSED = [
  [{ type: 'turn.completed' }, 'usage'],
  [completed({ cached_input_tokens: 0, output_tokens: 1 }), 'usage.input_tokens'],
  [completed({ ...USED, output_tokens: '80' }), 'usage.output_tokens'],
  [completed({ ...USED, cached_input_tokens: -1 }), 'usage.cached_input_tokens'],
  [completed({ ...USED, cache_write_input_tokens: 1.5 }), 'usage.cache_write_input_tokens'],
  [completed({ ...USED, reasoning_output_tokens: null }), 'usage.reasoning_output_tokens'],
  [{ type: 'item.completed' }, 'item'],
  [{ type: 'thread.started', thread_id: 1 }, 'thread_id'],
  [{ type: 'thread.started' }, 'thread_id'],
  [item('started', { id: '', type: 'agent_message' }), 'item.id'],
  [item('completed', { id: 'item_1', type: 3 }), 'item.type'],
] as const;

const EVENTS_ROWS: Row[] = [
  {
    name: 'a stream decodes into the events the runtime reads, in order, each as Codex printed it',
    holds: () => {
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
        ['thread.started', 'turn.started', 'item.started', 'item.completed', 'turn.completed'],
      );
      const [thread, , started, , turn] = read.events;
      assert.deepEqual(thread, THREAD);
      assert.deepEqual(started?.type === 'item.started' && started.item, { id: 'item_1', type: 'command_execution' });
      assert.deepEqual(turn?.type === 'turn.completed' && turn.usage, USED);
    },
  },
  {
    name: 'a line of a type the runtime does not read, or no JSON object, passes undecoded, and a torn last line too',
    holds: () => {
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
      assert.deepEqual(read.events, [THREAD, { type: 'turn.started' }], 'a torn last line is passed over, as a write caught mid-way');
    },
  },
  ...REFUSED.map(([event, field]) => ({
    name: `REFUSED: ${JSON.stringify(event)}, by its line, its event and its field \`${field}\``,
    holds: () => {
      const message = wrong(stream(THREAD, TURN, event));
      assert.ok(message.startsWith(refusing(4, event.type, field)), `${field}: ${message}`);
    },
  })),
  {
    name: 'REFUSED: the refusal says what is there and what Codex prints, or that it is missing',
    holds: () => {
      assert.match(
        wrong(stream(TURN, completed({ ...USED, input_tokens: 'many' }))),
        /`usage\.input_tokens` is "many", where Codex prints /,
      );
      assert.match(wrong(stream(TURN, { type: 'turn.completed' })), /`usage` is missing\./);
    },
  },
  {
    name: 'REFUSED: the first line that does not decode is the one named, and nothing after it is read',
    holds: () => {
      const message = wrong(stream(TURN, item('completed', { id: '', type: 'x' }), completed({ output_tokens: 'no' })));
      assert.ok(message.startsWith(refusing(3, 'item.completed', 'item.id')), message);
    },
  },
  {
    name: 'REFUSED: a refusal ends with the fix, naming the schema and its file, and claims nothing of the other Codex sessions, which the runner reads',
    holds: () => {
      const message = wrong(stream(TURN, completed({})));
      assert.ok(message.includes('`usage.input_tokens` is missing. Run a Codex'), message);
      inOrder(message, FIX_NAMES);
      assert.doesNotMatch(message, /unread/i);
    },
  },
  {
    name: 'a refused value is quoted to 60 characters, however large',
    holds: () => {
      const huge = 'x'.repeat(10_000);
      const message = wrong(stream(TURN, completed({ ...USED, input_tokens: huge })));
      assert.ok(message.includes(`is "${'x'.repeat(59)}…, where`), message);
      assert.ok(message.length < 500, `${message.length} characters`);
    },
  },
  {
    name: 'REFUSED: a thread.started whose thread_id is a number, by its line and its field, saying what is there',
    holds: () => {
      const message = wrong(stream({ type: 'thread.started', thread_id: 1 }, TURN));
      assert.ok(message.startsWith(`${refusing(2, 'thread.started', 'thread_id')}is 1, where Codex prints `), message);
    },
  },
];

test('codexEventsOf: a stream decodes into the events the runtime reads, in order, passes every other line, and is refused at its first line that does not decode, by its line, its event, its field and the fix', async (t) => {
  for (const row of EVENTS_ROWS) await t.test(row.name, row.holds);
});

const OUTPUT_ROWS: Row[] = [
  {
    name: 'codexOutput reads a stream that decodes as ever',
    holds: () =>
      assert.deepEqual(codexOutput(stream(THREAD, TURN, completed())).usage, {
        toolCalls: 0,
        inputTokens: 1200,
        uncachedTokens: 200,
        cacheWriteTokens: 0,
        cacheReadTokens: 1000,
        outputTokens: 80,
      }),
  },
  {
    name: 'REFUSED: codexOutput refuses a stream that does not decode by throwing its words',
    holds: () =>
      assert.throws(
        () => codexOutput(stream(TURN, completed({ output_tokens: 5 }))),
        (err: Error) => err.message.startsWith(`${refusing(3, 'turn.completed', 'usage.input_tokens')}is missing.`),
      ),
  },
  {
    name: 'codexPartials marks nothing in a stream that decodes, its messages printed whole, and passes a torn line and another type',
    holds: () => {
      const read = codexPartials(
        stream(THREAD, TURN, item('completed', { id: 'item_0', type: 'agent_message', text: 'Done.' }), completed(), '{"type":"turn.com', {
          type: 'error',
        }),
        0,
      );
      assert.deepEqual(read, { marks: [] });
    },
  },
  {
    name: 'REFUSED: codexPartials refuses a line that does not decode by its number in the whole output, past the lines read before',
    holds: () => {
      const read = codexPartials([JSON.stringify(TURN), JSON.stringify(completed({ ...USED, output_tokens: 'many' }))].join('\n'), 5);
      assert.ok('wrong' in read, 'a turn.completed whose output_tokens is a string was taken');
      assert.ok(read.wrong.startsWith(refusing(7, 'turn.completed', 'usage.output_tokens')), read.wrong);
    },
  },
];

test('codexOutput and codexPartials: what a session consumed read off a stream that decodes, nothing marked as being written, and a stream that does not decode refused in codexEventsOf’s words', async (t) => {
  for (const row of OUTPUT_ROWS) await t.test(row.name, row.holds);
});

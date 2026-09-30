/**
 * What a Codex session prints on stdout under `codex exec --json` as it enters the runtime: each event of a type the runtime
 * reads decoded by `CodexEventSchema` where it is read, and what the session consumed read off the decoded events (`codexOutput`).
 * Only a line that parses as a JSON object whose `type` is one the runtime reads is decoded; stderr the worker captures beside it,
 * a line torn mid-write, and an event of any other type pass undecoded.
 *
 * The stream is refused as a whole at the first line of a type the runtime reads that does not decode: one Codex binary prints
 * every session's stream, so an event printed otherwise says its format moved under every session. A refused stream is no absence:
 * `observe` fails, and each Codex session stays unread.
 */
import { Result, Schema } from 'effect';
import { firstRefusal, type Usage } from '../../core/index.ts';
import type { HarnessOutput } from '../detached/detached.ts';

const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

const TurnStartedSchema = Schema.Struct({ type: Schema.Literal('turn.started') });

/** A prompt run to completion, with what it consumed; `cached_input_tokens` is a part of `input_tokens`, reasoning of output. */
const TurnCompletedSchema = Schema.Struct({
  type: Schema.Literal('turn.completed'),
  usage: Schema.Struct({
    input_tokens: Count,
    cached_input_tokens: Count,
    output_tokens: Count,
    cache_write_input_tokens: Schema.optional(Count),
    reasoning_output_tokens: Schema.optional(Count),
  }),
});

const ItemSchema = Schema.Struct({ id: Schema.NonEmptyString, type: Schema.NonEmptyString });

const ItemStartedSchema = Schema.Struct({ type: Schema.Literal('item.started'), item: ItemSchema });

const ItemCompletedSchema = Schema.Struct({ type: Schema.Literal('item.completed'), item: ItemSchema });

/** The events of a Codex `exec --json` stream the runtime reads, in what it reads of each. A field it starts reading is added here. */
export const CodexEventSchema = Schema.Union([TurnStartedSchema, TurnCompletedSchema, ItemStartedSchema, ItemCompletedSchema]);

/** An event of a Codex stream as `CodexEventSchema` decodes it. */
export type CodexEvent = typeof CodexEventSchema.Type;

const DECODERS: Readonly<Record<string, (line: unknown) => Result.Result<CodexEvent, Schema.SchemaError>>> = Object.fromEntries(
  CodexEventSchema.members.map((m) => [m.fields.type.literal, Schema.decodeUnknownResult(m)]),
);

const UNREAD =
  'Every Codex session stays unread, neither there nor gone, until its stream decodes: run a Codex whose `exec --json` stream' +
  ' this runtime reads, or a runtime whose `CodexEventSchema` (`harness/codex/stream.ts`) reads this one.';

/** The object `line` holds when it is one whose `type` the runtime reads, or `undefined` for any other line. */
const ours = (line: string): (Record<string, unknown> & { type: string }) | undefined => {
  if (!line.includes('"type"')) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
  const { type } = parsed as { type?: unknown };
  return typeof type === 'string' && Object.hasOwn(DECODERS, type) ? (parsed as Record<string, unknown> & { type: string }) : undefined;
};

/**
 * The events the runtime reads in what `codex exec --json` printed, decoded, in the order printed; or why the stream is refused
 * (`wrong`, a sentence that names the line, the event, its first wrong field and the fix, and quotes at most 60 characters of
 * what it found there).
 */
export const codexEventsOf = (output: string): { events: CodexEvent[] } | { wrong: string } => {
  const events: CodexEvent[] = [];
  const lines = output.split('\n');
  for (const [at, line] of lines.entries()) {
    const event = ours(line);
    if (!event) continue;
    const decoded = DECODERS[event.type]!(event);
    if (Result.isSuccess(decoded)) {
      events.push(decoded.success);
      continue;
    }
    const { path, words } = firstRefusal(event, decoded.failure, 'Codex prints');
    const field = path.map(String).join('.');
    return {
      wrong: `line ${at + 1} of the \`codex exec --json\` stream is a \`${event.type}\` event whose \`${field}\` ${words}. ${UNREAD}`,
    };
  }
  return { events };
};

/**
 * The item types a Codex `exec --json` stream carries: two that are tool calls and one that is said.
 * Any other type cannot be counted either way, so a stream that has one reports no count of tool calls
 * rather than a guessed one.
 */
const CODEX_CALL_ITEMS: readonly string[] = ['command_execution', 'file_change'];
const CODEX_SAID_ITEMS: readonly string[] = ['agent_message'];

type Turn = { input?: number; read?: number; output: number };

/**
 * One completed turn's counts: its input unless it wrote to the cache, since whether `input_tokens` counts those writes is not
 * known; its cache reads when they are a part of that input and it wrote nothing; and its output.
 */
const turnOf = ({ usage }: typeof TurnCompletedSchema.Type): Turn => ({
  input: usage.cache_write_input_tokens ? undefined : usage.input_tokens,
  ...(usage.cached_input_tokens <= usage.input_tokens && usage.cache_write_input_tokens === 0 ? { read: usage.cached_input_tokens } : {}),
  output: usage.output_tokens,
});

/**
 * What a Codex session consumed, read from its `exec --json` stream — measured or absent, never zeros.
 *
 * Tokens come from `turn.completed`, one per prompt run to completion, and only when every turn that
 * started completed: a session killed mid-turn has not reported its last one. Nothing is
 * added to `input_tokens` or `output_tokens`: `cached_input_tokens` is read as a part of the first and
 * `reasoning_output_tokens` as a part of the second, not beside them. Whether `input_tokens` counts
 * `cache_write_input_tokens` is not known, so a stream where it is not 0 gives no input count. Tool calls
 * are the call items, counted once by id. No `turns` — it counts model responses, which the stream does not
 * report — and no cost.
 *
 * The input's classes follow from the same counts: `cached_input_tokens` read from the cache, the rest of `input_tokens`
 * uncached, and `cache_write_input_tokens` — 0, as the stream says — written. No peak: a `turn.completed` totals every
 * response of a prompt, and the stream reports none alone (the rollout's `token_count` events do; not read here).
 *
 * Throws an `Error` whose message is `codexEventsOf`'s `wrong` when the stream does not decode: its output is refused, never
 * read as saying nothing.
 */
export const codexOutput = (output: string): HarnessOutput => {
  const read = codexEventsOf(output);
  if ('wrong' in read) throw new Error(read.wrong);
  let started = 0;
  const completed: Turn[] = [];
  const calls = new Set<string>();
  let uncounted = false;
  for (const event of read.events) {
    if (event.type === 'turn.started') started++;
    else if (event.type === 'turn.completed') completed.push(turnOf(event));
    else if (CODEX_CALL_ITEMS.includes(event.item.type)) calls.add(event.item.id);
    else if (!CODEX_SAID_ITEMS.includes(event.item.type)) uncounted = true;
  }
  if (started === 0 && completed.length === 0) return {};
  const turns = completed.length === started ? completed : undefined;
  const sum = (key: 'input' | 'read') => turns!.reduce((n, t) => n + t[key]!, 0);
  const usage: Usage = {
    ...(uncounted ? {} : { toolCalls: calls.size }),
    ...(turns?.every((t) => t.input !== undefined) ? { inputTokens: sum('input') } : {}),
    ...(turns?.every((t) => t.input !== undefined && t.read !== undefined)
      ? { uncachedTokens: sum('input') - sum('read'), cacheWriteTokens: 0, cacheReadTokens: sum('read') }
      : {}),
    ...(turns ? { outputTokens: turns.reduce((n, t) => n + t.output, 0) } : {}),
  };
  return Object.keys(usage).length ? { usage } : {};
};

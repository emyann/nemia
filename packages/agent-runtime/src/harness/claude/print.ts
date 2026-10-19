/**
 * What `claude -p` prints on stdout as it enters the runtime, `--output-format json` and `stream-json` alike: each line of a kind the
 * runtime reads decoded by its schema here (`PRINTED`), where a reader reads it. Only a line that parses as a JSON object of a kind
 * the reader reads is decoded; stderr the worker captures beside it, a line torn mid-write, a line of any other type, and a `system`
 * line of any other subtype pass undecoded.
 *
 * An absent field means what it always has to the reader. A field that is there has the shape the runtime reads, or the output is
 * refused as a whole, at its first line that does not decode, with words that name the line, its kind, its first wrong field and the
 * fix (`printedLinesOf`): one Claude Code binary prints every session's output, so a line printed otherwise says its format moved,
 * and a refused output is never read as saying nothing.
 */
import { Result, Schema } from 'effect';
import { firstRefusal } from '../../core/index.ts';
import type { PartialMark } from '../detached/follow.ts';

const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

const Measure = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));

/** A block whose `type` is none of `known`: only its `type` is checked. */
const otherThan = (known: readonly string[]) =>
  Schema.Struct({
    type: Schema.String.check(Schema.makeFilter((t: string) => !known.includes(t) || `Expected the fields of a ${t} block`)),
  });

/** A call the assistant makes: its id, which a denial names, its tool, and the input it was called with. */
const ToolUseBlock = Schema.Struct({
  type: Schema.Literal('tool_use'),
  id: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  input: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
});

/** A message begun, under `--include-partial-messages`: its id, the one its whole `assistant` lines carry. */
const StartEvent = Schema.Struct({
  type: Schema.Literal('message_start'),
  message: Schema.Struct({ id: Schema.NonEmptyString }),
});

/** A piece of a block being written: the block's place in its message, and its text when it is text. */
const DeltaEvent = Schema.Struct({
  type: Schema.Literal('content_block_delta'),
  index: Count,
  delta: Schema.Union([Schema.Struct({ type: Schema.Literal('text_delta'), text: Schema.String }), otherThan(['text_delta'])]),
});

/** A block written whole, by its place in its message. */
const StopEvent = Schema.Struct({ type: Schema.Literal('content_block_stop'), index: Count });

/** A call Claude Code refused without asking: its tool, the id of its call, and the input it was called with. */
const DenialSchema = Schema.Struct({
  tool_name: Schema.NonEmptyString,
  tool_use_id: Schema.optional(Schema.String),
  tool_input: Schema.optional(Schema.Unknown),
});

/** A response's token counts, in their classes. */
const TokensSchema = Schema.Struct({
  input_tokens: Schema.optional(Count),
  cache_creation_input_tokens: Schema.optional(Count),
  cache_read_input_tokens: Schema.optional(Count),
  output_tokens: Schema.optional(Count),
});

/**
 * The lines of `claude -p`'s output the runtime reads, by kind — a `type`, and its `subtype` for a `system` line — in what it reads
 * of each; every other key is not checked. A field the runtime starts reading is added here.
 */
export const PRINTED = {
  result: Schema.Struct({
    type: Schema.Literal('result'),
    subtype: Schema.optional(Schema.String),
    structured_output: Schema.optional(Schema.Unknown),
    total_cost_usd: Schema.optional(Measure),
    duration_api_ms: Schema.optional(Measure),
    usage: Schema.optional(TokensSchema),
    permission_denials: Schema.optional(Schema.Array(DenialSchema)),
  }),
  'system permission_denied': Schema.Struct({
    type: Schema.Literal('system'),
    subtype: Schema.Literal('permission_denied'),
    tool_name: Schema.NonEmptyString,
    tool_use_id: Schema.optional(Schema.String),
  }),
  'system init': Schema.Struct({
    type: Schema.Literal('system'),
    subtype: Schema.Literal('init'),
    cwd: Schema.optional(Schema.NonEmptyString),
  }),
  stream_event: Schema.Struct({
    type: Schema.Literal('stream_event'),
    event: Schema.Union([StartEvent, DeltaEvent, StopEvent, otherThan(['message_start', 'content_block_delta', 'content_block_stop'])]),
  }),
  assistant: Schema.Struct({
    type: Schema.Literal('assistant'),
    message: Schema.Struct({
      content: Schema.Union([Schema.String, Schema.Array(Schema.Union([ToolUseBlock, otherThan(['tool_use'])]))]),
    }),
  }),
};

/** A kind of line the runtime reads: a key of `PRINTED`. */
export type PrintedKind = keyof typeof PRINTED;

/** A line of a kind the runtime reads, as its schema in `PRINTED` decodes it, with its kind. */
export type PrintedLine = { [K in PrintedKind]: { kind: K; line: (typeof PRINTED)[K]['Type'] } }[PrintedKind];

const KINDS = Object.keys(PRINTED) as PrintedKind[];

const DECODERS = Object.fromEntries(KINDS.map((k) => [k, Schema.decodeUnknownResult(PRINTED[k] as Schema.Codec<unknown>)])) as Record<
  PrintedKind,
  (line: unknown) => Result.Result<unknown, Schema.SchemaError>
>;

const FIX =
  'An output that holds it is refused, never read as saying nothing: run a Claude Code whose `claude -p` output this runtime reads,' +
  ' or a runtime whose schema for the line in `PRINTED` (`harness/claude/print.ts`) reads this one.';

/** The kind of `value` when it is a JSON object of one of `kinds`, or `undefined` for anything else. */
const kindOf = (value: unknown, kinds: readonly PrintedKind[]): PrintedKind | undefined => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const { type, subtype } = value as { type?: unknown; subtype?: unknown };
  const kind = type === 'system' && typeof subtype === 'string' ? `system ${subtype}` : type;
  return kinds.find((k) => k === kind);
};

/** The JSON object `text` holds, when it parses: `undefined` for a line torn mid-write, stderr, or prose. */
const parsed = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/**
 * The kind of the line `text`: one of `PRINTED`'s when it is a JSON object of that kind, `'other'` for a JSON object of another kind
 * or subtype, and `undefined` for a line that is no JSON object (stderr, a line torn mid-write, prose). Decodes nothing.
 */
export const printedKindOf = (text: string): PrintedKind | 'other' | undefined => {
  const value = parsed(text);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return kindOf(value, KINDS) ?? 'other';
};

/** Why `value`, a `kind` line at line `at`, is refused: the line, its kind, its first wrong field, what is there, and the fix. */
const refusal = (at: number, kind: PrintedKind, value: unknown, error: Schema.SchemaError): string => {
  const { path, words } = firstRefusal(value, error, 'Claude Code prints');
  const field = path.length ? `\`${path.map(String).join('.')}\`` : 'shape';
  const named = kind
    .split(' ')
    .map((k) => `\`${k}\``)
    .join(' ');
  return `line ${at} of the \`claude -p\` output is ${kind.startsWith('a') ? 'an' : 'a'} ${named} line whose ${field} ${words}. ${FIX}`;
};

/**
 * The lines of `kinds` in what `claude -p` printed, decoded, in the order printed: `{ lines }`; or why the output is refused
 * (`wrong`, a sentence that names the line, its kind, its first wrong field and the fix, and quotes at most 60 characters of what it
 * found there). A line is parsed only when it names one of `kinds`' types.
 */
export const printedLinesOf = (output: string, kinds: readonly PrintedKind[]): { lines: PrintedLine[] } | { wrong: string } => {
  const types = [...new Set(kinds.map((k) => `"${k.split(' ')[0]}"`))];
  const lines: PrintedLine[] = [];
  for (const [at, text] of output.split('\n').entries()) {
    if (!types.some((t) => text.includes(t))) continue;
    const value = parsed(text);
    const kind = kindOf(value, kinds);
    if (kind === undefined) continue;
    const decoded = DECODERS[kind](value);
    if (Result.isFailure(decoded)) return { wrong: refusal(at + 1, kind, value, decoded.failure) };
    lines.push({ kind, line: decoded.success } as PrintedLine);
  }
  return { lines };
};

/** A line of `kind`, as its schema in `PRINTED` decodes it. */
export type Printed<K extends PrintedKind> = (typeof PRINTED)[K]['Type'];

/**
 * What one `stream_event`'s event says of the text being written, as a follow reads it (`PartialMark`): a message begun, a piece of
 * the text block at its index, a block written whole. Read off the event's own fields, so the same reading serves a line decoded
 * from a kept stdout (`claudePartials`) and an event handed by the Agent SDK as it comes (`attached-follow.ts`).
 *
 * @returns nothing for anything else — a piece of a tool call's input among them, so a partial never carries unvalidated input
 */
export const partialMarksOf = (event: unknown): PartialMark[] => {
  const e = (event ?? {}) as { type?: unknown; index?: unknown; message?: { id?: unknown }; delta?: { type?: unknown; text?: unknown } };
  if (e.type === 'message_start' && typeof e.message?.id === 'string') return [{ begun: e.message.id }];
  if (e.type === 'content_block_stop' && typeof e.index === 'number') return [{ stopped: e.index }];
  if (e.type === 'content_block_delta' && typeof e.index === 'number' && e.delta?.type === 'text_delta' && typeof e.delta.text === 'string')
    return [{ index: e.index, text: e.delta.text }];
  return [];
};

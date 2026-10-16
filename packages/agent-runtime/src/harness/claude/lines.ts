/**
 * Claude Code's transcript lines as they enter the runtime: each line of a kind the runtime reads decoded by its schema here
 * (`LINES`), where a reader reads it. Only a line that parses as a JSON object whose `type` is one the reader reads is decoded; a
 * line torn mid-write, a line that is no JSON object, and a line of any other type pass undecoded.
 *
 * Every field but `type`, and `message` on a `user` or `assistant` line, may be absent, and an absent field means what it always
 * has to the reader. A field that is there has the shape the runtime reads, or the line is refused with words that name it, its
 * first wrong field and the fix (`decodeLine`): a refused line is never read as saying nothing.
 */
import { Result, Schema } from 'effect';
import { firstRefusal } from '../../core/index.ts';

const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

const Time = Schema.String.check(Schema.makeFilter((t: string) => Number.isFinite(Date.parse(t)) || 'Expected a date and time'));

/** A block whose `type` is none of `known`: only its `type` is checked. */
const otherThan = (known: readonly string[]) =>
  Schema.Struct({
    type: Schema.String.check(Schema.makeFilter((t: string) => !known.includes(t) || `Expected the fields of a ${t} block`)),
  });

const TextBlock = Schema.Struct({ type: Schema.Literal('text'), text: Schema.optional(Schema.String) });

/** A block of thinking, `thinking` or `redacted_thinking`: one struct each, so a union picks the one its `type` names. */
const thinkingBlock = <T extends string>(type: T) =>
  Schema.Struct({ type: Schema.Literal(type), thinking: Schema.optional(Schema.String) });

const ToolUseBlock = Schema.Struct({
  type: Schema.Literal('tool_use'),
  id: Schema.optional(Schema.String),
  name: Schema.optional(Schema.String),
  input: Schema.optional(Schema.Unknown),
});

const ToolResultBlock = Schema.Struct({
  type: Schema.Literal('tool_result'),
  tool_use_id: Schema.optional(Schema.String),
  content: Schema.optional(Schema.Union([Schema.String, Schema.Array(Schema.Union([TextBlock, otherThan(['text'])]))])),
  is_error: Schema.optional(Schema.Boolean),
});

const Block = Schema.Union([
  TextBlock,
  thinkingBlock('thinking'),
  thinkingBlock('redacted_thinking'),
  ToolUseBlock,
  ToolResultBlock,
  otherThan(['text', 'thinking', 'redacted_thinking', 'tool_use', 'tool_result']),
]);

/** A content block of a conversation line, as `Block` decodes it. */
export type ContentBlock = typeof Block.Type;

const Content = Schema.Union([Schema.String, Schema.Array(Block)]);

const Said = {
  uuid: Schema.optional(Schema.String),
  timestamp: Schema.optional(Time),
  isMeta: Schema.optional(Schema.Boolean),
  isSidechain: Schema.optional(Schema.Boolean),
};

/** A response's token counts, as the API gives them: either cache count may be `null`, which is read as none. */
const TokensSchema = Schema.Struct({
  input_tokens: Schema.optional(Count),
  output_tokens: Schema.optional(Count),
  cache_creation_input_tokens: Schema.optional(Schema.NullOr(Count)),
  cache_read_input_tokens: Schema.optional(Schema.NullOr(Count)),
});

const ModelUsageSchema = Schema.Struct({
  inputTokens: Schema.optional(Count),
  cacheReadInputTokens: Schema.optional(Count),
  cacheCreationInputTokens: Schema.optional(Count),
  outputTokens: Schema.optional(Count),
});

/** Where a line's words came from, as Claude Code writes it: `human` for a person typing into the session, `peer` for another process. */
const Origin = Schema.Struct({ kind: Schema.optional(Schema.String) });

const QueuedCommand = Schema.Struct({
  type: Schema.Literal('queued_command'),
  prompt: Schema.optional(Content),
  commandMode: Schema.optional(Schema.String),
  origin: Schema.optional(Origin),
});

/**
 * The lines of a Claude Code transcript the runtime reads, by `type`, in what it reads of each; every other key is not checked. A
 * field the runtime starts reading is added here.
 */
export const LINES = {
  user: Schema.Struct({
    type: Schema.Literal('user'),
    ...Said,
    origin: Schema.optional(Origin),
    message: Schema.Struct({ content: Schema.optional(Content) }),
  }),
  assistant: Schema.Struct({
    type: Schema.Literal('assistant'),
    ...Said,
    message: Schema.Struct({ id: Schema.optional(Schema.String), content: Schema.optional(Content), usage: Schema.optional(TokensSchema) }),
  }),
  system: Schema.Struct({
    type: Schema.Literal('system'),
    ...Said,
    subtype: Schema.optional(Schema.String),
    content: Schema.optional(Schema.String),
    compactMetadata: Schema.optional(Schema.Struct({ preTokens: Schema.optional(Count) })),
  }),
  attachment: Schema.Struct({
    type: Schema.Literal('attachment'),
    ...Said,
    attachment: Schema.optional(Schema.Union([QueuedCommand, otherThan(['queued_command'])])),
  }),
  'cost-state': Schema.Struct({
    type: Schema.Literal('cost-state'),
    totalCostUSD: Schema.optional(Schema.Finite),
    totalAPIDuration: Schema.optional(Schema.Finite),
    totalToolDuration: Schema.optional(Schema.Finite),
    startTime: Schema.optional(Schema.Finite),
    hasUnknownModelCost: Schema.optional(Schema.Boolean),
    modelUsage: Schema.optional(Schema.Record(Schema.String, ModelUsageSchema)),
  }),
  'agent-name': Schema.Struct({ type: Schema.Literal('agent-name'), agentName: Schema.optional(Schema.String) }),
};

/** A kind of line the runtime reads: a `type` of `LINES`. */
export type LineKind = keyof typeof LINES;

/** A line of one of `kinds`, as its schema in `LINES` decodes it. */
export type Line<K extends LineKind> = (typeof LINES)[K]['Type'];

const KINDS = Object.keys(LINES) as LineKind[];

const DECODERS = Object.fromEntries(KINDS.map((k) => [k, Schema.decodeUnknownResult(LINES[k] as Schema.Codec<unknown>)])) as Record<
  LineKind,
  (entry: unknown) => Result.Result<unknown, Schema.SchemaError>
>;

const TIMED = Schema.decodeUnknownResult(Schema.Struct({ timestamp: Schema.optional(Time) }));

const FIX =
  'A transcript that holds it is not read until it decodes, never read as saying nothing: run a Claude Code whose transcript' +
  ' lines this runtime reads, or a runtime whose schema for the line in `harness/claude/lines.ts` reads this one.';

/** The `type` of `entry` when it is a JSON object whose `type` is one of `kinds`, or `undefined` for anything else. */
const kindOf = <K extends LineKind>(entry: unknown, kinds: readonly K[]): K | undefined => {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return undefined;
  const { type } = entry as { type?: unknown };
  return kinds.find((k) => k === type);
};

/** Why `entry`, a `kind` line at `where`, is refused: the line, its first wrong field, what is there, and the fix. */
const refusal = (where: string, kind: LineKind, entry: unknown, error: Schema.SchemaError): string => {
  const { path, words } = firstRefusal(entry, error, 'Claude Code writes');
  const field = path.length ? `\`${path.map(String).join('.')}\`` : 'shape';
  return `${where} is ${kind.startsWith('a') ? 'an' : 'a'} \`${kind}\` line whose ${field} ${words}. ${FIX}`;
};

/**
 * A parsed transcript line decoded when its `type` is one of `kinds`: `{ line }` when it decodes, `{ wrong }` when it does not (a
 * sentence that names `where` the line is, its kind, its first wrong field and the fix, quoting at most 60 characters of what it
 * found), and `undefined` for any other value, a line of another type included.
 */
export const decodeLine = <K extends LineKind>(
  entry: unknown,
  kinds: readonly K[],
  where: string,
): { line: Line<K> } | { wrong: string } | undefined => {
  const kind = kindOf(entry, kinds);
  if (kind === undefined) return undefined;
  const decoded = DECODERS[kind](entry);
  return Result.isSuccess(decoded) ? { line: decoded.success as Line<K> } : { wrong: refusal(where, kind, entry, decoded.failure) };
};

/**
 * A transcript line's text decoded when it is a JSON object whose `type` is one of `kinds` (`decodeLine`), or `undefined` for any
 * other line, one that is no JSON included. Throws an `Error` whose message is the refusal's words when it does not decode.
 */
export const lineOf = <K extends LineKind>(text: string, kinds: readonly K[], where: string): Line<K> | undefined => {
  let entry: unknown;
  try {
    entry = JSON.parse(text);
  } catch {
    return undefined;
  }
  const read = decodeLine(entry, kinds, where);
  if (read && 'wrong' in read) throw new Error(read.wrong);
  return read?.line;
};

/**
 * When a transcript line says it was written, in milliseconds, or `undefined` when it is no JSON object or says no time that
 * parses. A line of a kind the runtime reads (`LINES`) has its `timestamp` checked: one there that is no date and time throws an
 * `Error` naming `where` the line is and the fix. A line of any other kind is read as it is.
 */
export const writtenAt = (text: string, where: string): number | undefined => {
  let entry: unknown;
  try {
    entry = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof entry !== 'object' || entry === null) return undefined;
  const kind = kindOf(entry, KINDS);
  if (kind !== undefined) {
    const timed = TIMED(entry);
    if (Result.isFailure(timed)) throw new Error(refusal(where, kind, entry, timed.failure));
  }
  const { timestamp } = entry as { timestamp?: unknown };
  const at = typeof timestamp === 'string' ? Date.parse(timestamp) : NaN;
  return Number.isFinite(at) ? at : undefined;
};

/**
 * A Codex rollout's records as they enter the runtime: each record of a kind the runtime reads decoded by its schema here
 * (`ROLLOUT`), where a reader reads it. A record's kind is its `type` and its payload's `type`; only a JSON object of a kind the
 * reader reads is decoded, and a record of any other kind — `session_meta`, `response_item`, `turn_context`, an `event_msg` of
 * another payload type — passes undecoded.
 *
 * An absent field means what it always has to the reader. A field that is there has the shape the runtime reads, or the record is
 * refused with words that name it, its kind, its first wrong field and the fix (`rolloutRecordOf`): a refused record is never read
 * as saying nothing.
 */
import { Result, Schema } from 'effect';
import { firstRefusal } from '../../core/index.ts';

const Time = Schema.String.check(Schema.makeFilter((t: string) => Number.isFinite(Date.parse(t)) || 'Expected a date and time'));

/** A content block's text: a string, or a block whose `text` is read. */
const Text = Schema.Union([Schema.String, Schema.Struct({ text: Schema.optional(Schema.String) })]);

const Texts = Schema.optional(Schema.Array(Text));

/** A message's item, `UserMessage` or `AgentMessage`: one struct each, so a union picks the one its `type` names. */
const messageItem = <T extends string>(type: T) =>
  Schema.Struct({ type: Schema.Literal(type), id: Schema.optional(Schema.String), content: Texts });

const ReasoningItem = Schema.Struct({
  type: Schema.Literal('Reasoning'),
  id: Schema.optional(Schema.String),
  summary_text: Texts,
  raw_content: Texts,
});

const CommandExecutionItem = Schema.Struct({
  type: Schema.Literal('CommandExecution'),
  id: Schema.optional(Schema.String),
  command: Schema.optional(Schema.Array(Schema.String)),
  cwd: Schema.optional(Schema.String),
  status: Schema.optional(Schema.String),
  exit_code: Schema.optional(Schema.NullOr(Schema.Int)),
  aggregated_output: Schema.optional(Schema.NullOr(Schema.String)),
});

const FileChangeItem = Schema.Struct({
  type: Schema.Literal('FileChange'),
  id: Schema.optional(Schema.String),
  changes: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  status: Schema.optional(Schema.String),
  stdout: Schema.optional(Schema.String),
  stderr: Schema.optional(Schema.String),
});

const READ_ITEMS = ['UserMessage', 'AgentMessage', 'Reasoning', 'CommandExecution', 'FileChange'];

/** An item whose `type` is none the runtime reads: only its `type` and `id` are checked. */
const OtherItem = Schema.Struct({
  type: Schema.optional(
    Schema.String.check(Schema.makeFilter((t: string) => !READ_ITEMS.includes(t) || `Expected the fields of a ${t} item`)),
  ),
  id: Schema.optional(Schema.String),
});

const Item = Schema.Union([
  messageItem('UserMessage'),
  messageItem('AgentMessage'),
  ReasoningItem,
  CommandExecutionItem,
  FileChangeItem,
  OtherItem,
]);

/** A thread item of an `item_completed` record, as `Item` decodes it. */
export type RolloutItem = typeof Item.Type;

/** A record of the event stream Codex keeps beside the model's (`event_msg`), carrying `payload`. */
const eventMsg = <P extends Schema.Top>(payload: P) =>
  Schema.Struct({ type: Schema.Literal('event_msg'), timestamp: Schema.optional(Time), payload });

/**
 * The records of a Codex rollout the runtime reads, by kind — the record's `type` and its payload's `type` — in what it reads of
 * each; every other key is not checked. A field the runtime starts reading is added here.
 */
export const ROLLOUT = {
  'event_msg task_complete': eventMsg(
    Schema.Struct({
      type: Schema.Literal('task_complete'),
      turn_id: Schema.optional(Schema.String),
      error: Schema.optional(Schema.NullOr(Schema.Struct({ message: Schema.optional(Schema.String) }))),
    }),
  ),
  'event_msg item_completed': eventMsg(Schema.Struct({ type: Schema.Literal('item_completed'), item: Schema.optional(Item) })),
};

/** A kind of record the runtime reads: a key of `ROLLOUT`. */
export type RolloutKind = keyof typeof ROLLOUT;

/** A record of a kind the runtime reads, as its schema in `ROLLOUT` decodes it, with its kind. */
export type RolloutRecord = { [K in RolloutKind]: { kind: K; record: (typeof ROLLOUT)[K]['Type'] } }[RolloutKind];

const KINDS = Object.keys(ROLLOUT) as RolloutKind[];

const DECODERS = Object.fromEntries(KINDS.map((k) => [k, Schema.decodeUnknownResult(ROLLOUT[k] as Schema.Codec<unknown>)])) as Record<
  RolloutKind,
  (entry: unknown) => Result.Result<unknown, Schema.SchemaError>
>;

const FIX =
  'A rollout that holds it is not read until it decodes, never read as saying nothing: run a Codex whose rollout records this' +
  ' runtime reads, or a runtime whose schema for the record in `ROLLOUT` (`harness/codex/rollout.ts`) reads this one.';

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The kind of `entry` when it is a JSON object of a kind the runtime reads, or `undefined` for anything else. */
const kindOf = (entry: unknown): RolloutKind | undefined => {
  if (!isObject(entry) || !isObject(entry.payload)) return undefined;
  const kind = `${String(entry.type)} ${String(entry.payload.type)}`;
  return KINDS.find((k) => k === kind);
};

/** Why `entry`, a `kind` record at `where`, is refused: the record, its kind, its first wrong field, what is there, and the fix. */
const refusal = (where: string, kind: RolloutKind, entry: unknown, error: Schema.SchemaError): string => {
  const { path, words } = firstRefusal(entry, error, 'Codex writes');
  const field = path.length ? `\`${path.map(String).join('.')}\`` : 'shape';
  const named = kind
    .split(' ')
    .map((k) => `\`${k}\``)
    .join(' ');
  return `${where} is an ${named} record whose ${field} ${words}. ${FIX}`;
};

/**
 * A parsed rollout record decoded when it is of a kind the runtime reads: `{ kind, record }` when it decodes, `{ wrong }` when it
 * does not (a sentence that names `where` the record is, its kind, its first wrong field and the fix, quoting at most 60 characters
 * of what it found), and `undefined` for any other value, a record of another kind included.
 */
export const rolloutRecordOf = (entry: unknown, where: string): RolloutRecord | { wrong: string } | undefined => {
  const kind = kindOf(entry);
  if (kind === undefined) return undefined;
  const decoded = DECODERS[kind](entry);
  return Result.isSuccess(decoded)
    ? ({ kind, record: decoded.success } as RolloutRecord)
    : { wrong: refusal(where, kind, entry, decoded.failure) };
};

/**
 * What a journal holds, as a schema: every event a runtime has ever written, read back from whatever store holds it
 * (`Journal.layer`), before `upgrade` rewrites a former shape in today's.
 *
 * Each event keeps the keys it does not name (`Schema.StructWithRest`): a journal is never rewritten, and a key written by
 * another version of the runtime — `maxAttempts` and `resume` on an old filing, a harness argument beside
 * `config` — is `upgrade`'s to move or the fold's to leave unread. The rest's `unknown` is also what holds each struct to
 * the hand-written `Event` in `domain.ts`: a field of `Event` a struct forgot is read as `unknown`, which no field's type
 * takes, so `tsc` refuses the assignment in `journal.ts`.
 *
 * The harness's arguments are checked for their types only. What a filing may carry is `argsRefusalOf`'s at the door;
 * a journal holds what a door let through when it was written, a former argument included (`FORMER_ARGS`), which `upgrade`
 * moves.
 */
import { Schema, SchemaIssue } from 'effect';
import { quote } from './quote.ts';

const Rest = [Schema.Record(Schema.String, Schema.Unknown)] as const;

const Strings = Schema.mutable(Schema.Array(Schema.String));

const McpServerSchema = Schema.Union([
  Schema.Struct({
    type: Schema.optional(Schema.Literal('stdio')),
    command: Schema.String,
    args: Schema.optional(Strings),
    env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  }),
  Schema.Struct({
    type: Schema.Literals(['http', 'sse']),
    url: Schema.String,
    headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
    /** An OAuth client's facts, never its secret, which Claude Code reads from its own store (`RemoteMcpServer`). */
    oauth: Schema.optional(Schema.Struct({ clientId: Schema.String, callbackPort: Schema.optional(Schema.Number) })),
  }),
]);

const ClaudeFlagsSchema = Schema.StructWithRest(
  Schema.Struct({
    appendSystemPromptFile: Schema.optional(Schema.String),
    systemPromptFile: Schema.optional(Schema.String),
    pluginDir: Schema.optional(Strings),
    settings: Schema.optional(Schema.String),
    remoteControl: Schema.optional(Schema.Union([Schema.Literal(true), Schema.String])),
  }),
  [Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Finite, Schema.Literal(true), Strings]))],
);

/** `HarnessArgs`, by type: the values `argsRefusalOf` judged when the task was filed. */
const harnessArgs = {
  model: Schema.optional(Schema.String),
  permissionMode: Schema.optional(Schema.String),
  worktree: Schema.optional(Schema.Union([Schema.String, Schema.Boolean])),
  tools: Schema.optional(Strings),
  disallowedTools: Schema.optional(Strings),
  allowedTools: Schema.optional(Strings),
  effort: Schema.optional(Schema.String),
  mcp: Schema.optional(Schema.Record(Schema.String, McpServerSchema)),
  checkoutMcp: Schema.optional(Strings),
  contextTokens: Schema.optional(Schema.Finite),
  background: Schema.optional(Schema.Boolean),
  budgetUsd: Schema.optional(Schema.Finite),
  claude: Schema.optional(ClaudeFlagsSchema),
  codex: Schema.optional(Schema.StructWithRest(Schema.Struct({ trustFrom: Schema.optional(Schema.String) }), Rest)),
  command: Schema.optional(Strings),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  niceness: Schema.optional(Schema.Finite),
  mounts: Schema.optional(Schema.mutable(Schema.Array(Schema.Struct({ path: Schema.String, readOnly: Schema.Boolean })))),
  callAdmission: Schema.optional(Schema.Struct({ command: Strings, tools: Strings })),
  mayAsk: Schema.optional(Schema.Boolean),
  enabledSkills: Schema.optional(Schema.Union([Strings, Schema.Literal('default')])),
};

/**
 * `FORMER_ARGS`: a former harness argument that Claude Code's flag of the same key replaces, which `upgrade` moves into `config.claude`.
 */
const formerArgs = { remoteControl: Schema.optional(Schema.Boolean) };

export const HarnessArgsSchema = Schema.StructWithRest(Schema.Struct({ ...harnessArgs, ...formerArgs }), Rest);

export const UsageSchema = Schema.StructWithRest(
  Schema.Struct({
    turns: Schema.optional(Schema.Finite),
    toolCalls: Schema.optional(Schema.Finite),
    inputTokens: Schema.optional(Schema.Finite),
    cacheReadTokens: Schema.optional(Schema.Finite),
    cacheWriteTokens: Schema.optional(Schema.Finite),
    uncachedTokens: Schema.optional(Schema.Finite),
    peakContextTokens: Schema.optional(Schema.Finite),
    firstContextTokens: Schema.optional(Schema.Finite),
    firstCacheWriteTokens: Schema.optional(Schema.Finite),
    compactions: Schema.optional(Schema.Finite),
    outputTokens: Schema.optional(Schema.Finite),
    costUsd: Schema.optional(Schema.Finite),
    apiMs: Schema.optional(Schema.Finite),
    toolMs: Schema.optional(Schema.Finite),
    unpricedModel: Schema.optional(Schema.Literal(true)),
  }),
  Rest,
);

/**
 * A body kept once in the store's body store, by the sha256 of its UTF-8 in lowercase hex: what an entry holds in place of a long
 * text (`core/engine/bodies.ts`), and `Journal.layer` reads back.
 */
export const BodyRefSchema = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/));

/** A brief in parts as a store holds it: each part its text, or a body named by its reference. */
const BriefPartsSchema = Schema.mutable(Schema.Array(Schema.Union([Schema.String, Schema.Struct({ body: BodyRefSchema })])));

const event = <const K extends string, const F extends Schema.Struct.Fields>(kind: K, fields: F) =>
  Schema.StructWithRest(Schema.Struct({ kind: Schema.Literal(kind), at: Schema.String, ...fields }), Rest);

/**
 * A filing: one an older runtime wrote may carry its harness's arguments beside its own fields, which `upgrade` lifts into `config`.
 * A store that keeps bodies holds its brief in parts (`briefParts`) and its schema an end is held to as a body
 * (`closeoutSchemaBody`), each where the field it stands for was.
 */
const Filed = event('filed', {
  ...harnessArgs,
  ...formerArgs,
  brief: Schema.optional(Schema.String),
  briefParts: Schema.optional(BriefPartsSchema),
  closeoutSchemaBody: Schema.optional(BodyRefSchema),
  cwd: Schema.String,
  harness: Schema.optional(Schema.String),
  deadlineSeconds: Schema.optional(Schema.Finite),
  resumeFrom: Schema.optional(Schema.String),
  config: Schema.optional(HarnessArgsSchema),
  closeoutSchema: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  queued: Schema.optional(Schema.Boolean),
  priority: Schema.optional(Schema.NullOr(Schema.Finite)),
  holdOpen: Schema.optional(Schema.Literal(true)),
  restartPolicy: Schema.optional(Schema.Literal('Always')),
  labels: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  traceparent: Schema.optional(Schema.String),
});

/** A moment on the monotonic clock, as the engine stamps an attempt's start, spawn and end, and a gap (`Monotonic`, `core/clock.ts`). */
const MonotonicSchema = Schema.Struct({ boot: Schema.String, ms: Schema.Finite });

/**
 * An end as any runtime wrote one: `budget` is the reason an older runtime's journal gives a session its harness ended at a
 * spend cap, read as `harness` with `limit: 'budget'`, and `done` the word an older runtime recorded an end the harness
 * vouched for with, read as `succeeded` (`upgrade`, both).
 */
const Ended = event('ended', {
  attempt: Schema.Finite,
  sessionId: Schema.String,
  observed: Schema.Literals(['succeeded', 'failed', 'stopped', 'done']),
  reason: Schema.Literals(['harness', 'lost', 'unsigned', 'unstartable', 'operator', 'deadline', 'budget']),
  nativeId: Schema.optional(Schema.String),
  closeout: Schema.optional(Schema.Unknown),
  stated: Schema.optional(Schema.Boolean),
  usage: Schema.optional(UsageSchema),
  exitCode: Schema.optional(Schema.Finite),
  denials: Schema.optional(Schema.mutable(Schema.Array(Schema.Struct({ tool: Schema.String, what: Schema.optional(Schema.String) })))),
  skills: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  files: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  ranOn: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
  mono: Schema.optional(MonotonicSchema),
});

/**
 * A person's answer: one an older runtime wrote may carry `budgetUsd` beside `config`, which `upgrade` moves under it. A store that
 * keeps bodies may hold its text as a body (`textBody`).
 */
const Input = event('input', {
  text: Schema.optional(Schema.String),
  textBody: Schema.optional(BodyRefSchema),
  config: Schema.optional(HarnessArgsSchema),
  budgetUsd: Schema.optional(Schema.Finite),
});

/** Every event a runtime has written, in the shape it was written in. */
export const StoredEventSchema = Schema.Union([
  Filed,
  event('starting', {
    attempt: Schema.Finite,
    resumeFrom: Schema.optional(Schema.String),
    nudge: Schema.optional(Schema.String),
    nudgeBody: Schema.optional(BodyRefSchema),
    mono: Schema.optional(MonotonicSchema),
  }),
  event('spawned', { attempt: Schema.Finite, error: Schema.optional(Schema.String), mono: Schema.optional(MonotonicSchema) }),
  Ended,
  event('measured', { attempt: Schema.Finite, usage: UsageSchema }),
  event('counted', { attempt: Schema.Finite, usage: UsageSchema }),
  event('denied', { attempt: Schema.Finite, tool: Schema.String, what: Schema.optional(Schema.String) }),
  event('gap', { attempt: Schema.Finite, mono: Schema.optional(MonotonicSchema) }),
  event('process', { attempt: Schema.Finite, pid: Schema.optional(Schema.Finite) }),
  event('stop-requested', {}),
  event('said', {
    attempt: Schema.Finite,
    text: Schema.String,
    after: Schema.optional(
      Schema.NullOr(Schema.Struct({ kind: Schema.Literals(['text', 'thinking', 'tool_use', 'tool_result', 'system']), id: Schema.String })),
    ),
  }),
  Input,
  event('closed', {}),
  event('admitted', {}),
  event('settled', {
    outcome: Schema.Literals(['succeeded', 'failed', 'stopped']),
    note: Schema.optional(Schema.String),
    nativeId: Schema.optional(Schema.String),
  }),
]);

/** An event as it was written, a former shape included: what `upgrade` takes. */
export type StoredEvent = typeof StoredEventSchema.Type;

/** The kinds of event a runtime has written. */
export const EVENT_KINDS: readonly string[] = StoredEventSchema.members.map((m) => m.schema.fields.kind.literal);

/** A task's journal as a store holds it: its events, in order. */
export const StoredEventsSchema = Schema.Array(StoredEventSchema);

/** One entry of the store's feed as a store holds it: which task an event happened to. */
export const StoredFeedEntrySchema = Schema.StructWithRest(Schema.Struct({ taskId: Schema.String, event: StoredEventSchema }), Rest);

const fieldOf = (value: unknown, key: PropertyKey): unknown =>
  typeof value === 'object' && value !== null && key in value ? (value as Record<PropertyKey, unknown>)[key] : undefined;

const formatter = SchemaIssue.makeFormatterStandardSchemaV1();

/** `value` as JSON, cut to its first 60 characters and marked `…` where it was cut. */
const shown = (value: unknown): string => quote(JSON.stringify(value) ?? 'undefined');

/**
 * The first thing a schema refused in `value`: where, and what is there instead of what it expected, said as what `holder` holds
 * there (`the runtime writes`, the default, for a journal). The value found there is quoted as JSON to at most 60 characters, a cut
 * marked `…`.
 */
export const firstRefusal = (
  value: unknown,
  error: Schema.SchemaError,
  holder = 'the runtime writes',
): { path: readonly PropertyKey[]; words: string } => {
  const [first] = formatter(error.issue).issues;
  const path = (first?.path ?? []).map((p) => (typeof p === 'object' && p !== null && 'key' in p ? p.key : p));
  const found = path.reduce<unknown>((at, key) => fieldOf(at, key), value);
  const message = first?.message ?? `is not what ${holder}`;
  const words =
    message === 'Missing key'
      ? 'is missing'
      : `is ${shown(found)}, where ${message.replace(/^Expected /, `${holder} `).replace(/ \| undefined$/, '')}`;
  return { path, words };
};

/**
 * Why one entry a store gave back is no event this runtime reads, as a sentence that says what to do: `where` the entry is, and the
 * first field of it that is wrong. `entry` is a task's event, or a feed entry when `feed` is set; a line the store could not parse is
 * given as its text.
 */
export const entryWords = (where: string, entry: unknown, error: Schema.SchemaError, feed: boolean): string => {
  const { path, words } = firstRefusal(entry, error);
  const rest = path.slice(feed ? 1 : 0);
  const kind = fieldOf(feed ? fieldOf(entry, 'event') : entry, 'kind');
  const what =
    typeof entry === 'string'
      ? `is no JSON object, as a write cut short leaves a line: it reads ${shown(entry)}`
      : feed && path[0] !== 'event'
        ? `is no feed entry: its ${path.length ? `\`${String(path[0])}\`` : 'shape'} ${words}`
        : typeof kind !== 'string' || !EVENT_KINDS.includes(kind)
          ? `is no event this runtime writes (its kind is ${JSON.stringify(kind) ?? 'missing'}; the kinds are ${EVENT_KINDS.join(', ')})`
          : `is a \`${kind}\` event, and its ${rest.length ? `\`${rest.map(String).join('.')}\`` : 'shape'} ${words}`;
  return `${where} ${what}. A journal is written by the runtime alone, and never edited: if a person or another program wrote this entry, take it out; if a newer runtime did, read this store with that runtime.`;
};

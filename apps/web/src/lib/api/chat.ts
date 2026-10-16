/**
 * Nemia's chat (`GET /api/nemia/chat`, `GET /api/nemia/chat/stream`, `POST /api/nemia/chat/send` and `POST /api/nemia/chat/read`, the
 * api's `nemia/chat.ts`): a page of her history with where she is, the same followed as server-sent events, the person's words put in
 * her outbox, and their read mark moved. Each type with the schema `get` and `send` decode it with.
 */
import { Option, Schema } from 'effect';
import { get, send } from './read.ts';

/** Mirrors the package's `ChatFrom`: who a message is from — her, the person, or the keeper, whose words are a quiet marker. */
export type ChatFrom = 'agent' | 'person' | 'keeper';

/** Mirrors the package's `StepState`: done, at work, failed, not begun, or waiting on the person. */
export type ChatStepState = 'done' | 'running' | 'error' | 'pending' | 'waits';

/**
 * Mirrors the package's `ChatEvent`, unique by its `id`: a `message`, the person's carrying when it was delivered (`delivered`, null
 * while it waits in her outbox); a `step`, one tool call with its sentence, a `fact` and its state; a `session` line where one of her
 * sessions ended and the next began; a `question` and a `proposal`, named in the shape and emitted by nobody until S5.
 */
export type ChatEvent =
  | { kind: 'message'; id: string; at: string; from: ChatFrom; text: string; delivered?: string | null }
  | { kind: 'step'; id: string; at: string; tool: string; sentence: string; fact?: string; state: ChatStepState }
  | { kind: 'session'; id: string; at: string; attempt: number }
  | { kind: 'question'; id: string; at: string; text: string; options: readonly string[] }
  | { kind: 'proposal'; id: string; at: string; text: string };

/** Decodes a `ChatFrom`. */
const ChatFromSchema = Schema.Literals(['agent', 'person', 'keeper']);

/** Decodes a `ChatStepState`. */
const ChatStepStateSchema = Schema.Literals(['done', 'running', 'error', 'pending', 'waits']);

/**
 * Decodes a `ChatEvent`. Its members stand by the keys they own, the widest first, so none is read by a member it extends; each is
 * told apart by its `kind` all the same, which no two share.
 */
const ChatEventSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal('step'),
    id: Schema.String,
    at: Schema.String,
    tool: Schema.String,
    sentence: Schema.String,
    fact: Schema.optionalKey(Schema.String),
    state: ChatStepStateSchema,
  }),
  Schema.Struct({
    kind: Schema.Literal('message'),
    id: Schema.String,
    at: Schema.String,
    from: ChatFromSchema,
    text: Schema.String,
    delivered: Schema.optionalKey(Schema.NullOr(Schema.String)),
  }),
  Schema.Struct({
    kind: Schema.Literal('question'),
    id: Schema.String,
    at: Schema.String,
    text: Schema.String,
    options: Schema.Array(Schema.String),
  }),
  Schema.Struct({ kind: Schema.Literal('session'), id: Schema.String, at: Schema.String, attempt: Schema.Number }),
  Schema.Struct({ kind: Schema.Literal('proposal'), id: Schema.String, at: Schema.String, text: Schema.String }),
]) satisfies Schema.Schema<ChatEvent>;

/**
 * Mirrors the package's `Presence`, as the api answers it: `up`, her session live; `answering`, a turn in progress; `waitsOnYou`, the
 * runs waiting on the person; `unread`, her messages after their read mark. The board's own presence, which her face and its cues read,
 * is `lib/presence.ts`'s, made of this and her level (`presenceOf` in `lib/chatFollowing.ts`).
 */
export type ChatPresence = { up: boolean; answering: boolean; waitsOnYou: number; unread: number };

/** Decodes a `ChatPresence`. */
const ChatPresenceSchema = Schema.Struct({
  up: Schema.Boolean,
  answering: Schema.Boolean,
  waitsOnYou: Schema.Number,
  unread: Schema.Number,
}) satisfies Schema.Schema<ChatPresence>;

/**
 * Mirrors the package's `ChatHistory`: a page of her chat, oldest first, the id to ask `before` for the page older (null at the
 * first), the cursor a stream resumes from, and where she is.
 */
export type ChatHistory = { events: ChatEvent[]; before: string | null; cursor: string; presence: ChatPresence };

/** Decodes a `ChatHistory`. */
const ChatHistorySchema = Schema.Struct({
  events: Schema.mutable(Schema.Array(ChatEventSchema)),
  before: Schema.NullOr(Schema.String),
  cursor: Schema.String,
  presence: ChatPresenceSchema,
}) satisfies Schema.Schema<ChatHistory>;

/** Mirrors the package's `OutboxEntry`: what the person wrote, as her outbox keeps it until the keeper says it to her. */
export type ChatSent = { id: string; at: string; text: string };

/** Decodes a `ChatSent`. */
const ChatSentSchema = Schema.Struct({
  id: Schema.String,
  at: Schema.String,
  text: Schema.String,
}) satisfies Schema.Schema<ChatSent>;

/** Mirrors the package's `ReadMark`: the last event the person saw, and when they said so. */
export type ChatReadMark = { through: string; at: string };

/** Decodes a `ChatReadMark`. */
const ChatReadMarkSchema = Schema.Struct({
  through: Schema.String,
  at: Schema.String,
}) satisfies Schema.Schema<ChatReadMark>;

/** The data of each event her chat's stream sends that the board reads, by the event's name. */
export type ChatStreamData = {
  presence: ChatPresence;
  chat: ChatEvent;
  unreadable: { error: string; retrying: boolean };
};

/** Decodes the data of each event of `ChatStreamData`, by its name. */
const CHAT_SCHEMAS: { readonly [K in keyof ChatStreamData]: Schema.Decoder<ChatStreamData[K]> } = {
  presence: ChatPresenceSchema,
  chat: ChatEventSchema,
  unreadable: Schema.Struct({
    error: Schema.String,
    retrying: Schema.Boolean,
  }) satisfies Schema.Schema<ChatStreamData['unreadable']>,
};

/** The data `data` of a stream event named `event`, decoded by its schema: undefined for data that is no JSON or not of its shape. */
export function chatDataOf<K extends keyof ChatStreamData>(event: K, data: string): ChatStreamData[K] | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return undefined;
  }
  return Option.getOrUndefined(Schema.decodeUnknownOption(CHAT_SCHEMAS[event])(parsed));
}

/** Where her chat is read. */
export const chatPath = '/api/nemia/chat';

/** Where her chat is followed as server-sent events, resumed from the `cursor` a read answered. */
export const chatStreamPath = `${chatPath}/stream`;

/**
 * One read of her chat: the last events, oldest first, with the cursor a stream resumes from and where she is. The page older is asked
 * for with the `before` the last read answered; the rest of the chat comes down the stream, as a step's conversation does.
 */
export const readChat = (page: { before?: string; limit?: number } = {}, signal?: AbortSignal): Promise<ChatHistory> => {
  const asked = new URLSearchParams([
    ...(page.before === undefined ? [] : [['before', page.before]]),
    ...(page.limit === undefined ? [] : [['limit', String(page.limit)]]),
  ]);
  return get(`${chatPath}${asked.size ? `?${asked.toString()}` : ''}`, ChatHistorySchema, { signal });
};

/** The person's `text` put in her outbox, which the keeper says to her once she is up: the entry it was kept as. */
export const sendChat = (text: string): Promise<ChatSent> =>
  send('POST', `${chatPath}/send`, ChatSentSchema, {
    body: { text },
    may: 'The message may be in her outbox already: read her chat again before sending it a second time.',
  });

/** The person's read mark moved to the event `through`: the mark as it stands, which never moves back. */
export const markChatRead = (through: string): Promise<ChatReadMark> =>
  send('POST', `${chatPath}/read`, ChatReadMarkSchema, {
    body: { through },
    may: 'The mark may be moved already: read her chat again before marking it again.',
  });

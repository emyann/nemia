/**
 * Nemia's chat (`GET /api/nemia/chat`, `GET /api/nemia/chat/stream`, `POST /api/nemia/chat/send`, `POST /api/nemia/chat/answer`,
 * `POST /api/nemia/chat/read` and `POST /api/nemia/chat/stop`, the api's `nemia/chat.ts`): a page of her history with where she is, the
 * same followed as server-sent events, the person's words put in her outbox, a question of hers answered, their read mark moved, and
 * the turn she is answering ended. Each type with the schema `get` and `send` decode it with.
 */
import { Option, Schema } from 'effect';
import { decodes } from './decodes.ts';
import { get, send } from './read.ts';

/** Mirrors the package's `ChatFrom`: who a message is from — her, the person, or the keeper, whose words are a quiet marker. */
export type ChatFrom = 'agent' | 'person' | 'keeper';

/** Mirrors the package's `CallState`: done, at work, failed, not begun, or waiting on the person. */
export type ChatCallState = 'done' | 'running' | 'error' | 'pending' | 'waits';

/** Mirrors the package's `AskOption`: one choice of a question, its explanation, and whether her words marked it recommended. */
export type AskOption = { label: string; description: string; recommended: boolean };

/** Mirrors the package's `AskQuestion`: one question of an ask, its header, its choices, and whether it takes several of them. */
export type AskQuestion = { question: string; header: string; options: readonly AskOption[]; multiSelect: boolean };

/** Mirrors the package's `AskPick`: the person's answer to one question — the labels they chose, or words of their own. */
export type AskPick = { question: string; labels?: readonly string[]; words?: string };

/**
 * What a question and a proposal carry alike: her words, her questions, and the person's choice once they made one. `call` is the id
 * of the call of hers an answer is filed against (`answerChat`), which the event's own id is made of. `cutAt` is when the call that
 * asked it stopped waiting with nothing answered — her session was let go between the ask and the answer — so nothing of hers is
 * held open for it and it waits on nobody (`asksOpen`); the person may answer it still, and their answer reaches her as words.
 */
export type AskEvent = {
  id: string;
  at: string;
  call: string;
  text: string;
  questions: readonly AskQuestion[];
  chose?: Record<string, string>;
  choseAt?: string;
  cutAt?: string;
};

/**
 * Mirrors the package's `ChatEvent`, unique by its `id`: a `message`, the person's carrying when it was delivered (`delivered`, null
 * while it waits in her outbox); a `call`, one tool call with its sentence, a `fact` and its state; a `session` line where one of her
 * sessions ended and the next began; a `question` and a `proposal`, each an `AskEvent` — a call of hers waiting on the person, the
 * proposal her one-question ask.
 */
export type ChatEvent =
  | { kind: 'message'; id: string; at: string; from: ChatFrom; text: string; delivered?: string | null }
  | { kind: 'call'; id: string; at: string; tool: string; sentence: string; fact?: string; state: ChatCallState }
  | { kind: 'session'; id: string; at: string; attempt: number }
  | ({ kind: 'question' } & AskEvent)
  | ({ kind: 'proposal' } & AskEvent);

/** Decodes a `ChatFrom`. */
const ChatFromSchema = Schema.Literals(['agent', 'person', 'keeper']);

/** Decodes a `ChatCallState`. */
const ChatCallStateSchema = Schema.Literals(['done', 'running', 'error', 'pending', 'waits']);

/** Decodes an `AskOption`. */
const AskOptionSchema = decodes<AskOption>()(
  Schema.Struct({
    label: Schema.String,
    description: Schema.String,
    recommended: Schema.Boolean,
  }),
);

/** Decodes an `AskQuestion`. */
const AskQuestionSchema = decodes<AskQuestion>()(
  Schema.Struct({
    question: Schema.String,
    header: Schema.String,
    options: Schema.Array(AskOptionSchema),
    multiSelect: Schema.Boolean,
  }),
);

/** What a `question` and a `proposal` carry alike, for the member of each. */
const ASK_FIELDS = {
  id: Schema.String,
  at: Schema.String,
  call: Schema.String,
  text: Schema.String,
  questions: Schema.Array(AskQuestionSchema),
  chose: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  choseAt: Schema.optionalKey(Schema.String),
  cutAt: Schema.optionalKey(Schema.String),
};

/**
 * Decodes a `ChatEvent`. Its members stand by the keys they own, the widest first, so none is read by a member it extends; each is
 * told apart by its `kind` all the same, which no two share.
 */
const ChatEventSchema = decodes<ChatEvent>()(
  Schema.Union([
    Schema.Struct({
      kind: Schema.Literal('call'),
      id: Schema.String,
      at: Schema.String,
      tool: Schema.String,
      sentence: Schema.String,
      fact: Schema.optionalKey(Schema.String),
      state: ChatCallStateSchema,
    }),
    Schema.Struct({
      kind: Schema.Literal('message'),
      id: Schema.String,
      at: Schema.String,
      from: ChatFromSchema,
      text: Schema.String,
      delivered: Schema.optionalKey(Schema.NullOr(Schema.String)),
    }),
    Schema.Struct({ kind: Schema.Literal('question'), ...ASK_FIELDS }),
    Schema.Struct({ kind: Schema.Literal('proposal'), ...ASK_FIELDS }),
    Schema.Struct({ kind: Schema.Literal('session'), id: Schema.String, at: Schema.String, attempt: Schema.Number }),
  ]),
);

/**
 * Mirrors the package's `Presence`, as the api answers it: `up`, her session live; `answering`, a turn in progress; `waitsOnYou`, the
 * runs waiting on the person; `unread`, her messages after their read mark. The board's own presence, which her face and its cues read,
 * is `lib/presence.ts`'s, made of this and her level (`presenceOf` in `lib/chatFollowing.ts`).
 */
export type ChatPresence = { up: boolean; answering: boolean; waitsOnYou: number; unread: number };

/** Decodes a `ChatPresence`. */
const ChatPresenceSchema = decodes<ChatPresence>()(
  Schema.Struct({
    up: Schema.Boolean,
    answering: Schema.Boolean,
    waitsOnYou: Schema.Number,
    unread: Schema.Number,
  }),
);

/**
 * Mirrors the package's `ChatHistory`: a page of her chat, oldest first, the id to ask `before` for the page older (null at the
 * first), the cursor a stream resumes from, and where she is.
 */
export type ChatHistory = { events: ChatEvent[]; before: string | null; cursor: string; presence: ChatPresence };

/** Decodes a `ChatHistory`. */
const ChatHistorySchema = decodes<ChatHistory>()(
  Schema.Struct({
    events: Schema.mutable(Schema.Array(ChatEventSchema)),
    before: Schema.NullOr(Schema.String),
    cursor: Schema.String,
    presence: ChatPresenceSchema,
  }),
);

/** Mirrors the package's `OutboxEntry`: what the person wrote, as her outbox keeps it until the keeper says it to her. */
export type ChatSent = { id: string; at: string; text: string };

/** Decodes a `ChatSent`. */
const ChatSentSchema = decodes<ChatSent>()(
  Schema.Struct({
    id: Schema.String,
    at: Schema.String,
    text: Schema.String,
  }),
);

/** Mirrors the package's `AskAnswer`: the person's answer to one ask of hers, keyed by each question's own words. */
export type ChatAnswer = { id: string; at: string; answers: Record<string, string> };

/** Decodes a `ChatAnswer`. */
const ChatAnswerSchema = decodes<ChatAnswer>()(
  Schema.Struct({
    id: Schema.String,
    at: Schema.String,
    answers: Schema.Record(Schema.String, Schema.String),
  }),
);

/** Mirrors the package's `SourceStop`: when the turn she was answering was asked to end, and of which attempt of hers. */
export type ChatStop = { at: string; attempt: number };

/** Decodes a `ChatStop`. */
const ChatStopSchema = decodes<ChatStop>()(
  Schema.Struct({
    at: Schema.String,
    attempt: Schema.Number,
  }),
);

/** Mirrors the package's `ReadMark`: the last event the person saw, and when they said so. */
export type ChatReadMark = { through: string; at: string };

/** Decodes a `ChatReadMark`. */
const ChatReadMarkSchema = decodes<ChatReadMark>()(
  Schema.Struct({
    through: Schema.String,
    at: Schema.String,
  }),
);

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
  unreadable: decodes<ChatStreamData['unreadable']>()(
    Schema.Struct({
      error: Schema.String,
      retrying: Schema.Boolean,
    }),
  ),
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

/**
 * The person's `picks` filed as their answer to the ask `id`: the answer as her chat keeps it, keyed by each question's own words,
 * which the keeper carries to the call she holds open or says to her as words. It refuses an ask her chat does not hold, one answered
 * already, and picks that do not answer it.
 */
export const answerChat = (id: string, picks: readonly AskPick[]): Promise<ChatAnswer> =>
  send('POST', `${chatPath}/answer`, ChatAnswerSchema, {
    body: { id, picks },
    may: 'The answer may be filed already: read her chat again, which draws it, before answering a second time.',
  });

/** The person's read mark moved to the event `through`: the mark as it stands, which never moves back. */
export const markChatRead = (through: string): Promise<ChatReadMark> =>
  send('POST', `${chatPath}/read`, ChatReadMarkSchema, {
    body: { through },
    may: 'The mark may be moved already: read her chat again before marking it again.',
  });

/**
 * The turn she is answering ended, her session left open to hear the next words: the stop her history draws as a quiet `Stopped`
 * marker. The route takes no words of its own, so its body is the empty object, sent as `application/json` like every other write of
 * the person's. It refuses where she is not answering, which her presence says a beat later.
 */
export const stopChat = (): Promise<ChatStop> =>
  send('POST', `${chatPath}/stop`, ChatStopSchema, {
    body: {},
    may: 'Her turn may be ended already: read her chat again before stopping her a second time.',
  });

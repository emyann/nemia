/**
 * Nemia's chat (`GET /api/nemia/chat`, `GET /api/nemia/chat/stream`, `POST /api/nemia/chat/send`, `POST /api/nemia/chat/answer`,
 * `POST /api/nemia/chat/read` and `POST /api/nemia/chat/stop`), as `objects` says it: a page of her history with where she is, the same
 * followed as server-sent events, the person's words put in her outbox, a question of hers answered, their read mark moved, and the turn
 * she is answering ended. Each read and write goes through the objects' client; the stream is read as server-sent events of the same
 * path (`useNemiaChat`), each event's data decoded with `objects`' schema of it (`CHAT_STREAM_SCHEMAS`).
 */
import type { Schema } from 'effect';
import {
  AskPick as AskPickAnswer,
  AskQuestion as AskQuestionAnswer,
  ChatAnswer as ChatAnswerAnswer,
  ChatEvent as ChatEventAnswer,
  ChatHistory as ChatHistoryAnswer,
  ChatPresence as ChatPresenceAnswer,
  ChatReadMark as ChatReadMarkAnswer,
  ChatSent as ChatSentAnswer,
  ChatStop as ChatStopAnswer,
  ChatUnreadable,
  PermissionFacts as PermissionFactsAnswer,
} from 'objects';
import { call, read, write } from './objects.ts';
import type { StreamUnreadable } from './stream.ts';
/** One question of an ask. */
export type AskQuestion = typeof AskQuestionAnswer.Type;
/** The person's answer to one question: the labels picked, or their own words. */
export type AskPick = typeof AskPickAnswer.Type;
/** What a tool asked permission for. */
export type PermissionFacts = typeof PermissionFactsAnswer.Type;
/** One event of her chat: a message, a call, a session, a question, a proposal or a permission asked. */
export type ChatEvent = typeof ChatEventAnswer.Type;
/** Where she is: up, answering, how many asks wait on the person, and how many messages they have not read. */
export type ChatPresence = typeof ChatPresenceAnswer.Type;
/** A page of her chat, with the cursor a stream resumes from and where she is. */
type ChatHistory = typeof ChatHistoryAnswer.Type;
/** The person's words, put in her outbox. */
export type ChatSent = typeof ChatSentAnswer.Type;
/** An ask of hers answered. */
type ChatAnswer = typeof ChatAnswerAnswer.Type;
/** Her turn ended. */
type ChatStop = typeof ChatStopAnswer.Type;
/** The person's read mark, moved. */
type ChatReadMark = typeof ChatReadMarkAnswer.Type;

/** What each named event of her chat's stream carries. */
type ChatStreamData = {
  presence: ChatPresence;
  chat: ChatEvent;
  unreadable: StreamUnreadable;
};

/** The schema of each named event's data, `objects`' own. */
export const CHAT_STREAM_SCHEMAS: { readonly [K in keyof ChatStreamData]: Schema.Decoder<ChatStreamData[K]> } = {
  presence: ChatPresenceAnswer,
  chat: ChatEventAnswer,
  unreadable: ChatUnreadable,
};

/** Where her chat is followed as server-sent events, resumed from the `cursor` a read answered. */
export const chatStreamPath = '/api/nemia/chat/stream';

/**
 * One read of her chat: the last events, oldest first, with the cursor a stream resumes from and where she is. The page older is asked
 * for with the `before` the last read answered; the rest of the chat comes down the stream, as a step's conversation does.
 */
export const readChat = (page: { before?: string; limit?: number } = {}, signal?: AbortSignal): Promise<ChatHistory> =>
  call(
    (c) =>
      c.nemia.chat({
        query: {
          ...(page.before === undefined ? {} : { before: page.before }),
          ...(page.limit === undefined ? {} : { limit: String(page.limit) }),
        },
      }),
    read(ChatHistoryAnswer),
    signal,
  );

/** The person's words, put in her outbox: she reads them at her next turn. */
export const sendChat = (text: string): Promise<ChatSent> =>
  call(
    (c) => c.nemia.chatSend({ payload: { text } }),
    write(ChatSentAnswer, 'The message may be in her outbox already: read her chat again before sending it a second time.'),
  );

/** An ask of hers answered, each question by its picks. */
export const answerChat = (id: string, picks: readonly AskPick[]): Promise<ChatAnswer> =>
  call(
    (c) => c.nemia.chatAnswer({ payload: { id, picks } }),
    write(ChatAnswerAnswer, 'The answer may be filed already: read her chat again, which draws it, before answering a second time.'),
  );

/** The person's read mark moved to `through`. */
export const markChatRead = (through: string): Promise<ChatReadMark> =>
  call(
    (c) => c.nemia.chatRead({ payload: { through } }),
    write(ChatReadMarkAnswer, 'The mark may be moved already: read her chat again before marking it again.'),
  );

/** The turn she is answering ended. */
export const stopChat = (): Promise<ChatStop> =>
  call(
    (c) => c.nemia.chatStop(),
    write(ChatStopAnswer, 'Her turn may be ended already: read her chat again before stopping her a second time.'),
  );

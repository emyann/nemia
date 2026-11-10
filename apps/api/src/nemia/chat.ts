/**
 * Nemia's chat on the board, the chat endpoints of the nemia group (`objects`' `NemiaGroup`, handled in nemia.ts): her history a page at
 * a time with where she is, the same followed as server-sent events, the person's words sent, or an allowed agent's, a question of hers
 * answered, their read mark moved, and the turn she is answering stopped. Each is a program of the package's chat (`chatHistory`,
 * `followChat`, `chatSay`, `chatAnswer`, `chatRead`, `chatStop`) over her place (`nemiaChatPlace`), and no command of the table: a write
 * of the person's files kept out of her own fence. Her stream follows her task's session on the app's registry (`Followings`), one
 * upstream however many read her.
 *
 * - `GET /api/nemia/chat?before=<id>&limit=<n>` — a page of her history, oldest first: `{ events, before, cursor, presence }`, the
 *   last `limit` events (50 where none is asked, at most 200) before the event `before`, or the last ones; `before` the id to ask for
 *   the page older, null at the first; `cursor` where a stream resumes; `presence` `{ up, answering, waitsOnYou, unread }`. An event is
 *   a `message` (`from` her, the person, whose `delivered` is null until she was told, a `peer`, another agent under the `name` it
 *   spoke under, delivered as the person's are, or the keeper's quiet marker), a `call`, a `session` line where one of her sessions
 *   ended and the next began, a `question` or a `proposal`, or a `permission`: a call of her session's that would prompt a person, held
 *   as her question is, its one question offering `Allow once`, `Always allow` where the harness offers it, and `Deny`, and its
 *   `permission` the call's facts. 422 for a limit or a `before` that is none.
 * - `GET /api/nemia/chat/stream` — the same followed, as server-sent events (`ChatStreamEvent`): `presence` first and once it changes,
 *   then `chat`, each event new or changed (an event is replaced by its id), the cursor the id of each read's last. It lists once from the
 *   Last-Event-ID an EventSource sends when it reconnects, else from `after`, else sends the history whole; a cursor no read gave is a 422
 *   before the stream opens. Then it follows her (`followChat`): her session's moments on the one upstream the app holds for her task,
 *   the person's words, her asks and their answers, the read mark and the keeper's markers as her chat's files are written, and the
 *   record read again on a beat (`Beats.chat`) where her session cannot be followed. A read that fails once the stream is open is an
 *   `unreadable` event with `retrying: true` — the next look reads again, and gives up on nothing — and the first that works after one
 *   says `readable`, which takes the notice off the page.
 * - `POST /api/nemia/chat/send` — `{ text, from? }` put in her outbox, which the keeper says to her once she is up, framed by who wrote
 *   it: 201 with the entry `{ id, at, text, from? }`. `from` is who wrote it: none, or `{ kind: 'person' }`, is the person, taken from
 *   the board alone (`Sec-Fetch-Site: same-origin`, which a browser on the board sends and a shell, a script or an MCP host does not);
 *   `{ kind: 'agent', name }` is an agent speaking as itself, taken from anywhere under a name the person allowed (`nemia chat allow
 *   <name>`) and drawn as a `peer`'s, never as the person's. 422 for text that is empty or too long, for words from anywhere but the
 *   board that name no agent, and for a name no agent speaks under, 409 for a name the person has not allowed.
 * - `POST /api/nemia/chat/answer` — `{ id, picks }`, the person's answer to a question, a proposal or a permission: each pick names
 *   the question by its own words and carries the `labels` chosen or `words` of the person's own. 200 with the answer
 *   `{ id, at, answers }`, keyed by each question's words, which the keeper carries to her held call or says to her as words. 404 for
 *   a question her chat does not hold, 409 for one answered already, 422 for picks that do not answer it.
 * - `POST /api/nemia/chat/read` — `{ through }`, the last event the person saw: 200 with the mark `{ through, at }`, never moved back.
 *   404 for an event her chat does not hold.
 * - `POST /api/nemia/chat/stop` — the turn she is answering ended, her session left open to hear the next words: 200 with the stop
 *   `{ at, attempt }`, which her history draws as a quiet `Stopped` marker. It takes no body; sent as `application/json` as the write
 *   guard asks of every write (guard.ts). 409 where she is not answering — no session of hers is filed, her turn is over, or her harness
 *   cannot end a turn without ending its session.
 */
import { Effect, Stream } from 'effect';
import { HttpServerRequest } from 'effect/http';
import {
  chatAnswer as answerAsk,
  chatHistory,
  chatRead as readThrough,
  chatSay,
  chatStop as stopTurn,
  EngineService,
  followChat,
  nemiaChatPlace,
  PlaceService,
  StoreConfig,
  StoreRoot,
  type ChatChanges,
  type ChatFollow,
  type ChatReads,
  type ChatSent,
} from 'agent-orchestrator';
import type { ChatAnswerWrite, ChatSend, ChatStreamEvent } from 'objects';
import type { Served } from '../layer.ts';
import { answered, answeredWrite } from '../objects/refused.ts';

/** What `GET /api/nemia/chat` answers, as the package types it: read by the board's wire test until it reads `objects`' `ChatHistory`. */
export type ChatHistoryAnswer = Effect.Success<ReturnType<typeof chatHistory>>;
/** What `POST /api/nemia/chat/send` answers, as the package types it. */
export type ChatSentAnswer = Effect.Success<ReturnType<typeof chatSay>>;
/** What `POST /api/nemia/chat/stop` answers, as the package types it. */
export type ChatStopAnswer = Effect.Success<ReturnType<typeof stopTurn>>;
/** What `POST /api/nemia/chat/answer` takes, as the package types it. */
export type ChatAnswerBody = Parameters<typeof answerAsk>[1];
/** What `POST /api/nemia/chat/answer` answers, as the package types it. */
export type ChatAnswerAnswer = Effect.Success<ReturnType<typeof answerAsk>>;
/** What `POST /api/nemia/chat/read` answers, as the package types it. */
export type ChatReadAnswer = Effect.Success<ReturnType<typeof readThrough>>;

/** One frame of her chat's stream. */
type Frame = typeof ChatStreamEvent.Type;

/** How her chat reads the runs that wait on the person: as the board's list does, off the app's informer. */
const readsOf = ({ memo, informer }: Served): ChatReads => ({
  ...(informer ? { runs: informer } : {}),
  filings: memo.filings,
});

/**
 * One read's changes as frames, and the presence shown after them: the presence where it changed since `shown`, then each event, the
 * cursor the id of the last frame — the presence's where no event came.
 */
const framesOf = (read: ChatChanges, shown: string): { frames: Frame[]; shown: string } => {
  const presence = JSON.stringify(read.presence);
  const said: Frame[] =
    presence === shown ? [] : [{ event: 'presence', data: read.presence, ...(read.events.length ? {} : { id: read.cursor }) }];
  const events = read.events.map((event, i): Frame => ({
    event: 'chat',
    data: event,
    ...(i === read.events.length - 1 ? { id: read.cursor } : {}),
  }));
  return { frames: [...said, ...events], shown: presence };
};

/** One thing `followChat` sends, as frames, and the presence shown after them. */
const framesAfter = (shown: string, x: ChatSent): readonly [string, Frame[]] => {
  if (x.kind === 'changes') {
    const read = framesOf(x.changes, shown);
    return [read.shown, read.frames];
  }
  if (x.kind === 'unreadable') return [shown, [{ event: 'unreadable', data: { error: x.error, retrying: true } }]];
  return [shown, [{ event: 'readable', data: {} }]];
};

/**
 * What `followChat`'s changes read with once the stream is open: the request's engine, the app's place, and the store's root and
 * settings.
 */
const placed =
  (s: Served) =>
  <A, E, R>(stream: Stream.Stream<A, E, R>) =>
    stream.pipe(
      Stream.provideService(EngineService, s.e),
      Stream.provideService(PlaceService, s.placeService),
      Stream.provideService(StoreRoot, s.home),
      Stream.provideService(StoreConfig, s.config),
    );

/** A page of her history (`GET /api/nemia/chat`), `limit` read as the number it was sent as, so a wrong one is the package's 422. */
export const chatPage = (query: { readonly before?: string; readonly limit?: string }) =>
  answered((s) =>
    s.inRequest(
      chatHistory(
        nemiaChatPlace(s.home),
        { before: query.before || undefined, ...(query.limit ? { limit: Number(query.limit) } : {}) },
        readsOf(s),
      ),
    ),
  );

/**
 * Her chat followed from the cursor `after` (`GET /api/nemia/chat/stream`): read once before the stream opens, so a cursor no read gave is
 * the package's 422 there, then each change as it happens.
 */
export const chatStream = (after: string | undefined) =>
  answered(async (s) => {
    const follow: ChatFollow = (taskId, caught) => s.followings.follow(s.e, { kind: 'task', taskId }, caught);
    const paces = { ...(s.beats.chat ? { beatMs: s.beats.chat } : {}), ...(s.beats.chatFiles ? { filesMs: s.beats.chatFiles } : {}) };
    const { first, rest } = await s.inRequest(followChat(() => nemiaChatPlace(s.home), after, readsOf(s), follow, paces));
    const opening = framesOf(first, '');
    const relayed = placed(s)(rest).pipe(Stream.mapAccum((): string => opening.shown, framesAfter));
    return Stream.concat(Stream.fromIterable(opening.frames), relayed);
  });

/** Words put in her outbox (`POST /api/nemia/chat/send`), the person's from the board alone (`Sec-Fetch-Site: same-origin`). */
export const chatSend = ({ text, from }: typeof ChatSend.Type) =>
  Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) =>
    answeredWrite((s) => {
      const via = request.headers['sec-fetch-site'] === 'same-origin' ? 'board' : 'elsewhere';
      return s.inRequest(chatSay(nemiaChatPlace(s.home), text, from ?? { kind: 'person' }, via));
    }),
  );

/** The turn she is answering stopped (`POST /api/nemia/chat/stop`). */
export const chatStop = () => answeredWrite((s) => s.inRequest(stopTurn(nemiaChatPlace(s.home))));

/** An ask of hers answered (`POST /api/nemia/chat/answer`). */
export const chatAnswer = (given: typeof ChatAnswerWrite.Type) =>
  answeredWrite((s) => s.inRequest(answerAsk(nemiaChatPlace(s.home), given)));

/** The person's read mark moved (`POST /api/nemia/chat/read`). */
export const chatRead = (through: string) => answeredWrite((s) => s.inRequest(readThrough(nemiaChatPlace(s.home), through)));

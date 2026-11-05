/**
 * Nemia's chat on the board: her history a page at a time with where she is, the same followed as server-sent events, the person's
 * words sent, a question of hers answered, their read mark moved, and the turn she is answering stopped. Each is a program of the
 * package's chat (`chatHistory`, `followChat`, `chatSay`, `chatAnswer`, `chatRead`, `chatStop`)
 * over her place (`nemiaChatPlace`), and no command of the table: a write of the person's files kept out of her own fence. Her stream
 * follows her task's session on the app's registry (`Followings`), one upstream however many read her.
 */
import { Effect, Schema, Stream } from 'effect';
import { Hono } from 'hono';
import { type SSEStreamingApi, streamSSE } from 'hono/streaming';
import {
  chatAnswer,
  chatHistory,
  chatRead,
  chatSay,
  chatStop,
  EngineService,
  followChat,
  nemiaChatPlace,
  PlaceService,
  StoreRoot,
  type ChatChanges,
  type ChatFollow,
  type ChatReads,
  type ChatSent,
} from 'agent-orchestrator';
import { NotBlank, readBody, type Words } from '../body.ts';
import { refusedBeforeReading, type Guarded } from '../guard.ts';
import { type ApiEnv, served, type Served } from '../layer.ts';
import { runPlaced } from '../store.ts';

/** What `GET /api/nemia/chat` answers: a page of her chat, the cursor and her presence. */
export type ChatHistoryAnswer = Effect.Success<ReturnType<typeof chatHistory>>;
/** What `POST /api/nemia/chat/send` answers: the words as her outbox keeps them. */
export type ChatSentAnswer = Effect.Success<ReturnType<typeof chatSay>>;
/** What `POST /api/nemia/chat/stop` answers. */
export type ChatStopAnswer = Effect.Success<ReturnType<typeof chatStop>>;
/** What `POST /api/nemia/chat/answer` takes: the ask, and the person's pick for each of its questions. */
export type ChatAnswerBody = Parameters<typeof chatAnswer>[1];
/** What `POST /api/nemia/chat/answer` answers. */
export type ChatAnswerAnswer = Effect.Success<ReturnType<typeof chatAnswer>>;
/** What `POST /api/nemia/chat/read` answers. */
export type ChatReadAnswer = Effect.Success<ReturnType<typeof chatRead>>;

const SEND_SHAPE = '`{ "text": "<what you write to Nemia>" }`';
const READ_SHAPE = '`{ "through": "<the id of the last event you saw>" }`';
const STOP_SHAPE = '`{}`';
const ANSWER_SHAPE = '`{ "id": "<the question\'s id>", "picks": [{ "question": "<its words>", "labels": ["<a choice>"] }] }`';

const SEND_BODY = Schema.Struct({ text: Schema.String });
const READ_BODY = Schema.Struct({ through: NotBlank });
const PICK_BODY = Schema.Struct({
  question: NotBlank,
  labels: Schema.optional(Schema.Array(Schema.String)),
  words: Schema.optional(Schema.String),
});
const ANSWER_BODY = Schema.Struct({ id: NotBlank, picks: Schema.Array(PICK_BODY) });

/** A write of the person's to her chat, in the words its guard refuses it in. */
const guarded = (route: string, does: string, shape: string): Guarded => ({
  route,
  does,
  forAnother: 'write to her as you',
  why: 'what the person writes to Nemia is said to her as theirs',
  reach: 'write it on the board',
  instead: 'Write it on the board',
  shape,
});

/** Why a body is not one a chat write takes: not an object, or its one key wrong. */
const wordsOf =
  (route: string, key: string, shape: string): Words =>
  ({ path: [first], input }) =>
    first === undefined
      ? `${route} takes a JSON object: ${shape}.`
      : `${route}: \`${key}\` is a string with something in it, and this request's was ${JSON.stringify(input)}. Send ${shape}.`;

/** How her chat reads the runs that wait on the person: as the board's list does, off the app's informer. */
const readsOf = ({ home, memo, informer, env }: Served): ChatReads => ({
  home,
  ...(informer ? { runs: informer } : {}),
  filings: memo.filings,
  env,
});

/** One read's changes written to `stream`: the presence where it changed since `shown`, then each event, the cursor on the last. */
async function sent(stream: SSEStreamingApi, read: ChatChanges, shown: string): Promise<string> {
  const presence = JSON.stringify(read.presence);
  if (presence !== shown) await stream.writeSSE({ event: 'presence', data: presence, ...(read.events.length ? {} : { id: read.cursor }) });
  for (const [i, event] of read.events.entries()) {
    if (stream.aborted) break;
    await stream.writeSSE({ event: 'chat', data: JSON.stringify(event), ...(i === read.events.length - 1 ? { id: read.cursor } : {}) });
  }
  return presence;
}

/** What `followChat` reads with in a request: the request's engine, the app's place and the store's root. */
const placed =
  (s: Served) =>
  <A, E, R>(stream: Stream.Stream<A, E, R>) =>
    stream.pipe(
      Stream.provideService(EngineService, s.e),
      Stream.provideService(PlaceService, s.placeService),
      Stream.provideService(StoreRoot, s.home),
    );

/** One thing `followChat` sends, written to `stream`; the presence last shown answered, as `sent` answers it. */
async function written(stream: SSEStreamingApi, x: ChatSent, shown: string): Promise<string> {
  if (x.kind === 'changes') return sent(stream, x.changes, shown);
  if (x.kind === 'unreadable') await stream.writeSSE({ event: 'unreadable', data: JSON.stringify({ error: x.error, retrying: true }) });
  else await stream.writeSSE({ event: 'readable', data: '{}' });
  return shown;
}

/**
 * Her chat.
 *
 * - `GET /api/nemia/chat?before=<id>&limit=<n>` — a page of her history, oldest first: `{ events, before, cursor, presence }`, the
 *   last `limit` events (50 where none is asked, at most 200) before the event `before`, or the last ones; `before` the id to ask for
 *   the page older, null at the first; `cursor` where a stream resumes; `presence` `{ up, answering, waitsOnYou, unread }`. An event is
 *   a `message` (`from` her, the person, whose `delivered` is null until she was told, or the keeper's quiet marker), a `call`, a
 *   `session` line where one of her sessions ended and the next began, a `question` or a `proposal`, or a `permission`: a call of her
 *   session's that would prompt a person, held as her question is, its one question offering `Allow once`, `Always allow` where the
 *   harness offers it, and `Deny`, and its `permission` the call's facts (the tool, a shell command as typed, the harness's title,
 *   description, reason and blocked path). 422 for a limit or a `before` that is none.
 * - `GET /api/nemia/chat/stream` — the same followed, as server-sent events: `presence` first and once it changes, then `chat`, each
 *   event new or changed (an event is replaced by its id), the cursor the id of each read's last. It lists once from the Last-Event-ID
 *   an EventSource sends when it reconnects, else from `after`, else sends the history whole; a cursor no read gave is a 422 before the
 *   stream opens. Then it follows her (`followChat`): her session's moments on the one upstream the app holds for her task, the
 *   person's words, her asks and their answers, the read mark and the keeper's markers as her chat's files are written, and the record
 *   read again on a beat (`Beats.chat`) where her session cannot be followed. A read that fails once the stream is open is an
 *   `unreadable` event with `retrying: true` — the next look reads again, and gives up on nothing — and the first that works after one
 *   says `readable`, which takes the notice off the page.
 * - `POST /api/nemia/chat/send` — `{ text }` put in her outbox, which the keeper says to her once she is up: 201 with the entry
 *   `{ id, at, text }`. 400 for a body that is not one, 422 for text that is empty or too long.
 * - `POST /api/nemia/chat/answer` — `{ id, picks }`, the person's answer to a question, a proposal or a permission: each pick names
 *   the question by its own words and carries the `labels` chosen or `words` of the person's own — a permission's by its choice's
 *   label, or by words, which deny the call and are what her session reads of why. 200 with the answer
 *   `{ id, at, answers }`, keyed by each question's words, which the keeper carries to her held call or says to her as words. 404 for
 *   a question her chat does not hold, 409 for one answered already, 422 for picks that do not answer it.
 * - `POST /api/nemia/chat/read` — `{ through }`, the last event the person saw: 200 with the mark `{ through, at }`, never moved back.
 *   404 for an event her chat does not hold.
 * - `POST /api/nemia/chat/stop` — the turn she is answering ended, her session left open to hear the next words: 200 with the stop
 *   `{ at, attempt }`, which her history draws as a quiet `Stopped` marker. It says nothing of itself, so its body is `{}`, sent as
 *   `application/json` like every other write of the person's, which its guard asks for. 409 where she is not answering — no session
 *   of hers is filed, her turn is over, or her harness cannot end a turn without ending its session.
 */
export const nemiaChat = new Hono<ApiEnv>()
  .get('/api/nemia/chat', (c) =>
    served(c, async (s) => {
      const limit = c.req.query('limit');
      const page = { before: c.req.query('before') || undefined, ...(limit ? { limit: Number(limit) } : {}) };
      return c.json(await runPlaced(s, s.e, chatHistory(nemiaChatPlace(), page, readsOf(s))));
    }),
  )
  .get('/api/nemia/chat/stream', (c) =>
    served(c, async (s) => {
      const after = c.req.header('Last-Event-ID') || c.req.query('after') || undefined;
      const follow: ChatFollow = (taskId, caught) => s.followings.follow(s.e, { kind: 'task', taskId }, caught);
      const paces = { ...(s.beats.chat ? { beatMs: s.beats.chat } : {}), ...(s.beats.chatFiles ? { filesMs: s.beats.chatFiles } : {}) };
      const { first, rest } = await runPlaced(s, s.e, followChat(nemiaChatPlace, after, readsOf(s), follow, paces));
      return streamSSE(c, async (stream) => {
        const gone = new AbortController();
        stream.onAbort(() => gone.abort());
        let shown = await sent(stream, first, '');
        if (stream.aborted) return;
        const relayed = placed(s)(rest).pipe(
          Stream.runForEach((x) =>
            Effect.promise(async () => {
              if (!stream.aborted) shown = await written(stream, x, shown);
            }),
          ),
        );
        await c.var.runtime.runPromiseExit(relayed, { signal: gone.signal });
      });
    }),
  )
  .post('/api/nemia/chat/send', (c) =>
    served(c, async (s) => {
      const route = 'POST /api/nemia/chat/send';
      const refused = refusedBeforeReading(
        guarded(route, 'sends words to Nemia', SEND_SHAPE),
        c.req.header('host'),
        c.req.header('sec-fetch-site'),
        c.req.header('content-type'),
      );
      if (refused) return c.json({ error: refused.error }, refused.status);
      const read = await readBody(c.req, SEND_BODY, `${route} takes a JSON body: ${SEND_SHAPE}.`, wordsOf(route, 'text', SEND_SHAPE));
      if ('status' in read) return c.json({ error: read.error }, read.status);
      return c.json(await runPlaced(s, s.e, chatSay(nemiaChatPlace(), read.body.text)), 201);
    }),
  )
  .post('/api/nemia/chat/stop', (c) =>
    served(c, async (s) => {
      const route = 'POST /api/nemia/chat/stop';
      const refused = refusedBeforeReading(
        guarded(route, 'stops the turn Nemia is answering', STOP_SHAPE),
        c.req.header('host'),
        c.req.header('sec-fetch-site'),
        c.req.header('content-type'),
      );
      if (refused) return c.json({ error: refused.error }, refused.status);
      return c.json(await runPlaced(s, s.e, chatStop(nemiaChatPlace())));
    }),
  )
  .post('/api/nemia/chat/answer', (c) =>
    served(c, async (s) => {
      const route = 'POST /api/nemia/chat/answer';
      const refused = refusedBeforeReading(
        guarded(route, "answers a question of Nemia's", ANSWER_SHAPE),
        c.req.header('host'),
        c.req.header('sec-fetch-site'),
        c.req.header('content-type'),
      );
      if (refused) return c.json({ error: refused.error }, refused.status);
      const read = await readBody(c.req, ANSWER_BODY, `${route} takes a JSON body: ${ANSWER_SHAPE}.`, wordsOf(route, 'id', ANSWER_SHAPE));
      if ('status' in read) return c.json({ error: read.error }, read.status);
      return c.json(await runPlaced(s, s.e, chatAnswer(nemiaChatPlace(), read.body)));
    }),
  )
  .post('/api/nemia/chat/read', (c) =>
    served(c, async (s) => {
      const route = 'POST /api/nemia/chat/read';
      const refused = refusedBeforeReading(
        guarded(route, 'marks what you read of Nemia', READ_SHAPE),
        c.req.header('host'),
        c.req.header('sec-fetch-site'),
        c.req.header('content-type'),
      );
      if (refused) return c.json({ error: refused.error }, refused.status);
      const read = await readBody(c.req, READ_BODY, `${route} takes a JSON body: ${READ_SHAPE}.`, wordsOf(route, 'through', READ_SHAPE));
      if ('status' in read) return c.json({ error: read.error }, read.status);
      return c.json(await runPlaced(s, s.e, chatRead(nemiaChatPlace(), read.body.through)));
    }),
  );

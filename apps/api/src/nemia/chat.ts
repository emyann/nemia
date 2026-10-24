/**
 * Nemia's chat on the board: her history a page at a time with where she is, the same followed as server-sent events, the person's
 * words sent, a question of hers answered, their read mark moved, and the turn she is answering stopped. Each is a program of the
 * package's chat (`chatHistory`, `chatSince`, `chatSend`, `chatAnswer`, `chatRead`, `chatStop`)
 * over her place (`nemiaChatPlace`), and no command of the table: a write of the person's files kept out of her own fence.
 */
import { Schema } from 'effect';
import { Hono } from 'hono';
import { type SSEStreamingApi, streamSSE } from 'hono/streaming';
import {
  chatAnswer,
  chatHistory,
  chatRead,
  chatSend,
  chatSince,
  chatStop,
  nemiaChatPlace,
  type ChatChanges,
  type ChatReads,
} from 'agent-orchestrator';
import { NotBlank, readBody, type Words } from '../body.ts';
import { refusedBeforeReading, type Guarded } from '../guard.ts';
import { type ApiEnv, served, type Served } from '../layer.ts';
import { runPlaced } from '../store.ts';
import type { Effect } from 'effect';

/** What `GET /api/nemia/chat` answers: a page of her chat, the cursor and her presence. */
export type ChatHistoryAnswer = Effect.Success<ReturnType<typeof chatHistory>>;
/** What `POST /api/nemia/chat/send` answers: the words as her outbox keeps them. */
export type ChatSentAnswer = Effect.Success<ReturnType<typeof chatSend>>;
/** What `POST /api/nemia/chat/stop` answers. */
export type ChatStopAnswer = Effect.Success<ReturnType<typeof chatStop>>;
/** What `POST /api/nemia/chat/answer` takes: the ask, and the person's pick for each of its questions. */
export type ChatAnswerBody = Parameters<typeof chatAnswer>[1];
/** What `POST /api/nemia/chat/answer` answers. */
export type ChatAnswerAnswer = Effect.Success<ReturnType<typeof chatAnswer>>;
/** What `POST /api/nemia/chat/read` answers. */
export type ChatReadAnswer = Effect.Success<ReturnType<typeof chatRead>>;

/** How often a followed chat is read again by default: `Beats.chat`'s default (layer.ts). */
export const CHAT_BEAT_MS = 2000;

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

/** How her chat reads the runs that wait on the person: as the board's list does, off the app's memo. */
const readsOf = ({ home, memo, env }: Served): ChatReads => ({ home, runs: memo.resting, filings: memo.filings, env });

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

/**
 * Her chat.
 *
 * - `GET /api/nemia/chat?before=<id>&limit=<n>` — a page of her history, oldest first: `{ events, before, cursor, presence }`, the
 *   last `limit` events (50 where none is asked, at most 200) before the event `before`, or the last ones; `before` the id to ask for
 *   the page older, null at the first; `cursor` where a stream resumes; `presence` `{ up, answering, waitsOnYou, unread }`. An event is
 *   a `message` (`from` her, the person, whose `delivered` is null until she was told, or the keeper's quiet marker), a `step`, a
 *   `session` line where one of her sessions ended and the next began, a `question` or a `proposal`. 422 for a limit or a `before`
 *   that is none.
 * - `GET /api/nemia/chat/stream` — the same followed, as server-sent events read again every `CHAT_BEAT_MS`: `presence` first and
 *   once it changes, then `chat`, each event new or changed (an event is replaced by its id), the cursor the id of each read's last.
 *   It resumes after the Last-Event-ID an EventSource sends when it reconnects, else after `after`, else sends the history whole; a
 *   cursor no read gave is a 422 before the stream opens. A read that fails once the stream is open is an `unreadable` event with
 *   `retrying: true` — the next beat reads again, and gives up on nothing — and the first beat that works after one says `readable`,
 *   which takes the notice off the page.
 * - `POST /api/nemia/chat/send` — `{ text }` put in her outbox, which the keeper says to her once she is up: 201 with the entry
 *   `{ id, at, text }`. 400 for a body that is not one, 422 for text that is empty or too long.
 * - `POST /api/nemia/chat/answer` — `{ id, picks }`, the person's answer to a question or a proposal of hers: each pick names the
 *   question by its own words and carries the `labels` chosen or `words` of the person's own. 200 with the answer
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
      return c.json(await runPlaced(s.placeService, s.e, chatHistory(nemiaChatPlace(), page, readsOf(s))));
    }),
  )
  .get('/api/nemia/chat/stream', (c) =>
    served(c, async (s) => {
      const place = nemiaChatPlace();
      const after = c.req.header('Last-Event-ID') || c.req.query('after') || undefined;
      const first = await runPlaced(s.placeService, s.e, chatSince(place, after, readsOf(s)));
      return streamSSE(c, async (stream) => {
        let read = first;
        let shown = '';
        let unread = false;
        while (!stream.aborted) {
          shown = await sent(stream, read, shown);
          await stream.sleep(s.beats.chat ?? CHAT_BEAT_MS);
          if (stream.aborted) break;
          try {
            read = await runPlaced(s.placeService, s.e, chatSince(nemiaChatPlace(), read.cursor, readsOf(s)));
            if (unread) {
              unread = false;
              await stream.writeSSE({ event: 'readable', data: '{}' });
            }
          } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            unread = true;
            await stream.writeSSE({ event: 'unreadable', data: JSON.stringify({ error, retrying: true }) });
            read = { ...read, events: [] };
          }
        }
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
      return c.json(await runPlaced(s.placeService, s.e, chatSend(nemiaChatPlace(), read.body.text)), 201);
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
      return c.json(await runPlaced(s.placeService, s.e, chatStop(nemiaChatPlace())));
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
      return c.json(await runPlaced(s.placeService, s.e, chatAnswer(nemiaChatPlace(), read.body)));
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
      return c.json(await runPlaced(s.placeService, s.e, chatRead(nemiaChatPlace(), read.body.through)));
    }),
  );

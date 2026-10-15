/**
 * Nemia's chat on the board: her history a page at a time with where she is, the same followed as server-sent events, the person's
 * words sent, and their read mark moved. Each is a program of the package's chat (`chatHistory`, `chatSince`, `chatSend`, `chatRead`)
 * over her place (`nemiaChatPlace`), and no command of the table: a write of the person's files kept out of her own fence.
 */
import { Schema } from 'effect';
import { Hono } from 'hono';
import { type SSEStreamingApi, streamSSE } from 'hono/streaming';
import { chatHistory, chatRead, chatSend, chatSince, nemiaChatPlace, type ChatChanges, type ChatReads } from 'agent-orchestrator';
import { NotBlank, readBody, type Words } from '../body.ts';
import { refusedBeforeReading, type Guarded } from '../guard.ts';
import { type ApiEnv, served, type Served } from '../layer.ts';
import { runPlaced } from '../store.ts';

/** How often a followed chat is read again. */
export const CHAT_BEAT_MS = 2000;

const SEND_SHAPE = '`{ "text": "<what you write to Nemia>" }`';
const READ_SHAPE = '`{ "through": "<the id of the last event you saw>" }`';

const SEND_BODY = Schema.Struct({ text: Schema.String });
const READ_BODY = Schema.Struct({ through: NotBlank });

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
 *   cursor no read gave is a 422 before the stream opens.
 * - `POST /api/nemia/chat/send` — `{ text }` put in her outbox, which the keeper says to her once she is up: 201 with the entry
 *   `{ id, at, text }`. 400 for a body that is not one, 422 for text that is empty or too long.
 * - `POST /api/nemia/chat/read` — `{ through }`, the last event the person saw: 200 with the mark `{ through, at }`, never moved back.
 *   404 for an event her chat does not hold.
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
        while (!stream.aborted) {
          shown = await sent(stream, read, shown);
          await stream.sleep(CHAT_BEAT_MS);
          if (stream.aborted) break;
          try {
            read = await runPlaced(s.placeService, s.e, chatSince(nemiaChatPlace(), read.cursor, readsOf(s)));
          } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
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

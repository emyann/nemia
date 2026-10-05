/** The workflow feed followed, as server-sent events: every line the tick writes, relayed as it is written. */
import { Hono } from 'hono';
import { type SSEMessage, streamSSE } from 'hono/streaming';
import { Effect, Queue, Stream } from 'effect';
import { feedCursorRefusal, type FeedLine, REMOVED, watchFeed } from 'agent-orchestrator';
import { isRefusal } from 'agent-orchestrator/effect';
import type { ApiEnv } from '../layer.ts';

/**
 * What a line of the workflow feed is about, as its SSE event names it: a step's word (`step`), a run gone from the store (`removed`),
 * or a run's own word (`run`). Read off the line's shape alone — the api relays the feed and judges nothing from it.
 */
const feedEventOf = (line: FeedLine): 'step' | 'removed' | 'run' =>
  line.step !== undefined ? 'step' : line.word === REMOVED ? 'removed' : 'run';

/**
 * Where a reader of the feed starts: the byte its cursor names — none, or an empty one, is 0, the whole feed, as `nemia watch` and `ae
 * watch` start — or why it cannot. The package says which numbers the feed has a line boundary at (`feedCursorRefusal`); the api keeps no
 * rule of its own about them, and says only how a reader of the stream comes by a cursor.
 */
function feedCursorOf(raw: string | undefined): number | { error: string } {
  if (!raw) return 0;
  const how =
    'A feed cursor is the id of an event this stream sent, which an EventSource sends back as Last-Event-ID; pass none to read the feed from the start.';
  if (!/^\d+$/.test(raw)) return { error: `\`${raw}\` is not a cursor this feed gave: a feed cursor is a whole number of bytes. ${how}` };
  const refusal = feedCursorRefusal(Number(raw));
  return refusal ? { error: `\`${raw}\` is not a cursor this feed gave: ${refusal}. ${how}` } : Number(raw);
}

/** How many events the watch reads ahead of a reader slower than the feed: past that, it waits for the reader, as it waits on a line. */
const AHEAD = 16;

/** A failure of a read the watch tries again on its next beat, said as an event with `retrying`: true, or false when it ends the stream. */
const unreadable = (err: unknown, retrying: boolean): SSEMessage => ({
  event: 'unreadable',
  data: JSON.stringify({ error: err instanceof Error ? err.message : String(err), retrying }),
});

/**
 * The feed from `from` as the stream's events: a line an event, and a failed read said once as `unreadable` and cleared by `readable`.
 * The watch (`watchFeed`) is taken in the stream's scope and stopped as it closes, however the stream ends — its reader gone, or the feed
 * refused. It fails with what ended it: the refusal (exit 2) of a feed truncated or replaced under the cursor, reported by the watch or
 * thrown as it starts, or whatever else the watch threw as it started. The watch waits for each event to be taken once `AHEAD` are waiting.
 */
export const feedEvents = (from: number): Stream.Stream<SSEMessage, unknown> =>
  Stream.callback<SSEMessage, unknown>(
    (queue) => {
      const offer = (message: SSEMessage) => Effect.runPromiseExit(Queue.offer(queue, message));
      let failing = false;
      return Effect.acquireRelease(
        Effect.try({
          try: () =>
            watchFeed({
              from,
              onLine: async (line, cursor) => {
                await offer({ event: feedEventOf(line), data: JSON.stringify(line), id: String(cursor) });
              },
              onRead: async () => {
                if (failing) await offer({ event: 'readable', data: '{}' });
                failing = false;
              },
              onError: (err) => {
                if (isRefusal(err)) Effect.runSync(Queue.fail(queue, err));
                else if (!failing) void offer(unreadable(err, true));
                failing = true;
              },
            }),
          catch: (err) => err,
        }),
        (watch) => Effect.sync(() => watch.stop()),
      ).pipe(Effect.catch((err) => Queue.fail(queue, err)));
    },
    { bufferSize: AHEAD, strategy: 'suspend' },
  );

/**
 * `GET /api/feed/stream` — the workflow feed followed, as server-sent events: every line from the cursor, then each as the tick writes it,
 * pushed by the package's own watch (`watchFeed`: fs.watch, backed by its timer), not read again on a beat here. One event a line, named
 * by what the line is about (`feedEventOf`), its data the line as written and its id the cursor just after it. It starts after the
 * Last-Event-ID an EventSource sends when it reconnects, else after `after`, so a reconnect resumes after the last line it was sent. The
 * api relays and decides nothing: the tick has judged it all before it is written. The engine's feed is not in it: a step's filing, its
 * start and its settling reach this one as the step's word, and the engine's is keyed by task.
 *
 * A cursor the feed never gave is refused with 400 before the stream opens, an answer with a status, not an event. On the stream, a
 * refusal (exit 2) — the feed truncated or replaced under the cursor, including between the check and the watch — is an `unreadable`
 * event with `retrying: false`, said once, and ends the stream rather than fail every second; a reader opens it again with no cursor and
 * reads the feed it has now. Any other failure is of that read, not the feed: it is said once as `unreadable` with `retrying: true`, the
 * watch reads again on its next beat from the same cursor, and the first read that works clears it with `readable`, whether or not it
 * finds a line. The relay runs on the app's runtime, and the watch is held in the scope of `feedEvents`, which the request's abort
 * interrupts: when the reader goes, or the feed does, it is stopped on that one path, and no fs watcher and no timer is left behind.
 */
export const feed = new Hono<ApiEnv>().get('/api/feed/stream', (c) => {
  const from = feedCursorOf(c.req.header('Last-Event-ID') || c.req.query('after') || undefined);
  if (typeof from !== 'number') return c.json({ error: from.error }, 400);
  return streamSSE(c, async (stream) => {
    const gone = new AbortController();
    stream.onAbort(() => gone.abort());
    if (stream.aborted) gone.abort();
    const relayed = feedEvents(from).pipe(
      Stream.runForEach((message) => Effect.promise(() => stream.writeSSE(message))),
      Effect.catch((err) => Effect.promise(() => stream.writeSSE(unreadable(err, false)))),
    );
    await c.var.runtime.runPromiseExit(relayed, { signal: gone.signal });
  });
});

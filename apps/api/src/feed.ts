/** The workflow feed followed, as server-sent events: every line the tick writes, relayed as it is written. */
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { feedCursorRefusal, type FeedLine, REMOVED, watchFeed } from 'agent-orchestrator';

/**
 * What a line of the workflow feed is about, as its SSE event names it: a step's word (`step`), a run gone from the store (`removed`),
 * or a run's own word (`run`). Read off the line's shape alone — the api relays the feed and judges nothing from it.
 */
const feedEventOf = (line: FeedLine): 'step' | 'removed' | 'run' =>
  line.step !== undefined ? 'step' : line.word === REMOVED ? 'removed' : 'run';

/**
 * Where a reader of the feed starts: the byte its cursor names — none, or an empty one, is 0, the whole feed, as `wf watch` and `ae watch`
 * start — or why it cannot. The package says which numbers the feed has a line boundary at (`feedCursorRefusal`); the api keeps no rule of
 * its own about them, and says only how a reader of the stream comes by a cursor.
 */
function feedCursorOf(raw: string | undefined): number | { error: string } {
  if (!raw) return 0;
  const how =
    'A feed cursor is the id of an event this stream sent, which an EventSource sends back as Last-Event-ID; pass none to read the feed from the start.';
  if (!/^\d+$/.test(raw)) return { error: `\`${raw}\` is not a cursor this feed gave: a feed cursor is a whole number of bytes. ${how}` };
  const refusal = feedCursorRefusal(Number(raw));
  return refusal ? { error: `\`${raw}\` is not a cursor this feed gave: ${refusal}. ${how}` } : Number(raw);
}

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
 * finds a line. When the reader goes, or the feed does, the watch is stopped: no fs watcher and no timer is left behind.
 */
export const feed = new Hono().get('/api/feed/stream', (c) => {
  const from = feedCursorOf(c.req.header('Last-Event-ID') || c.req.query('after') || undefined);
  if (typeof from !== 'number') return c.json({ error: from.error }, 400);
  return streamSSE(c, async (stream) => {
    let end: () => void = () => {};
    const ended = new Promise<void>((resolve) => {
      end = resolve;
    });
    stream.onAbort(end);
    let failing = false;
    let over = false;
    const unreadable = (err: unknown, retrying: boolean) =>
      stream.writeSSE({
        event: 'unreadable',
        data: JSON.stringify({ error: err instanceof Error ? err.message : String(err), retrying }),
      });
    let watch: { stop(): void };
    try {
      watch = watchFeed({
        from,
        onLine: (line, cursor) => stream.writeSSE({ event: feedEventOf(line), data: JSON.stringify(line), id: String(cursor) }),
        onRead: async () => {
          if (failing) await stream.writeSSE({ event: 'readable', data: '{}' });
          failing = false;
        },
        onError: (err) => {
          if (over) return;
          if ((err as { exitCode?: unknown }).exitCode === 2) {
            over = true;
            void unreadable(err, false).finally(end);
            return;
          }
          if (!failing) void unreadable(err, true);
          failing = true;
        },
      });
    } catch (err) {
      await unreadable(err, false);
      return;
    }
    if (stream.aborted) end();
    try {
      await ended;
    } finally {
      watch.stop();
    }
  });
});

/** The workflow feed followed, as server-sent events: every line the tick writes, relayed as it is written. */
import { Hono } from 'hono';
import { type SSEMessage, streamSSE } from 'hono/streaming';
import { type Duration, Effect, Stream } from 'effect';
import {
  BOOKMARK_EVERY,
  feedCursorRefusal,
  type FeedLine,
  followFeed,
  type Followed,
  Invalid,
  parseSelectors,
  REMOVED,
  type Selectors,
  selectorsRefusal,
  selects,
} from 'agent-orchestrator';
import type { ApiEnv } from '../layer.ts';

/**
 * What a line of the workflow feed is about, as its SSE event names it: a daemon that took the store (`daemon`), a step's word (`step`),
 * a run gone from the store (`removed`), or a run's own word (`run`). Read off the line's shape alone — the api relays the feed and judges
 * nothing from it.
 */
const feedEventOf = (line: FeedLine): 'daemon' | 'step' | 'removed' | 'run' =>
  'daemon' in line ? 'daemon' : line.step !== undefined ? 'step' : line.word === REMOVED ? 'removed' : 'run';

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

/**
 * How a selector reaches this stream, said after the package's refusal of one and a full stop, since the package's words end on its
 * key list: the query key, that it is given again for another selector, and that none follows every line. The package's words are the
 * grammar's and spell it as `nemia watch` takes it; this says how a reader of this surface spells the same thing.
 */
const SELECTOR_ASKED =
  'A selector reaches this stream as `selector`, given again for another selector, of which one must hold; pass none to follow every line.';

/** A failure of a read as an event with `retrying`: true while the reader reads again on its next beat, false when it ends the stream. */
const unreadable = (err: unknown, retrying: boolean): SSEMessage => ({
  event: 'unreadable',
  data: JSON.stringify({ error: err instanceof Error ? err.message : String(err), retrying }),
});

/**
 * Where the stream has read to, as an event of its own: its id the cursor, its data an empty field — present, so an EventSource both
 * remembers the id and dispatches a `bookmark` event, and empty, since where it has read to is the whole of what it says.
 */
const bookmark = (cursor: number): SSEMessage => ({ event: 'bookmark', data: '', id: String(cursor) });

/** What the reader handed on, as the stream's event: a line, its id the cursor after it; a failed read; and the read after it. */
const messageOf = (f: Followed): SSEMessage =>
  f.kind === 'line'
    ? { event: feedEventOf(f.line), data: JSON.stringify(f.line), id: String(f.cursor) }
    : f.kind === 'unreadable'
      ? unreadable(f.error, true)
      : { event: 'readable', data: '{}' };

/**
 * What the stream sends the moment it opens, before any line: a comment, which an EventSource reads as nothing. A proxy that sends a
 * response's head with its first bytes (Vite's, before the board) holds the stream's answer until then, and a feed with no line yet to send
 * would leave the board saying it is still connecting.
 */
export const OPENED = ': open\n\n';

/**
 * The feed from `from` as the stream's events (`messageOf`), read by the package's live reader (`followFeed`) on the runtime it runs on:
 * a line an event, and a failed read said once as `unreadable` and cleared by `readable`. The reader is held in the stream's scope and let
 * go as it closes, however the stream ends — its reader gone, or the feed refused. It fails with the refusal (exit 2) of a feed truncated
 * or replaced under the cursor.
 *
 * `selectors` keeps only the lines they select (`selects`), the package's grammar whole: a line they do not take is not sent, while the
 * cursor still advances past it, so a reader that resumes from a cursor this stream gave re-reads nothing. None given takes every line.
 * Beside the lines, where the stream has read to every `bookmarkEvery` (`bookmark`), merged in rather than written by a fiber of its own,
 * so the one run of this stream stays the socket's one writer; the tick's first beat is dropped, since it comes at subscription and no
 * bookmark precedes the first line. The merge halts with the lines: a feed that ends or fails ends the stream, bookmarks and all.
 *
 * @param from the byte of the feed to read from
 * @param selectors the selectors a line must be taken by, none for every line
 * @param bookmarkEvery how often the stream says where it has read to, the one cadence every surface reads by default
 * @returns the stream's events, in the order the reader hands them on, with a bookmark between them
 */
export const feedEvents = (from: number, selectors: Selectors = [], bookmarkEvery: Duration.Input = BOOKMARK_EVERY) => {
  const at = { cursor: from };
  const lines = followFeed(from).pipe(
    Stream.tap((f) =>
      Effect.sync(() => {
        if (f.kind === 'line') at.cursor = f.cursor;
      }),
    ),
    Stream.filter((f) => f.kind !== 'line' || selects(selectors, f.line)),
    Stream.map(messageOf),
  );
  const bookmarks = Stream.tick(bookmarkEvery).pipe(
    Stream.drop(1),
    Stream.map(() => bookmark(at.cursor)),
  );
  return Stream.merge(lines, bookmarks, { haltStrategy: 'left' });
};

/**
 * `GET /api/feed/stream` — the workflow feed followed, as server-sent events: every line from the cursor, then each as the tick writes it,
 * handed on by the package's live reader (`followFeed`): from the lines the daemon in this process publishes as it writes them, and from
 * the file for every line none brought, on the reader's beat — another process's (`--no-tick`, `nemia tick`). It opens with a comment
 * (`OPENED`), before any line. One event a line, named by what the line is about (`feedEventOf`), its data the line as written and its id
 * the cursor just after it. It starts after the Last-Event-ID an EventSource sends when it reconnects, else after `after`, so a reconnect
 * resumes after the last line it was sent. The api relays and decides nothing: the tick has judged it all before it is written. The
 * engine's feed is not in it: a step's filing, its start and its settling reach this one as the step's word, and the engine's is keyed
 * by task.
 *
 * `selector`, given again for each further selector, keeps only the lines they select, in the grammar the package owns whole
 * (`selectorsRefusal`, `parseSelectors`, `selects`): every clause of one selector holds of a line it takes, and one selector of them does.
 * The selecting is the server's, so a line a selector does not take never crosses the wire, while the cursor still advances past it. None
 * given follows every line, which is what the board reads. Every stream, selected or not, says where it has read to every `BOOKMARK_EVERY`
 * as a `bookmark` event carrying that cursor as its id and an empty data field, so a reader of a silent feed knows where it is and can
 * resume there; the first beat is dropped, so no bookmark precedes the first line.
 *
 * A cursor the feed never gave is refused with 400 before the stream opens, an answer with a status, not an event. A selector the grammar
 * refuses is the package's `Invalid` with `SELECTOR_ASKED` after it, 422 before the stream opens, and no reader is started for it. On the
 * stream, a refusal (exit 2) — the feed truncated or replaced under the cursor, including between the check and the reader's first
 * read — is an `unreadable` event with `retrying: false`, said once, and ends the stream rather than fail every second; a reader opens
 * it again with no cursor and reads the feed it has now. Any other failure is of that read, not the feed: it is said once as
 * `unreadable` with
 * `retrying: true`, the reader reads again on its next beat from the same cursor, and the first read that works clears it with
 * `readable`, before the lines it found. The relay runs on the app's runtime, whose layer holds the hub (`feedHubLayer`), and the reader
 * is held in the scope of `feedEvents`, which the request's abort interrupts: when the reader goes, or the feed does, it is let go on that
 * one path, its subscription with it, and no longer counted among the feed's followers (`FEED_FOLLOWERS`).
 */
export const feed = new Hono<ApiEnv>().get('/api/feed/stream', (c) => {
  const from = feedCursorOf(c.req.header('Last-Event-ID') || c.req.query('after') || undefined);
  if (typeof from !== 'number') return c.json({ error: from.error }, 400);
  const asked = c.req.queries('selector') ?? [];
  const refused = selectorsRefusal(asked);
  if (refused) throw new Invalid({ message: `${refused}. ${SELECTOR_ASKED}` });
  const selectors = parseSelectors(asked);
  return streamSSE(c, async (stream) => {
    const gone = new AbortController();
    stream.onAbort(() => gone.abort());
    if (stream.aborted) gone.abort();
    await stream.write(OPENED);
    const relayed = feedEvents(from, selectors).pipe(
      Stream.runForEach((message) => Effect.promise(() => stream.writeSSE(message))),
      Effect.catch((err) => Effect.promise(() => stream.writeSSE(unreadable(err, false)))),
    );
    await c.var.runtime.runPromiseExit(relayed, { signal: gone.signal });
  });
});

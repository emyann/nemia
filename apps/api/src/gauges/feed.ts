/** The workflow feed followed, as server-sent events: every line the tick writes, relayed as it is written. */
import { type Context, type Duration, Effect, Stream } from 'effect';
import {
  BOOKMARK_EVERY,
  feedCursorRefusal,
  type FeedLine,
  feedSize,
  followFeed,
  formerHints,
  type Followed,
  parseSelectors,
  REMOVED,
  type Selectors,
  selectorsRefusal,
  selects,
} from 'agent-orchestrator';
import { BadRequest, type FeedStreamEvent, Invalid } from 'objects';
import type { BeatsShape } from '../layer.ts';

/** One event of the stream, as objects' `FeedStreamEvent` says it. */
type SSEMessage = FeedStreamEvent;

/**
 * What a line of the workflow feed is about, as its SSE event names it: the store, its pause put or lifted (`store`), a daemon that took
 * the store (`daemon`), a step's word (`step`), a run gone from the store (`removed`), or a run's own word (`run`). Read off the line's
 * shape alone — the api relays the feed and judges nothing from it.
 */
const feedEventOf = (line: FeedLine): 'store' | 'daemon' | 'step' | 'removed' | 'run' =>
  'store' in line ? 'store' : 'daemon' in line ? 'daemon' : line.step !== undefined ? 'step' : line.word === REMOVED ? 'removed' : 'run';

/**
 * Where a reader of the feed starts: the byte its cursor names — none, or an empty one, is 0, the whole feed, as `nemia watch` and `ae
 * watch` start — or why it cannot. The package says which numbers the feed has a line boundary at (`feedCursorRefusal`); the api keeps no
 * rule of its own about them, and says only how a reader of the stream comes by a cursor.
 */
function feedCursorOf(home: string, raw: string | undefined): number | { error: string } {
  if (!raw) return 0;
  const how =
    'A feed cursor is the id of an event this stream sent, which an EventSource sends back as Last-Event-ID; pass none to read the feed from the start.';
  if (!/^\d+$/.test(raw)) return { error: `\`${raw}\` is not a cursor this feed gave: a feed cursor is a whole number of bytes. ${how}` };
  const refusal = feedCursorRefusal(home, Number(raw));
  return refusal ? { error: `\`${raw}\` is not a cursor this feed gave: ${refusal}. ${how}` } : Number(raw);
}

/** The one value `from` takes: the feed's end, where a reader that wants no history of it starts. */
const END = 'end';

/**
 * Where a reader that gave no cursor starts: the feed's end on `from=end`, its start on no `from`, or why `from` cannot be read. A
 * cursor — a Last-Event-ID or an `after` — wins over `from`, so an EventSource's reconnect resumes where it was, and a `from` of any
 * other value is refused all the same, before the stream opens.
 *
 * @param home the store's root, whose feed is read
 * @param raw the `from` asked for, none for the feed's start
 * @returns the byte of the feed to read from, or why `from` cannot be read
 */
function feedStartOf(home: string, raw: string | undefined): number | { error: string } {
  if (raw === undefined) return 0;
  if (raw !== END)
    return {
      error: `\`${raw}\` is not a start this feed takes: \`from=${END}\` starts at the feed's end, which is the one value \`from\` takes; pass none to read the feed from the start, or a cursor this stream gave as \`after\`.`,
    };
  return feedSize(home);
}

/**
 * Where a reader that reads the feed once stops: the feed's end as the stream opens (`feedSize`) on `until=end`, none on no `until` — the
 * stream follows the feed until its reader goes — or why `until` cannot be read.
 *
 * @param home the store's root, whose feed is read
 * @param raw the `until` asked for, none to follow the feed
 * @returns the byte of the feed to stop at, none to follow it, or why `until` cannot be read
 */
function feedEndOf(home: string, raw: string | undefined): number | undefined | { error: string } {
  if (raw === undefined) return undefined;
  if (raw !== END)
    return {
      error: `\`${raw}\` is not an end this feed takes: \`until=${END}\` reads the feed to its end as the stream opens and closes it, which is the one value \`until\` takes; pass none to follow the feed.`,
    };
  return feedSize(home);
}

/** A hint for a selector a reader typed (`formerHints`), as an event of its own: its data the sentence a person reads. */
const hinted = (message: string): SSEMessage => ({ event: 'hint', data: JSON.stringify({ message }) });

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
 * What the stream sends the moment it opens, before any line: an event of its own, `opened`, with nothing in it, which every reader of the
 * stream skips. A proxy that sends a response's head with its first bytes (Vite's, before the board) holds the stream's answer until then,
 * and a feed with no line yet to send would leave the board saying it is still connecting. An event, not a comment: the stream is written
 * by HttpApi's `StreamSse`, which writes events alone.
 */
export const OPENED: SSEMessage = { event: 'opened', data: '' };

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
 * @param beat how often the reader reads the file for the lines no hub brought: `Beats.feed`, none for the package's own beat
 * @param until the byte of the feed to stop at, the feed's size as the stream opened (`until=end`): the stream ends once it has read the
 * line that reaches it, whether its selectors take that line or not, with a last bookmark there; none follows the feed
 * @returns the stream's events, in the order the reader hands them on, with a bookmark between them
 */
export const feedEvents = (
  from: number,
  selectors: Selectors = [],
  bookmarkEvery: Duration.Input = BOOKMARK_EVERY,
  beat?: Duration.Input,
  until?: number,
) => {
  const at = { cursor: from };
  const followed =
    until === undefined
      ? followFeed(from, beat === undefined ? {} : { beat })
      : from >= until
        ? Stream.empty
        : followFeed(from, beat === undefined ? {} : { beat }).pipe(Stream.takeUntil((f) => f.kind === 'line' && f.cursor >= until));
  const lines = followed.pipe(
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
  const merged = Stream.merge(lines, bookmarks, { haltStrategy: 'left' });
  return until === undefined
    ? merged
    : Stream.concat(
        merged,
        Stream.suspend(() => Stream.make(bookmark(at.cursor))),
      );
};

/**
 * `GET /api/feed/stream` — the workflow feed followed, as server-sent events: every line from the cursor, then each as the tick writes it,
 * handed on by the package's live reader (`followFeed`): from the lines the daemon in this process publishes as it writes them, and from
 * the file for every line none brought, on the reader's beat — another process's (`--no-tick`, `nemia tick`). It opens with an `opened`
 * event (`OPENED`), before any line, which every reader skips. One event a line, named by what the line is about (`feedEventOf`), its
 * data the line as written and its id the cursor just after it. It starts after the Last-Event-ID an EventSource sends when it
 * reconnects, else after `after`, so a reconnect resumes after the last line it was sent. The api relays and decides nothing: the tick
 * has judged it all before it is written. The engine's feed is not in it: a step's filing, its start and its settling reach this one as
 * the step's word, and the engine's is keyed by task.
 *
 * `selector`, given again for each further selector, keeps only the lines they select, in the grammar the package owns whole
 * (`selectorsRefusal`, `parseSelectors`, `selects`): every clause of one selector holds of a line it takes, and one selector of them does.
 * The selecting is the server's, so a line a selector does not take never crosses the wire, while the cursor still advances past it. None
 * given follows every line, which is what the board reads. Every stream, selected or not, says where it has read to every `BOOKMARK_EVERY`
 * as a `bookmark` event carrying that cursor as its id and an empty data field, so a reader of a silent feed knows where it is and can
 * resume there; the first beat is dropped, so no bookmark precedes the first line.
 *
 * `from=end` starts the stream at the feed's end as it opens (`feedSize`), so a reader that holds no history of the feed — the board,
 * whose every query is read fresh — is sent no line that was written before it asked. A cursor wins over it, so an EventSource's
 * reconnect resumes where it was, and `from` of any other value is refused before the stream opens, saying `end` is the one it takes.
 * None given reads the feed from the start, as `nemia watch` and `ae watch` do.
 *
 * `until=end` reads the feed once: the stream ends once it has read to the feed's size as it opened (`feedSize`), the lines its selectors
 * take sent and a last `bookmark` at that size, so a line written after it opened is not sent — `nemia watch --once`. With `from=end`, or a
 * cursor at that size, it sends the bookmark alone. `until` of any other value is refused before the stream opens.
 *
 * A selector that names a former reason (`formerHints`) is sent its hint first, a `hint` event whose data carries the sentence as
 * `message`, before any line: the code is still read, and the hint says what to type instead.
 *
 * A cursor the feed never gave is refused with 400 before the stream opens (`BadRequest`, an error the endpoint declares), an answer with
 * a status, not an event. A selector the grammar refuses is an `Invalid` in the package's words with `SELECTOR_ASKED` after it, 422
 * before the stream opens, and no reader is started for it. On the
 * stream, a refusal (exit 2) — the feed truncated or replaced under the cursor, including between the check and the reader's first
 * read — is an `unreadable` event with `retrying: false`, said once, and ends the stream rather than fail every second; a reader opens
 * it again with no cursor and reads the feed it has now. Any other failure is of that read, not the feed: it is said once as
 * `unreadable` with
 * `retrying: true`, the reader reads again on its next beat from the same cursor, and the first read that works clears it with
 * `readable`, before the lines it found. The relay is given the app's services (`context`, read by the handler through `inRequest`),
 * whose layer holds the hub (`feedHubLayer`), and the reader is held in the scope of `feedEvents`, which HttpApi's stream ends as the
 * request is aborted: when the reader goes, or the feed does, it is let go on that
 * one path, its subscription with it, and no longer counted among the feed's followers (`FEED_FOLLOWERS`).
 *
 * The stream `query` and `lastEventId` ask for, or the refusal that answers before it opens: `beats.feed` the reader's beat, and
 * `context` the app's services the relay reads (the hub, the store's root).
 */
export const feedOpened = (
  query: { readonly from?: string; readonly after?: string; readonly until?: string; readonly selector?: string | readonly string[] },
  lastEventId: string | undefined,
  beats: BeatsShape,
  context: Context.Context<never>,
  home: string,
): Effect.Effect<Stream.Stream<SSEMessage>, BadRequest | Invalid> =>
  Effect.gen(function* () {
    const start = feedStartOf(home, query.from);
    if (typeof start !== 'number') return yield* Effect.fail(new BadRequest({ error: start.error }));
    const cursor = lastEventId || query.after || undefined;
    const from = cursor === undefined ? start : feedCursorOf(home, cursor);
    if (typeof from !== 'number') return yield* Effect.fail(new BadRequest({ error: from.error }));
    const until = feedEndOf(home, query.until);
    if (typeof until === 'object') return yield* Effect.fail(new BadRequest({ error: until.error }));
    const asked = typeof query.selector === 'string' ? [query.selector] : [...(query.selector ?? [])];
    const refused = selectorsRefusal(asked);
    if (refused) return yield* Effect.fail(new Invalid({ error: `${refused}. ${SELECTOR_ASKED}` }));
    const selectors = parseSelectors(asked);
    const hints = asked.flatMap(formerHints).map(hinted);
    const relayed = feedEvents(from, selectors, BOOKMARK_EVERY, beats.feed, until).pipe(
      Stream.catch((err) => Stream.make(unreadable(err, false))),
      Stream.provideContext(context),
    );
    return Stream.concat(Stream.fromIterable([OPENED, ...hints]), relayed);
  });

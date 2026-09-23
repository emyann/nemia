import type { QueryKey } from '@tanstack/react-query';
import { END_GRACE_MS, type Frames, type StreamLike } from './following.ts';

/**
 * Whether the board follows the workflow feed: `connecting` until its stream first opens, `open` while it does, `down` while it cannot —
 * dropped and being resumed, refused, or unreadable on the api's side. What the root's header says as `data-feed`.
 */
export type FeedStatus = 'connecting' | 'open' | 'down';

/** What the feed's stream names each event, as the api's `feedEventOf` does: a step's word, a run gone from the store, or a run's own word. */
export type FeedEvent = 'run' | 'step' | 'removed';

/** How often what the feed answers for is read all the same while its stream is open: a slow fallback, in case an event is ever missed. */
export const FALLBACK_MS = 60_000;

/** How long after the stream was refused, or reopened and refused again, it is opened again. */
export const REOPEN_MS = 5_000;

/**
 * The queries an event of the feed can change, each to be invalidated exactly — never by prefix: `['runs', id, 'decision', stamp]` is keyed
 * by the state it answers for, and read again under a key of its own when the run's record moves (`decisionQuery`).
 *
 * A step's word moves the run's record and its row in the list. A run's own word does that, and moves what counts against the cap, and may
 * be a queued card started — the feed carries no card events yet, so the inbox is read again on it. A run removed is gone from the list and
 * from the cap, and its record is read again too: the read that finds none is how a page open on the run learns it is gone (`runGone`).
 *
 * And every event reads again whether a daemon ticks the store (`daemonQuery`): a line on the feed is written by a tick, so a daemon started
 * while the board says none does is seen on its first line, not on the fallback a minute later.
 */
export function keysOf(event: FeedEvent, run: string): QueryKey[] {
  switch (event) {
    case 'step':
      return [['runs'], ['runs', run], ['daemon']];
    case 'run':
      return [['runs'], ['runs', run], ['ceilings'], ['inbox'], ['daemon']];
    case 'removed':
      return [['runs'], ['runs', run], ['ceilings'], ['daemon']];
  }
}

/**
 * Whether a query is one the board polls at `pace`, and reads again when the stream goes down: what the feed says — the runs, a run's record,
 * and the cap — and whether a daemon ticks the store (`daemonQuery`), which every event reads again but none can say is gone.
 */
export const polled = (key: QueryKey): boolean =>
  (key.length === 1 && (key[0] === 'runs' || key[0] === 'ceilings' || key[0] === 'daemon')) || (key.length === 2 && key[0] === 'runs' && typeof key[1] === 'string');

// Whether the feed's stream is open now: one stream a page, so one flag, set by `followFeed` alone.
let live = false;

/** How often a polled query is read: `fast` while the feed is not followed, and `FALLBACK_MS` while it is. A query's `refetchInterval`. */
export const pace = (fast: number): number => (live ? FALLBACK_MS : fast);

/** What `followFeed` tells the page: the queries to read again, and whether it follows. */
export type FeedSink = { invalidate: (keys: QueryKey[]) => void; status: (status: FeedStatus) => void };

export type Timers = { set: (f: () => void, ms: number) => ReturnType<typeof setTimeout>; clear: (t: ReturnType<typeof setTimeout>) => void };

const browserTimers: Timers = { set: (f, ms) => setTimeout(f, ms), clear: (t) => clearTimeout(t) };

/** `EventSource.CLOSED`, named here so a stream can be followed where there is no EventSource. */
const CLOSED = 2;

/**
 * The workflow feed followed (`GET /api/feed/stream`), apart from React, so it is tested without a browser: `useFeed` opens the stream and
 * hands its invalidations to the query client. `open(after)` opens one, from the cursor after the event `after` names, or from the start.
 * The keys of the events that arrive together are invalidated once, on a frame: a stream opened with no cursor replays the whole feed.
 *
 * A dropped connection is the EventSource's own to resume: it reconnects with the id of the last event it was sent, and misses nothing.
 * One the api refused — or a proxy's 5xx while the api restarts — is closed for good by the EventSource, and opened again here after
 * `REOPEN_MS` from the last event's id; if that is refused too, before it ever opened, from the start, since a cursor the api refuses (a 400)
 * cannot be told apart from an api that is not there. A feed cut under the stream's cursor is said once (`unreadable`, not `retrying`) and
 * the api ends the response: closed then, on the `error` fired as the response ends, or after `END_GRACE_MS` — never on the event itself,
 * which aborts a request answered in full (`follow`) — and opened again from the start, as the api's own comment asks.
 *
 * Returns what stops following.
 */
export function followFeed(open: (after?: string) => StreamLike, sink: FeedSink, frames: Frames, timers: Timers = browserTimers): () => void {
  let stream: StreamLike;
  let stopped = false;
  // The id of the last event read: the cursor a stream opened again resumes from.
  let last: string | undefined;
  // Whether this stream has opened, and whether it was opened from a cursor, so a refused retry from one goes from the start instead.
  let opened = false;
  let fromCursor = false;
  // Set once the api said this stream is over: it is closed when the response ends, or when the grace runs out.
  let grace: ReturnType<typeof setTimeout> | undefined;
  let reopening: ReturnType<typeof setTimeout> | undefined;
  let status: FeedStatus | undefined;
  const say = (next: FeedStatus) => {
    live = next === 'open';
    if (next !== status) sink.status(next);
    status = next;
  };

  const arrived = new Map<string, QueryKey>();
  let frame = 0;
  const flush = () => {
    frame = 0;
    const keys = [...arrived.values()];
    arrived.clear();
    if (keys.length) sink.invalidate(keys);
  };

  const connect = (after: string | undefined) => {
    opened = false;
    fromCursor = after !== undefined;
    grace = undefined;
    const s = open(after);
    stream = s;
    // Each listener reads its own stream: one closed and replaced may still dispatch what it had.
    const current = () => !stopped && stream === s;
    const read = (event: FeedEvent) => (message: MessageEvent) => {
      if (!current()) return;
      if (message.lastEventId) last = message.lastEventId;
      const { run } = JSON.parse(message.data) as { run?: unknown };
      if (typeof run !== 'string') return;
      for (const key of keysOf(event, run)) arrived.set(JSON.stringify(key), key);
      frame ||= frames.request(flush);
    };
    for (const event of ['run', 'step', 'removed'] as const) s.addEventListener(event, read(event));
    s.addEventListener('open', () => {
      if (!current()) return;
      opened = true;
      say('open');
    });
    // A read the api failed, and tries again every second: followed still, but polled as if not, until it reads again.
    s.addEventListener('unreadable', (message) => {
      if (!current()) return;
      const { retrying } = JSON.parse(message.data) as { retrying?: unknown };
      say('down');
      if (retrying !== true) grace ??= timers.set(again, END_GRACE_MS);
    });
    s.addEventListener('readable', () => {
      if (current() && grace === undefined) say('open');
    });
    s.addEventListener('error', () => {
      if (!current()) return;
      // The api ended the response after saying the feed was cut: closed now, answered in full, and opened again from the start.
      if (grace !== undefined) {
        again();
        return;
      }
      say('down');
      // A dropped connection is resumed by the EventSource itself; it is closed only when the api, or what is in front of it, refused it.
      if (s.readyState === CLOSED) {
        // Opened again from a cursor, and refused before it opened: the cursor may be what is refused, so the next goes from the start.
        if (fromCursor && !opened) last = undefined;
        reopening = timers.set(() => {
          reopening = undefined;
          connect(last);
        }, REOPEN_MS);
      }
    });
  };
  // The stream the api said is over, closed and opened again from the start: the feed it has now.
  const again = () => {
    if (grace !== undefined) timers.clear(grace);
    stream.close();
    last = undefined;
    if (!stopped) connect(undefined);
  };

  say('connecting');
  connect(undefined);
  return () => {
    stopped = true;
    if (grace !== undefined) timers.clear(grace);
    if (reopening !== undefined) timers.clear(reopening);
    if (frame) frames.cancel(frame);
    stream.close();
    live = false;
  };
}

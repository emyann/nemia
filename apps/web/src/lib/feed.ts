import type { QueryKey } from '@tanstack/react-query';
import { END_GRACE_MS, type Frames, type StreamLike } from './following.ts';

/**
 * Whether the board follows the workflow feed: `connecting` until its stream first opens, `open` while it does, `down` while it cannot —
 * dropped and being resumed, refused, or unreadable on the api's side. What the root's header says as `data-feed`.
 */
export type FeedStatus = 'connecting' | 'open' | 'down';

/**
 * What the feed's stream names each event, as the api's `feedEventOf` does: a step's word, a run gone from the store, or a run's own word.
 */
export type FeedEvent = 'run' | 'step' | 'removed';

/** How often what the feed answers for is read all the same while its stream is open: a slow fallback, in case an event is ever missed. */
export const FALLBACK_MS = 60_000;

/** How long after the stream was refused, or reopened and refused again, it is opened again. */
export const REOPEN_MS = 5_000;

/**
 * The queries an event of the feed can change, each to be invalidated as `filterOf` says: exactly, never by prefix, but the light answer's
 * — `['runs', id, 'decision', stamp]` is keyed by the state it answers for, and read again under a key of its own when the run's record
 * moves (`decisionQuery`).
 *
 * A step's word moves the run's record, its row in the list, the light answer the frame reads and the pages of the finished runs. A run's own word does that, and moves
 * what counts against the cap, and may be a queued card started — the feed carries no card events, so the inbox is read again on it. A run
 * removed is gone from the list and from the cap, and its record is read again too: the read that finds none is how a page open on the
 * run learns it is gone (`runGone`).
 *
 * And every event reads again whether a daemon ticks the store (`daemonQuery`): a line on the feed is written by a tick, the
 * daemon's, so a daemon started while the board says none does is seen on its first line, not on the fallback a minute later.
 */
export function keysOf(event: FeedEvent, run: string): QueryKey[] {
  switch (event) {
    case 'step':
      return [['runs'], ['runs-open'], ['runs-finished'], ['runs', run], ['daemon']];
    case 'run':
      return [['runs'], ['runs-open'], ['runs-finished'], ['runs', run], ['ceilings'], ['inbox'], ['daemon']];
    case 'removed':
      return [['runs'], ['runs-open'], ['runs-finished'], ['runs', run], ['ceilings'], ['daemon']];
  }
}

/** The key of the light answer for every factory (`openRunsQuery`), which stands for the one of each factory, keyed under it. */
const OPEN = 'runs-open';

/** The first word of every key of a page of the finished runs (`finishedRunsQuery`): it stands for each factory's every page. */
const FINISHED = 'runs-finished';

/**
 * How a key an event or a write names is invalidated: exactly, for every key but the light answer's and the finished runs', each of
 * which stands for every key under it — a factory's own answer and each page move with every run's, and the feed names no factory and
 * no page. No key under them is keyed by a state.
 */
export const filterOf = (queryKey: QueryKey): { queryKey: QueryKey; exact: boolean } => ({
  queryKey,
  exact: !(queryKey.length === 1 && (queryKey[0] === OPEN || queryKey[0] === FINISHED)),
});

/**
 * Whether a query is one the board polls at `pace`, and reads again when the stream goes down: what the feed says — the runs, the light
 * answer and a factory's, every page of the finished runs, a run's record, and the cap — and whether a daemon ticks the store
 * (`daemonQuery`), which every event reads again but none can say is gone.
 */
export const polled = (key: QueryKey): boolean =>
  (key.length === 1 && (key[0] === 'runs' || key[0] === OPEN || key[0] === 'ceilings' || key[0] === 'daemon')) ||
  (key.length === 2 && (key[0] === 'runs' || key[0] === OPEN) && typeof key[1] === 'string') ||
  key[0] === FINISHED;

/** Whether the feed's stream is open now: one stream a page, so one flag, set by `followFeed` alone. */
let live = false;

/** How often a polled query is read: `fast` while the feed is not followed, and `FALLBACK_MS` while it is. A query's `refetchInterval`. */
export const pace = (fast: number): number => (live ? FALLBACK_MS : fast);

/** What `followFeed` tells the page: the queries to read again, and whether it follows. */
export type FeedSink = { invalidate: (keys: QueryKey[]) => void; status: (status: FeedStatus) => void };

/** The timers `followFeed` sets: the browser's, or a test's own. */
export type Timers = {
  set: (f: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clear: (t: ReturnType<typeof setTimeout>) => void;
};

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
 * `REOPEN_MS` from the last event's id; if that is refused too, before it ever opened, from the start, since a cursor the api refuses (a
 * 400) cannot be told apart from an api that is not there. A read the api failed and tries again every second (`unreadable`, `retrying`) is
 * said `down` and still followed, and `open` again once the api says `readable`. A feed cut under the stream's cursor is said once
 * (`unreadable`, not `retrying`) and the api ends the response: closed then, on the `error` fired as the response ends, or after
 * `END_GRACE_MS` — never on the event itself, which aborts a request answered in full (`follow`) — and opened again from the start.
 * A listener of a stream closed and replaced does nothing with what that stream still dispatches.
 *
 * Returns what stops following.
 */
export function followFeed(
  open: (after?: string) => StreamLike,
  sink: FeedSink,
  frames: Frames,
  timers: Timers = browserTimers,
): () => void {
  let stream: StreamLike;
  let stopped = false;
  let last: string | undefined;
  let opened = false;
  let fromCursor = false;
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
      if (grace !== undefined) {
        again();
        return;
      }
      say('down');
      if (s.readyState === CLOSED) {
        if (fromCursor && !opened) last = undefined;
        reopening = timers.set(() => {
          reopening = undefined;
          connect(last);
        }, REOPEN_MS);
      }
    });
  };
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

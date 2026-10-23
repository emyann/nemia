import type { QueryKey } from '@tanstack/react-query';
import { END_GRACE_MS, type Frames, type StreamLike } from './follow.ts';

/**
 * Whether the board follows the workflow feed: `connecting` until its stream first opens, `open` while it does, `down` while it cannot —
 * dropped and being resumed, refused, or unreadable on the api's side. What the root's header says as `data-feed`.
 */
export type FeedStatus = 'connecting' | 'open' | 'down';

/**
 * What the feed's stream names each event, as the api's `feedEventOf` does: the store's pause put or lifted, a daemon that took the
 * store, a step's word, a run gone from the store, or a run's own word.
 */
export type FeedEvent = 'run' | 'step' | 'removed' | 'daemon' | 'store';

/** The events of the feed that are a run's, each line naming the run it is about; a daemon's and the store's name none. */
export type RunEvent = Exclude<FeedEvent, 'daemon' | 'store'>;

/** How often what the feed answers for is read all the same while its stream is open: a slow fallback, in case an event is ever missed. */
export const FALLBACK_MS = 60_000;

/** How long after the stream was refused, or reopened and refused again, it is opened again. */
export const REOPEN_MS = 5_000;

/**
 * How often a burst of lines is read at most: the lines that arrive within this of the last read are gathered and read once, when it is
 * up. A line after a quiet `FLUSH_MS` is read on the next frame.
 */
export const FLUSH_MS = 1_000;

/**
 * The queries an event of the feed can change, each to be invalidated as `filterOf` says: exactly, never by prefix, but the light answer's
 * — `['runs', id, 'decision', stamp]` is keyed by the state it answers for, and read again under a key of its own when the run's record
 * moves (`decisionQuery`).
 *
 * A step's word moves the run's record, its row in the list, the light answer the frame reads and the pages of the finished runs. A
 * run's own word does that, and moves what counts against the cap, and may be a queued card started — the feed carries no card events,
 * so the inbox is read again on it. A run removed is gone from the list and from the cap, and its record is read again too: the read
 * that finds none is how a page open on the run learns it is gone (`runGone`).
 *
 * And every event reads again whether a daemon ticks the store (`daemonQuery`): a line on the feed is written by a tick, the
 * daemon's, so a daemon started while the board says none does is seen on its first line, not on the fallback a minute later. A
 * daemon's own line is that first line, and reads the daemon's standing alone: it names no run, and moves no run's record.
 *
 * The store's line — its pause put or lifted, said by the tick that read it — reads the pause again, and what a pause at once
 * would stop, and the daemon's standing as every tick's line does: it names no run either. The pause's own poll (`pauseQuery`) stays as
 * the fallback.
 */
export function keysOf(event: 'daemon' | 'store'): QueryKey[];
export function keysOf(event: RunEvent, run: string): QueryKey[];
export function keysOf(event: FeedEvent, run?: string): QueryKey[] {
  switch (event) {
    case 'daemon':
      return [['daemon']];
    case 'store':
      return [['pause'], ['pause', 'now'], ['daemon']];
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

/**
 * Where a stream of the feed opens: after an event this page was already sent, or at the feed's end. The board holds no history of the
 * feed — every query it reads is read fresh, and a line only says which to read again — so a stream that resumes nothing starts at the
 * end rather than replay the whole of it.
 */
export type FeedStart = 'end' | { after: string };

/** Where a stream opens for a page that was last sent the event `after`, or none: a cursor resumes, and nothing to resume is the end. */
const startAt = (after: string | undefined): FeedStart => (after === undefined ? 'end' : { after });

/** What `followFeed` tells the page: the queries to read again, and whether it follows. */
export type FeedSink = { invalidate: (keys: QueryKey[]) => void; status: (status: FeedStatus) => void };

/** The timers `followFeed` sets: the browser's, or a test's own. */
export type Timers = {
  set: (f: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clear: (t: ReturnType<typeof setTimeout>) => void;
};

const browserTimers: Timers = { set: (f, ms) => setTimeout(f, ms), clear: (t) => clearTimeout(t) };

/**
 * The queries a line of the feed moves, read off the event it arrived as and the line's own JSON: a daemon's line names no run and moves
 * the daemon's standing alone, the store's its pause; a run's event whose line names no run moves nothing, since every key of one is keyed
 * by the run.
 */
const keysFor = (event: FeedEvent, data: string): QueryKey[] => {
  const { run } = JSON.parse(data) as { run?: unknown };
  if (event === 'daemon' || event === 'store') return keysOf(event);
  return typeof run === 'string' ? keysOf(event, run) : [];
};

/** `EventSource.CLOSED`, named here so a stream can be followed where there is no EventSource. */
const CLOSED = 2;

/**
 * How the keys the lines of the feed move are read again: the keys that arrive together once, on a frame, and a burst no more than once
 * every `FLUSH_MS` — the lines that come within that of a read are gathered and read together, once, when it is up, so a page whose
 * reads are heavy reads once a second however fast the lines come.
 *
 * @param sink what the keys are handed to
 * @param frames the frames a read waits for
 * @param timers the timers the gathering second is kept by
 * @returns `arrive`, given a line's keys, and `stop`, which cancels the frame and the second still pending
 */
const gathered = (sink: FeedSink, frames: Frames, timers: Timers) => {
  const arrived = new Map<string, QueryKey>();
  let frame = 0;
  let gathering: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    frame = 0;
    const keys = [...arrived.values()];
    arrived.clear();
    if (!keys.length) return;
    sink.invalidate(keys);
    gathering = timers.set(() => {
      gathering = undefined;
      flush();
    }, FLUSH_MS);
  };
  return {
    arrive: (keys: QueryKey[]) => {
      for (const key of keys) arrived.set(JSON.stringify(key), key);
      if (gathering === undefined) frame ||= frames.request(flush);
    },
    stop: () => {
      if (frame) frames.cancel(frame);
      if (gathering !== undefined) timers.clear(gathering);
    },
  };
};

/**
 * The workflow feed followed (`GET /api/feed/stream`), apart from React, so it is tested without a browser: `useFeed` opens the stream and
 * hands its invalidations to the query client. `open(start)` opens one, from the cursor after an event it was sent, or at the feed's end
 * (`startAt`): every stream that resumes nothing starts at the end, since the board holds no history of the feed.
 * The keys of the events that arrive together are invalidated once, on a frame, and a burst no more than once every `FLUSH_MS`: the lines
 * that arrive within that of the last read are gathered and read together, once, when it is up, so a page whose reads are heavy reads
 * once a second however fast the lines come.
 *
 * A dropped connection is the EventSource's own to resume: it reconnects with the id of the last event it was sent, and misses nothing.
 * One the api refused — or a proxy's 5xx while the api restarts — is closed for good by the EventSource, and opened again here after
 * `REOPEN_MS` from the last event's id; if that is refused too, before it ever opened, from the end, since a cursor the api refuses (a
 * 400) cannot be told apart from an api that is not there. A read the api failed and tries again every second (`unreadable`, `retrying`) is
 * said `down` and still followed, and `open` again once the api says `readable`. A feed cut under the stream's cursor is said once
 * (`unreadable`, not `retrying`) and the api ends the response: closed then, on the `error` fired as the response ends, or after
 * `END_GRACE_MS` — never on the event itself, which aborts a request answered in full (`follow`) — and opened again from the end.
 * A listener of a stream closed and replaced does nothing with what that stream still dispatches.
 *
 * Returns what stops following.
 */
export function followFeed(
  open: (start: FeedStart) => StreamLike,
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

  const reads = gathered(sink, frames, timers);

  const connect = (after: string | undefined) => {
    opened = false;
    fromCursor = after !== undefined;
    grace = undefined;
    const s = open(startAt(after));
    stream = s;
    const current = () => !stopped && stream === s;
    const read = (event: FeedEvent) => (message: MessageEvent) => {
      if (!current()) return;
      if (message.lastEventId) last = message.lastEventId;
      const keys = keysFor(event, message.data);
      if (keys.length) reads.arrive(keys);
    };
    for (const event of ['run', 'step', 'removed', 'daemon', 'store'] as const) s.addEventListener(event, read(event));
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
    reads.stop();
    stream.close();
    live = false;
  };
}

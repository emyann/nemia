/**
 * The one follower both of the board's conversations run on — a step's session (`lib/following.ts`) and Nemia's chat
 * (`lib/chatFollowing.ts`) — so there is one EventSource, one merge of history and live, and one reconnect rule between them.
 *
 * It owns the transport and nothing of either conversation's meaning: the queue of arrivals with its coalescing, the merge of a
 * frame's worth at once, the grace before a stream that has said it is over is closed, and the whole `unreadable` / `readable` /
 * `open` / `error` protocol. What each conversation means by an event is the `Follower` it hands here.
 *
 * The frame's feed (`lib/feed.ts`) is not one of them, and is exempt by name in `test/follow.test.ts`: it reopens on its own, carries
 * a status of its own and invalidates queries, and what this core would have to grow to hold that is more than the two conversations
 * need. It takes the three bits of transport that are plainly shared — `StreamLike`, `Frames` and `END_GRACE_MS` — from here.
 */

/** The three facts this core itself writes: whether the stream is still open, why it ended, and why it is being read again. */
export type Followed = {
  live: boolean;
  /** Why the conversation could not be read and will not be again, if so: the end of the following. */
  error: string | null;
  /** Why no live stream of it can be had while the api reads it again on a beat, if so: a notice, not an end. */
  retrying: string | null;
};

/**
 * What one conversation means by its stream, over the state `S` it holds and the arrivals `C` it reads: what each named event of the
 * stream brings, what the state does to each arrival, how two arrivals of one kind join as they queue, what a following that has ended
 * leaves behind, what a connection made leaves, how an `unreadable` event reads, and the words for what the api did not name.
 */
export type Follower<S extends Followed, C> = {
  /** Each named event of the stream and what it brings: no arrival where its data does not decode. */
  readonly reads: Readonly<Record<string, (message: MessageEvent) => readonly C[]>>;
  /** The names of the events that end the following with no error: a step's `settled`. */
  readonly over: readonly string[];
  /** `s` after the arrival `c`, taken in the order they came. */
  readonly fold: (s: S, c: C) => S;
  /** Whether `next` was joined into `last`, which is then left in the queue in its place. */
  readonly joined: (last: C, next: C) => boolean;
  /** What a following that has ended leaves behind: a step's message being written dropped. */
  readonly ending: (s: S) => S;
  /** What a connection made leaves: her chat live again. Called with the error and the retrying notice already cleared. */
  readonly opened: (s: S) => S;
  /** Why the api could not read it and whether it reads again, as its `unreadable` event says it; null where the data does not decode. */
  readonly unreadable: (message: MessageEvent) => { error: string; retrying: boolean } | null;
  /** The words for a read the api failed and named nothing of, and for the api refusing to follow any further. */
  readonly words: { readonly unread: string; readonly refused: string };
};

/** The stream as `follow` uses it: an EventSource, or anything that dispatches the same events. */
export type StreamLike = {
  readonly readyState: number;
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
  close(): void;
};

/** How the events that arrive together are merged once, on a frame: the browser's animation frames, or a test's own. */
export type Frames = { request: (flush: () => void) => number; cancel: (frame: number) => void };

/**
 * The browser's animation frames, called as the browser's own functions. Not `{ request: requestAnimationFrame }`: called off another
 * object, it throws "Illegal invocation" in the listener, and every event after the first read is lost while the page says it follows.
 */
export const animationFrames: Frames = {
  request: (flush) => requestAnimationFrame(flush),
  cancel: (frame) => cancelAnimationFrame(frame),
};

/** `EventSource.CLOSED`, named here so a stream can be followed where there is no EventSource. */
export const CLOSED = 2;

/**
 * How long a stream that has said it is over — `settled`, or a read that will not work again — is given to end its response, before the
 * page closes it all the same. The api ends it right after that last event.
 */
export const END_GRACE_MS = 2_000;

/**
 * The conversation `follower` describes, followed on `stream`, each change written through `update`, apart from React so it is tested
 * without a browser: a hook opens the EventSource and hands it here. Each event named in `follower.reads` brings its arrivals, and one
 * whose data does not decode is ignored; the arrivals that come together are folded once a frame, as a stream opened on a long
 * conversation sends hundreds at once, and two of one kind join as they queue (`joined`). An event of `follower.over` ends it with no
 * error.
 *
 * `unreadable` with `retrying` is a notice, not an end: it fills `retrying`, leaves `error` null and keeps the stream, since the api
 * reads the conversation again on its own beat. One without is the end, and fills `error`. `readable` and each connection made clear
 * both — the first connection, or one the EventSource made again after a drop, since a fresh server stream never sends `readable`. A
 * dropped connection is the EventSource's to resume; one it closes, because the api refused it, is the end. Returns what stops
 * following.
 *
 * A stream that said it is over is closed once the api has ended its response — the `error` an EventSource fires then, before it would
 * reconnect — or after `END_GRACE_MS`, and not the moment its last event arrives. Closed then, while the rest of the response is still on
 * its way, the browser aborts a request that was answered in full (`net::ERR_ABORTED`), which the e2e's watch counts as a failed request.
 * The page stops following at once all the same.
 */
export function follow<S extends Followed, C>(
  stream: StreamLike,
  follower: Follower<S, C>,
  update: (change: (s: S) => S) => void,
  frames: Frames,
): () => void {
  let arrived: C[] = [];
  let frame = 0;
  let grace: ReturnType<typeof setTimeout> | undefined;
  const close = () => {
    if (grace !== undefined) clearTimeout(grace);
    stream.close();
  };
  const flush = () => {
    frame = 0;
    const changes = arrived;
    arrived = [];
    update((s) => changes.reduce(follower.fold, s));
  };
  const end = (error: string | null) => {
    grace ??= setTimeout(close, END_GRACE_MS);
    if (frame) {
      frames.cancel(frame);
      flush();
    }
    update((s) => follower.ending({ ...s, live: false, error, retrying: null }));
  };
  const arrive = (c: C) => {
    const last = arrived.at(-1);
    if (!(last !== undefined && follower.joined(last, c))) arrived.push(c);
    frame ||= frames.request(flush);
  };
  const cleared = (s: S): S => (s.error === null && s.retrying === null ? s : { ...s, error: null, retrying: null });
  for (const [name, read] of Object.entries(follower.reads)) {
    stream.addEventListener(name, (message) => {
      for (const c of read(message)) arrive(c);
    });
  }
  for (const name of follower.over) stream.addEventListener(name, () => end(null));
  stream.addEventListener('unreadable', (message) => {
    const said = follower.unreadable(message);
    const error = said?.error ?? follower.words.unread;
    if (said?.retrying) update((s) => ({ ...cleared(s), retrying: error }));
    else end(error);
  });
  stream.addEventListener('readable', () => update(cleared));
  stream.addEventListener('open', () => update((s) => follower.opened(cleared(s))));
  stream.addEventListener('error', () => {
    if (grace !== undefined) {
      close();
      return;
    }
    if (stream.readyState === CLOSED) {
      end(follower.words.refused);
      close();
    }
  });
  return () => {
    close();
    if (frame) frames.cancel(frame);
  };
}

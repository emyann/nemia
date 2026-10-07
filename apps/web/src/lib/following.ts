import { streamDataOf, type StreamPartial, type TranscriptEvent } from './api/steps.ts';
import { mergeEvents } from './transcript.ts';

/**
 * A step's conversation as a page holds it: the events so far, the message being written (`partial`: its text block's key and its text so
 * far), whether more may come, whether the api pushes it as it is written (`streamed`), and why it could not be read, if it could not.
 */
export type Following = {
  events: TranscriptEvent[];
  partial: { key: string; text: string } | null;
  live: boolean;
  streamed: boolean;
  loading: boolean;
  error: string | null;
};

/** What a page holds of a conversation before it is read: nothing, being read when there is one (`loading`). */
export const unread = (loading: boolean): Following => ({ events: [], partial: null, live: false, streamed: false, loading, error: null });

/** What one event of the stream does to the conversation, in the order they came: whole events, a piece of a message, or a move. */
type Change = { kind: 'events'; events: TranscriptEvent[] } | ({ kind: 'partial' } & StreamPartial) | { kind: 'moved' };

/** A whole message of the session's own: what replaces the message being written. */
const wholeText = (event: TranscriptEvent) => event.role === 'assistant' && event.kind === 'text';

/**
 * `s` after the change `c`, `closed` holding each text block written whole: whole events merged in, the message being written dropped, and
 * its block closed, once one of them is the session's own text; a piece added to the message of its block, or begun anew for another
 * block, and the message dropped and its block closed at its `last`; a piece of a closed block ignored; and a move to another attempt or
 * task (`moved`) starts the conversation afresh, its history to come.
 */
export function changed(s: Following, c: Change, closed: Set<string>): Following {
  if (c.kind === 'moved') return { ...s, events: [], partial: null };
  if (c.kind === 'events') {
    const whole = c.events.some(wholeText);
    if (whole && s.partial) closed.add(s.partial.key);
    return { ...s, events: mergeEvents(s.events, c.events), partial: whole ? null : s.partial };
  }
  if (closed.has(c.key)) return s;
  if (c.last) {
    closed.add(c.key);
    return { ...s, partial: null };
  }
  return { ...s, partial: { key: c.key, text: s.partial?.key === c.key ? s.partial.text + c.delta : c.delta } };
}

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
const CLOSED = 2;

/**
 * How long a stream that has said it is over — `settled`, or a read that will not work again — is given to end its response, before the
 * page closes it all the same. The api ends it right after that last event.
 */
export const END_GRACE_MS = 2_000;

/**
 * What each of a step's stream events does to what a page holds of its conversation (`update`), apart from React, so it is tested without a
 * browser: `useStepTranscript` opens the stream and hands it here. Each event's data is decoded by its schema (`streamDataOf`), and one
 * that does not decode is ignored. `following` says whether the stream is pushed (`streamed`); each `transcript`, `partial` and `moved`
 * changes the conversation as `changed` says, in the order they came, a frame's worth at once; `settled` ends it; a read that failed and is tried again every second is said, and one that will not be is the end; `readable` clears the error,
 * and so does each connection made — the first, or one the EventSource made again after a drop — since a fresh server stream never sends
 * `readable`. A dropped connection is the EventSource's to resume; one it closes, because the api refused it, is the end. Returns what
 * stops following.
 *
 * A stream that said it is over is closed once the api has ended its response — the `error` an EventSource fires then, before it would
 * reconnect — or after `END_GRACE_MS`, and not the moment its last event arrives. Closed then, while the rest of the response is still on
 * its way, the browser aborts a request that was answered in full (`net::ERR_ABORTED`), which the e2e's watch counts as a failed request.
 * The page stops following at once all the same.
 */
export function follow(stream: StreamLike, update: (change: (s: Following) => Following) => void, frames: Frames): () => void {
  let arrived: Change[] = [];
  const closed = new Set<string>();
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
    update((s) => changes.reduce((at, c) => changed(at, c, closed), s));
  };
  const end = (error: string | null) => {
    grace ??= setTimeout(close, END_GRACE_MS);
    if (frame) {
      frames.cancel(frame);
      flush();
    }
    update((s) => ({ ...s, live: false, partial: null, error }));
  };
  const arrive = (c: Change) => {
    const last = arrived.at(-1);
    if (c.kind === 'events' && last?.kind === 'events') last.events.push(...c.events);
    else arrived.push(c);
    frame ||= frames.request(flush);
  };
  stream.addEventListener('transcript', (message) => {
    const event = streamDataOf('transcript', message.data);
    if (event) arrive({ kind: 'events', events: [event] });
  });
  stream.addEventListener('partial', (message) => {
    const piece = streamDataOf('partial', message.data);
    if (piece) arrive({ kind: 'partial', ...piece });
  });
  stream.addEventListener('moved', (message) => {
    if (streamDataOf('moved', message.data)) arrive({ kind: 'moved' });
  });
  stream.addEventListener('following', (message) => {
    const said = streamDataOf('following', message.data);
    if (said) update((s) => ({ ...s, streamed: said.streamed }));
  });
  stream.addEventListener('settled', () => end(null));
  stream.addEventListener('unreadable', (message) => {
    const said = streamDataOf('unreadable', message.data);
    const error = said?.error ?? 'The conversation could not be read.';
    if (said?.retrying) update((s) => ({ ...s, error: `${error} Reading it again every second.` }));
    else end(error);
  });
  stream.addEventListener('readable', () => update((s) => ({ ...s, error: null })));
  stream.addEventListener('open', () => update((s) => (s.error === null ? s : { ...s, error: null })));
  stream.addEventListener('error', () => {
    if (grace !== undefined) {
      close();
      return;
    }
    if (stream.readyState === CLOSED) {
      end('The api refused to follow this conversation any further. Reload the page to read it again.');
      close();
    }
  });
  return () => {
    close();
    if (frame) frames.cancel(frame);
  };
}

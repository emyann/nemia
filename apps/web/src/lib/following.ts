import type { TranscriptEvent } from './api.ts';
import { mergeEvents } from './transcript.ts';

/** A step's conversation as a page holds it: the events so far, whether more may come, and why it could not be read, if it could not. */
export type Following = { events: TranscriptEvent[]; live: boolean; loading: boolean; error: string | null };

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
 * How long a stream that has said it is over — `settled`, or a read that will not work again — is given to end its response, before the page
 * closes it all the same. The api ends it right after that last event.
 */
export const END_GRACE_MS = 2_000;

/**
 * What each of a step's stream events does to what a page holds of its conversation (`update`), apart from React, so it is tested without a
 * browser: `useStepTranscript` opens the stream and hands it here. Each `transcript` event is merged in, a frame's worth at once; `settled`
 * ends it; a read that failed and is tried again every second is said, and one that will not be is the end; and a dropped connection is the
 * EventSource's to resume. Returns what stops following.
 *
 * A stream that said it is over is closed once the api has ended its response — the `error` an EventSource fires then, before it would
 * reconnect — or after `END_GRACE_MS`, and not the moment its last event arrives. Closed then, while the rest of the response is still on its
 * way, the browser aborts a request that was answered in full (`net::ERR_ABORTED`), which the e2e's watch rightly counts as a failed request:
 * the say page failed on it two runs in five. The page stops following at once all the same.
 */
export function follow(stream: StreamLike, update: (change: (s: Following) => Following) => void, frames: Frames): () => void {
  let arrived: TranscriptEvent[] = [];
  let frame = 0;
  // Set once the stream said it is over: its response is closed when the api has ended it, or when the grace runs out.
  let grace: ReturnType<typeof setTimeout> | undefined;
  const close = () => {
    if (grace !== undefined) clearTimeout(grace);
    stream.close();
  };
  const flush = () => {
    frame = 0;
    const merged = arrived;
    arrived = [];
    update((s) => ({ ...s, events: mergeEvents(s.events, merged) }));
  };
  const end = (error: string | null) => {
    grace ??= setTimeout(close, END_GRACE_MS);
    if (frame) {
      frames.cancel(frame);
      flush();
    }
    update((s) => ({ ...s, live: false, error }));
  };
  stream.addEventListener('transcript', (message) => {
    arrived.push(JSON.parse(message.data) as TranscriptEvent);
    frame ||= frames.request(flush);
  });
  stream.addEventListener('settled', () => end(null));
  // A read that failed, and is being tried again every second: said, and still followed. One that will not be: the end.
  stream.addEventListener('unreadable', (message) => {
    const { error, retrying } = JSON.parse(message.data) as { error?: unknown; retrying?: unknown };
    const said = typeof error === 'string' ? error : 'The conversation could not be read.';
    if (retrying === true) update((s) => ({ ...s, error: `${said} Reading it again every second.` }));
    else end(said);
  });
  // The server's read works again, on the stream that said it failed.
  stream.addEventListener('readable', () => update((s) => ({ ...s, error: null })));
  // A connection made: the first, or one the EventSource made again after a drop — the api restarted, say. A fresh server stream has no
  // failure of its own to clear, so it never sends `readable`, and a retry error left from before the drop stayed up while events flowed.
  // A read that fails on the new stream says so again.
  stream.addEventListener('open', () => update((s) => (s.error === null ? s : { ...s, error: null })));
  stream.addEventListener('error', () => {
    // The api ended the response after saying the stream is over: closed now, answered in full, before the EventSource reconnects.
    if (grace !== undefined) {
      close();
      return;
    }
    // A dropped connection is retried by the EventSource itself; it closes only when the api answered with a refusal.
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

/**
 * A step's conversation followed on its stream (`follow`): what each event the stream sends does to what the page holds, with a stream this
 * file dispatches events on, and frames that flush at once.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { animationFrames, END_GRACE_MS, follow, type Following, type StreamLike } from '../src/lib/following.ts';
import type { TranscriptEvent } from '../src/lib/api.ts';

/** An EventSource as far as `follow` uses it: its state, its events, and `close`. */
class Stream implements StreamLike {
  readyState = 1;
  readonly #target = new EventTarget();
  /**
   * Typed as an EventSource types it: a listener takes a `MessageEvent`, though `open` and `error` reach it as plain events, there as here.
   */
  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    this.#target.addEventListener(type, listener as EventListener);
  }
  dispatchEvent(event: Event): void {
    this.#target.dispatchEvent(event);
  }
  close() {
    this.readyState = 2;
  }
  send(type: string, data: object = {}) {
    this.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) }));
  }
}

const said = (id: string, second: number, text: string): TranscriptEvent => ({
  id,
  at: new Date(Date.UTC(2026, 8, 14, 9, 0, second)).toISOString(),
  role: 'assistant',
  kind: 'text',
  text,
});

/** The api ends a stream's response: the EventSource fires `error` as it would before reconnecting. */
const endsResponse = (stream: Stream): void => {
  stream.readyState = 0;
  stream.dispatchEvent(new Event('error'));
};

/** A live conversation followed on a fresh stream, and what the page holds of it after each event. */
function followed() {
  let state: Following = { events: [], live: true, loading: false, error: null };
  const stream = new Stream();
  const stop = follow(
    stream,
    (change) => {
      state = change(state);
    },
    { request: (flush) => (flush(), 0), cancel: () => {} },
  );
  return { stream, now: () => state, stop };
}

test('a stream that errors, then opens again with events, shows no error — the api restarted, and its fresh stream sends no `readable`', () => {
  const { stream, now } = followed();
  stream.send('transcript', said('e1', 1, 'Looking first.'));
  stream.send('unreadable', { error: 'Could not read the journal of t-1.', retrying: true });
  assert.equal(now().error, 'Could not read the journal of t-1. Reading it again every second.');

  stream.readyState = 0;
  stream.dispatchEvent(new Event('error'));
  assert.deepEqual(
    [now().live, now().error],
    [true, 'Could not read the journal of t-1. Reading it again every second.'],
    'the api goes down and the EventSource reconnects by itself: still followed, the error still said',
  );

  stream.readyState = 1;
  stream.dispatchEvent(new Event('open'));
  stream.send('transcript', said('e2', 2, 'Back at it.'));
  assert.equal(now().error, null, "a fresh stream from the last event's id, whose reads work, says nothing of the failure before");
  assert.deepEqual(
    now().events.map((e) => e.id),
    ['e1', 'e2'],
  );
  assert.equal(now().live, true);

  stream.send('unreadable', { error: 'Could not read the journal of t-1.', retrying: true });
  assert.match(now().error!, /Reading it again every second\.$/, 'a read that fails on the new stream is said again');
});

test('the rest of the stream keeps its meaning: `readable` clears the error, `settled` ends it with none, and a refusal or a read that will not work again ends it with the error', () => {
  const retrying = followed();
  retrying.stream.send('unreadable', { error: 'Could not read it.', retrying: true });
  retrying.stream.send('readable');
  assert.deepEqual([retrying.now().live, retrying.now().error], [true, null]);
  retrying.stream.send('settled', { cursor: 'c' });
  assert.deepEqual([retrying.now().live, retrying.now().error], [false, null]);
  endsResponse(retrying.stream);
  assert.equal(retrying.stream.readyState, 2, 'closed once the api has ended the response');

  const lost = followed();
  lost.stream.send('unreadable', { error: 'Its task is gone from the engine.', retrying: false });
  assert.deepEqual([lost.now().live, lost.now().error], [false, 'Its task is gone from the engine.']);
  endsResponse(lost.stream);
  assert.equal(lost.stream.readyState, 2);

  const refused = followed();
  refused.stream.readyState = 2;
  refused.stream.dispatchEvent(new Event('error'));
  assert.equal(refused.now().live, false, 'the api refused to go on: the EventSource closes, and never opens again');
  assert.match(
    refused.now().error!,
    /^The api refused to follow this conversation any further/,
    'the page says the api refused, and nothing clears it',
  );

  const quiet = followed();
  const before = quiet.now();
  quiet.stream.dispatchEvent(new Event('open'));
  assert.equal(quiet.now(), before, 'an open on a stream with no error changes nothing a page holds');
});

test("REFUSED: the page's frames are the browser's own functions, called as the browser calls them, which throw called off any object but the window — events that arrive while it follows are merged, not lost", (t) => {
  const window = globalThis as { requestAnimationFrame?: unknown; cancelAnimationFrame?: unknown };
  const [request, cancel] = [window.requestAnimationFrame, window.cancelAnimationFrame];
  const flushes: Array<() => void> = [];
  window.requestAnimationFrame = function (this: unknown, flush: () => void) {
    if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
    flushes.push(flush);
    return flushes.length;
  };
  window.cancelAnimationFrame = function (this: unknown) {
    if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
  };
  t.after(() => Object.assign(window, { requestAnimationFrame: request, cancelAnimationFrame: cancel }));

  let state: Following = { events: [], live: true, loading: false, error: null };
  const stream = new Stream();
  follow(
    stream,
    (change) => {
      state = change(state);
    },
    animationFrames,
  );
  stream.send('transcript', said('e1', 1, 'Said while it ran.'));
  stream.send('transcript', said('e2', 2, 'And again.'));
  assert.equal(flushes.length, 1, 'the two events wait for one frame');
  flushes[0]();
  assert.deepEqual(
    state.events.map((e) => e.id),
    ['e1', 'e2'],
  );
});

test('REFUSED: a stream that said it is over is not closed while the rest of its response is on its way — which the browser reports as a request aborted — but once the api has ended it, before the EventSource reconnects; and after the grace, all the same', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });

  const settled = followed();
  settled.stream.send('settled', { cursor: 'c' });
  assert.equal(settled.now().live, false, 'settled: the page stops following at once');
  assert.equal(settled.stream.readyState, 1, 'not closed while its response may still be arriving');
  endsResponse(settled.stream);
  assert.deepEqual(
    [settled.stream.readyState, settled.now().error],
    [2, null],
    'the api ends the response: closed then, so the EventSource does not reconnect, and nothing is said of a refusal',
  );
  let closes = 0;
  settled.stream.close = () => void closes++;
  t.mock.timers.tick(END_GRACE_MS);
  assert.equal(closes, 0, 'the grace was cleared when it closed');

  const hanging = followed();
  hanging.stream.send('unreadable', { error: 'Its task is gone from the engine.', retrying: false });
  t.mock.timers.tick(END_GRACE_MS - 1);
  assert.equal(hanging.stream.readyState, 1, 'an api that never ends it: not closed before the grace');
  t.mock.timers.tick(1);
  assert.deepEqual(
    [hanging.stream.readyState, hanging.now().error],
    [2, 'Its task is gone from the engine.'],
    'an api that never ends it: closed after the grace',
  );

  const left = followed();
  left.stream.send('settled', { cursor: 'c' });
  left.stop();
  assert.equal(left.stream.readyState, 2, 'stopped by the page before the api ended it: closed');
  let again = 0;
  left.stream.close = () => void again++;
  t.mock.timers.tick(END_GRACE_MS);
  assert.equal(again, 0, 'stopped by the page: its grace cleared');
});

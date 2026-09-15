/**
 * A step's conversation followed on its stream (`follow`): what each event the stream sends does to what the page holds, with a stream this
 * file dispatches events on, and frames that flush at once.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { animationFrames, follow, type Following } from '../src/lib/following.ts';
import type { TranscriptEvent } from '../src/lib/api.ts';

/** An EventSource as far as `follow` uses it: its state, its events, and `close`. */
class Stream extends EventTarget {
  readyState = 1;
  close() {
    this.readyState = 2;
  }
  send(type: string, data: object = {}) {
    this.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) }));
  }
}

const said = (id: string, second: number, text: string): TranscriptEvent =>
  ({ id, at: new Date(Date.UTC(2026, 8, 14, 9, 0, second)).toISOString(), role: 'assistant', kind: 'text', text });

/** A live conversation followed on a fresh stream, and what the page holds of it after each event. */
function followed() {
  let state: Following = { events: [], live: true, loading: false, error: null };
  const stream = new Stream();
  const stop = follow(stream, (change) => {
    state = change(state);
  }, { request: (flush) => (flush(), 0), cancel: () => {} });
  return { stream, now: () => state, stop };
}

test('a stream that errors, then opens again with events, shows no error — the api restarted, and its fresh stream sends no `readable`', () => {
  const { stream, now } = followed();
  stream.send('transcript', said('e1', 1, 'Looking first.'));
  stream.send('unreadable', { error: 'Could not read the journal of t-1.', retrying: true });
  assert.equal(now().error, 'Could not read the journal of t-1. Reading it again every second.');

  // The api goes down: the connection drops, and the EventSource says so and reconnects by itself. Still followed, the error still said.
  stream.readyState = 0;
  stream.dispatchEvent(new Event('error'));
  assert.deepEqual([now().live, now().error], [true, 'Could not read the journal of t-1. Reading it again every second.']);

  // It is back: the EventSource opens a fresh stream from the last event's id, whose reads work and say nothing of the failure before.
  stream.readyState = 1;
  stream.dispatchEvent(new Event('open'));
  stream.send('transcript', said('e2', 2, 'Back at it.'));
  assert.equal(now().error, null);
  assert.deepEqual(now().events.map((e) => e.id), ['e1', 'e2']);
  assert.equal(now().live, true);

  // A read that fails on the new stream is said again.
  stream.send('unreadable', { error: 'Could not read the journal of t-1.', retrying: true });
  assert.match(now().error!, /Reading it again every second\.$/);
});

test('the rest of the stream keeps its meaning: `readable` clears the error, `settled` ends it with none, and a refusal or a read that will not work again ends it with the error', () => {
  const retrying = followed();
  retrying.stream.send('unreadable', { error: 'Could not read it.', retrying: true });
  retrying.stream.send('readable');
  assert.deepEqual([retrying.now().live, retrying.now().error], [true, null]);
  retrying.stream.send('settled', { cursor: 'c' });
  assert.deepEqual([retrying.now().live, retrying.now().error, retrying.stream.readyState], [false, null, 2]);

  const lost = followed();
  lost.stream.send('unreadable', { error: 'Its task is gone from the engine.', retrying: false });
  assert.deepEqual([lost.now().live, lost.now().error, lost.stream.readyState], [false, 'Its task is gone from the engine.', 2]);

  // The api refused to go on: the EventSource closes, and the page says so. It never opens again, so nothing clears it.
  const refused = followed();
  refused.stream.readyState = 2;
  refused.stream.dispatchEvent(new Event('error'));
  assert.equal(refused.now().live, false);
  assert.match(refused.now().error!, /^The api refused to follow this conversation any further/);

  // An open on a stream with no error changes nothing a page holds.
  const quiet = followed();
  const before = quiet.now();
  quiet.stream.dispatchEvent(new Event('open'));
  assert.equal(quiet.now(), before);
});

test("REFUSED: the page's frames are the browser's own functions, called as the browser calls them — events that arrive while it follows are merged, not lost", (t) => {
  // As a browser's are: called off any object but the window, they throw.
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
  follow(stream, (change) => {
    state = change(state);
  }, animationFrames);
  stream.send('transcript', said('e1', 1, 'Said while it ran.'));
  stream.send('transcript', said('e2', 2, 'And again.'));
  assert.equal(flushes.length, 1, 'the two events wait for one frame');
  flushes[0]!();
  assert.deepEqual(state.events.map((e) => e.id), ['e1', 'e2']);
});

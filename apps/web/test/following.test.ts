/**
 * A step's conversation followed on its stream (`followStep`): what each event the stream sends does to what the page holds, with a
 * stream this file dispatches events on, and frames that flush at once. The transport and the protocol under it are the one follower's,
 * and are proven there (`follow.test.ts`): this file is a step's own meaning.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { StreamLike } from '../src/lib/follow.ts';
import { followedFrom, followStep, unread, type Following } from '../src/lib/following.ts';
import type { TranscriptEvent } from '../src/lib/api.ts';

/** An EventSource as far as `followStep` uses it: its state, its events, and `close`. */
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

/** A live conversation followed on a fresh stream, and what the page holds of it after each event. */
function followed() {
  let state: Following = { ...unread(false), live: true };
  const stream = new Stream();
  const stop = followStep(
    stream,
    (change) => {
      state = change(state);
    },
    { request: (flush) => (flush(), 0), cancel: () => {} },
  );
  return { stream, now: () => state, stop };
}

test("a step's own words reach the page through the follower: the api's retrying read as it said it, and the refusal to follow any further", () => {
  const retrying = followed();
  retrying.stream.send('transcript', said('e1', 1, 'Looking first.'));
  retrying.stream.send('unreadable', {
    error: "Step 'implement' of run 'r-1' runs a session its harness does not push as it is written.",
    retrying: true,
  });
  assert.deepEqual(
    [retrying.now().retrying, retrying.now().error, retrying.now().live],
    ["Step 'implement' of run 'r-1' runs a session its harness does not push as it is written.", null, true],
    "the api's words are drawn as they come, and the page goes on following",
  );
  assert.deepEqual(
    retrying.now().events.map((e) => e.id),
    ['e1'],
    'and what it read stays on the page',
  );

  const refused = followed();
  refused.stream.readyState = 2;
  refused.stream.dispatchEvent(new Event('error'));
  assert.equal(refused.now().live, false, 'the api refused to go on: the EventSource closes, and never opens again');
  assert.match(refused.now().error!, /^The api refused to follow this conversation any further/);

  const lost = followed();
  lost.stream.send('unreadable', { retrying: false });
  assert.equal(lost.now().error, 'The conversation could not be read.', 'and a read the api named nothing of says the step\'s own words');
});

test('the message being written is dropped when the following ends, whatever ends it', () => {
  const ended = followed();
  ended.stream.send('partial', { key: 'm1:0', delta: 'Half a th', last: false });
  assert.deepEqual(ended.now().partial, { key: 'm1:0', text: 'Half a th' });
  ended.stream.send('settled', { cursor: 'c' });
  assert.deepEqual([ended.now().partial, ended.now().live], [null, false]);
});

/** A conversation followed on a fresh stream whose frames the test flushes (`flush`), as the browser's come: what the page holds now. */
function batched() {
  let state: Following = { ...unread(false), live: true };
  const stream = new Stream();
  let pending: (() => void) | undefined;
  followStep(
    stream,
    (change) => {
      state = change(state);
    },
    {
      request: (flush) => {
        pending = flush;
        return 1;
      },
      cancel: () => (pending = undefined),
    },
  );
  const flush = () => {
    const now = pending;
    pending = undefined;
    now?.();
  };
  return { stream, now: () => state, flush };
}

const piece = (key: string, delta: string, last = false) => ({ key, delta, last });

test('a message being written is drawn as its pieces come, by its block, a frame at a time, and a block begun anew replaces it', () => {
  const { stream, now, flush } = batched();
  stream.send('following', { streamed: true });
  flush();
  assert.equal(now().streamed, true, 'the api says it pushes the session as it is written');
  stream.send('partial', piece('m1:0', 'Hel'));
  stream.send('partial', piece('m1:0', 'lo'));
  assert.equal(now().partial, null, 'nothing drawn before the frame');
  flush();
  assert.deepEqual(now().partial, { key: 'm1:0', text: 'Hello' }, 'the pieces of one block added in order');
  stream.send('partial', piece('m1:1', 'Next'));
  flush();
  assert.deepEqual(now().partial, { key: 'm1:1', text: 'Next' }, "another block's piece begins a message of its own");
});

test('the message being written is dropped at its last piece, and a piece of its block that comes after is ignored', () => {
  const { stream, now, flush } = batched();
  stream.send('partial', piece('m1:0', 'Hello'));
  stream.send('partial', piece('m1:0', '', true));
  flush();
  assert.equal(now().partial, null, 'its block is whole');
  stream.send('partial', piece('m1:0', ' late'));
  flush();
  assert.equal(now().partial, null, 'a stale piece of a closed block draws nothing');
});

test('the whole message replaces the one being written, in the frame they came in, and closes its block; a block begun after it is kept', () => {
  const { stream, now, flush } = batched();
  stream.send('partial', piece('m1:0', 'Hello there'));
  flush();
  stream.send('transcript', said('m1', 1, 'Hello there'));
  stream.send('partial', piece('m2:0', 'And'));
  flush();
  assert.deepEqual(
    now().events.map((e) => e.text),
    ['Hello there'],
    'the whole message is drawn',
  );
  assert.deepEqual(now().partial, { key: 'm2:0', text: 'And' }, 'the next message, begun after the whole one in the same frame, is kept');
  stream.send('transcript', said('m2', 2, 'And so on'));
  stream.send('partial', piece('m2:0', ' late'));
  flush();
  assert.equal(now().partial, null, 'a piece of the block the whole message closed is ignored');
});

test("moved empties the conversation and drops the message being written; the next attempt's history comes after it", () => {
  const { stream, now, flush } = batched();
  stream.send('transcript', said('e1', 1, 'First try.'));
  stream.send('partial', piece('m1:0', 'Half'));
  flush();
  stream.send('moved', { taskId: 't-2' });
  flush();
  assert.equal(now().events.length, 0, 'the conversation of the attempt left behind is gone');
  assert.equal(now().partial, null, 'and so is the message it was writing');
  stream.send('transcript', said('f1', 1, 'Second try.'));
  flush();
  assert.deepEqual(
    now().events.map((e) => e.id),
    ['f1'],
    "the conversation as the next attempt's history gives it",
  );
});

test('REFUSED: an event whose data is not of its shape is ignored — a piece with no key, a transcript event of no known kind', () => {
  const { stream, now, flush } = batched();
  stream.send('partial', { delta: 'Hello', last: false });
  stream.send('partial', { key: 'm1:0', delta: 7, last: false });
  stream.send('transcript', { ...said('e1', 1, 'x'), kind: 'shout' });
  stream.send('following', { streamed: 'yes' });
  flush();
  assert.deepEqual([now().partial, now().events.length, now().streamed], [null, 0, false]);
  stream.dispatchEvent(new MessageEvent('partial', { data: 'not json' }));
  flush();
  assert.equal(now().partial, null);
});

test('a step is followed from its first read while its task is live, and while it waits on a person; else, or with no cursor, read once', () => {
  assert.equal(followedFrom({ live: true, cursor: '3' }, false), '3', 'a live task is followed');
  assert.equal(followedFrom({ live: false, cursor: '3' }, true), '3', 'a step held on a person is followed, its next turn to come');
  assert.equal(followedFrom({ live: false, cursor: '3' }, false), null, 'a finished step is read once');
  assert.equal(followedFrom({ live: true, cursor: null }, true), null, 'a read with no cursor gives nothing to follow from');
});

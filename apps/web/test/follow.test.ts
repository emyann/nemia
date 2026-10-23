/**
 * The one follower both of the board's conversations run on (`src/lib/follow.ts`): the transport and the protocol, over a stand-in
 * conversation this file describes, a stream it dispatches events on, and frames it flushes itself. What each conversation means by its
 * own events is its own file's test (`following.test.ts`, `chat.test.ts`).
 *
 * And the rule that there is one of them: no file of `src/lib` listens for `unreadable` itself but the core, and `feed.ts`, exempt by
 * name with its reason.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { animationFrames, CLOSED, END_GRACE_MS, follow, type Followed, type Follower, type StreamLike } from '../src/lib/follow.ts';

/** A stream as far as `follow` uses it: its state, the events it sends, and `close`. */
class Stream implements StreamLike {
  readyState = 1;
  readonly #target = new EventTarget();
  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    this.#target.addEventListener(type, listener as EventListener);
  }
  close() {
    this.readyState = 2;
  }
  send(type: string, data: unknown = {}) {
    this.#target.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) }));
  }
  fire(type: string) {
    this.#target.dispatchEvent(new Event(type));
  }
}

/** The api ends a stream's response: an EventSource fires `error` as it would before reconnecting. */
const endsResponse = (stream: Stream): void => {
  stream.readyState = 0;
  stream.fire('error');
};

/** A conversation of no page: the words said, how many marks came, and whether a following that ended left its mark. */
type Talk = Followed & { words: string[]; marks: number; ended: boolean };

/** What one of its events brings: words, or a mark. */
type Arrival = { kind: 'words'; words: string[] } | { kind: 'mark' };

const blank = (): Talk => ({ words: [], marks: 0, ended: false, live: true, error: null, retrying: null });

/** A conversation whose `said` carries words, whose `marked` carries nothing, and whose `done` is the end of it. */
const talker: Follower<Talk, Arrival> = {
  reads: {
    said: (m) => {
      const words = String(JSON.parse(m.data));
      return words ? [{ kind: 'words', words: [words] }] : [];
    },
    marked: () => [{ kind: 'mark' }],
  },
  over: ['done'],
  fold: (s, c) => (c.kind === 'words' ? { ...s, words: [...s.words, ...c.words] } : { ...s, marks: s.marks + 1 }),
  joined: (last, next) => {
    if (last.kind !== 'words' || next.kind !== 'words') return false;
    last.words.push(...next.words);
    return true;
  },
  ending: (s) => ({ ...s, ended: true }),
  opened: (s) => (s.live ? s : { ...s, live: true }),
  unreadable: (m) => JSON.parse(m.data) as { error: string; retrying: boolean },
  words: { unread: 'It could not be read.', refused: 'The api refused to follow it any further.' },
};

/** The conversation followed on a fresh stream whose frames the test flushes itself: what it holds now. */
function followed() {
  let state = blank();
  const stream = new Stream();
  let pending: (() => void) | undefined;
  let asked = 0;
  const stop = follow(
    stream,
    talker,
    (change) => {
      state = change(state);
    },
    {
      request: (flush) => {
        pending = flush;
        asked += 1;
        return asked;
      },
      cancel: () => (pending = undefined),
    },
  );
  const flush = () => {
    const now = pending;
    pending = undefined;
    now?.();
  };
  return { stream, now: () => state, flush, stop, frames: () => asked };
}

test('follow: the transport and the protocol of a followed conversation, each case on a stream of its own', async (t) => {
  await t.test('the arrivals that come together are folded once, on one frame, and two of one kind join as they queue', () => {
    const { stream, now, flush, frames } = followed();
    stream.send('said', 'One.');
    stream.send('said', 'Two.');
    stream.send('marked');
    stream.send('said', 'Three.');
    assert.deepEqual([now().words, now().marks], [[], 0], 'nothing is folded before the frame');
    assert.equal(frames(), 1, 'the four arrivals wait for one frame');
    flush();
    assert.deepEqual(now().words, ['One.', 'Two.', 'Three.'], 'in the order they came');
    assert.equal(now().marks, 1, 'the mark between them was not joined into either side');
  });
  await t.test('an event the conversation does not read brings nothing, and one of no name at all is not listened for', () => {
    const { stream, now, flush } = followed();
    stream.send('said', '');
    stream.send('shouted', 'Hey.');
    flush();
    assert.deepEqual([now().words, now().marks], [[], 0]);
  });
  await t.test(
    'a read the api says it is making again is a notice, not an end: it fills `retrying`, leaves `error` null and keeps the stream',
    () => {
      const { stream, now } = followed();
      stream.send('unreadable', { error: 'Its journal could not be read.', retrying: true });
      assert.deepEqual(
        [now().retrying, now().error, now().live, now().ended, stream.readyState],
        ['Its journal could not be read.', null, true, false, 1],
        'the page is told why, and goes on following',
      );
      stream.send('readable');
      assert.deepEqual([now().retrying, now().error, now().live], [null, null, true], 'and a read that works again clears it');
    },
  );
  await t.test(
    'a read the api will not make again is the end: it fills `error`, clears `retrying`, and leaves what the conversation leaves',
    () => {
      const { stream, now } = followed();
      stream.send('unreadable', { error: 'Reading it again.', retrying: true });
      stream.send('unreadable', { error: 'Its task is gone.', retrying: false });
      assert.deepEqual([now().error, now().retrying, now().live, now().ended], ['Its task is gone.', null, false, true]);
    },
  );
  await t.test('a read the api named nothing of says the conversation’s own words', () => {
    const { stream, now } = followed();
    stream.send('unreadable', { retrying: false });
    assert.equal(now().error, 'It could not be read.');
  });
  await t.test('a connection made clears both, and changes nothing a page holds where there is nothing to clear', () => {
    const { stream, now } = followed();
    stream.send('unreadable', { error: 'Reading it again.', retrying: true });
    stream.fire('open');
    assert.deepEqual([now().retrying, now().error], [null, null], 'a fresh server stream sends no `readable`, so the connection clears it');
    const before = now();
    stream.fire('open');
    assert.equal(now(), before, 'an open on a stream with nothing said changes nothing');
  });
  await t.test('the api refusing to follow any further closes the EventSource for good, and says so', () => {
    const { stream, now } = followed();
    stream.readyState = CLOSED;
    stream.fire('error');
    assert.deepEqual([now().live, now().error], [false, 'The api refused to follow it any further.']);
  });
  await t.test(
    'REFUSED: a stream that said it is over is closed once the api has ended its response, or after the grace, never the moment its last event came',
    (t) => {
      t.mock.timers.enable({ apis: ['setTimeout'] });

      const over = followed();
      over.stream.send('done');
      assert.deepEqual(
        [over.now().live, over.now().ended, over.stream.readyState],
        [false, true, 1],
        'not closed while its response may arrive',
      );
      endsResponse(over.stream);
      assert.deepEqual([over.stream.readyState, over.now().error], [2, null], 'closed then, and nothing said of a refusal');
      let closes = 0;
      over.stream.close = () => void closes++;
      t.mock.timers.tick(END_GRACE_MS);
      assert.equal(closes, 0, 'the grace was cleared when it closed');

      const hanging = followed();
      hanging.stream.send('unreadable', { error: 'Its task is gone.', retrying: false });
      t.mock.timers.tick(END_GRACE_MS - 1);
      assert.equal(hanging.stream.readyState, 1, 'an api that never ends it: not closed before the grace');
      t.mock.timers.tick(1);
      assert.equal(hanging.stream.readyState, 2, 'an api that never ends it: closed after the grace');

      const left = followed();
      left.stream.send('done');
      left.stop();
      assert.equal(left.stream.readyState, 2, 'stopped by the page before the api ended it: closed');
      let again = 0;
      left.stream.close = () => void again++;
      t.mock.timers.tick(END_GRACE_MS);
      assert.equal(again, 0, 'stopped by the page: its grace cleared');
    },
  );
  await t.test('an end folds what arrived in the frame it cancels, so nothing said before it is lost', () => {
    const { stream, now } = followed();
    stream.send('said', 'The last word.');
    stream.send('done');
    assert.deepEqual([now().words, now().live], [['The last word.'], false]);
  });
  await t.test(
    "REFUSED: the page's frames are the browser's own functions, called as the browser calls them, which throw called off any object but the window",
    (t) => {
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

      let state = blank();
      const stream = new Stream();
      follow(
        stream,
        talker,
        (change) => {
          state = change(state);
        },
        animationFrames,
      );
      stream.send('said', 'Said while it ran.');
      stream.send('said', 'And again.');
      assert.equal(flushes.length, 1, 'the two events wait for one frame');
      flushes[0]();
      assert.deepEqual(state.words, ['Said while it ran.', 'And again.']);
    },
  );
});

/** A file of `src/lib` that listens for an `unreadable` event itself, matched across the line breaks a formatter may leave. */
const LISTENS = /addEventListener\(\s*'unreadable'/;

/** The core, which owns the listener, and the one file exempt from the rule, with why it is. */
const OWN = 'follow.ts';
const EXEMPT = new Map([
  [
    'feed.ts',
    "the frame's feed reopens on its own, carries a status of its own and invalidates queries, and what the core would have to grow to hold that is more than the two conversations need",
  ],
]);

/** Each `.ts` file of `src/lib` by its name, with its source. */
const libFiles = (): Map<string, string> => {
  const dir = new URL('../src/lib/', import.meta.url);
  const names = fs.readdirSync(dir).filter((name) => name.endsWith('.ts'));
  return new Map(names.map((name) => [name, fs.readFileSync(new URL(name, dir), 'utf8')]));
};

/** The names of `files` that listen for `unreadable` themselves. */
const listeners = (files: Map<string, string>): string[] => [...files].filter(([, source]) => LISTENS.test(source)).map(([name]) => name);

test('the one follower: no file of `src/lib` listens for `unreadable` itself but `follow.ts`, and `feed.ts`, exempt by name', () => {
  const files = libFiles();
  for (const name of [OWN, 'following.ts', 'chatFollowing.ts', ...EXEMPT.keys()]) {
    assert.ok(files.has(name), `${name}: the rule is about files that are there`);
  }
  assert.ok(listeners(files).includes(OWN), 'the core itself listens for it');
  assert.deepEqual(
    listeners(files).filter((name) => name !== OWN && !EXEMPT.has(name)),
    [],
    'a conversation that listens for `unreadable` itself is a second follower: hand `follow` a `Follower` instead',
  );
  assert.deepEqual(
    listeners(new Map([['another.ts', "stream.addEventListener(\n  'unreadable',\n  (message) => {},\n);"]])),
    ['another.ts'],
    'REFUSED: a listener of its own, written across lines as a formatter leaves it',
  );
});

/**
 * The workflow feed followed (`followFeed`): the queries each event reads again, and how the stream is kept — with streams this file
 * dispatches events on, frames it flushes when it says, and timers it runs by hand.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient, type QueryKey } from '@tanstack/react-query';
import { END_GRACE_MS, type Frames, type StreamLike } from '../src/lib/following.ts';
import { FALLBACK_MS, type FeedStatus, filterOf, followFeed, keysOf, pace, polled, REOPEN_MS } from '../src/lib/feed.ts';

/** An EventSource as far as `followFeed` uses it: its state, its events, and `close`. */
class Stream implements StreamLike {
  readyState = 0;
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
  readonly after: string | undefined;
  constructor(after: string | undefined) {
    this.after = after;
  }
  close() {
    this.readyState = 2;
  }
  opens() {
    this.readyState = 1;
    this.dispatchEvent(new Event('open'));
  }
  send(type: string, data: object, id = '') {
    this.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data), lastEventId: id }));
  }
  /** The connection dropped, or the api ended the response: the EventSource fires `error` as it reconnects by itself. */
  drops() {
    this.readyState = 0;
    this.dispatchEvent(new Event('error'));
  }
  /** Refused — a 400, or a proxy's 5xx: the EventSource fires `error` and closes for good. */
  refused() {
    this.readyState = 2;
    this.dispatchEvent(new Event('error'));
  }
}

/** The feed followed, with every stream opened, the invalidations made, the statuses said, and frames and timers run on demand. */
function followed() {
  const streams: Stream[] = [];
  const invalidated: QueryKey[][] = [];
  const statuses: FeedStatus[] = [];
  let pending: Array<() => void> = [];
  const frames: Frames = { request: (flush) => pending.push(flush), cancel: (frame) => (pending[frame - 1] = () => {}) };
  let clock = 0;
  const timers = new Map<number, { at: number; f: () => void }>();
  let next = 0;
  const stop = followFeed(
    (after) => {
      const stream = new Stream(after);
      streams.push(stream);
      return stream;
    },
    { invalidate: (keys) => invalidated.push(keys), status: (s) => statuses.push(s) },
    frames,
    {
      set: (f, ms) => {
        timers.set(++next, { at: clock + ms, f });
        return next as unknown as ReturnType<typeof setTimeout>;
      },
      clear: (t) => void timers.delete(t as unknown as number),
    },
  );
  return {
    streams,
    stream: () => streams[streams.length - 1],
    invalidated,
    statuses,
    stop,
    /** The frame comes: what arrived in it is invalidated, once. */
    frame: () => {
      const due = pending;
      pending = [];
      for (const flush of due) flush();
    },
    /** `ms` pass: each timer due by then runs. */
    pass: (ms: number) => {
      clock += ms;
      // oxlint-disable-next-line unicorn/no-useless-spread -- a snapshot: a timer that runs may set another, which waits for the next pass
      for (const [id, t] of [...timers]) {
        if (t.at > clock) continue;
        timers.delete(id);
        t.f();
      }
    },
    timersSet: () => timers.size,
  };
}

const line = (run: string, step?: string) => ({ at: '2026-09-22T21:00:00.000Z', run, ...(step ? { step } : {}), word: 'running' });

test('each event names the queries it can change, and no other: a step its run and the list, a run the cap and the inbox too, a removal its record and the cap', () => {
  assert.deepEqual(keysOf('step', 'r-1'), [['runs'], ['runs-open'], ['runs-finished'], ['runs', 'r-1'], ['daemon']]);
  assert.deepEqual(keysOf('run', 'r-1'), [
    ['runs'],
    ['runs-open'],
    ['runs-finished'],
    ['runs', 'r-1'],
    ['ceilings'],
    ['inbox'],
    ['daemon'],
  ]);
  assert.deepEqual(keysOf('removed', 'r-1'), [['runs'], ['runs-open'], ['runs-finished'], ['runs', 'r-1'], ['ceilings'], ['daemon']]);
  for (const event of ['step', 'run', 'removed'] as const) {
    assert.ok(
      keysOf(event, 'r-1').every((key) => key.length <= 2),
      `${event} names no decision: a decision is keyed by the run's state, read again under a key of its own when the record moves`,
    );
  }
});

test('a run removed has its record read again, exactly: the read that finds none is how a page open on it learns it is gone', () => {
  const f = followed();
  f.stream().opens();
  f.stream().send('removed', line('r-1'), '10');
  f.frame();
  const keys = f.invalidated[0].map((k) => JSON.stringify(k));
  assert.ok(keys.includes(JSON.stringify(['runs', 'r-1'])), `the run's record is read again: ${keys.join(' ')}`);
  assert.deepEqual(
    keysOf('removed', 'r-1').filter((key) => key[0] === 'runs' && key.length > 1),
    [['runs', 'r-1']],
    "its record, and never its decision or another run's: invalidated exactly, a key of two",
  );
  f.stop();
});

test('every event reads again whether a daemon ticks, exactly: a line on the feed is written by a tick', () => {
  const f = followed();
  f.stream().opens();
  for (const [event, id] of [
    ['step', '10'],
    ['run', '20'],
    ['removed', '30'],
  ] as const) {
    assert.deepEqual(
      keysOf(event, 'r-1').filter((key) => key[0] === 'daemon'),
      [['daemon']],
      `${event} reads ['daemon'], and nothing under it`,
    );
    f.stream().send(event, line('r-1', event === 'step' ? 'plan' : undefined), id);
    f.frame();
    assert.ok(
      f.invalidated.at(-1)!.some((k) => JSON.stringify(k) === JSON.stringify(['daemon'])),
      `a ${event} event alone reads the daemon again`,
    );
  }
  f.stop();
});

test("a daemon's line names no run and reads the daemon's standing alone: nothing of a run's record, the cap or the inbox", () => {
  assert.deepEqual(keysOf('daemon'), [['daemon']]);
});

test("a daemon's start line is seen on the feed, not on the fallback a minute later", () => {
  const f = followed();
  f.stream().opens();
  f.stream().send('daemon', { at: '2026-09-22T21:00:00.000Z', daemon: 4242, word: 'daemon started' }, '10');
  f.frame();
  assert.deepEqual(f.invalidated, [[['daemon']]], "the daemon's standing is read again on the line itself, and no key of a run is");
  f.stop();
});

test('the polled queries are the runs, a run, the cap, and whether a daemon ticks — never a decision, the inbox, or anything else', () => {
  for (const key of [['runs'], ['runs', 'r-1'], ['ceilings'], ['daemon']]) assert.equal(polled(key), true, JSON.stringify(key));
  for (const key of [
    ['runs', 'r-1', 'decision', 'stamp'],
    ['inbox'],
    ['inbox', 'card'],
    ['quota'],
    ['workflows'],
    ['ceilings', 'x'],
    ['daemon', 'x'],
  ]) {
    assert.equal(polled(key), false, JSON.stringify(key));
  }
});

test('the light answer is polled, for every factory and for one, and no key under a factory is', () => {
  assert.equal(polled(['runs-open']), true);
  assert.equal(polled(['runs-open', 'harbour']), true);
  assert.equal(polled(['runs-open', 'harbour', 'x']), false);
});

test('every page of the finished runs is polled and read again on an event, under the one key that stands for them', async () => {
  assert.equal(polled(['runs-finished']), true);
  assert.equal(polled(['runs-finished', null, 2]), true);
  assert.equal(polled(['runs-finished', 'harbour', 1]), true);
  assert.deepEqual(filterOf(['runs-finished']), { queryKey: ['runs-finished'], exact: false });
  const client = new QueryClient();
  const pages: QueryKey[] = [
    ['runs-finished', null, 1],
    ['runs-finished', 'harbour', 3],
  ];
  for (const key of pages) client.setQueryData(key, {});
  for (const event of ['step', 'run', 'removed'] as const) {
    for (const key of pages) client.setQueryData(key, {});
    await Promise.all(keysOf(event, 'a').map((key) => client.invalidateQueries(filterOf(key))));
    assert.deepEqual(
      pages.filter((key) => client.getQueryState(key)?.isInvalidated),
      pages,
      `a ${event} event reads each page again`,
    );
  }
  client.clear();
});

test("REFUSED: an event reads a factory's light answer again with every factory's, and still no decision", async () => {
  const seeded: QueryKey[] = [['runs'], ['runs', 'a'], ['runs', 'a', 'decision', 's'], ['runs-open'], ['runs-open', 'harbour']];
  const marked = async (filter: (key: QueryKey) => { queryKey: QueryKey; exact: boolean }) => {
    const client = new QueryClient();
    for (const key of seeded) client.setQueryData(key, {});
    await Promise.all(keysOf('step', 'a').map((key) => client.invalidateQueries(filter(key))));
    const keys = seeded.filter((key) => client.getQueryState(key)?.isInvalidated);
    client.clear();
    return keys;
  };
  assert.deepEqual(await marked(filterOf), [['runs'], ['runs', 'a'], ['runs-open'], ['runs-open', 'harbour']]);
  assert.deepEqual(
    await marked((queryKey) => ({ queryKey, exact: true })),
    [['runs'], ['runs', 'a'], ['runs-open']],
    "invalidated exactly, a factory's answer is left as it was",
  );
  assert.deepEqual(filterOf(['runs']), { queryKey: ['runs'], exact: true });
  assert.deepEqual(filterOf(['runs', 'a']), { queryKey: ['runs', 'a'], exact: true });
  assert.deepEqual(filterOf(['runs-open']), { queryKey: ['runs-open'], exact: false });
});

test('the events that arrive together are read again once a frame, each key once, and each run named has its record read', () => {
  const f = followed();
  f.stream().opens();
  f.stream().send('step', line('r-1', 'plan'), '10');
  f.stream().send('step', line('r-1', 'implement'), '20');
  f.stream().send('run', line('r-1'), '30');
  f.stream().send('step', line('r-2', 'plan'), '40');
  assert.deepEqual(f.invalidated, [] as QueryKey[][], 'nothing before the frame');
  f.frame();
  assert.equal(f.invalidated.length, 1, 'one invalidation for the frame');
  assert.deepEqual(
    new Set(f.invalidated[0].map((k) => JSON.stringify(k))),
    new Set(
      [['runs'], ['runs-open'], ['runs-finished'], ['runs', 'r-1'], ['ceilings'], ['inbox'], ['daemon'], ['runs', 'r-2']].map((k) =>
        JSON.stringify(k),
      ),
    ),
  );
  assert.equal(f.invalidated[0].length, 8, 'each key once');
  f.frame();
  assert.equal(f.invalidated.length, 1, 'an empty frame invalidates nothing');
  f.stop();
});

test('the polls slow while the stream is open, and come back to their pace while it is not', () => {
  const f = followed();
  assert.equal(pace(5_000), 5_000, 'connecting: polled at its own pace');
  f.stream().opens();
  assert.equal(pace(5_000), FALLBACK_MS, 'open: the fallback');
  assert.ok(FALLBACK_MS > 5_000);

  f.stream().drops();
  assert.equal(pace(5_000), 5_000, 'dropped, and resumed by the EventSource: its own pace until it is back');
  f.stream().opens();
  assert.equal(pace(5_000), FALLBACK_MS);
  assert.equal(f.streams.length, 1, 'the EventSource resumed it: none opened here');

  f.stream().send('unreadable', { error: 'EIO', retrying: true });
  assert.equal(pace(5_000), 5_000, 'the api cannot read the feed for now: polled');
  f.stream().send('readable', {});
  assert.equal(pace(5_000), FALLBACK_MS, 'it reads again');
  assert.deepEqual(f.statuses, ['connecting', 'open', 'down', 'open', 'down', 'open']);

  f.stop();
  assert.equal(pace(5_000), 5_000, 'stopped: nothing follows');
});

test('a feed cut under the cursor is closed on the `error` fired as the api ends the response — not on the event — and opened again from the start', () => {
  const f = followed();
  f.stream().opens();
  f.stream().send('step', line('r-1', 'plan'), '10');
  const cut = f.stream();
  cut.send('unreadable', { error: 'cursor 10 is past the end of the feed', retrying: false });
  assert.equal(cut.readyState, 1, 'not closed on the event: the response is still on its way');
  assert.equal(f.statuses.at(-1), 'down');
  cut.drops();
  assert.equal(cut.readyState, 2, 'closed once the api has ended the response, before the EventSource reconnects');
  assert.equal(f.streams.length, 2, 'and opened again');
  assert.equal(f.stream().after, undefined, 'from the start: the cursor is what the api cannot read from');
  f.stream().opens();
  assert.equal(f.statuses.at(-1), 'open');
  assert.equal(f.timersSet(), 0, 'no grace left running');
  f.stop();
});

test('a cut feed whose response never ends is closed after the grace, and opened again from the start', () => {
  const f = followed();
  f.stream().opens();
  f.stream().send('step', line('r-1', 'plan'), '10');
  const cut = f.stream();
  cut.send('unreadable', { error: 'the feed was replaced', retrying: false });
  f.pass(END_GRACE_MS - 1);
  assert.equal(cut.readyState, 1, 'given its grace');
  f.pass(1);
  assert.equal(cut.readyState, 2);
  assert.deepEqual(
    f.streams.map((s) => s.after),
    [undefined, undefined],
  );
  f.stop();
});

test('a stream the api refused is opened again after a while from the last event read, and from the start if that is refused before it opens', () => {
  const f = followed();
  f.stream().opens();
  f.stream().send('run', line('r-1'), '10');
  f.stream().send('step', line('r-1', 'plan'), '42');
  f.stream().refused();
  assert.equal(f.statuses.at(-1), 'down');
  assert.equal(pace(5_000), 5_000);
  f.pass(REOPEN_MS - 1);
  assert.equal(f.streams.length, 1, 'not at once');
  f.pass(1);
  assert.deepEqual(
    f.streams.map((s) => s.after),
    [undefined, '42'],
    'from the last event read',
  );

  f.stream().refused();
  f.pass(REOPEN_MS);
  assert.deepEqual(
    f.streams.map((s) => s.after),
    [undefined, '42', undefined],
    "refused again before it opened, the cursor may be what is refused (a 400 reads as a proxy's 5xx does): the next goes from the start",
  );
  f.stream().refused();
  f.pass(REOPEN_MS);
  assert.deepEqual(
    f.streams.map((s) => s.after),
    [undefined, '42', undefined, undefined],
    'one from the start refused too, while the api is not there yet, is tried again from the start',
  );
  f.stream().opens();
  assert.equal(f.statuses.at(-1), 'open');
  f.stop();
});

test('a dropped connection is left to the EventSource, which resumes it with the last id: nothing is opened here', () => {
  const f = followed();
  f.stream().opens();
  f.stream().send('step', line('r-1', 'plan'), '10');
  f.stream().drops();
  f.pass(REOPEN_MS * 3);
  assert.equal(f.streams.length, 1);
  assert.equal(f.stream().readyState, 0, 'still the EventSource’s to reconnect');
  f.stop();
});

test('stopping closes the stream, and cancels what was pending: the frame, the grace and the reopening', () => {
  const f = followed();
  f.stream().opens();
  f.stream().send('step', line('r-1', 'plan'), '10');
  f.stop();
  assert.equal(f.stream().readyState, 2);
  f.frame();
  assert.deepEqual(f.invalidated, [], 'the frame asked for before the stop invalidates nothing');

  const refused = followed();
  refused.stream().opens();
  refused.stream().refused();
  refused.stop();
  refused.pass(REOPEN_MS);
  assert.equal(refused.streams.length, 1, 'no reopening after a stop');

  const cut = followed();
  cut.stream().opens();
  cut.stream().send('unreadable', { error: 'cut', retrying: false });
  cut.stop();
  assert.equal(cut.timersSet(), 0, 'the grace is cancelled');
  cut.pass(END_GRACE_MS);
  assert.equal(cut.streams.length, 1);
});

test('an event a replaced stream still dispatches is not read: only the current stream counts', () => {
  const f = followed();
  f.stream().opens();
  const old = f.stream();
  old.send('unreadable', { error: 'cut', retrying: false });
  old.drops();
  f.stream().opens();
  old.send('step', line('r-9', 'plan'), '99');
  f.frame();
  assert.deepEqual(f.invalidated, []);
  f.stop();
});

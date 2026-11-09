/**
 * One stream shared by the board's tabs (`sharedStream`, `lib/sharedStream.ts`), over Web Locks, a channel and an `EventSource` of the
 * test's own: told as a person's tabs opening and closing — the first holds the one stream and hands each read to the others, a tab that
 * listed past a read passes it, and the lock passes to another tab when the holder goes, which opens the stream again from the last
 * cursor it was handed — and the cursor's order (`covers`) as a table.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { story } from 'test-kit/checkpoints';
import { covers, sharedStream, type Channel, type Locks, type Sharing } from '../src/lib/sharedStream.ts';
import type { StreamLike } from '../src/lib/follow.ts';

/** A server-sent stream the test sends on: what it was opened at, and whether it was closed. */
class Opened implements StreamLike {
  readyState = 1;
  readonly #target = new EventTarget();
  readonly url: string;
  constructor(url: string) {
    this.url = url;
  }
  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    this.#target.addEventListener(type, listener as EventListener);
  }
  close() {
    this.readyState = 2;
  }
  send(type: string, data: string, lastEventId = '') {
    this.#target.dispatchEvent(new MessageEvent(type, { data, lastEventId }));
  }
}

/**
 * One browser's tabs: a lock granted to one holder at a time, in the order asked, a channel each message of which reaches every other
 * tab at once, and the streams opened.
 */
function browser() {
  const opened: Opened[] = [];
  const waiting: { held: () => Promise<void>; signal: AbortSignal }[] = [];
  let holding = false;
  const next = () => {
    const turn = waiting.find((w) => !w.signal.aborted);
    if (holding || !turn) return;
    waiting.splice(waiting.indexOf(turn), 1);
    holding = true;
    void turn.held().then(() => {
      holding = false;
      next();
    });
  };
  const locks: Locks = {
    request: (_name, { signal }, held) => {
      waiting.push({ held, signal });
      next();
      return Promise.resolve();
    },
  };
  const channels = new Set<{ listeners: ((event: { data: never }) => void)[] }>();
  const channel = (): Channel => {
    const own = { listeners: [] as ((event: { data: never }) => void)[] };
    channels.add(own);
    return {
      postMessage: (message) => {
        for (const other of channels) if (other !== own) for (const l of other.listeners) l({ data: message as never });
      },
      addEventListener: (_type, listener) => own.listeners.push(listener),
      close: () => channels.delete(own),
    };
  };
  const open = (url: string) => {
    const s = new Opened(url);
    opened.push(s);
    return s;
  };
  return { opened, sharing: { locks, channel } satisfies Sharing, open };
}

/** A tab of `at`'s: its shared stream, and what it dispatched, each event by its name, data and id. */
function tab(at: ReturnType<typeof browser>) {
  const got: string[] = [];
  const shared = sharedStream('chat', (after) => `/stream?after=${after}`, at.open, at.sharing);
  for (const type of ['presence', 'chat', 'unreadable'])
    shared.addEventListener(type, (m) => got.push(`${type} ${m.data}${m.lastEventId ? ` #${m.lastEventId}` : ''}`));
  return { shared, got };
}

const settle = () => new Promise((r) => setImmediate(r));

test('tabs share one stream: one holds it and hands each read on, a tab that listed past a read passes it, and the lock passes on', async (t) => {
  const s = story(t);
  const at = browser();
  const { opened } = at;
  const a = tab(at);
  const b = tab(at);
  let c!: ReturnType<typeof tab>;
  await s.test('two tabs started from their reads: the first holds the one stream, opened from its cursor', async () => {
    a.shared.from('1.1');
    b.shared.from('1.1');
    await settle();
    assert.deepEqual(
      opened.map((o) => o.url),
      ['/stream?after=1.1'],
    );
  });
  await s.test('each read the holder is sent reaches both tabs, its events in order and its id on the last', async () => {
    opened[0]?.send('presence', 'p');
    opened[0]?.send('chat', 'x');
    opened[0]?.send('chat', 'y', '1.3');
    opened[0]?.send('unreadable', 'u');
    for (const one of [a, b]) assert.deepEqual(one.got, ['presence p', 'chat x', 'chat y #1.3', 'unreadable u']);
  });
  await s.test(
    'a tab reading its history passes what was handed on meanwhile that its read covers, and takes what came after',
    async () => {
      c = tab(at);
      opened[0]?.send('chat', 'z', '1.4');
      c.shared.from('1.4');
      assert.equal(c.got.length, 0, 'its read held 1.4 already');
      opened[0]?.send('chat', 'w', '1.5');
      assert.deepEqual(c.got, ['chat w #1.5']);
      assert.equal(opened.length, 1, 'still one stream for the three tabs');
    },
  );
  await s.test(
    'a read that moves only her presence, under the cursor every tab holds, reaches every tab: a presence replaces, so it is taken again',
    () => {
      opened[0]?.send('presence', 'q', '1.5');
      for (const one of [b, c]) assert.deepEqual(one.got.at(-1), 'presence q #1.5');
    },
  );
  await s.test('the holder closed, another tab takes the lock and opens the stream again from the last cursor it was handed', async () => {
    a.shared.close();
    await settle();
    assert.deepEqual(
      opened.map((o) => [o.url, o.readyState]),
      [
        ['/stream?after=1.1', 2],
        ['/stream?after=1.5', 1],
      ],
    );
    opened[1]?.send('chat', 'v', '1.6');
    assert.deepEqual(b.got.at(-1), 'chat v #1.6');
    assert.deepEqual(c.got.at(-1), 'chat v #1.6', 'and hands it to the tab that is left');
  });
  await s.test('a tab closed before it started asks for no lock and opens nothing', async () => {
    const late = tab(at);
    late.shared.close();
    for (const one of [b, c]) one.shared.close();
    await settle();
    assert.equal(opened.length, 2);
  });
});

test('`covers`: a cursor covers one each of whose counts it has reached', async (t) => {
  const rows: [string, string, string, boolean][] = [
    ['the same cursor', '1.3.0', '1.3.0', true],
    ['one count behind', '1.3.0', '1.4.0', false],
    ['every count ahead', '2.5.1', '1.4.0', true],
    ['one ahead, one behind', '1.5.0', '1.4.1', false],
    ['a cursor of fewer counts reads the rest as none', '1.4', '1.4.0', true],
  ];
  for (const [name, seen, id, says] of rows) await t.test(name, () => assert.equal(covers(seen, id), says));
});

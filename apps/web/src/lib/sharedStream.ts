/**
 * One server-sent stream shared by every tab of the board that follows it (`sharedStream`): the tab holding the Web Lock of its name
 * opens the one `EventSource` and hands what it is sent to the others over a `BroadcastChannel` of the same name, so a person's open
 * tabs spend one of the browser's six connections to the api on it, not one each. When that tab goes, the lock passes to another, which
 * opens the stream again from the last cursor it was handed. A browser with no Web Locks or no `BroadcastChannel` opens a stream of its
 * own in each tab.
 *
 * A stream it shares carries a cursor as the id of a read's last event — a dot-separated count of each source, as her chat's does — and
 * the tab that holds it hands each read on as one batch under that id, so a tab that listed past it (`covers`) passes the batch whole.
 * It opens nothing of itself: the stream is opened by the `open` its caller hands it, in the files that open the api's streams.
 */
import type { StreamLike } from './follow.ts';

/** One read the holding tab was sent, handed to the others: its events, each by name and data, and the id it ended on ('' for none). */
type Batch = { id: string; events: { type: string; data: string }[] };

/** The Web Locks this module asks for: `navigator.locks`, or a test's own. */
export type Locks = {
  request(name: string, options: { signal: AbortSignal }, held: () => Promise<void>): Promise<unknown>;
};

/** A channel between the tabs: `BroadcastChannel`, or a test's own. */
export type Channel = {
  postMessage(message: Batch): void;
  addEventListener(type: 'message', listener: (event: { data: Batch }) => void): void;
  close(): void;
};

/** What tabs share a stream through: the browser's Web Locks and channels, or a test's. */
export type Sharing = { locks: Locks; channel: (name: string) => Channel };

/** The browser's Web Locks and `BroadcastChannel`; none where the browser has no Web Locks or no channel. */
export const browserSharing = (): Sharing | undefined =>
  typeof navigator !== 'undefined' && navigator.locks && typeof BroadcastChannel !== 'undefined'
    ? { locks: navigator.locks, channel: (name) => new BroadcastChannel(name) }
    : undefined;

/** Whether the cursor `seen` already holds everything the cursor `id` does: each of its counts at least as high. Pure. */
export const covers = (seen: string, id: string): boolean => {
  const have = seen.split('.').map(Number);
  return id.split('.').every((n, i) => Number(n) <= (have[i] ?? 0));
};

/** The events a stream that is shared dispatches: a read's, which are handed on, and its own state's, which are not. */
const HANDED = ['presence', 'chat', 'unreadable', 'readable'];
const OWN = ['open', 'error'];

/**
 * A stream to be shared under `name`, listening to the other tabs at once, so nothing one of them hands on while this tab reads its
 * history is lost: `from(after)` then starts it from the cursor `after` that read gave — what was handed on meanwhile and is not covered
 * first — and asks for the lock, opening `url(cursor)` with `open` once it holds it. `close` before `from` lets it go unstarted.
 */
export function sharedStream(
  name: string,
  url: (after: string) => string,
  open: (url: string) => StreamLike,
  sharing: Sharing | undefined = browserSharing(),
) {
  const listeners = new Map<string, Set<(event: MessageEvent) => void>>();
  const channel = sharing?.channel(name);
  const early: Batch[] = [];
  let started = false;
  let seen = '';
  let own: StreamLike | undefined;
  let state = 0;
  const released = new AbortController();
  let release = () => {};

  const dispatch = (type: string, data: string, lastEventId = '') => {
    for (const listener of listeners.get(type) ?? []) listener(new MessageEvent(type, { data, lastEventId }));
  };
  const take = (batch: Batch) => {
    if (batch.id !== '' && covers(seen, batch.id)) return;
    batch.events.forEach((e, i) => dispatch(e.type, e.data, i === batch.events.length - 1 ? batch.id : ''));
    if (batch.id !== '') seen = batch.id;
  };
  channel?.addEventListener('message', ({ data }) => (started ? take(data) : early.push(data)));

  const hold = () =>
    new Promise<void>((resolve) => {
      release = resolve;
      if (released.signal.aborted || !sharing) return resolve();
      const stream = open(url(seen));
      own = stream;
      let pending: Batch['events'] = [];
      for (const type of HANDED)
        stream.addEventListener(type, (m) => {
          pending.push({ type, data: m.data });
          dispatch(type, m.data, m.lastEventId);
          if (m.lastEventId === '' && (type === 'chat' || type === 'presence')) return;
          if (m.lastEventId !== '') seen = m.lastEventId;
          channel?.postMessage({ id: m.lastEventId, events: pending });
          pending = [];
        });
      for (const type of OWN)
        stream.addEventListener(type, (m) => {
          state = stream.readyState;
          dispatch(type, m.data);
        });
    });

  const shared: StreamLike & { from: (after: string) => StreamLike } = {
    get readyState() {
      return own?.readyState ?? state;
    },
    addEventListener(type, listener) {
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
    },
    close() {
      state = 2;
      released.abort();
      release();
      own?.close();
      channel?.close();
    },
    from(after) {
      seen = after;
      started = true;
      if (!sharing) {
        const alone = open(url(after));
        own = alone;
        for (const type of [...HANDED, ...OWN]) alone.addEventListener(type, (m) => dispatch(type, m.data, m.lastEventId));
        return shared;
      }
      state = 1;
      for (const batch of early.splice(0)) take(batch);
      sharing.locks.request(name, { signal: released.signal }, hold).catch(() => undefined);
      return shared;
    },
  };
  return shared;
}

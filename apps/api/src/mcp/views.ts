/**
 * The views of the feed the port's resources name (resources.ts), each followed while a `subscriptions/listen` stream holds its URI:
 * opened by its first holder, counted per holder, and let go with its last (`feedViews`). A view is the api's own resumable watch of an
 * Event list, asked through the app's `fetch` with the opener's `Authorization` as any client asks it: the list's page of one for the
 * feed's end (`metadata.resourceVersion`), then `?watch=true&resourceVersion=` from it, which sends no state. Each Event ADDED is kept,
 * the newest `PORT_PAGE`, and told to the SDK's listen streams as `notifications/resources/updated` for the URI (`told`, the handler's
 * `notify.resourceUpdated`). A watch that ends is asked again from the last position it sent, from the feed's end where that is gone
 * (410); one refused otherwise (401, 403, 404, 422) closes the view and every stream that holds it, never asked again.
 *
 * Every holder's own token is judged as it holds (the page of one, asked with it), so a stream is opened for a caller the list answers.
 */
import { Option, Schema } from 'effect';
import { Event, watchEventOf } from 'objects';
import { PORT_PAGE } from './bound.ts';
import type { Fetching } from './port.ts';
import { type FeedView, pathOf, readAnswer } from './resources.ts';

/** How long a view waits before it asks again for a watch that ended by itself: a beat, so a watch that ends at once never spins. */
export const RESTART_AFTER_MS = 1_000;

/** One event of an Event list's watch, as `objects` says it. */
const WatchEvent = watchEventOf(Event);
/** A frame's data as a watch event, or none where it is not one (skipped, never retried). */
const decodeEvent = Schema.decodeUnknownOption(Schema.fromJsonString(WatchEvent));

/** What holding a view answers: its release, or the api's refusal of the holder, in its words. */
export type Held = { readonly kind: 'held'; readonly release: () => void } | { readonly kind: 'refused'; readonly message: string };

/** A view followed: its holders (each told when the view closes), the newest events, and where the feed was read to. */
type Followed = {
  readonly view: FeedView;
  readonly holders: Set<() => void>;
  readonly gone: AbortController;
  events: Event[];
  at: string | undefined;
};

/** The views of one port: hold one for a stream, read one, and how many are followed now (a test's seam). */
export type FeedViews = {
  readonly hold: (view: FeedView, from: Request, closed: () => void) => Promise<Held>;
  readonly read: (view: FeedView, from: Request) => Promise<string | { readonly refused: string }>;
  readonly live: () => number;
};

/** The headers a view's request is sent with: JSON, and the caller's `Authorization` where it gave one. */
const headersOf = (from: Request): Headers => {
  const headers = new Headers({ accept: 'application/json' });
  const authorization = from.headers.get('authorization');
  if (authorization !== null) headers.set('authorization', authorization);
  return headers;
};

/** The words of a refused answer: its body's `error`, else its status. */
const refusalOf = async (res: Response, asked: string): Promise<string> => {
  const body = (await res.json().catch(() => undefined)) as { error?: unknown } | undefined;
  return typeof body?.error === 'string' ? body.error : `GET ${asked} answered ${res.status}`;
};

/** The feed's end as `view`'s list answers it to `from` (a page of one), or the api's refusal. */
async function feedEnd(app: Fetching, view: FeedView, from: Request): Promise<{ at: string | undefined } | { refused: string }> {
  const asked = pathOf(view, { limit: '1' });
  const res = await app.fetch(new Request(new URL(asked, from.url), { headers: headersOf(from) }));
  if (!res.ok) return { refused: await refusalOf(res, asked) };
  const page = (await res.json()) as { metadata?: { resourceVersion?: string } };
  return { at: page.metadata?.resourceVersion };
}

/** Each `data:` of the server-sent events `body` carries, as it arrives. */
async function* dataOf(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let held = '';
  for await (const chunk of body) {
    held += decoder.decode(chunk, { stream: true });
    let end = held.indexOf('\n\n');
    while (end >= 0) {
      const frame = held.slice(0, end);
      held = held.slice(end + 2);
      const data = frame
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice('data:'.length).trimStart());
      if (data.length > 0) yield data.join('\n');
      end = held.indexOf('\n\n');
    }
  }
}

/** One watch of `followed` from where it was read to, through to its end: each Event kept and told, each position taken. */
async function watchOnce(app: Fetching, followed: Followed, from: Request, told: (uri: string) => void): Promise<Response> {
  const asked = pathOf(followed.view, { watch: 'true', ...(followed.at === undefined ? {} : { resourceVersion: followed.at }) });
  const res = await app.fetch(new Request(new URL(asked, from.url), { headers: headersOf(from), signal: followed.gone.signal }));
  if (!res.ok || res.body === null) return res;
  for await (const data of dataOf(res.body)) {
    const decoded = decodeEvent(data);
    if (Option.isNone(decoded)) continue;
    const event = decoded.value;
    followed.at = event.object.metadata.resourceVersion;
    if (event.type !== 'ADDED') continue;
    followed.events = [...followed.events, event.object].slice(-PORT_PAGE);
    told(followed.view.uri);
  }
  return res;
}

/** A wait of `ms`, ended at once where `signal` aborts. */
const paused = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(timer), resolve()), { once: true });
  });

/**
 * `followed` watched until its last holder lets it go: asked again where a watch ends (from the feed's end where the position is gone,
 * 410), closed with its holders where the api refuses it.
 */
async function follow(app: Fetching, followed: Followed, from: Request, told: (uri: string) => void, close: () => void) {
  const { signal } = followed.gone;
  while (!signal.aborted) {
    const res = await watchOnce(app, followed, from, told).catch(() => undefined);
    if (signal.aborted) return;
    if (res !== undefined && res.status === 410) {
      const end = await feedEnd(app, followed.view, from).catch(() => ({ refused: 'unreadable' }));
      if ('refused' in end) return close();
      followed.at = end.at;
      continue;
    }
    if (res !== undefined && !res.ok) return close();
    await paused(RESTART_AFTER_MS, signal);
  }
}

/**
 * The views of a port over `appOf()`'s fetch, each new event told by `told` (the SDK handler's `notify.resourceUpdated`). A hold judges
 * the holder's token by a page of one; the first opens the view at that page's end and follows it (`follow`); `release` lets one go, the
 * last aborting the watch. A view closed by the api tells each holder (`closed`) and is dropped.
 */
export function feedViews(appOf: () => Fetching, told: (uri: string) => void): FeedViews {
  const views = new Map<string, Followed>();
  const drop = (followed: Followed) => {
    if (views.get(followed.view.uri) === followed) views.delete(followed.view.uri);
    followed.gone.abort();
  };
  const close = (followed: Followed) => () => {
    drop(followed);
    for (const holder of followed.holders) holder();
    followed.holders.clear();
  };
  const hold = async (view: FeedView, from: Request, closed: () => void): Promise<Held> => {
    const end = await feedEnd(appOf(), view, from);
    if ('refused' in end) return { kind: 'refused', message: end.refused };
    let followed = views.get(view.uri);
    if (followed === undefined) {
      followed = { view, holders: new Set(), gone: new AbortController(), events: [], at: end.at };
      views.set(view.uri, followed);
      void follow(appOf(), followed, from, told, close(followed));
    }
    const mine = followed;
    const holder = () => closed();
    mine.holders.add(holder);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      mine.holders.delete(holder);
      if (mine.holders.size === 0) drop(mine);
    };
    return { kind: 'held', release };
  };
  const read = async (view: FeedView, from: Request) => {
    const end = await feedEnd(appOf(), view, from);
    if ('refused' in end) return { refused: end.refused };
    const followed = views.get(view.uri);
    return followed === undefined ? readAnswer([], end.at) : readAnswer(followed.events, followed.at);
  };
  return { hold, read, live: () => views.size };
}

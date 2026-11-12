/**
 * Every list watched (`?watch=true`): a list's route wrapped by `watchable` answers it as server-sent events, each an unnamed `message`
 * whose data is the JSON of `watchEventOf(WatchedObject)` (`objects`), the frame HttpApi's `StreamSse({ data })` writes, so a move of
 * the stream under HttpApi changes no client (watch-sse.test.ts holds the frames equal). The stream stays Hono's (decision 27).
 *
 * The list is read by the route itself, the URL with `watch` taken out, through every page (`readAll`, each of `WatchPage` objects, its
 * `continue` followed until none is), so a watch answers what the list answers, every object of it, its selectors and its
 * namespace's refusal with it: a first read that is no 2xx is answered as it is, before any stream. Then each object is sent ADDED, then a
 * BOOKMARK, Kubernetes' initial state. The list is read again on a feed line (`followFeed`, on the app's `Beats.feed`), at most one read
 * in flight and one per `WATCH_SETTLE`, and on a resync every `Beats.watch` (`WATCH_RESYNC`) for a change no line says (a card or a
 * definition edited on disk); what changed between two reads is the package's `watchChanges`, an object's version being the one its
 * route hands (`versionOf`: a run's leaves out its frame's time measured to the read, `runWatchVersion`), its JSON as served where none,
 * so a change of its status is a change though its `resourceVersion` stands. A DELETED carries the object of the last read that held it.
 * A BOOKMARK is sent every `BOOKMARK_EVERY`, its `resourceVersion` the feed's size at the last read.
 *
 * Level-triggered: a watch keeps nothing between connections. A read again that is no 2xx, or a feed truncated under the reader, ends the
 * stream, and the reader opens it again and is sent the state whole: no `Last-Event-ID` resume, since nothing keeps a list's old versions
 * but the feed's own: a watch of the Event lists asked a `resourceVersion` (`watchStartOf`) is sent no state and follows the feed from
 * that byte, so a reader that kept the last one it was sent resumes there.
 * The feed's reader is held in the stream's scope, which the request's abort interrupts, and let go with it.
 */
import { type Context as RequestContext } from 'hono';
import { streamSSE, type SSEStreamingApi } from 'hono/streaming';
import { Context, Data, type Duration, Effect, Schema, Stream } from 'effect';
import { BOOKMARK_EVERY, feedCursorRefusal, feedSize, followFeed, watchChanges, type Versioned } from 'agent-orchestrator';
import { API_VERSION, AnyObjectList, LIST_PAGE, TABLE_ACCEPT, type WatchedObject, watchEventOf } from 'objects';
import { acceptsTable } from '../objects/table.ts';
import { type ApiEnv, Beats } from '../layer.ts';
import { StoreRoot } from '../store.ts';
import type { WatchStart, WatchStartOf, WatchStartRefusal } from '../../contracts/watch-start.contract.ts';

/** The least time between two reads again of a watched list, however many feed lines arrive. */
export const WATCH_SETTLE: Duration.Input = '500 millis';

/** How often a watched list is read again though no feed line came: a change on disk no line says is sent this late at most. */
export const WATCH_RESYNC: Duration.Input = '5 seconds';

/** A list's route: it answers the request given, the context's own where none is. */
export type Listed = (c: RequestContext<ApiEnv>, request?: Request) => Response | Promise<Response>;

/** One event of a watch, encoded by the package's Schema. */
const WatchEvent = watchEventOf(Schema.Unknown);

/** What the query of a watch takes, said in every refusal of one. */
const WATCH_TAKES =
  '`?watch=true` follows the list as server-sent events, with `labelSelector` if you like, and on the Event lists `resourceVersion` to resume from; `limit` and `continue` page a list and are left out of a watch';

/** Why `c`'s query cannot be watched, or null where it asks a watch rightly. */
const refusalOf = (c: RequestContext<ApiEnv>): { readonly status: 400 | 406; readonly error: string } | null => {
  const watch = c.req.queries('watch') ?? [];
  if (watch.length !== 1 || watch[0] !== 'true')
    return { status: 400, error: `watch=${watch.join(',')} is not a watch this list takes: ${WATCH_TAKES}.` };
  if (c.req.query('limit') !== undefined || c.req.query('continue') !== undefined)
    return { status: 400, error: `a watch is sent the whole list, so it takes no page: ${WATCH_TAKES}. Send it again without them.` };
  if ((c.req.queries('resourceVersion') ?? []).length > 1)
    return { status: 400, error: `a watch resumes from one resourceVersion: send it once. ${WATCH_TAKES}.` };
  if (acceptsTable(c.req.header('accept')))
    return {
      status: 406,
      error: `a watch streams the list's objects, never a Table: send it again without Accept: ${TABLE_ACCEPT}, or ask the Table without watch=true.`,
    };
  return null;
};

/**
 * Where a watch starts, from the `resourceVersion` its query asks (`asked`), whether its list follows the feed (`follows`) and the byte
 * the asked word reads as (`byte`, `byteOf`): the list's state whole where none is asked, the feed from that byte for a list that
 * follows it, or refused before anything is read (`watch-start.contract.ts`).
 */
export const watchStartOf: WatchStartOf = (asked, follows, byte): WatchStart => {
  if (asked === undefined || asked === '') return { kind: 'state' };
  if (!follows) return { kind: 'refused', reason: 'not-followed' };
  if (byte === undefined) return { kind: 'refused', reason: 'not-a-cursor' };
  return { kind: 'from', cursor: byte };
};

/** A byte of the feed as an event's `resourceVersion` writes it: a decimal with no sign and no leading zero, else none. */
export const byteOf = (text: string | undefined): number | undefined =>
  text !== undefined && /^(0|[1-9][0-9]*)$/.test(text) ? Number(text) : undefined;

/** A read of the list: its objects by key, and the objects themselves. */
type Read = { readonly kind: string; readonly versions: Versioned[]; readonly objects: Map<string, WatchedObject>; readonly at: number };

/** The key an object is watched by: its namespace and its name. */
const keyOf = (o: WatchedObject): string => `${o.metadata.namespace ?? ''}/${o.metadata.name}`;

/** The version a list's objects are compared at between two reads: its JSON as served where its route hands none. */
export type VersionOf = (o: WatchedObject) => string;

/**
 * How many objects each page a watch reads its list by asks (`limit`): the most a list answers (`LIST_PAGE`), unless the app's layer gives
 * another, as a test does to see a watch read past one page.
 */
export const WatchPage = Context.Reference<number>('api/WatchPage', { defaultValue: () => LIST_PAGE.most });

/** The `continue` of a list's answer, where more of it is left. */
const continueOf = (list: AnyObjectList): string | undefined => {
  const metadata = list.metadata;
  if (typeof metadata !== 'object' || metadata === null || !('continue' in metadata)) return undefined;
  return typeof metadata.continue === 'string' && metadata.continue !== '' ? metadata.continue : undefined;
};

/**
 * The list at `url`, read whole through its pages: each asked of `list` with `limit` = `page` and the `continue` the last answered, until
 * none is, so a watch sees every object however many pages the list is; its objects each keyed and versioned by `versionOf`. The first
 * answer that is no 2xx is answered as it is.
 */
async function readAll(list: Listed, c: RequestContext<ApiEnv>, url: URL, page: number, at: number, versionOf: VersionOf) {
  const items: WatchedObject[] = [];
  let kind = '';
  let token: string | undefined;
  do {
    const asked = new URL(url);
    asked.searchParams.set('limit', String(page));
    if (token !== undefined) asked.searchParams.set('continue', token);
    const answer = await list(c, new Request(asked, { headers: c.req.raw.headers }));
    if (!answer.ok) return answer;
    const read = Schema.decodeUnknownSync(AnyObjectList)(await answer.json());
    kind = read.kind;
    items.push(...read.items);
    token = continueOf(read);
  } while (token !== undefined);
  return {
    kind: kind.replace(/List$/, ''),
    versions: items.map((o) => ({ key: keyOf(o), version: versionOf(o) })),
    objects: new Map(items.map((o) => [keyOf(o), o] as const)),
    at,
  } satisfies Read;
}

/** An event as its frame: the JSON of its Schema's encoding, an unnamed message with no id, as HttpApi's `StreamSse` writes it. */
export const frameOf = (event: typeof WatchEvent.Type) => ({ data: JSON.stringify(Schema.encodeSync(WatchEvent)(event)) });

/** The BOOKMARK of a list of `kind` read at feed byte `at`. */
const bookmarkOf = (kind: string, at: number) =>
  frameOf({ type: 'BOOKMARK', object: { apiVersion: API_VERSION, kind, metadata: { resourceVersion: String(at) } } });

/** A read again that the list refused, which ends the stream. */
class ListRefused extends Data.TaggedError('ListRefused')<{ readonly status: number }> {}

/** The frames of what changed from `sent` to `now`: ADDED and MODIFIED with the new object, DELETED with the last read's that held it. */
const changedFrames = (sent: Read, now: Read) =>
  watchChanges(sent.versions, now.versions).flatMap((change) => {
    const object = change.type === 'DELETED' ? sent.objects.get(change.key) : now.objects.get(change.key);
    return object === undefined ? [] : [frameOf({ type: change.type, object })];
  });

/**
 * What a list that follows the feed rather than reading itself again hands its watch (`follow`): for each line from byte `from`, the
 * object it makes of the list's, if any, and the byte after it, read on the feed's `beat`. The Event lists' (feed-objects/events-watch.ts).
 */
export type Follow = (
  c: RequestContext<ApiEnv>,
  from: number,
  beat: Duration.Input | undefined,
) => Stream.Stream<{ readonly object: WatchedObject | undefined; readonly at: number }, unknown>;

/** What a watch refused before anything is read answers in `error`: what to send instead. */
const startRefusal = (reason: WatchStartRefusal, asked: string): string =>
  reason === 'not-followed'
    ? `this list is read again on each change and keeps no old versions, so its watch takes no resourceVersion (${JSON.stringify(asked)}): send it again without resourceVersion, and the state is sent whole`
    : `resourceVersion ${JSON.stringify(asked)} is no byte of the feed: send the resourceVersion of the last event or BOOKMARK a watch sent, or the metadata.resourceVersion of a page of GET /api/events, as it is`;

/** The kind and the empty state of a list a watch follows from a byte, read off a first page of one (its refusal answered as it is). */
async function firstPage(list: Listed, c: RequestContext<ApiEnv>, url: URL, at: number) {
  const asked = new URL(url);
  asked.searchParams.delete('resourceVersion');
  asked.searchParams.set('limit', '1');
  const answer = await list(c, new Request(asked, { headers: c.req.raw.headers }));
  if (!answer.ok) return answer;
  const read = Schema.decodeUnknownSync(AnyObjectList)(await answer.json());
  return { kind: read.kind.replace(/List$/, ''), versions: [], objects: new Map(), at } satisfies Read;
}

/**
 * Where a watch of `list` starts and what it holds there (`watchStartOf`): the state read whole, or a list that follows the feed's first
 * page from the byte asked; or the answer that refuses it before any stream (400, 410, or the list's own).
 */
async function openedAt(c: RequestContext<ApiEnv>, list: Listed, versionOf: VersionOf, follows: boolean) {
  const resourceVersion = c.req.query('resourceVersion');
  const start = watchStartOf(resourceVersion, follows, byteOf(resourceVersion));
  if (start.kind === 'refused') return c.json({ error: startRefusal(start.reason, resourceVersion ?? '') }, 400);
  const url = new URL(c.req.url);
  url.searchParams.delete('watch');
  const home = await c.var.runtime.runPromise(StoreRoot);
  if (start.kind === 'from') {
    const expired = feedCursorRefusal(home, start.cursor);
    if (expired !== undefined)
      return c.json(
        { error: `resourceVersion ${start.cursor} cannot be read on: ${expired}. Watch again without resourceVersion for the state whole` },
        410,
      );
  }
  const page = await c.var.runtime.runPromise(WatchPage);
  const initial =
    start.kind === 'from' ? await firstPage(list, c, url, start.cursor) : await readAll(list, c, url, page, feedSize(home), versionOf);
  if (initial instanceof Response) return initial;
  return { start, initial, home, url, page, end: feedSize(home) };
}

/**
 * `list` watched: without `watch` (or with `watch=false`) the request handed on as it is; with `watch=true` the stream above; any other
 * `watch`, or `limit` or `continue` beside it, refused 400 `{ error }` before anything is read. Given `follow`, a list whose objects are
 * the feed's own lines: after the initial state each line the list keeps is sent ADDED as it is followed, once, and the list is never
 * read again. Given `versionOf`, the list's objects are compared at it between reads rather than as served: a list whose objects carry
 * parts measured to the read hands it, or its watch sends a MODIFIED of each on every read. A `resourceVersion` asked is read by
 * `watchStartOf`: of a list that follows the feed, the watch starts at that byte and sends no state (a byte the feed cannot be read from,
 * inside a line or past its end, refused 410, Kubernetes' expired one; the list's own refusals answered from a first page of one); of
 * any other list, or a word that is no byte, refused 400. Such a watch sends a BOOKMARK once it has sent every line written before it
 * opened (at once where none was), as the initial state's BOOKMARK ends what a reader was sent of what was there already: a reader
 * that resumes counts what it missed by it.
 */
export const watchable =
  (list: Listed, { follow, versionOf = JSON.stringify }: { readonly follow?: Follow; readonly versionOf?: VersionOf } = {}) =>
  async (c: RequestContext<ApiEnv>): Promise<Response> => {
    const asked = c.req.query('watch');
    if (asked === undefined || asked === 'false') return list(c);
    const refused = refusalOf(c);
    if (refused !== null) return c.json({ error: refused.error }, refused.status);
    const opened = await openedAt(c, list, versionOf, follow !== undefined);
    if (opened instanceof Response) return opened;
    const { start, initial, home, url, page, end } = opened;
    return streamSSE(c, async (stream: SSEStreamingApi) => {
      const gone = new AbortController();
      stream.onAbort(() => gone.abort());
      if (stream.aborted) gone.abort();
      const write = (frame: { data: string }) => Effect.promise(() => stream.writeSSE(frame));
      const state = { sent: initial, at: initial.at };
      if (start.kind === 'state') {
        for (const object of initial.objects.values()) await stream.writeSSE(frameOf({ type: 'ADDED', object }));
        await stream.writeSSE(bookmarkOf(initial.kind, initial.at));
      }
      const caughtUp = { due: start.kind === 'from' && initial.at < end };
      if (start.kind === 'from' && !caughtUp.due) await stream.writeSSE(bookmarkOf(initial.kind, initial.at));
      const again = Effect.gen(function* () {
        const now = yield* Effect.promise(() => readAll(list, c, url, page, feedSize(home), versionOf));
        if (now instanceof Response) return yield* new ListRefused({ status: now.status });
        const frames = changedFrames(state.sent, now);
        state.sent = now;
        state.at = now.at;
        for (const frame of frames) yield* write(frame);
        yield* Effect.sleep(WATCH_SETTLE);
      });
      const watched = Effect.gen(function* () {
        const beats = yield* Beats;
        const lines = followFeed(initial.at, beats.feed === undefined ? {} : { beat: beats.feed }).pipe(
          Stream.filter((f) => f.kind === 'line'),
          Stream.map(() => 'line' as const),
        );
        const resync = Stream.tick(beats.watch ?? WATCH_RESYNC).pipe(
          Stream.drop(1),
          Stream.map(() => 'resync' as const),
        );
        const sentKeys = new Set(initial.objects.keys());
        const reads =
          follow === undefined
            ? Stream.merge(lines, resync).pipe(
                Stream.buffer({ capacity: 1, strategy: 'sliding' }),
                Stream.mapEffect(() => again),
                Stream.map(() => null),
              )
            : follow(c, initial.at, beats.feed).pipe(
                Stream.mapEffect(({ object, at: after }) =>
                  Effect.gen(function* () {
                    state.at = after;
                    if (object !== undefined && !sentKeys.has(keyOf(object))) {
                      sentKeys.add(keyOf(object));
                      yield* write(frameOf({ type: 'ADDED', object }));
                    }
                    if (caughtUp.due && after >= end) {
                      caughtUp.due = false;
                      yield* write(bookmarkOf(initial.kind, after));
                    }
                    return null;
                  }),
                ),
              );
        const bookmarks = Stream.tick(BOOKMARK_EVERY).pipe(
          Stream.drop(1),
          Stream.map(() => bookmarkOf(state.sent.kind, state.at)),
        );
        return yield* Stream.merge(reads, bookmarks, { haltStrategy: 'left' }).pipe(
          Stream.runForEach((frame) => (frame === null ? Effect.void : write(frame))),
        );
      });
      await c.var.runtime.runPromiseExit(watched, { signal: gone.signal });
    });
  };

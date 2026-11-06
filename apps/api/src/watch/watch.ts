/**
 * Every list watched (`?watch=true`): a list's route wrapped by `watchable` answers it as server-sent events, each an unnamed `message`
 * whose data is the JSON of `watchEventOf(WatchedObject)` (`objects`), the frame HttpApi's `StreamSse({ data })` writes, so a move of
 * the stream under HttpApi changes no client (watch-sse.test.ts holds the frames equal). The stream stays Hono's (decision 27).
 *
 * The list is read by the route itself, the URL with `watch` taken out, so a watch answers what the list answers, its selectors and its
 * namespace's refusal with it: a first read that is no 2xx is answered as it is, before any stream. Then each object is sent ADDED, then a
 * BOOKMARK, Kubernetes' initial state. The list is read again on a feed line (`followFeed`, on the app's `Beats.feed`), at most one read
 * in flight and one per `WATCH_SETTLE`, and on a resync every `Beats.watch` (`WATCH_RESYNC`) for a change no line says (a card or a
 * definition edited on disk); what changed between two reads is the package's `watchChanges`, an object's version being the one its
 * route hands (`versionOf`: a run's leaves out its frame's time measured to the read, `runWatchVersion`), its JSON as served where none,
 * so a change of its status is a change though its `resourceVersion` stands. A DELETED carries the object of the last read that held it.
 * A BOOKMARK is sent every `BOOKMARK_EVERY`, its `resourceVersion` the feed's size at the last read.
 *
 * Level-triggered: a watch keeps nothing between connections. A read again that is no 2xx, or a feed truncated under the reader, ends the
 * stream, and the reader opens it again and is sent the state whole: no `Last-Event-ID` resume, since nothing keeps a list's old versions.
 * The feed's reader is held in the stream's scope, which the request's abort interrupts, and let go with it.
 */
import { type Context as RequestContext } from 'hono';
import { streamSSE, type SSEStreamingApi } from 'hono/streaming';
import { Data, type Duration, Effect, Schema, Stream } from 'effect';
import { BOOKMARK_EVERY, feedSize, followFeed, watchChanges, type Versioned } from 'agent-orchestrator';
import { API_VERSION, AnyObjectList, type WatchedObject, watchEventOf } from 'objects';
import { type ApiEnv, Beats } from '../layer.ts';

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
  '`?watch=true` follows the list as server-sent events, with `labelSelector` if you like; `limit` and `continue` page a list and are left out of a watch';

/** Why `c`'s query cannot be watched, or null where it asks a watch rightly. */
const refusalOf = (c: RequestContext<ApiEnv>): string | null => {
  const watch = c.req.queries('watch') ?? [];
  if (watch.length !== 1 || watch[0] !== 'true') return `watch=${watch.join(',')} is not a watch this list takes: ${WATCH_TAKES}.`;
  if (c.req.query('limit') !== undefined || c.req.query('continue') !== undefined)
    return `a watch is sent the whole list, so it takes no page: ${WATCH_TAKES}. Send it again without them.`;
  return null;
};

/** A read of the list: its objects by key, and the objects themselves. */
type Read = { readonly kind: string; readonly versions: Versioned[]; readonly objects: Map<string, WatchedObject>; readonly at: number };

/** The key an object is watched by: its namespace and its name. */
const keyOf = (o: WatchedObject): string => `${o.metadata.namespace ?? ''}/${o.metadata.name}`;

/** The version a list's objects are compared at between two reads: its JSON as served where its route hands none. */
export type VersionOf = (o: WatchedObject) => string;

/** `answer`, a 2xx of the list, read as its objects, each keyed and versioned by `versionOf`. */
async function readOf(answer: Response, at: number, versionOf: VersionOf): Promise<Read> {
  const list = Schema.decodeUnknownSync(AnyObjectList)(await answer.json());
  const objects = new Map(list.items.map((o) => [keyOf(o), o] as const));
  return {
    kind: list.kind.replace(/List$/, ''),
    versions: list.items.map((o) => ({ key: keyOf(o), version: versionOf(o) })),
    objects,
    at,
  };
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

/**
 * `list` watched: without `watch` (or with `watch=false`) the request handed on as it is; with `watch=true` the stream above; any other
 * `watch`, or `limit` or `continue` beside it, refused 400 `{ error }` before anything is read. Given `follow`, a list whose objects are
 * the feed's own lines: after the initial state each line the list keeps is sent ADDED as it is followed, once, and the list is never
 * read again. Given `versionOf`, the list's objects are compared at it between reads rather than as served: a list whose objects carry
 * parts measured to the read hands it, or its watch sends a MODIFIED of each on every read.
 */
export const watchable =
  (list: Listed, { follow, versionOf = JSON.stringify }: { readonly follow?: Follow; readonly versionOf?: VersionOf } = {}) =>
  async (c: RequestContext<ApiEnv>): Promise<Response> => {
    const asked = c.req.query('watch');
    if (asked === undefined || asked === 'false') return list(c);
    const refused = refusalOf(c);
    if (refused !== null) return c.json({ error: refused }, 400);
    const url = new URL(c.req.url);
    url.searchParams.delete('watch');
    const request = () => new Request(url, { headers: c.req.raw.headers });
    const at = feedSize();
    const first = await list(c, request());
    if (!first.ok) return first;
    const initial = await readOf(first, at, versionOf);
    return streamSSE(c, async (stream: SSEStreamingApi) => {
      const gone = new AbortController();
      stream.onAbort(() => gone.abort());
      if (stream.aborted) gone.abort();
      const write = (frame: { data: string }) => Effect.promise(() => stream.writeSSE(frame));
      const state = { sent: initial, at: initial.at };
      for (const object of initial.objects.values()) await stream.writeSSE(frameOf({ type: 'ADDED', object }));
      await stream.writeSSE(bookmarkOf(initial.kind, initial.at));
      const again = Effect.gen(function* () {
        const at = feedSize();
        const answer = yield* Effect.promise(async () => list(c, request()));
        if (!answer.ok) return yield* new ListRefused({ status: answer.status });
        const now = yield* Effect.promise(() => readOf(answer, at, versionOf));
        const frames = changedFrames(state.sent, now);
        state.sent = now;
        state.at = now.at;
        for (const frame of frames) yield* write(frame);
        yield* Effect.sleep(WATCH_SETTLE);
      });
      const watched = Effect.gen(function* () {
        const beats = yield* Beats;
        const lines = followFeed(at, beats.feed === undefined ? {} : { beat: beats.feed }).pipe(
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
            : follow(c, at, beats.feed).pipe(
                Stream.map(({ object, at: after }) => {
                  state.at = after;
                  if (object === undefined || sentKeys.has(keyOf(object))) return null;
                  sentKeys.add(keyOf(object));
                  return frameOf({ type: 'ADDED', object });
                }),
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

/**
 * Every list watched (`?watch=true`): a list's route wrapped by `watchable` answers it as server-sent events, each an unnamed `message`
 * whose data is the JSON of `watchEventOf(WatchedObject)` (`objects`), the frame HttpApi's `StreamSse({ data })` writes, so a move of
 * the stream under HttpApi changes no client (watch-sse.test.ts holds the frames equal). The stream stays Hono's (decision 27).
 *
 * The list is read by the route itself, the URL with `watch` taken out, through every page (`readAll`, each of `WatchPage` objects, its
 * `continue` followed until none is), so a watch answers what the list answers, its selectors and its namespace's refusal with it: a
 * first read that is no 2xx is answered as it is, before any stream.
 *
 * A kind the keyspace watches (`isWatchedKind`) follows revisions (`revisionWatch`): with no `resourceVersion` each object ADDED then a
 * BOOKMARK at the head read before them; with one, the objects changed after it (`kindReplay`), refused 410 past the compaction window
 * and 400 past the head. It reads the head on every beat and replays what was written since, so a change is lost to no beat. A DELETED
 * carries the object's name, namespace and the revision that removed it, and is sent only on a list asked whole (no namespace, no
 * selector). The runs lists are such a kind: a run is at the highest revision of its record, markers, asks and observed status (the
 * daemon's pass writes the last only where it moved, the time measured to the read left out). Any other list is read again on a feed line
 * (`followFeed`, the app's `Beats.feed`) and on a resync every `Beats.watch` (`WATCH_RESYNC`), what changed between two reads being the
 * package's `watchChanges`. A BOOKMARK is sent every `BOOKMARK_EVERY`.
 *
 * Level-triggered: a watch keeps nothing between connections. A revision compacted away under a watch, a read again that is no 2xx or a
 * feed truncated under the reader ends the stream, and the reader opens it again. A watch of the Event lists asked a `resourceVersion`
 * (`watchStartOf`) is sent no state and follows the feed from that byte. The feed's reader is held in the stream's scope, which the
 * request's abort interrupts, and let go with it.
 */
import { type Context as RequestContext } from 'hono';
import { streamSSE, type SSEStreamingApi } from 'hono/streaming';
import { Context, Data, type Duration, Effect, Schema, Stream } from 'effect';
import {
  BOOKMARK_EVERY,
  cardHeld,
  runHeld,
  feedCursorRefusal,
  feedSize,
  followFeed,
  keyspaceHead,
  kindReplay,
  parseSelectors,
  selectsLabels,
  watchChanges,
  type KindChange,
  type Versioned,
  type WatchedKind,
} from 'agent-orchestrator';
import { API_VERSION, AnyObjectList, LIST_PAGE, TABLE_ACCEPT, type WatchedObject, watchEventOf } from 'objects';
import { acceptsTable } from '../objects/table.ts';
import { type ApiEnv, Beats } from '../layer.ts';
import { StoreRoot } from '../store.ts';
import type { WatchStartOf } from '../../contracts/watch-start.contract.ts';

/** The least time between two reads again of a watched list, however many feed lines arrive. */
const WATCH_SETTLE: Duration.Input = '500 millis';

/** How often a watched list is read again though no feed line came: a change on disk no line says is sent this late at most. */
const WATCH_RESYNC: Duration.Input = '5 seconds';

/** A list's route: it answers the request given, the context's own where none is. */
export type Listed = (c: RequestContext<ApiEnv>, request?: Request) => Response | Promise<Response>;

/** One event of a watch, encoded by the package's Schema. */
const WatchEvent = watchEventOf(Schema.Unknown);

/** What the query of a watch takes, said in every refusal of one. */
const WATCH_TAKES =
  '`?watch=true` follows the list as server-sent events, with `labelSelector` if you like, and on most lists `resourceVersion` to resume from; `limit` and `continue` page a list and are left out of a watch';

/** Why `c`'s query cannot be watched, or null where it asks a watch rightly. */
const refusalOf = (c: RequestContext<ApiEnv>) => {
  const watch = c.req.queries('watch') ?? [];
  if (watch.length !== 1 || watch[0] !== 'true')
    return { status: 400, error: `watch=${watch.join(',')} is not a watch this list takes: ${WATCH_TAKES}.` } satisfies {
      readonly status: 400 | 406;
      readonly error: string;
    } | null;
  if (c.req.query('limit') !== undefined || c.req.query('continue') !== undefined)
    return {
      status: 400,
      error: `a watch is sent the whole list, so it takes no page: ${WATCH_TAKES}. Send it again without them.`,
    } satisfies { readonly status: 400 | 406; readonly error: string } | null;
  if ((c.req.queries('resourceVersion') ?? []).length > 1)
    return { status: 400, error: `a watch resumes from one resourceVersion: send it once. ${WATCH_TAKES}.` } satisfies {
      readonly status: 400 | 406;
      readonly error: string;
    } | null;
  if (acceptsTable(c.req.header('accept')))
    return {
      status: 406,
      error: `a watch streams the list's objects, never a Table: send it again without Accept: ${TABLE_ACCEPT}, or ask the Table without watch=true.`,
    } satisfies { readonly status: 400 | 406; readonly error: string } | null;
  return null satisfies { readonly status: 400 | 406; readonly error: string } | null;
};

/**
 * Where a watch starts, from the `resourceVersion` its query asks (`asked`), whether its list follows the feed (`follows`) and the number
 * the asked word reads as (`version`, `versionAsked`): the list's state whole where none is asked, the feed from that byte for a list that
 * follows it, the keyspace after that revision for any other, or refused before anything is read (`watch-start.contract.ts`).
 * @param asked The resourceVersion the query asks, or undefined where it asks none.
 * @param follows Whether the list follows the feed.
 * @param version The number the asked word reads as (versionAsked), or undefined where it is no version.
 * @public
 */
export const watchStartOf: WatchStartOf = (asked, follows, version) => {
  if (asked === undefined || asked === '') return { kind: 'state' };
  if (version === undefined) return { kind: 'refused', reason: 'not-a-version' };
  return follows ? { kind: 'from', cursor: version } : { kind: 'since', revision: version };
};

/**
 * A version as an event's `resourceVersion` writes it, a byte of the feed or a revision of the keyspace: a decimal with no sign and no
 * leading zero, else none.
 * @param text The resourceVersion as asked, or undefined where none is.
 */
const versionAsked = (text: string | undefined) =>
  text !== undefined && /^(0|[1-9][0-9]*)$/.test(text) && Number.isSafeInteger(Number(text)) ? Number(text) : undefined;

/** A read of the list: its objects by key, and the objects themselves. */
type Read = { readonly kind: string; readonly versions: Versioned[]; readonly objects: Map<string, WatchedObject>; readonly at: number };

/** The key an object is watched by: its namespace and its name. */
const keyOf = (o: WatchedObject) => `${o.metadata.namespace ?? ''}/${o.metadata.name}`;

/**
 * How many objects each page a watch reads its list by asks (`limit`): the most a list answers (`LIST_PAGE`), unless the app's layer gives
 * another, as a test does to see a watch read past one page.
 */
export const WatchPage = Context.Reference<number>('api/WatchPage', { defaultValue: () => LIST_PAGE.most });

/** The `continue` of a list's answer, where more of it is left. */
const continueOf = (list: AnyObjectList) => {
  const metadata = list.metadata;
  if (typeof metadata !== 'object' || metadata === null || !('continue' in metadata)) return undefined;
  return typeof metadata.continue === 'string' && metadata.continue !== '' ? metadata.continue : undefined;
};

/**
 * The list at `url`, read whole through its pages: each asked of `list` with `limit` = `page` and the `continue` the last answered, until
 * none is, so a watch sees every object however many pages the list is; its objects each keyed and versioned as served. The first
 * answer that is no 2xx is answered as it is.
 */
async function readAll(list: Listed, c: RequestContext<ApiEnv>, url: URL, page: number, at: number) {
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
    versions: items.map((o) => ({ key: keyOf(o), version: JSON.stringify(o) })),
    objects: new Map(items.map((o) => [keyOf(o), o] as const)),
    at,
  } satisfies Read;
}

/**
 * An event as its frame: the JSON of its Schema's encoding, an unnamed message with no id, as HttpApi's `StreamSse` writes it.
 * @param event The watch's event.
 */
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
const startRefusal = (asked: string) =>
  `resourceVersion ${JSON.stringify(asked)} is no version: send the resourceVersion of the last event or BOOKMARK a watch sent, or the metadata.resourceVersion of a list, as it is`;

/** Why a list that keeps no old versions refuses a `resourceVersion`, and what to send instead. */
const notResumable = (asked: string) =>
  `this list is read again on each change and keeps no old versions yet, so its watch takes no resourceVersion (${JSON.stringify(asked)}): send it again without resourceVersion, and the state is sent whole`;

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
async function openedAt(c: RequestContext<ApiEnv>, list: Listed, follows: boolean) {
  const resourceVersion = c.req.query('resourceVersion');
  const start = watchStartOf(resourceVersion, follows, versionAsked(resourceVersion));
  if (start.kind === 'refused') return c.json({ error: startRefusal(resourceVersion ?? '') }, 400);
  if (start.kind === 'since') return c.json({ error: notResumable(resourceVersion ?? '') }, 400);
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
  const initial = start.kind === 'from' ? await firstPage(list, c, url, start.cursor) : await readAll(list, c, url, page, feedSize(home));
  if (initial instanceof Response) return initial;
  return { start, initial, home, url, page, end: feedSize(home) };
}

/** How often a watch from a revision reads the keyspace's head for a change, where the app's `Beats.feed` gives none. */
const WATCH_BEAT: Duration.Input = '1 second';

/** The object a DELETED sends where the record that made it is gone: its name and namespace, and the revision that removed it. */
const goneObject = (kind: WatchedKind, change: KindChange) =>
  ({
    apiVersion: API_VERSION,
    kind,
    metadata: {
      name: change.name ?? '',
      ...(change.namespace === null ? {} : { namespace: change.namespace }),
      creationTimestamp: new Date(0).toISOString(),
      resourceVersion: String(change.revision),
    },
  }) satisfies WatchedObject;

/** The revision an object is served at. */
const revisionOf = (o: WatchedObject) => Number(o.metadata.resourceVersion);

/**
 * The frames of `changes`, each object they name sent once as it stands in `read`, in the order of the changes: an object changed after
 * `after` and still in the list as its change says (MODIFIED for each of a namespace's), DELETED the object that is gone. An object the
 * list no longer holds, or holds at a revision the watcher was sent, is sent nothing. DELETED is sent for an object this watch sent
 * (`known`, which it keeps up), on any list asked `whole` (no namespace, no selector), or for one the watcher's filter held as of
 * `after` (`heldBefore`).
 */
const framesOfChanges = (
  kind: WatchedKind,
  after: number,
  changes: readonly KindChange[],
  read: Read | undefined,
  known: Set<string>,
  filter: WatchFilter,
) => {
  const sent = new Set<string>();
  const gone = (change: KindChange) => {
    const held = [...known].filter((key) => {
      const at = key.indexOf('/');
      return (
        (change.namespace === null || key.slice(0, at) === change.namespace) && (change.name === null || key.slice(at + 1) === change.name)
      );
    });
    const space = held.length === 0 && !filter.whole ? filter.heldBefore(change) : null;
    const keys =
      held.length > 0
        ? held
        : filter.whole
          ? [`${change.namespace ?? ''}/${change.name ?? ''}`]
          : space === null
            ? []
            : [`${space}/${change.name ?? ''}`];
    return keys.map((key) => {
      known.delete(key);
      const at = key.indexOf('/');
      const space = key.slice(0, at);
      return frameOf({
        type: 'DELETED',
        object: goneObject(kind, { ...change, namespace: space === '' ? null : space, name: key.slice(at + 1) }),
      });
    });
  };
  return changes.flatMap((change) => {
    if (change.change === 'DELETED') return change.name === null ? [] : gone(change);
    const found = [...(read?.objects.values() ?? [])].filter(
      (object) =>
        (change.name === null || object.metadata.name === change.name) &&
        (change.namespace === null || object.metadata.namespace === change.namespace),
    );
    if (found.length === 0 && change.name !== null && change.standing && change.change === 'MODIFIED') return gone(change);
    return found.flatMap((object) => {
      if (revisionOf(object) <= after || sent.has(keyOf(object))) return [];
      sent.add(keyOf(object));
      known.add(keyOf(object));
      return [frameOf({ type: change.change, object })];
    });
  });
};

/**
 * What a watch's filter says of an object removed or moved since the revision it resumes from: whether the list is asked `whole` (no
 * namespace, no selector), and `heldBefore`, the namespace a change's object stood in as of that revision where the namespace and the label
 * selector the watch asked kept it (so the watcher could hold it), null where they did not, or where the value or a field selector says
 * nothing a watch can judge.
 */
type WatchFilter = { readonly whole: boolean; readonly heldBefore: (change: KindChange) => string | null };

/** A run as its record held it: its namespace, and no labels, which its record does not say. */
const unlabelled = (held: { readonly namespace: string } | null) => (held === null ? null : { namespace: held.namespace, labels: {} });

/**
 * The filter of the watch of `kind` on `url`: the namespace its path names, the label selectors of its query, and how an object of the kind
 * reads as of an earlier revision (a card by its record's text, `cardHeld`, a run by its record's, `runHeld`, its labels unknown; any
 * other by the namespace its change names and no labels).
 * @param kind The kind watched.
 * @param url The list's URL, `watch` and `resourceVersion` taken out.
 */
const watchFilterOf = (kind: WatchedKind, url: URL) => {
  const inPath = /\/namespaces\/([^/]+)\//.exec(url.pathname)?.[1];
  const selectors = [...url.searchParams.getAll('labelSelector'), ...url.searchParams.getAll('selector')];
  const whole = inPath === undefined && [...url.searchParams.keys()].every((key) => key === 'limit' || key === 'continue');
  const parsed = parseSelectors(selectors);
  return {
    whole,
    heldBefore: (change) => {
      if (change.was === null || change.name === null || url.searchParams.has('fieldSelector')) return null;
      const described =
        kind === 'Card'
          ? cardHeld(change.name, change.was)
          : kind === 'Run'
            ? unlabelled(runHeld(change.was))
            : { namespace: change.namespace, labels: {} };
      if (described === null || described.namespace === null) return null;
      if (inPath !== undefined && described.namespace !== inPath) return null;
      return selectsLabels(parsed, described.labels) ? described.namespace : null;
    },
  } satisfies WatchFilter;
};

/** The answer that refuses a watch from a revision the keyspace cannot replay: 410 where compaction removed it, 400 past the head. */
const startRefused = (c: RequestContext<ApiEnv>, refused: 'gone' | 'ahead', revision: number) =>
  refused === 'gone'
    ? c.json(
        {
          error: `resourceVersion ${revision} is older than the history the store keeps: watch again without resourceVersion for the state whole, and resume from the metadata.resourceVersion of what it sends`,
        },
        410,
      )
    : c.json(
        {
          error: `resourceVersion ${revision} is past the store's latest revision: send the resourceVersion of the last event, BOOKMARK or list a watch or a GET sent, as it is`,
        },
        400,
      );

/**
 * The watch of a list whose kind the keyspace watches: without `resourceVersion` the state whole, each object ADDED, then a BOOKMARK at
 * the head read before it; with one, the objects that changed after that revision (`kindReplay`) and a BOOKMARK at the head the replay
 * held to, refused 410 where compaction removed the revision and 400 where it is past the head. It then reads the head on every beat and
 * replays the revisions written since, so what the keyspace holds loses no change however many a beat holds; a revision compacted away
 * under a watch ends the stream and the reader asks again. Nothing is kept between connections.
 */
async function revisionWatch(c: RequestContext<ApiEnv>, list: Listed, kind: WatchedKind) {
  const resourceVersion = c.req.query('resourceVersion');
  const start = watchStartOf(resourceVersion, false, versionAsked(resourceVersion));
  if (start.kind === 'refused') return c.json({ error: startRefusal(resourceVersion ?? '') }, 400);
  const url = new URL(c.req.url);
  url.searchParams.delete('watch');
  url.searchParams.delete('resourceVersion');
  const page = await c.var.runtime.runPromise(WatchPage);
  const readNow = () => readAll(list, c, url, page, 0);
  const known = new Set<string>();
  let first: { frames: string[]; at: number };
  if (start.kind === 'since') {
    const replay = await c.var.runtime.runPromise(kindReplay(kind, start.revision));
    if (!('changes' in replay)) return startRefused(c, replay.refused, start.revision);
    const read = replay.changes.length === 0 ? undefined : await readNow();
    if (read instanceof Response) return read;
    first = {
      frames: framesOfChanges(kind, start.revision, replay.changes, read, known, watchFilterOf(kind, url)).map((f) => f.data),
      at: replay.head,
    };
  } else {
    const at = await c.var.runtime.runPromise(keyspaceHead());
    const read = await readNow();
    if (read instanceof Response) return read;
    for (const object of read.objects.values()) known.add(keyOf(object));
    first = { frames: [...read.objects.values()].map((object) => frameOf({ type: 'ADDED', object }).data), at };
  }
  const opened = first;
  return streamSSE(c, async (stream: SSEStreamingApi) => {
    const gone = new AbortController();
    stream.onAbort(() => gone.abort());
    if (stream.aborted) gone.abort();
    const write = (frame: { data: string }) => Effect.promise(() => stream.writeSSE(frame));
    const state = { at: opened.at };
    for (const data of opened.frames) await stream.writeSSE({ data });
    await stream.writeSSE(bookmarkOf(kind, opened.at));
    const watched = Effect.gen(function* () {
      const beats = yield* Beats;
      const again = Effect.gen(function* () {
        const head = yield* Effect.promise(() => c.var.runtime.runPromise(keyspaceHead()));
        if (head <= state.at) return;
        const replay = yield* Effect.promise(() => c.var.runtime.runPromise(kindReplay(kind, state.at)));
        if (!('changes' in replay)) return yield* new ListRefused({ status: replay.refused === 'gone' ? 410 : 400 });
        const read = replay.changes.length === 0 ? undefined : yield* Effect.promise(readNow);
        if (read instanceof Response) return yield* new ListRefused({ status: read.status });
        const frames = framesOfChanges(kind, state.at, replay.changes, read, known, watchFilterOf(kind, url));
        state.at = replay.head;
        for (const frame of frames) yield* write(frame);
      });
      const changes = Stream.tick(beats.feed ?? WATCH_BEAT).pipe(
        Stream.mapEffect(() => again),
        Stream.map(() => null),
      );
      const bookmarks = Stream.tick(BOOKMARK_EVERY).pipe(
        Stream.drop(1),
        Stream.map(() => bookmarkOf(kind, state.at)),
      );
      return yield* Stream.merge(changes, bookmarks, { haltStrategy: 'left' }).pipe(
        Stream.runForEach((frame) => (frame === null ? Effect.void : write(frame))),
      );
    });
    await c.var.runtime.runPromiseExit(watched, { signal: gone.signal });
  });
}

/**
 * The watch of a list that is read again: the state whole, or a list that follows the feed from the byte asked, then each change sent as
 * the list's reads and the feed's lines say it.
 */
async function readAgainWatch(c: RequestContext<ApiEnv>, list: Listed, follow: Follow | undefined) {
  const opened = await openedAt(c, list, follow !== undefined);
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
      const now = yield* Effect.promise(() => readAll(list, c, url, page, feedSize(home)));
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
}

/**
 * `list` watched: without `watch` (or with `watch=false`) the request handed on as it is; with `watch=true` the stream above; any other
 * `watch`, or `limit` or `continue` beside it, refused 400 `{ error }` before anything is read. Given `follow`, a list whose objects are
 * the feed's own lines: after the initial state each line the list keeps is sent ADDED as it is followed, once, and the list is never
 * read again. A `resourceVersion` asked is read by
 * `watchStartOf`: of a list that follows the feed, the watch starts at that byte and sends no state (a byte the feed cannot be read from,
 * inside a line or past its end, refused 410, Kubernetes' expired one; the list's own refusals answered from a first page of one); of
 * a kind the keyspace watches, a revision (`revisionWatch`: 410 past the compaction window, 400 past the head); of any other list, or a
 * word that is no number, refused 400. Such a watch sends a BOOKMARK once it has sent every line written before it
 * opened (at once where none was), as the initial state's BOOKMARK ends what a reader was sent of what was there already: a reader
 * that resumes counts what it missed by it.
 * @param list The list's handler, which answers a request that is no watch and gives each read of one.
 */
export const watchable =
  (list: Listed, { follow, kind }: { readonly follow?: Follow; readonly kind?: WatchedKind } = {}) =>
  async (c: RequestContext<ApiEnv>) => {
    const asked = c.req.query('watch');
    if (asked === undefined || asked === 'false') return list(c);
    const refused = refusalOf(c);
    if (refused !== null) return c.json({ error: refused.error }, refused.status);
    if (kind !== undefined) return revisionWatch(c, list, kind);
    return readAgainWatch(c, list, follow);
  };

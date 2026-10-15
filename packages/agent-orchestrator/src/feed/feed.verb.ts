/**
 * The feed's verbs and its live readers: `emitFeed` writes a pass's lines once — appended to the feed, logged, and published to the
 * readers in its process (`FeedHub`) — as `emitDaemonStarted` writes a daemon's, and `followFeed` reads them as they come, from the hub
 * where it can and from the file where it must. The file stays the record: the hub is in memory, in one process, keeps nothing for a
 * reader that comes late, and drops what a slow reader has not taken, so a reader reads the file for every line no item of the hub
 * brought it.
 *
 * A controller: it reaches the store's file through the client's `tried`, and is run by the tick, `up` and the api's stream.
 */
import { Context, Effect, Layer, Metric, PubSub, Stream, type Duration } from 'effect';
import type { NonEmptyReadonlyArray } from 'effect/Array';
import { tried } from '../runtime-client.ts';
import { isRefusal, type Refusal } from '../refusal/refusal.ts';
import { feedSaidWords, isRunLine, publishedOf, type DaemonLine, type FeedLine, type FeedPublished, type FeedWords } from './feed.ts';
import { feedSize, readFeedEnds, recordDaemonLine, recordFeed } from './feed.store.ts';

/**
 * The live readers' hub in this process: a sliding `PubSub` of the lines `emitFeed` wrote, or none. None by default: a process that
 * provides no hub (`feedHubLayer`) writes and logs its lines, and its readers read the file.
 */
export const FeedHub = Context.Reference<PubSub.PubSub<FeedPublished> | undefined>('nemia/FeedHub', {
  defaultValue: () => undefined,
});

/**
 * One hub for the process, made once by its layer and shut down as the layer's scope closes: sliding, so a publish never waits for a
 * reader, and a reader that takes nothing costs at most `capacity` lines of memory, the oldest dropped first.
 */
export const feedHubLayer = (capacity = 1024): Layer.Layer<never> =>
  Layer.effect(FeedHub, Effect.acquireRelease(PubSub.sliding<FeedPublished>(capacity), PubSub.shutdown));

/** The live readers of the feed in this process, each counted while its stream is open (`followFeed`). */
export const FEED_FOLLOWERS = Metric.gauge('feed.followers', { description: 'the live readers of the workflow feed, each an open stream' });

/** The beats of the live readers: each a stat of the file, which reads it only when it is not where the reader is (`wake`). */
export const FEED_FOLLOW_BEATS = Metric.counter('feed.follow.beats', {
  description: 'the beats of the live readers of the workflow feed, each a stat of its file',
  incremental: true,
});

/**
 * The reads of the file the live readers made: the first of each reader, and one for each wake that found the file not where the reader
 * is, or that tried again.
 */
export const FEED_FOLLOW_READS = Metric.counter('feed.follow.reads', {
  description: 'the reads of the workflow feed its live readers made',
  incremental: true,
});

/**
 * The lines the live readers handed on, as each leaves its reader (`followFeed`): from its first read, from the hub and from a later read
 * alike. A beat, a failed read and an item already handed are no line.
 */
export const FEED_FOLLOW_LINES = Metric.counter('feed.follow.lines', {
  description: 'the lines of the workflow feed its live readers handed on',
  incremental: true,
});

/** Logs one line of the feed at Info, annotated with its run and its step when it names one, or its daemon's pid, and its word. */
const logged = (line: FeedLine): Effect.Effect<void> =>
  Effect.logInfo(feedSaidWords(line)).pipe(
    Effect.annotateLogs({
      ...(isRunLine(line) ? { run: line.run, ...(line.step !== undefined ? { step: line.step } : {}) } : { daemon: line.daemon }),
      word: line.word,
    }),
  );

/**
 * A pass's words written to the feed where they changed (`recordFeed`), each line written logged (`logged`) and, where the process has a
 * hub (`FeedHub`), published to it with the bytes it was written at (`publishedOf`): none when another writer's bytes landed among them.
 * Answers with the lines written. Fails with a refusal of the store, and dies of anything else it threw.
 */
export const emitFeed = Effect.fn('emitFeed')(function* (now: ReadonlyMap<string, FeedWords>, options?: Parameters<typeof recordFeed>[1]) {
  const appended = yield* tried(() => recordFeed(now, options));
  yield* Effect.forEach(appended.lines, logged, { discard: true });
  const hub = yield* FeedHub;
  if (hub) yield* PubSub.publishAll(hub, publishedOf(appended));
  return appended.lines;
});

/**
 * A daemon's line written to the feed (`recordDaemonLine`), logged, and published to the process's hub where it has one, as `emitFeed`
 * does a pass's. Fails with a refusal of the store, and dies of anything else it threw.
 */
export const emitDaemonStarted = Effect.fn('emitDaemonStarted')(function* (line: DaemonLine) {
  const appended = yield* tried(() => recordDaemonLine(line));
  yield* logged(line);
  const hub = yield* FeedHub;
  if (hub) yield* PubSub.publishAll(hub, publishedOf(appended));
});

/**
 * What a live reader of the feed is handed: a line with the cursor just after it; a read of the file that failed, in words, said once
 * until one works; and the first read that works after it.
 */
export type Followed = { kind: 'line'; line: FeedLine; cursor: number } | { kind: 'unreadable'; error: string } | { kind: 'readable' };

/** Where a reader is: the byte it has handed every line before, and whether its last read failed. */
type Following = { cursor: number; failing: boolean };

/** What one wake hands on, and where the reader is after it. */
type Woken = Effect.Effect<readonly [Following, Followed[]], Refusal>;

/**
 * A read of the file from the reader's cursor to its end, counted (`FEED_FOLLOW_READS`): each line with its cursor, `readable` first when
 * the read before it failed. A refusal (exit 2, the feed cut under the cursor) fails the stream; any other failure is said once, and the
 * next wake reads again.
 */
const readOn = (at: Following): Woken =>
  Metric.update(FEED_FOLLOW_READS, 1).pipe(
    Effect.andThen(Effect.try({ try: () => readFeedEnds(at.cursor), catch: (err) => err })),
    Effect.matchEffect({
      onFailure: (err) =>
        isRefusal(err)
          ? Effect.fail(err)
          : Effect.succeed([
              { ...at, failing: true },
              at.failing ? [] : [{ kind: 'unreadable', error: err instanceof Error ? err.message : String(err) }],
            ] as const),
      onSuccess: (got) =>
        Effect.succeed([
          { cursor: got.cursor, failing: false },
          [
            ...(at.failing ? [{ kind: 'readable' } as const] : []),
            ...got.lines.map((line, i) => ({ kind: 'line', line, cursor: got.ends[i] }) as const),
          ],
        ] as const),
    }),
  );

/**
 * One wake of a reader at `at`: an item of the hub (`published`), or a beat (undefined). An item that ends at or before the cursor was
 * handed on already, by a read; one that starts at the cursor is handed on without a read; one past it means lines no item brought —
 * dropped by the hub, or written by another process — and the file is read from the cursor. A beat costs one stat, counted
 * (`FEED_FOLLOW_BEATS`): the file is read only when its size is not the cursor, so a cut (smaller) is refused by the read. A reader whose
 * last read failed reads on every wake.
 */
const wake = (at: Following, published: FeedPublished | undefined): Woken => {
  if (at.failing) return readOn(at);
  if (published) {
    if (published.to <= at.cursor) return Effect.succeed([at, []] as const);
    if (published.from === at.cursor)
      return Effect.succeed([{ ...at, cursor: published.to }, [{ kind: 'line', line: published.line, cursor: published.to }]] as const);
    return readOn(at);
  }
  return Metric.update(FEED_FOLLOW_BEATS, 1).pipe(
    Effect.andThen(Effect.try({ try: feedSize, catch: () => undefined })),
    Effect.matchEffect({
      onFailure: () => readOn(at),
      onSuccess: (size) => (size === at.cursor ? Effect.succeed([at, []] as const) : readOn(at)),
    }),
  );
};

/**
 * One take of a reader at `at`: the items of the hub taken at once, or a beat, each woken in order (`wake`), what each hands on handed on
 * together.
 */
const wakeAll = (at: Following, taken: NonEmptyReadonlyArray<FeedPublished | undefined>): Woken =>
  Effect.reduce(
    taken,
    (): readonly [Following, Followed[]] => [at, []],
    ([now, handed], published) => Effect.map(wake(now, published), ([next, more]) => [next, [...handed, ...more]] as const),
  );

/**
 * The feed from `from`, live: every line after the cursor, then each as it is written, once each and in order, each with the cursor just
 * after it — until the stream is closed. The items of one take of the hub, as the lines of one pass published together, and the lines of
 * one read of the file are handed on as one chunk.
 *
 * It subscribes to the process's hub (`FeedHub`) before it reads anything, so no line written after its first read is missed; reads the
 * file from the cursor (`readOn`); and only then is counted in `FEED_FOLLOWERS`, so a reader counted is one that will be handed every line
 * from then on. It then wakes on each item of the hub and on each `beat`, the first a beat after it opened (`wake`). The beat brings every
 * line no item did: one the sliding hub dropped while the reader lagged and none came after, one another process wrote (a `nemia tick` by
 * hand), and every line where the process has no hub. The subscription and the count are held in the stream's scope. Each line is
 * counted as it is handed on (`FEED_FOLLOW_LINES`), its chunk kept whole.
 *
 * Fails with the refusal of a cursor the feed cannot be read from (exit 2): not a whole number, inside a line, or past the end — a feed
 * cut under the cursor, truncated below it or replaced, whether before the stream opens or while it is open.
 */
export const followFeed = (from: number, { beat = '1 second' }: { beat?: Duration.Input } = {}): Stream.Stream<Followed, Refusal> =>
  Stream.unwrap(
    Effect.gen(function* () {
      const hub = yield* FeedHub;
      const published: Stream.Stream<FeedPublished | undefined> = hub
        ? Stream.fromSubscription(yield* PubSub.subscribe(hub))
        : Stream.empty;
      const [following, caught] = yield* readOn({ cursor: from, failing: false });
      yield* Effect.acquireRelease(Metric.modify(FEED_FOLLOWERS, 1), () => Metric.modify(FEED_FOLLOWERS, -1));
      const beats = Stream.tick(beat).pipe(
        Stream.drop(1),
        Stream.map(() => undefined),
      );
      const live = Stream.merge(published, beats).pipe(Stream.mapAccumArrayEffect((): Following => following, wakeAll));
      return Stream.concat(Stream.fromIterable(caught), live).pipe(
        Stream.mapArrayEffect((chunk) =>
          Metric.update(FEED_FOLLOW_LINES, chunk.filter((f) => f.kind === 'line').length).pipe(Effect.as(chunk)),
        ),
      );
    }),
  );

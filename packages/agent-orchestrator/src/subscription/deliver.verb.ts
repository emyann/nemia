/**
 * The daemon's deliverer of subscriptions: for each subscription on disk, the feed followed from where its deliverer was (`followFeed`), a
 * wake line said to its task at once through the engine's `say`, with the digest that rides it, and each routine line folded into the
 * digest, said alone once `digestEvery` minutes have passed with no wake (`sortLine`, `messageOf`, `digestOf`, `digestDue`).
 *
 * Where it is with each is written after each line, and after a line is said only once `say` resolved, so a restart, read from the
 * deliverer's file, neither repeats nor drops a line: a line is told at least once, to the harness's inbox. A `say` that fails is said
 * again, for ever, on a capped exponential backoff, each failure a warning; the feed is not read on meanwhile. A feed cut under the cursor
 * is read again from its start. Each beat the subscriptions are read again: one gone is stopped and its deliverer's file dropped, one new
 * or changed is started (`FiberMap`).
 *
 * A controller: it reaches the runtime through the client (`EngineService`), run by `up` (`daemon/up.verb.ts`) once it holds the store.
 */
import { Cause, Effect, FiberMap, Metric, Ref, Schedule, Semaphore, Stream, type Duration } from 'effect';
import { instantNow } from '../daemon/daemon.store.ts';
import type { FeedLine } from '../feed/feed.ts';
import { followFeed, type Followed } from '../feed/feed.verb.ts';
import { EngineService } from '../runtime-client.ts';
import { dropDelivery, listDeliveries, listSubscriptions, readDelivery, writeDelivery } from './subscription.store.ts';
import { digestDue, digestOf, messageOf, sortLine, type Delivery, type Subscription } from './subscription.ts';

/** The wake lines said to subscribers. */
export const SUBSCRIPTION_WAKES = Metric.counter('subscription.wakes', { description: 'the wake lines of the feed said to a subscriber' });

/** The digests said alone, with no wake to ride. */
export const SUBSCRIPTION_DIGESTS = Metric.counter('subscription.digests', {
  description: "the digests of the feed's routine lines said to a subscriber with no wake to ride",
});

/** Each `say` to a subscriber that failed, said again after its backoff. */
export const SUBSCRIPTION_SAY_FAILURES = Metric.counter('subscription.say.failures', {
  description: 'the says to a subscriber that failed, each said again after a backoff',
});

/**
 * How the deliverer paces itself: how often it reads the subscriptions again (`every`), the beat of each feed it follows (`beat`), how
 * often it asks whether a digest is due (`digestCheck`), and a failed `say`'s backoff, from `retry` doubling up to `retryCap`.
 */
export type DeliverOptions = {
  every: Duration.Input;
  beat: Duration.Input;
  digestCheck: Duration.Input;
  retry: Duration.Input;
  retryCap: Duration.Input;
};

/** The deliverer's pace when it is given none. */
export const DELIVER_DEFAULTS: DeliverOptions = {
  every: '5 seconds',
  beat: '1 second',
  digestCheck: '30 seconds',
  retry: '1 second',
  retryCap: '5 minutes',
};

/** `text` said to the subscription `name`'s task, said again on its backoff until the engine takes it, each failure a warning. */
const told = (name: string, sub: Subscription, text: string, o: DeliverOptions): Effect.Effect<void, never, EngineService> =>
  Effect.gen(function* () {
    const e = yield* EngineService;
    yield* e.say(sub.task, text).pipe(
      Effect.tapError((err) =>
        Metric.update(SUBSCRIPTION_SAY_FAILURES, 1).pipe(
          Effect.andThen(
            Effect.logWarning(`the subscription ${name} could not tell ${sub.task} (${err.message}): said again after a backoff`),
          ),
        ),
      ),
      Effect.retry(Schedule.min([Schedule.exponential(o.retry), Schedule.spaced(o.retryCap)])),
      Effect.orDie,
    );
  });

/** One subscription's delivery: where its deliverer is (`state`), written through after each change, and its lock, one change at a time. */
type Delivering = { name: string; sub: Subscription; o: DeliverOptions; state: Ref.Ref<Delivery>; lock: Semaphore.Semaphore };

/** `next` kept: in memory and on disk. */
const keep = (d: Delivering, next: Delivery): Effect.Effect<void> =>
  Ref.set(d.state, next).pipe(Effect.andThen(Effect.sync(() => writeDelivery(d.name, next))));

/** A line of the feed, ending at `cursor`: a wake said with the digest it carries, then the cursor kept; else folded into the digest. */
const onLine = (d: Delivering, line: FeedLine, cursor: number): Effect.Effect<void, never, EngineService> =>
  Effect.gen(function* () {
    const at = yield* Ref.get(d.state);
    if (sortLine(line, d.sub.wake) === 'routine')
      return yield* keep(d, { cursor, digest: [...at.digest, line], since: at.since ?? instantNow() });
    yield* told(d.name, d.sub, messageOf(line, at.digest), d.o);
    yield* Metric.update(SUBSCRIPTION_WAKES, 1);
    yield* keep(d, { cursor, digest: [] });
  });

/** The digest said alone where it is due, then emptied. */
const digestPass = (d: Delivering): Effect.Effect<void, never, EngineService> =>
  Effect.gen(function* () {
    const at = yield* Ref.get(d.state);
    if (!at.digest.length || !digestDue(at.since, d.sub.digestEvery, instantNow())) return;
    yield* told(d.name, d.sub, digestOf(at.digest), d.o);
    yield* Metric.update(SUBSCRIPTION_DIGESTS, 1);
    yield* keep(d, { cursor: at.cursor, digest: [] });
  });

/** What the deliverer does of an item of the feed it follows: a line, one at a time; a feed that does not read, a warning. */
const onItem =
  (d: Delivering) =>
  (item: Followed): Effect.Effect<void, never, EngineService> =>
    item.kind === 'line'
      ? d.lock.withPermit(onLine(d, item.line, item.cursor))
      : item.kind === 'unreadable'
        ? Effect.logWarning(`the subscription ${d.name} waits for the feed to read: ${item.error}`)
        : Effect.void;

/** The feed followed from the cursor, for ever; cut under it, read again from its start. */
const reading = (d: Delivering): Effect.Effect<never, never, EngineService> =>
  Effect.suspend(() => Ref.get(d.state)).pipe(
    Effect.flatMap((at) => followFeed(at.cursor, { beat: d.o.beat }).pipe(Stream.runForEach(onItem(d)))),
    Effect.catch((cut) =>
      Effect.logWarning(`the subscription ${d.name} reads the feed again from its start: ${cut.message}`).pipe(
        Effect.andThen(d.lock.withPermit(Ref.get(d.state).pipe(Effect.flatMap((at) => keep(d, { ...at, cursor: 0 }))))),
      ),
    ),
    Effect.forever,
  );

/** The subscription `name` delivered, from where its deliverer's file says it was, else from its `from`, until interrupted. */
const delivering = (name: string, sub: Subscription, o: DeliverOptions): Effect.Effect<never, never, EngineService> =>
  Effect.gen(function* () {
    const state = yield* Ref.make<Delivery>(readDelivery(name) ?? { cursor: sub.from, digest: [] });
    const d: Delivering = { name, sub, o, state, lock: yield* Semaphore.make(1) };
    yield* Effect.forkChild(Effect.forever(d.lock.withPermit(digestPass(d)).pipe(Effect.andThen(Effect.sleep(o.digestCheck)))));
    return yield* reading(d);
  });

/**
 * One read of the subscriptions: each gone stopped, then each deliverer's file whose subscription is gone dropped, then each new or changed
 * started. `started` holds what each running one was started with.
 */
const reconcile = (fibers: FiberMap.FiberMap<string>, started: Map<string, string>, o: DeliverOptions) =>
  Effect.gen(function* () {
    const subs = listSubscriptions();
    const names = new Set(subs.map((s) => s.name));
    for (const name of [...started.keys()].filter((n) => !names.has(n))) {
      yield* FiberMap.remove(fibers, name);
      started.delete(name);
    }
    for (const name of listDeliveries().filter((n) => !names.has(n))) dropDelivery(name);
    for (const { name, subscription } of subs) {
      const spec = JSON.stringify(subscription);
      if (started.get(name) === spec && (yield* FiberMap.has(fibers, name))) continue;
      started.set(name, spec);
      yield* FiberMap.run(fibers, name, delivering(name, subscription, o));
    }
  });

/**
 * The deliverer, for as long as it runs: the subscriptions read again each `every` (`reconcile`), each delivered by a fiber of its own.
 * A read that throws is a warning, and the next is tried a beat later.
 */
export const deliver = (options: Partial<DeliverOptions> = {}): Effect.Effect<never, never, EngineService> => {
  const o = { ...DELIVER_DEFAULTS, ...options };
  return Effect.scoped(
    Effect.gen(function* () {
      const fibers = yield* FiberMap.make<string>();
      const started = new Map<string, string>();
      const pass = Effect.suspend(() => reconcile(fibers, started, o)).pipe(
        Effect.catchCause((cause) => Effect.logWarning(`the subscriptions could not be read: ${Cause.pretty(cause)}`)),
      );
      return yield* Effect.forever(pass.pipe(Effect.andThen(Effect.sleep(o.every))));
    }),
  );
};

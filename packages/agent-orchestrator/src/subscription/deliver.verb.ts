/**
 * The daemon's deliverer of subscriptions: for each subscription on disk, the feed followed from where its deliverer was (`followFeed`),
 * and each read of it delivered as one: the wake lines it holds said to its task at once, in one message through the engine's `say`, with
 * the digest that rides them, and each routine line folded into the digest, said alone once `digestEvery` minutes have passed with no wake
 * (`readDelivered`, `messageOf`, `digestOf`, `digestDue`).
 *
 * A read is everything the feed's reader has handed on since the deliverer last took, at least one item: a pass's lines come together, and
 * lines that come while a `say` is in flight or waits on its backoff are gathered for the next message, up to the hub's 1024 items. No
 * window waits for more: the first line of a wake is said as soon as the deliverer is free.
 *
 * Where it is with each is written after each read, and after a read that holds a wake only once its `say` resolved, so a restart, read
 * from the deliverer's file, drops no line: a message is told at least once, to the harness's inbox, and said again whole by a deliverer
 * stopped before its cursor was written. The file is stamped with the subscription it is for, so one put again under the same name starts
 * from its own `from`. A `say` that fails is said again whole, for ever, on a capped exponential backoff, each failure a warning; the feed
 * read meanwhile waits for the next message. A feed cut under the cursor is read again from its start. Each beat the subscriptions are
 * read again: one gone is stopped and its deliverer's file dropped, one new or changed is started (`FiberMap`).
 *
 * A scoped subscription carries only the lines of runs whose factory is at its floor or above (`atLeast`), read as each line comes: the
 * run's factory once per run, frozen at its start, and the factory's level each time, so a raise counts from its start to its end. A
 * line below the floor, or of a run that does not read, is passed: the cursor moves on, and nothing is said or folded of it.
 *
 * A controller: it reaches the runtime through the client (`EngineService`), run by `up` (`daemon/up.verb.ts`) once it holds the store.
 */
import { Cause, Effect, FiberMap, Metric, Ref, Schedule, Semaphore, Stream, type Duration } from 'effect';
import type { NonEmptyReadonlyArray } from 'effect/Array';
import { instantNow } from '../daemon/daemon.store.ts';
import { isRunLine, type FeedLine } from '../feed/index.ts';
import { followFeed, type Followed } from '../feed/feed.verb.ts';
import { EngineService } from '../runtime-client.ts';
import { atLeast } from '../level/level.ts';
import { levelOfFactory, runFactory } from '../level/levels.verb.ts';
import { dropDelivery, listDeliveries, listSubscriptions, readDelivery, writeDelivery } from './subscription.store.ts';
import { digestDue, digestOf, readDelivered, resumedAt, type Delivery, type Subscription } from './subscription.ts';
import { parseSelectors, type Selectors } from '../watch/selector.ts';

/** The wake lines said to subscribers. */
export const SUBSCRIPTION_WAKES = Metric.counter('subscription.wakes', { description: 'the wake lines of the feed said to a subscriber' });

/** The digests said alone, with no wake to ride. */
export const SUBSCRIPTION_DIGESTS = Metric.counter('subscription.digests', {
  description: "the digests of the feed's routine lines said to a subscriber with no wake to ride",
});

/** The deliverer's checks of whether a digest is due, each counted once it is done. */
export const SUBSCRIPTION_DIGEST_CHECKS = Metric.counter('subscription.digest.checks', {
  description: 'the checks of whether a digest of the feed is due, each counted once done',
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

/** The pace a failed `say` is said again at: after `retry`, doubling each time, and never longer than `retryCap`. */
export const sayBackoff = (o: Pick<DeliverOptions, 'retry' | 'retryCap'>) =>
  Schedule.min([Schedule.exponential(o.retry), Schedule.spaced(o.retryCap)]);

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
      Effect.retry(sayBackoff(o)),
      Effect.orDie,
    );
  });

/**
 * One subscription's delivery: where its deliverer is (`state`), written through after each change, its lock, one change at a time, the
 * selectors of its record parsed once (`selectors`), and the factory of each run it has read (`factories`), frozen on the run's record.
 */
type Delivering = {
  name: string;
  sub: Subscription;
  selectors: Selectors;
  o: DeliverOptions;
  state: Ref.Ref<Delivery>;
  lock: Semaphore.Semaphore;
  factories: Map<string, string>;
};

/** `next` kept: in memory, and on disk stamped with the subscription it is for. */
const keep = (d: Delivering, next: Delivery): Effect.Effect<void> =>
  Ref.set(d.state, next).pipe(
    Effect.andThen(Effect.sync(() => writeDelivery(d.name, { ...next, of: { task: d.sub.task, from: d.sub.from } }))),
  );

/** Whether the subscription carries a line of the run `run`: unscoped, always; scoped, where the run's factory is at its floor now. */
const carries = (d: Delivering, run: string): Effect.Effect<boolean> => {
  const floor = d.sub.scope?.atLeast;
  if (floor === undefined) return Effect.succeed(true);
  return Effect.gen(function* () {
    const factory = d.factories.get(run) ?? (yield* runFactory(run));
    d.factories.set(run, factory);
    return atLeast(yield* levelOfFactory(factory), floor);
  }).pipe(Effect.catchCause(() => Effect.succeed(false)));
};

/**
 * One read of the feed, its lines ending at `cursor`, delivered: a run's line the subscription does not carry passed, a daemon's carried
 * by every one; where a carried line wakes, the message said, then the cursor kept; else the routine lines folded into the digest.
 */
const onLines = (d: Delivering, lines: readonly FeedLine[], cursor: number): Effect.Effect<void, never, EngineService> =>
  Effect.gen(function* () {
    const at = yield* Ref.get(d.state);
    const carried = yield* Effect.filter(lines, (line) => (isRunLine(line) ? carries(d, line.run) : Effect.succeed(true)));
    const read = readDelivered(at, carried, d.selectors, cursor, instantNow());
    if (read.message !== undefined) {
      yield* told(d.name, d.sub, read.message, d.o);
      yield* Metric.update(SUBSCRIPTION_WAKES, read.wakes);
    }
    yield* keep(d, read.next);
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

/**
 * What the deliverer does of one read of the feed it follows: a feed that does not read, a warning; its lines, delivered as one, under the
 * lock; a read with none, nothing.
 */
const onRead =
  (d: Delivering) =>
  (items: NonEmptyReadonlyArray<Followed>): Effect.Effect<void, never, EngineService> =>
    Effect.gen(function* () {
      for (const item of items)
        if (item.kind === 'unreadable') yield* Effect.logWarning(`the subscription ${d.name} waits for the feed to read: ${item.error}`);
      const lines = items.flatMap((item) => (item.kind === 'line' ? [item] : []));
      const last = lines.at(-1);
      if (last)
        yield* d.lock.withPermit(
          onLines(
            d,
            lines.map((item) => item.line),
            last.cursor,
          ),
        );
    });

/** How many items of the feed a deliverer gathers while it says a message: the hub's own capacity (`feedHubLayer`). */
const GATHERED = 1024;

/** The feed followed from the cursor, for ever, a read at a time; cut under it, read again from its start. */
const reading = (d: Delivering): Effect.Effect<never, never, EngineService> =>
  Effect.suspend(() => Ref.get(d.state)).pipe(
    Effect.flatMap((at) =>
      followFeed(at.cursor, { beat: d.o.beat }).pipe(
        Stream.buffer({ capacity: GATHERED, strategy: 'suspend' }),
        Stream.runForEachArray(onRead(d)),
      ),
    ),
    Effect.catch((cut) =>
      Effect.logWarning(`the subscription ${d.name} reads the feed again from its start: ${cut.message}`).pipe(
        Effect.andThen(d.lock.withPermit(Ref.get(d.state).pipe(Effect.flatMap((at) => keep(d, { ...at, cursor: 0 }))))),
      ),
    ),
    Effect.forever,
  );

/**
 * The subscription `name` delivered, from where its deliverer's file says it was if the file was written for it, else from its `from`,
 * until interrupted.
 */
const delivering = (name: string, sub: Subscription, o: DeliverOptions): Effect.Effect<never, never, EngineService> =>
  Effect.gen(function* () {
    const state = yield* Ref.make<Delivery>(resumedAt(readDelivery(name), sub));
    const d: Delivering = {
      name,
      sub,
      selectors: parseSelectors(sub.selectors),
      o,
      state,
      lock: yield* Semaphore.make(1),
      factories: new Map(),
    };
    const check = d.lock.withPermit(digestPass(d)).pipe(Effect.andThen(Metric.update(SUBSCRIPTION_DIGEST_CHECKS, 1)));
    yield* Effect.forkChild(Effect.forever(check.pipe(Effect.andThen(Effect.sleep(o.digestCheck)))));
    return yield* reading(d);
  });

/**
 * One read of the subscriptions: each gone stopped, then each deliverer's file whose subscription is gone dropped, then each new or changed
 * started, a changed one's deliverer stopped first. `started` holds what each running one was started with.
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
      yield* FiberMap.remove(fibers, name);
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

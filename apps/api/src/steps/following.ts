/**
 * The steps followed live in this process (`Followings`): one upstream `followStep` a run and step, shared by every follower of it, and
 * the message it is writing held in memory, so a follower who joins late is handed the text so far before what comes next.
 */
import { Cause, Context, Deferred, Effect, FiberMap, Layer, Metric, PubSub, Stream } from 'effect';
import { EngineService, followStep, type StepMoment } from 'agent-orchestrator';
import type { Engine } from '../store.ts';

/** One moment a follower is handed: the step's (`StepMoment`), or `ended` when the upstream stopped short of `settled`, and why. */
export type Relayed = StepMoment<TranscriptEvent> | { kind: 'ended'; error: string };

/** A whole event of the conversation, as the engine reads it. */
export type TranscriptEvent = Effect.Success<ReturnType<Engine['Service']['transcript']>>['events'][number];

/** The message being written: the text block's `key`, and its text so far. */
type Held = { key: string; text: string };

/** One moment as the upstream published it, numbered from 1 in the order it came. */
type Numbered = { seq: number; m: Relayed };

/**
 * One step followed: its upstream's subscribers (`hub`), how many follow it (`refs`), the number of the last moment published, whether
 * its harness streams once its first moment said so (`opened`), the message being written (`held`), and the moment it ended with
 * (`last`, `isLast`).
 */
type Entry = {
  hub: PubSub.PubSub<Numbered>;
  refs: number;
  seq: number;
  opened: Deferred.Deferred<boolean | string>;
  held: Held | null;
  last?: Relayed;
};

/** The upstreams opened, a step followed by nobody yet each (`followStep`): counted as they open, never as followers join one. */
export const STEP_FOLLOWS = Metric.counter('api.step.follows', {
  description: 'the upstream followings of a step opened',
  incremental: true,
});

/**
 * The message being written after `m`, from `held`: the text of a block added to, or begun, by a piece of it; none once the block is
 * written whole (`last`), a whole text event is read, or the step moves to another task.
 */
export const heldAfter = (held: Held | null, m: Relayed): Held | null => {
  if (m.kind === 'partial') {
    if (m.last) return null;
    return m.append && held?.key === m.key ? { key: m.key, text: held.text + m.text } : { key: m.key, text: m.text };
  }
  if (m.kind === 'moved') return null;
  if (m.kind === 'events' && m.events.some((ev) => ev.kind === 'text')) return null;
  return held;
};

/** The moment that ends an upstream's followers: its `settled`, its `streamed: false`, or its `ended`. */
const isLast = (m: Relayed) => m.kind === 'settled' || m.kind === 'ended' || (m.kind === 'streamed' && !m.yes);

/** The words of what an upstream failed or died with. */
const wordsOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * What a follower is handed once it has joined, the upstream's snapshot taken: `streamed` first, then the conversation it read
 * (`caught`), the moments queued for it while it read but the pieces the snapshot holds, the message held, and every later moment.
 */
const joinedHead = (yes: boolean, caught: Relayed | undefined, queued: Numbered[], snap: { seq: number; held: Held | null }) => [
  { kind: 'streamed', yes } as const,
  ...(caught ? [caught] : []),
  ...queued.filter((q) => q.seq <= snap.seq && q.m.kind !== 'partial' && q.m.kind !== 'streamed').map((q) => q.m),
  ...(snap.held ? [{ kind: 'partial', key: snap.held.key, text: snap.held.text, append: false, last: false } as const] : []),
  ...queued.filter((q) => q.seq > snap.seq).map((q) => q.m),
];

/**
 * The registry of the steps followed by an app (`follow`), one for its runtime (`live`), its upstreams forked in the runtime's scope and
 * interrupted with it.
 *
 * `follow(e, runId, step, caught)` follows the step `step` of the run `runId` over the engine `e`, on the upstream already open for it,
 * else on one it opens (`STEP_FOLLOWS`) once subscribed. It subscribes before it reads anything, so nothing published after is lost, and
 * an upstream that ended before is handed by its last moment; it waits for the
 * upstream's first moment; then, a harness that streams, runs `caught` — the conversation since the follower's own read — and hands
 * the moments `joinedHead` says, then each as it is published. It ends after `settled`, `streamed: false`, or `ended` with the words of
 * an upstream that failed. A follower leaving lets the upstream go once it was the last (`refs`).
 */
export class Followings extends Context.Service<
  Followings,
  {
    readonly follow: (
      e: Engine['Service'],
      runId: string,
      step: string,
      caught: Effect.Effect<Relayed | undefined>,
    ) => Stream.Stream<Relayed>;
  }
>()('api/Followings') {
  static readonly live: Layer.Layer<Followings> = Layer.effect(Followings)(
    Effect.gen(function* () {
      const upstreams = yield* FiberMap.make<string>();
      const entries = new Map<string, Entry>();
      const opened = (e: Engine['Service'], runId: string, step: string, key: string) =>
        Effect.gen(function* () {
          const entry: Entry = {
            hub: yield* PubSub.unbounded<Numbered>(),
            refs: 0,
            seq: 0,
            opened: yield* Deferred.make<boolean | string>(),
            held: null,
          };
          const publish = (m: Relayed) =>
            Effect.sync(() => {
              entry.held = heldAfter(entry.held, m);
              entry.seq += 1;
              if (isLast(m)) entry.last = m;
              if (isLast(m) && entries.get(key) === entry) entries.delete(key);
              PubSub.publishUnsafe(entry.hub, { seq: entry.seq, m });
            }).pipe(Effect.andThen(m.kind === 'streamed' ? Deferred.succeed(entry.opened, m.yes) : Effect.void));
          const ended = (error: string) => publish({ kind: 'ended', error }).pipe(Effect.andThen(Deferred.succeed(entry.opened, error)));
          const upstream = followStep(runId, step).pipe(
            Stream.runForEach(publish),
            Effect.catchCause((cause) => ended(wordsOf(Cause.squash(cause)))),
            Effect.provideService(EngineService, e),
          );
          entries.set(key, entry);
          return { entry, start: Metric.update(STEP_FOLLOWS, 1).pipe(Effect.andThen(FiberMap.run(upstreams, key, upstream))) };
        });
      const left = (key: string, entry: Entry) =>
        Effect.suspend(() => {
          entry.refs -= 1;
          if (entry.refs > 0 || entries.get(key) !== entry) return Effect.void;
          entries.delete(key);
          return FiberMap.remove(upstreams, key);
        });
      const follow = (e: Engine['Service'], runId: string, step: string, caught: Effect.Effect<Relayed | undefined>) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const key = JSON.stringify([runId, step]);
            const known = entries.get(key);
            const { entry, start } = known ? { entry: known, start: Effect.void } : yield* opened(e, runId, step, key);
            entry.refs += 1;
            yield* Effect.addFinalizer(() => left(key, entry));
            const sub = yield* PubSub.subscribe(entry.hub);
            yield* start;
            const said = yield* Deferred.await(entry.opened);
            if (typeof said === 'string') return Stream.make<[Relayed]>({ kind: 'ended', error: said });
            if (!said) return Stream.make<[Relayed]>({ kind: 'streamed', yes: false });
            const read = yield* caught;
            const snap = { seq: entry.seq, held: entry.held };
            const queued = [...(yield* PubSub.takeUpTo(sub, Number.MAX_SAFE_INTEGER))];
            const last = entry.last;
            const gone = last !== undefined && !queued.some((q) => isLast(q.m));
            return Stream.concat(
              Stream.fromIterable<Relayed>(joinedHead(said, read, queued, snap)),
              gone ? Stream.make<[Relayed]>(last) : Stream.fromSubscription(sub).pipe(Stream.map((q) => q.m)),
            ).pipe(Stream.takeUntil(isLast));
          }),
        );
      return { follow };
    }),
  );
}

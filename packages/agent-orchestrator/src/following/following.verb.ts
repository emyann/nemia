/**
 * `followStep`: one step's session followed live, across a person's answer, the next turn and a try, waking on the feed between them. A
 * controller: it reaches the runtime's `follow`, `view` and `transcript` through the client (`runtime-client.ts`), and the run's record
 * and the feed beneath it; a stream its caller runs over the engine (`EngineService`).
 */
import { Effect, Stream } from 'effect';
import { EngineService, asked, type Engine, type TranscriptEvent } from '../runtime-client.ts';
import { Missing, type Refusal } from '../refusal/refusal.ts';
import { isRunLine } from '../feed/index.ts';
import { FeedDoor } from '../feed/feed.store.ts';
import { followFeed } from '../feed/feed.verb.ts';
import { nextOf, type FollowedAttempt, type StepMoment, type StepNow } from './following.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { RunId } from '../record/record.model.ts';

type Moment = StepMoment<TranscriptEvent>;

const STREAMED: Moment = { kind: 'streamed', yes: true };
const UNSTREAMED: Moment = { kind: 'streamed', yes: false };
const FINISHED: Moment = { kind: 'settled' };

/** What one following holds while it runs: whether a refusal to stream has ended it. */
type Hold = { unstreamed: boolean };

/**
 * The step `step` of the run `runId` as it stands (`StepNow`): its record's task, that task's last attempt, whether the journal has its
 * end, and whether the task settled. Refused (`Missing`) for a run the store has not and for a step with no task filed.
 */
const stepNowOf = (e: Engine, runId: string, step: string): Effect.Effect<StepNow, Refusal> =>
  Effect.gen(function* () {
    const run = yield* (yield* RunDoor).runs.read(RunId.read(runId));
    const taskId = run.steps[step]?.taskId ?? null;
    if (taskId === null)
      return yield* Effect.fail(
        new Missing({
          message: `run ${runId} has no session of a step \`${step}\` to follow: follow it once \`nemia ls\` shows it filed.`,
        }),
      );
    const view = yield* asked('view', e.view(taskId));
    const last = view.state.attempts.at(-1);
    return { taskId, attempt: last?.n ?? 0, live: last !== undefined && last.endedAt === null, settled: view.state.settled !== null };
  });

/**
 * The live attempt of `taskId` as the runtime hands it, its history first where `history` asks for it: the transcript from `history.after`,
 * or from the start, read once the follow has said its first moment, so nothing written between is lost, and each event the follow hands
 * again after it dropped. A harness that does not stream, or a session it refuses to follow, ends it with `streamed: false`, said in
 * `hold`; anything else it fails with, it dies of.
 */
const attemptOf = (e: Engine, taskId: string, history: { after?: string } | undefined, hold: Hold): Stream.Stream<Moment> => {
  const unstreamed = Stream.sync(() => {
    hold.unstreamed = true;
    return UNSTREAMED;
  });
  const told = (live: Stream.Stream<Moment>) =>
    history === undefined
      ? live
      : live.pipe(
          Stream.mapAccumEffect(
            (): Set<string> | undefined => undefined,
            (seen, m): Effect.Effect<readonly [Set<string>, Moment[]]> => {
              if (seen) return Effect.succeed([seen, m.kind === 'events' ? unseen(m, seen) : [m]] as const);
              return asked('transcript', e.transcript(taskId, history.after)).pipe(
                Effect.map(
                  (h) => [new Set(h.events.map((ev) => ev.id)), h.events.length ? [m, { kind: 'events' as const, ...h }] : [m]] as const,
                ),
              );
            },
          ),
        );
  return Stream.unwrap(
    asked('follow', e.follow(taskId).pipe(Effect.catchTag('FollowRefused', () => Effect.succeed(null)))).pipe(
      Effect.map((live) =>
        live === null
          ? unstreamed
          : live === undefined
            ? Stream.empty
            : told(live.pipe(Stream.catchTag('RunnerError', (err) => (err.refused ? unstreamed : Stream.die(err))))),
      ),
    ),
  );
};

/**
 * Whether the harness of `taskId` streams, as the runtime's `follow` answers before it follows anything: `streamed`, or no, said in `hold`
 * too, for a harness without it. Follows nothing: the task's last attempt may have ended, or there may be none yet.
 */
const streamedOf = (e: Engine, taskId: string, hold: Hold): Stream.Stream<Moment> =>
  Stream.fromEffect(
    asked(
      'follow',
      e.follow(taskId).pipe(
        Effect.as(STREAMED),
        Effect.catchTag('FollowRefused', () =>
          Effect.sync(() => {
            hold.unstreamed = true;
            return UNSTREAMED;
          }),
        ),
      ),
    ),
  );

/** The whole events of `m` not in `seen`, as one moment, none when all were: each then counted seen. */
const unseen = (m: Extract<Moment, { kind: 'events' }>, seen: Set<string>): Moment[] => {
  const fresh = m.events.filter((ev) => !seen.has(ev.id));
  for (const ev of fresh) seen.add(ev.id);
  return fresh.length ? [{ ...m, events: fresh }] : [];
};

/**
 * `then` from the cursor after the feed's next line naming the step `step` of the run `runId`, read from `cursor` on: the step's next
 * word, which the tick writes once it has judged what the step does next. Every other line, of another run or step or a daemon's, is
 * passed.
 */
const wokenBy = (runId: string, step: string, cursor: number, then: (cursor: number) => Stream.Stream<Moment, Refusal>) =>
  followFeed(cursor).pipe(
    Stream.filter((f) => f.kind === 'line' && isRunLine(f.line) && f.line.run === runId && f.line.step === step),
    Stream.take(1),
    Stream.flatMap((f) => then(f.kind === 'line' ? f.cursor : cursor)),
  );

/** `moved` to the task `taskId`. */
const movedTo = (taskId: string): Moment => ({ kind: 'moved', taskId });

/** What a following of the step `step` of the run `runId` reads with and holds: the engine, the transcript's `after`, its `Hold`. */
type Onward = { e: Engine; runId: string; step: string; after?: string; hold: Hold };

/**
 * The following from `at`, the step read again, or as `read` found it: the attempt it goes to followed — said `moved` unless it is the
 * first — then a wait for the step's next line of the feed from `cursor`, and the step read again; a wait first where `nextOf` says so;
 * `settled` and the end once the step has finished. Nothing after a refusal to stream (`Hold`).
 */
const onward = (o: Onward, at: FollowedAttempt | undefined, cursor: number, read?: StepNow): Stream.Stream<Moment, Refusal> =>
  Stream.unwrap(
    Effect.gen(function* () {
      const next = nextOf(at, read ?? (yield* stepNowOf(o.e, o.runId, o.step)));
      if (next === 'finished') return Stream.make(FINISHED);
      if (next === 'wait') return wokenBy(o.runId, o.step, cursor, (c) => onward(o, at, c));
      const { taskId } = next.follow;
      const first = at === undefined;
      const history = first ? (o.after === undefined ? undefined : { after: o.after }) : {};
      const then = Stream.suspend(() =>
        o.hold.unstreamed ? Stream.empty : wokenBy(o.runId, o.step, cursor, (c) => onward(o, next.follow, c)),
      );
      return Stream.concat(first ? Stream.empty : Stream.make(movedTo(taskId)), attemptOf(o.e, taskId, history, o.hold)).pipe(
        Stream.concat(then),
      );
    }),
  );

/**
 * The step `step` of the run `runId` followed live, from `after` (a cursor a read of its transcript gave) when one is given, else from now:
 * what was written before is the transcript's to read.
 *
 * Its first moment says whether the step's harness streams (`streamed`); one that does not ends it there. Then each moment of the attempt
 * the step's record names, as the runtime hands it, while it is live; an attempt that has ended — the step held on a person — is passed
 * as followed. When that attempt's stream ends, it waits for the feed's next line of the step, reads the record again (`nextOf`), and goes
 * on: to a later attempt of the same task — a person's answer, the next turn — or to the task of a try, said `moved` and followed by that
 * attempt's history from its start; or it ends with `settled`, the step's task settled with none after it. A feed line written while an
 * attempt is followed is read once it ends, from the cursor taken before it began.
 *
 * Refused (`Missing`) for a run the store has not and a step with no task filed; fails with the feed's refusal of its cursor; dies of what
 * the engine fails with but a refusal to stream.
 */
export const followStep = (runId: string, step: string, after?: string): Stream.Stream<Moment, Refusal, EngineService> =>
  Stream.unwrap(
    Effect.gen(function* () {
      const e = yield* EngineService;
      const cursor = (yield* (yield* FeedDoor).lines.end())?.cursor ?? 0;
      const now = yield* stepNowOf(e, runId, step);
      const o: Onward = { e, runId, step, hold: { unstreamed: false }, ...(after === undefined ? {} : { after }) };
      const { taskId } = now;
      const seen = taskId !== null && now.attempt > 0 && !now.live ? { taskId, attempt: now.attempt } : undefined;
      const opened = taskId !== null && nextOf(seen, now) === 'wait' ? streamedOf(e, taskId, o.hold) : Stream.empty;
      return Stream.concat(
        opened,
        Stream.suspend(() => (o.hold.unstreamed ? Stream.empty : onward(o, seen, cursor, now))),
      ).pipe(
        Stream.mapAccum(
          () => true,
          (first, m): readonly [boolean, Moment[]] => [false, first && m.kind !== 'streamed' ? [STREAMED, m] : [m]],
        ),
      );
    }),
  );

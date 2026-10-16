/**
 * The daemon's loop, one for its two kinds: the api's process, which serves the board as it ticks, and `nemia up`, which only ticks. `up`
 * takes the store's lease in its scope and lets it go as the scope closes; `holdUrl` writes into the lease where the api serves; and
 * `runMain` runs either as the process's command, a signal letting go of the lease before the process exits.
 */
import { Cause, Deferred, Effect, Exit, Fiber, type Metric, type Scope } from 'effect';
import type { PlaceService } from '../place/place.store.ts';
import { over, quotaHarnesses, type Engine, type HarnessQuota } from '../runtime-client.ts';
import { HOME } from '../record/record.store.ts';
import { queueLine } from '../inbox/index.ts';
import { scheduleLine } from '../schedule/schedule.ts';
import { addPass, summaryDue, summaryLine, type Interval, type Reading } from '../meter/index.ts';
import { PASS_SERIES } from '../meter/meter.verb.ts';
import { seriesBorn } from '../telemetry/telemetry.store.ts';
import { heldLines, pausedWords, RESUMED } from '../pause/pause.ts';
import { refusalLines, tickRun, type Pass } from '../tick/tick.verb.ts';
import { beat, heldUrl, passed, releaseStore, stillHeld, takeStore, type TakenStore } from './daemon.store.ts';
import { takenFromLine, type HolderKind } from './daemon.ts';
import { deliver } from '../subscription/deliver.verb.ts';
import { DAEMON_STARTED, startedLine } from '../feed/index.ts';
import { emitDaemonStarted, FEED_FOLLOW_BEATS, FEED_FOLLOW_LINES, FEED_FOLLOW_READS } from '../feed/feed.verb.ts';
import { keep } from '../nemia/keep.verb.ts';
import { reconcile } from '../applied/applied.verb.ts';
import { free } from '../prune/free.verb.ts';
import { disk } from '../disk/disk.verb.ts';
import type { DiskReading } from '../disk/disk.ts';
import { leaseRelease } from '../release/release.ts';
import { runningRelease } from '../release/version.verb.ts';

/**
 * What `up` runs with: its interval, `every` ms; the repository a queued card that names none starts on, and the folder the lease names
 * (`repo`); the kind of daemon it is (`holder`); the calling process's own series a collector reads by their increase, born at zero
 * with the daemon's (`series`, `DAEMON_SERIES`); and what to do once the lease is taken and before the first pass, in the lease's scope
 * (`onTaken` — where the api serves, and `nemia up` says what it holds).
 */
export type UpOptions = {
  every: number;
  repo: string;
  holder: HolderKind;
  series?: ReadonlyArray<Metric.Metric<never, unknown>>;
  onTaken?: (taken: TakenStore) => Effect.Effect<void, unknown, Scope.Scope>;
};

/**
 * The daemon's own series a collector reads by their increase, born at zero once it holds the store (`seriesBorn`): the pass's
 * (`PASS_SERIES`) and the feed's live readers' beats, reads and lines.
 */
export const DAEMON_SERIES = [...PASS_SERIES, FEED_FOLLOW_BEATS, FEED_FOLLOW_READS, FEED_FOLLOW_LINES] as const;

/** How often the daemon asks each harness for its quota: the series keep it over time. */
export const QUOTA_EVERY_MS = 600_000;

/** The percent of each window `q` reports used, or none when it reports no windows. */
const usedOf = (q: HarnessQuota): Reading[string] | undefined =>
  q.kind === 'windows' ? Object.fromEntries(q.limits.map((l) => [l.key, l.usedPercentage])) : undefined;

/**
 * Each harness's quota (`quotaHarnesses`) asked of `e`, over `last`: one that answers its windows replaces its own reading, the percent of
 * each window used; one that refuses, fails, dies or answers no windows leaves its last.
 */
export const askedQuota = Effect.fn('askedQuota')(function* (e: Engine, last: Reading, names: readonly string[] = quotaHarnesses()) {
  const next = { ...last };
  for (const name of names) {
    const used = yield* e.quota(name).pipe(
      Effect.map(usedOf),
      Effect.catch(() => Effect.succeed(undefined)),
      Effect.catchDefect(() => Effect.succeed(undefined)),
    );
    if (used) next[name] = used;
  }
  return next;
});

/** A line the daemon says of a pass: its words, a warning when `warn`, and the run and the steps it is about, where it is about one. */
export type PassLine = { text: string; warn?: true; run?: string; step?: string };

/**
 * What the daemon has said while it lasts, so it says each failure once: a queued card's start (`said`), the feed's (`feedSaid`), a move
 * the lifecycle refused (`refusedSaid`), a journal left out (`unreadableSaid`), a harness the pass could not read (`unobservedSaid`),
 * what a pass forgot of removed runs or what refused it (`forgettingSaid`); the store's pause (`pauseSaid`), said once put, on each
 * change of its words and once resumed; and the passes its next summary counts (`interval`).
 */
export type UpSaid = {
  said: string | undefined;
  pauseSaid: string | undefined;
  feedSaid: string | undefined;
  refusedSaid: ReadonlySet<string>;
  unreadableSaid: ReadonlySet<string>;
  unobservedSaid: ReadonlySet<string>;
  forgettingSaid: ReadonlySet<string>;
  interval: Interval | undefined;
};

/** What a daemon has said when it starts: nothing. */
export const NOTHING_SAID: UpSaid = {
  said: undefined,
  pauseSaid: undefined,
  feedSaid: undefined,
  refusedSaid: new Set(),
  unreadableSaid: new Set(),
  unobservedSaid: new Set(),
  forgettingSaid: new Set(),
  interval: undefined,
};

/** The queued card's line, unless it is the failure said last; answers with the failure it says now, if any. */
function queueSaid(queue: NonNullable<Pass['queue']>, said: string | undefined): { lines: PassLine[]; said: string | undefined } {
  const failure = 'failed' in queue ? `${queue.card}  ${queue.on ?? ''}  ${queue.failed}` : undefined;
  const named = 'run' in queue ? { run: queue.run } : {};
  const lines = failure === undefined || failure !== said ? [{ text: queueLine(queue), ...named }] : [];
  return { lines, said: failure };
}

/**
 * The scheduled start's line, about its run when it started one; none for a failure the schedule's try already held (`again`), which
 * was said when it was first kept.
 */
const scheduleSaid = (scheduled: Pass['scheduled']): PassLine[] =>
  !scheduled || ('failed' in scheduled && scheduled.again)
    ? []
    : [{ text: scheduleLine(scheduled), ...('run' in scheduled ? { run: scheduled.run } : { warn: true as const }) }];

/**
 * What a pass did to each run, about that run: its notes, then the steps it filed, tried again, rounded again and is checking, a line for
 * each step, annotated with it.
 */
function advancedLines(advanced: Pass['runs']): PassLine[] {
  return advanced.flatMap((r) => {
    const run = r.run.id;
    const steps = (verb: string, names: readonly string[]): PassLine[] =>
      names.map((name) => ({ text: `${run}  ${verb} ${name}`, run, step: name }));
    return [
      ...r.notes.map((note) => ({ text: `${run}  ${note}`, run })),
      ...steps('filed', r.filed),
      ...steps('tried again', r.tried),
      ...steps('round again', r.looped),
      ...steps('checking', r.checked),
    ];
  });
}

/**
 * The store's pause (`pausedWords`) and each check it holds back (`heldLines`), a landing with its merge staged among them, once when it
 * is put, again each time their words change — Pausing with fewer finishing, then Paused, a check held — and once when it is resumed:
 * the lines said now, and the words to compare the next pass's with.
 */
export function pauseSaid(pause: Pass['pause'], said: string | undefined): { lines: string[]; said: string | undefined } {
  const lines = pause ? [pausedWords(pause) ?? '', ...heldLines(pause)] : [RESUMED];
  const now = pause ? lines.join('\n') : undefined;
  return { lines: now !== said ? lines : [], said: now };
}

/** A warning for each of `whys` not in `said`, in `words`: what a pass says once while it lasts. */
const warnedOnce = (whys: readonly string[] | undefined, said: ReadonlySet<string>, words: (why: string) => string): PassLine[] =>
  (whys ?? []).filter((why) => !said.has(why)).map((why) => ({ text: words(why), warn: true }));

/**
 * One pass's lines, going by what the daemon has said (`was`), not by the store, at `now`: the pause, the summary when one is due, the
 * feed's failure, the moves refused, the journals left out and the harnesses not read each once, the queued card, the scheduled start,
 * and what it did to each run. Answers with them and what has been said once they are.
 */
export function passSaid(pass: Pass, was: UpSaid, now: number): { lines: PassLine[]; said: UpSaid } {
  const { runs: advanced, queue, feedError, cost, refused, unreadable, unobserved, forgetting } = pass;
  const paused = pauseSaid(pass.pause, was.pauseSaid);
  const lines: PassLine[] = paused.lines.map((text) => ({ text }));
  let interval = was.interval;
  if (cost) interval = addPass(interval, cost, now);
  if (summaryDue(interval, now)) {
    lines.push({ text: summaryLine(interval!, now) });
    interval = undefined;
  }
  if (feedError && feedError !== was.feedSaid) lines.push({ text: feedError, warn: true });
  const stalled = refusalLines(refused ?? [], was.refusedSaid);
  lines.push(...stalled.lines.map((text) => ({ text })));
  lines.push(...warnedOnce(unreadable, was.unreadableSaid, (why) => `left out: ${why}`));
  lines.push(...warnedOnce(unobserved, was.unobservedSaid, (why) => `a harness could not be read: ${why}`));
  for (const line of forgetting ?? []) if (!was.forgettingSaid.has(line.text)) lines.push(line);
  const queued = queue ? queueSaid(queue, was.said) : { lines: [], said: was.said };
  lines.push(...queued.lines, ...scheduleSaid(pass.scheduled), ...advancedLines(advanced));
  const said = { said: queued.said, pauseSaid: paused.said, feedSaid: feedError, refusedSaid: stalled.said, interval };
  const failures = { unreadableSaid: new Set(unreadable), unobservedSaid: new Set(unobserved) };
  return { lines, said: { ...said, ...failures, forgettingSaid: new Set(forgetting?.map((l) => l.text)) } };
}

/** Logs `line`, Info or Warn, annotated with the run and the steps it is about. */
const sayLine = (line: PassLine): Effect.Effect<void> =>
  (line.warn ? Effect.logWarning(line.text) : Effect.logInfo(line.text)).pipe(
    Effect.annotateLogs({ ...(line.run ? { run: line.run } : {}), ...(line.step ? { step: line.step } : {}) }),
  );

/** Logs what a pass has to say (`passSaid`) after what was said before it, `was`; answers with what has been said once it has. */
export const logPass = Effect.fn('logPass')(function* (pass: Pass, was: UpSaid) {
  const { lines, said } = passSaid(pass, was, Date.now());
  yield* Effect.forEach(lines, sayLine, { discard: true });
  return said;
});

/**
 * The feed's line that this daemon has taken the store, saying how the one before it ended (`startedLine`); a line it could not write is
 * a warning, never a failed start.
 */
const saidStarted = ({ held, replaced }: TakenStore): Effect.Effect<void> =>
  emitDaemonStarted(startedLine(held.pid, replaced, new Date().toISOString(), Date.now())).pipe(
    Effect.catchCause((cause) => Effect.logWarning(`the feed's ${DAEMON_STARTED} line was not written: ${Cause.pretty(cause)}`)),
  );

/**
 * The daemon: the store's lease taken as `holder` (`takeStore`, refused by name while another daemon of either kind ticks it) and let go
 * as its scope closes, however it ends, so a signal that stops it leaves the store free at once; the engine's attached sessions held
 * (`hold`) inside it, so as the scope closes each is let go between two tool calls, before the lease; its series and the caller's
 * (`series`) born at zero and exported so (`DAEMON_SERIES`, `seriesBorn`) before anything counts into them; its line in the feed
 * (`saidStarted`); `onTaken`; then a pass on `e` every
 * interval, each written down (`passed`) and logged (`logPass`), through whatever logger the process provides. It beats on a fiber forked
 * in the scope, so a long pass is not taken for stalled and taken over mid-pass, and it fails at the first pass that finds the store taken
 * over (`stillHeld`, `takenFromLine`). On another fiber in the scope it asks each harness for its quota, at once and every
 * `QUOTA_EVERY_MS` (`askedQuota`), and hands each pass the latest reading, which the pass keeps among the recent and so in the series. On
 * a third it delivers the store's subscriptions to the feed (`deliver`), on a fourth it keeps Nemia at the person's level (`keep`), on
 * a fifth it brings each factory made from a template to it (`reconcile`), and on a sixth it frees the worktrees of the runs the latest
 * pass answered finished (`free`), which no pass waits on. On a seventh, once the first pass has answered and every `DISK_EVERY` after,
 * it measures what the store takes on the disk (`disk`), asking the engine what it keeps by task, and hands each pass the latest
 * reading as it does the quota: no pass walks the store, and a sweep that failed leaves the passes none.
 */
export const up = (
  e: Engine,
  { every, repo, holder, series = [], onTaken }: UpOptions,
): Effect.Effect<never, unknown, Scope.Scope | PlaceService> =>
  Effect.gen(function* () {
    const taken = yield* Effect.acquireRelease(
      Effect.try({ try: () => takeStore({ every, cwd: repo, by: holder, release: leaseRelease(runningRelease()) }), catch: (err) => err }),
      ({ held }) => Effect.sync(() => releaseStore(held)),
    );
    yield* e.hold();
    yield* seriesBorn([...DAEMON_SERIES, ...series]);
    yield* Effect.forkScoped(Effect.forever(Effect.sleep(every).pipe(Effect.andThen(Effect.sync(() => beat(taken.held))))));
    let reading: Reading = {};
    yield* Effect.forkScoped(
      Effect.forever(
        Effect.suspend(() => askedQuota(e, reading)).pipe(
          Effect.andThen((next) => Effect.sync(() => (reading = next))),
          Effect.andThen(Effect.sleep(QUOTA_EVERY_MS)),
        ),
      ),
    );
    yield* Effect.forkScoped(over(e)(deliver()));
    yield* Effect.forkScoped(over(e)(keep()));
    yield* Effect.forkScoped(reconcile());
    let rested: Pass['runs'] = [];
    yield* Effect.forkScoped(over(e)(free(() => rested)));
    const answered = yield* Deferred.make<void>();
    let measured: DiskReading | undefined;
    yield* Effect.forkScoped(
      Deferred.await(answered).pipe(
        Effect.andThen(
          disk(
            () => rested,
            (read) => void (measured = read),
          ),
        ),
        over(e),
      ),
    );
    yield* saidStarted(taken);
    if (onTaken) yield* onTaken(taken);
    let said = NOTHING_SAID;
    for (;;) {
      const by = stillHeld(taken.held);
      if (by) return yield* Effect.fail(new Error(takenFromLine(by, HOME, holder)));
      const pass = yield* tickRun({ repo, quota: () => reading, disk: () => measured }).pipe(over(e));
      passed(taken.held);
      rested = pass.runs;
      yield* Deferred.succeed(answered, undefined);
      said = yield* logPass(pass, said);
      yield* Effect.sleep(every);
    }
  });

/**
 * The api's word once it listens: `url`, where it serves the board, written into the lease this process holds, so `nemia ls`, `/api/daemon`
 * and a refused daemon name it. Answers whether it was written: not when the lease is another's, or let go.
 */
export const holdUrl = (url: string): boolean => heldUrl(url);

/**
 * The signals that stop a command, each with the code the process exits with once the command has let go of what it held: 128 + its number.
 */
const SIGNALS = [
  ['SIGINT', 130],
  ['SIGTERM', 143],
  ['SIGHUP', 129],
] as const;

/**
 * Runs `program` as the process's command. SIGINT, SIGTERM and SIGHUP interrupt it, and once its finalizers have run the process exits 130,
 * 143 or 129, by the signal that came. Otherwise the promise resolves with its value, or rejects with what it failed or died with, that
 * very value, so a refusal's `exitCode` reaches the caller. The handlers are its own, taken before the program starts, since its fiber
 * runs at once as far as it can without yielding — the store taken, the first pass begun — and taken off as it ends: a second signal
 * while the finalizers run is Node's to handle.
 *
 * Not the `runMain` of `@effect/platform-node`'s NodeRuntime: its teardown exits 130 on any interruption, whatever signal came, it
 * handles no SIGHUP, and it hands no failure back to the caller.
 */
export function runMain<A, E>(program: Effect.Effect<A, E>): Promise<A> {
  return new Promise<A>((resolve, reject) => {
    let stoppedWith: number | undefined;
    const stops = SIGNALS.map(([signal, code]) => {
      const stop = () => {
        stoppedWith = code;
        Effect.runFork(Fiber.interrupt(fiber));
      };
      process.once(signal, stop);
      return [signal, stop] as const;
    });
    const fiber = Effect.runFork(program);
    fiber.addObserver((exit) => {
      for (const [signal, stop] of stops) process.off(signal, stop);
      if (stoppedWith !== undefined) process.exit(stoppedWith);
      if (Exit.isSuccess(exit)) resolve(exit.value);
      else reject(Cause.squash(exit.cause));
    });
  });
}

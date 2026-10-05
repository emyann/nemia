/**
 * The daemon's loop, one for its two kinds: the api's process, which serves the board as it ticks, and `nemia up`, which only ticks. `up`
 * takes the store's lease in its scope and lets it go as the scope closes; `holdUrl` writes into the lease where the api serves; and
 * `runMain` runs either as the process's command, a signal letting go of the lease before the process exits.
 */
import { Cause, Effect, Exit, Fiber, type Scope } from 'effect';
import { over, type Engine } from '../runtime-client.ts';
import { HOME } from '../record/record.store.ts';
import { queueLine } from '../inbox/inbox.ts';
import { addPass, summaryDue, summaryLine, type Interval } from '../meter/meter.ts';
import { pausedWords, RESUMED, stagedWords } from '../pause/pause.ts';
import { refusalLines, tickRun, type Pass } from '../tick/tick.verb.ts';
import { beat, heldUrl, passed, releaseStore, stillHeld, takeStore, type TakenStore } from './daemon.store.ts';
import { takenFromLine, type HolderKind } from './daemon.ts';

/**
 * What `up` runs with: its interval, `every` ms; the repository a queued card that names none starts on, and the folder the lease names
 * (`repo`); the kind of daemon it is (`holder`); and what to do once the lease is taken and before the first pass, in the lease's scope
 * (`onTaken` — where the api serves, and `nemia up` says what it holds).
 */
export type UpOptions = {
  every: number;
  repo: string;
  holder: HolderKind;
  onTaken?: (taken: TakenStore) => Effect.Effect<void, unknown, Scope.Scope>;
};

/** A line the daemon says of a pass: its words, a warning when `warn`, and the run and the steps it is about, where it is about one. */
export type PassLine = { text: string; warn?: true; run?: string; step?: string };

/**
 * What the daemon has said while it lasts, so it says each failure once: a queued card's start (`said`), the feed's (`feedSaid`), a move
 * the lifecycle refused (`refusedSaid`), a journal left out (`unreadableSaid`); the store's pause (`pauseSaid`), said once put, on each
 * change of its words and once resumed; and the passes its next summary counts (`interval`).
 */
export type UpSaid = {
  said: string | undefined;
  pauseSaid: string | undefined;
  feedSaid: string | undefined;
  refusedSaid: ReadonlySet<string>;
  unreadableSaid: ReadonlySet<string>;
  interval: Interval | undefined;
};

/** What a daemon has said when it starts: nothing. */
export const NOTHING_SAID: UpSaid = {
  said: undefined,
  pauseSaid: undefined,
  feedSaid: undefined,
  refusedSaid: new Set(),
  unreadableSaid: new Set(),
  interval: undefined,
};

/** The queued card's line, unless it is the failure said last; answers with the failure it says now, if any. */
function queueSaid(queue: NonNullable<Pass['queue']>, said: string | undefined): { lines: PassLine[]; said: string | undefined } {
  const failure = 'failed' in queue ? `${queue.card}  ${queue.on ?? ''}  ${queue.failed}` : undefined;
  const named = 'run' in queue ? { run: queue.run } : {};
  const lines = failure === undefined || failure !== said ? [{ text: queueLine(queue), ...named }] : [];
  return { lines, said: failure };
}

/** What a pass did to each run, about that run: its notes, then the steps it filed, tried again, rounded again and is checking. */
function advancedLines(advanced: Pass['runs']): PassLine[] {
  return advanced.flatMap((r) => {
    const run = r.run.id;
    const steps = (verb: string, names: readonly string[]): PassLine[] =>
      names.length ? [{ text: `${run}  ${verb} ${names.join(', ')}`, run, step: names.join(', ') }] : [];
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
 * The store's pause (`pausedWords`) and each landing it holds with its merge staged (`stagedWords`), once when it is put, again each time
 * their words change — Pausing with fewer finishing, then Paused, a landing staged — and once when it is resumed: the lines said now, and
 * the words to compare the next pass's with.
 */
export function pauseSaid(pause: Pass['pause'], said: string | undefined): { lines: string[]; said: string | undefined } {
  const lines = pause ? [pausedWords(pause) ?? '', ...pause.staged.map((s) => `   ${stagedWords(s)}`)] : [RESUMED];
  const now = pause ? lines.join('\n') : undefined;
  return { lines: now !== said ? lines : [], said: now };
}

/**
 * One pass's lines, going by what the daemon has said (`was`), not by the store, at `now`: the pause, the summary when one is due, the
 * feed's failure, the moves refused and the journals left out each once, the queued card, and what it did to each run. Answers with them
 * and what has been said once they are.
 */
export function passSaid(pass: Pass, was: UpSaid, now: number): { lines: PassLine[]; said: UpSaid } {
  const { runs: advanced, queue, feedError, cost, refused, unreadable } = pass;
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
  for (const why of unreadable ?? []) if (!was.unreadableSaid.has(why)) lines.push({ text: `left out: ${why}`, warn: true });
  const queued = queue ? queueSaid(queue, was.said) : { lines: [], said: was.said };
  lines.push(...queued.lines, ...advancedLines(advanced));
  const said = { said: queued.said, pauseSaid: paused.said, feedSaid: feedError, refusedSaid: stalled.said, interval };
  return { lines, said: { ...said, unreadableSaid: new Set(unreadable) } };
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
 * The daemon: the store's lease taken as `holder` (`takeStore`, refused by name while another daemon of either kind ticks it) and let go
 * as its scope closes, however it ends, so a signal that stops it leaves the store free at once; `onTaken`; then a pass on `e` every
 * interval, each written down (`passed`) and logged (`logPass`), through whatever logger the process provides. It beats on a fiber forked
 * in the scope, so a long pass is not taken for stalled and taken over mid-pass, and it fails at the first pass that finds the store taken
 * over (`stillHeld`, `takenFromLine`).
 */
export const up = (e: Engine, { every, repo, holder, onTaken }: UpOptions): Effect.Effect<never, unknown, Scope.Scope> =>
  Effect.gen(function* () {
    const taken = yield* Effect.acquireRelease(
      Effect.try({ try: () => takeStore({ every, cwd: repo, by: holder }), catch: (err) => err }),
      ({ held }) => Effect.sync(() => releaseStore(held)),
    );
    yield* Effect.forkScoped(Effect.forever(Effect.sleep(every).pipe(Effect.andThen(Effect.sync(() => beat(taken.held))))));
    if (onTaken) yield* onTaken(taken);
    let said = NOTHING_SAID;
    for (;;) {
      const by = stillHeld(taken.held);
      if (by) return yield* Effect.fail(new Error(takenFromLine(by, HOME, holder)));
      const pass = yield* tickRun({ repo }).pipe(over(e));
      passed(taken.held);
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
 * very value, so a refusal's `exitCode` reaches the caller. The handlers are its own, taken off as it ends: a second signal while the
 * finalizers run is Node's to handle.
 *
 * Not the `runMain` of `@effect/platform-node`'s NodeRuntime: its teardown exits 130 on any interruption, whatever signal came, it
 * handles no SIGHUP, and it hands no failure back to the caller.
 */
export function runMain<A, E>(program: Effect.Effect<A, E>): Promise<A> {
  return new Promise<A>((resolve, reject) => {
    const fiber = Effect.runFork(program);
    let stoppedWith: number | undefined;
    const stops = SIGNALS.map(([signal, code]) => {
      const stop = () => {
        stoppedWith = code;
        Effect.runFork(Fiber.interrupt(fiber));
      };
      process.once(signal, stop);
      return [signal, stop] as const;
    });
    fiber.addObserver((exit) => {
      for (const [signal, stop] of stops) process.off(signal, stop);
      if (stoppedWith !== undefined) process.exit(stoppedWith);
      if (Exit.isSuccess(exit)) resolve(exit.value);
      else reject(Cause.squash(exit.cause));
    });
  });
}

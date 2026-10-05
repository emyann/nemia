/**
 * The daemon's loop, one for its two kinds: the api's process, which serves the board as it ticks, and `nemia up`, which only ticks. `up`
 * takes the store's lease in its scope and lets it go as the scope closes; `holdUrl` writes into the lease where the api serves; and
 * `runMain` runs either as the process's command, a signal letting go of the lease before the process exits.
 */
import { Cause, Effect, Exit, Fiber, type Scope } from 'effect';
import { quotaHarnesses, type Engine } from '../runtime-client.ts';
import type { Reading } from '../meter/meter.ts';
import { HOME } from '../record/record.store.ts';
import { tick, type Pass } from '../tick/tick.verb.ts';
import { beat, heldUrl, passed, releaseStore, stillHeld, takeStore, type TakenStore } from './daemon.store.ts';
import { takenFromLine, type HolderKind } from './daemon.ts';

/**
 * What `up` runs with: its interval, `every` ms; the repository a queued card that names none starts on, and the folder the lease names
 * (`repo`); the kind of daemon it is (`holder`); what to do once the lease is taken and before the first pass, in the lease's scope
 * (`onTaken` — where the api serves, and `nemia up` says what it holds); and what to say of each pass (`onPass`).
 */
export type UpOptions = {
  every: number;
  repo: string;
  holder: HolderKind;
  onTaken?: (taken: TakenStore) => Effect.Effect<void, unknown, Scope.Scope>;
  onPass?: (pass: Pass) => void;
};

/** How often the daemon asks each harness for its quota: the series keep it over time. */
export const QUOTA_EVERY_MS = 600_000;

/**
 * Each harness's quota (`quotaHarnesses`) asked of `e`, over `last`: one that answers its windows replaces its own reading, the percent of
 * each window used; one that refuses, fails or answers no windows leaves its last.
 */
export const askedQuota = async (e: Engine, last: Reading, names: readonly string[] = quotaHarnesses()): Promise<Reading> => {
  const next = { ...last };
  for (const name of names) {
    try {
      const q = await e.quota(name);
      if (q.kind === 'windows') next[name] = Object.fromEntries(q.limits.map((l) => [l.key, l.usedPercentage]));
    } catch {}
  }
  return next;
};

/**
 * The daemon: the store's lease taken as `holder` (`takeStore`, refused by name while another daemon of either kind ticks it) and let go
 * as its scope closes, however it ends, so a signal that stops it leaves the store free at once; `onTaken`; then a pass on `e` every
 * interval, each written down (`passed`) and handed to `onPass`. It beats on a fiber forked in the scope, so a long pass is not taken for
 * stalled and taken over mid-pass, and it fails at the first pass that finds the store taken over (`stillHeld`, `takenFromLine`). On
 * another fiber in the scope it asks each harness for its quota, at once and every `QUOTA_EVERY_MS` (`askedQuota`), and hands each pass
 * the latest reading, which the pass keeps among the recent and so in the series.
 */
export const up = (e: Engine, { every, repo, holder, onTaken, onPass }: UpOptions): Effect.Effect<never, unknown, Scope.Scope> =>
  Effect.gen(function* () {
    const taken = yield* Effect.acquireRelease(
      Effect.try({ try: () => takeStore({ every, cwd: repo, by: holder }), catch: (err) => err }),
      ({ held }) => Effect.sync(() => releaseStore(held)),
    );
    yield* Effect.forkScoped(Effect.forever(Effect.sleep(every).pipe(Effect.andThen(Effect.sync(() => beat(taken.held))))));
    let reading: Reading = {};
    yield* Effect.forkScoped(
      Effect.forever(
        Effect.promise(() => askedQuota(e, reading)).pipe(
          Effect.andThen((next) => Effect.sync(() => (reading = next))),
          Effect.andThen(Effect.sleep(QUOTA_EVERY_MS)),
        ),
      ),
    );
    if (onTaken) yield* onTaken(taken);
    for (;;) {
      const by = stillHeld(taken.held);
      if (by) return yield* Effect.fail(new Error(takenFromLine(by, HOME, holder)));
      const pass = yield* Effect.tryPromise({ try: () => tick(e, { repo, quota: () => reading }), catch: (err) => err });
      passed(taken.held);
      onPass?.(pass);
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

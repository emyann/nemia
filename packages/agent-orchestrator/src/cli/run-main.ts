/**
 * A command that lives as long as its process, `wf up` and `wf watch`, run as an Effect: what it holds is released in its scope, on the one
 * path out, whether it ends, fails or is stopped by a signal.
 */
import { Cause, Effect, Exit, Fiber } from 'effect';

/** The signals that stop a command, each with the code the process exits with once the command has let go of what it held: 128 + its number. */
const SIGNALS = [
  ['SIGINT', 130],
  ['SIGTERM', 143],
  ['SIGHUP', 129],
] as const;

/**
 * Runs `program` as the process's command. SIGINT, SIGTERM and SIGHUP interrupt it, and once its finalizers have run the process exits 130,
 * 143 or 129, by the signal that came. Otherwise the promise resolves with its value, or rejects with what it failed or died with, that very
 * value, so a refusal's `exitCode` reaches `bin/wf.ts`. The handlers are its own, taken off as it ends: a second signal while the finalizers
 * run is Node's to handle.
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

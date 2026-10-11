/**
 * The stop of a child process off the event loop, with what it started (`stopChild`): what a place that runs processes does to one still
 * running at its deadline, or when the ask is interrupted, with the same signals and grace as the stop that holds the process
 * (`stopGroup`, `STOP_GRACE_MS`).
 */
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { Effect, Schedule } from 'effect';
import { STOP_GRACE_MS, STOP_POLL_MS, signalGroup } from './place.store.ts';

/** Whether the group `pgid` leads has no process left within `STOP_GRACE_MS`, asked every `STOP_POLL_MS`. */
const emptied = (pgid: number): Effect.Effect<boolean> =>
  Effect.sync(() => !signalGroup(pgid, 0)).pipe(
    Effect.repeat({ until: (gone) => gone, schedule: Schedule.spaced(STOP_POLL_MS) }),
    Effect.timeoutOrElse({ duration: STOP_GRACE_MS, orElse: () => Effect.sync(() => !signalGroup(pgid, 0)) }),
  );

/**
 * A child that has not ended stopped, with what it started: the group it leads sent SIGTERM, then SIGKILL when a process of it outlives
 * `STOP_GRACE_MS`, and its pipes closed. Answers whether it had to kill.
 */
export const stopChild = (child: ChildProcessWithoutNullStreams): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const pgid = child.pid;
    if (pgid === undefined) return false;
    let killed = false;
    if (signalGroup(pgid, 'SIGTERM') && !(yield* emptied(pgid))) {
      signalGroup(pgid, 'SIGKILL');
      yield* emptied(pgid);
      killed = true;
    }
    child.stdout.destroy();
    child.stderr.destroy();
    return killed;
  });

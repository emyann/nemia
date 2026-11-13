/**
 * The free sweep's backstop behind the runtime, its effectful half (`endLeftBehind`): this user's processes read, each a finished run's
 * session left running ended, a line of each run whose processes it ended written on the feed, and the processes that hold a finished
 * run's worktree answered for the sweep to leave it. `prune.ts` decides (`leftBehindOf`); this reads `/proc` and signals, through
 * the runtime's client.
 */
import path from 'node:path';
import fs from 'node:fs';
import { Cause, Effect, Schedule, type Duration } from 'effect';
import { endProcesses, processesNow, type ProcessNow } from '../../runtime-client.ts';
import { procStartOf } from '../../daemon/daemon.store.ts';
import { emitLeftEnded } from '../../feed/feed.verb.ts';
import { leftEndedLine } from '../../feed/index.ts';
import { StoreRoot } from '../../config/root.store.ts';
import { finishedAtRest, LEFT_MARKS, leftBehindOf, leftLineNote, runOfEnvironment, type Answered, type SweptRun } from './prune.ts';

/** How long a process the sweep sent SIGTERM is given to end before it is sent SIGKILL. */
export const LEFT_GRACE: Duration.Input = '2 seconds';

/** How often the sweep looks whether the processes it sent SIGTERM have ended, within the grace. */
const LEFT_LOOK: Duration.Input = '25 millis';

/** What one sweep's ending did: the processes it ended, by run, and those that hold each finished run's worktree, by run. */
export type LeftEnded = {
  readonly ended: ReadonlyMap<string, readonly ProcessNow[]>;
  readonly holds: ReadonlyMap<string, readonly ProcessNow[]>;
};

/** Whether `p` still runs: its pid names the process that was read, by its start. */
const stillRuns = (p: ProcessNow): boolean => String(procStartOf(p.pid)) === p.start;

/** `folder` as the kernel names a working folder: its real path where it is there, else as it was given. */
const real = (folder: string): string => {
  try {
    return fs.realpathSync(folder);
  } catch {
    return path.resolve(folder);
  }
};

/**
 * Ends what the finished runs among `answers` (`finishedAtRest`) left running, and answers what holds the worktrees of `candidates`.
 * This user's processes are read once (`processesNow`), each told apart by its environment (`runOfEnvironment`), the daemon's own
 * process being none of it; each one `leftBehindOf` says to end is sent SIGTERM, given up to the grace (`LEFT_GRACE`, unless another
 * is given) to end, and sent SIGKILL if it has not; and the feed is told one line a run whose processes were ended (`leftEndedLine`),
 * its note naming the run and each process.
 * A process sent a signal is named by its pid and its start, so a pid taken since is never signalled. Of each candidate, the processes
 * `leftBehindOf` says hold its worktree, those ended left out. A line the feed would not take is a warning: the ending stands.
 */
export const endLeftBehind = Effect.fn('endLeftBehind')(function* (
  answers: readonly Answered[],
  candidates: readonly string[],
  grace: Duration.Input = LEFT_GRACE,
) {
  const home = yield* StoreRoot;
  const finished = new Set(finishedAtRest(answers));
  if (finished.size === 0) return { ended: new Map(), holds: new Map() } satisfies LeftEnded;
  const worktrees = real(path.join(home, 'worktrees'));
  const read = processesNow(LEFT_MARKS);
  const seen = read.map((p) => ({
    p,
    as: { own: p.pid === process.pid, runOf: runOfEnvironment(p.env, home), cwd: p.cwdDeleted ? undefined : p.cwd },
  }));
  const swept = (id: string): SweptRun => ({ id, finished: finished.has(id), worktree: path.join(worktrees, id) });

  const toEnd = new Map<string, ProcessNow[]>();
  for (const { p, as } of seen) {
    if (as.runOf === undefined || leftBehindOf(as, swept(as.runOf)) !== 'end') continue;
    toEnd.set(as.runOf, [...(toEnd.get(as.runOf) ?? []), p]);
  }
  const ending = [...toEnd.values()].flat();
  const termed = new Set(endProcesses(ending, 'SIGTERM'));
  const sent = ending.filter((p) => termed.has(p.pid));
  if (sent.length > 0) {
    yield* Effect.sync(() => sent.filter(stillRuns)).pipe(
      Effect.repeat({ schedule: Schedule.spaced(LEFT_LOOK), until: (left) => left.length === 0 }),
      Effect.timeoutOption(grace),
    );
    endProcesses(sent.filter(stillRuns), 'SIGKILL');
  }
  const ended = new Map<string, ProcessNow[]>();
  for (const [id, ps] of toEnd) {
    const theirs = ps.filter((p) => termed.has(p.pid));
    if (theirs.length > 0) ended.set(id, theirs);
  }
  const at = new Date().toISOString();
  yield* emitLeftEnded([...ended].map(([id, ps]) => leftEndedLine(id, leftLineNote(id, ps), at))).pipe(
    Effect.catchCause((cause) => Effect.logWarning(`the feed's lines of the processes ended were not written: ${Cause.pretty(cause)}`)),
  );

  const holds = new Map<string, ProcessNow[]>();
  for (const id of candidates) {
    const run = swept(id);
    const theirs = seen.filter((s) => !termed.has(s.p.pid) && leftBehindOf(s.as, run) === 'holds').map((s) => s.p);
    if (theirs.length > 0) holds.set(id, theirs);
  }
  yield* Effect.annotateCurrentSpan({ processes: read.length, ended: sent.length, held: holds.size });
  return { ended, holds } satisfies LeftEnded;
});

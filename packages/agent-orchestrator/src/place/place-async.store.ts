/**
 * A place verb run off the event loop: `runPlaceVerbAsync`, for a verb that may take minutes, as `make`'s fan-in merge may, while the api
 * the tick runs in goes on answering. It asks as `runPlaceVerb` asks (`placeAsk`), reads the outcome as it reads it (`outcomeOf`), and
 * stops a script's group with the same signals and grace (`signalGroup`, `STOP_GRACE_MS`), at its deadline or when the pass is interrupted.
 */
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { Effect, Exit, Schedule } from 'effect';
import { STOP_GRACE_MS, STOP_POLL_MS, outcomeOf, placeAsk, signalGroup, type PlaceAsk, type PlaceRan } from './place.store.ts';
import type { PlaceOutcome, PlaceRequests, PlaceVerb } from './place.ts';
import { countSpawn, withinEffect } from '../meter/tally.store.ts';

/** Whether the group `pgid` leads has no process left within `STOP_GRACE_MS`, asked every `STOP_POLL_MS`. */
const emptied = (pgid: number): Effect.Effect<boolean> =>
  Effect.sync(() => !signalGroup(pgid, 0)).pipe(
    Effect.repeat({ until: (gone) => gone, schedule: Schedule.spaced(STOP_POLL_MS) }),
    Effect.timeoutOrElse({ duration: STOP_GRACE_MS, orElse: () => Effect.sync(() => !signalGroup(pgid, 0)) }),
  );

/**
 * A script that has not ended stopped, with what it started: its leader killed, its group sent SIGTERM, then SIGKILL when a process of it
 * outlives `STOP_GRACE_MS`, and its pipes closed. Answers whether it had to kill.
 */
const stopScript = (child: ChildProcessWithoutNullStreams): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const pgid = child.pid;
    if (pgid === undefined) return false;
    child.kill('SIGKILL');
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

/** What a script printed, kept as it comes, and whether stopping it had to kill. */
type Printed = { readonly stdout: Buffer[]; readonly stderr: Buffer[]; killed: boolean };

/** The script of `asked` started in `skillDir`, in a group of its own, handed its request, what it prints kept in `printed`. */
function started(skillDir: string, asked: PlaceAsk, printed: Printed): ChildProcessWithoutNullStreams {
  const child = spawn(process.execPath, [asked.script], { cwd: skillDir, env: asked.env, detached: true, stdio: 'pipe' });
  child.stdout.on('data', (chunk: Buffer) => printed.stdout.push(chunk));
  child.stderr.on('data', (chunk: Buffer) => printed.stderr.push(chunk));
  child.stdin.on('error', () => undefined);
  child.stdin.end(asked.input);
  return child;
}

/** How a script ended: its status or signal once its pipes closed, or the error that kept it from running. */
type Ended = Pick<PlaceRan, 'status' | 'signal' | 'error' | 'timedOut'>;

/** Waits for `child` to end, on its `close` or its `error`. */
const ended = (child: ChildProcessWithoutNullStreams): Effect.Effect<Ended> =>
  Effect.callback<Ended>((resume) => {
    const closed = (status: number | null, signal: NodeJS.Signals | null) => resume(Effect.succeed({ status, signal, timedOut: false }));
    const failed = (error: Error) => resume(Effect.succeed({ status: null, signal: null, error, timedOut: false }));
    child.once('close', closed);
    child.once('error', failed);
    return Effect.sync(() => {
      child.off('close', closed);
      child.off('error', failed);
    });
  });

/**
 * Run `verb` of the place skill in `skillDir` as `runPlaceVerb` runs it — its script, request, deadline, environment and outcome — with
 * the event loop free while it runs. The script is taken in the ask's scope and let go as it closes: one that came to its end is left as
 * it is, and one that did not — past its deadline, or the ask interrupted — is stopped with what it started (`stopScript`) before the ask
 * ends. A script started is counted in the pass's `place` phase, its process and its time; a verb with no script starts nothing. Never
 * fails.
 */
export const runPlaceVerbAsync = <V extends PlaceVerb>(
  skillDir: string,
  verb: V,
  request: PlaceRequests[V],
  options: { readonly deadlineMs?: number; readonly env?: NodeJS.ProcessEnv } = {},
): Effect.Effect<PlaceOutcome<V>> =>
  Effect.suspend(() => {
    const asked = placeAsk(skillDir, verb, request, options);
    if ('unread' in asked) return Effect.succeed(asked);
    const printed: Printed = { stdout: [], stderr: [], killed: false };
    const run = Effect.acquireRelease(
      Effect.sync(() => {
        countSpawn();
        return started(skillDir, asked, printed);
      }),
      (child, exit) => (Exit.isSuccess(exit) ? Effect.void : Effect.map(stopScript(child), (killed) => void (printed.killed = killed))),
    ).pipe(
      Effect.flatMap(ended),
      Effect.scoped,
      Effect.timeoutOrElse({
        duration: asked.deadlineMs,
        orElse: () => Effect.succeed<Ended>({ status: null, signal: 'SIGKILL', timedOut: true }),
      }),
      Effect.map((end) =>
        outcomeOf(
          verb,
          {
            ...end,
            stdout: Buffer.concat(printed.stdout).toString('utf8'),
            stderr: Buffer.concat(printed.stderr).toString('utf8'),
            killed: printed.killed,
          },
          asked.deadlineMs,
        ),
      ),
    );
    return withinEffect('place', run);
  });

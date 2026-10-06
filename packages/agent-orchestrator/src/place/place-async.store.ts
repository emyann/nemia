/**
 * A place verb run off the event loop: `runPlaceVerbAsync`, for a verb that may take minutes, as `make`'s fan-in merge may, while the api
 * the tick runs in goes on answering. It asks as `runPlaceVerb` asks (`placeAsk`), reads the outcome as it reads it (`outcomeOf`), and
 * stops a script's group at its deadline with the same signals and grace (`signalGroup`, `STOP_GRACE_MS`), waiting with timers instead.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { Effect } from 'effect';
import { STOP_GRACE_MS, STOP_POLL_MS, outcomeOf, placeAsk, signalGroup } from './place.store.ts';
import type { PlaceOutcome, PlaceRequests, PlaceVerb } from './place.ts';

/** Whether the group `pgid` leads has no process left within `STOP_GRACE_MS`, asked every `STOP_POLL_MS` on a timer. */
async function emptied(pgid: number): Promise<boolean> {
  const until = performance.now() + STOP_GRACE_MS;
  while (performance.now() < until) {
    if (!signalGroup(pgid, 0)) return true;
    await sleep(STOP_POLL_MS);
  }
  return !signalGroup(pgid, 0);
}

/** The group `pgid` leads stopped: SIGTERM, then SIGKILL when a process of it outlives `STOP_GRACE_MS`. Answers whether it had to kill. */
async function stopGroup(pgid: number): Promise<boolean> {
  if (!signalGroup(pgid, 'SIGTERM') || (await emptied(pgid))) return false;
  signalGroup(pgid, 'SIGKILL');
  await emptied(pgid);
  return true;
}

/**
 * Run `verb` of the place skill in `skillDir` as `runPlaceVerb` runs it — its script, request, deadline, environment and outcome — with the
 * event loop free while it runs: the script is spawned and awaited, never waited on in place. Past its deadline its leader is killed, what it
 * started is stopped, SIGTERM then SIGKILL after `STOP_GRACE_MS`, and its pipes are closed, before the outcome is answered. Never fails.
 */
export const runPlaceVerbAsync = <V extends PlaceVerb>(
  skillDir: string,
  verb: V,
  request: PlaceRequests[V],
  options: { readonly deadlineMs?: number; readonly env?: NodeJS.ProcessEnv } = {},
): Effect.Effect<PlaceOutcome<V>> =>
  Effect.promise(async () => {
    const asked = placeAsk(skillDir, verb, request, options);
    if ('unread' in asked) return asked;
    const child = spawn(process.execPath, [asked.script], { cwd: skillDir, env: asked.env, detached: true, stdio: 'pipe' });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.stdin.on('error', () => undefined);
    child.stdin.end(asked.input);
    let timedOut = false;
    let stopping: Promise<boolean> = Promise.resolve(false);
    const deadline = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
      const pgid = child.pid;
      stopping = (pgid === undefined ? Promise.resolve(false) : stopGroup(pgid)).then((killed) => {
        child.stdout.destroy();
        child.stderr.destroy();
        return killed;
      });
    }, asked.deadlineMs);
    const ended = await new Promise<{ status: number | null; signal: NodeJS.Signals | null; error?: Error }>((resolve) => {
      child.once('error', (error) => resolve({ status: null, signal: null, error }));
      child.once('close', (status, signal) => resolve({ status, signal }));
    });
    clearTimeout(deadline);
    const killed = await stopping;
    return outcomeOf(
      verb,
      {
        ...ended,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        timedOut,
        killed,
      },
      asked.deadlineMs,
    );
  });

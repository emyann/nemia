/**
 * The store handed from a daemon started by hand to the login service, as a person restarts the daemon by hand: the store paused with no
 * timeout, so nothing new is filed and the jobs run on, checks included — a landing's wait on CI among them — each on the runtime's
 * worker, which outlives the daemon, its result read by the next; the daemon's own sessions held at their next call and their calls in
 * flight waited for up to the timeout, the daemon of the confirmed pid stopped by SIGTERM — which writes `stoppedAt`, its holder parking
 * each session for the next — the service started, and the store resumed once the service's daemon has completed its first pass. A
 * pause a person put stands as it was. The pause it puts names the process that runs it (`heldBy`, put by its host), and so does the
 * runtime's drain: a take-over killed while it waits leaves neither standing past the daemon's next pass. `nemia service install
 * --take-over`, `nemia upgrade` and `nemia service restart` run it.
 */
import type { PlaceService } from '../place/place.store.ts';
import { Clock, Effect, Schedule } from 'effect';
import { daemonLine, type DaemonStanding } from '../daemon/daemon.ts';
import { timeoutWords, pausingWords, type Finishing, type Pause } from '../pause/pause.ts';
import { Conflict, type Refusal } from '../refusal/refusal.ts';
import { tried, type EngineService } from '../runtime-client.ts';

/**
 * What the take-over is handed of its host (`ServiceHost` in `service.verb.ts`): the lease, a signal to a pid, the store's pause put and
 * lifted, the calls in flight of the sessions living in the daemon (`calls`), a line said while it
 * waits, how often it polls, how long it waits for the lease (`waitMs`), how long it gives those calls (`timeoutMs`), and how long it
 * waits for the signalled daemon to let the store go (`stopMs`), which stands above the runtime's own let-go.
 */
export type TakeoverHost = {
  readonly lease: () => DaemonStanding;
  readonly signal: (pid: number) => void;
  readonly pause: (said: { why?: string; by?: string }) => Pause;
  readonly resume: () => Pause;
  readonly calls: () => Effect.Effect<readonly Finishing[], Refusal, EngineService | PlaceService>;
  readonly drain: (holder: number | null) => Effect.Effect<void, Refusal, EngineService>;
  readonly say: (line: string) => void;
  readonly pollMs: number;
  readonly waitMs: number;
  readonly timeoutMs: number;
  readonly stopMs: number;
};

/** The service a take-over starts: its start, and the command that reads its log (`logsLine`). */
export type Started = { readonly start: () => void; readonly logs: string };

/** The command a take-over runs under unless it is named: the install that hands the store to the service. */
export const INSTALL_BY = 'nemia service install';

/** How a take-over's lines open: the install with the pid it was given, or the command that runs it. */
const opening = (pid: number, by: string): string => (by === INSTALL_BY ? `${by} --take-over ${pid}` : by);

/**
 * Why `pid` is not the daemon to stop, or null: the lease must name it ticking, and the process table must say it is the process that
 * wrote the lease (`same`), so a pid reused by another process is never signalled. Its words open on `by`, the command asking.
 */
export function takeOverRefusal(pid: number, lease: DaemonStanding, by: string = INSTALL_BY): string | null {
  const said = opening(pid, by);
  if (lease.kind !== 'ticking')
    return `${said}: no daemon ticks the store (${lease.kind}): install without --take-over starts the service.`;
  if (lease.file.pid !== pid)
    return `${said}: the store is held by pid ${lease.file.pid}, not ${pid}: name the holder's pid, as nemia service status says it.`;
  if (lease.identity !== 'same')
    return `${said}: pid ${pid} could not be confirmed as the daemon that holds the store (${lease.identity}): stop it by hand once checked, then install.`;
  return null;
}

/**
 * Refuses (`Conflict`) a pid that is not the confirmed holder (`takeOverRefusal`): asked before anything is written, and again before the
 * signal.
 */
export const takeOverConfirmed = (pid: number, host: TakeoverHost, by: string = INSTALL_BY) =>
  tried(() => {
    const refusal = takeOverRefusal(pid, host.lease(), by);
    if (refusal !== null) throw new Conflict({ message: refusal });
  });

/** The pause the take-over puts, or false where one already stands, which it leaves as it is. */
const pauseFor = (pid: number, host: TakeoverHost, by: string) =>
  tried(() => {
    try {
      host.pause({ by, why: `${by === INSTALL_BY ? 'taking over' : 'restarting'} the daemon at pid ${pid}` });
      return true;
    } catch (err) {
      if (err instanceof Conflict) return false;
      throw err;
    }
  });

/** A timeout in words: `10m`, `90s`, or its milliseconds where it is under a second, as only a test gives one. */
const timeoutSaid = (ms: number): string => (ms < 1_000 ? `${ms} ms` : timeoutWords(ms));

/**
 * Waits until no session living in the daemon is in a tool call (`calls`), saying how many are and in how long they are cut
 * (`pausingWords`) each time either changes; at most the host's `timeoutMs`, past which it says which call it gives up on and goes on to
 * the signal, since the daemon's own holder cuts a call that never ends and the next holder resumes that session told which did not
 * finish. A job is not waited for, nor a check, a landing's included: each runs on through the restart on its worker.
 */
const called = (host: TakeoverHost) =>
  Effect.gen(function* () {
    const since = yield* Clock.currentTimeMillis;
    let left: readonly Finishing[] = [];
    let said = '';
    const told = Effect.tap(host.calls(), (found) =>
      Effect.gen(function* () {
        left = found;
        const words = found.length ? pausingWords(found.length, host.timeoutMs - ((yield* Clock.currentTimeMillis) - since)) : '';
        if (words && words !== said) host.say(words);
        said = words;
      }),
    );
    return yield* Effect.repeat(told, { schedule: Schedule.spaced(host.pollMs), until: (found) => found.length === 0 }).pipe(
      Effect.timeoutOrElse({
        duration: host.timeoutMs,
        orElse: () =>
          Effect.sync(() => {
            for (const c of left)
              host.say(
                `giving up on ${c.run}'s ${c.step}: its call to ${c.calling} has not ended within the timeout of ${timeoutSaid(host.timeoutMs)}, ` +
                  'and the daemon is stopped now; its holder cuts the call, and the next one resumes the session told the call did not finish',
              );
            return left;
          }),
      }),
    );
  });

/** Waits, at most `ms`, until the lease reads as `done` says; else refused (`Conflict`) with `refusal`. */
const leaseUntil = (host: TakeoverHost, ms: number, done: (lease: DaemonStanding) => boolean, refusal: string) =>
  Effect.repeat(
    Effect.sync(() => host.lease()),
    { schedule: Schedule.spaced(host.pollMs), until: done },
  ).pipe(Effect.timeoutOrElse({ duration: ms, orElse: () => Effect.fail(new Conflict({ message: refusal })) }));

/** Whether `lease` names the daemon of `pid` ticking with no pass completed yet: what the first-pass wait waits through. */
const firstPassDue = (lease: DaemonStanding, pid: number): boolean =>
  lease.kind === 'ticking' && lease.file.pid === pid && lease.file.passedAt === null;

/**
 * Waits for the first pass of the daemon of `pid`, saying once that it waits; no deadline while its lease reads it ticking, since its beat
 * runs through a long pass and a dead one stops beating. Refused (`Conflict`) when the lease reads it otherwise before a pass — stopped,
 * gone, stalled, or another pid in its place — naming its log, the lease and `left`, what becomes of the store's pause.
 */
export const firstPassed = (pid: number, host: TakeoverHost, service: Started, by: string, left: string) =>
  Effect.gen(function* () {
    yield* Effect.sync(() => host.say(`pid ${pid} ticks the store: waiting for its first pass`));
    const lease = yield* Effect.repeat(
      Effect.sync(() => host.lease()),
      { schedule: Schedule.spaced(host.pollMs), until: (read) => !firstPassDue(read, pid) },
    );
    if (lease.kind === 'ticking' && lease.file.pid === pid) return pid;
    return yield* Effect.fail(
      new Conflict({
        message: `${by}: the daemon started as pid ${pid} ended before its first pass (${daemonLine(lease, Date.now())}): read why in its log with ${service.logs}, and the lease with nemia service status; ${left}.`,
      }),
    );
  });

/**
 * Starts the service and answers the pid of its daemon once that daemon has completed its first pass (`firstPassed`). Refused
 * (`Conflict`): no daemon but `old` ticks the store within the host's `waitMs`, or the one that does ends before its first pass; each
 * naming `left`.
 */
export const startedPassed = (host: TakeoverHost, service: Started, by: string, old: number | null, left: string) =>
  Effect.gen(function* () {
    yield* tried(service.start);
    const ticking = yield* leaseUntil(
      host,
      host.waitMs,
      (lease) => lease.kind === 'ticking' && lease.file.pid !== old,
      `${by}: the service was started and does not tick the store yet: nemia service status says why, and ${service.logs} its log; ${left}.`,
    );
    return ticking.kind === 'ticking' ? yield* firstPassed(ticking.file.pid, host, service, by, left) : null;
  });

/**
 * Hands the store from the daemon of `pid` to the service it starts (`service`), and answers the pid that ticks it then, once that
 * daemon has completed its first pass (`startedPassed`). Refused (`Conflict`): a pid that is not the confirmed holder, before
 * anything is done; a daemon that does not let the store go within the host's `stopMs`, which stands above the runtime's own
 * let-go so a daemon parking a session whose call it cut is not read as one that will not stop; a service that does not take the
 * store within its `waitMs`; or a service whose daemon ends before its first pass — the store left paused, since no work starts
 * without a daemon to judge it, until a daemon's first pass lifts it once this command has ended. Its pause has no timeout, so it parks
 * no job: the jobs and the checks run on, and none is waited for. Before the signal it holds back the new tool calls of the daemon's
 * attached sessions (`drain`) and waits at most the host's `timeoutMs` for each call in flight (`called`), so the daemon stops between
 * two calls where it can, and says which call it gave up on where it cannot.
 * Interrupted before the signal, it lifts the drain and the pause it put; after it, the drain names a daemon that is gone, and no
 * other is held by it. Its pause and its lines name `by`.
 */
export const takeOver = Effect.fn('takeOver')(function* (pid: number, host: TakeoverHost, service: Started, by: string = INSTALL_BY) {
  yield* takeOverConfirmed(pid, host, by);
  let signalled = false;
  const own = yield* Effect.acquireRelease(pauseFor(pid, host, by), (put, exit) =>
    put && (exit._tag === 'Success' || !signalled) ? tried(() => host.resume()).pipe(Effect.ignore) : Effect.void,
  );
  yield* Effect.acquireRelease(host.drain(pid), () => (signalled ? Effect.void : host.drain(null).pipe(Effect.ignore)));
  yield* called(host);
  yield* takeOverConfirmed(pid, host, by);
  signalled = true;
  yield* tried(() => host.signal(pid));
  const left = own
    ? 'the store stays paused until a daemon ticks it, whose first pass lifts the pause once this command has ended (nemia resume lifts it at once)'
    : 'the pause that stood is left as it was';
  yield* leaseUntil(
    host,
    host.stopMs,
    (lease) => lease.kind === 'stopped' || lease.kind === 'gone' || (lease.kind === 'ticking' && lease.file.pid !== pid),
    `${by}: pid ${pid} was sent SIGTERM and still holds the store: check it with ps -p ${pid}, stop it, and ${by === INSTALL_BY ? 'install' : 'run it'} again; ${left}.`,
  );
  return { pid: yield* startedPassed(host, service, by, pid, left), paused: !own };
}, Effect.scoped);

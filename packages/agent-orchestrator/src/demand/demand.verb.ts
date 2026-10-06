/**
 * The daemon started on demand, by a command that ticks (`ticks` in the command table), before it runs: where no daemon ticks the store,
 * the store's login service started where one is installed, else the daemon the service would run spawned in a session of its own, and
 * the lease waited for, bounded. It reaches the machine through its host (`DemandHost`): the live one at the command line, a fake in the
 * tests, so no test starts a daemon it did not mean to. The api never runs it: it is the daemon.
 */
import path from 'node:path';
import { Effect, Schedule } from 'effect';
import type { Standing } from '../daemon/daemon.ts';
import { tried } from '../runtime-client.ts';
import {
  DAEMON_LOG,
  DEMAND_POLL_MS,
  DEMAND_WAIT_MS,
  daemonEnv,
  demandPlan,
  offLine,
  otherTookLine,
  serviceLog,
  serviceStartedLine,
  startedLine,
  unstartedLine,
  type ServiceNamed,
  type Unstarted,
} from './demand.ts';
import { DEFAULT_NAME, plistRead, systemOf, unitName, unitPathOf, unitRead } from '../service/service.ts';
import { spawnDetached, unitsOf, type SpawnEnded } from '../service/service.store.ts';
import { liveHost, serviceForUpgrade, type ServiceHost } from '../service/service.verb.ts';

/** What the start reaches of the machine: the service's host, a spawn of the daemon, and the caller's environment. */
export type DemandHost = ServiceHost & {
  readonly spawn: typeof spawnDetached;
  readonly env: Readonly<Record<string, string | undefined>>;
};

/** The machine as it is, the lease read every `DEMAND_POLL_MS` for at most `DEMAND_WAIT_MS`. */
export const liveDemandHost = (): DemandHost => ({
  ...liveHost(),
  pollMs: DEMAND_POLL_MS,
  waitMs: DEMAND_WAIT_MS,
  spawn: spawnDetached,
  env: process.env,
});

/** The login service of the store `host` serves: the unit or agent whose `WF_ROOT` is the store, as named and started; or null. */
function storeService(host: DemandHost): (ServiceNamed & { start: () => void }) | null {
  const system = systemOf(host.machine());
  if ('refusal' in system) return null;
  const { root } = host.roots();
  const read = system.system === 'systemd' ? unitRead : plistRead;
  const folder = path.dirname(unitPathOf(system.system, DEFAULT_NAME, host.dirs()));
  for (const { name, text } of unitsOf(folder)) {
    if (!read(text).env.some(([key, value]) => key === 'WF_ROOT' && value === root)) continue;
    const found = serviceForUpgrade({ name }, host);
    if (found === null) continue;
    const unit = unitName(system.system, name);
    return { system: system.system, name, unit, home: host.dirs().home, uid: host.user().uid, start: found.start };
  }
  return null;
}

/** The lease once it ticks, or the start's end, read every `pollMs`; undefined once `waitMs` has passed with neither. */
const settled = (host: DemandHost, ended: () => SpawnEnded | undefined) =>
  Effect.repeat(
    Effect.sync(() => ({ lease: host.lease(), ended: ended() })),
    { schedule: Schedule.spaced(host.pollMs), until: (s) => s.lease.kind === 'ticking' || s.ended !== undefined },
  ).pipe(Effect.timeoutOrElse({ duration: host.waitMs, orElse: () => Effect.succeed(undefined) }));

/** Why a start failed, in its own words. */
const failed = (err: unknown): Unstarted => ({ kind: 'failed', message: (err as Error).message ?? String(err) });

/** What came of a start that did not tick: its end, or the whole wait. */
const unstarted = (end: { ended: SpawnEnded | undefined } | undefined, host: DemandHost): Unstarted =>
  end?.ended === undefined ? { kind: 'silent', waitedMs: host.waitMs } : { kind: 'ended', ...end.ended };

/** Starts the store's login service and waits for it to hold the lease; its line. */
const startService = Effect.fn('startService')(function* (service: ServiceNamed & { start: () => void }, host: DemandHost) {
  const root = host.roots().root;
  const said = { what: `its login service ${service.unit}`, root, log: serviceLog(service) };
  try {
    service.start();
  } catch (err) {
    return unstartedLine({ ...said, why: failed(err) });
  }
  const end = yield* settled(host, () => undefined);
  return end?.lease.kind === 'ticking'
    ? serviceStartedLine({ ...service, root, pid: end.lease.file.pid })
    : unstartedLine({ ...said, why: unstarted(end, host) });
});

/** The line once the lease ticks after a spawn of `pid`: started, or taken by another daemon. */
const tickingLine = (lease: Standing, pid: number, entry: string, root: string, log: string) =>
  lease.file.pid === pid ? startedLine({ pid, entry, root, log }) : otherTookLine({ pid, holder: lease.file.pid, root, log });

/** The daemon the service would run, spawned with the service's environment into `log`: what it runs, its pid and its end; or why not. */
function spawned(
  host: DemandHost,
  root: string,
  log: string,
): { entry: string; pid: number | undefined; ended: Promise<SpawnEnded> } | Unstarted {
  try {
    const { entry, cwd } = host.daemon();
    return { entry, ...host.spawn({ node: host.node, entry, cwd, env: daemonEnv(host.env, root, host.path), log }) };
  } catch (err) {
    return failed(err);
  }
}

/** Spawns the daemon the service would run and waits for it to hold the lease; its line. */
const spawnDaemon = Effect.fn('spawnDaemon')(function* (host: DemandHost) {
  const root = host.roots().root;
  const log = path.join(root, DAEMON_LOG);
  const child = spawned(host, root, log);
  if ('kind' in child) return unstartedLine({ what: 'a daemon', root, log, why: child });
  let ended: SpawnEnded | undefined;
  void child.ended.then((end) => (ended = end));
  const end = yield* settled(host, () => ended);
  if (end?.lease.kind === 'ticking' && child.pid !== undefined) return tickingLine(end.lease, child.pid, child.entry, root, log);
  const what = `a daemon${child.pid === undefined ? '' : ` (pid ${child.pid})`}`;
  return unstartedLine({ what, root, log, why: unstarted(end, host) });
});

/**
 * Where no daemon ticks the store, starts one, and says in one line what it did: the store's login service where one is installed, else
 * the daemon the service would run (`host.daemon()`), spawned with the service's environment (`daemonEnv`), printing into
 * `$WF_ROOT/daemon.log`; then waits for the lease, at most `host.waitMs`. A daemon ticking is left alone and nothing is said; with
 * `NEMIA_DAEMON_START=off` nothing starts, and that is said. A daemon that does not come up is said, never thrown: the command goes on, and
 * what it files waits for a daemon. Answers the plan it followed.
 */
export const ensureDaemon = Effect.fn('ensureDaemon')(function* (host: DemandHost = liveDemandHost()) {
  const { plan, root, found } = yield* tried(() => {
    const found: { service?: ServiceNamed & { start: () => void } } = {};
    const serviced = () => (found.service = storeService(host) ?? undefined) !== undefined;
    return { plan: demandPlan(host.lease(), serviced, host.env), root: host.roots().root, found };
  });
  if (plan.kind === 'ticking') return plan;
  if (plan.kind === 'off') host.say(offLine(root));
  else host.say(found.service !== undefined ? yield* startService(found.service, host) : yield* spawnDaemon(host));
  return plan;
});

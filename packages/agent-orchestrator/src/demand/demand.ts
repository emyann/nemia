/**
 * The daemon started on demand — pure: what a command that ticks (`ticks` in the command table) does about the store's lease before it
 * runs (`demandPlan`), the environment a daemon it starts is given (`daemonEnv`), and the one line it says of what it did. The command
 * line alone starts one (`ensureDaemon` in `demand.verb.ts`): the api is the daemon, and Nemia runs under it with the start turned off.
 */
import { START_WORDS, type DaemonStanding } from '../daemon/daemon.ts';
import { OWN_KEYS, type ServiceSystem } from '../service/index.ts';

/** The setting that turns the start off for a caller: `NEMIA_DAEMON_START=off`, in Nemia's settings and in every test's process. */
export const DEMAND_OFF = 'NEMIA_DAEMON_START';

/** How long a command waits for a daemon it started to take the store before it goes on without one. */
export const DEMAND_WAIT_MS = 60_000;

/** How often it reads the lease while it waits. */
export const DEMAND_POLL_MS = 200;

/** The file under the store a daemon started on demand prints into. */
export const DAEMON_LOG = 'daemon.log';

/** The variables of the login a service's system gives its daemon itself, passed on from the command's own environment where set. */
const LOGIN_KEYS = ['HOME', 'USER', 'LOGNAME', 'SHELL', 'XDG_RUNTIME_DIR', 'LANG'] as const;

/** What a command that ticks does before it runs: nothing, where a daemon ticks or the start is off; start the service; or spawn. */
type DemandPlan = { kind: 'ticking' } | { kind: 'off' } | { kind: 'service' } | { kind: 'spawn' };

/**
 * The plan from where the lease stands, whether a login service of the store is installed (`serviced`, asked only where it decides) and
 * the caller's environment. A
 * daemon ticking is left alone, so none starts beside it; a lease stalled, gone, stopped, unreadable or absent is no holder, as the next
 * daemon takes it over. `NEMIA_DAEMON_START=off` starts nothing; an installed service is started before a daemon of another kind.
 * @param standing Where the store's lease stands.
 * @param serviced Asks whether a login service of the store is installed.
 * @param env The caller's environment, whose `NEMIA_DAEMON_START` is read.
 */
export function demandPlan(standing: DaemonStanding, serviced: () => boolean, env: Readonly<Record<string, string | undefined>>) {
  if (standing.kind === 'ticking') return { kind: 'ticking' } satisfies DemandPlan;
  if (env[DEMAND_OFF] === 'off') return { kind: 'off' } satisfies DemandPlan;
  return (serviced() ? { kind: 'service' } : { kind: 'spawn' }) satisfies DemandPlan;
}

/**
 * The environment of a daemon started on demand: what the service writes (`OWN_KEYS`, the store `root` and the search path `searchPath`),
 * and the login's basics its system adds (`LOGIN_KEYS`) where `env` sets them; nothing else of the command's shell.
 * @param env The command's environment, whose login variables are passed on where set.
 * @param root The store's directory, given as `WF_ROOT`.
 * @param searchPath The search path, given as `PATH`.
 */
export function daemonEnv(env: Readonly<Record<string, string | undefined>>, root: string, searchPath: string) {
  const own: Record<(typeof OWN_KEYS)[number], string> = { WF_ROOT: root, PATH: searchPath };
  const login = LOGIN_KEYS.flatMap((key) => (env[key] === undefined ? [] : [[key, env[key]] as const]));
  return { ...Object.fromEntries(login), ...own };
}

/** What the started daemon is not given, and where it would come from. */
const ENV_WORDS =
  "it runs with the service's environment (WF_ROOT, PATH and the login's): settings such as PORT, WF_MAX_CONCURRENT, WF_MAX_RUNS " +
  'or OTEL_EXPORTER_OTLP_ENDPOINT come from nemia service install --env';

/**
 * Said once a daemon this command spawned holds the store: its pid, what it runs, where it logs, how to stop or keep it.
 * @param s The daemon spawned: its pid, the entry it runs, the store it holds and the file it logs to.
 */
export const startedLine = (s: { pid: number; entry: string; root: string; log: string }) =>
  `nemia: no daemon ticked ${s.root}, so this command started one: pid ${s.pid}, running ${s.entry}, logging to ${s.log}; ` +
  `stop it with kill ${s.pid}, or keep it as the login service with nemia service install --take-over ${s.pid} — ${ENV_WORDS}.`;

/** A login service as its lines name it: its system, its name, the system's name for it, and the user's home and id. */
export type ServiceNamed = { system: ServiceSystem; name: string; unit: string; home: string; uid: number };

/**
 * Where the service's system keeps what it prints: systemd's journal, or the file launchd writes.
 * @param s The login service.
 */
export const serviceLog = (s: ServiceNamed) =>
  s.system === 'systemd' ? `journalctl --user -u ${s.unit}` : `${s.home}/Library/Logs/${s.name}.log`;

/** Where the service logs, and how it is stopped. */
const serviceWords = (s: ServiceNamed) =>
  `logging to ${serviceLog(s)}; stop it with ${s.system === 'systemd' ? `systemctl --user stop ${s.unit}` : `launchctl bootout gui/${s.uid}/${s.name}`}`;

/**
 * Said once the login service this command started holds the store.
 * @param s The login service, the store it holds and the pid it runs as.
 */
export const serviceStartedLine = (s: ServiceNamed & { root: string; pid: number }) =>
  `nemia: no daemon ticked ${s.root}, so this command started its login service ${s.unit}: pid ${s.pid}, ${serviceWords(s)}.`;

/**
 * Said where nothing ticks the store and this caller does not start a daemon (`NEMIA_DAEMON_START=off`).
 * @param root The store's directory.
 */
export const offLine = (root: string) =>
  `nemia: nothing ticks ${root}, and ${DEMAND_OFF}=off here, so this command starts no daemon: what it files waits for one — ${START_WORDS}.`;

/**
 * How a daemon started came to nothing: it could not be started, with why; it ended first, with its code or signal; or it was silent for
 * the whole wait.
 */
export type Unstarted =
  | { kind: 'failed'; message: string }
  | { kind: 'ended'; code: number | null; signal: string | null }
  | { kind: 'silent'; waitedMs: number };

/** Why a daemon started did not take the store, in words. */
const unstartedWords = (why: Unstarted) => {
  if (why.kind === 'failed') return `it could not be started (${why.message})`;
  if (why.kind === 'silent') return `it has not taken the store after ${Math.round(why.waitedMs / 1000)}s`;
  return `it ended (${why.signal === null ? `exit ${why.code}` : `killed by ${why.signal}`}) before it took the store`;
};

/**
 * Said where the daemon started does not take the store: why, where to read it, and that the command went on.
 * @param s What was started, the store, the file it logs to and why it did not take the store.
 */
export const unstartedLine = (s: { what: string; root: string; log: string; why: Unstarted }) =>
  `nemia: no daemon ticked ${s.root}, so this command started ${s.what}, but ${unstartedWords(s.why)}: read ${s.log}. ` +
  `The command went on, and what it files waits for a daemon — ${START_WORDS}.`;

/**
 * Said where another daemon took the store while this one started: the one spawned stops on the lease's refusal.
 * @param s The pid spawned, the pid of the daemon that took the store, the store and the file the one spawned logs to.
 */
export const otherTookLine = (s: { pid: number; holder: number; root: string; log: string }) =>
  `nemia: another daemon, pid ${s.holder}, took ${s.root} while this command started pid ${s.pid}, which stops on the lease's refusal (${s.log}): pid ${s.holder} ticks it.`;

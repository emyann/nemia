/**
 * `nemia service install`, `nemia service uninstall` and `nemia service status`: the daemon as a login service, entries of the command
 * table the CLI serves alone, since they change the person's machine. Each reaches the machine through its host (`ServiceHost`): the live
 * one at the command line, a fake in the tests, so no test starts a service.
 */
import { StoreRoot } from '../config/root.store.ts';
import os from 'node:os';
import { isIP } from 'node:net';
import { Effect } from 'effect';
import type { Command } from '../command/entry.verb.ts';
import type { Args, Flag } from '../command/command.ts';
import { daemonLine } from '../daemon/daemon.ts';
import { daemonStanding, thisProcess } from '../daemon/daemon.store.ts';
import { putPause, readPause, resumePause } from '../pause/pause.store.ts';
import { Invalid, Missing, type Refusal } from '../refusal/refusal.ts';
import { asked, drained, EngineService, tried, type TaskView } from '../runtime-client.ts';
import { DEFAULT_TIMEOUT_MS, timeoutOf, timeoutRefusal, type Finishing, type Pause } from '../pause/pause.ts';
import { timeoutAt } from '../pause/pause-timeout.store.ts';
import { pointedEntry } from '../release/index.ts';
import { runningRelease } from '../release/version.verb.ts';
import {
  envPairs,
  envRefusal,
  holderOfLease,
  launchdLogs,
  launchdState,
  logsLine,
  startLine,
  nameRefusal,
  plistRead,
  plistText,
  specRefusal,
  statusLines,
  systemdState,
  systemOf,
  takeOverLine,
  unitName,
  unitPathOf,
  unitRead,
  unitText,
  DEFAULT_NAME,
  type Machine,
  type ServiceRead,
  type ServiceSpec,
  type ServiceSystem,
  type UnitState,
} from './service.ts';
import {
  checkoutOf,
  daemonEntry,
  lingerOf,
  machineOf,
  readUnit,
  removeUnit,
  serviceDirs,
  storeRoots,
  systemCall,
  userOf,
  writeUnit,
} from './service.store.ts';
import { takeOver, takeOverConfirmed, type Started, type TakeoverHost } from './takeover.verb.ts';
import { sizedFor, sizeRefusal, type MachineSize } from './sizing.ts';

/**
 * What the service's verbs reach of the machine: what it is, where files go, which store and its default, the daemon the checkout runs
 * and the node that runs it (the daemon's own `node` where it carries one, an archive install's), the installer's `PATH`, the user, the
 * system's programs (`call`) and lingering, and its size, which `--size auto` reads (`size`); and what a take-over is handed
 * (`TakeoverHost`).
 */
export type ServiceHost = TakeoverHost & {
  readonly machine: () => Machine;
  readonly dirs: () => { home: string; configHome: string };
  readonly roots: () => { root: string; defaultRoot: string };
  readonly daemon: () => { checkout: string; entry: string; cwd: string; node?: string };
  readonly size: () => MachineSize;
  readonly node: string;
  readonly path: string;
  readonly user: () => { name: string; uid: number };
  readonly call: (argv: readonly string[]) => string;
  readonly linger: (user: string) => boolean | undefined;
  /** The store's pause as its file says it (`readPause`), or null where none stands: what `nemia service status` says of it. */
  readonly standing: () => Pause | null;
};

/** What the take-over reads of a task the engine lists: its id, whether it lives in the daemon and is settled, its labels, its call. */
export type ListedTask = Pick<TaskView, 'id' | 'calling'> & {
  readonly state: Pick<TaskView['state'], 'settled' | 'restartPolicy' | 'labels'>;
};

/**
 * The calls in flight of the sessions living in the daemon (`restartPolicy: 'Always'`), each read off `list`: the whole store once, for
 * the live sessions among it, then those sessions alone on each read after. A job is never among them: it runs on through a restart.
 * Each call is named by its task's run and step labels, or its id where it carries none.
 */
export const attachedCalls = <E, R>(list: (ids?: readonly string[]) => Effect.Effect<{ views: readonly ListedTask[] }, E, R>) => {
  let ids: readonly string[] | undefined;
  return (): Effect.Effect<readonly Finishing[], E, R> =>
    Effect.map(
      Effect.suspend(() => (ids === undefined ? list() : ids.length ? list(ids) : Effect.succeed({ views: [] }))),
      ({ views }) => {
        const live = views.filter((v) => v.state.restartPolicy === 'Always' && v.state.settled === null);
        ids ??= live.map((v) => v.id);
        return live.flatMap((v): Finishing[] =>
          v.calling
            ? [{ run: v.state.labels?.run ?? v.id, step: v.state.labels?.step ?? v.id, kind: 'session', calling: v.calling.tool }]
            : [],
        );
      },
    );
};

/** The engine's list, as the live host reads the attached calls through it (`attachedCalls`). */
const engineList = (ids?: readonly string[]) => Effect.flatMap(EngineService, (e) => asked('list', e.list(ids)));

/**
 * The timeout a take-over gives the calls in flight: `--timeout` where given (`timeoutOf`), else the store's at `home` (`timeoutAt`).
 * Refused (`Invalid`): a `--timeout` that does not read, naming `by`'s flag, or a timeout file that does not read.
 */
export const timeoutGiven = (args: Args, home: string, by: string): Effect.Effect<number, Refusal> =>
  tried(() => {
    if (typeof args.timeout !== 'string') return timeoutAt(home).ms;
    const ms = timeoutOf(args.timeout);
    if (ms === undefined) throw new Invalid({ message: `${by}: --timeout takes ${timeoutRefusal(args.timeout)}, like --timeout 10m.` });
    return ms;
  });

/** The live host of `nemia <verb>`, its take-over given the timeout `timeoutGiven` reads off `args` and the store at `home`. */
export const timedHost = (args: Args, home: string, verb: string): Effect.Effect<ServiceHost, Refusal> =>
  Effect.map(timeoutGiven(args, home, `nemia ${verb}`), (ms) => liveHost(home, ms));

/**
 * The machine as it is: the process's node, the store's lease and pause, `systemctl` and `launchctl` themselves. The daemon an install
 * runs is under `releases/current` (`pointedEntry`), so the service follows the pointer. A take-over gives the daemon's calls in
 * flight `timeoutMs` (`timeoutGiven`), ten minutes where none is given, and its pause names this process as its holder (`thisProcess`),
 * so the daemon's next pass lifts it once the command has ended.
 */
export const liveHost = (root: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): ServiceHost => ({
  machine: machineOf,
  dirs: serviceDirs,
  roots: () => storeRoots(root),
  daemon: () => pointedEntry({ ...daemonEntry(), node: process.execPath }, runningRelease()),
  size: () => ({ memoryMiB: Math.floor(os.totalmem() / 1_048_576), cpus: os.availableParallelism() }),
  node: process.execPath,
  path: process.env.PATH ?? '',
  user: userOf,
  call: systemCall,
  linger: lingerOf,
  standing: () => readPause(root),
  lease: () => daemonStanding(root),
  signal: (pid) => process.kill(pid, 'SIGTERM'),
  pause: (said) => putPause(root, said, new Date(), undefined, thisProcess()),
  resume: () => resumePause(root),
  calls: attachedCalls(engineList),
  drain: drained,
  say: (line) => console.error(line),
  pollMs: 2_000,
  waitMs: 60_000,
  timeoutMs,
  stopMs: 90_000,
});

/** A service's whereabouts: its name, its system, its file, and the system's own name for it. */
type Placed = { name: string; system: ServiceSystem; file: string; unit: string };

/** The service named by `args` on this machine, or refused (`Invalid`): no system to install one with, or a name the store forbids. */
function placed(args: Args, host: ServiceHost): Placed {
  const system = systemOf(host.machine());
  if ('refusal' in system) throw new Invalid({ message: system.refusal });
  const name = typeof args.name === 'string' ? args.name : undefined;
  const { root, defaultRoot } = host.roots();
  const wrong = nameRefusal(name, root, defaultRoot);
  if (wrong !== null) throw new Invalid({ message: wrong });
  const named = name ?? DEFAULT_NAME;
  return { name: named, system: system.system, file: unitPathOf(system.system, named, host.dirs()), unit: unitName(system.system, named) };
}

/** The system's programs for one service: reload its files, enable it at login, start, restart, stop and read it. */
function ops(at: Placed, host: ServiceHost) {
  const ctl = (...argv: string[]) => host.call(['systemctl', '--user', ...argv]);
  const domain = `gui/${host.user().uid}`;
  const booted = () => {
    try {
      host.call(['launchctl', 'bootout', `${domain}/${at.name}`]);
    } catch {
      return;
    }
  };
  if (at.system === 'systemd')
    return {
      installed: () => void (ctl('daemon-reload'), ctl('enable', at.unit)),
      start: () => void ctl('start', at.unit),
      restart: () => void ctl('restart', at.unit),
      remove: () => void ctl('disable', '--now', at.unit),
      removed: () => void ctl('daemon-reload'),
      state: (): UnitState => systemdState(ctl('show', at.unit, '-p', 'ActiveState,UnitFileState,MainPID')),
    };
  const bootstrap = () => void (booted(), host.call(['launchctl', 'bootstrap', domain, at.file]));
  return {
    installed: () => undefined,
    start: bootstrap,
    restart: bootstrap,
    remove: booted,
    removed: () => undefined,
    state: (): UnitState => {
      try {
        return launchdState(host.call(['launchctl', 'print', `${domain}/${at.name}`]));
      } catch {
        return launchdState(null);
      }
    },
  };
}

/** The system's word on the service, or null where it cannot say. */
const stateOf = (at: Placed, host: ServiceHost): UnitState | null => {
  try {
    return ops(at, host).state();
  } catch {
    return null;
  }
};

/** The service as a take-over starts it: its start, how its log is read, the system's word on it now, and how a person starts it. */
const startedOf = (at: Placed, host: ServiceHost): Started => ({
  start: () => ops(at, host).start(),
  logs: logsLine(at.system, at.name, host.dirs().home),
  stateNow: () => stateOf(at, host),
  startLine: startLine(at.system, at.name, at.file, host.user().uid),
});

/** A pid as `--take-over` gives it: digits, above zero; else refused (`Invalid`). */
function pidOf(text: unknown): number | undefined {
  if (text === undefined) return undefined;
  const pid = typeof text === 'string' && /^\d+$/.test(text) ? Number(text) : 0;
  if (pid > 0) return pid;
  throw new Invalid({
    message: `nemia service install: --take-over takes the pid of the daemon that holds the store, like --take-over 12345.`,
  });
}

/** The variables `--bind` writes: the address the daemon listens on, and the store marked exposed, so every caller presents a token. */
const BIND_KEYS = ['NEMIA_BIND', 'WF_EXPOSED'] as const;

/**
 * Whether `--bind` names an address the daemon listens on as its api reads `NEMIA_BIND` (`bindOf`, apps/api/src/port.ts): an IPv4
 * address, or an IPv6 one written bare, never a host name, brackets or a zone (`%eth0`), which the api refuses at every start.
 */
const bindable = (value: string): boolean => isIP(value) !== 0 && !value.includes('%');

/**
 * The variables `--size auto` writes, read off the machine's size (`sizedFor`), each but one `--env` gives (`given`): the sessions at once
 * and, but on launchd, which holds no per-session limit, each one's memory limit; and its line. None without `--size`. Refused
 * (`Invalid`): a `--size` other than `auto`, or a machine outside what Nemia sizes (`sizeRefusal`).
 */
function sizedEnv(args: Args, at: Placed, host: ServiceHost, given: ReadonlySet<string>): { env: [string, string][]; lines: string[] } {
  if (args.size === undefined) return { env: [], lines: [] };
  if (args.size !== 'auto')
    throw new Invalid({
      message: `nemia service install: --size takes auto, which sizes the sessions to this machine: ${SHAPES.install}.`,
    });
  const machine = host.size();
  const wrong = sizeRefusal(machine);
  if (wrong !== null) throw new Invalid({ message: wrong });
  const sized = sizedFor(machine);
  const env: [string, string][] = [
    ...(given.has('WF_MAX_CONCURRENT') ? [] : [['WF_MAX_CONCURRENT', String(sized.maxConcurrent)] as [string, string]]),
    ...(given.has('WF_MEMORY_LIMIT') || at.system === 'launchd'
      ? []
      : [['WF_MEMORY_LIMIT', `${sized.memoryLimitMiB}Mi`] as [string, string]]),
  ];
  const said = env.map(([k, v]) => `${k}=${v}`).join(', ');
  return {
    env,
    lines: [
      `sized for ${machine.memoryMiB} MiB and ${machine.cpus} CPU: ${said || 'each variable as --env gives it'}`,
      ...(at.system === 'launchd'
        ? ['launchd holds no per-session memory limit: no WF_MEMORY_LIMIT is written, and a session on macOS runs unbounded']
        : []),
    ],
  };
}

/**
 * The variables `--bind <addr>` writes (`BIND_KEYS`); none without it. Refused (`Invalid`): an address that is none, or a variable
 * `--env` gives too.
 */
function boundEnv(args: Args, given: ReadonlySet<string>): [string, string][] {
  if (args.bind === undefined) return [];
  if (typeof args.bind !== 'string' || !bindable(args.bind))
    throw new Invalid({
      message: `nemia service install: --bind takes an IP address of this machine for the daemon to listen on, never a host name: --bind 0.0.0.0 for every interface, --bind 100.64.0.7 for a private network's, or --bind :: for every IPv6 one (no brackets). Find this machine's with \`ip -brief address\`.`,
    });
  const twice = BIND_KEYS.find((k) => given.has(k));
  if (twice !== undefined)
    throw new Invalid({ message: `nemia service install: --bind writes ${twice}, and --env gives it too: give one of them.` });
  return [
    ['NEMIA_BIND', args.bind],
    ['WF_EXPOSED', '1'],
  ];
}

/**
 * The service's spec: the checkout's daemon under the installer's node (or the one the daemon carries), its store and `PATH`, what
 * `--size auto` and `--bind` write, then each `--env`, in the order given; and the lines the sizing says.
 */
function specOf(at: Placed, args: Args, host: ServiceHost): { spec: ServiceSpec; lines: string[] } {
  const given = Array.isArray(args.env) ? (args.env as readonly string[]) : [];
  const wrong = envRefusal(given);
  if (wrong !== null) throw new Invalid({ message: wrong });
  const keys = new Set(envPairs(given).map(([k]) => k));
  const sized = sizedEnv(args, at, host, keys);
  const bound = boundEnv(args, keys);
  const daemon = host.daemon();
  const spec: ServiceSpec = {
    name: at.name,
    node: host.node,
    ...daemon,
    env: [['WF_ROOT', host.roots().root], ['PATH', host.path], ...sized.env, ...bound, ...envPairs(given)],
    logs: launchdLogs(host.dirs().home, at.name),
  };
  const bad = specRefusal(spec);
  if (bad !== null) throw new Invalid({ message: bad });
  return { spec, lines: sized.lines };
}

/** What `nemia service install` did: the service and its file, the checkout it runs, how it stands now, and its lines. */
export type Installed = {
  readonly name: string;
  readonly system: ServiceSystem;
  readonly file: string;
  readonly checkout: string;
  readonly did: 'started' | 'restarted' | 'written' | 'taken';
  readonly holder: number | null;
  readonly lines: readonly string[];
};

/** What install did once the unit is written, beside the daemon the lease names: start it, restart it, or name the holder. */
function startedBeside(at: Placed, host: ServiceHost): Pick<Installed, 'did' | 'holder' | 'lines'> {
  const lease = host.lease();
  const holder = holderOfLease(lease, stateOf(at, host));
  const run = ops(at, host);
  if (holder === 'service') {
    run.restart();
    return {
      did: 'restarted',
      holder: null,
      lines: [`restarted ${at.unit}, which held the store: it ticks it again from the unit just written`],
    };
  }
  if (holder === 'other' && lease.kind === 'ticking') {
    const pid = lease.file.pid;
    return {
      did: 'written',
      holder: pid,
      lines: [
        `pid ${pid} holds the store (${daemonLine(lease, Date.now())}), so ${at.unit} is enabled and not started: it starts at the next login.`,
        `To hand the store to the service now: ${takeOverLine(pid, at.name)} — it pauses the store, waits for the daemon's calls in flight, stops pid ${pid}, starts the service and resumes.`,
      ],
    };
  }
  run.start();
  return { did: 'started', holder: null, lines: [`started ${at.unit}: nemia service status says when it ticks the store`] };
}

/** The line said after an install where the user's services stop at the last logout. */
const lingerLines = (at: Placed, host: ServiceHost): string[] => {
  if (at.system !== 'systemd') return [];
  const user = host.user().name;
  return host.linger(user) === false
    ? [
        `lingering is off: the service stops at the last logout and starts at the next login; loginctl enable-linger ${user} keeps it running`,
      ]
    : [];
};

/**
 * Installs the service: refuses before anything is written (no system, a name the store forbids, a bad environment or path, a pid not the
 * holder's), writes the file whole, enables it at login, then starts it where nothing ticks the store, restarts it where it is the holder,
 * or leaves it to the next login where another daemon holds the store — naming its pid and how to take over. With `--take-over <pid>`,
 * hands the store from that daemon to the service (`takeOver`).
 */
export const installService = Effect.fn('installService')(function* (args: Args, given?: ServiceHost) {
  const host = given ?? liveHost(yield* StoreRoot);
  const { at, spec, sizing, pid } = yield* tried(() => {
    const at = placed(args, host);
    const pid = pidOf(args.takeOver);
    const { spec, lines } = specOf(at, args, host);
    return { at, spec, sizing: lines, pid };
  });
  if (pid !== undefined) yield* takeOverConfirmed(pid, host);
  yield* tried(() => {
    writeUnit(at.file, at.system === 'systemd' ? unitText(spec) : plistText(spec));
    ops(at, host).installed();
  });
  const wrote = `wrote ${at.file} (${at.system}): runs ${spec.entry} from the checkout ${spec.checkout} with ${spec.node}`;
  const done =
    pid === undefined
      ? yield* tried(() => startedBeside(at, host))
      : yield* Effect.map(takeOver(pid, host, startedOf(at, host)), (taken) => ({
          did: 'taken' as const,
          holder: pid,
          lines: [`took the store over from pid ${pid}: ${at.unit} ticks it${taken.pid ? ` as pid ${taken.pid}` : ''}`],
        }));
  const lines = [wrote, ...sizing, ...done.lines, ...lingerLines(at, host)];
  return { name: at.name, system: at.system, file: at.file, checkout: spec.checkout, ...done, lines } satisfies Installed;
});

/** What `nemia service uninstall` did: the service removed, and how the lease stands after. */
export type Uninstalled = { readonly name: string; readonly file: string; readonly lines: readonly string[] };

/**
 * Removes the service: stops it (SIGTERM, which writes `stoppedAt` where it held the store), disables it and deletes its file. A daemon
 * that is not the service is left alone. Refused (`Missing`): no service of that name installed.
 */
export const uninstallService = Effect.fn('uninstallService')(function* (args: Args, given?: ServiceHost) {
  const host = given ?? liveHost(yield* StoreRoot);
  return yield* tried(() => {
    const at = placed(args, host);
    if (readUnit(at.file) === null)
      throw new Missing({
        message: `nemia service uninstall: no service ${at.name} is installed (no ${at.file}): there is nothing to remove.`,
      });
    const run = ops(at, host);
    run.remove();
    removeUnit(at.file);
    run.removed();
    const lines = [`stopped and removed ${at.unit} (${at.file})`, daemonLine(host.lease(), Date.now())];
    return { name: at.name, file: at.file, lines } satisfies Uninstalled;
  });
});

/** What `nemia service status` reads: the service, the lease, and lingering, and its lines. */
export type ServiceStatus = { readonly service: ServiceRead; readonly lines: readonly string[] };

/** The service as installed: what its file says it runs, and the checkout its entry is of. */
const installedRead = (at: Placed): ServiceRead['unit'] => {
  const text = readUnit(at.file);
  if (text === null) return null;
  const read = at.system === 'systemd' ? unitRead(text) : plistRead(text);
  const checkout = read.entry === undefined ? undefined : checkoutOf(read.entry);
  return { ...read, ...(checkout !== undefined ? { checkout } : {}) };
};

/** What an upgrade asks of the store's service: the system's word on it, the entry its file runs, its start and its log. */
export type ServiceForUpgrade = Started & { readonly state: UnitState | null; readonly entry: string | undefined };

/** The service `--name` names on this machine, as installed, or null where the machine, the store or the name has none to ask. */
export function serviceForUpgrade(args: Args, host: ServiceHost): ServiceForUpgrade | null {
  let at: Placed;
  try {
    at = placed(args, host);
  } catch {
    return null;
  }
  const unit = installedRead(at);
  if (unit === null) return null;
  return { state: stateOf(at, host), entry: unit.entry, ...startedOf(at, host) };
}

/**
 * What a restart asks of the service `--name` names: its name, unit and file, whether it is installed, the system's word on it, its start
 * and log.
 */
export type ServiceAt = Started & {
  readonly name: string;
  readonly unit: string;
  readonly file: string;
  readonly installed: boolean;
  readonly state: UnitState | null;
};

/** The service `--name` names on this machine; refused (`Invalid`) where there is no system to run one, or a name the store forbids. */
export function serviceAt(args: Args, host: ServiceHost): ServiceAt {
  const at = placed(args, host);
  const installed = readUnit(at.file) !== null;
  return { name: at.name, unit: at.unit, file: at.file, installed, state: installed ? stateOf(at, host) : null, ...startedOf(at, host) };
}

/** Reads the service and the lease, and names both: whether the service is installed and runs, what it runs, and who holds the store. */
export const serviceStatus = Effect.fn('serviceStatus')(function* (args: Args, given?: ServiceHost) {
  const host = given ?? liveHost(yield* StoreRoot);
  return yield* tried(() => {
    const at = placed(args, host);
    const unit = installedRead(at);
    const service: ServiceRead = { name: at.name, system: at.system, file: at.file, unit, state: unit === null ? null : stateOf(at, host) };
    const user = host.user().name;
    const lines = statusLines(service, host.lease(), at.system === 'systemd' ? host.linger(user) : undefined, {
      now: Date.now(),
      user,
      pause: host.standing(),
    });
    return { service, lines } satisfies ServiceStatus;
  });
});

/** Why a service command is the CLI's alone. */
const CLI_ONLY = { side: 'cli', why: "it writes or reads the person's login services, on the machine the command runs on" } as const;

/** `--name`, which every service command takes, and `nemia upgrade`. */
export const NAME_FLAG: Flag = {
  flag: '--name',
  kind: 'name',
  key: 'name',
  takes: '--name takes the service name, like --name nemia-trial.',
};

/** How each service command is typed, as its refusals end on it. */
const SHAPES = {
  install: 'nemia service install [--env KEY=VALUE ...] [--size auto] [--bind <addr>] [--name <name>] [--take-over <pid>]',
  uninstall: 'nemia service uninstall [--name <name>]',
  status: 'nemia service status [--name <name>]',
} as const;

/** `nemia service install`. */
const INSTALL: Command<Installed> = {
  name: 'service install',
  usage: '[--env KEY=VALUE ...] [--size auto] [--bind <addr>] [--name <name>] [--take-over <pid>]',
  help: [
    'install the daemon as a login service: a systemd user unit on Linux,',
    'a launchd agent on macOS. It runs the api of this checkout with this',
    'node, WF_ROOT and PATH, and each --env, written once; it restarts on',
    'failure and starts at login. Started now unless another daemon holds',
    'the store; --take-over <pid> pauses the store, waits for the calls',
    'in flight of its sessions, stops that pid and starts the service',
    '(checks and jobs run on, as nemia service restart --help says).',
    "--size auto: the sessions at once and each one's memory limit, read",
    'off this machine (WF_MAX_CONCURRENT, WF_MEMORY_LIMIT; no limit on',
    'macOS), each but one --env gives. --bind <addr>: the address the',
    'daemon listens on (NEMIA_BIND), and the store marked exposed',
    '(WF_EXPOSED=1), so every caller presents a token: nemia token add',
    'mints the first. --name: the service',
    'name (nemia; required for a store that is not the default)',
  ],
  spec: {
    positionals: [],
    flags: [
      { flag: '--env', kind: 'text', key: 'env', many: true, takes: `--env takes KEY=VALUE: ${SHAPES.install}.` },
      { flag: '--size', kind: 'name', key: 'size', takes: `--size takes auto: ${SHAPES.install}.` },
      {
        flag: '--bind',
        kind: 'text',
        key: 'bind',
        takes: `--bind takes the address to listen on, like --bind 0.0.0.0: ${SHAPES.install}.`,
      },
      NAME_FLAG,
      { flag: '--take-over', kind: 'name', key: 'takeOver', takes: `--take-over takes the holder's pid: ${SHAPES.install}.` },
    ],
    unknown: (arg) => `nemia service install does not take ${arg}: ${SHAPES.install}.`,
  },
  writes: true,
  class: 'ask',
  only: CLI_ONLY,
  handler: (args) =>
    Effect.flatMap(StoreRoot, (home) =>
      args.takeOver === undefined
        ? installService(args)
        : Effect.flatMap(timedHost(args, home, 'service install'), (host) => installService(args, host)),
    ),
  print: (data) => data.lines,
};

/** `nemia service uninstall`. */
const UNINSTALL: Command<Uninstalled> = {
  name: 'service uninstall',
  usage: '[--name <name>]',
  help: ['stop the login service, disable it and remove its file; a daemon', 'started by hand is left alone'],
  spec: { positionals: [], flags: [NAME_FLAG], unknown: (arg) => `nemia service uninstall does not take ${arg}: ${SHAPES.uninstall}.` },
  writes: true,
  class: 'ask',
  only: CLI_ONLY,
  handler: (args) => uninstallService(args),
  print: (data) => data.lines,
};

/** `nemia service status`. */
const STATUS: Command<ServiceStatus> = {
  name: 'service status',
  usage: '[--name <name>]',
  help: ['the login service and the lease: whether it is installed and runs,', 'the checkout it runs, who holds the store, and lingering'],
  spec: { positionals: [], flags: [NAME_FLAG], unknown: (arg) => `nemia service status does not take ${arg}: ${SHAPES.status}.` },
  writes: false,
  class: 'read',
  only: CLI_ONLY,
  handler: (args) => serviceStatus(args),
  print: (data) => data.lines,
};

/** The service's commands, in the order `nemia`'s help lists them. */
export const SERVICES: readonly Command[] = [INSTALL, UNINSTALL, STATUS];

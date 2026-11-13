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
  sessionsSliceOf,
  slicePathOf,
  sliceText,
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
import { memoryBytesOf } from 'agent-runtime/vocabulary';
import { cgroupParent, memoryReserved } from '../config/config.store.ts';
import { BIND_PUBLIC_VARIABLE, bindExposure, kindOfBind, machineAddresses, type MachineAddress } from './address.ts';

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

/**
 * The variables `--bind` writes: the address the daemon listens on, and the store marked exposed, so every caller presents a token; and
 * the acknowledgement `--public` writes beside them (`BIND_PUBLIC_VARIABLE`).
 */
const BIND_KEYS = ['NEMIA_BIND', 'WF_EXPOSED', BIND_PUBLIC_VARIABLE] as const;

/**
 * Whether `--bind` names an address the daemon listens on as its api reads `NEMIA_BIND` (`bindOf`, apps/api/src/port.ts): an IPv4
 * address, or an IPv6 one written bare, never a host name, brackets or a zone (`%eth0`), which the api refuses at every start.
 */
const bindable = (value: string): boolean => isIP(value) !== 0 && !value.includes('%');

/**
 * The variables `--size auto` writes, read off the machine's size (`sizedFor`), each but one `--env` gives (`given`): the sessions at once
 * and, but on launchd, which holds no per-session limit, each one's memory limit and request — the request left out where a limit `--env`
 * gives is under it, which the daemon would refuse; and its lines, the first saying the floor kept, its default (`WF_MEMORY_RESERVED`),
 * which none is written for. None without `--size`. Refused (`Invalid`): a `--size` other than `auto`, or a machine outside what Nemia
 * sizes (`sizeRefusal`).
 *
 * On systemd it also holds the sessions together to what the machine allocates (`sessionsCeiling`): the slice to write, and
 * `WF_CGROUP_PARENT` pointed at it.
 */
function sizedEnv(
  args: Args,
  at: Placed,
  host: ServiceHost,
  given: ReadonlyMap<string, string>,
): { env: [string, string][]; lines: string[]; slice: SliceFile | null } {
  if (args.size === undefined) return { env: [], lines: [], slice: null };
  if (args.size !== 'auto')
    throw new Invalid({
      message: `nemia service install: --size takes auto, which sizes the sessions to this machine: ${SHAPES.install}.`,
    });
  const machine = host.size();
  const wrong = sizeRefusal(machine);
  if (wrong !== null) throw new Invalid({ message: wrong });
  const sized = sizedFor(machine);
  const held = given.get('WF_MEMORY_LIMIT');
  const heldBytes = held === undefined ? undefined : memoryBytesOf(held.trim());
  const asks = heldBytes === undefined ? held === undefined : sized.memoryRequestMiB * 2 ** 20 <= heldBytes;
  const memory = at.system !== 'launchd';
  const env: [string, string][] = [
    ...(given.has('WF_MAX_CONCURRENT') ? [] : [['WF_MAX_CONCURRENT', String(sized.maxConcurrent)] as [string, string]]),
    ...(given.has('WF_MEMORY_LIMIT') || !memory ? [] : [['WF_MEMORY_LIMIT', `${sized.memoryLimitMiB}Mi`] as [string, string]]),
    ...(given.has('WF_MEMORY_REQUEST') || !memory || !asks
      ? []
      : [['WF_MEMORY_REQUEST', `${sized.memoryRequestMiB}Mi`] as [string, string]]),
  ];
  const ceiling = sessionsCeiling(at, host, machine, sized.memoryReservedMiB, given);
  env.push(...ceiling.env);
  const said = env.map(([k, v]) => `${k}=${v}`).join(', ');
  const kept = given.has('WF_MEMORY_RESERVED')
    ? 'the floor as --env gives it (WF_MEMORY_RESERVED)'
    : `${sized.memoryReservedMiB} MiB kept for the daemon and the machine (WF_MEMORY_RESERVED, its default, not written)`;
  return {
    env,
    lines: [
      `sized for ${machine.memoryMiB} MiB and ${machine.cpus} CPU: ${said || 'each variable as --env gives it'}; ${kept}`,
      ...(at.system === 'launchd'
        ? [
            'launchd holds no per-session memory limit and no slice: no WF_MEMORY_LIMIT, WF_MEMORY_REQUEST or WF_CGROUP_PARENT is written, and a session on macOS runs unbounded',
          ]
        : []),
      ...ceiling.lines,
    ],
    slice: ceiling.slice,
  };
}

/** A file install writes beside the unit: the sessions' slice, its path and its text. */
type SliceFile = { readonly file: string; readonly text: string };

/**
 * The sessions held together to what the machine allocates, on systemd: its memory less the floor kept, `WF_MEMORY_RESERVED` where
 * `--env` gives it (read by its own reader, whose refusal is let through) else the default (`reservedMiB`), in bytes. Where `--env`
 * gives no `WF_CGROUP_PARENT`, the service's own slice (`sessionsSliceOf`) at that ceiling, and `WF_CGROUP_PARENT` pointed at it;
 * where it gives one, that slice is the person's: no file, and a line naming how to give it its ceiling. Refused (`Invalid`): a floor
 * at or above the machine's memory, which leaves the sessions nothing. None on launchd, which holds no cgroup.
 */
function sessionsCeiling(
  at: Placed,
  host: ServiceHost,
  machine: MachineSize,
  reservedMiB: number,
  given: ReadonlyMap<string, string>,
): { env: [string, string][]; lines: string[]; slice: SliceFile | null } {
  if (at.system !== 'systemd') return { env: [], lines: [], slice: null };
  const totalBytes = machine.memoryMiB * 2 ** 20;
  const floor = memoryReserved({ WF_MEMORY_RESERVED: given.get('WF_MEMORY_RESERVED') });
  const floorBytes = (floor === undefined ? undefined : memoryBytesOf(floor)) ?? reservedMiB * 2 ** 20;
  if (floorBytes >= totalBytes)
    throw new Invalid({
      message: `nemia service install: --env WF_MEMORY_RESERVED=${floor ?? ''} keeps all of this machine's ${machine.memoryMiB} MiB, which leaves the sessions nothing: give --env WF_MEMORY_RESERVED a floor under it, or leave it out for an eighth of the machine.`,
    });
  const ceilingBytes = totalBytes - floorBytes;
  const ceilingSaid = `MemoryMax=${Math.floor(ceilingBytes / 2 ** 20)} MiB (${ceilingBytes} bytes), what the machine allocates to them: its memory less the floor kept`;
  if (given.has('WF_CGROUP_PARENT')) {
    const named = cgroupParent({ WF_CGROUP_PARENT: given.get('WF_CGROUP_PARENT') });
    return {
      env: [],
      lines: [
        named === undefined
          ? `the sessions run in the user manager's own slice (WF_CGROUP_PARENT as --env gives it), which nothing caps: leave --env WF_CGROUP_PARENT out to have install write ${sessionsSliceOf(at.name)}`
          : `the sessions run under ${named}, as --env gives it, which install does not write: systemctl --user set-property ${named} MemoryMax=${ceilingBytes} holds them together under ${ceilingSaid}`,
      ],
      slice: null,
    };
  }
  const slice = sessionsSliceOf(at.name);
  return {
    env: [['WF_CGROUP_PARENT', slice]],
    lines: [`wrote ${slicePathOf(at.name, host.dirs())}: the sessions run under ${slice}, held together under ${ceilingSaid}`],
    slice: { file: slicePathOf(at.name, host.dirs()), text: sliceText({ name: at.name, ceilingBytes }) },
  };
}

/**
 * The variables `--bind <addr>` writes (`BIND_KEYS`), with `--public`'s acknowledgement; none without it. Refused (`Invalid`): an address
 * that is none, a public or wildcard one without `--public` (`bindExposure`, as the api's start refuses it), `--public` without
 * `--bind`, or a variable `--env` gives too.
 */
function boundEnv(args: Args, given: ReadonlySet<string>): [string, string][] {
  const acknowledged = args.public === true;
  if (args.bind === undefined) {
    if (acknowledged)
      throw new Invalid({
        message: `nemia service install: --public acknowledges a public or wildcard --bind, and none was given: --bind <addr> --public, or leave --public out.`,
      });
    return [];
  }
  if (typeof args.bind !== 'string' || !bindable(args.bind))
    throw new Invalid({
      message: `nemia service install: --bind takes an IP address of this machine for the daemon to listen on, never a host name: --bind 100.64.0.7 for a private network's, --bind 0.0.0.0 --public for every interface, or --bind :: --public for every IPv6 one (no brackets). nemia service addresses lists this machine's.`,
    });
  const kind = kindOfBind(args.bind);
  if (bindExposure(kind, acknowledged) === 'unacknowledged')
    throw new Invalid({
      message: `nemia service install: --bind ${args.bind} is a ${kind} address, which anyone who reaches this machine's network can reach: add --public to acknowledge it (${BIND_PUBLIC_VARIABLE}=1 is written), or bind a private one, which nemia service addresses lists.`,
    });
  const twice = BIND_KEYS.find((k) => given.has(k));
  if (twice !== undefined)
    throw new Invalid({ message: `nemia service install: --bind writes ${twice}, and --env gives it too: give one of them.` });
  return [['NEMIA_BIND', args.bind], ['WF_EXPOSED', '1'], ...(acknowledged ? [[BIND_PUBLIC_VARIABLE, '1'] as [string, string]] : [])];
}

/**
 * The service's spec: the checkout's daemon under the installer's node (or the one the daemon carries), its store and `PATH`, what
 * `--size auto` and `--bind` write, then each `--env`, in the order given; and the lines the sizing says.
 */
function specOf(at: Placed, args: Args, host: ServiceHost): { spec: ServiceSpec; lines: string[]; slice: SliceFile | null } {
  const given = Array.isArray(args.env) ? (args.env as readonly string[]) : [];
  const wrong = envRefusal(given);
  if (wrong !== null) throw new Invalid({ message: wrong });
  const keys = new Set(envPairs(given).map(([k]) => k));
  const sized = sizedEnv(args, at, host, new Map(envPairs(given)));
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
  return { spec, lines: sized.lines, slice: sized.slice };
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
  const { at, spec, sizing, slice, pid } = yield* tried(() => {
    const at = placed(args, host);
    const pid = pidOf(args.takeOver);
    const { spec, lines, slice } = specOf(at, args, host);
    return { at, spec, sizing: lines, slice, pid };
  });
  if (pid !== undefined) yield* takeOverConfirmed(pid, host);
  yield* tried(() => {
    if (slice !== null) writeUnit(slice.file, slice.text);
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
 * Removes the service: stops it (SIGTERM, which writes `stoppedAt` where it held the store), disables it and deletes its file, and the
 * sessions' slice `--size auto` wrote beside it where there is one. A daemon
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
    const slice = at.system === 'systemd' ? slicePathOf(at.name, host.dirs()) : null;
    const sliceGone = slice !== null && removeUnit(slice);
    run.removed();
    const lines = [
      `stopped and removed ${at.unit} (${at.file})`,
      ...(sliceGone ? [`removed ${sessionsSliceOf(at.name)} (${slice}), the slice its sessions ran under`] : []),
      daemonLine(host.lease(), Date.now()),
    ];
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
  install: 'nemia service install [--env KEY=VALUE ...] [--size auto] [--bind <addr> [--public]] [--name <name>] [--take-over <pid>]',
  uninstall: 'nemia service uninstall [--name <name>]',
  status: 'nemia service status [--name <name>]',
  addresses: 'nemia service addresses [--json]',
} as const;

/** `nemia service install`. */
const INSTALL: Command<Installed> = {
  name: 'service install',
  usage: '[--env KEY=VALUE ...] [--size auto] [--bind <addr> [--public]] [--name <name>] [--take-over <pid>]',
  help: [
    'install the daemon as a login service: a systemd user unit on Linux,',
    'a launchd agent on macOS. It runs the api of this checkout with this',
    'node, WF_ROOT and PATH, and each --env, written once; it restarts on',
    'failure and starts at login. Started now unless another daemon holds',
    'the store; --take-over <pid> pauses the store, waits for the calls',
    'in flight of its sessions, stops that pid and starts the service',
    '(checks and jobs run on, as nemia service restart --help says).',
    "--size auto: the sessions at once and each one's memory limit and",
    'request, read off this machine (WF_MAX_CONCURRENT, WF_MEMORY_LIMIT,',
    'WF_MEMORY_REQUEST; neither memory one on macOS), each but one --env',
    'gives; the floor kept, WF_MEMORY_RESERVED, is its default (an eighth',
    'of the machine, 1 GiB at least). On systemd it also writes',
    '<name>-sessions.slice, its MemoryMax at the machine less that floor,',
    'and points WF_CGROUP_PARENT at it, so the sessions together are',
    'held to what the machine allocates (none written where --env gives',
    'WF_CGROUP_PARENT: a line names its set-property). --bind <addr>: the',
    'address the daemon listens on (NEMIA_BIND), and the store marked',
    'exposed (WF_EXPOSED=1), so every caller presents a token: nemia',
    'pairings approve and nemia board link hand out the first. A public or',
    'wildcard address is refused unless --public acknowledges it',
    "(NEMIA_BIND_PUBLIC=1); nemia service addresses lists this machine's.",
    '--name: the service name (nemia; required for a store that is not',
    'the default)',
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
        takes: `--bind takes the address to listen on, like --bind 100.64.0.7: ${SHAPES.install}.`,
      },
      { flag: '--public', kind: 'switch', key: 'public' },
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
  help: [
    'stop the login service, disable it and remove its file and the',
    "sessions' slice --size auto wrote; a daemon started by hand is left",
    'alone',
  ],
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

/** What `nemia service addresses` reads: this machine's addresses, each with its interface, family and kind, loopback first. */
export type Addresses = { readonly addresses: readonly MachineAddress[] };

/** `nemia service addresses [--json]`: this machine's addresses, one a line, `<address> <interface> <kind>`, or as JSON. */
export const ADDRESSES: Command<Addresses> = {
  name: 'service addresses',
  usage: '[--json]',
  help: [
    "this machine's addresses, loopback first, one a line: the address, its",
    'interface and its kind (loopback, private, shared, link-local,',
    'unique-local, public), so --bind takes a private one; --json prints',
    '{"addresses":[{"address","interface","family","kind"}]}',
  ],
  spec: {
    positionals: [],
    flags: [{ flag: '--json', kind: 'switch', key: 'json' }],
    unknown: (arg) => `nemia service addresses does not take ${arg}: ${SHAPES.addresses}.`,
  },
  writes: false,
  class: 'read',
  only: { side: 'cli', why: 'it reads the network interfaces of the machine the command runs on' },
  handler: () => Effect.sync(() => ({ addresses: machineAddresses(os.networkInterfaces()) })),
  print: (data, args) =>
    args.json === true
      ? [JSON.stringify({ addresses: data.addresses })]
      : data.addresses.map((a) => `${a.address} ${a.interface} ${a.kind}`),
};

/** The service's commands, in the order `nemia`'s help lists them. */
export const SERVICES: readonly Command[] = [INSTALL, UNINSTALL, STATUS];

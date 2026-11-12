/**
 * `nemia service restart`: the daemon that holds the store restarted on the code its service runs, as the take-over does it (`takeOver`) —
 * the store paused, the daemon's own sessions held and their calls in flight given up to the timeout (`--timeout <d>`, else the store's),
 * SIGTERM, the unit started once the system says it no longer runs the stopped daemon, and the store resumed once the new daemon has
 * completed its first pass. The jobs and the checks, a landing's wait on CI among them, run on through it on their workers and are not
 * waited for, and each session the daemon parked is resumed by the new one as the same try. Its waits are bounded: the timeout, then the
 * take-over's `stopMs` and `waitMs` (90 s and 60 s on the live host), then the new daemon's first pass; and its pause and drain end with
 * its command, however it ends, lifted by the daemon's next pass where it was killed. A daemon started by hand is not the service's to
 * start again: it is named, with the take-over that hands it to the service. The command the CLI serves alone, beside the service's others.
 */
import { StoreRoot } from '../config/root.store.ts';
import { Effect } from 'effect';
import type { Args } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { daemonLine } from '../daemon/daemon.ts';
import { readPause } from '../pause/pause.store.ts';
import { Conflict, Missing } from '../refusal/refusal.ts';
import { tried } from '../runtime-client.ts';
import { holderOfLease, takeOverLine } from './service.ts';
import { timeoutFlag } from '../pause/pause.ts';
import { ADDRESSES, timedHost, liveHost, NAME_FLAG, serviceAt, SERVICES, type ServiceAt, type ServiceHost } from './service.verb.ts';
import { startedPassed, takeOver } from './takeover.verb.ts';

/** The command a restart's pause and lines name. */
const BY = 'nemia service restart';

/** How the command is typed, as its refusals end on it. */
const SHAPE = 'nemia service restart [--name <name>] [--timeout <d>]';

/** What `nemia service restart` did: the service, the pid that ticks the store now, whether a person's pause stood, and its lines. */
export type Restarted = {
  readonly name: string;
  readonly did: 'restarted' | 'started';
  readonly pid: number | null;
  readonly paused: boolean;
  readonly lines: readonly string[];
};

/**
 * Where the service and the lease leave a restart: the service's daemon ticking (`restart` its pid), nothing ticking (`start`), or
 * refused (`Missing`: no service installed, naming the take-over where a daemon ticks the store; `Conflict`: a daemon that is not the
 * service's holds the store, or one is stalled). A start carries `old`, the daemon that let the store go and is still the unit's main
 * process, which the start waits for the unit to end (`startedPassed`).
 */
function planOf(service: ServiceAt, host: ServiceHost): { kind: 'restart'; pid: number } | { kind: 'start'; old: number | null } {
  const lease = host.lease();
  if (!service.installed)
    throw new Missing({
      message: `${BY}: no service ${service.name} is installed (no ${service.file}): ${
        lease.kind === 'ticking'
          ? `pid ${lease.file.pid} holds the store: ${takeOverLine(lease.file.pid, service.name)} writes the service and hands the store to it.`
          : 'nemia service install writes and starts it.'
      }`,
    });
  if (lease.kind === 'stalled')
    throw new Conflict({
      message: `${BY}: ${daemonLine(lease, Date.now())}. Stop it, then ${SHAPE} starts the service.`,
    });
  const holder = holderOfLease(lease, service.state);
  if (lease.kind === 'ticking' && holder === 'service') return { kind: 'restart', pid: lease.file.pid };
  if (lease.kind === 'ticking')
    throw new Conflict({
      message: `${BY}: pid ${lease.file.pid} holds the store and is not ${service.unit}'s process, so it cannot be started again: ${takeOverLine(lease.file.pid, service.name)} hands the store to the service, which ${BY} restarts from then on.`,
    });
  return { kind: 'start', old: lease.kind === 'stopped' && service.state?.pid === lease.file.pid ? lease.file.pid : null };
}

/** The line said after a restart where a person's pause stood through it. */
const PAUSE_STOOD = 'the pause that stood is left as it was: nemia resume lifts it';

/**
 * Restarts the service's daemon (`takeOver`), or starts the service where nothing ticks the store (`startedPassed`), and answers once the
 * new daemon has completed its first pass, saying whether a person's pause stands (`readPause`). Refused before anything is done: no
 * system or a name the store forbids (`Invalid`), no service installed (`Missing`), a daemon not the service's or stalled holding the
 * store (`Conflict`); and after, as the take-over refuses (`Conflict`): a daemon that does not stop, a service that does not tick the
 * store, or a first pass that fails — naming the log.
 */
export const restartService = Effect.fn('restartService')(function* (args: Args, given?: ServiceHost) {
  const home = yield* StoreRoot;
  const host = given ?? liveHost(yield* StoreRoot);
  const { service, plan } = yield* tried(() => {
    const service = serviceAt(args, host);
    return { service, plan: planOf(service, host) };
  });
  if (plan.kind === 'start') {
    const paused = yield* tried(() => readPause(home) !== null);
    const pid = yield* startedPassed(host, service, BY, plan.old, paused ? PAUSE_STOOD : 'the store is as it was');
    const lines = [
      `started ${service.unit}, which ticks the store${pid ? ` as pid ${pid}` : ''} and has completed its first pass`,
      ...(paused ? [PAUSE_STOOD] : []),
    ];
    return { name: service.name, did: 'started', pid, paused, lines } satisfies Restarted;
  }
  const taken = yield* takeOver(plan.pid, host, service, BY);
  const lines = [
    `restarted ${service.unit}: pid ${plan.pid} stopped, and ${taken.pid ? `pid ${taken.pid}` : 'its new daemon'} ticks the store and has completed its first pass`,
    ...(taken.paused ? [PAUSE_STOOD] : []),
  ];
  return { name: service.name, did: 'restarted', pid: taken.pid, paused: taken.paused, lines } satisfies Restarted;
});

/** `nemia service restart`. */
const RESTART: Command<Restarted> = {
  name: 'service restart',
  usage: '[--name <name>] [--timeout <d>]',
  help: [
    "restart the service's daemon on the code it runs: pause the store, give",
    "the daemon's sessions up to the timeout to end their tool calls",
    '(--timeout <d>, else nemia pause-timeout, 10m by default), stop it (up to',
    '90s, and until the unit has ended its process), start the service (up to',
    '60s), and resume once the new daemon has completed its first pass;',
    'refused, naming the log, when that pass fails, and naming the command',
    'that starts the service when it is not running.',
    'Jobs and checks, a landing waiting on CI among them, run on and are not',
    'waited for; each session parks and resumes as the same try. Each wait is',
    "said on stderr as it waits. A pause a person put stands; the restart's",
    'own ends with the command: killed, the next pass of the daemon lifts it.',
    'Starts the service where nothing ticks; a daemon started by hand is',
    "named with --take-over's line",
  ],
  spec: { positionals: [], flags: [NAME_FLAG, timeoutFlag(SHAPE)], unknown: (arg) => `${BY} does not take ${arg}: ${SHAPE}.` },
  writes: true,
  class: 'ask',
  only: { side: 'cli', why: "it restarts the person's login service, on the machine the command runs on" },
  handler: (args) =>
    Effect.flatMap(StoreRoot, (home) => Effect.flatMap(timedHost(args, home, 'service restart'), (host) => restartService(args, host))),
  print: (data) => data.lines,
};

/** The restart's command. */
export const RESTARTS: readonly Command[] = [RESTART];

/** Every command of the login service, as the command table lists them: install, uninstall, status, restart, then addresses. */
export const SERVICE_COMMANDS: readonly Command[] = [...SERVICES, ...RESTARTS, ADDRESSES];

/**
 * Which way a `nemia` command goes (apps/cli, src/route.ts, `routeOf`): to the api over HTTP, for a read this client has moved and for the
 * client's own verbs, or to the orchestrator's own CLI in a process of its own, for every other verb, a help, and any moved read typed
 * with `--local`. Reads move first and writes keep their path until a later card moves each (the intent's Q5); `--local` reads a store
 * that is not served (Q14).
 *
 * The client's own verbs (`CLIENT_VERBS`: `get`, `apply`, `explain`, resource-objects' decision 5, `propose` and `proposals`, a
 * change of a factory's definitions proposed and judged, and `decide`, the one decide read model the api serves, read and prompted on
 * here — the untangle intent's Q14) are verbs the orchestrator's table has none of: they ask the api alone, whatever else is typed, and
 * say their own help and refuse `--local` themselves.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** The reads this client asks the api for, which the orchestrator's CLI answers too. */
export const READ_VERBS = ['show', 'closeout', 'ls', 'inbox', 'watch'] as const;

/** A read this client asks the api for. */
export type ReadVerb = (typeof READ_VERBS)[number];

/** The verbs this client alone has, generic over every kind the api serves: no process answers them. */
export const CLIENT_VERBS = ['get', 'apply', 'explain', 'propose', 'proposals', 'decide'] as const;

/** One of `CLIENT_VERBS`. */
export type ClientVerb = (typeof CLIENT_VERBS)[number];

/**
 * The verbs about the machine this client runs on, never a remote daemon's (the distribution intent's Q6): its login service, its
 * releases, a daemon of its own, what it runs, the person's tokens of its store and its Claude token. Each runs on the old path,
 * whatever context is in use.
 */
export const MACHINE_VERBS = ['service', 'upgrade', 'up', 'tick', 'version', 'token', 'claude-token'] as const;

/** One of `MACHINE_VERBS`. */
export type MachineVerb = (typeof MACHINE_VERBS)[number];

/**
 * Where a command goes: the api, the orchestrator's CLI in a process of its own, or refused — a verb about the store that only the
 * old path has yet, typed while a context names a remote daemon, which that path cannot reach (refused naming the context to leave,
 * `nemia config use-context`, or the machine to run it on).
 */
export type Route = 'api' | 'process' | 'refused';

/**
 * A command as the route reads it: the name it opens with, whether `--local` was typed, whether it asks for its help, and whether the
 * context in use names a remote daemon (`remote`; absent, none: the store of this machine). Implement makes `remote` required once
 * `src/main.ts` reads the context.
 */
export type Routed = { readonly name: string; readonly local: boolean; readonly help: boolean; readonly remote?: boolean };

/** Whether `name` is one of `READ_VERBS`. */
const reads: readonly string[] = READ_VERBS;
const moved = (name: string): boolean => reads.includes(name);

/** Whether `name` is one of `CLIENT_VERBS`. */
const clients: readonly string[] = CLIENT_VERBS;
const own = (name: string): boolean => clients.includes(name);

/** Whether `name` is one of `MACHINE_VERBS`. */
const machines: readonly string[] = MACHINE_VERBS;
const ofTheMachine = (name: string): boolean => machines.includes(name);

/** Whether the context in use names a remote daemon. */
const remote = (command: Routed): boolean => command.remote === true;

/** Whether `command` is a verb about the store that only the old path has, typed against a remote daemon, asking no help. */
const unreachable = (command: Routed): boolean =>
  remote(command) && !moved(command.name) && !own(command.name) && !ofTheMachine(command.name) && !command.help;

const routeSpec = spec<(command: Routed) => Route>({
  ensures: {
    writesStayInProcess: {
      description:
        'A verb that is neither a moved read nor one of the client’s own runs on the old path, in a process of its own, unless it is about the store and the context is remote',
      condition: ({ input: [command], output }) =>
        moved(command.name) || own(command.name) || unreachable(command) || output === 'process',
    },
    machineVerbsStayHere: {
      description: 'A verb about this machine runs on the old path here, whatever context is in use',
      condition: ({ input: [command], output }) => !ofTheMachine(command.name) || output === 'process',
    },
    remoteStoreVerbsAreRefused: {
      description:
        'A verb about the store only the old path has, typed while the context names a remote daemon, is refused rather than run on this machine’s store',
      condition: ({ input: [command], output }) => !unreachable(command) || output === 'refused',
    },
    onlyARemoteStoreVerbIsRefused: {
      description: 'Nothing else is refused: a command on this machine’s store always goes somewhere',
      condition: ({ input: [command], output }) => unreachable(command) || output !== 'refused',
    },
    localReadsInProcess: {
      description: 'A moved read typed with --local reads the store in process, never the api',
      condition: ({ input: [command], output }) => !moved(command.name) || !command.local || output === 'process',
    },
    helpIsTheTables: {
      description: 'A help of a verb the orchestrator’s table holds is the table’s one help, printed by the old path',
      condition: ({ input: [command], output }) => own(command.name) || !command.help || output === 'process',
    },
    movedReadsAskTheApi: {
      description: 'A moved read, without --local and asking no help, asks the api',
      condition: ({ input: [command], output }) => !moved(command.name) || command.local || command.help || output === 'api',
    },
    clientVerbsAskTheApi: {
      description: 'A verb of the client’s own goes to the client whatever else is typed: no process has it',
      condition: ({ input: [command], output }) => !own(command.name) || output === 'api',
    },
  },
});
export type RouteOf = Implementation<typeof routeSpec>;

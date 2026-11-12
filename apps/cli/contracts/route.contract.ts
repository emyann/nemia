/**
 * Which way a `nemia` command goes (apps/cli, src/route.ts, `routeOf`): to the api over HTTP, for a read this client has moved and for the
 * client's own verbs; to the orchestrator's own CLI in a process of its own, for every other verb, a help, and any moved read typed
 * with `--local`; and, under a context that names a remote daemon, to that same CLI forwarded to the daemon (`forwarded`: spawned with
 * the context's server and token, it parses, checks and prints as ever, and calls each command's endpoint there in place of its
 * handler). Reads move first and writes keep their path until a later card moves each (the intent's Q5); `--local` reads a store
 * that is not served (Q14).
 *
 * The client's own verbs (`CLIENT_VERBS`: `get`, `apply`, `explain`, resource-objects' decision 5, `propose` and `proposals`, a
 * change of a factory's definitions proposed and judged, and `decide`, the one decide read model the api serves, read and prompted on
 * here — the untangle intent's Q14) are verbs the orchestrator's table has none of: they ask the api alone, whatever else is typed, and
 * say their own help and refuse `--local` themselves.
 *
 * A verb about this machine (`MACHINE_VERBS`, the distribution intent's Q6) runs on this machine whatever the context: its login
 * service, its releases, a daemon of its own, a pass, its tokens, and the files it reads and writes and no store (`template`,
 * `frontmatter`, `admit`). Nothing is refused here any more: the forwarded CLI refuses, in its own words, a command no endpoint serves.
 *
 * The verb lists, `Route` and `Routed` are `src/route.ts`'s, imported here: no shipped source reads a value of a contract, which loads
 * the verifier (`tools/guards/test/no-contract-values.test.ts`).
 */
import { type Implementation, spec } from '@emyann/tsverify';
import { CLIENT_VERBS, MACHINE_VERBS, READ_VERBS, type Route, type Routed } from '../src/route.ts';

/** Whether `name` is one of `READ_VERBS`. */
const reads: readonly string[] = READ_VERBS;
const moved = (name: string): boolean => reads.includes(name);

/** Whether `name` is one of `CLIENT_VERBS`. */
const clients: readonly string[] = CLIENT_VERBS;
const own = (name: string): boolean => clients.includes(name);

/** Whether `name` is one of `MACHINE_VERBS`. */
const machines: readonly string[] = MACHINE_VERBS;
const ofTheMachine = (name: string): boolean => machines.includes(name);

/**
 * Whether `command` is a verb about the store that only the old path has, typed while the context names a remote daemon, asking no
 * help: the old path, forwarded to that daemon, runs it there.
 */
const forwardable = (command: Routed): boolean =>
  command.remote && !moved(command.name) && !own(command.name) && !ofTheMachine(command.name) && !command.help;

const routeSpec = spec<(command: Routed) => Route>({
  ensures: {
    writesStayOnTheOldPath: {
      description:
        'A verb that is neither a moved read nor one of the client’s own runs on the old path: in process on this machine’s store, or forwarded to the remote daemon the context names',
      condition: ({ input: [command], output }) =>
        moved(command.name) || own(command.name) || output === 'process' || output === 'forwarded',
    },
    machineVerbsStayHere: {
      description: 'A verb about this machine runs on the old path here, whatever context is in use',
      condition: ({ input: [command], output }) => !ofTheMachine(command.name) || output === 'process',
    },
    remoteStoreVerbsAreForwarded: {
      description:
        'A verb about the store only the old path has, typed while the context names a remote daemon, is forwarded to that daemon rather than run on this machine’s store',
      condition: ({ input: [command], output }) => !forwardable(command) || output === 'forwarded',
    },
    onlyARemoteStoreVerbIsForwarded: {
      description: 'Nothing else is forwarded: this machine’s context, a help, a machine verb and a verb of the api never are',
      condition: ({ input: [command], output }) => forwardable(command) || output !== 'forwarded',
    },
    localReadsInProcess: {
      description: 'A moved read typed with --local reads this machine’s store in process, never the api, whatever the context',
      condition: ({ input: [command], output }) => !moved(command.name) || !command.local || output === 'process',
    },
    helpIsTheTables: {
      description: 'A help of a verb the orchestrator’s table holds is the table’s one help, printed by the old path here',
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

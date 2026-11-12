/**
 * Which way a `nemia` command goes (apps/cli, src/route.ts, `routeOf`): to the client, which asks the api over HTTP (`api`), for a read
 * this client has moved, for the client's own verbs, and for a command whose words the client holds (`MOVED_COMMANDS`, the names of
 * `objects`' command words: parsed, helped, worded and printed here, under every context); to the orchestrator's own CLI in a process of
 * its own, for every other verb and a help of one; under a context that names a remote daemon, to that same CLI forwarded to the daemon
 * (`forwarded`: spawned with the context's server and token, it calls each command's endpoint there in place of its handler), for a verb
 * about the store only that path has, until the last slice retires it; and refused (`refused`) where `--local` is typed, which no longer
 * reads a store in process (the api-consumer intent's Q2): `local` is the daemon on this machine, reached through its api like any other.
 *
 * Verbs move a slice at a time (the api-consumer intent's Q6): a command joins `MOVED_COMMANDS` when its words move into `objects` and
 * its runner into this client, and its old path's words are deleted with the move (Q5), so no command has two paths at once.
 *
 * A verb about this machine (`MACHINE_VERBS`, the distribution intent's Q6) runs on this machine whatever the context: its login
 * service, its releases, a daemon of its own, a pass, its tokens, and the files it reads and writes and no store (`template`,
 * `frontmatter`, `admit`). `nemia upgrade` is among them as before: it upgrades this machine's install under every context, a remote
 * one included. The server a context names is upgraded by another verb, `nemia server upgrade [<tag> | --back]`: `server`, one of the
 * client's own verbs (`CLIENT_VERBS`), asks that server's api (`POST /api/upgrades`) under every context, its help included, by the
 * laws for a client verb below (`clientVerbsAskTheApi`), so the same words never upgrade one machine under one context and another
 * under the next.
 *
 * The verb lists, `Route` and `Routed` are `src/route.ts`'s, imported here: no shipped source reads a value of a contract, which loads
 * the verifier (`tools/guards/test/no-contract-values.test.ts`).
 */
import { type Implementation, spec } from '@emyann/tsverify';
import { CLIENT_VERBS, MACHINE_VERBS, MOVED_COMMANDS, READ_VERBS, type Route, type Routed } from '../src/route.ts';

/** Whether `name` is one of `READ_VERBS`: a read the client asks the api for, whose words and help are still the old path's. */
const reads: readonly string[] = READ_VERBS;
const movedRead = (name: string): boolean => reads.includes(name);

/** Whether `name` is one of `MOVED_COMMANDS`: a command whose words the client holds, help included. */
const commands: readonly string[] = MOVED_COMMANDS;
const theClients = (name: string): boolean => commands.includes(name);

/** Whether `name` is one of `CLIENT_VERBS`. */
const clients: readonly string[] = CLIENT_VERBS;
const own = (name: string): boolean => clients.includes(name);

/** Whether `name` is one of `MACHINE_VERBS`. */
const machines: readonly string[] = MACHINE_VERBS;
const ofTheMachine = (name: string): boolean => machines.includes(name);

/** Whether `name` is answered by this client: one of its own verbs, or a command whose words it holds. */
const answeredHere = (name: string): boolean => own(name) || theClients(name);

/**
 * Whether `command` is a verb about the store that only the old path has, typed while the context names a remote daemon, asking no
 * help and without `--local`: the old path, forwarded to that daemon, runs it there.
 */
const forwardable = (command: Routed): boolean =>
  command.remote &&
  !command.local &&
  !movedRead(command.name) &&
  !answeredHere(command.name) &&
  !ofTheMachine(command.name) &&
  !command.help;

const routeSpec = spec<(command: Routed) => Route>({
  ensures: {
    localIsRefused: {
      description: 'A command typed with --local is refused, whatever it names and whatever the context: no store is read in process',
      condition: ({ input: [command], output }) => !command.local || output === 'refused',
    },
    onlyLocalIsRefused: {
      description: 'Nothing but --local is refused by the route: every other command goes somewhere',
      condition: ({ input: [command], output }) => command.local || output !== 'refused',
    },
    movedCommandsAreTheClients: {
      description:
        'A command whose words the client holds is parsed, helped, run and printed by the client through the api, under every context, its help included',
      condition: ({ input: [command], output }) => command.local || !theClients(command.name) || output === 'api',
    },
    clientVerbsAskTheApi: {
      description: 'A verb of the client’s own goes to the client whatever else is typed: no process has it',
      condition: ({ input: [command], output }) => command.local || !own(command.name) || output === 'api',
    },
    movedReadsAskTheApi: {
      description: 'A moved read asking no help asks the api',
      condition: ({ input: [command], output }) => command.local || !movedRead(command.name) || command.help || output === 'api',
    },
    helpIsTheTables: {
      description: 'A help of a verb whose words the old path still holds is that table’s one help, printed by the old path here',
      condition: ({ input: [command], output }) => command.local || answeredHere(command.name) || !command.help || output === 'process',
    },
    machineVerbsStayHere: {
      description: 'A verb about this machine runs on the old path here, whatever context is in use',
      condition: ({ input: [command], output }) => command.local || !ofTheMachine(command.name) || output === 'process',
    },
    writesStayOnTheOldPath: {
      description:
        'A verb that is neither a moved read, one of the client’s own, nor a command whose words the client holds runs on the old path: in process here, or forwarded to the remote daemon the context names',
      condition: ({ input: [command], output }) =>
        command.local || movedRead(command.name) || answeredHere(command.name) || output === 'process' || output === 'forwarded',
    },
    remoteStoreVerbsAreForwarded: {
      description:
        'A verb about the store only the old path has, typed while the context names a remote daemon, is forwarded to that daemon rather than run on this machine’s store',
      condition: ({ input: [command], output }) => !forwardable(command) || output === 'forwarded',
    },
    onlyARemoteStoreVerbIsForwarded: {
      description:
        'Nothing else is forwarded: this machine’s context, a help, a machine verb, --local and a command the client answers never are',
      condition: ({ input: [command], output }) => forwardable(command) || output !== 'forwarded',
    },
  },
});
export type RouteOf = Implementation<typeof routeSpec>;

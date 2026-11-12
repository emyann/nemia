/**
 * Which way a `nemia` command goes (apps/cli, src/route.ts, `routeOf`): to the client, which asks the api over HTTP (`api`), for a read
 * this client asks for (`READ_VERBS`), for the client's own verbs, and for a command whose words the client holds (`MOVED_COMMANDS`, the
 * names of `objects`' command words: parsed, helped, worded and printed here, under every context); to the orchestrator's own CLI in a
 * process of its own on this machine (`process`), for a verb about this machine (`MACHINE_VERBS`), a help of one, and, under this
 * machine's context, any word no list holds, which that CLI refuses in its own words; and refused (`refused`) where `--local` is typed,
 * which no longer reads a store in process (the api-consumer intent's Q2), and where a context names a remote daemon and the word is
 * none the client answers and no verb of this machine: no command line is forwarded to another machine's api any more, so nothing typed
 * under a remote context can reach this machine's store.
 *
 * Verbs moved a slice at a time (the api-consumer intent's Q6): a command joins `MOVED_COMMANDS` when its words move into `objects` and
 * its runner into this client, and its old path's words are deleted with the move (Q5), so no command has two paths at once. Forwarding
 * retired last, once every store verb had moved.
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

/** Whether `name` is one of `READ_VERBS`: a read the client asks the api for, whose help is still the old path's. */
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
 * Whether `command`, typed while the context names a remote daemon and asking no help, is a word the client does not answer and that is
 * no verb of this machine: the old path would read this machine's store with it, and no path reaches the remote daemon's.
 */
const stranded = (command: Routed): boolean =>
  command.remote && !command.help && !movedRead(command.name) && !answeredHere(command.name) && !ofTheMachine(command.name);

const routeSpec = spec<(command: Routed) => Route>({
  ensures: {
    localIsRefused: {
      description: 'A command typed with --local is refused, whatever it names and whatever the context: no store is read in process',
      condition: ({ input: [command], output }) => !command.local || output === 'refused',
    },
    refusedIsLocalOrStranded: {
      description:
        'A command is refused only for --local, or for a word typed under a remote context that neither the client answers nor this machine owns',
      condition: ({ input: [command], output }) => output !== 'refused' || command.local || stranded(command),
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
    nothingIsForwarded: {
      description: 'No command line is forwarded to another machine’s api: the client asks the api itself, or the old path runs here',
      condition: ({ output }) => output !== 'forwarded',
    },
    strandedIsRefused: {
      description:
        'A word typed under a remote context that the client does not answer and this machine does not own is refused, never run on this machine’s store',
      condition: ({ input: [command], output }) => command.local || !stranded(command) || output === 'refused',
    },
    theOldPathIsThisMachines: {
      description:
        'The old path runs a command only where it reads no remote daemon’s store: under this machine’s context, for a help, or for a verb about this machine',
      condition: ({ input: [command], output }) => output !== 'process' || !command.remote || command.help || ofTheMachine(command.name),
    },
    unheldHereIsTheOldPaths: {
      description:
        'Under this machine’s context, a word the client does not answer goes to the old path here, which runs it if it is a verb of this machine and refuses it in its own words if not',
      condition: ({ input: [command], output }) =>
        command.local || command.remote || answeredHere(command.name) || (movedRead(command.name) && !command.help) || output === 'process',
    },
  },
});
export type RouteOf = Implementation<typeof routeSpec>;

/**
 * Which way a `nemia` command goes (apps/cli, src/route.ts, `routeOf`): to the api over HTTP, for a read this client has moved and for the
 * client's own verbs, or to the orchestrator's own CLI in a process of its own, for every other verb, a help, and any moved read typed
 * with `--local`. Reads move first and writes keep their path until a later card moves each (the intent's Q5); `--local` reads a store
 * that is not served (Q14).
 *
 * The client's own verbs (`CLIENT_VERBS`: `get`, `apply`, `explain`, resource-objects' decision 5) are verbs the orchestrator's table
 * has none of: they ask the api alone, whatever else is typed, and say their own help and refuse `--local` themselves.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** The reads this client asks the api for, which the orchestrator's CLI answers too. */
export const READ_VERBS = ['show', 'closeout', 'ls', 'inbox', 'watch'] as const;

/** A read this client asks the api for. */
export type ReadVerb = (typeof READ_VERBS)[number];

/** The verbs this client alone has, generic over every kind the api serves: no process answers them. */
export const CLIENT_VERBS = ['get', 'apply', 'explain'] as const;

/** One of `CLIENT_VERBS`. */
export type ClientVerb = (typeof CLIENT_VERBS)[number];

/** Where a command goes: the api, or the orchestrator's CLI in a process of its own. */
export type Route = 'api' | 'process';

/** A command as the route reads it: the name it opens with, whether `--local` was typed, and whether it asks for its help. */
export type Routed = { readonly name: string; readonly local: boolean; readonly help: boolean };

/** Whether `name` is one of `READ_VERBS`. */
const moved = (name: string): boolean => name === 'show' || name === 'closeout' || name === 'ls' || name === 'inbox' || name === 'watch';

/** Whether `name` is one of `CLIENT_VERBS`. */
const own = (name: string): boolean => name === 'get' || name === 'apply' || name === 'explain';

const routeSpec = spec<(command: Routed) => Route>({
  ensures: {
    writesStayInProcess: {
      description: 'A verb that is neither a moved read nor one of the client’s own runs on the old path, in a process of its own',
      condition: ({ input: [command], output }) => moved(command.name) || own(command.name) || output === 'process',
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

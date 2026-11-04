/**
 * Which way a `nemia` command goes (apps/cli, src/route.ts, `routeOf`): to the api over HTTP, for a read this client has moved, or to the
 * orchestrator's own CLI in a process of its own, for every other verb, a help, and any read typed with `--local`. Reads move first and
 * writes keep their path until a later card moves each (the intent's Q5); `--local` reads a store that is not served (Q14).
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** The reads this client asks the api for. */
export const READ_VERBS = ['show', 'closeout', 'ls', 'inbox', 'watch'] as const;

/** A read this client asks the api for. */
export type ReadVerb = (typeof READ_VERBS)[number];

/** Where a command goes: the api, or the orchestrator's CLI in a process of its own. */
export type Route = 'api' | 'process';

/** A command as the route reads it: the name it opens with, whether `--local` was typed, and whether it asks for its help. */
export type Routed = { readonly name: string; readonly local: boolean; readonly help: boolean };

/** Whether `name` is one of `READ_VERBS`. */
const moved = (name: string): boolean => name === 'show' || name === 'closeout' || name === 'ls' || name === 'inbox' || name === 'watch';

const routeSpec = spec<(command: Routed) => Route>({
  ensures: {
    writesStayInProcess: {
      description: 'A verb that is not a moved read runs on the old path, in a process of its own',
      condition: ({ input: [command], output }) => moved(command.name) || output === 'process',
    },
    localReadsInProcess: {
      description: 'A read typed with --local reads the store in process, never the api',
      condition: ({ input: [command], output }) => !command.local || output === 'process',
    },
    helpIsTheTables: {
      description: 'A help is the table’s one help, printed by the old path',
      condition: ({ input: [command], output }) => !command.help || output === 'process',
    },
    movedReadsAskTheApi: {
      description: 'A moved read, without --local and asking no help, asks the api',
      condition: ({ input: [command], output }) => !moved(command.name) || command.local || command.help || output === 'api',
    },
  },
});
export type RouteOf = Implementation<typeof routeSpec>;

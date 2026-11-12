/**
 * Which daemon a `nemia` command asks (apps/cli, src/context.ts, `contextOf`), kubectl's way: the client's config file holds named
 * contexts, each a remote daemon's address and a person's token for it, and the one in use (`current-context`, set by `nemia config
 * use-context <name>`); `NEMIA_CONTEXT` names one for a single command, over the file's. Where none is named, or the name is `local`,
 * the command acts on this machine's store, as it does today (the lease's url, a daemon started on demand). A name the file does not
 * hold is refused, naming `nemia config get-contexts`: read as this machine's store, a command meant for the remote daemon would act
 * on the wrong one.
 *
 * `asked` is the name `NEMIA_CONTEXT` holds as its reader hands it on, trimmed (`chosenOf`): the laws read it as given, since the solver
 * decides no law over `String.prototype.trim` (each came back unknown, out of work, at the default budget).
 */
import { type Implementation, spec } from '@emyann/tsverify';
import { type Chosen, type ClientConfig, type Context, LOCAL_CONTEXT } from '../src/context.ts';

/** The name a command asks for: `NEMIA_CONTEXT` where it is set and not empty, else the file's own. */
const named = (config: ClientConfig, asked: string | undefined): string | undefined =>
  asked !== undefined && asked !== '' ? asked : config.current;

/** The context of `name` in the file, if it holds one. */
const held = (config: ClientConfig, name: string): Context | undefined => config.contexts.find((c) => c.name === name);

const contextOfSpec = spec<(config: ClientConfig, asked: string | undefined) => Chosen>({
  ensures: {
    noNameIsThisMachine: {
      description: 'With no context named, by the variable or the file, a command acts on this machine’s store',
      condition: ({ input: [config, asked], output }) => named(config, asked) !== undefined || output.kind === 'local',
    },
    localIsThisMachine: {
      description: 'The name local always means this machine’s store',
      condition: ({ input: [config, asked], output }) => named(config, asked) !== LOCAL_CONTEXT || output.kind === 'local',
    },
    theVariableWins: {
      description: 'A context named by NEMIA_CONTEXT is the one asked for, over the file’s own',
      condition: ({ input: [, asked], output }) =>
        asked === undefined || asked === '' || asked === LOCAL_CONTEXT || (output.kind !== 'local' && output.name === asked),
    },
    aHeldContextIsAsked: {
      description: 'A context the file holds is asked at its own address with its own token',
      condition: ({ input: [config, asked], output }) => {
        const name = named(config, asked);
        if (name === undefined || name === LOCAL_CONTEXT) return true;
        const context = held(config, name);
        return context === undefined || (output.kind === 'remote' && output.server === context.server && output.token === context.token);
      },
    },
    anUnheldNameIsRefused: {
      description: 'A name the file does not hold is refused, never read as this machine’s store',
      condition: ({ input: [config, asked], output }) => {
        const name = named(config, asked);
        if (name === undefined || name === LOCAL_CONTEXT) return true;
        return held(config, name) !== undefined || (output.kind === 'refused' && output.name === name);
      },
    },
  },
});

/** `contextOf`'s type, which `src/context.ts` takes: it then imports nothing of tsverify. */
export type ContextOf = Implementation<typeof contextOfSpec>;

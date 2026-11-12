/**
 * Which daemon a `nemia` command asks (apps/cli, src/context.ts, `contextOf`), kubectl's way: the client's config file holds named
 * contexts, each a remote daemon's address and a person's token for it, and the one in use (`current-context`, set by `nemia config
 * use-context <name>`); `NEMIA_CONTEXT` names one for a single command, over the file's. Where none is named, or the name is `local`,
 * the command acts on this machine's store, as it does today (the lease's url, a daemon started on demand). A name the file does not
 * hold is refused, naming `nemia config get-contexts`: read as this machine's store, a command meant for the remote daemon would act
 * on the wrong one.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** The name that always means this machine's store, whatever the file holds. */
export const LOCAL_CONTEXT = 'local';

/** A context of the client's config: its name, the daemon's address (`http(s)://host:port`) and a person's token for it. */
export type Context = { readonly name: string; readonly server: string; readonly token: string };

/** The client's config as read: its contexts and the name of the one in use, if any. */
export type ClientConfig = { readonly contexts: readonly Context[]; readonly current: string | undefined };

/** Which daemon a command asks: this machine's store, a remote daemon by its context, or refused for a name the file does not hold. */
export type Chosen =
  | { readonly kind: 'local' }
  | { readonly kind: 'remote'; readonly name: string; readonly server: string; readonly token: string }
  | { readonly kind: 'refused'; readonly name: string };

/** The name a command asks for: `NEMIA_CONTEXT` where it is set and not blank, else the file's own. */
const named = (config: ClientConfig, asked: string | undefined): string | undefined =>
  asked !== undefined && asked.trim() !== '' ? asked.trim() : config.current;

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
      condition: ({ input: [config, asked], output }) =>
        asked === undefined ||
        asked.trim() === '' ||
        asked.trim() === LOCAL_CONTEXT ||
        (output.kind !== 'local' && output.name === asked.trim()),
    },
    aHeldContextIsAsked: {
      description: 'A context the file holds is asked at its own address with its own token',
      condition: ({ input: [config, asked], output }) => {
        const name = named(config, asked);
        if (name === undefined || name === LOCAL_CONTEXT) return true;
        const context = held(config, name);
        return (
          context === undefined ||
          (output.kind === 'remote' && output.server === context.server && output.token === context.token)
        );
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

/**
 * Which definition of a name a namespace serves (agent-orchestrator, src/definition/served.ts, `definitionServed`): the Workflow, Agent
 * or Skill a factory resolves for one name, from the origins that hold that name, in the order the factory looks a name up (`held`: the
 * factory's own tree, `factory`, then the repository's, then yours, then Nemia's builtin). With no origin asked, the name is served as
 * the first origin that holds it, and every other one of that name is shadowed by it. With `?origin=` asked, that origin's definition is
 * served where it holds the name, a shadowed one too, saying the origin that shadows it, so a client can read what the factory does not
 * use; nothing where it does not. A list is this, name by name, in the order the names were found.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * Where a definition is read from, as `objects` names it (`DEFINITION_ORIGINS`): a factory's own tree (`factory`, the folder a factory
 * made from a template keeps in the store), the repository's checkout, your library, or what Nemia builds in.
 */
export type DefinitionOrigin = 'factory' | 'repo' | 'yours' | 'builtin';

/** A definition served: its origin, and the origin that shadows it in the namespace, null where none does. */
export type DefinitionServed = { readonly origin: DefinitionOrigin; readonly shadowedBy: DefinitionOrigin | null };

/** Whether no origin is held twice, as a lookup reads each root once. */
const distinct = (held: readonly DefinitionOrigin[]): boolean => held.every((o, i) => !held.slice(0, i).includes(o));

const definitionServedSpec = spec<(held: readonly DefinitionOrigin[], asked: DefinitionOrigin | undefined) => DefinitionServed | null>({
  requires: ({ input: [held] }) => distinct(held),
  ensures: {
    servedWasHeld: {
      description: 'A namespace serves a definition only from an origin that holds the name',
      condition: ({ input: [held], output }) => output === null || held.includes(output.origin),
    },
    firstOriginWins: {
      description: 'With no origin asked, a name held anywhere is served from the first origin that holds it, shadowed by none',
      condition: ({ input: [held, asked], output }) =>
        asked !== undefined || (held.length === 0 ? output === null : output?.origin === held.at(0) && output?.shadowedBy === null),
    },
    originAskedAlone: {
      description: 'With an origin asked, the name is served from that origin exactly when it holds it',
      condition: ({ input: [held, asked], output }) =>
        asked === undefined || (held.includes(asked) ? output?.origin === asked : output === null),
    },
    shadowedByTheFirst: {
      description: 'A definition is shadowed exactly when another origin holds its name first, and by that origin',
      condition: ({ input: [held], output }) =>
        output === null || output.shadowedBy === (held.at(0) === output.origin ? null : (held.at(0) ?? null)),
    },
  },
});

/** `definitionServed`'s type, which `src/definition/served.ts` takes. */
export type DefinitionServedOf = Implementation<typeof definitionServedSpec>;

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

/** A definition found where a namespace looks: its name, and the origin that holds it. */
export type DefinitionFound = { readonly name: string; readonly origin: DefinitionOrigin };

/** A definition a namespace's list serves: its name, its origin, and the origin that shadows it, null where none does. */
export type DefinitionListed = DefinitionServed & { readonly name: string };

/** Whether `origin` holds a definition named `name` among `found`. */
const holds = (found: readonly DefinitionFound[], name: string, origin: DefinitionOrigin): boolean =>
  found.some((f) => f.name === name && f.origin === origin);

/** The first origin, in the order a factory looks a name up, that holds `name` among `found`; undefined where none does. */
const firstHolder = (found: readonly DefinitionFound[], name: string): DefinitionOrigin | undefined =>
  holds(found, name, 'factory')
    ? 'factory'
    : holds(found, name, 'repo')
      ? 'repo'
      : holds(found, name, 'yours')
        ? 'yours'
        : holds(found, name, 'builtin')
          ? 'builtin'
          : undefined;

/** The order a factory looks a name up in. */
const LOOKUP: readonly DefinitionOrigin[] = ['factory', 'repo', 'yours', 'builtin'];

const heldOriginsSpec = spec<(found: readonly DefinitionFound[], name: string) => DefinitionOrigin[]>({
  ensures: {
    heldExactly: {
      description: 'The origins that hold the name among what was found, and no other',
      condition: ({ input: [found, name], output }) => LOOKUP.every((o) => output.includes(o) === holds(found, name, o)),
    },
    eachOnce: {
      description: 'Each origin once, as a lookup reads each root once',
      condition: ({ output }) => output.every((o, i) => !output.slice(0, i).includes(o)),
    },
    firstInTheLookup: {
      description: 'The first is the first in the lookup order that holds the name',
      condition: ({ input: [found, name], output }) => output.at(0) === firstHolder(found, name),
    },
  },
});

/** `heldOrigins`'s type, which `src/definition/served.ts` takes: what `definitionServed` is handed for one name of a list. */
export type HeldOriginsOf = Implementation<typeof heldOriginsSpec>;

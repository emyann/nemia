/**
 * Which definitions a namespace serves (agent-orchestrator, src/definition/served.ts, `definitionsServed`): the Workflows, Agents or
 * Skills a factory resolves, each found by its name and its origin, in the order the factory looks a name up (`found`: the repository's,
 * a factory's tree read as the repository's, then yours, then Nemia's builtin). With no origin asked, a name is served once, as the first
 * origin that holds it, and every other one of that name is shadowed by it. With `?origin=` asked, the definitions of that origin alone
 * are served, a shadowed one among them, each saying the origin that shadows it, so a client can read what the factory does not use.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** Where a definition is read from, as `objects` names it (`DEFINITION_ORIGINS`). */
export type DefinitionOrigin = 'repo' | 'yours' | 'builtin';

/** A definition found: its name, and the origin it was found in. */
export type DefinitionFound = { readonly name: string; readonly origin: DefinitionOrigin };

/** A definition served: its name, its origin, and the origin that shadows it in the namespace, null where none does. */
export type DefinitionServed = { readonly name: string; readonly origin: DefinitionOrigin; readonly shadowedBy: DefinitionOrigin | null };

/** The origin of the first of `found` named `name`, or undefined where none is. */
const firstOf = (found: readonly DefinitionFound[], name: string): DefinitionOrigin | undefined =>
  found.find((f) => f.name === name)?.origin;

/** How many of `served` are named `name` and come from `origin`, any origin where none is given. */
const countOf = (served: readonly DefinitionServed[], name: string, origin?: DefinitionOrigin): number =>
  served.filter((s) => s.name === name && (origin === undefined || s.origin === origin)).length;

const definitionsServedSpec = spec<(found: readonly DefinitionFound[], origin: DefinitionOrigin | undefined) => DefinitionServed[]>({
  ensures: {
    servedWereFound: {
      description: 'A namespace serves only a definition it found, from the origin it found it in',
      condition: ({ input: [found], output }) => output.every((s) => found.some((f) => f.name === s.name && f.origin === s.origin)),
    },
    firstOriginWins: {
      description: 'With no origin asked, each name found is served once, from the first origin that holds it',
      condition: ({ input: [found, origin], output }) =>
        origin !== undefined || found.every((f) => countOf(output, f.name) === 1 && countOf(output, f.name, firstOf(found, f.name)) === 1),
    },
    originAskedAlone: {
      description: 'With an origin asked, each name that origin holds is served once, and nothing of another origin',
      condition: ({ input: [found, origin], output }) =>
        origin === undefined ||
        (output.every((s) => s.origin === origin) &&
          found.filter((f) => f.origin === origin).every((f) => countOf(output, f.name) === 1)),
    },
    shadowedByTheFirst: {
      description: 'A definition is shadowed exactly when another origin holds its name first, and by that origin',
      condition: ({ input: [found], output }) =>
        output.every((s) => s.shadowedBy === (firstOf(found, s.name) === s.origin ? null : (firstOf(found, s.name) ?? null))),
    },
  },
});

/** `definitionsServed`'s type, which `src/definition/served.ts` takes. */
export type DefinitionsServed = Implementation<typeof definitionsServedSpec>;

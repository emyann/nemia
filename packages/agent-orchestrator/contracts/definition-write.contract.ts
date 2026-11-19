/**
 * Whether a write of a Workflow, an Agent or a Skill on the generic path goes on (agent-orchestrator, src/definition/served.ts,
 * `definitionWriteRefusal`): where it is sent — the store's library (`/api/skills`, `/api/agents`, `/api/workflows`, in no namespace) or a
 * factory's namespace, `default` among them —, what it does, the origin of the definition it addresses there (`none` where nothing is at
 * the name), and the factories that use it (`users`, each that has added it or fills a step with it). The api writes the person's library
 * alone, at the library's level alone, never a checkout nor what Nemia builds in: a builtin is never changed in place, and a replace of
 * one is written as the person's copy that shadows it. A library definition a factory uses is never removed: the refusal names each.
 * A factory's own definitions — its tree, origin `factory` — change the factory's way, never through this path: a proposal, `nemia
 * propose -f <file> -n <factory>`, which the person approves, or an agent within its delegation at auto; and a library definition is
 * written at the library, never in a namespace. So a refusal in a namespace says which way the definition changes (`way`): the library's,
 * or the factory's. Its kind is the api's answer (its `refusedAs`); its words are nobody's law. A version's judgement stays
 * `definitionVersionRefusal`'s and `workflowVersionRefusal`'s, after this one lets a write through.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { DefinitionOrigin, WriteWay as ObjectsWriteWay } from 'objects';

/** Where a definition is read from: `objects`' `DEFINITION_ORIGINS`. */
export type Origin = DefinitionOrigin;

/** Where the addressed definition is read from, or `none` where nothing is at its name. */
export type WriteThere = Origin | 'none';

/** Where a write is sent: the store's library, in no namespace, or a factory's namespace (`default` among them). */
export type WriteAt = 'library' | 'factory';

/** What a write does: makes a definition, replaces one, removes one, or runs one of its named actions (`try`, `copy`). */
export type DefinitionWrite = 'create' | 'replace' | 'remove' | 'act';

/** The way a refused definition changes instead: at the store's library, or the factory's own way (`objects`' `WRITE_WAYS`). */
export type WriteWay = ObjectsWriteWay;

/**
 * A refusal: its kind, as the package's refusals are told apart, the way the definition changes instead, the factories that hold it
 * (`users`, a `Conflict`'s, which the api serves on its error) and its words.
 */
export type WriteRefused = {
  readonly kind: 'Invalid' | 'Missing' | 'Conflict';
  readonly way?: WriteWay;
  readonly users?: readonly string[];
  readonly message: string;
};

/** Whether `a` and `b` name the same factories, in the same order. */
const sameNames = (a: readonly string[] | undefined, b: readonly string[]) =>
  a !== undefined && a.length === b.length && a.every((name, i) => name === b[i]);

const definitionWriteRefusalSpec = spec<
  (at: WriteAt, does: DefinitionWrite, there: WriteThere, users: readonly string[]) => WriteRefused | null
>({
  /** The library holds the person's definitions and Nemia's builtins alone: no factory's tree, no repository. */
  requires: ({ input: [at, , there] }) => at === 'factory' || there === 'user' || there === 'builtin' || there === 'none',
  ensures: {
    factoryDefinitionsTheFactorysWay: {
      description: "A replace, a removal or an action on a factory's own definition is Invalid, naming the factory's way",
      condition: ({ input: [at, does, there], output }) =>
        !(at === 'factory' && does !== 'create' && there === 'factory') || (output?.kind === 'Invalid' && output.way === 'factory'),
    },
    createInAFactoryTheFactorysWay: {
      description: "A definition made in a factory's namespace is Invalid, naming the factory's way: a factory's definitions are its own",
      condition: ({ input: [at, does], output }) =>
        !(at === 'factory' && does === 'create') || (output?.kind === 'Invalid' && output.way === 'factory'),
    },
    libraryDefinitionsAtTheLibrary: {
      description: 'A replace, a removal or an action in a namespace on anything but its own definition is Invalid, naming the library',
      condition: ({ input: [at, does, there], output }) =>
        !(at === 'factory' && does !== 'create' && there !== 'factory') || (output?.kind === 'Invalid' && output.way === 'library'),
    },
    createAtTheLibraryGoes: {
      description: "A definition made at the library goes on, to the person's, whatever builtin holds its name",
      condition: ({ input: [at, does], output }) => !(at === 'library' && does === 'create') || output === null,
    },
    userReplaceAndActGo: {
      description: "A replace or an action on the person's definition at the library goes on",
      condition: ({ input: [at, does, there], output }) =>
        !(at === 'library' && (does === 'replace' || does === 'act') && there === 'user') || output === null,
    },
    unusedUserRemovalGoes: {
      description: "A removal of the person's definition no factory uses goes on",
      condition: ({ input: [at, does, there, users], output }) =>
        !(at === 'library' && does === 'remove' && there === 'user' && users.length === 0) || output === null,
    },
    inUseIsConflictNamingEach: {
      description: "A removal of the person's definition a factory uses is a Conflict naming every factory that uses it",
      condition: ({ input: [at, does, there, users], output }) =>
        !(at === 'library' && does === 'remove' && there === 'user' && users.length > 0) ||
        (output?.kind === 'Conflict' && sameNames(output.users, users)),
    },
    builtinReplaceIsACopy: {
      description: "A replace of a builtin at the library goes on: it is written as the person's copy, which shadows the builtin",
      condition: ({ input: [at, does, there], output }) =>
        !(at === 'library' && does === 'replace' && there === 'builtin') || output === null,
    },
    builtinNeverRemoved: {
      description: 'A removal of a builtin is Invalid: a builtin is never removed from the library',
      condition: ({ input: [at, does, there], output }) =>
        !(at === 'library' && does === 'remove' && there === 'builtin') || output?.kind === 'Invalid',
    },
    actionOnABuiltinGoes: {
      description:
        "An action on a builtin goes on, judged by the action itself: a copy makes the person's, and a try says why it cannot run",
      condition: ({ input: [at, does, there], output }) => !(at === 'library' && does === 'act' && there === 'builtin') || output === null,
    },
    noneIsMissing: {
      description: 'A replace, a removal or an action at the library where nothing is at the name is Missing',
      condition: ({ input: [at, does, there], output }) =>
        !(at === 'library' && does !== 'create' && there === 'none') || output?.kind === 'Missing',
    },
    usersOnAConflictAlone: {
      description: 'A refusal names the factories that use the definition only where it is a Conflict',
      condition: ({ output }) => output === null || output.kind === 'Conflict' || output.users === undefined,
    },
    noOtherWayAtTheLibrary: {
      description: 'A refusal at the library names no other way: the fix is at the library itself',
      condition: ({ input: [at], output }) => !(at === 'library' && output !== null) || output.way === undefined,
    },
  },
});

/** `definitionWriteRefusal`'s type, which `src/definition/served.ts` takes. */
export type DefinitionWriteRefusal = Implementation<typeof definitionWriteRefusalSpec>;

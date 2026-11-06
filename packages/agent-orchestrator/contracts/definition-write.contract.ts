/**
 * Whether a write of a Workflow, an Agent or a Skill on the generic path goes on (agent-orchestrator, src/definition/served.ts,
 * `definitionWriteRefusal`): the namespace it is sent to, what it does, and the origin of the definition it addresses there (`none` where
 * nothing is at the name). The api writes your library alone, never a checkout nor what Nemia builds in. Every definition of yours is
 * served in `default`, and a write there is a write of every namespace that resolves it, so a write of yours is taken in `default` alone.
 * A factory's own definitions — its tree, origin `factory` — change the factory's way, never through this path: a proposal, `nemia
 * propose -f <file> -n <factory>`, which the person approves, or an agent within its delegation at auto. So a refusal says which way
 * the definition changes (`way`): through `default`, or the factory's. Its kind is the api's answer (`REFUSAL_STATUS`); its words are
 * nobody's law. A version's judgement stays `definitionVersionRefusal`'s and `workflowVersionRefusal`'s, after this one lets a write
 * through.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** Where the addressed definition is read from, or `none` where nothing is at its name. */
export type WriteThere = 'factory' | 'repo' | 'yours' | 'builtin' | 'none';

/** What a write does: makes a definition, replaces one, removes one, or runs one of its named actions (`try`, `copy`). */
export type DefinitionWrite = 'create' | 'replace' | 'remove' | 'act';

/** The way a refused definition changes instead: through the `default` namespace, or the factory's own way. */
export type WriteWay = 'default' | 'factory';

/** A refusal: its kind, as the package's refusals are told apart, the way the definition changes instead, and its words. */
export type WriteRefused = { readonly kind: 'Invalid' | 'Missing'; readonly way?: WriteWay; readonly message: string };

const definitionWriteRefusalSpec = spec<(namespace: string, does: DefinitionWrite, there: WriteThere) => WriteRefused | null>({
  ensures: {
    factoryDefinitionsTheFactorysWay: {
      description: "A replace, a removal or an action on a factory's own definition is Invalid, naming the factory's way, in any namespace",
      condition: ({ input: [, does, there], output }) =>
        !(does !== 'create' && there === 'factory') || (output?.kind === 'Invalid' && output.way === 'factory'),
    },
    createOutsideDefaultTheFactorysWay: {
      description: "A definition made in a factory's namespace is Invalid, naming the factory's way: a factory's definitions are its own",
      condition: ({ input: [namespace, does], output }) =>
        !(namespace !== 'default' && does === 'create') || (output?.kind === 'Invalid' && output.way === 'factory'),
    },
    yoursInDefaultAlone: {
      description: 'A replace, a removal or an action on any other definition, sent outside default, is Invalid, naming default',
      condition: ({ input: [namespace, does, there], output }) =>
        !(namespace !== 'default' && does !== 'create' && there !== 'factory') || (output?.kind === 'Invalid' && output.way === 'default'),
    },
    createInDefaultGoes: {
      description: 'A definition made in default goes on, to your library, whatever another origin holds at its name',
      condition: ({ input: [namespace, does], output }) => !(namespace === 'default' && does === 'create') || output === null,
    },
    yoursGoes: {
      description: 'A replace, a removal or an action on a definition of yours in default goes on',
      condition: ({ input: [namespace, does, there], output }) =>
        !(namespace === 'default' && does !== 'create' && there === 'yours') || output === null,
    },
    noneIsMissing: {
      description: 'A replace, a removal or an action in default where nothing is at the name is Missing',
      condition: ({ input: [namespace, does, there], output }) =>
        !(namespace === 'default' && does !== 'create' && there === 'none') || output?.kind === 'Missing',
    },
    notYoursIsInvalid: {
      description:
        "A replace or a removal in default of the repository's or a builtin definition is Invalid: the api writes your library alone",
      condition: ({ input: [namespace, does, there], output }) =>
        !(namespace === 'default' && (does === 'replace' || does === 'remove') && (there === 'repo' || there === 'builtin')) ||
        output?.kind === 'Invalid',
    },
    noOtherWayInDefault: {
      description: 'A refusal in default of anything but a factory’s own definition names no other way: the fix is in default itself',
      condition: ({ input: [namespace, , there], output }) =>
        !(namespace === 'default' && there !== 'factory' && output !== null) || output.way === undefined,
    },
    actionOnWhatItFinds: {
      description:
        "An action in default on the repository's or a builtin definition goes on, judged by the action itself: a builtin skill is copied to yours, and a try says why it cannot run",
      condition: ({ input: [namespace, does, there], output }) =>
        !(namespace === 'default' && does === 'act' && (there === 'repo' || there === 'builtin')) || output === null,
    },
  },
});

/** `definitionWriteRefusal`'s type, which `src/definition/served.ts` takes. */
export type DefinitionWriteRefusal = Implementation<typeof definitionWriteRefusalSpec>;
